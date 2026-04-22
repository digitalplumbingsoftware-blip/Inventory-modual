const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// ── Schema migration (idempotent) ─────────────────────────────
async function ensureJobsSchema() {
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS restock_needed BOOLEAN DEFAULT false`);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_job ON inventory_movements(job_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_locations_technician ON inventory_locations(technician_id)`);
}
ensureJobsSchema().catch(e => console.error("jobs schema init:", e.message));

// ── Photo upload storage ──────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, "../../../uploads/photos");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (["image/jpeg", "image/png"].includes(file.mimetype)) cb(null, true);
    else cb(new Error("Only JPEG and PNG allowed"));
  },
});

// ── SMS helpers ───────────────────────────────────────────────────────────────
const SMS_TRIGGERS = {
  en_route: (name) => `Hi ${name}, your technician is on the way! Reply STOP to opt out.`,
  in_progress: (name) => `Hi ${name}, your technician has arrived and started work. Reply STOP to opt out.`,
  complete: (name) => `Hi ${name}, your service is complete. Thank you for choosing us! Reply STOP to opt out.`,
};

async function sendJobSms(jobId, newStatus) {
  if (!SMS_TRIGGERS[newStatus]) return;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return;

  try {
    const { rows } = await query(`
      SELECT c.first_name, c.phones, c.sms_opt_out
      FROM jobs j
      JOIN customers c ON c.id = j.customer_id
      WHERE j.id = $1
    `, [jobId]);

    const customer = rows[0];
    if (!customer || customer.sms_opt_out) return;

    const phones = Array.isArray(customer.phones) ? customer.phones : [];
    const primary = phones.find((p) => p.primary) || phones[0];
    if (!primary?.number) return;

    const twilio = require("twilio")(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    const body = SMS_TRIGGERS[newStatus](customer.first_name || "there");
    await twilio.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: primary.number,
    });
  } catch (smsErr) {
    console.error("SMS send failed (non-fatal):", smsErr.message);
  }
}

const JOB_SELECT = `
  SELECT
    j.*,
    c.first_name || ' ' || c.last_name as customer_name,
    c.phone as customer_phone,
    a.street || ', ' || a.city as address,
    a.lat, a.lng,
    u.first_name || ' ' || u.last_name as technician_name,
    u.color as technician_color,
    u.initials as technician_initials
  FROM jobs j
  LEFT JOIN customers c ON c.id = j.customer_id
  LEFT JOIN addresses a ON a.id = j.address_id
  LEFT JOIN users u ON u.id = j.technician_id
`;

// GET /api/jobs  (with optional ?date=YYYY-MM-DD, ?tech=uuid, ?status=)
router.get("/", authenticate, async (req, res) => {
  try {
    const { date, tech, status } = req.query;
    const conditions = [];
    const params = [];

    if (date) {
      params.push(date);
      conditions.push(`DATE(j.scheduled_start) = $${params.length}`);
    }
    if (tech) {
      params.push(tech);
      conditions.push(`j.technician_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`j.status = $${params.length}`);
    }

    const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
    const { rows } = await query(`${JOB_SELECT} ${where} ORDER BY j.scheduled_start`, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id
router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await query(`${JOB_SELECT} WHERE j.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Job not found" });
  res.json(rows[0]);
});

// POST /api/jobs
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      customer_id, address_id, technician_id, status = "unassigned",
      job_type, description, scheduled_start, scheduled_end,
      tags = [], source, notes, arrival_window
    } = req.body;

    const { rows } = await query(`
      INSERT INTO jobs
        (customer_id, address_id, technician_id, status, job_type, description,
         scheduled_start, scheduled_end, tags, source, notes, arrival_window, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *
    `, [customer_id, address_id, technician_id, status, job_type, description,
        scheduled_start, scheduled_end, tags, source, notes, arrival_window || null, req.user.id]);

    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Restock check (fire-and-forget) ──────────────────────────────────────────
async function checkRestockNeeded(jobId, technicianId) {
  if (!technicianId) return;
  try {
    const { rows: lowItems } = await query(`
      SELECT i.name
      FROM inventory_stock s
      JOIN inventory_items i ON i.id = s.item_id
      JOIN inventory_locations l ON l.id = s.location_id
      WHERE l.technician_id = $1 AND s.qty <= i.min_qty AND i.active = true
    `, [technicianId]);

    if (lowItems.length > 0) {
      await query("UPDATE jobs SET restock_needed = true WHERE id = $1", [jobId]);
    }
  } catch (err) {
    console.error("Restock check failed (non-fatal):", err.message);
  }
}

// PATCH /api/jobs/:id
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const allowed = ["status","technician_id","scheduled_start","scheduled_end",
                     "job_type","description","notes","tags","actual_start","actual_end",
                     "travel_start","arrival_window","restock_needed"];
    const updates = [];
    const params = [];

    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) {
        params.push(v);
        updates.push(`${k} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });

    // Capture previous status for SMS dedup before writing
    let prevStatus = null;
    if (req.body.status) {
      const { rows: prev } = await query("SELECT status FROM jobs WHERE id = $1", [req.params.id]);
      prevStatus = prev[0]?.status;
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE jobs SET ${updates.join(",")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);

    // Fire-and-forget SMS — never block the response
    const newStatus = req.body.status;
    if (newStatus && newStatus !== prevStatus) {
      sendJobSms(req.params.id, newStatus);
    }

    // Fire-and-forget restock check when job completes
    if (newStatus === 'completed' && rows[0]?.technician_id) {
      checkRestockNeeded(req.params.id, rows[0].technician_id);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id/material-cost
router.get("/:id/material-cost", authenticate, async (req, res) => {
  try {
    const { rows: lineItems } = await query(`
      SELECT
        i.name,
        i.sku,
        COALESCE(i.cost, 0) as unit_cost,
        ABS(m.qty) as qty,
        ABS(m.qty) * COALESCE(i.cost, 0) as line_total
      FROM inventory_movements m
      JOIN inventory_items i ON i.id = m.item_id
      WHERE m.job_id = $1 AND m.type = 'use'
      ORDER BY m.created_at
    `, [req.params.id]);

    const totalMaterialCost = lineItems.reduce((sum, r) => sum + parseFloat(r.line_total || 0), 0);

    const { rows: invoiceRows } = await query(`
      SELECT COALESCE(SUM(subtotal + tax_amount), 0) as revenue
      FROM invoices
      WHERE job_id = $1 AND status NOT IN ('void','draft')
    `, [req.params.id]);

    const revenue = parseFloat(invoiceRows[0]?.revenue || 0);
    const grossMarginPct = revenue > 0
      ? Math.round(((revenue - totalMaterialCost) / revenue) * 1000) / 10
      : null;

    res.json({
      line_items: lineItems,
      total_material_cost: totalMaterialCost,
      total_labor_cost: null,
      revenue,
      gross_margin_pct: grossMarginPct,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/photos
router.post("/:id/photos", authenticate, (req, res) => {
  upload.single("photo")(req, res, async (err) => {
    if (err) {
      if (err.code === "ENOSPC") {
        return res.status(507).json({ error: "Server storage full" });
      }
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    try {
      const { rows } = await query(`
        INSERT INTO job_photos (job_id, uploaded_by, file_path, original_name, mime_type, size_bytes)
        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
      `, [
        req.params.id,
        req.user.id,
        req.file.filename,
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
      ]);
      res.status(201).json(rows[0]);
    } catch (dbErr) {
      res.status(500).json({ error: dbErr.message });
    }
  });
});

// GET /api/jobs/:id/photos
router.get("/:id/photos", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM job_photos WHERE job_id = $1 ORDER BY created_at DESC",
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id  (soft: set cancelled)
router.delete("/:id", authenticate, async (req, res) => {
  await query("UPDATE jobs SET status = 'cancelled' WHERE id = $1", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;

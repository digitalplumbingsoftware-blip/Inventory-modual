const router = require("express").Router();
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");
const { broadcast } = require("../websocket/gps");

// ── Schema migration (idempotent) ─────────────────────────────
async function ensureJobsSchema() {
  // Add ready_to_call to the job_status enum if it isn't already there
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ready_to_call'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'job_status')
      ) THEN
        ALTER TYPE job_status ADD VALUE 'ready_to_call';
      END IF;
    END$$;
  `);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS restock_needed BOOLEAN DEFAULT false`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS estimate_approved BOOLEAN DEFAULT false`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS return_trip_needed BOOLEAN DEFAULT false`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS en_route_at TIMESTAMPTZ`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS on_site_at TIMESTAMPTZ`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS project_id UUID`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS parent_job_id UUID`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS visit_number INT DEFAULT 1`);
  await query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS dispatch_alert TEXT`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS fulfillment_type TEXT DEFAULT 'pickup'`);
  await query(`ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS date_needed DATE`);
  await query(`CREATE INDEX IF NOT EXISTS idx_jobs_project ON jobs(project_id) WHERE project_id IS NOT NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode ON inventory_items(barcode)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_movements_job ON inventory_movements(job_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_inventory_locations_technician ON inventory_locations(technician_id)`);
  await query(`
    CREATE TABLE IF NOT EXISTS job_photos (
      id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      job_id       UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      uploaded_by  UUID REFERENCES users(id),
      file_path    TEXT NOT NULL,
      original_name TEXT,
      mime_type    TEXT,
      size_bytes   BIGINT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id)`);
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
    CASE
      WHEN a.street IS NOT NULL AND TRIM(a.street) != ''
        THEN TRIM(a.street) || CASE WHEN a.city IS NOT NULL AND TRIM(a.city) != '' THEN ', ' || TRIM(a.city) ELSE '' END
      WHEN ca.street IS NOT NULL AND TRIM(ca.street) != ''
        THEN TRIM(ca.street) || CASE WHEN ca.city IS NOT NULL AND TRIM(ca.city) != '' THEN ', ' || TRIM(ca.city) ELSE '' END
      ELSE NULL
    END as address,
    COALESCE(a.lat, ca.lat) as lat,
    COALESCE(a.lng, ca.lng) as lng,
    u.first_name || ' ' || u.last_name as technician_name,
    u.color as technician_color,
    u.initials as technician_initials,
    -- Display number: Job-YYYY-JobNum (year from created_at, pad from company invoice_defaults)
    ('Job-' || EXTRACT(YEAR FROM COALESCE(j.created_at, NOW()))::int::text || '-'
      || LPAD(j.job_number::text,
              GREATEST(COALESCE((SELECT (invoice_defaults->>'number_pad')::int FROM company_settings WHERE id='main'), 4), 1),
              '0')
    ) AS display_number
  FROM jobs j
  LEFT JOIN customers c ON c.id = j.customer_id
  LEFT JOIN addresses a ON a.id = j.address_id
  LEFT JOIN addresses ca ON ca.customer_id = j.customer_id AND ca.is_primary = true
  LEFT JOIN users u ON u.id = j.technician_id
`;

// GET /api/jobs  (with optional ?date=YYYY-MM-DD, ?tech=uuid, ?customer_id=uuid, ?status=, ?dispatch_alert=active)
router.get("/", authenticate, async (req, res) => {
  try {
    const { date, from, to, tech, customer_id, status, dispatch_alert } = req.query;
    const conditions = [];
    const params = [];

    if (date) {
      params.push(date);
      // Return jobs scheduled for this date OR unassigned jobs from this date or earlier
      // (unassigned jobs persist on the board until assigned — they don't vanish when the day rolls over)
      conditions.push(`(
        DATE(j.scheduled_start) = $${params.length}
        OR (
          j.status = 'unassigned'
          AND (j.scheduled_start IS NULL OR DATE(j.scheduled_start) <= $${params.length})
        )
      )`);
    } else if (from || to) {
      // Range mode — inclusive on both ends. Falls back to open-ended if only one bound is set.
      if (from) { params.push(from); conditions.push(`DATE(j.scheduled_start) >= $${params.length}`); }
      if (to)   { params.push(to);   conditions.push(`DATE(j.scheduled_start) <= $${params.length}`); }
    }
    if (tech) {
      params.push(tech);
      conditions.push(`j.technician_id = $${params.length}`);
    }
    if (customer_id) {
      params.push(customer_id);
      conditions.push(`j.customer_id = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`j.status = $${params.length}`);
    }
    if (dispatch_alert === 'active') {
      conditions.push(`j.dispatch_alert IS NOT NULL`);
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
      tags = [], source, notes, arrival_window, service, invoice_due_date
    } = req.body;

    const { rows } = await query(`
      INSERT INTO jobs
        (customer_id, address_id, technician_id, status, job_type, description,
         scheduled_start, scheduled_end, tags, source, notes, arrival_window, service, invoice_due_date, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *
    `, [customer_id, address_id, technician_id, status, job_type, description,
        scheduled_start, scheduled_end, tags, source, notes, arrival_window || null, service || null, invoice_due_date || null, req.user.id]);

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
                     "travel_start","arrival_window","restock_needed","estimate_approved",
                     "return_trip_needed","dispatch_alert"];
    const updates = [];
    const params = [];

    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) {
        params.push(v);
        updates.push(`${k} = $${params.length}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });

    // Capture previous status for SMS dedup and WebSocket broadcast
    let prevStatus = null;
    if (req.body.status) {
      const { rows: prev } = await query("SELECT status FROM jobs WHERE id = $1", [req.params.id]);
      prevStatus = prev[0]?.status;
    }

    // Auto-stamp status transition timestamps (server-side, no client needed)
    const newStatus = req.body.status;
    if (newStatus && newStatus !== prevStatus) {
      if (newStatus === 'en_route')  updates.push(`en_route_at = NOW()`);
      if (newStatus === 'on_site')   updates.push(`on_site_at = NOW()`);
      if (newStatus === 'completed') updates.push(`completed_at = NOW()`);
    }

    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE jobs SET ${updates.join(",")} WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);

    // Broadcast job status change over WebSocket so the dashboard updates instantly
    if (newStatus && newStatus !== prevStatus && rows[0]) {
      broadcast({
        type: 'job_status',
        job_id: rows[0].id,
        status: newStatus,
        technician_id: rows[0].technician_id,
        prev_status: prevStatus,
      });
    }

    // Broadcast dispatch alert set/clear in real time
    if ('dispatch_alert' in req.body && rows[0]) {
      // Fetch technician name for nav bar display
      let technician_name = null;
      if (rows[0].technician_id) {
        try {
          const tn = await query(
            `SELECT first_name || ' ' || last_name AS name FROM users WHERE id = $1`,
            [rows[0].technician_id]
          );
          technician_name = tn.rows[0]?.name || null;
        } catch(e) { /* non-fatal */ }
      }
      broadcast({
        type: 'dispatch_alert',
        job_id: rows[0].id,
        dispatch_alert: rows[0].dispatch_alert || null,
        technician_name,
        project_id: rows[0].project_id || null,
        parent_job_id: rows[0].parent_job_id || null,
        ts: new Date().toISOString(),
      });
    }

    // Fire-and-forget SMS — never block the response
    if (newStatus && newStatus !== prevStatus) {
      sendJobSms(req.params.id, newStatus);
    }

    // Fire-and-forget restock check when job completes
    if (newStatus === 'completed' && rows[0]?.technician_id) {
      checkRestockNeeded(req.params.id, rows[0].technician_id);
    }

    // Auto clock-in: first en_route punch of the day clocks the tech in
    if (newStatus === 'en_route' && prevStatus !== 'en_route' && rows[0]?.technician_id) {
      (async () => {
        try {
          const open = await query(
            `SELECT id FROM time_punches WHERE user_id=$1 AND punch_out IS NULL LIMIT 1`,
            [rows[0].technician_id]
          );
          if (!open.rows.length) {
            await query(
              `INSERT INTO time_punches(user_id, punch_in, notes, created_by)
               VALUES($1, NOW(), 'Auto clock-in: en route', $1)`,
              [rows[0].technician_id]
            );
          }
        } catch(e) { /* non-fatal */ }
      })();
    }

    // Auto clock-out: when tech completes their last active job
    if (newStatus === 'completed' && prevStatus !== 'completed' && rows[0]?.technician_id) {
      (async () => {
        try {
          const remaining = await query(
            `SELECT COUNT(*) AS cnt FROM jobs
             WHERE technician_id=$1
               AND status NOT IN ('completed','cancelled')
               AND id != $2`,
            [rows[0].technician_id, rows[0].id]
          );
          if (parseInt(remaining.rows[0].cnt) === 0) {
            await query(
              `UPDATE time_punches
               SET punch_out=NOW(),
                   notes=COALESCE(NULLIF(notes,''), 'Auto clock-out: last job completed'),
                   updated_at=NOW()
               WHERE user_id=$1 AND punch_out IS NULL`,
              [rows[0].technician_id]
            );
          }
        } catch(e) { /* non-fatal */ }
      })();
    }

    // Auto-create a review request when a job completes.
    // Customer-facing CSAT form lives at /feedback/<token>; high ratings redirect to Google.
    if (newStatus === 'completed' && rows[0]) {
      (async () => {
        try {
          // Skip if a request for this job already exists
          const existing = await query(
            `SELECT id FROM review_requests WHERE job_id = $1 LIMIT 1`,
            [rows[0].id]
          );
          if (existing.rows[0]) return;
          // Honor the auto-send setting if configured (default: enabled)
          const cfg = await query(`SELECT config FROM integrations WHERE name='review_settings'`);
          const conf = cfg.rows[0]?.config || {};
          if (conf.auto_send === false) return;

          const token = require('crypto').randomBytes(9).toString('base64url');
          await query(`
            INSERT INTO review_requests (job_id, customer_id, technician_id, token, status)
            VALUES ($1, $2, $3, $4, 'pending')
          `, [rows[0].id, rows[0].customer_id, rows[0].technician_id, token]);
        } catch (e) {
          console.warn('[jobs] review request creation failed (non-fatal):', e.message);
        }
      })();
    }

    // Project completion: when all jobs in a project are done, clear return_trip_needed
    if (newStatus === 'completed' && rows[0]?.project_id) {
      (async () => {
        try {
          const { rows: siblings } = await query(
            `SELECT id, status FROM jobs WHERE project_id = $1`,
            [rows[0].project_id]
          );
          // The current job's DB row may still show old status; treat this job as completed
          const allDone = siblings.every(s => s.id === rows[0].id || s.status === 'completed');
          if (allDone) {
            await query(
              `UPDATE jobs SET return_trip_needed = false WHERE project_id = $1`,
              [rows[0].project_id]
            );
          }
        } catch (e) { console.error('Project completion check failed:', e.message); }
      })();
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/return-trip — schedule a follow-up appointment, link via project
router.post("/:id/return-trip", authenticate, async (req, res) => {
  try {
    const { rows: [parent] } = await query(`SELECT * FROM jobs WHERE id = $1`, [req.params.id]);
    if (!parent) return res.status(404).json({ error: "Job not found" });

    // Assign or reuse a project_id (UUID)
    let projectId = parent.project_id;
    if (!projectId) {
      const { rows: [uuid] } = await query(`SELECT uuid_generate_v4() AS id`);
      projectId = uuid.id;
      // Tag the parent job as visit 1 in this project
      await query(
        `UPDATE jobs SET project_id = $1, visit_number = 1 WHERE id = $2`,
        [projectId, parent.id]
      );
    }

    // Determine next visit number
    const { rows: [{ max_visit }] } = await query(
      `SELECT COALESCE(MAX(visit_number), 1) AS max_visit FROM jobs WHERE project_id = $1`,
      [projectId]
    );

    const { scheduled_start, scheduled_end, technician_id, arrival_window, notes } = req.body;

    const { rows: [newJob] } = await query(`
      INSERT INTO jobs
        (customer_id, address_id, job_type, description, notes,
         technician_id, scheduled_start, scheduled_end, arrival_window,
         source, status, project_id, parent_job_id, visit_number, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'return_trip',$10,$11,$12,$13,$14)
      RETURNING *
    `, [
      parent.customer_id,
      parent.address_id,
      parent.job_type,
      parent.description,
      notes || null,
      technician_id || null,
      scheduled_start || null,
      scheduled_end || null,
      arrival_window || null,
      technician_id ? 'scheduled' : 'unassigned',
      projectId,
      parent.id,
      (max_visit || 1) + 1,
      req.user.id,
    ]);

    // Mark the parent job as no longer needing a return trip (it has one now)
    await query(`UPDATE jobs SET return_trip_needed = false WHERE id = $1`, [parent.id]);

    // Transfer any approved/signed estimates from the parent to the new job
    // so the tech on the return trip can see what was approved and do the work.
    await query(
      `UPDATE estimates SET job_id = $1 WHERE job_id = $2 AND status IN ('approved', 'signed')`,
      [newJob.id, parent.id]
    );

    res.status(201).json(newJob);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/:id/material-cost
router.get("/:id/material-cost", authenticate, async (req, res) => {
  try {
    // ── 1. Engine settings → burdened hourly cost ──────────────────────────
    const { rows: [eng] } = await query('SELECT * FROM pb_engine WHERE id=1');
    let costPerHr = 0;
    if (eng) {
      const wage    = +eng.wage    || 0;
      const billHrs = +eng.hrs     || 1600;
      const burdenPct = ((+eng.fica || 0) + (+eng.unemp || 0) + (+eng.wc || 0)) / 100;
      const baseWages  = wage * billHrs;
      const burdenAmt  = baseWages * burdenPct;
      const fixedAnnual = ((+eng.health  || 0) + (+eng.vehicle || 0) + (+eng.fuel    || 0) +
                           (+eng.tools   || 0) + (+eng.uniform || 0) + (+eng.phone   || 0)) * 12;
      const burdened   = billHrs > 0 ? (baseWages + burdenAmt + fixedAnnual) / billHrs : 0;
      const ohMonthly  = (Array.isArray(eng.oh_items) ? eng.oh_items : [])
                           .reduce((s, it) => s + (+it.monthly || 0), 0);
      const ohAnnual   = ohMonthly * 12;
      const numTechs   = +eng.num_techs || 1;
      const ohHrs      = +eng.oh_hrs    || 1600;
      const ohPerHr    = (numTechs > 0 && ohHrs > 0) ? ohAnnual / (numTechs * ohHrs) : 0;
      costPerHr = burdened + ohPerHr;
    }

    // ── 2. Parts pulled from truck inventory ──────────────────────────────
    const { rows: lineItems } = await query(`
      SELECT
        i.name,
        i.sku,
        COALESCE(i.cost, 0)                          AS unit_cost,
        ABS(m.qty)                                   AS qty,
        ABS(m.qty) * COALESCE(i.cost, 0)             AS line_total
      FROM inventory_movements m
      JOIN inventory_items i ON i.id = m.item_id
      WHERE m.job_id = $1 AND m.type = 'usage'
      ORDER BY m.created_at
    `, [req.params.id]);

    const totalInventoryCost = lineItems.reduce((s, r) => s + parseFloat(r.line_total || 0), 0);

    // ── 3. PO line items (split: subcontractor vs material) ──────────────
    const { rows: allPoItems } = await query(`
      SELECT
        COALESCE(po.supply_house, po.vendor)         AS supply_house,
        po.status,
        po.po_type,
        poi.description,
        poi.sku,
        COALESCE(poi.qty, 1)                         AS qty,
        COALESCE(poi.unit_cost, 0)                   AS unit_cost,
        COALESCE(poi.qty, 1) * COALESCE(poi.unit_cost, 0) AS line_total
      FROM purchase_orders po
      JOIN purchase_order_items poi ON poi.po_id = po.id
      WHERE po.job_id = $1
      ORDER BY po.created_at, poi.id
    `, [req.params.id]);

    // Subcontractor POs are a separate cost category — never count toward "Materials"
    const subPoItems  = allPoItems.filter(r => r.po_type === 'subcontractor');
    const matPoItems  = allPoItems.filter(r => r.po_type !== 'subcontractor');
    const poItems     = matPoItems; // back-compat: existing UI section labeled "PO Materials"
    const totalPoCost = matPoItems.reduce((s, r) => s + parseFloat(r.line_total || 0), 0);
    const totalSubCost = subPoItems.reduce((s, r) => s + parseFloat(r.line_total || 0), 0);

    // ── 4. Invoice COGS: labor from engine + actual materials from PO/inventory ──
    // Strategy: labor cost comes from engine (hours × costPerHr per matched task).
    // Materials cost comes from actual tracked spend (PO + inventory movements).
    // Engine mat_cost is only used as a fallback when NEITHER PO nor inventory exist.
    const hasTrackedMaterials = totalInventoryCost > 0 || totalPoCost > 0;

    // Pull invoice items from this job AND related jobs in the same project
    // (parent, siblings) — handles multi-visit projects where the invoice
    // is attached to the parent project job rather than each visit.
    const { rows: invItems } = await query(`
      SELECT ii.id, ii.description, ii.quantity, ii.unit_price, ii.line_total, ii.cost, ii.pricebook_id
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      WHERE inv.status NOT IN ('void','draft')
        AND (
          inv.job_id = $1
          OR inv.job_id = (SELECT parent_job_id FROM jobs WHERE id = $1)
          OR inv.job_id IN (SELECT id FROM jobs WHERE parent_job_id = $1)
          OR inv.job_id IN (
            SELECT id FROM jobs
            WHERE project_id = (SELECT project_id FROM jobs WHERE id = $1)
              AND project_id IS NOT NULL
          )
        )
      ORDER BY ii.sort_order, ii.id
    `, [req.params.id]);

    // Build pb_tasks lookup: name → {hours, mat_cost}
    const { rows: pbTasks } = await query(`
      SELECT t.id, t.name, t.hours,
             COALESCE(SUM(tm.qty * m.cost), 0) AS mat_cost
      FROM pb_tasks t
      LEFT JOIN pb_task_materials tm ON tm.task_id = t.id
      LEFT JOIN pb_materials m ON m.id = tm.material_id
      GROUP BY t.id, t.name, t.hours
    `);
    const pbByName = {};
    for (const t of pbTasks) pbByName[t.name.toLowerCase().trim()] = t;

    // Strip tier prefix "[Better] ", "[Good] ", "[Best] " from description
    const stripTier = (s) => (s || '').replace(/^\[(Better\+?|Good|Best)\]\s*/i, '').trim();

    let totalLaborCost  = 0;
    let totalEstMatCost = 0; // engine mat estimate (only when no tracked materials)
    let hasEngineMatch  = false;

    const invItemsWithCost = invItems.map(ii => {
      const qty = parseFloat(ii.quantity || 1);

      // If cost was stored at time of sale, use it as labor+mat combined
      if (ii.cost !== null && ii.cost !== undefined && parseFloat(ii.cost) > 0) {
        const c = parseFloat(ii.cost) * qty;
        totalLaborCost += c;
        return { ...ii, computed_cogs: c, source: 'stored' };
      }

      // Try to match to pricebook task by stripped name
      const key = stripTier(ii.description).toLowerCase();
      const task = pbByName[key];
      if (task) {
        hasEngineMatch = true;
        const laborC = parseFloat(task.hours || 0) * costPerHr * qty;
        // Only add engine mat estimate when we have no real tracked materials
        const matC = !hasTrackedMaterials ? parseFloat(task.mat_cost || 0) * qty : 0;
        totalLaborCost  += laborC;
        totalEstMatCost += matC;
        return {
          ...ii,
          computed_cogs: laborC + matC,
          labor_cogs: laborC,
          mat_cogs: matC,
          source: 'engine',
        };
      }

      return { ...ii, computed_cogs: 0, source: 'unknown' };
    });

    const totalInvoiceCogs = invItemsWithCost.reduce((s, ii) => s + (ii.computed_cogs || 0), 0);

    // ── 5. Revenue ────────────────────────────────────────────────────────
    // Match the invoice-items lookup: include invoices on the job, its parent,
    // its children, and any sibling in the same project.
    const { rows: invoiceRows } = await query(`
      SELECT COALESCE(SUM(total), 0) AS revenue
      FROM invoices
      WHERE status NOT IN ('void','draft')
        AND (
          job_id = $1
          OR job_id = (SELECT parent_job_id FROM jobs WHERE id = $1)
          OR job_id IN (SELECT id FROM jobs WHERE parent_job_id = $1)
          OR job_id IN (
            SELECT id FROM jobs
            WHERE project_id = (SELECT project_id FROM jobs WHERE id = $1)
              AND project_id IS NOT NULL
          )
        )
    `, [req.params.id]);
    const revenue = parseFloat(invoiceRows[0]?.revenue || 0);

    // ── 6. Totals ─────────────────────────────────────────────────────────
    // Labor COGS: from engine (hours × costPerHr)
    // Material COGS: actual tracked (PO + inventory). Engine mat estimate only when neither exists.
    // Subcontractor COGS: separate bucket — never lumped into materials.
    const totalMaterialCogs = totalInventoryCost + totalPoCost + totalEstMatCost;
    const totalCost = totalLaborCost + totalMaterialCogs + totalSubCost;
    const grossMarginPct = revenue > 0
      ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10
      : null;

    res.json({
      line_items:             lineItems,
      po_items:               poItems,           // material POs only (back-compat)
      sub_po_items:           subPoItems,        // subcontractor POs (new)
      inv_items:              invItemsWithCost,
      total_material_cost:    Math.round(totalMaterialCogs * 100) / 100,  // truck + supply POs + engine fallback (no subs)
      total_inventory_cost:   Math.round(totalInventoryCost * 100) / 100, // truck stock only
      total_po_cost:          Math.round(totalPoCost * 100) / 100,         // supply POs only
      total_subcontractor_cost: Math.round(totalSubCost * 100) / 100,      // subcontractor POs (separate bucket)
      total_labor_cost:       Math.round(totalLaborCost * 100) / 100,
      total_invoice_cogs:     Math.round(totalInvoiceCogs * 100) / 100,
      total_cost:             Math.round(totalCost * 100) / 100,
      revenue,
      gross_margin_pct:       grossMarginPct,
      cost_per_hr:            Math.round(costPerHr * 100) / 100,
      has_engine_match:       hasEngineMatch,
      has_tracked_materials:  hasTrackedMaterials,
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

// ── Purchase Orders ───────────────────────────────────────────
// GET /api/jobs/:id/purchase-orders  (includes line items)
router.get("/:id/purchase-orders", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT po.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', poi.id,
              'description', poi.description,
              'sku', poi.sku,
              'qty', poi.qty,
              'unit_cost', poi.unit_cost
            ) ORDER BY poi.id
          ) FILTER (WHERE poi.id IS NOT NULL),
          '[]'::json
        ) AS items
       FROM purchase_orders po
       LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
       WHERE po.job_id = $1
       GROUP BY po.id
       ORDER BY po.created_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/purchase-orders
router.post("/:id/purchase-orders", authenticate, async (req, res) => {
  try {
    const { vendor, notes, status = "draft", fulfillment_type = "pickup", date_needed, items = [], po_type = "supply" } = req.body;
    const { rows } = await query(
      `INSERT INTO purchase_orders (job_id, vendor, notes, status, fulfillment_type, date_needed, created_by, po_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [req.params.id, vendor || null, notes || null, status, fulfillment_type, date_needed || null, req.user.id, po_type]
    );
    const po = rows[0];

    // Insert line items
    for (const item of items) {
      if (!item.description?.trim()) continue;
      await query(
        `INSERT INTO purchase_order_items (po_id, description, sku, qty, unit_cost)
         VALUES ($1, $2, $3, $4, $5)`,
        [po.id, item.description.trim(), item.sku || null, parseInt(item.qty) || 1, parseFloat(item.unit_cost) || 0]
      );
    }

    // Return with items
    const { rows: full } = await query(
      `SELECT po.*,
        COALESCE(json_agg(json_build_object('id',poi.id,'description',poi.description,'sku',poi.sku,'qty',poi.qty,'unit_cost',poi.unit_cost) ORDER BY poi.id) FILTER (WHERE poi.id IS NOT NULL),'[]'::json) AS items
       FROM purchase_orders po LEFT JOIN purchase_order_items poi ON poi.po_id = po.id
       WHERE po.id = $1 GROUP BY po.id`,
      [po.id]
    );
    res.status(201).json(full[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/jobs/:id/purchase-orders/:poId
router.patch("/:id/purchase-orders/:poId", authenticate, async (req, res) => {
  try {
    const allowed = ["vendor", "notes", "status", "fulfillment_type", "date_needed"];
    const updates = [];
    const params = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { params.push(v); updates.push(`${k} = $${params.length}`); }
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });
    params.push(req.params.poId);
    const { rows } = await query(
      `UPDATE purchase_orders SET ${updates.join(",")}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
      params
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/purchase-orders/:poId/items
router.post("/:id/purchase-orders/:poId/items", authenticate, async (req, res) => {
  try {
    const { description, sku, qty = 1, unit_cost = 0 } = req.body;
    if (!description?.trim()) return res.status(400).json({ error: "description required" });
    const { rows } = await query(
      `INSERT INTO purchase_order_items (po_id, description, sku, qty, unit_cost)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [req.params.poId, description.trim(), sku || null, parseInt(qty) || 1, parseFloat(unit_cost) || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id/purchase-orders/:poId/items/:itemId
router.delete("/:id/purchase-orders/:poId/items/:itemId", authenticate, async (req, res) => {
  try {
    await query(`DELETE FROM purchase_order_items WHERE id = $1 AND po_id = $2`, [req.params.itemId, req.params.poId]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

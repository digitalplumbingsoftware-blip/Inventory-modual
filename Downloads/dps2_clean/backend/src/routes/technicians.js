const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { query } = require("../db/pool");
const { authenticate, requireRole } = require("../middleware/auth");

// GET /api/technicians  — list all active techs with today's job count + latest GPS
router.get("/", authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const { rows } = await query(`
      SELECT
        u.id, u.first_name, u.last_name, u.phone, u.email,
        u.color, u.initials, u.role,
        COUNT(DISTINCT j.id) FILTER (WHERE DATE(j.scheduled_start) = $1) as jobs_today,
        COUNT(DISTINCT j.id) FILTER (WHERE j.status IN ('on_site','en_route')) as active_jobs,
        -- Latest GPS ping
        gps.lat, gps.lng, gps.on_duty,
        gps.created_at as last_ping,
        -- Derive status from active jobs
        CASE
          WHEN EXISTS (SELECT 1 FROM jobs WHERE technician_id=u.id AND status='on_site') THEN 'on_site'
          WHEN EXISTS (SELECT 1 FROM jobs WHERE technician_id=u.id AND status='en_route') THEN 'en_route'
          ELSE 'available'
        END as status
      FROM users u
      LEFT JOIN jobs j ON j.technician_id = u.id
      LEFT JOIN LATERAL (
        SELECT lat, lng, on_duty, created_at
        FROM gps_pings
        WHERE technician_id = u.id AND on_duty = true
        ORDER BY created_at DESC LIMIT 1
      ) gps ON true
      WHERE u.role = 'technician' AND u.active = true
      GROUP BY u.id, gps.lat, gps.lng, gps.on_duty, gps.created_at
      ORDER BY u.first_name
    `, [today]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/technicians/:id
router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await query(
    `SELECT id, first_name, last_name, phone, email, color, initials, role, active
     FROM users WHERE id = $1 AND role = 'technician'`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// POST /api/technicians — create new technician user
router.post("/", authenticate, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, color, initials, password } = req.body;
    if (!first_name || !last_name || !email || !password)
      return res.status(400).json({ error: "first_name, last_name, email, and password are required" });

    const hash = await bcrypt.hash(password, 10);
    const auto_initials = initials || (first_name[0] + last_name[0]).toUpperCase();
    const auto_color    = color || '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6,'0');

    const { rows } = await query(
      `INSERT INTO users (first_name, last_name, email, password_hash, phone, color, initials, role, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'technician',true) RETURNING id, first_name, last_name, email, phone, color, initials, role, active`,
      [first_name, last_name, email.toLowerCase(), hash, phone||'', auto_color, auto_initials]
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/technicians/:id — update technician
router.put("/:id", authenticate, async (req, res) => {
  try {
    const { first_name, last_name, email, phone, color, initials, active, password } = req.body;

    // If a new password is provided, hash it
    let passwordClause = '';
    const vals = [first_name, last_name, email?.toLowerCase(), phone||'', color||'#3ecf8e',
                  initials||(first_name[0]+last_name[0]).toUpperCase(), active!==false, req.params.id];

    if (password && password.trim()) {
      const hash = await bcrypt.hash(password, 10);
      passwordClause = ', password_hash=$9';
      vals.push(hash);
    }

    const { rows } = await query(
      `UPDATE users SET first_name=$1, last_name=$2, email=$3, phone=$4, color=$5, initials=$6, active=$7, updated_at=NOW()${passwordClause}
       WHERE id=$8 AND role='technician' RETURNING id, first_name, last_name, email, phone, color, initials, role, active`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: "Email already exists" });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/technicians/:id — deactivate (soft delete)
router.delete("/:id", authenticate, async (req, res) => {
  try {
    await query(`UPDATE users SET active=false, updated_at=NOW() WHERE id=$1 AND role='technician'`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

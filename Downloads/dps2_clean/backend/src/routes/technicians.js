const router = require("express").Router();
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
    `SELECT id, first_name, last_name, phone, email, color, initials, role
     FROM users WHERE id = $1 AND role = 'technician'`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

module.exports = router;

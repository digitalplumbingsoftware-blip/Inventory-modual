const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");
const { broadcast } = require("../websocket/gps");

// POST /api/gps/ping  — tablet sends location every 30s
router.post("/ping", authenticate, async (req, res) => {
  try {
    const { lat, lng, accuracy, speed, heading, on_duty = true, job_id } = req.body;

    if (!lat || !lng) return res.status(400).json({ error: "lat and lng required" });

    // Only store if on_duty
    if (!on_duty) {
      return res.json({ stored: false, reason: "off_duty" });
    }

    const { rows } = await query(`
      INSERT INTO gps_pings (technician_id, lat, lng, accuracy, speed, heading, on_duty, job_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [req.user.id, lat, lng, accuracy, speed, heading, on_duty, job_id || null]);

    const ping = rows[0];

    // Broadcast to all connected dashboard clients
    broadcast({
      type: "gps_ping",
      technician_id: req.user.id,
      name: req.user.name,
      lat: parseFloat(ping.lat),
      lng: parseFloat(ping.lng),
      on_duty: ping.on_duty,
      ts: ping.created_at,
    });

    res.json({ stored: true, ping });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gps/live  — latest position for all on-duty techs
router.get("/live", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT DISTINCT ON (p.technician_id)
        p.technician_id, p.lat, p.lng, p.speed, p.on_duty, p.created_at,
        u.first_name || ' ' || u.last_name as name,
        u.color, u.initials,
        j.status as job_status, j.id as job_id
      FROM gps_pings p
      JOIN users u ON u.id = p.technician_id
      LEFT JOIN LATERAL (
        SELECT status, id FROM jobs
        WHERE technician_id = p.technician_id AND status IN ('on_site','en_route','scheduled')
        ORDER BY scheduled_start LIMIT 1
      ) j ON true
      WHERE p.on_duty = true
        AND p.created_at > NOW() - INTERVAL '2 hours'
      ORDER BY p.technician_id, p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/gps/history/:techId?date=YYYY-MM-DD  — route for a day
router.get("/history/:techId", authenticate, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().split("T")[0];
    const { rows } = await query(`
      SELECT lat, lng, speed, heading, created_at
      FROM gps_pings
      WHERE technician_id = $1
        AND on_duty = true
        AND DATE(created_at) = $2
      ORDER BY created_at
    `, [req.params.techId, date]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

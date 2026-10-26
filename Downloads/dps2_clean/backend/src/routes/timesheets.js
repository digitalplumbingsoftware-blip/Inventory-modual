const router = require('express').Router();
const pool   = require('../db/pool');
const { authenticate, requireRole } = require('../middleware/auth');

// ── GET /api/timesheets?weekEnding=YYYY-MM-DD&staffType=technicians|office ──
// Returns active staff and their punches for the 7-day period ending on weekEnding.
router.get('/', authenticate, async (req, res) => {
  try {
    const { weekEnding, staffType } = req.query;
    if (!weekEnding || !/^\d{4}-\d{2}-\d{2}$/.test(weekEnding)) {
      return res.status(400).json({ error: 'weekEnding (YYYY-MM-DD) required' });
    }

    // Week spans [weekStart 00:00 .. weekEnding+1 00:00)
    const weekStart = new Date(weekEnding + 'T00:00:00Z');
    weekStart.setUTCDate(weekStart.getUTCDate() - 6);
    const weekEndExcl = new Date(weekEnding + 'T00:00:00Z');
    weekEndExcl.setUTCDate(weekEndExcl.getUTCDate() + 1);

    const roleFilter = staffType === 'office'
      ? `role IN ('admin','dispatcher','office','accountant')`
      : `role = 'technician'`;

    const { rows: techs } = await pool.query(
      `SELECT id, first_name, last_name, color, initials
       FROM users WHERE ${roleFilter} AND active = true
       ORDER BY first_name, last_name`
    );

    const { rows: punches } = await pool.query(
      `SELECT tp.id, tp.user_id, tp.punch_in, tp.punch_out, tp.notes,
              tp.created_by, tp.created_at
       FROM time_punches tp
       WHERE tp.punch_in >= $1 AND tp.punch_in < $2
       ORDER BY tp.user_id, tp.punch_in`,
      [weekStart.toISOString(), weekEndExcl.toISOString()]
    );

    res.json({ techs, punches, weekStart: weekStart.toISOString(), weekEnd: weekEnding });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/timesheets  — manual entry (admin/dispatcher) ───
router.post('/', authenticate, async (req, res) => {
  try {
    const { user_id, punch_in, punch_out, notes } = req.body;
    if (!user_id || !punch_in) return res.status(400).json({ error: 'user_id and punch_in required' });
    if (punch_out && new Date(punch_out) <= new Date(punch_in))
      return res.status(400).json({ error: 'punch_out must be after punch_in' });

    const { rows } = await pool.query(
      `INSERT INTO time_punches(user_id, punch_in, punch_out, notes, created_by)
       VALUES($1,$2,$3,$4,$5)
       RETURNING id, user_id, punch_in, punch_out, notes, created_at`,
      [user_id, punch_in, punch_out || null, notes || null, req.user.id]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/timesheets/:id  — edit punch ─────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { punch_in, punch_out, notes } = req.body;
    if (punch_out && punch_in && new Date(punch_out) <= new Date(punch_in))
      return res.status(400).json({ error: 'punch_out must be after punch_in' });

    const { rows } = await pool.query(
      `UPDATE time_punches
       SET punch_in = COALESCE($1, punch_in),
           punch_out = $2,
           notes = $3,
           updated_at = NOW()
       WHERE id = $4
       RETURNING id, user_id, punch_in, punch_out, notes, updated_at`,
      [punch_in || null, punch_out || null, notes || null, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/timesheets/:id ─────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM time_punches WHERE id=$1`, [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/timesheets/clock-in  — tech self-service ────────
// Used by mobile app: clocks the authenticated user in.
router.post('/clock-in', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    // Check for open punch (already clocked in)
    const { rows: open } = await pool.query(
      `SELECT id FROM time_punches WHERE user_id=$1 AND punch_out IS NULL ORDER BY punch_in DESC LIMIT 1`,
      [req.user.id]
    );
    if (open.length) return res.status(409).json({ error: 'Already clocked in', punch_id: open[0].id });

    const { rows } = await pool.query(
      `INSERT INTO time_punches(user_id, punch_in, notes, created_by)
       VALUES($1, NOW(), $2, $1) RETURNING id, punch_in`,
      [req.user.id, notes || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/timesheets/clock-out  — tech self-service ───────
router.post('/clock-out', authenticate, async (req, res) => {
  try {
    const { notes } = req.body;
    const { rows } = await pool.query(
      `UPDATE time_punches SET punch_out=NOW(), notes=COALESCE($2,notes), updated_at=NOW()
       WHERE user_id=$1 AND punch_out IS NULL
       RETURNING id, punch_in, punch_out`,
      [req.user.id, notes || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'No open punch found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/timesheets/status  — current punch status for authed user ──
router.get('/status', authenticate, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, punch_in, punch_out FROM time_punches
       WHERE user_id=$1 ORDER BY punch_in DESC LIMIT 1`,
      [req.user.id]
    );
    const punch = rows[0] || null;
    res.json({
      clocked_in: punch ? punch.punch_out === null : false,
      punch,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

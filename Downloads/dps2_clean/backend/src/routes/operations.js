const router = require('express').Router();
const pool   = require('../db/pool');
const { authenticate } = require('../middleware/auth');

const DEFAULT_WINDOWS = [
  '8am – 10am', '10am – 12pm', '12pm – 2pm',
  '2pm – 4pm',  '4pm – 6pm',  '8am – 12pm',
  '12pm – 5pm', 'Anytime',
];

const DEFAULT_JOB_TYPES = [
  'Water Heater', 'Drain / Sewer', 'Leak Detection',
  'Bathroom', 'Kitchen', 'Outdoor / Irrigation',
  'Gas Line', 'Fixture Install', 'Emergency Service',
  'Estimate / Inspection',
];

// ── Arrival Windows ────────────────────────────────────────────
router.get('/arrival-windows', authenticate, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT config FROM integrations WHERE name='arrival_windows'`);
    res.json(r.rows[0]?.config?.windows ?? DEFAULT_WINDOWS);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/arrival-windows', authenticate, async (req, res) => {
  try {
    const windows = req.body.windows ?? [];
    await pool.query(`
      INSERT INTO integrations(name,config) VALUES('arrival_windows',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify({ windows })]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Job Types ──────────────────────────────────────────────────
router.get('/job-types', authenticate, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT config FROM integrations WHERE name='job_types'`);
    res.json(r.rows[0]?.config?.types ?? DEFAULT_JOB_TYPES);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/job-types', authenticate, async (req, res) => {
  try {
    const types = req.body.types ?? [];
    await pool.query(`
      INSERT INTO integrations(name,config) VALUES('job_types',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify({ types })]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Business Hours ─────────────────────────────────────────────
const DEFAULT_HOURS = {
  monday:    { open: true,  start: '08:00', end: '17:00' },
  tuesday:   { open: true,  start: '08:00', end: '17:00' },
  wednesday: { open: true,  start: '08:00', end: '17:00' },
  thursday:  { open: true,  start: '08:00', end: '17:00' },
  friday:    { open: true,  start: '08:00', end: '17:00' },
  saturday:  { open: false, start: '09:00', end: '14:00' },
  sunday:    { open: false, start: '09:00', end: '14:00' },
};

const DEFAULT_HOLIDAYS = [
  { name: "New Year's Day",        date: '01-01', open: false },
  { name: "Martin Luther King Jr. Day", date: 'mlk',  open: false },
  { name: "Presidents' Day",       date: 'presidents', open: false },
  { name: "Memorial Day",          date: 'memorial',  open: false },
  { name: "Juneteenth",            date: '06-19', open: false },
  { name: "Independence Day",      date: '07-04', open: false },
  { name: "Labor Day",             date: 'labor',     open: false },
  { name: "Columbus Day",          date: 'columbus',  open: true  },
  { name: "Veterans Day",          date: '11-11', open: true  },
  { name: "Thanksgiving Day",      date: 'thanksgiving', open: false },
  { name: "Christmas Eve",         date: '12-24', open: true  },
  { name: "Christmas Day",         date: '12-25', open: false },
  { name: "New Year's Eve",        date: '12-31', open: true  },
];

router.get('/business-hours', authenticate, async (_req, res) => {
  try {
    const r = await pool.query(`SELECT config FROM integrations WHERE name='business_hours'`);
    const cfg = r.rows[0]?.config ?? {};
    res.json({
      hours:    cfg.hours    ?? DEFAULT_HOURS,
      holidays: cfg.holidays ?? DEFAULT_HOLIDAYS,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/business-hours', authenticate, async (req, res) => {
  try {
    const { hours, holidays } = req.body;
    await pool.query(`
      INSERT INTO integrations(name,config) VALUES('business_hours',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify({ hours, holidays })]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

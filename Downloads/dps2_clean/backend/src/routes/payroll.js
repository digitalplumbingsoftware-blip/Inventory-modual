
const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET /api/payroll/settings — full payroll settings object { enabled, runningTiers }
router.get('/settings', authenticate, async (req, res) => {
  try {
    const r = await query("SELECT config FROM payroll_settings WHERE pay_type='settings'");
    res.json(r.rows[0]?.config || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/payroll/settings — save { enabled, runningTiers }
router.post('/settings', authenticate, async (req, res) => {
  try {
    const config = req.body;
    await query(
      "INSERT INTO payroll_settings (pay_type, config) VALUES ('settings',$1) ON CONFLICT (pay_type) DO UPDATE SET config=$1, updated_at=NOW()",
      [JSON.stringify(config)]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.get('/:type', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM payroll_settings WHERE pay_type=$1', [req.params.type]);
    res.json(r.rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/:type', authenticate, async (req, res) => {
  try {
    const { config } = req.body;
    await query(
      'INSERT INTO payroll_settings (pay_type, config) VALUES ($1,$2) ON CONFLICT (pay_type) DO UPDATE SET config=$2, updated_at=NOW()',
      [req.params.type, JSON.stringify(config)]
    );
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

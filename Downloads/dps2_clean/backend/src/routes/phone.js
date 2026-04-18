const router  = require('express').Router();
const pool    = require('../db/pool');
const { authenticate: auth } = require('../middleware/auth');
const { broadcast } = require('../websocket/gps');
const https   = require('https');
const qs      = require('querystring');

// ── Get phone system settings ──────────────────────────────────
router.get('/settings', auth, async (req, res) => {
  try {
    const r = await pool.query(`SELECT config FROM integrations WHERE name='phone_system'`);
    res.json(r.rows[0]?.config || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Save phone system settings ─────────────────────────────────
router.put('/settings', auth, async (req, res) => {
  try {
    await pool.query(`
      INSERT INTO integrations(name,config) VALUES('phone_system',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify(req.body)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Customer lookup by phone number ───────────────────────────
router.get('/lookup', auth, async (req, res) => {
  try {
    const { number } = req.query;
    if (!number) return res.json({ customer: null, jobs: [] });
    const digits  = number.replace(/\D/g, '');
    if (digits.length < 7) return res.json({ customer: null, jobs: [] });
    const last10  = digits.slice(-10);
    const r = await pool.query(`
      SELECT c.*,
        (SELECT COUNT(*) FROM jobs j WHERE j.customer_id=c.id) AS job_count,
        (SELECT json_agg(a.* ORDER BY a.is_primary DESC, a.created_at ASC)
         FROM addresses a WHERE a.customer_id=c.id) AS addresses
      FROM customers c
      WHERE REGEXP_REPLACE(COALESCE(c.phone,''),  '[^0-9]','','g') LIKE $1
         OR REGEXP_REPLACE(COALESCE(c.phone2,''), '[^0-9]','','g') LIKE $1
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(c.phones,'[]'::jsonb)) p
           WHERE REGEXP_REPLACE(p->>'value','[^0-9]','','g') LIKE $1
         )
      LIMIT 1
    `, [`%${last10}`]);
    if (!r.rows[0]) return res.json({ customer: null, jobs: [] });
    const jr = await pool.query(`
      SELECT id, job_number, status, job_type, description, scheduled_start, created_at
      FROM jobs WHERE customer_id=$1 ORDER BY created_at DESC LIMIT 6
    `, [r.rows[0].id]);
    res.json({ customer: r.rows[0], jobs: jr.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Twilio incoming call webhook ───────────────────────────────
// Set this URL in Twilio Console → Phone Number → Voice webhook
router.post('/twilio/incoming', async (req, res) => {
  try {
    const from = req.body.From || req.body.from || '';
    // Broadcast caller ID to all connected browsers
    broadcast({ type: 'incoming_call', from, ts: new Date().toISOString() });
    // Forward call to the configured cell number
    const cfgR = await pool.query(`SELECT config FROM integrations WHERE name='phone_system'`);
    const cfg  = cfgR.rows[0]?.config || {};
    const cell = cfg.cell_number ? cfg.cell_number.replace(/\D/g,'').replace(/^(\d{10})$/, '+1$1').replace(/^1(\d{10})$/, '+1$1') : '';
    res.set('Content-Type', 'text/xml');
    if (cell) {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Dial>${cell}</Dial></Response>`);
    } else {
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>No forwarding number configured.</Say></Response>`);
    }
  } catch(e) { res.status(500).send('<Response/>'); }
});

// ── Twilio SMS helper ──────────────────────────────────────────
async function twilioSend(to, body, cfg) {
  return new Promise((resolve, reject) => {
    const postData = qs.stringify({ To: to, From: cfg.twilio_number, Body: body });
    const creds    = Buffer.from(`${cfg.twilio_sid}:${cfg.twilio_token}`).toString('base64');
    const opts = {
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${cfg.twilio_sid}/Messages.json`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${creds}`,
        'Content-Length': Buffer.byteLength(postData),
      },
    };
    const req = https.request(opts, r => {
      let d = '';
      r.on('data', c => d += c);
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ── Send outbound SMS ──────────────────────────────────────────
router.post('/sms/send', auth, async (req, res) => {
  try {
    const { to, body, customer_id } = req.body;
    const cfgR = await pool.query(`SELECT config FROM integrations WHERE name='phone_system'`);
    const cfg  = cfgR.rows[0]?.config || {};
    if (!cfg.twilio_sid || !cfg.twilio_token || !cfg.twilio_number)
      return res.status(400).json({ error: 'Twilio not configured in Phone Manager settings.' });
    const result = await twilioSend(to, body, cfg);
    await pool.query(
      `INSERT INTO sms_messages(phone,direction,body,twilio_sid,customer_id) VALUES($1,'outbound',$2,$3,$4)`,
      [to, body, result.sid || null, customer_id || null]
    );
    res.json({ ok: true, sid: result.sid });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Incoming SMS webhook ───────────────────────────────────────
// Set this URL in Twilio Console → Phone Number → Messaging webhook
router.post('/sms/incoming', async (req, res) => {
  try {
    const from = req.body.From || '';
    const body = req.body.Body || '';
    const sid  = req.body.MessageSid || '';
    const last10 = from.replace(/\D/g,'').slice(-10);
    const custR  = await pool.query(`
      SELECT id FROM customers
      WHERE REGEXP_REPLACE(COALESCE(phone,''),  '[^0-9]','','g') LIKE $1
         OR REGEXP_REPLACE(COALESCE(phone2,''), '[^0-9]','','g') LIKE $1
      LIMIT 1
    `, [`%${last10}`]);
    const customer_id = custR.rows[0]?.id || null;
    await pool.query(
      `INSERT INTO sms_messages(phone,direction,body,twilio_sid,customer_id) VALUES($1,'inbound',$2,$3,$4)`,
      [from, body, sid, customer_id]
    );
    broadcast({ type: 'sms_received', from, body, customer_id, ts: new Date().toISOString() });
    res.set('Content-Type', 'text/xml').send(`<?xml version="1.0" encoding="UTF-8"?><Response/>`);
  } catch(e) { res.status(500).send('<Response/>'); }
});

// ── Get SMS conversation for a phone number ────────────────────
router.get('/sms', auth, async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.json([]);
    const digits = phone.replace(/\D/g, '').slice(-10);
    const r = await pool.query(`
      SELECT * FROM sms_messages
      WHERE REGEXP_REPLACE(phone,'[^0-9]','','g') LIKE $1
      ORDER BY created_at ASC LIMIT 200
    `, [`%${digits}`]);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Get all SMS conversations (grouped by phone) ───────────────
router.get('/conversations', auth, async (req, res) => {
  try {
    const r = await pool.query(`
      WITH latest AS (
        SELECT DISTINCT ON (REGEXP_REPLACE(phone,'[^0-9]','','g'))
          id, phone, customer_id, body, direction, created_at
        FROM sms_messages
        ORDER BY REGEXP_REPLACE(phone,'[^0-9]','','g'), created_at DESC
      )
      SELECT
        l.*,
        c.first_name, c.last_name, c.business_name, c.customer_type,
        (SELECT COUNT(*) FROM sms_messages sm
         WHERE REGEXP_REPLACE(sm.phone,'[^0-9]','','g') = REGEXP_REPLACE(l.phone,'[^0-9]','','g')) as message_count
      FROM latest l
      LEFT JOIN customers c ON c.id = l.customer_id
      ORDER BY l.created_at DESC
    `);
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

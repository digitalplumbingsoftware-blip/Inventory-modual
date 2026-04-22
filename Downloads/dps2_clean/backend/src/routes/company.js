const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const https = require('https');

// Helper: fetch a Google Maps API URL server-side (key never leaves server)
async function googleGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function getMapsKey() {
  const r = await query(`SELECT config FROM integrations WHERE name='google_maps'`);
  return r.rows[0]?.config?.key || process.env.GOOGLE_MAPS_KEY || '';
}

// ── Apple MapKit JS token generation ──────────────────────────
// Signs a short-lived JWT (ES256) the browser passes to mapkit.init()
function generateMapKitToken(teamId, keyId, privateKeyPem, origin) {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg:'ES256', kid:keyId, typ:'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: teamId,
    iat: now,
    exp: now + 60 * 60 * 24 * 30, // 30 days
    ...(origin ? { origin } : {}),
  })).toString('base64url');
  const unsigned = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(unsigned);
  // Apple requires IEEE-P1363 (raw R+S) format, not DER
  const sig = sign.sign({ key: privateKeyPem, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${unsigned}.${sig}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../public/uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, 'company_logo' + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// GET /api/company/settings
router.get('/settings', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT * FROM company_settings WHERE id = $1', ['main']);
    res.json(result.rows[0] || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/company/settings
router.post('/settings', authenticate, upload.single('logo'), async (req, res) => {
  try {
    const { name, phone, email, address, city, state, zip, url, ein,
            res_service, res_new, com_service, com_new } = req.body;
    const logo_url = req.file ? '/uploads/company_logo' + require('path').extname(req.file.originalname) : undefined;
    const fields = { name, phone, email, address, city, state, zip, url, ein,
      res_service: res_service === 'true', res_new: res_new === 'true',
      com_service: com_service === 'true', com_new: com_new === 'true',
      updated_at: new Date() };
    if (logo_url) fields.logo_url = logo_url;
    const keys = Object.keys(fields);
    const setClause = keys.map((k,i) => k + ' = $' + (i+1)).join(', ');
    const vals = keys.map(k => fields[k]);
    await query('UPDATE company_settings SET ' + setClause + ' WHERE id = $' + (keys.length+1), [...vals, 'main']);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/departments', authenticate, async (req, res) => {
  try {
    const { departments } = req.body;
    await query('UPDATE company_settings SET departments=$1 WHERE id=$2', [JSON.stringify(departments), 'main']);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/company/maps-key — DB first, then env fallback (used for Street View img src)
router.get('/maps-key', authenticate, async (_req, res) => {
  try {
    const r = await query(`SELECT config FROM integrations WHERE name='google_maps'`);
    const key = r.rows[0]?.config?.key || process.env.GOOGLE_MAPS_KEY || '';
    res.json({ key, source: r.rows[0] ? 'db' : (process.env.GOOGLE_MAPS_KEY ? 'env' : 'none') });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/company/maps-key — save key to DB
router.put('/maps-key', authenticate, async (req, res) => {
  try {
    const { key } = req.body;
    await query(`
      INSERT INTO integrations(name, config) VALUES('google_maps', $1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify({ key: key || '' })]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Google Places proxy (key stays on server) ─────────────────

// GET /api/company/places-autocomplete?input=...
router.get('/places-autocomplete', authenticate, async (req, res) => {
  try {
    const { input } = req.query;
    if (!input?.trim()) return res.json({ predictions: [] });
    const key = await getMapsKey();
    if (!key) return res.json({ predictions: [] });
    const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&key=${key}`;
    const data = await googleGet(url);
    res.json({ predictions: data.predictions || [], status: data.status });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/company/place-details?place_id=...
router.get('/place-details', authenticate, async (req, res) => {
  try {
    const { place_id } = req.query;
    if (!place_id) return res.status(400).json({ error: 'Missing place_id' });
    const key = await getMapsKey();
    if (!key) return res.status(404).json({ error: 'Maps key not configured' });
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=address_components,geometry&key=${key}`;
    const data = await googleGet(url);
    res.json(data.result || {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Apple Maps ────────────────────────────────────────────────

// GET /api/company/apple-maps-config — returns config (never the private key)
router.get('/apple-maps-config', authenticate, async (_req, res) => {
  try {
    const r = await query(`SELECT config FROM integrations WHERE name='apple_maps'`);
    const cfg = r.rows[0]?.config || {};
    res.json({
      team_id:  cfg.team_id  || '',
      key_id:   cfg.key_id   || '',
      origin:   cfg.origin   || '',
      has_key:  !!cfg.private_key,
      configured: !!(cfg.team_id && cfg.key_id && cfg.private_key),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/company/apple-maps-config — upsert credentials
router.put('/apple-maps-config', authenticate, async (req, res) => {
  try {
    const { team_id, key_id, private_key, origin } = req.body;
    // Preserve existing private key if caller didn't send a new one
    const existing = await query(`SELECT config FROM integrations WHERE name='apple_maps'`);
    const prev = existing.rows[0]?.config || {};
    const cfg = {
      team_id:     (team_id     || prev.team_id     || '').trim(),
      key_id:      (key_id      || prev.key_id      || '').trim(),
      private_key: (private_key || prev.private_key || '').trim(),
      origin:      (origin      || prev.origin      || '').trim(),
    };
    await query(`
      INSERT INTO integrations(name, config) VALUES('apple_maps', $1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify(cfg)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/company/apple-maps-token — generate a fresh MapKit JS JWT
router.get('/apple-maps-token', authenticate, async (_req, res) => {
  try {
    const r = await query(`SELECT config FROM integrations WHERE name='apple_maps'`);
    const cfg = r.rows[0]?.config;
    if (!cfg?.team_id || !cfg?.key_id || !cfg?.private_key) {
      return res.status(404).json({ error: 'Apple Maps not configured' });
    }
    const token = generateMapKitToken(cfg.team_id, cfg.key_id, cfg.private_key, cfg.origin || undefined);
    res.json({ token });
  } catch(e) {
    const msg = e.message || '';
    // Provide actionable error for common mistakes
    if (msg.includes('PEM') || msg.includes('key')) {
      return res.status(400).json({ error: 'Invalid private key — paste the full .p8 file content including BEGIN/END lines.' });
    }
    res.status(500).json({ error: msg });
  }
});

// GET /api/company/enabled-services — returns array of enabled service keys
router.get('/enabled-services', authenticate, async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM company_settings WHERE id=$1', ['main']);
    const s = rows[0] || {};
    const services = [];
    if (s.service_plumbing    !== false && s.service_plumbing    !== 'false') services.push('plumbing');
    if (s.service_hvac        === true  || s.service_hvac        === 'true')  services.push('hvac');
    if (s.service_electrical  === true  || s.service_electrical  === 'true')  services.push('electrical');
    if (s.service_restoration === true  || s.service_restoration === 'true')  services.push('restoration');
    if (s.service_renovations === true  || s.service_renovations === 'true')  services.push('renovations');
    // Always at least plumbing if nothing is set
    if (services.length === 0) services.push('plumbing');
    res.json(services);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

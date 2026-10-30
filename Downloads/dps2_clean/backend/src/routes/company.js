const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

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
    // Must match the static-serve path in index.js: /uploads → <root>/uploads
    const dir = path.join(__dirname, '../../../../uploads');
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
    const b = req.body;

    // Helper: FormData booleans arrive as strings
    const bool  = v => v === 'true' || v === true;
    // Helper: arrays were JSON.stringified in the frontend before appending
    const arr   = v => { try { return JSON.parse(v) } catch { return [] } };
    // Helper: text with empty-string fallback
    const txt   = v => (v == null ? '' : String(v));

    const logo_url = req.file ? '/uploads/company_logo' + path.extname(req.file.originalname) : undefined;

    const fields = {
      // Basic info
      name:     txt(b.name),
      phone:    txt(b.phone),
      email:    txt(b.email),
      address:  txt(b.address),
      city:     txt(b.city),
      state:    txt(b.state),
      zip:      txt(b.zip),
      url:      txt(b.url),
      ein:      txt(b.ein),
      // Job types
      res_service: bool(b.res_service),
      res_new:     bool(b.res_new),
      com_service: bool(b.com_service),
      com_new:     bool(b.com_new),
      // Brand colors
      brand_primary:   txt(b.brand_primary)   || '#e8a84a',
      brand_secondary: txt(b.brand_secondary) || '#1a2a4a',
      brand_accent:    txt(b.brand_accent)    || '#5daf7c',
      // Services enabled
      service_plumbing:    bool(b.service_plumbing),
      service_hvac:        bool(b.service_hvac),
      service_electrical:  bool(b.service_electrical),
      service_restoration: bool(b.service_restoration),
      service_renovations: bool(b.service_renovations),
      service_pest_control: bool(b.service_pest_control),
      service_pools:        bool(b.service_pools),
      // Service customer types (JSON arrays)
      svc_types_plumbing:    JSON.stringify(arr(b.svc_types_plumbing)),
      svc_types_hvac:        JSON.stringify(arr(b.svc_types_hvac)),
      svc_types_electrical:  JSON.stringify(arr(b.svc_types_electrical)),
      svc_types_restoration: JSON.stringify(arr(b.svc_types_restoration)),
      svc_types_pest_control: JSON.stringify(arr(b.svc_types_pest_control)),
      svc_types_pools:        JSON.stringify(arr(b.svc_types_pools)),
      svc_types_renovations: JSON.stringify(arr(b.svc_types_renovations)),
      // Service license numbers
      svc_license_plumbing:    txt(b.svc_license_plumbing),
      svc_license_hvac:        txt(b.svc_license_hvac),
      svc_license_electrical:  txt(b.svc_license_electrical),
      svc_license_restoration: txt(b.svc_license_restoration),
      svc_license_renovations: txt(b.svc_license_renovations),
      svc_license_pest_control: txt(b.svc_license_pest_control),
      svc_license_pools:        txt(b.svc_license_pools),
      updated_at: new Date(),
    };

    if (logo_url) fields.logo_url = logo_url;

    const keys      = Object.keys(fields);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const vals      = keys.map(k => fields[k]);

    await query(
      `UPDATE company_settings SET ${setClause} WHERE id = $${keys.length + 1}`,
      [...vals, 'main']
    );
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

// Uses Places API (New). Google turned off the legacy Places endpoints for this
// project (REQUEST_DENIED "legacy API not enabled"), so these proxies call the new
// API and reshape its responses into the legacy format the address forms read
// (predictions[].place_id/description/structured_formatting, address_components, geometry).

// GET /api/company/places-autocomplete?input=...
router.get('/places-autocomplete', authenticate, async (req, res) => {
  try {
    const { input } = req.query;
    if (!input?.trim()) return res.json({ predictions: [] });
    const key = await getMapsKey();
    if (!key) return res.json({ predictions: [] });
    const r = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
      body: JSON.stringify({
        input,
        includedRegionCodes: ['us'],
        includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.json({ predictions: [], status: data.error?.status || 'ERROR', error_message: data.error?.message });
    const predictions = (data.suggestions || []).filter(s => s.placePrediction).map(({ placePrediction: p }) => ({
      place_id: p.placeId,
      description: p.text?.text || '',
      structured_formatting: {
        main_text: p.structuredFormat?.mainText?.text || p.text?.text || '',
        secondary_text: p.structuredFormat?.secondaryText?.text || '',
      },
    }));
    res.json({ predictions, status: 'OK' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/company/place-details?place_id=...
router.get('/place-details', authenticate, async (req, res) => {
  try {
    const { place_id } = req.query;
    if (!place_id) return res.status(400).json({ error: 'Missing place_id' });
    const key = await getMapsKey();
    if (!key) return res.status(404).json({ error: 'Maps key not configured' });
    const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(place_id)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'addressComponents,location' },
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data.error?.message || 'Place lookup failed' });
    res.json({
      address_components: (data.addressComponents || []).map(c => ({ long_name: c.longText, short_name: c.shortText, types: c.types || [] })),
      geometry: data.location ? { location: { lat: data.location.latitude, lng: data.location.longitude } } : undefined,
    });
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

// ── Payment Methods ───────────────────────────────────────────

// Ensure column exists (idempotent)
async function ensurePaymentMethodsColumn() {
  try {
    await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS payment_methods JSONB`);
  } catch(e) { /* ignore */ }
}
ensurePaymentMethodsColumn();

// GET /api/company/payment-methods
// Each method now supports: id, label, icon, enabled, sort_order, is_default,
// surcharge_pct, surcharge_fixed, gl_account_id, description, visible_to, is_custom
router.get('/payment-methods', authenticate, async (req, res) => {
  try {
    const { rows } = await query('SELECT payment_methods FROM company_settings WHERE id=$1', ['main']);
    const stored = rows[0]?.payment_methods;

    // Check which financing integrations are connected
    const { rows: intRows } = await query(
      `SELECT name, config FROM integrations WHERE name IN ('wisetack','acorn')`
    );
    const financing = {};
    for (const row of intRows) {
      financing[row.name] = !!(row.config?.api_key || row.config?.partner_id || row.config?.connected);
    }

    // Default methods if nothing saved yet — built-in 3 with sensible defaults
    const defaults = [
      { id:'cash',        label:'Cash',                enabled:true,  icon:'💵', sort_order:0, is_default:false, surcharge_pct:0, surcharge_fixed:0, description:'Tap-to-pay, on-site cash collection.', visible_to:'all',      is_custom:false },
      { id:'check',       label:'Check',               enabled:true,  icon:'📝', sort_order:1, is_default:false, surcharge_pct:0, surcharge_fixed:0, description:'Personal or business checks. Check number recorded.', visible_to:'all', is_custom:false },
      { id:'credit_card', label:'Credit / Debit Card', enabled:true,  icon:'💳', sort_order:2, is_default:true,  surcharge_pct:0, surcharge_fixed:0, description:'Charged via Square or Stripe.', visible_to:'all', is_custom:false },
    ];

    let methods = Array.isArray(stored) && stored.length ? stored : defaults;

    // Backfill missing fields on legacy rows so the UI never sees undefined
    methods = methods.map((m, i) => ({
      sort_order: i,
      is_default: false,
      surcharge_pct: 0,
      surcharge_fixed: 0,
      visible_to: 'all',
      is_custom: !['cash','check','credit_card','wisetack','acorn','stripe'].includes(m.id),
      ...m,
    }));

    // Merge financing integrations dynamically
    const finRows = [
      { id:'wisetack', label:'Wisetack Financing', icon:'🏦', integration:'wisetack', description:'Customer financing via Wisetack.', sort_order: 100, is_default:false, surcharge_pct:0, surcharge_fixed:0, visible_to:'all', is_custom:false },
      { id:'acorn',    label:'Acorn Finance',       icon:'🌰', integration:'acorn',    description:'Multi-lender financing via Acorn.', sort_order: 101, is_default:false, surcharge_pct:0, surcharge_fixed:0, visible_to:'all', is_custom:false },
    ];
    for (const fin of finRows) {
      if (financing[fin.integration]) {
        const exists = methods.find(m => m.id === fin.id);
        if (!exists) methods = [...methods, { ...fin, enabled: false, type: 'financing' }];
      }
    }

    methods.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
    res.json(methods);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/company/payment-methods — accepts the full method array
router.put('/payment-methods', authenticate, async (req, res) => {
  try {
    const { methods } = req.body;
    if (!Array.isArray(methods)) return res.status(400).json({ error: 'methods must be an array' });
    // Enforce single default
    let foundDefault = false;
    const cleaned = methods.map((m, i) => {
      const isDef = !!m.is_default && !foundDefault && m.enabled;
      if (isDef) foundDefault = true;
      return {
        ...m,
        enabled:         !!m.enabled,
        is_default:      isDef,
        sort_order:      Number.isFinite(m.sort_order) ? m.sort_order : i,
        surcharge_pct:   parseFloat(m.surcharge_pct) || 0,
        surcharge_fixed: parseFloat(m.surcharge_fixed) || 0,
      };
    });
    await query(
      'UPDATE company_settings SET payment_methods=$1 WHERE id=$2',
      [JSON.stringify(cleaned), 'main']
    );
    res.json({ ok: true, count: cleaned.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice Defaults (numbering, due days, late fees, reminders, footer) ───
(async () => {
  try {
    await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_defaults JSONB DEFAULT '{}'::jsonb`);
  } catch(e) { /* ignore */ }
})();

router.get('/invoice-defaults', authenticate, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT invoice_defaults FROM company_settings WHERE id='main'`);
    const stored = rows[0]?.invoice_defaults || {};
    // Defaults
    res.json({
      number_prefix:         '',
      number_next:           1001,
      number_pad:            4,                      // zero-pad width
      default_due_days:      30,
      default_terms_text:    'Payment due within 30 days. A finance charge of 1.5%/month may apply to past-due balances.',
      default_footer:        'Thank you for your business!',
      late_fee_enabled:      false,
      late_fee_type:         'percent',              // percent | fixed
      late_fee_value:        1.5,                    // 1.5% per month, or $X
      late_fee_grace_days:   5,                      // start charging N days after due
      reminder_enabled:      true,
      reminder_before_due:   3,                      // days before due to send heads-up (0 = off)
      reminder_on_due:       true,                   // send on due date
      reminder_after_due_1:  7,                      // first follow-up X days after due
      reminder_after_due_2:  14,                     // second follow-up
      reminder_after_due_3:  30,                     // final notice
      ...stored,
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/invoice-defaults', authenticate, async (req, res) => {
  try {
    await query(
      `UPDATE company_settings SET invoice_defaults=$1 WHERE id='main'`,
      [JSON.stringify(req.body || {})]
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Supply Houses ─────────────────────────────────────────────
(async () => {
  try {
    await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS supply_houses JSONB DEFAULT '[]'::jsonb`);
  } catch(e) { /* ignore */ }
})();

// GET /api/company/supply-houses
router.get('/supply-houses', authenticate, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT supply_houses FROM company_settings WHERE id='main'`);
    res.json(rows[0]?.supply_houses || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/company/supply-houses
router.put('/supply-houses', authenticate, async (req, res) => {
  try {
    const { houses } = req.body;
    if (!Array.isArray(houses)) return res.status(400).json({ error: 'houses must be an array' });
    await query(`UPDATE company_settings SET supply_houses=$1 WHERE id='main'`, [JSON.stringify(houses)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/company/subcontractors
router.get('/subcontractors', authenticate, async (_req, res) => {
  try {
    const { rows } = await query(`SELECT subcontractors FROM company_settings WHERE id='main'`);
    res.json(rows[0]?.subcontractors || []);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/company/subcontractors
router.put('/subcontractors', authenticate, async (req, res) => {
  try {
    const { subcontractors } = req.body;
    if (!Array.isArray(subcontractors)) return res.status(400).json({ error: 'subcontractors must be an array' });
    await query(`UPDATE company_settings SET subcontractors=$1 WHERE id='main'`, [JSON.stringify(subcontractors)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
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
    if (s.service_pest_control === true || s.service_pest_control === 'true') services.push('pest_control');
    if (s.service_pools        === true || s.service_pools        === 'true') services.push('pools');
    // Always at least plumbing if nothing is set
    if (services.length === 0) services.push('plumbing');
    res.json(services);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/company/service-enabled — flip one service on/off
// body: { service: 'hvac' | 'electrical' | ..., enabled: bool }
router.patch('/service-enabled', authenticate, async (req, res) => {
  try {
    const { service, enabled } = req.body || {};
    const allowed = new Set([
      'plumbing','hvac','electrical','restoration','renovations','pest_control','pools',
    ]);
    if (!allowed.has(service)) {
      return res.status(400).json({ error: `Unknown service: ${service}` });
    }
    const col = `service_${service}`;
    const val = !!enabled;
    // Ensure the row exists (id='main' is the single settings row)
    await query(
      `INSERT INTO company_settings (id, ${col}) VALUES ('main', $1)
       ON CONFLICT (id) DO UPDATE SET ${col} = $1`,
      [val]
    );
    res.json({ ok: true, service, enabled: val });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Invoice Layout ────────────────────────────────────────────

async function ensureInvoiceLayoutColumn() {
  try {
    await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_layout JSONB DEFAULT '{}'::jsonb`);
  } catch(e) { /* ignore */ }
}
ensureInvoiceLayoutColumn();

// GET /api/company/invoice-layout
router.get('/invoice-layout', authenticate, async (req, res) => {
  try {
    await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_layout JSONB DEFAULT '{}'::jsonb`).catch(()=>{});
    const { rows } = await query(
      `SELECT invoice_layout, name, address, phone, email, logo_url,
              brand_primary, brand_secondary, brand_accent
       FROM company_settings WHERE id=$1`,
      ['main']
    );
    const row = rows[0] || {};
    const layout = row.invoice_layout || {};
    const company = {
      name:            row.name,
      address:         row.address,
      phone:           row.phone,
      email:           row.email,
      logo_url:        row.logo_url,
      brand_primary:   row.brand_primary   || '#e8a84a',
      brand_secondary: row.brand_secondary || '#1a2a4a',
      brand_accent:    row.brand_accent    || '#5daf7c',
    };
    res.json({ ...layout, _company: company });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/company/invoice-layout
router.put('/invoice-layout', authenticate, async (req, res) => {
  try {
    await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_layout JSONB DEFAULT '{}'::jsonb`).catch(()=>{});
    const layout = req.body;
    await query(
      `UPDATE company_settings SET invoice_layout=$1 WHERE id=$2`,
      [JSON.stringify(layout), 'main']
    );
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

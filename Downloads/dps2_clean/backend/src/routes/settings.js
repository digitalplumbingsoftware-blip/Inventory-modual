// Centralized CRUD routes for the smaller config tables that back various
// Settings pages: payment_terms, tax_zones, business_units, phone_numbers.
// One file keeps the boilerplate consolidated; each resource is mounted under
// its own URL prefix from index.js.

const router = require('express').Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ── Schema bootstrap ────────────────────────────────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS payment_terms (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(80) NOT NULL,
        days        INT NOT NULL DEFAULT 0,
        description TEXT,
        is_default  BOOLEAN NOT NULL DEFAULT FALSE,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS tax_zones (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(80) NOT NULL,
        rate        NUMERIC(7,4) NOT NULL DEFAULT 0,
        jurisdiction VARCHAR(120),
        is_default  BOOLEAN NOT NULL DEFAULT FALSE,
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        zip_codes   JSONB DEFAULT '[]'::jsonb,
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS business_units (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(80) NOT NULL,
        code        VARCHAR(20),
        description TEXT,
        color       VARCHAR(20) DEFAULT '#3ecf8e',
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order  INT NOT NULL DEFAULT 0,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS phone_numbers (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        number        VARCHAR(20) NOT NULL UNIQUE,
        label         VARCHAR(80),
        provider      VARCHAR(40),  -- twilio, vonage, manual, etc.
        capabilities  JSONB DEFAULT '{"voice":true,"sms":true,"mms":false}'::jsonb,
        is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
        active        BOOLEAN NOT NULL DEFAULT TRUE,
        forward_to    VARCHAR(20),
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
  } catch (e) {
    console.warn('[settings] schema bootstrap warning:', e.message);
  }
})();

// ── Generic CRUD factory ────────────────────────────────────────────────────
// Each resource gets list / create / update / delete with a shared pattern.
// Insert/update only allow whitelisted fields. Single-default behavior is
// enforced for resources that have an `is_default` or `is_primary` flag.

function crud(table, fields, defaultFlag /* optional */, orderCol) {
  const list = async (req, res) => {
    try {
      const { include_inactive } = req.query;
      const where = include_inactive ? '' : 'WHERE active = TRUE';
      // Pick a sensible default order column based on what the table has
      const sortCol = orderCol || (fields.includes('name') ? 'name' : fields.includes('number') ? 'number' : 'created_at');
      const orderBy = fields.includes('sort_order')
        ? `ORDER BY sort_order ASC, ${sortCol} ASC`
        : `ORDER BY ${sortCol} ASC`;
      const { rows } = await query(`SELECT * FROM ${table} ${where} ${orderBy}`);
      res.json(rows);
    } catch (e) { res.status(500).json({ error: e.message }); }
  };

  const create = async (req, res) => {
    try {
      const cols = fields.filter(f => req.body[f] !== undefined);
      if (!cols.length) return res.status(400).json({ error: 'no fields provided' });
      const vals = cols.map(c => normalizeValue(c, req.body[c]));
      const placeholders = cols.map((_, i) => `$${i+1}`).join(',');
      const colsList = cols.join(',');
      const { rows } = await query(
        `INSERT INTO ${table} (${colsList}) VALUES (${placeholders}) RETURNING *`,
        vals
      );
      // Enforce single default
      if (defaultFlag && rows[0][defaultFlag]) {
        await query(`UPDATE ${table} SET ${defaultFlag} = FALSE WHERE id <> $1`, [rows[0].id]);
      }
      res.json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'duplicate value' });
      res.status(500).json({ error: e.message });
    }
  };

  const update = async (req, res) => {
    try {
      const cols = fields.filter(f => req.body[f] !== undefined);
      if (!cols.length) return res.status(400).json({ error: 'no fields provided' });
      const setClause = cols.map((c, i) => `${c} = $${i+1}`).join(', ');
      const vals = cols.map(c => normalizeValue(c, req.body[c]));
      vals.push(req.params.id);
      const { rows } = await query(
        `UPDATE ${table} SET ${setClause}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`,
        vals
      );
      if (!rows[0]) return res.status(404).json({ error: 'not found' });
      if (defaultFlag && rows[0][defaultFlag]) {
        await query(`UPDATE ${table} SET ${defaultFlag} = FALSE WHERE id <> $1`, [rows[0].id]);
      }
      res.json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'duplicate value' });
      res.status(500).json({ error: e.message });
    }
  };

  const remove = async (req, res) => {
    try {
      const r = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
      if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
      res.json({ ok: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
  };

  return { list, create, update, remove };
}

function normalizeValue(col, v) {
  // JSONB columns need stringified arrays/objects.
  if (col === 'zip_codes' || col === 'capabilities') {
    return typeof v === 'string' ? v : JSON.stringify(v ?? null);
  }
  return v === '' ? null : v;
}

// ── Payment Terms ───────────────────────────────────────────────────────────
// Defaults seeded on first GET if table is empty.
const ptFields = ['name','days','description','is_default','active','sort_order'];
const pt = crud('payment_terms', ptFields, 'is_default');

router.get('/payment-terms', authenticate, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT COUNT(*)::int AS n FROM payment_terms');
    if (rows[0].n === 0) {
      const defaults = [
        { name:'Due Upon Completion', days:0, is_default:true,  sort_order:0 },
        { name:'Net 7',  days:7,  sort_order:1 },
        { name:'Net 15', days:15, sort_order:2 },
        { name:'Net 30', days:30, sort_order:3 },
        { name:'Net 60', days:60, sort_order:4 },
        { name:'Net 90', days:90, sort_order:5 },
      ];
      for (const d of defaults) {
        await query(
          `INSERT INTO payment_terms (name, days, is_default, sort_order) VALUES ($1,$2,$3,$4)`,
          [d.name, d.days, d.is_default || false, d.sort_order]
        );
      }
    }
  } catch (e) { /* ignore seed failures */ }
  return pt.list(req, res, next);
});
router.post  ('/payment-terms',     authenticate, pt.create);
router.put   ('/payment-terms/:id', authenticate, pt.update);
router.delete('/payment-terms/:id', authenticate, pt.remove);

// ── Tax Zones ───────────────────────────────────────────────────────────────
const tzFields = ['name','rate','jurisdiction','is_default','active','zip_codes','notes'];
const tz = crud('tax_zones', tzFields, 'is_default');
router.get   ('/tax-zones',     authenticate, tz.list);
router.post  ('/tax-zones',     authenticate, tz.create);
router.put   ('/tax-zones/:id', authenticate, tz.update);
router.delete('/tax-zones/:id', authenticate, tz.remove);

// ── Business Units ──────────────────────────────────────────────────────────
const buFields = ['name','code','description','color','active','sort_order'];
const bu = crud('business_units', buFields);
router.get   ('/business-units',     authenticate, bu.list);
router.post  ('/business-units',     authenticate, bu.create);
router.put   ('/business-units/:id', authenticate, bu.update);
router.delete('/business-units/:id', authenticate, bu.remove);

// ── Phone Numbers ───────────────────────────────────────────────────────────
const pnFields = ['number','label','provider','capabilities','is_primary','active','forward_to','notes'];
const pn = crud('phone_numbers', pnFields, 'is_primary');
router.get   ('/phone-numbers',     authenticate, pn.list);
router.post  ('/phone-numbers',     authenticate, pn.create);
router.put   ('/phone-numbers/:id', authenticate, pn.update);
router.delete('/phone-numbers/:id', authenticate, pn.remove);

module.exports = router;

const router = require('express').Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ── Schema migration (idempotent) ────────────────────────────────────────────
// Standard double-entry chart of accounts.
//   number   numeric account code (e.g. 1000, 4200, 6300)
//   type     Asset | Liability | Equity | Revenue | COGS | Expense
//   subtype  optional sub-classification ("Current Asset", "Fixed Asset", etc.)
//   parent_id  optional parent account for sub-accounts
//   system_key  if set, prevents deletion (e.g. 'cash','ar','sales','sales_tax')
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS gl_accounts (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        number      VARCHAR(10) NOT NULL,
        name        VARCHAR(120) NOT NULL,
        type        VARCHAR(20) NOT NULL,
        subtype     VARCHAR(60),
        description TEXT,
        parent_id   UUID REFERENCES gl_accounts(id) ON DELETE SET NULL,
        system_key  VARCHAR(40),
        active      BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(number),
        UNIQUE(system_key)
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_gl_accounts_type ON gl_accounts(type)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_gl_accounts_active ON gl_accounts(active)`);
  } catch (e) {
    console.warn('[gl_accounts] schema bootstrap warning:', e.message);
  }
})();

const VALID_TYPES = ['Asset','Liability','Equity','Revenue','COGS','Expense'];

// Default chart of accounts tuned for a plumbing service business.
// system_key locks rows from deletion so reports/transactions can rely on them.
const DEFAULT_CHART = [
  // Assets ─────────────────────────────────────────────────────────
  { number:'1000', name:'Cash — Operating',         type:'Asset',     subtype:'Current Asset',    system_key:'cash' },
  { number:'1010', name:'Cash — Tax Reserve',       type:'Asset',     subtype:'Current Asset',    system_key:'tax_reserve_cash',
    description:'30% income-tax set-aside per quarter' },
  { number:'1100', name:'Accounts Receivable',      type:'Asset',     subtype:'Current Asset',    system_key:'ar' },
  { number:'1200', name:'Inventory — Warehouse',    type:'Asset',     subtype:'Current Asset',    system_key:'inventory_warehouse' },
  { number:'1210', name:'Inventory — Truck Stock',  type:'Asset',     subtype:'Current Asset',    system_key:'inventory_truck' },
  { number:'1500', name:'Prepaid Expenses',         type:'Asset',     subtype:'Current Asset' },
  { number:'1700', name:'Vehicles',                 type:'Asset',     subtype:'Fixed Asset' },
  { number:'1800', name:'Equipment & Tools',        type:'Asset',     subtype:'Fixed Asset' },
  { number:'1900', name:'Accumulated Depreciation', type:'Asset',     subtype:'Contra Asset' },

  // Liabilities ────────────────────────────────────────────────────
  { number:'2000', name:'Accounts Payable',         type:'Liability', subtype:'Current Liability', system_key:'ap' },
  { number:'2100', name:'Sales Tax Payable',        type:'Liability', subtype:'Current Liability', system_key:'sales_tax_payable' },
  { number:'2200', name:'Payroll Liabilities',      type:'Liability', subtype:'Current Liability' },
  { number:'2210', name:'Federal Income Tax Withheld', type:'Liability', subtype:'Current Liability' },
  { number:'2220', name:'FICA Payable',             type:'Liability', subtype:'Current Liability' },
  { number:'2300', name:'Income Tax Reserve',       type:'Liability', subtype:'Current Liability', system_key:'income_tax_reserve',
    description:'Estimated quarterly income + SE tax (30% of revenue)' },
  { number:'2500', name:'Credit Card Payable',      type:'Liability', subtype:'Current Liability' },
  { number:'2700', name:'Vehicle Loans',            type:'Liability', subtype:'Long-term Liability' },
  { number:'2900', name:'Long-Term Debt',           type:'Liability', subtype:'Long-term Liability' },

  // Equity ─────────────────────────────────────────────────────────
  { number:'3000', name:"Owner's Capital",          type:'Equity' },
  { number:'3100', name:"Owner's Draw",             type:'Equity' },
  { number:'3500', name:'Retained Earnings',        type:'Equity' },

  // Revenue ────────────────────────────────────────────────────────
  { number:'4000', name:'Service Revenue',          type:'Revenue', system_key:'sales',
    description:'Catch-all for paid invoices' },
  { number:'4100', name:'Plumbing Repair Revenue',  type:'Revenue' },
  { number:'4200', name:'Drain & Sewer Revenue',    type:'Revenue' },
  { number:'4300', name:'Installation Revenue',     type:'Revenue' },
  { number:'4400', name:'Restoration Revenue',      type:'Revenue' },
  { number:'4500', name:'Renovation Revenue',       type:'Revenue' },
  { number:'4600', name:'Service Agreement Revenue', type:'Revenue' },
  { number:'4900', name:'Discounts & Refunds',      type:'Revenue', subtype:'Contra Revenue' },

  // COGS ───────────────────────────────────────────────────────────
  { number:'5000', name:'Materials',                type:'COGS', system_key:'cogs_materials' },
  { number:'5100', name:'Subcontractors',           type:'COGS', system_key:'cogs_subcontractors' },
  { number:'5200', name:'Direct Labor — Technicians', type:'COGS', system_key:'cogs_labor' },
  { number:'5300', name:'Burdened Labor (FICA, WC, Benefits)', type:'COGS' },
  { number:'5500', name:'Job Fuel & Travel',        type:'COGS' },
  { number:'5700', name:'Permits & Inspections',    type:'COGS' },

  // Operating Expenses ─────────────────────────────────────────────
  { number:'6000', name:'Office Salaries',          type:'Expense' },
  { number:'6100', name:'Rent — Office/Yard',       type:'Expense' },
  { number:'6200', name:'Utilities',                type:'Expense' },
  { number:'6300', name:'Insurance — General Liability', type:'Expense' },
  { number:'6310', name:'Insurance — Vehicle',      type:'Expense' },
  { number:'6320', name:'Insurance — Workers Comp', type:'Expense' },
  { number:'6400', name:'Office Supplies',          type:'Expense' },
  { number:'6500', name:'Software & Subscriptions', type:'Expense' },
  { number:'6600', name:'Marketing & Advertising',  type:'Expense' },
  { number:'6700', name:'Professional Fees (CPA, Legal)', type:'Expense' },
  { number:'6800', name:'Vehicle Expense — Non-Job', type:'Expense' },
  { number:'6810', name:'Vehicle Repair & Maintenance', type:'Expense' },
  { number:'6820', name:'Vehicle Fuel — Non-Job',   type:'Expense' },
  { number:'6900', name:'Depreciation Expense',     type:'Expense' },
  { number:'7000', name:'Bank Fees',                type:'Expense' },
  { number:'7100', name:'Credit Card Processing Fees', type:'Expense' },
  { number:'7500', name:'Continuing Education & Training', type:'Expense' },
  { number:'7800', name:'Tools & Small Equipment',  type:'Expense' },
  { number:'7900', name:'Other Expense',            type:'Expense' },
];

// ── GET /api/gl-accounts ─────────────────────────────────────────────────────
// Optional ?type=Asset filter, ?include_inactive=1 to show archived rows.
router.get('/', authenticate, async (req, res) => {
  try {
    const { type, include_inactive } = req.query;
    const conds = [];
    const vals  = [];
    if (type)              { vals.push(type); conds.push(`type = $${vals.length}`); }
    if (!include_inactive) { conds.push(`active = TRUE`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await query(`
      SELECT id, number, name, type, subtype, description, parent_id, system_key, active,
             created_at, updated_at
      FROM gl_accounts
      ${where}
      ORDER BY number ASC
    `, vals);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/gl-accounts ────────────────────────────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { number, name, type, subtype, description, parent_id } = req.body;
    if (!number || !name || !type) {
      return res.status(400).json({ error: 'number, name, and type are required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(', ')}` });
    }
    const { rows } = await query(`
      INSERT INTO gl_accounts (number, name, type, subtype, description, parent_id)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [number.trim(), name.trim(), type, subtype || null, description || null, parent_id || null]);
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Account number already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── PUT /api/gl-accounts/:id ─────────────────────────────────────────────────
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { number, name, type, subtype, description, parent_id, active } = req.body;
    if (type && !VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of ${VALID_TYPES.join(', ')}` });
    }
    const { rows } = await query(`
      UPDATE gl_accounts
      SET number      = COALESCE($1, number),
          name        = COALESCE($2, name),
          type        = COALESCE($3, type),
          subtype     = $4,
          description = $5,
          parent_id   = $6,
          active      = COALESCE($7, active),
          updated_at  = NOW()
      WHERE id = $8
      RETURNING *
    `, [
      number?.trim() || null,
      name?.trim()   || null,
      type           || null,
      subtype || null,
      description || null,
      parent_id || null,
      typeof active === 'boolean' ? active : null,
      req.params.id,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
    res.json(rows[0]);
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Account number already exists' });
    res.status(500).json({ error: e.message });
  }
});

// ── DELETE /api/gl-accounts/:id ──────────────────────────────────────────────
// System-keyed accounts cannot be hard-deleted (they're referenced by reports);
// instead they're archived (active=false). Custom accounts are removed outright.
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { rows: existing } = await query('SELECT system_key FROM gl_accounts WHERE id = $1', [req.params.id]);
    if (!existing[0]) return res.status(404).json({ error: 'Account not found' });

    if (existing[0].system_key) {
      await query('UPDATE gl_accounts SET active = FALSE, updated_at = NOW() WHERE id = $1', [req.params.id]);
      return res.json({ ok: true, archived: true });
    }
    await query('DELETE FROM gl_accounts WHERE id = $1', [req.params.id]);
    res.json({ ok: true, deleted: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── POST /api/gl-accounts/seed ───────────────────────────────────────────────
// First-run helper: inserts the default plumbing chart of accounts.
// Idempotent — uses ON CONFLICT(number) DO NOTHING.
router.post('/seed', authenticate, async (req, res) => {
  try {
    let inserted = 0;
    for (const a of DEFAULT_CHART) {
      const r = await query(`
        INSERT INTO gl_accounts (number, name, type, subtype, description, system_key)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (number) DO NOTHING
        RETURNING id
      `, [a.number, a.name, a.type, a.subtype || null, a.description || null, a.system_key || null]);
      if (r.rowCount > 0) inserted++;
    }
    res.json({ ok: true, inserted, total: DEFAULT_CHART.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

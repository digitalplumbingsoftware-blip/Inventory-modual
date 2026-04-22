const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// ── Schema bootstrap ───────────────────────────────────────────
async function ensureTables() {
  await query(`
    CREATE TABLE IF NOT EXISTS fr_engine_settings (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      service TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      tech_wage NUMERIC(10,2) DEFAULT 25.00,
      billable_hrs_yr INT DEFAULT 1500,
      fica_pct NUMERIC(6,4) DEFAULT 0.0765,
      unemployment_pct NUMERIC(6,4) DEFAULT 0.0200,
      workers_comp_pct NUMERIC(6,4) DEFAULT 0.0500,
      fixed_costs JSONB DEFAULT '[]',
      overhead_items JSONB DEFAULT '[]',
      profit_margin NUMERIC(6,4) DEFAULT 0.30,
      mat_markup NUMERIC(6,4) DEFAULT 1.50,
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(service, customer_type)
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fr_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      service TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      name TEXT NOT NULL,
      icon TEXT DEFAULT '',
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fr_tasks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      category_id UUID NOT NULL REFERENCES fr_categories(id) ON DELETE CASCADE,
      service TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      code TEXT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      labor_hours NUMERIC(6,2) DEFAULT 1.00,
      difficulty TEXT DEFAULT 'moderate',
      flat_rate NUMERIC(10,2),
      price_override NUMERIC(10,2),
      notes TEXT DEFAULT '',
      taxable BOOLEAN DEFAULT true,
      active BOOLEAN DEFAULT true,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS materials_library (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      code TEXT UNIQUE,
      name TEXT NOT NULL,
      category TEXT DEFAULT '',
      unit TEXT DEFAULT 'EA',
      national_avg NUMERIC(10,2) DEFAULT 0,
      last_updated TIMESTAMPTZ DEFAULT NOW(),
      active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS fr_task_materials (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      task_id UUID NOT NULL REFERENCES fr_tasks(id) ON DELETE CASCADE,
      material_id UUID NOT NULL REFERENCES materials_library(id) ON DELETE CASCADE,
      qty NUMERIC(8,2) DEFAULT 1,
      UNIQUE(task_id, material_id)
    )
  `);
}

ensureTables().catch(e => console.error("flatrate table init error:", e.message));

// ── Engine helpers ─────────────────────────────────────────────
function computeEngine(s) {
  const wage           = parseFloat(s.tech_wage) || 25;
  const hrs            = Math.max(1, parseInt(s.billable_hrs_yr) || 1500);
  const fica           = parseFloat(s.fica_pct) || 0.0765;
  const unemp          = parseFloat(s.unemployment_pct) || 0.02;
  const wc             = parseFloat(s.workers_comp_pct) || 0.05;
  const fixed          = (s.fixed_costs || []).reduce((a, c) => a + (parseFloat(c.amount) || 0), 0);
  const burdenedWage   = wage * (1 + fica + unemp + wc);
  const burdenedRate   = burdenedWage + (fixed / hrs);
  const annualOverhead = (s.overhead_items || []).reduce((a, c) => a + (parseFloat(c.annual_cost) || 0), 0);
  const overheadPerHr  = annualOverhead / hrs;
  const margin         = Math.min(0.99, parseFloat(s.profit_margin) || 0.30);
  const laborRate      = (burdenedRate + overheadPerHr) / (1 - margin);
  const profitPerHr    = laborRate - burdenedRate - overheadPerHr;
  const matMarkup      = parseFloat(s.mat_markup) || 1.50;
  const dailyRevenue   = laborRate * 8;
  return { burdenedRate, overheadPerHr, laborRate, profitPerHr, matMarkup, dailyRevenue };
}

// ── Engine Settings ────────────────────────────────────────────

// GET /api/flatrate/engine  — list all
router.get("/engine", authenticate, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM fr_engine_settings ORDER BY service, customer_type");
    res.json(rows.map(r => ({ ...r, computed: computeEngine(r) })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/flatrate/engine/:service/:customerType
router.get("/engine/:service/:customerType", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT * FROM fr_engine_settings WHERE service=$1 AND customer_type=$2",
      [req.params.service, req.params.customerType]
    );
    const row = rows[0] || {
      service: req.params.service, customer_type: req.params.customerType,
      tech_wage: 25, billable_hrs_yr: 1500, fica_pct: 0.0765, unemployment_pct: 0.02,
      workers_comp_pct: 0.05, fixed_costs: [], overhead_items: [], profit_margin: 0.30, mat_markup: 1.50
    };
    res.json({ ...row, computed: computeEngine(row) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/flatrate/engine/:service/:customerType
router.put("/engine/:service/:customerType", authenticate, async (req, res) => {
  try {
    const { service, customerType } = req.params;
    const { tech_wage, billable_hrs_yr, fica_pct, unemployment_pct, workers_comp_pct,
            fixed_costs, overhead_items, profit_margin, mat_markup } = req.body;
    const { rows } = await query(`
      INSERT INTO fr_engine_settings
        (service, customer_type, tech_wage, billable_hrs_yr, fica_pct, unemployment_pct,
         workers_comp_pct, fixed_costs, overhead_items, profit_margin, mat_markup, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
      ON CONFLICT(service, customer_type) DO UPDATE SET
        tech_wage=$3, billable_hrs_yr=$4, fica_pct=$5, unemployment_pct=$6,
        workers_comp_pct=$7, fixed_costs=$8, overhead_items=$9,
        profit_margin=$10, mat_markup=$11, updated_at=NOW()
      RETURNING *
    `, [service, customerType,
        tech_wage || 25, billable_hrs_yr || 1500,
        fica_pct || 0.0765, unemployment_pct || 0.02, workers_comp_pct || 0.05,
        JSON.stringify(fixed_costs || []), JSON.stringify(overhead_items || []),
        profit_margin || 0.30, mat_markup || 1.50]);
    const saved = rows[0];
    // Recompute all tasks for this engine
    const { rows: tasks } = await query(
      "SELECT id FROM fr_tasks WHERE service=$1 AND customer_type=$2",
      [service, customerType]
    );
    for (const t of tasks) await recomputeTask(t.id);
    res.json({ ...saved, computed: computeEngine(saved) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── FR Categories ──────────────────────────────────────────────

// GET /api/flatrate/categories?service=plumbing&customer_type=residential
router.get("/categories", authenticate, async (req, res) => {
  try {
    const { service, customer_type } = req.query;
    const conds = []; const vals = [];
    if (service)       { conds.push(`service=$${vals.length+1}`);       vals.push(service); }
    if (customer_type) { conds.push(`customer_type=$${vals.length+1}`); vals.push(customer_type); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const { rows } = await query(
      `SELECT * FROM fr_categories ${where} ORDER BY sort_order, name`, vals
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/categories", authenticate, async (req, res) => {
  try {
    const { service, customer_type, name, icon, sort_order } = req.body;
    const { rows } = await query(`
      INSERT INTO fr_categories (service, customer_type, name, icon, sort_order)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [service, customer_type, name, icon || '', sort_order || 0]);
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/categories/:id", authenticate, async (req, res) => {
  try {
    const { name, icon, sort_order } = req.body;
    const { rows } = await query(`
      UPDATE fr_categories SET name=$1, icon=$2, sort_order=$3 WHERE id=$4 RETURNING *
    `, [name, icon || '', sort_order || 0, req.params.id]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/categories/:id", authenticate, async (req, res) => {
  try {
    await query("DELETE FROM fr_categories WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── FR Tasks ───────────────────────────────────────────────────

// GET /api/flatrate/tasks?service=plumbing&customer_type=residential&category_id=...
router.get("/tasks", authenticate, async (req, res) => {
  try {
    const { service, customer_type, category_id } = req.query;
    const conds = ["t.active = true"]; const vals = [];
    if (service)       { conds.push(`t.service=$${vals.length+1}`);       vals.push(service); }
    if (customer_type) { conds.push(`t.customer_type=$${vals.length+1}`); vals.push(customer_type); }
    if (category_id)   { conds.push(`t.category_id=$${vals.length+1}`);   vals.push(category_id); }
    const { rows } = await query(`
      SELECT t.*, c.name as category_name,
        COALESCE(json_agg(json_build_object(
          'id', tm.id, 'material_id', tm.material_id, 'qty', tm.qty,
          'material_name', m.name, 'unit', m.unit, 'national_avg', m.national_avg
        )) FILTER (WHERE tm.id IS NOT NULL), '[]') as materials
      FROM fr_tasks t
      LEFT JOIN fr_categories c ON c.id = t.category_id
      LEFT JOIN fr_task_materials tm ON tm.task_id = t.id
      LEFT JOIN materials_library m ON m.id = tm.material_id
      WHERE ${conds.join(" AND ")}
      GROUP BY t.id, c.name
      ORDER BY t.sort_order, t.name
    `, vals);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/tasks", authenticate, async (req, res) => {
  try {
    const { category_id, service, customer_type, code, name, description, labor_hours,
            difficulty, price_override, notes, taxable, sort_order, materials = [] } = req.body;
    const { rows } = await query(`
      INSERT INTO fr_tasks
        (category_id, service, customer_type, code, name, description, labor_hours,
         difficulty, price_override, notes, taxable, sort_order)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [category_id, service, customer_type, code || '', name, description || '',
        labor_hours || 1, difficulty || 'moderate', price_override || null,
        notes || '', taxable !== false, sort_order || 0]);
    const task = rows[0];
    for (const m of materials) {
      await query(
        "INSERT INTO fr_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING",
        [task.id, m.material_id, m.qty || 1]
      );
    }
    await recomputeTask(task.id);
    const { rows: [updated] } = await query("SELECT * FROM fr_tasks WHERE id=$1", [task.id]);
    res.status(201).json(updated);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/tasks/:id", authenticate, async (req, res) => {
  try {
    const { category_id, code, name, description, labor_hours, difficulty,
            price_override, notes, taxable, sort_order, active, materials } = req.body;
    await query(`
      UPDATE fr_tasks SET
        category_id=$1, code=$2, name=$3, description=$4, labor_hours=$5,
        difficulty=$6, price_override=$7, notes=$8, taxable=$9, sort_order=$10,
        active=$11, updated_at=NOW()
      WHERE id=$12
    `, [category_id, code || '', name, description || '', labor_hours || 1, difficulty || 'moderate',
        price_override !== undefined ? price_override : null, notes || '',
        taxable !== false, sort_order || 0, active !== false, req.params.id]);
    if (materials !== undefined) {
      await query("DELETE FROM fr_task_materials WHERE task_id=$1", [req.params.id]);
      for (const m of materials) {
        await query(
          "INSERT INTO fr_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)",
          [req.params.id, m.material_id, m.qty || 1]
        );
      }
    }
    await recomputeTask(req.params.id);
    const { rows } = await query(`
      SELECT t.*, c.name as category_name,
        COALESCE(json_agg(json_build_object(
          'id',tm.id,'material_id',tm.material_id,'qty',tm.qty,
          'material_name',m.name,'unit',m.unit,'national_avg',m.national_avg
        )) FILTER (WHERE tm.id IS NOT NULL),'[]') as materials
      FROM fr_tasks t LEFT JOIN fr_categories c ON c.id=t.category_id
      LEFT JOIN fr_task_materials tm ON tm.task_id=t.id
      LEFT JOIN materials_library m ON m.id=tm.material_id
      WHERE t.id=$1 GROUP BY t.id, c.name
    `, [req.params.id]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/tasks/:id", authenticate, async (req, res) => {
  try {
    await query("UPDATE fr_tasks SET active=false WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/flatrate/recalculate  body: { service?, customer_type? }
router.post("/recalculate", authenticate, async (req, res) => {
  try {
    const { service, customer_type } = req.body;
    const conds = []; const vals = [];
    if (service)       { conds.push(`service=$${vals.length+1}`);       vals.push(service); }
    if (customer_type) { conds.push(`customer_type=$${vals.length+1}`); vals.push(customer_type); }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const { rows: tasks } = await query(`SELECT id FROM fr_tasks ${where}`, vals);
    for (const t of tasks) await recomputeTask(t.id);
    res.json({ ok: true, updated: tasks.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Recompute helper ───────────────────────────────────────────
async function recomputeTask(taskId) {
  const { rows: [task] } = await query("SELECT * FROM fr_tasks WHERE id=$1", [taskId]);
  if (!task) return;
  const { rows: [eng] } = await query(
    "SELECT * FROM fr_engine_settings WHERE service=$1 AND customer_type=$2",
    [task.service, task.customer_type]
  );
  if (!eng) return;
  const { laborRate, matMarkup } = computeEngine(eng);
  const { rows: mats } = await query(`
    SELECT tm.qty, m.national_avg
    FROM fr_task_materials tm
    JOIN materials_library m ON m.id = tm.material_id
    WHERE tm.task_id = $1
  `, [taskId]);
  const matCost = mats.reduce((sum, m) => sum + (parseFloat(m.qty) * parseFloat(m.national_avg)), 0);
  const flatRate = (task.price_override != null)
    ? parseFloat(task.price_override)
    : (parseFloat(task.labor_hours) * laborRate) + (matCost * matMarkup);
  await query("UPDATE fr_tasks SET flat_rate=$1, updated_at=NOW() WHERE id=$2", [flatRate.toFixed(2), taskId]);
}

// ── Materials Library ──────────────────────────────────────────

// GET /api/flatrate/materials?q=...&category=...
router.get("/materials", authenticate, async (req, res) => {
  try {
    const { q, category } = req.query;
    const conds = ["active = true"]; const vals = [];
    if (q) {
      conds.push(`(name ILIKE $${vals.length+1} OR code ILIKE $${vals.length+1})`);
      vals.push(`%${q}%`);
    }
    if (category) { conds.push(`category=$${vals.length+1}`); vals.push(category); }
    const { rows } = await query(
      `SELECT * FROM materials_library WHERE ${conds.join(" AND ")} ORDER BY category, name`,
      vals
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post("/materials", authenticate, async (req, res) => {
  try {
    const { code, name, category, unit, national_avg } = req.body;
    const { rows } = await query(`
      INSERT INTO materials_library (code, name, category, unit, national_avg)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [code || null, name, category || '', unit || 'EA', national_avg || 0]);
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put("/materials/:id", authenticate, async (req, res) => {
  try {
    const { code, name, category, unit, national_avg, active } = req.body;
    const { rows } = await query(`
      UPDATE materials_library SET code=$1, name=$2, category=$3, unit=$4,
        national_avg=$5, active=$6, last_updated=NOW()
      WHERE id=$7 RETURNING *
    `, [code || null, name, category || '', unit || 'EA', national_avg || 0, active !== false, req.params.id]);
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete("/materials/:id", authenticate, async (req, res) => {
  try {
    await query("UPDATE materials_library SET active=false WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/flatrate/materials/update-prices  body: { items: [{code, national_avg}] }
router.post("/materials/update-prices", authenticate, async (req, res) => {
  try {
    const { items = [] } = req.body;
    let updated = 0;
    for (const item of items) {
      const r = await query(
        "UPDATE materials_library SET national_avg=$1, last_updated=NOW() WHERE code=$2",
        [item.national_avg, item.code]
      );
      updated += r.rowCount;
    }
    res.json({ ok: true, updated });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET material categories distinct list
router.get("/material-categories", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      "SELECT DISTINCT category FROM materials_library WHERE active=true AND category != '' ORDER BY category"
    );
    res.json(rows.map(r => r.category));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

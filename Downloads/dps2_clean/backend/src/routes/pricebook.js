const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ── Engine ────────────────────────────────────────────────────────────────
// Fields mirror the HTML engine exactly (do NOT change the formula).
const ENGINE_FIELDS = [
  'wage','hrs','fica','unemp','wc','health','vehicle','fuel','tools',
  'uniform','phone','num_techs','oh_hrs','profit','misc','warranty',
  'matmarkup','sub_gp',
];

const ENGINE_DEFAULTS = {
  wage: 28, hrs: 1600, fica: 7.65, unemp: 2.5, wc: 8,
  health: 0, vehicle: 0, fuel: 0, tools: 0, uniform: 0, phone: 0,
  num_techs: 1, oh_hrs: 1600, profit: 20, misc: 8, warranty: 3, matmarkup: 0,
  // Subcontractor gross profit margin (price = sub_cost / (1 - sub_gp/100)).
  sub_gp: 65,
  oh_items: [
    { name: 'Office / Rent',          monthly: 500 },
    { name: 'Business Insurance',     monthly: 300 },
    { name: 'Phone / Internet',       monthly: 150 },
    { name: 'Software / CRM',         monthly: 120 },
    { name: 'Advertising / Marketing',monthly: 400 },
    { name: 'Accounting / Legal',     monthly: 150 },
    { name: 'Office Supplies',        monthly: 75  },
    { name: 'Continuing Education',   monthly: 50  },
    { name: 'Licensing & Permits',    monthly: 40  },
    { name: 'Uniforms / Branding',    monthly: 60  },
  ],
};

// Normalize (service, service_type) — both default to plumbing/service.
function normST(input = {}) {
  const service      = String(input.service      || 'plumbing').toLowerCase();
  const service_type = String(input.service_type || 'service').toLowerCase();
  return { service, service_type };
}

// GET /api/pricebook/engine?service=plumbing
// One engine per service (shared across all sub-books). The service_type param
// is accepted for backward compatibility but ignored — we always return the
// canonical row (service_type='service'), falling back to any row for the service.
router.get('/engine', authenticate, async (req, res) => {
  try {
    const { service, service_type } = normST(req.query);
    const { rows } = await query(
      `SELECT * FROM pb_engine
        WHERE service = $1
        ORDER BY CASE WHEN service_type='service' THEN 0 ELSE 1 END, updated_at DESC
        LIMIT 1`,
      [service]
    );
    if (!rows.length) return res.json({ ...ENGINE_DEFAULTS, service, service_type });
    const r = rows[0];
    res.json({
      service: r.service,
      service_type: r.service_type,
      wage: r.wage, hrs: r.hrs, fica: r.fica, unemp: r.unemp, wc: r.wc,
      health: r.health, vehicle: r.vehicle, fuel: r.fuel, tools: r.tools,
      uniform: r.uniform, phone: r.phone,
      num_techs: r.num_techs, oh_hrs: r.oh_hrs,
      profit: r.profit, misc: r.misc, warranty: r.warranty, matmarkup: r.matmarkup,
      sub_gp: r.sub_gp != null ? r.sub_gp : 65,
      oh_items: Array.isArray(r.oh_items) ? r.oh_items : (r.oh_items || []),
      updated_at: r.updated_at,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/pricebook/engine  (body: { service, wage, hrs, ... })
// One engine per service. Always writes to the canonical row (service_type='service')
// AND mirrors the same values into any legacy sub-book rows so old reads stay consistent.
router.put('/engine', authenticate, async (req, res) => {
  try {
    const { service } = normST(req.body);
    const vals = ENGINE_FIELDS.map(k =>
      req.body[k] !== undefined ? req.body[k] : ENGINE_DEFAULTS[k]
    );
    const ohItems = Array.isArray(req.body.oh_items)
      ? req.body.oh_items
      : ENGINE_DEFAULTS.oh_items;

    // Upsert the canonical row (service, 'service').
    const { rows } = await query(
      `INSERT INTO pb_engine
         (service, service_type, wage, hrs, fica, unemp, wc, health, vehicle, fuel, tools,
          uniform, phone, num_techs, oh_hrs, profit, misc, warranty, matmarkup, sub_gp,
          oh_items, updated_at)
       VALUES ($1,'service',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
               $20::jsonb, NOW())
       ON CONFLICT (service, service_type) DO UPDATE SET
         wage=$2, hrs=$3, fica=$4, unemp=$5, wc=$6, health=$7, vehicle=$8,
         fuel=$9, tools=$10, uniform=$11, phone=$12, num_techs=$13, oh_hrs=$14,
         profit=$15, misc=$16, warranty=$17, matmarkup=$18, sub_gp=$19,
         oh_items=$20::jsonb, updated_at=NOW()
       RETURNING *`,
      [service, ...vals, JSON.stringify(ohItems)]
    );

    // Mirror the same values to any legacy (service, non-'service') rows so
    // any code path that still queries by sub-book stays in sync.
    await query(
      `UPDATE pb_engine
          SET wage=$2, hrs=$3, fica=$4, unemp=$5, wc=$6, health=$7, vehicle=$8,
              fuel=$9, tools=$10, uniform=$11, phone=$12, num_techs=$13, oh_hrs=$14,
              profit=$15, misc=$16, warranty=$17, matmarkup=$18, sub_gp=$19,
              oh_items=$20::jsonb, updated_at=NOW()
        WHERE service=$1 AND service_type<>'service'`,
      [service, ...vals, JSON.stringify(ohItems)]
    ).catch(() => {});
    const r = rows[0];
    res.json({
      ...r,
      oh_items: Array.isArray(r.oh_items) ? r.oh_items : (r.oh_items || []),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pricebook/materials
router.get('/materials', authenticate, async (req, res) => {
  try {
    const { service } = req.query;
    const where = service ? `WHERE service = $1` : '';
    const params = service ? [service] : [];
    const { rows } = await query(
      `SELECT * FROM pb_materials ${where} ORDER BY category, description`,
      params
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pricebook/materials — create a new material
router.post('/materials', authenticate, async (req, res) => {
  try {
    const { description, unit = 'EA', cost = 0, category = 'General', service = 'plumbing' } = req.body;
    if (!description) return res.status(400).json({ error: 'description required' });
    // Auto-generate next M-code
    const { rows: [{ max_id }] } = await query(
      `SELECT MAX(NULLIF(regexp_replace(id, '[^0-9]', '', 'g'), ''))::int AS max_id FROM pb_materials WHERE id ~ '^M[0-9]+'`
    );
    const nextNum = (max_id || 0) + 1;
    const newId = `M${String(nextNum).padStart(3, '0')}`;
    const { rows } = await query(
      `INSERT INTO pb_materials (id, description, unit, cost, category, service) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [newId, description, unit, parseFloat(cost) || 0, category, service]
    );
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/pricebook/materials/:id — update cost (and optionally category)
router.put('/materials/:id', authenticate, async (req, res) => {
  try {
    const { cost, category, description, unit, service } = req.body;
    const fields = [];
    const vals  = [];
    if (cost        !== undefined) { vals.push(parseFloat(cost) || 0);  fields.push(`cost=$${vals.length}`); }
    if (category    !== undefined) { vals.push(category);               fields.push(`category=$${vals.length}`); }
    if (description !== undefined) { vals.push(description);            fields.push(`description=$${vals.length}`); }
    if (unit        !== undefined) { vals.push(unit);                   fields.push(`unit=$${vals.length}`); }
    if (service     !== undefined) { vals.push(service);                fields.push(`service=$${vals.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE pb_materials SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`,
      vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Material not found' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pricebook/categories?service=hvac&service_type=install
// Returns the category tree scoped to the (service, service_type) pricebook.
router.get('/categories', authenticate, async (req, res) => {
  try {
    const { service, service_type } = normST(req.query);
    const { rows: cats } = await query(
      `SELECT * FROM pb_categories
        WHERE service = $1 AND service_type = $2
        ORDER BY sort_order, id`,
      [service, service_type]
    );
    const { rows: counts } = await query(
      `SELECT category_id, COUNT(*)::int AS task_count
         FROM pb_tasks
        WHERE service = $1 AND service_type = $2
        GROUP BY category_id`,
      [service, service_type]
    );
    const cmap = Object.fromEntries(counts.map(c => [c.category_id, c.task_count]));
    res.json(cats.map(c => ({ ...c, task_count: cmap[c.id] || 0 })));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pricebook/categories — create a new category or subcategory
// Body: { id?, name, icon?, color?, parent_id?, service?, service_type? }
// If id is omitted we derive a slug from name (lowercase, non-alnum → underscore).
router.post('/categories', authenticate, async (req, res) => {
  try {
    const { service, service_type } = normST(req.body);
    const { name, icon = '📦', color, parent_id } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

    let id = (req.body.id || name)
      .toString().toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    if (!id) id = 'cat_' + Math.random().toString(36).slice(2, 8);
    // Ensure uniqueness within (service, service_type) — append suffix if taken.
    const { rows: existing } = await query(
      `SELECT id FROM pb_categories WHERE service=$1 AND service_type=$2 AND id LIKE $3`,
      [service, service_type, id + '%']
    );
    if (existing.some(r => r.id === id)) {
      let n = 2;
      while (existing.some(r => r.id === `${id}_${n}`)) n++;
      id = `${id}_${n}`;
    }

    const { rows: [{ next_order }] } = await query(
      `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM pb_categories WHERE service=$1 AND service_type=$2`,
      [service, service_type]
    );
    const resolvedColor = color || '#4A4A6A';
    const { rows } = await query(
      `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type, parent_id)
       VALUES ($1,$2,$3,$4,'',$5,$6,$7,$8) RETURNING *`,
      [id, icon, name.trim(), resolvedColor, next_order, service, service_type, parent_id || null]
    );
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/pricebook/tasks — create a new task under a category
// Body: { category_id, name, tag?, hours?, time_range?, difficulty?, notes?, description?, sub_cost?, service?, service_type? }
router.post('/tasks', authenticate, async (req, res) => {
  try {
    const { service, service_type } = normST(req.body);
    const {
      category_id, name, tag = '', hours = 0, time_range = '',
      difficulty = 'Moderate', notes = '', description = '', sub_cost = 0,
    } = req.body;
    if (!category_id) return res.status(400).json({ error: 'category_id required' });
    if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

    const { rows } = await query(
      `INSERT INTO pb_tasks (category_id, name, tag, hours, time_range, difficulty, notes, description, service, service_type, sub_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [category_id, name.trim(), tag, parseFloat(hours) || 0, time_range,
       difficulty, notes, description, service, service_type, parseFloat(sub_cost) || 0]
    );
    res.status(201).json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pricebook/tasks?service=hvac&service_type=install&category=ac&search=tank&tag=A/C+Install
router.get('/tasks', authenticate, async (req, res) => {
  try {
    const { service, service_type } = normST(req.query);
    const { category, search, tag } = req.query;
    const params = [service, service_type];
    const wheres = [`t.service = $1`, `t.service_type = $2`];

    if (category) { params.push(category); wheres.push(`t.category_id = $${params.length}`); }
    if (tag)      { params.push(tag);      wheres.push(`t.tag = $${params.length}`); }
    if (search) {
      params.push(`%${search}%`);
      wheres.push(`(t.name ILIKE $${params.length} OR t.tag ILIKE $${params.length} OR t.notes ILIKE $${params.length} OR t.description ILIKE $${params.length})`);
    }

    const where = 'WHERE ' + wheres.join(' AND ');

    const { rows: tasks } = await query(
      `SELECT t.id, t.category_id, t.name, t.tag, t.hours, t.time_range,
              t.difficulty, t.notes, t.description, t.sub_cost
       FROM pb_tasks t ${where} ORDER BY t.id`,
      params
    );

    if (!tasks.length) return res.json([]);

    const taskIds = tasks.map(t => t.id);
    const { rows: mats } = await query(
      `SELECT tm.task_id, tm.material_id, tm.qty, m.description, m.unit, m.cost
       FROM pb_task_materials tm
       JOIN pb_materials m ON m.id = tm.material_id
       WHERE tm.task_id = ANY($1)`,
      [taskIds]
    );

    const matsByTask = {};
    for (const m of mats) {
      if (!matsByTask[m.task_id]) matsByTask[m.task_id] = [];
      matsByTask[m.task_id].push(m);
    }

    const result = tasks.map(t => ({ ...t, materials: matsByTask[t.id] || [] }));
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/pricebook/tasks/:id — update hours, difficulty, description, notes, name, time_range
router.patch('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { hours, difficulty, description, notes, name, time_range, sub_cost } = req.body;
    const fields = [], vals = [];
    if (hours       !== undefined) { vals.push(parseFloat(hours) || 0); fields.push(`hours=$${vals.length}`); }
    if (difficulty  !== undefined) { vals.push(difficulty);             fields.push(`difficulty=$${vals.length}`); }
    if (description !== undefined) { vals.push(description);           fields.push(`description=$${vals.length}`); }
    if (notes       !== undefined) { vals.push(notes);                 fields.push(`notes=$${vals.length}`); }
    if (name        !== undefined) { vals.push(name);                  fields.push(`name=$${vals.length}`); }
    if (time_range  !== undefined) { vals.push(time_range);            fields.push(`time_range=$${vals.length}`); }
    if (sub_cost    !== undefined) { vals.push(parseFloat(sub_cost) || 0); fields.push(`sub_cost=$${vals.length}`); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });
    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE pb_tasks SET ${fields.join(',')} WHERE id=$${vals.length} RETURNING *`, vals
    );
    if (!rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/pricebook/tasks/:id/materials — replace full material list for a task
router.put('/tasks/:id/materials', authenticate, async (req, res) => {
  try {
    const taskId = parseInt(req.params.id, 10);
    const materials = Array.isArray(req.body.materials) ? req.body.materials : [];
    // Replace all
    await query('DELETE FROM pb_task_materials WHERE task_id=$1', [taskId]);
    for (const m of materials) {
      if (!m.material_id) continue;
      await query(
        'INSERT INTO pb_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)',
        [taskId, m.material_id, parseFloat(m.qty) || 1]
      );
    }
    // Return fresh material list with costs
    const { rows: mats } = await query(
      `SELECT tm.material_id, tm.qty, m.description, m.unit, m.cost
       FROM pb_task_materials tm
       JOIN pb_materials m ON m.id = tm.material_id
       WHERE tm.task_id = $1`,
      [taskId]
    );
    res.json({ materials: mats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/pricebook/tasks/:id
router.get('/tasks/:id', authenticate, async (req, res) => {
  try {
    const { rows: tasks } = await query(
      'SELECT * FROM pb_tasks WHERE id = $1', [req.params.id]
    );
    if (!tasks.length) return res.status(404).json({ error: 'Task not found' });

    const { rows: mats } = await query(
      `SELECT tm.material_id, tm.qty, m.description, m.unit, m.cost
       FROM pb_task_materials tm
       JOIN pb_materials m ON m.id = tm.material_id
       WHERE tm.task_id = $1`,
      [req.params.id]
    );

    res.json({ ...tasks[0], materials: mats });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

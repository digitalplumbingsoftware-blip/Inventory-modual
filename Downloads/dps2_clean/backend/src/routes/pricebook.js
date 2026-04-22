const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ─── GET /api/pricebook ──────────────────────────────────────
// Returns all categories with nested items
// Optional: ?pricebook=residential|commercial|all (default: all)
// Optional: ?search=term (searches name + description)
router.get('/', authenticate, async (req, res) => {
  try {
    const { pricebook = 'all', search } = req.query;

    let categoryWhere = '';
    let itemWhere = 'pi.active = true';
    const params = [];

    if (pricebook !== 'all') {
      params.push(pricebook);
      categoryWhere = `WHERE pc.pricebook = $${params.length}`;
      itemWhere += ` AND pc.pricebook = $${params.length}`;
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      itemWhere += ` AND (pi.name ILIKE $${idx} OR pi.description ILIKE $${idx} OR pi.code ILIKE $${idx})`;
    }

    // Get categories
    const catResult = await query(
      `SELECT id, name, pricebook, sort_order
       FROM pricebook_categories pc
       ${categoryWhere}
       ORDER BY pc.pricebook, pc.sort_order, pc.name`,
      params.filter((_, i) => !search || i < params.length - 1)
    );

    // Get all matching items
    const itemResult = await query(
      `SELECT pi.id, pi.category_id, pi.code, pi.name, pi.description,
              pi.labor_hours, pi.mat_code,
              pi.price_good, pi.price_better, pi.price_best,
              pi.price_premium, pi.price_elite,
              pi.warranty_t1_t2, pi.warranty_t3_t5,
              pi.taxable, pi.customer_supplied, pi.sort_order,
              pc.pricebook
       FROM pricebook_items pi
       JOIN pricebook_categories pc ON pi.category_id = pc.id
       WHERE ${itemWhere}
       ORDER BY pi.sort_order`,
      params
    );

    // Nest items under categories
    const catMap = {};
    catResult.rows.forEach(cat => {
      catMap[cat.id] = { ...cat, items: [] };
    });

    itemResult.rows.forEach(item => {
      if (catMap[item.category_id]) {
        catMap[item.category_id].items.push(item);
      }
    });

    // If searching, only return categories that have results
    const categories = Object.values(catMap).filter(
      cat => !search || cat.items.length > 0
    );

    res.json({ categories });
  } catch (err) {
    console.error('pricebook GET /', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/pricebook/settings ────────────────────────────
router.get('/settings', authenticate, async (req, res) => {
  try {
    const result = await query('SELECT id, value, label FROM pricebook_settings ORDER BY id');
    const settings = {};
    result.rows.forEach(r => { settings[r.id] = { value: parseFloat(r.value), label: r.label }; });
    res.json({ settings });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── PUT /api/pricebook/settings (admin only) ───────────────
router.put('/settings', authenticate, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const { settings } = req.body;
    for (const [id, value] of Object.entries(settings)) {
      await query('UPDATE pricebook_settings SET value = $1, updated_at = NOW() WHERE id = $2', [value, id]);
    }
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── POST /api/pricebook/recalculate (admin only) ───────────
router.post('/recalculate', authenticate, async (req, res) => {
  try {
    if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    const sr = await query('SELECT id, value FROM pricebook_settings');
    const s = {};
    sr.rows.forEach(r => { s[r.id] = parseFloat(r.value); });
    const laborRate = s.base_labor_rate || 95;
    const tiers = [s.tier1_multiplier||1.00, s.tier2_multiplier||1.18, s.tier3_multiplier||1.38, s.tier4_multiplier||1.60, s.tier5_multiplier||1.85];
    const items = await query('SELECT id, labor_hours FROM pricebook_items WHERE customer_supplied = false');
    for (const item of items.rows) {
      const base = parseFloat(item.labor_hours) * laborRate;
      await query(
        'UPDATE pricebook_items SET price_good=$1,price_better=$2,price_best=$3,price_premium=$4,price_elite=$5,updated_at=NOW() WHERE id=$6',
        tiers.map(t => Math.round(base*t*100)/100).concat([item.id])
      );
    }
    res.json({ ok: true, updated: items.rows.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── GET /api/pricebook/items ────────────────────────────────
// Flat list — used by mobile pricebook picker and estimate builder
// Optional: ?pricebook=residential|commercial|all
// Optional: ?search=term
// Optional: ?category=category_name
router.get('/items', authenticate, async (req, res) => {
  try {
    const { pricebook = 'all', search, category } = req.query;
    const params = [];
    const conditions = ['pi.active = true'];

    if (pricebook !== 'all') {
      params.push(pricebook);
      conditions.push(`pc.pricebook = $${params.length}`);
    }

    if (search) {
      params.push(`%${search}%`);
      const idx = params.length;
      conditions.push(`(pi.name ILIKE $${idx} OR pi.description ILIKE $${idx} OR pi.code ILIKE $${idx})`);
    }

    if (category) {
      params.push(category);
      conditions.push(`pc.name = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await query(
      `SELECT pi.id, pi.code, pi.name, pi.description,
              pi.labor_hours, pi.mat_code,
              pi.price_good, pi.price_better, pi.price_best,
              pi.price_premium, pi.price_elite,
              pi.warranty_t1_t2, pi.warranty_t3_t5,
              pi.taxable, pi.customer_supplied,
              pc.name AS category, pc.pricebook
       FROM pricebook_items pi
       JOIN pricebook_categories pc ON pi.category_id = pc.id
       ${where}
       ORDER BY pc.sort_order, pi.sort_order`,
      params
    );

    res.json({ items: result.rows });
  } catch (err) {
    console.error('pricebook GET /items', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/pricebook/categories ──────────────────────────
// Just the category list (no items) — for filter UI
router.get('/categories', authenticate, async (req, res) => {
  try {
    const { pricebook = 'all' } = req.query;
    const params = [];
    let where = '';

    if (pricebook !== 'all') {
      params.push(pricebook);
      where = `WHERE pricebook = $1`;
    }

    const result = await query(
      `SELECT id, name, pricebook, sort_order,
              (SELECT COUNT(*) FROM pricebook_items pi WHERE pi.category_id = pc.id AND pi.active = true) AS item_count
       FROM pricebook_categories pc
       ${where}
       ORDER BY pricebook, sort_order`,
      params
    );

    res.json({ categories: result.rows });
  } catch (err) {
    console.error('pricebook GET /categories', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/pricebook/items/:id ───────────────────────────
// Single item detail
router.get('/items/:id', authenticate, async (req, res) => {
  try {
    const result = await query(
      `SELECT pi.*, pc.name AS category, pc.pricebook
       FROM pricebook_items pi
       JOIN pricebook_categories pc ON pi.category_id = pc.id
       WHERE pi.id = $1`,
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Item not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

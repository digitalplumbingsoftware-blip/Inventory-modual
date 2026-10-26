const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const https = require('https');
const http = require('http');

// ── Helpers ───────────────────────────────────────────────────────────────────

function toCSV(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';
  const escape = v => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = columns.join(',');
  const body = rows.map(r => columns.map(c => escape(r[c])).join(',')).join('\n');
  return header + '\n' + body;
}

function sendCSV(res, filename, csv) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

// Fetch a remote URL (used for Google Sheets published CSV)
function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;
    mod.get(url, res => {
      // Follow one redirect (Google Sheets does this)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchUrl(res.headers.location).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

// Parse CSV text → array of objects
function parseCSV(text) {
  const lines = text.trim().split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase().replace(/\s+/g, '_'));
  return lines.slice(1).map(line => {
    // Handle quoted fields
    const vals = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    vals.push(cur.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] !== undefined ? vals[i].replace(/^"|"$/g, '') : ''; });
    return obj;
  });
}

// ── EXPORTS ───────────────────────────────────────────────────────────────────

// GET /api/import-export/export/customers
router.get('/export/customers', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id,
             first_name, last_name,
             TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')) AS full_name,
             phone, phone2, email, business_name, contact_name,
             customer_type, notes, marketing_src, created_at
      FROM customers ORDER BY last_name, first_name
    `);
    sendCSV(res, 'dps-customers.csv', toCSV(rows, [
      'id','first_name','last_name','full_name','phone','phone2','email',
      'business_name','contact_name','customer_type','notes','marketing_src','created_at'
    ]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/import-export/export/jobs
router.get('/export/jobs', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT j.id, j.job_number,
             TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS customer_name,
             c.phone AS customer_phone,
             a.street AS address, a.city, a.state, a.zip,
             j.status, j.job_type, j.arrival_window,
             COALESCE(e.name,'') AS technician,
             j.notes, j.scheduled_start, j.created_at
      FROM jobs j
      LEFT JOIN customers c ON c.id = j.customer_id
      LEFT JOIN addresses a ON a.id = j.address_id
      LEFT JOIN employees e ON e.id = j.technician_id
      ORDER BY j.created_at DESC
    `);
    sendCSV(res, 'dps-jobs.csv', toCSV(rows, [
      'id','job_number','customer_name','customer_phone','address','city','state','zip',
      'status','job_type','arrival_window','technician','notes','scheduled_start','created_at'
    ]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/import-export/export/invoices
router.get('/export/invoices', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT i.id, i.invoice_number,
             TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')) AS customer_name,
             i.status, i.subtotal, i.tax_amount AS tax, i.total,
             i.amount_paid, (i.total - COALESCE(i.amount_paid,0)) AS balance,
             i.due_date, i.created_at
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      ORDER BY i.created_at DESC
    `);
    sendCSV(res, 'dps-invoices.csv', toCSV(rows, [
      'id','invoice_number','customer_name','status','subtotal','tax','total','amount_paid','balance','due_date','created_at'
    ]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/import-export/export/pricebook
// One row per task-material pair so every job's material list is visible.
// Tasks with no materials still appear as one row (material columns blank).
router.get('/export/pricebook', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        t.id              AS task_id,
        COALESCE(cat.name, '')  AS category,
        t.name            AS task_name,
        t.tag,
        t.hours,
        t.time_range,
        t.difficulty,
        t.description     AS task_description,
        t.notes,
        COALESCE(m.id, '')          AS material_id,
        COALESCE(m.description, '') AS material_description,
        COALESCE(m.unit, '')        AS material_unit,
        COALESCE(m.cost, 0)         AS material_unit_cost,
        COALESCE(tm.qty,  0)        AS material_qty,
        ROUND(COALESCE(m.cost,0) * COALESCE(tm.qty,0), 2) AS material_line_cost
      FROM pb_tasks t
      LEFT JOIN pb_categories cat ON cat.id = t.category_id
      LEFT JOIN pb_task_materials tm ON tm.task_id = t.id
      LEFT JOIN pb_materials m ON m.id = tm.material_id
      ORDER BY t.category_id, t.id, m.description
    `);
    sendCSV(res, 'dps-pricebook.csv', toCSV(rows, [
      'task_id','category','task_name','tag','hours','time_range','difficulty','task_description','notes',
      'material_id','material_description','material_unit','material_unit_cost','material_qty','material_line_cost'
    ]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/import-export/export/materials
router.get('/export/materials', authenticate, async (req, res) => {
  try {
    const { service } = req.query;
    const where = service ? `WHERE service = $1` : '';
    const params = service ? [service] : [];
    const { rows } = await query(
      `SELECT id, description, unit, cost, category, service FROM pb_materials ${where} ORDER BY category, description`,
      params
    );
    sendCSV(res, `dps-materials${service ? '-' + service : ''}.csv`, toCSV(rows, [
      'id','description','unit','cost','category','service'
    ]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/import-export/export/inventory
router.get('/export/inventory', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT i.id, i.sku, i.barcode, i.name, i.category, i.item_type,
             i.min_qty, i.max_qty, i.cost, i.price,
             i.vendor, i.vendor_sku,
             COALESCE(SUM(s.qty), 0) AS qty_on_hand
      FROM inventory_items i
      LEFT JOIN inventory_stock s ON s.item_id = i.id
      GROUP BY i.id ORDER BY i.category, i.name
    `);
    sendCSV(res, 'dps-inventory.csv', toCSV(rows, [
      'id','sku','barcode','name','category','item_type','min_qty','max_qty','cost','price','vendor','vendor_sku','qty_on_hand'
    ]));
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── IMPORTS ───────────────────────────────────────────────────────────────────
// All imports accept { rows: [{...}] } JSON body (pre-parsed on frontend)
// OR { sheetUrl: "..." } to pull from a published Google Sheet CSV

async function getRows(req) {
  if (req.body.sheetUrl) {
    const csv = await fetchUrl(req.body.sheetUrl);
    return parseCSV(csv);
  }
  return Array.isArray(req.body.rows) ? req.body.rows : [];
}

// POST /api/import-export/import/customers
router.post('/import/customers', authenticate, async (req, res) => {
  try {
    const rows = await getRows(req);
    let inserted = 0, updated = 0, skipped = 0;
    for (const r of rows) {
      // Support both "name" (full) and "first_name"/"last_name"
      let firstName = (r.first_name || '').trim();
      let lastName  = (r.last_name  || '').trim();
      if (!firstName && !lastName && r.full_name) {
        const parts = (r.full_name || r.name || '').trim().split(/\s+/);
        firstName = parts[0] || '';
        lastName  = parts.slice(1).join(' ') || '';
      }
      if (!firstName && !lastName) { skipped++; continue; }
      const phone = (r.phone || '').replace(/\D/g, '');
      const { rows: existing } = await query(
        'SELECT id FROM customers WHERE phone=$1 OR (first_name ILIKE $2 AND last_name ILIKE $3)',
        [phone, firstName, lastName]
      );
      if (existing.length) {
        await query(`UPDATE customers SET first_name=$1, last_name=$2, email=$3, phone=$4,
                     business_name=$5, customer_type=$6, notes=$7 WHERE id=$8`,
          [firstName, lastName, r.email||null, phone||null,
           r.business_name||null, r.customer_type||'residential', r.notes||null, existing[0].id]);
        updated++;
      } else {
        await query(`INSERT INTO customers (first_name, last_name, phone, email, business_name, customer_type, notes)
                     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [firstName, lastName, phone||null, r.email||null,
           r.business_name||null, r.customer_type||'residential', r.notes||null]);
        inserted++;
      }
    }
    res.json({ inserted, updated, skipped, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/import-export/import/materials
// Matches by id (M001) or description — updates cost (and category if supplied)
router.post('/import/materials', authenticate, async (req, res) => {
  try {
    const rows = await getRows(req);
    let updated = 0, inserted = 0, skipped = 0;
    for (const r of rows) {
      const desc = (r.description || '').trim();
      const cost = parseFloat(r.cost);
      if (!desc || isNaN(cost)) { skipped++; continue; }
      // Match by ID first, then by description
      const id = (r.id || '').trim().toUpperCase();
      let existing = null;
      if (id) {
        const { rows: byId } = await query('SELECT id FROM pb_materials WHERE id=$1', [id]);
        existing = byId[0];
      }
      if (!existing) {
        const { rows: byDesc } = await query('SELECT id FROM pb_materials WHERE description ILIKE $1', [desc]);
        existing = byDesc[0];
      }
      if (existing) {
        const fields = [`cost=$1`], vals = [cost];
        if (r.category) { vals.push(r.category); fields.push(`category=$${vals.length}`); }
        if (r.unit)     { vals.push(r.unit);     fields.push(`unit=$${vals.length}`); }
        if (r.service)  { vals.push(r.service);  fields.push(`service=$${vals.length}`); }
        vals.push(existing.id);
        await query(`UPDATE pb_materials SET ${fields.join(',')} WHERE id=$${vals.length}`, vals);
        updated++;
      } else {
        // Auto-generate next M-code
        const { rows: [{ max_id }] } = await query(
          `SELECT MAX(NULLIF(regexp_replace(id, '[^0-9]', '', 'g'), ''))::int AS max_id FROM pb_materials WHERE id ~ '^M[0-9]+'`
        );
        const newId = `M${String((max_id || 0) + 1).padStart(3, '0')}`;
        await query(
          `INSERT INTO pb_materials (id, description, unit, cost, category, service) VALUES ($1,$2,$3,$4,$5,$6)`,
          [newId, desc, r.unit||'EA', cost, r.category||'General', (r.service||'plumbing').toLowerCase()]
        );
        inserted++;
      }
    }
    res.json({ updated, inserted, skipped, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/import-export/import/pricebook
// Updates hours, difficulty, description, notes by matching task id or name
router.post('/import/pricebook', authenticate, async (req, res) => {
  try {
    const rows = await getRows(req);
    let updated = 0, skipped = 0;
    for (const r of rows) {
      const id = parseInt(r.id, 10);
      const name = (r.name || '').trim();
      let existing = null;
      if (!isNaN(id)) {
        const { rows: byId } = await query('SELECT id FROM pb_tasks WHERE id=$1', [id]);
        existing = byId[0];
      }
      if (!existing && name) {
        const { rows: byName } = await query('SELECT id FROM pb_tasks WHERE name ILIKE $1', [name]);
        existing = byName[0];
      }
      if (!existing) { skipped++; continue; }
      const fields = [], vals = [];
      if (r.hours      !== undefined && r.hours      !== '') { vals.push(parseFloat(r.hours)||0); fields.push(`hours=$${vals.length}`); }
      if (r.difficulty !== undefined && r.difficulty !== '') { vals.push(r.difficulty);           fields.push(`difficulty=$${vals.length}`); }
      if (r.description!== undefined && r.description!== '') { vals.push(r.description);         fields.push(`description=$${vals.length}`); }
      if (r.notes      !== undefined && r.notes      !== '') { vals.push(r.notes);               fields.push(`notes=$${vals.length}`); }
      if (r.time_range !== undefined && r.time_range !== '') { vals.push(r.time_range);           fields.push(`time_range=$${vals.length}`); }
      if (!fields.length) { skipped++; continue; }
      vals.push(existing.id);
      await query(`UPDATE pb_tasks SET ${fields.join(',')} WHERE id=$${vals.length}`, vals);
      updated++;
    }
    res.json({ updated, skipped, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/import-export/import/pricebook_materials
// Accepts rows from the pricebook export (or a hand-built sheet).
// Columns: task_id (or task_name), material_id (or material_description), material_qty
// Groups rows by task → replaces that task's material list in pb_task_materials.
router.post('/import/pricebook_materials', authenticate, async (req, res) => {
  try {
    const rows = await getRows(req);
    // Group by task
    const byTask = {};
    for (const r of rows) {
      const taskKey = (r.task_id || '').trim() || (r.task_name || '').trim();
      if (!taskKey) continue;
      const matId   = (r.material_id || '').trim().toUpperCase();
      const matDesc = (r.material_description || '').trim();
      const qty     = parseFloat(r.material_qty);
      // rows with no material (blank material_id AND description) just carry task fields
      if (!matId && !matDesc) {
        if (!byTask[taskKey]) byTask[taskKey] = { taskKey, mats: [] };
        continue;
      }
      if (!byTask[taskKey]) byTask[taskKey] = { taskKey, mats: [] };
      byTask[taskKey].mats.push({ matId, matDesc, qty: isNaN(qty) || qty <= 0 ? 1 : qty });
    }

    let tasksUpdated = 0, matsSet = 0, skipped = 0;
    for (const { taskKey, mats } of Object.values(byTask)) {
      // Resolve task
      let task = null;
      const numId = parseInt(taskKey, 10);
      if (!isNaN(numId)) {
        const { rows: r } = await query('SELECT id FROM pb_tasks WHERE id=$1', [numId]);
        task = r[0];
      }
      if (!task) {
        const { rows: r } = await query('SELECT id FROM pb_tasks WHERE name ILIKE $1', [taskKey]);
        task = r[0];
      }
      if (!task) { skipped++; continue; }

      // Resolve each material
      const resolved = [];
      for (const m of mats) {
        let mat = null;
        if (m.matId) {
          const { rows: r } = await query('SELECT id FROM pb_materials WHERE id=$1', [m.matId]);
          mat = r[0];
        }
        if (!mat && m.matDesc) {
          const { rows: r } = await query('SELECT id FROM pb_materials WHERE description ILIKE $1', [m.matDesc]);
          mat = r[0];
        }
        if (mat) resolved.push({ materialId: mat.id, qty: m.qty });
      }

      // Replace task's materials
      await query('DELETE FROM pb_task_materials WHERE task_id=$1', [task.id]);
      for (const { materialId, qty } of resolved) {
        await query(
          'INSERT INTO pb_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)',
          [task.id, materialId, qty]
        );
        matsSet++;
      }
      tasksUpdated++;
    }
    res.json({ tasksUpdated, matsSet, skipped, total: Object.keys(byTask).length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/import-export/import/inventory
// Matches by sku (primary) or name — updates or skips based on dupAction
router.post('/import/inventory', authenticate, async (req, res) => {
  try {
    const rows = await getRows(req);
    const dupAction = req.body.dupAction || 'update'; // 'update' | 'skip'
    let updated = 0, inserted = 0, skipped = 0, duplicates = 0;

    // Strip currency symbols/commas before parsing money values
    const parseMoney = (v) => parseFloat((v||'').toString().replace(/[$,]/g,'')) || 0;

    // Cache of category name → id so we don't hit the DB for every row
    const catCache = {};
    const resolveCategoryId = async (catName) => {
      if (!catName || !catName.trim()) return null;
      const key = catName.trim().toLowerCase();
      if (catCache[key] !== undefined) return catCache[key];
      // Look up existing
      const { rows: found } = await query(
        'SELECT id FROM inventory_categories WHERE LOWER(name)=$1', [key]
      );
      if (found.length) { catCache[key] = found[0].id; return found[0].id; }
      // Auto-create
      const { rows: created } = await query(
        'INSERT INTO inventory_categories (name) VALUES ($1) ON CONFLICT (name) DO UPDATE SET name=EXCLUDED.name RETURNING id',
        [catName.trim()]
      );
      catCache[key] = created[0].id;
      return created[0].id;
    };

    const upsertWarehouseQty = async (itemId, qtyStr) => {
      const qty = parseInt(qtyStr);
      if (isNaN(qty) || qty < 0) return;
      await query(`
        INSERT INTO inventory_stock (item_id, location_id, qty)
        SELECT $1, id, $2 FROM inventory_locations WHERE type='warehouse' ORDER BY name LIMIT 1
        ON CONFLICT (item_id, location_id) DO UPDATE SET qty = $2
      `, [itemId, qty]);
    };

    for (const r of rows) {
      const name = (r.name || '').trim();
      if (!name) { skipped++; continue; }
      const sku = (r.sku || '').trim();

      // Resolve / auto-create the category
      const categoryId = await resolveCategoryId(r.category);

      let existing = null;
      if (sku) {
        const { rows: bySku } = await query('SELECT id FROM inventory_items WHERE sku=$1', [sku]);
        existing = bySku[0];
      }
      if (!existing && name) {
        const { rows: byName } = await query('SELECT id FROM inventory_items WHERE name ILIKE $1', [name]);
        existing = byName[0];
      }

      if (existing) {
        if (dupAction === 'skip') { duplicates++; continue; }
        // build update fields
        const fields = [], vals = [];
        if (r.cost      !== undefined && r.cost      !== '') { vals.push(parseMoney(r.cost));  fields.push(`cost=$${vals.length}`); }
        if (r.price     !== undefined && r.price     !== '') { vals.push(parseMoney(r.price)); fields.push(`price=$${vals.length}`); }
        if (r.min_qty   !== undefined && r.min_qty   !== '') { vals.push(parseInt(r.min_qty)||0); fields.push(`min_qty=$${vals.length}`); }
        if (r.max_qty   !== undefined && r.max_qty   !== '') { vals.push(parseInt(r.max_qty)||0); fields.push(`max_qty=$${vals.length}`); }
        if (r.category  !== undefined && r.category  !== '') { vals.push(r.category);             fields.push(`category=$${vals.length}`); }
        if (categoryId)                                      { vals.push(categoryId);              fields.push(`category_id=$${vals.length}`); }
        if (r.barcode   !== undefined && r.barcode   !== '') { vals.push(r.barcode);               fields.push(`barcode=$${vals.length}`); }
        if (r.vendor    !== undefined && r.vendor    !== '') { vals.push(r.vendor);                fields.push(`vendor=$${vals.length}`); }
        if (r.vendor_sku!== undefined && r.vendor_sku!== '') { vals.push(r.vendor_sku);           fields.push(`vendor_sku=$${vals.length}`); }
        if (r.item_type !== undefined && r.item_type !== '') { vals.push(r.item_type);             fields.push(`item_type=$${vals.length}`); }
        if (fields.length) {
          vals.push(existing.id);
          await query(`UPDATE inventory_items SET ${fields.join(',')} WHERE id=$${vals.length}`, vals);
        }
        await upsertWarehouseQty(existing.id, r.qty_on_hand);
        updated++;
      } else {
        const { rows: newRows } = await query(
          `INSERT INTO inventory_items
             (sku, barcode, name, category, category_id, item_type, min_qty, max_qty, cost, price, vendor, vendor_sku)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
          [sku||null, r.barcode||null, name,
           r.category||'General', categoryId||null,
           r.item_type||'consumable',
           parseInt(r.min_qty)||0, parseInt(r.max_qty)||null,
           parseMoney(r.cost), parseMoney(r.price),
           r.vendor||'', r.vendor_sku||'']
        );
        await upsertWarehouseQty(newRows[0].id, r.qty_on_hand);
        inserted++;
      }
    }
    res.json({ updated, inserted, skipped, duplicates, total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/import-export/fetch-sheet?url=...
// Fetches a published Google Sheets CSV and returns { headers, rows }
router.get('/fetch-sheet', authenticate, async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url required' });
    if (!url.includes('google.com') && !url.includes('docs.google')) {
      return res.status(400).json({ error: 'Only Google Sheets URLs are accepted' });
    }
    const csv = await fetchUrl(url);
    const parsed = parseCSV(csv);
    if (!parsed.length) return res.json({ headers: [], rows: [] });
    res.json({ headers: Object.keys(parsed[0]), rows: parsed, total: parsed.length });
  } catch(e) { res.status(500).json({ error: 'Could not fetch sheet: ' + e.message }); }
});

// GET /api/import-export/preview-csv — parse a CSV sent as text body
router.post('/preview-csv', authenticate, (req, res) => {
  try {
    const text = req.body.csv || '';
    const rows = parseCSV(text);
    res.json({ headers: rows.length ? Object.keys(rows[0]) : [], rows: rows.slice(0, 10), total: rows.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

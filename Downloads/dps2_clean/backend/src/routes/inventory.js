const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// ── Schema migration (idempotent) ─────────────────────────────
async function ensureInventorySchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS inventory_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name TEXT NOT NULL UNIQUE,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  // Add service_type and category_id to items if not present
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS service_type TEXT DEFAULT ''`);
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES inventory_categories(id) ON DELETE SET NULL`);
  // Per-location-type min/max (warehouse vs truck)
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS warehouse_min_qty INT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS warehouse_max_qty INT`);
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS truck_min_qty INT NOT NULL DEFAULT 0`);
  await query(`ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS truck_max_qty INT`);
}
ensureInventorySchema().catch(e => console.error("inventory schema init:", e.message));

// ── INVENTORY CATEGORIES ───────────────────────────────────────

router.get("/categories", authenticate, async (req, res) => {
  try {
    const { rows } = await query("SELECT * FROM inventory_categories ORDER BY sort_order, name");
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/categories", authenticate, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const { rows } = await query(
      "INSERT INTO inventory_categories (name, sort_order) VALUES ($1,$2) RETURNING *",
      [name, sort_order || 0]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/categories/:id", authenticate, async (req, res) => {
  try {
    const { name, sort_order } = req.body;
    const { rows } = await query(
      "UPDATE inventory_categories SET name=$1, sort_order=$2 WHERE id=$3 RETURNING *",
      [name, sort_order || 0, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/categories/:id", authenticate, async (req, res) => {
  try {
    // Unlink items first (SET NULL via FK), then delete
    await query("DELETE FROM inventory_categories WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── ITEMS ──────────────────────────────────────────────────────

router.get("/items", authenticate, async (req, res) => {
  try {
    const { service_type, category_id, barcode } = req.query;
    const conds = ["i.active = true"]; const vals = [];
    if (service_type) { conds.push(`i.service_type=$${vals.length+1}`); vals.push(service_type); }
    if (category_id)  { conds.push(`i.category_id=$${vals.length+1}`);  vals.push(category_id); }
    if (barcode)      { conds.push(`i.barcode=$${vals.length+1}`);       vals.push(barcode); }
    const { rows } = await query(`
      SELECT i.*,
        ic.name as category_name,
        json_agg(json_build_object(
          'location_id', s.location_id,
          'location_name', l.name,
          'location_type', l.type,
          'qty', s.qty
        )) FILTER (WHERE s.item_id IS NOT NULL) as stock
      FROM inventory_items i
      LEFT JOIN inventory_categories ic ON ic.id = i.category_id
      LEFT JOIN inventory_stock s ON s.item_id = i.id
      LEFT JOIN inventory_locations l ON l.id = s.location_id
      WHERE ${conds.join(" AND ")}
      GROUP BY i.id, ic.name
      ORDER BY i.created_at ASC
    `, vals);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/items", authenticate, async (req, res) => {
  try {
    const { sku, name, description, category, category_id, service_type, item_type, cost, price, min_qty, max_qty, vendor, vendor_sku, barcode, warehouse_min_qty, warehouse_max_qty, truck_min_qty, truck_max_qty } = req.body;
    const { rows } = await query(`
      INSERT INTO inventory_items (sku, name, description, category, category_id, service_type, item_type, cost, price, min_qty, max_qty, vendor, vendor_sku, barcode, warehouse_min_qty, warehouse_max_qty, truck_min_qty, truck_max_qty)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *
    `, [sku, name, description||'', category||'', category_id||null, service_type||'', item_type||'consumable', cost||0, price||0, min_qty||0, max_qty||null, vendor||'', vendor_sku||'', barcode||sku,
        parseInt(warehouse_min_qty)||0, warehouse_max_qty?parseInt(warehouse_max_qty):null,
        parseInt(truck_min_qty)||0, truck_max_qty?parseInt(truck_max_qty):null]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/items/:id", authenticate, async (req, res) => {
  try {
    const { sku, name, description, category, category_id, service_type, item_type, cost, price, min_qty, max_qty, vendor, vendor_sku, barcode, warehouse_min_qty, warehouse_max_qty, truck_min_qty, truck_max_qty } = req.body;
    const { rows } = await query(`
      UPDATE inventory_items SET sku=$1,name=$2,description=$3,category=$4,category_id=$5,service_type=$6,item_type=$7,cost=$8,price=$9,min_qty=$10,max_qty=$11,vendor=$12,vendor_sku=$13,barcode=$14,
        warehouse_min_qty=$15,warehouse_max_qty=$16,truck_min_qty=$17,truck_max_qty=$18
      WHERE id=$19 RETURNING *
    `, [sku, name, description||'', category||'', category_id||null, service_type||'', item_type||'consumable', cost||0, price||0, min_qty||0, max_qty||null, vendor||'', vendor_sku||'', barcode||sku,
        parseInt(warehouse_min_qty)||0, warehouse_max_qty?parseInt(warehouse_max_qty):null,
        parseInt(truck_min_qty)||0, truck_max_qty?parseInt(truck_max_qty):null,
        req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/items/:id", authenticate, async (req, res) => {
  try {
    await query("UPDATE inventory_items SET active=false WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LOCATIONS ──────────────────────────────────────────────────

router.get("/locations", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT l.*,
        u.first_name || ' ' || u.last_name as technician_name,
        COUNT(s.item_id) as item_count
      FROM inventory_locations l
      LEFT JOIN users u ON u.id = l.technician_id
      LEFT JOIN inventory_stock s ON s.location_id = l.id
      WHERE l.active = true
      GROUP BY l.id, u.first_name, u.last_name
      ORDER BY l.type, l.name
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/locations", authenticate, async (req, res) => {
  try {
    const { type, name, technician_id } = req.body;
    const { rows } = await query(
      "INSERT INTO inventory_locations (type, name, technician_id) VALUES ($1,$2,$3) RETURNING *",
      [type, name, technician_id||null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/locations/:id", authenticate, async (req, res) => {
  try {
    const { name, technician_id } = req.body;
    const { rows } = await query(
      "UPDATE inventory_locations SET name=$1, technician_id=$2 WHERE id=$3 RETURNING *",
      [name, technician_id||null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET stock for a specific location
router.get("/locations/:id/stock", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT i.*, s.qty,
        CASE WHEN s.qty <= i.min_qty THEN true ELSE false END as is_low
      FROM inventory_stock s
      JOIN inventory_items i ON i.id = s.item_id
      WHERE s.location_id = $1 AND i.active = true
      ORDER BY i.category, i.name
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LOW STOCK ──────────────────────────────────────────────────

router.get("/low-stock", authenticate, async (req, res) => {
  try {
    // Only warehouse stock is checked — trucks/vans are excluded
    const { rows } = await query(`
      SELECT i.id, i.sku, i.name, i.warehouse_min_qty, i.warehouse_max_qty, i.vendor, i.vendor_sku,
        COALESCE(SUM(CASE WHEN l.type = 'warehouse' THEN s.qty ELSE 0 END), 0) AS warehouse_qty
      FROM inventory_items i
      LEFT JOIN inventory_stock s ON s.item_id = i.id
      LEFT JOIN inventory_locations l ON l.id = s.location_id
      WHERE i.active = true
      GROUP BY i.id
      HAVING
        i.warehouse_min_qty > 0
        AND COALESCE(SUM(CASE WHEN l.type = 'warehouse' THEN s.qty ELSE 0 END), 0) <= i.warehouse_min_qty
      ORDER BY COALESCE(SUM(CASE WHEN l.type = 'warehouse' THEN s.qty ELSE 0 END), 0) ASC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STOCK REMOVE (delete item from a location entirely) ────────

router.delete("/stock", authenticate, async (req, res) => {
  try {
    const { item_id, location_id } = req.body;
    if (!item_id || !location_id) return res.status(400).json({ error: "item_id and location_id required" });
    // Log the removal before deleting
    const { rows: cur } = await query(
      "SELECT qty FROM inventory_stock WHERE item_id=$1 AND location_id=$2",
      [item_id, location_id]
    );
    const removedQty = cur[0]?.qty || 0;
    await query(
      "DELETE FROM inventory_stock WHERE item_id=$1 AND location_id=$2",
      [item_id, location_id]
    );
    if (removedQty > 0) {
      await query(`
        INSERT INTO inventory_movements (item_id, from_location, qty, type, notes, created_by)
        VALUES ($1,$2,$3,'adjustment','Removed from location',$4)
      `, [item_id, location_id, removedQty, req.user.id]);
    }
    res.json({ ok: true, removed_qty: removedQty });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── STOCK MOVE ─────────────────────────────────────────────────

router.post("/move", authenticate, async (req, res) => {
  try {
    const { item_id, from_location, to_location, qty, type = "transfer", job_id, notes } = req.body;
    if (from_location) {
      await query(`UPDATE inventory_stock SET qty = qty - $1 WHERE item_id=$2 AND location_id=$3 AND qty >= $1`, [qty, item_id, from_location]);
    }
    if (to_location) {
      await query(`
        INSERT INTO inventory_stock (item_id, location_id, qty) VALUES ($1,$2,$3)
        ON CONFLICT (item_id, location_id) DO UPDATE SET qty = inventory_stock.qty + $3
      `, [item_id, to_location, qty]);
    }
    await query(`
      INSERT INTO inventory_movements (item_id, from_location, to_location, qty, type, job_id, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    `, [item_id, from_location||null, to_location||null, qty, type, job_id||null, notes||'', req.user.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── TRUCK STOCK TEMPLATES ──────────────────────────────────────

router.get("/templates", authenticate, async (req, res) => {
  try {
    const { rows: templates } = await query("SELECT * FROM truck_stock_templates ORDER BY name");
    for (const t of templates) {
      const { rows: items } = await query(`
        SELECT ti.*, i.sku, i.name, i.category, i.item_type, i.cost
        FROM truck_stock_template_items ti
        JOIN inventory_items i ON i.id = ti.item_id
        WHERE ti.template_id = $1
        ORDER BY i.category, i.name
      `, [t.id]);
      t.items = items;
    }
    res.json(templates);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/templates", authenticate, async (req, res) => {
  try {
    const { name, department, description, items = [] } = req.body;
    const { rows } = await query(
      "INSERT INTO truck_stock_templates (name, department, description) VALUES ($1,$2,$3) RETURNING *",
      [name, department||'', description||'']
    );
    const t = rows[0];
    for (const item of items) {
      await query(
        "INSERT INTO truck_stock_template_items (template_id, item_id, min_qty, max_qty) VALUES ($1,$2,$3,$4)",
        [t.id, item.item_id, item.min_qty||1, item.max_qty||null]
      );
    }
    res.status(201).json(t);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/templates/:id", authenticate, async (req, res) => {
  try {
    const { name, department, description, items = [] } = req.body;
    const { rows } = await query(
      "UPDATE truck_stock_templates SET name=$1,department=$2,description=$3,updated_at=NOW() WHERE id=$4 RETURNING *",
      [name, department||'', description||'', req.params.id]
    );
    await query("DELETE FROM truck_stock_template_items WHERE template_id=$1", [req.params.id]);
    for (const item of items) {
      await query(
        "INSERT INTO truck_stock_template_items (template_id, item_id, min_qty, max_qty) VALUES ($1,$2,$3,$4)",
        [req.params.id, item.item_id, item.min_qty||1, item.max_qty||null]
      );
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/templates/:id", authenticate, async (req, res) => {
  try {
    await query("DELETE FROM truck_stock_templates WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Apply template to a location (seeds stock rows at 0 qty if not present)
router.post("/templates/:id/apply", authenticate, async (req, res) => {
  try {
    const { location_id } = req.body;
    const { rows: items } = await query(
      "SELECT * FROM truck_stock_template_items WHERE template_id=$1", [req.params.id]
    );
    for (const item of items) {
      await query(`
        INSERT INTO inventory_stock (item_id, location_id, qty) VALUES ($1,$2,0)
        ON CONFLICT (item_id, location_id) DO NOTHING
      `, [item.item_id, location_id]);
    }
    res.json({ ok: true, applied: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PURCHASE ORDERS ────────────────────────────────────────────

router.get("/purchase-orders", authenticate, async (req, res) => {
  try {
    const { rows: pos } = await query(`
      SELECT po.*, u.first_name || ' ' || u.last_name as created_by_name
      FROM purchase_orders po
      LEFT JOIN users u ON u.id = po.created_by
      ORDER BY po.created_at DESC
    `);
    for (const po of pos) {
      const { rows: items } = await query(`
        SELECT poi.*, i.name as item_name, i.sku
        FROM purchase_order_items poi
        LEFT JOIN inventory_items i ON i.id = poi.item_id
        WHERE poi.po_id = $1
      `, [po.id]);
      po.items = items;
    }
    res.json(pos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/purchase-orders", authenticate, async (req, res) => {
  try {
    const { vendor, notes, items = [], auto_generated = false, job_id } = req.body;
    const { rows } = await query(`
      INSERT INTO purchase_orders (vendor, notes, auto_generated, job_id, created_by)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [vendor||'', notes||'', auto_generated, job_id||null, req.user.id]);
    const po = rows[0];
    for (const item of items) {
      await query(`
        INSERT INTO purchase_order_items (po_id, item_id, description, sku, qty, unit_cost)
        VALUES ($1,$2,$3,$4,$5,$6)
      `, [po.id, item.item_id||null, item.description||item.name||'', item.sku||'', item.qty||1, item.unit_cost||item.cost||0]);
    }
    res.status(201).json(po);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/purchase-orders/:id", authenticate, async (req, res) => {
  try {
    const { status, notes } = req.body;
    const { rows } = await query(
      "UPDATE purchase_orders SET status=$1, notes=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
      [status, notes||'', req.params.id]
    );
    const po = rows[0];
    // When received, add items to warehouse stock
    if (status === 'received') {
      const { rows: poItems } = await query("SELECT * FROM purchase_order_items WHERE po_id=$1", [po.id]);
      const { rows: wh } = await query("SELECT id FROM inventory_locations WHERE type='warehouse' LIMIT 1");
      if (wh[0]) {
        for (const item of poItems) {
          if (item.item_id) {
            await query(`
              INSERT INTO inventory_stock (item_id, location_id, qty) VALUES ($1,$2,$3)
              ON CONFLICT (item_id, location_id) DO UPDATE SET qty = inventory_stock.qty + $3
            `, [item.item_id, wh[0].id, item.qty]);
            await query(`
              INSERT INTO inventory_movements (item_id, to_location, qty, type, notes, created_by)
              VALUES ($1,$2,$3,'receive','Purchase order received',$4)
            `, [item.item_id, wh[0].id, item.qty, req.user.id]);
          }
        }
      }
    }
    res.json(po);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/purchase-orders/:id", authenticate, async (req, res) => {
  try {
    await query("DELETE FROM purchase_order_items WHERE po_id=$1", [req.params.id]);
    await query("DELETE FROM purchase_orders WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Auto-generate POs from low stock items grouped by vendor
// Only considers warehouse locations — trucks/vans are excluded.
// Reorder quantity brings warehouse stock up to warehouse_max_qty.
router.post("/purchase-orders/auto-generate", authenticate, async (req, res) => {
  try {
    const { rows: lowItems } = await query(`
      SELECT i.*,
        COALESCE(SUM(CASE WHEN l.type = 'warehouse' THEN s.qty ELSE 0 END), 0) AS warehouse_qty
      FROM inventory_items i
      LEFT JOIN inventory_stock s ON s.item_id = i.id
      LEFT JOIN inventory_locations l ON l.id = s.location_id
      WHERE i.active = true
      GROUP BY i.id
      HAVING
        i.warehouse_min_qty > 0
        AND COALESCE(SUM(CASE WHEN l.type = 'warehouse' THEN s.qty ELSE 0 END), 0) <= i.warehouse_min_qty
    `);
    if (lowItems.length === 0) return res.json({ created: 0, message: 'No items need reordering' });

    const byVendor = {};
    for (const item of lowItems) {
      const vendor = item.vendor || 'Unknown Vendor';
      if (!byVendor[vendor]) byVendor[vendor] = [];
      byVendor[vendor].push(item);
    }

    const created = [];
    for (const [vendor, items] of Object.entries(byVendor)) {
      const { rows } = await query(`
        INSERT INTO purchase_orders (vendor, notes, auto_generated, created_by)
        VALUES ($1,'Auto-generated from low stock alert (warehouse only)',true,$2) RETURNING *
      `, [vendor, req.user.id]);
      const po = rows[0];
      for (const item of items) {
        // Bring warehouse qty up to warehouse_max; fall back to warehouse_min * 2 if no max set
        const targetQty = item.warehouse_max_qty || (item.warehouse_min_qty * 2) || item.max_qty || (item.min_qty * 2);
        const reorderQty = Math.max(1, targetQty - parseInt(item.warehouse_qty || 0));
        await query(`
          INSERT INTO purchase_order_items (po_id, item_id, description, sku, qty, unit_cost)
          VALUES ($1,$2,$3,$4,$5,$6)
        `, [po.id, item.id, item.name, item.sku, reorderQty, item.cost||0]);
      }
      created.push({ ...po, item_count: items.length });
    }
    res.json({ created: created.length, purchase_orders: created });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── COUNT SCHEDULES ────────────────────────────────────────────

router.get("/count-schedules", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT cs.*,
        l.name as location_name, l.type as location_type,
        u.first_name || ' ' || u.last_name as assigned_name,
        (SELECT MAX(created_at) FROM inventory_counts WHERE schedule_id = cs.id) as last_count,
        (SELECT COUNT(*) FROM inventory_counts WHERE schedule_id = cs.id AND status='completed') as completed_count
      FROM inventory_count_schedules cs
      LEFT JOIN inventory_locations l ON l.id = cs.location_id
      LEFT JOIN users u ON u.id = cs.assigned_to
      ORDER BY cs.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/count-schedules", authenticate, async (req, res) => {
  try {
    const { name, location_id, frequency, day_of_week, day_of_month, assigned_to } = req.body;
    const { rows } = await query(`
      INSERT INTO inventory_count_schedules (name, location_id, frequency, day_of_week, day_of_month, assigned_to)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [name, location_id||null, frequency||'monthly', day_of_week||null, day_of_month||null, assigned_to||null]);
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put("/count-schedules/:id", authenticate, async (req, res) => {
  try {
    const { name, location_id, frequency, day_of_week, day_of_month, assigned_to, active } = req.body;
    const { rows } = await query(`
      UPDATE inventory_count_schedules SET name=$1,location_id=$2,frequency=$3,day_of_week=$4,day_of_month=$5,assigned_to=$6,active=$7
      WHERE id=$8 RETURNING *
    `, [name, location_id||null, frequency, day_of_week||null, day_of_month||null, assigned_to||null, active!==false, req.params.id]);
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete("/count-schedules/:id", authenticate, async (req, res) => {
  try {
    await query("DELETE FROM inventory_count_schedules WHERE id=$1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── INVENTORY COUNTS ───────────────────────────────────────────

router.get("/counts", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT ic.*, l.name as location_name,
        u.first_name || ' ' || u.last_name as counted_by_name,
        cs.name as schedule_name
      FROM inventory_counts ic
      LEFT JOIN inventory_locations l ON l.id = ic.location_id
      LEFT JOIN users u ON u.id = ic.counted_by
      LEFT JOIN inventory_count_schedules cs ON cs.id = ic.schedule_id
      ORDER BY ic.created_at DESC LIMIT 50
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/counts", authenticate, async (req, res) => {
  try {
    const { schedule_id, location_id } = req.body;
    const { rows: stockItems } = await query(`
      SELECT s.item_id, s.qty as expected_qty, i.name, i.sku, i.category
      FROM inventory_stock s
      JOIN inventory_items i ON i.id = s.item_id
      WHERE s.location_id = $1 AND i.active = true
      ORDER BY i.category, i.name
    `, [location_id]);

    const { rows } = await query(`
      INSERT INTO inventory_counts (schedule_id, location_id, status, counted_by)
      VALUES ($1,$2,'in_progress',$3) RETURNING *
    `, [schedule_id||null, location_id, req.user.id]);
    const count = rows[0];

    for (const item of stockItems) {
      await query(`
        INSERT INTO inventory_count_items (count_id, item_id, expected_qty) VALUES ($1,$2,$3)
      `, [count.id, item.item_id, item.expected_qty]);
    }

    count.items = stockItems.map(i => ({ ...i, actual_qty: null }));
    res.status(201).json(count);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/counts/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT ic.*, l.name as location_name
      FROM inventory_counts ic
      LEFT JOIN inventory_locations l ON l.id = ic.location_id
      WHERE ic.id = $1
    `, [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    const count = rows[0];
    const { rows: items } = await query(`
      SELECT ici.*, i.name, i.sku, i.category
      FROM inventory_count_items ici
      JOIN inventory_items i ON i.id = ici.item_id
      WHERE ici.count_id = $1
      ORDER BY i.category, i.name
    `, [req.params.id]);
    count.items = items;
    res.json(count);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch("/counts/:id", authenticate, async (req, res) => {
  try {
    const { status, notes, items } = req.body;

    if (items) {
      for (const item of items) {
        await query("UPDATE inventory_count_items SET actual_qty=$1 WHERE id=$2", [item.actual_qty, item.id]);
      }
    }

    const sets = ["status=$1", "notes=$2"];
    const vals = [status, notes||''];
    if (status === 'completed') {
      sets.push("completed_at=NOW()");
      // Apply variances to stock
      const { rows: countRows } = await query("SELECT * FROM inventory_counts WHERE id=$1", [req.params.id]);
      const { rows: countItems } = await query(
        "SELECT * FROM inventory_count_items WHERE count_id=$1 AND actual_qty IS NOT NULL", [req.params.id]
      );
      for (const ci of countItems) {
        await query("UPDATE inventory_stock SET qty=$1 WHERE item_id=$2 AND location_id=$3",
          [ci.actual_qty, ci.item_id, countRows[0].location_id]);
        const variance = ci.actual_qty - (ci.expected_qty || 0);
        if (variance !== 0) {
          await query(`INSERT INTO inventory_movements (item_id, to_location, qty, type, notes, created_by)
            VALUES ($1,$2,$3,'adjustment',$4,$5)`,
            [ci.item_id, countRows[0].location_id, variance, 'Inventory count adjustment', req.user.id]);
        }
      }
    }

    vals.push(req.params.id);
    const { rows } = await query(
      `UPDATE inventory_counts SET ${sets.join(',')} WHERE id=$${vals.length} RETURNING *`, vals
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

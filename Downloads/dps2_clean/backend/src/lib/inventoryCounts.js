const { query } = require("../db/pool");

// Open a count for a location, snapshotting current stock as expected quantities.
async function createInventoryCount({ schedule_id, location_id, userId }) {
  const { rows: [count] } = await query(`
    INSERT INTO inventory_counts (schedule_id, location_id, status, counted_by)
    VALUES ($1,$2,'in_progress',$3) RETURNING *
  `, [schedule_id || null, location_id, userId]);

  const { rows: items } = await query(`
    INSERT INTO inventory_count_items (count_id, item_id, expected_qty)
    SELECT $1, s.item_id, s.qty
    FROM inventory_stock s
    JOIN inventory_items i ON i.id = s.item_id
    WHERE s.location_id = $2 AND i.active = true
    RETURNING id, item_id, expected_qty
  `, [count.id, location_id]);

  count.items = items;
  return count;
}

module.exports = { createInventoryCount };

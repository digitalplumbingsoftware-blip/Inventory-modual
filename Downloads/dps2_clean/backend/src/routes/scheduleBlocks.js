const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");
const { ensureScheduleBlocksSchema } = require("../lib/scheduleBlocks");
const { createInventoryCount } = require("../lib/inventoryCounts");

ensureScheduleBlocksSchema().catch(e => console.error("schedule_blocks schema init:", e.message));

const BLOCK_SELECT = `
  SELECT b.*, cs.name AS schedule_name, cs.location_id,
    l.name AS location_name,
    (SELECT COUNT(*)::int FROM inventory_stock s WHERE s.location_id = cs.location_id) AS item_count
  FROM schedule_blocks b
  LEFT JOIN inventory_count_schedules cs ON cs.id = b.count_schedule_id
  LEFT JOIN inventory_locations l ON l.id = cs.location_id
`;

// GET /api/schedule-blocks?from=ISO&to=ISO[&technician_id=]  — for the dispatch board
router.get("/", authenticate, async (req, res) => {
  try {
    const { from, to, technician_id } = req.query;
    const params = [], conds = [];
    if (from) { params.push(from); conds.push(`b.end_at > $${params.length}`); }
    if (to)   { params.push(to);   conds.push(`b.start_at < $${params.length}`); }
    if (technician_id) { params.push(technician_id); conds.push(`b.technician_id = $${params.length}`); }
    const { rows } = await query(
      `${BLOCK_SELECT} ${conds.length ? "WHERE " + conds.join(" AND ") : ""} ORDER BY b.start_at`, params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/schedule-blocks/mine  — the signed-in tech's open blocks (mobile alert)
router.get("/mine", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `${BLOCK_SELECT} WHERE b.technician_id = $1 AND b.status <> 'completed' ORDER BY b.start_at`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/schedule-blocks/:id/start  — open (or resume) the count for a cycle-count block
router.post("/:id/start", authenticate, async (req, res) => {
  try {
    const { rows: [block] } = await query(`${BLOCK_SELECT} WHERE b.id = $1`, [req.params.id]);
    if (!block) return res.status(404).json({ error: "Block not found" });
    if (block.block_type !== "cycle_count") return res.status(400).json({ error: "Not a cycle count" });
    if (block.status === "completed") return res.status(409).json({ error: "This count is already completed" });

    if (block.count_id) return res.json({ count_id: block.count_id });

    const count = await createInventoryCount({
      schedule_id: block.count_schedule_id, location_id: block.location_id, userId: req.user.id,
    });
    await query("UPDATE schedule_blocks SET status='in_progress', count_id=$2 WHERE id=$1", [block.id, count.id]);
    res.status(201).json({ count_id: count.id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

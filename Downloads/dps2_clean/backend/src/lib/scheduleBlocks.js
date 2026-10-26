// ── Schedule blocks ─────────────────────────────────────────────
// Non-job time reserved on a technician's schedule (e.g. a cycle count).
// Cycle-count blocks are booked from inventory_count_schedules by the office,
// one open block at a time per schedule. Completing a count does NOT book the
// next one — the office schedules each count so techs only see confirmed work.
const { query } = require("../db/pool");

async function ensureScheduleBlocksSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS schedule_blocks (
      id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      technician_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      block_type        TEXT NOT NULL DEFAULT 'cycle_count',
      title             TEXT NOT NULL,
      start_at          TIMESTAMPTZ NOT NULL,
      end_at            TIMESTAMPTZ NOT NULL,
      status            TEXT NOT NULL DEFAULT 'scheduled',   -- scheduled|in_progress|completed
      count_schedule_id UUID REFERENCES inventory_count_schedules(id) ON DELETE CASCADE,
      count_id          UUID REFERENCES inventory_counts(id) ON DELETE SET NULL,
      completed_at      TIMESTAMPTZ,
      created_at        TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_schedule_blocks_tech_start ON schedule_blocks (technician_id, start_at)`);
  await query(`ALTER TABLE inventory_count_schedules ADD COLUMN IF NOT EXISTS duration_minutes INT NOT NULL DEFAULT 60`);
}

// Book a cycle-count block for a schedule at `startAt` (Date or ISO string).
async function createCountBlock(schedule, startAt) {
  if (!schedule.assigned_to || !startAt) return null;
  const { rows: [loc] } = await query("SELECT name FROM inventory_locations WHERE id=$1", [schedule.location_id]);
  const title = `Cycle Count · ${loc?.name || schedule.name}`;
  const { rows: [block] } = await query(`
    INSERT INTO schedule_blocks (technician_id, block_type, title, start_at, end_at, count_schedule_id)
    VALUES ($1, 'cycle_count', $2, $3::timestamptz, $3::timestamptz + make_interval(mins => $4), $5)
    RETURNING *
  `, [schedule.assigned_to, title, startAt, schedule.duration_minutes || 60, schedule.id]);
  return block;
}

// Mark the block for a finished count complete.
async function completeCountBlock(count) {
  // Prefer the block the tech started from; otherwise the schedule's oldest pending block
  // (covers counts started from the web "Start Count Now" button).
  const { rows: [block] } = await query(`
    SELECT * FROM schedule_blocks
    WHERE count_id = $1
       OR (count_id IS NULL AND count_schedule_id = $2 AND status <> 'completed')
    ORDER BY (count_id = $1) DESC NULLS LAST, start_at ASC
    LIMIT 1
  `, [count.id, count.schedule_id]);
  if (!block) return;
  await query(
    "UPDATE schedule_blocks SET status='completed', completed_at=NOW(), count_id=$2 WHERE id=$1",
    [block.id, count.id]
  );
}

module.exports = { ensureScheduleBlocksSchema, createCountBlock, completeCountBlock };

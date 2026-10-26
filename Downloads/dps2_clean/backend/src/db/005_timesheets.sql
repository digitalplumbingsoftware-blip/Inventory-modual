-- Migration 005: Timesheets / Time Punches
-- Tracks technician clock-in / clock-out events

CREATE TABLE IF NOT EXISTS time_punches (
  id           SERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  punch_in     TIMESTAMPTZ NOT NULL,
  punch_out    TIMESTAMPTZ,
  notes        TEXT,
  created_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_punches_user_in
  ON time_punches(user_id, punch_in DESC);

CREATE INDEX IF NOT EXISTS idx_time_punches_range
  ON time_punches(punch_in, punch_out);

-- Migration 004: Field Inventory Module
-- Adds restock_needed flag to jobs + performance indexes for the barcode scan loop.
-- Safe to run multiple times (uses IF NOT EXISTS / idempotent patterns).

-- jobs: restock alert flag set async when job completes
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS restock_needed BOOLEAN DEFAULT false;

-- Performance indexes for Phase 1 hot paths
CREATE INDEX IF NOT EXISTS idx_inventory_items_barcode
  ON inventory_items(barcode);

CREATE INDEX IF NOT EXISTS idx_inventory_movements_job
  ON inventory_movements(job_id);

CREATE INDEX IF NOT EXISTS idx_inventory_locations_technician
  ON inventory_locations(technician_id);

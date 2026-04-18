-- Migration 001: Add columns missing from schema but referenced in routes
-- Run this against an existing DPS database that was initialized before 2026-04-17.
-- Safe to run multiple times (uses IF NOT EXISTS / DO blocks).

-- users: PIN login support
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- customers: commercial customer fields + SMS opt-out
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_type  TEXT    DEFAULT 'residential';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_name   TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS contact_title  TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS phones         JSONB   DEFAULT '[]';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS emails         JSONB   DEFAULT '[]';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS property_info  JSONB   DEFAULT '{}';
ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_opt_out    BOOLEAN DEFAULT false;

-- jobs: arrival window display (e.g. "8am - 10am")
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS arrival_window TEXT;

-- job_photos: photo uploads from mobile
CREATE TABLE IF NOT EXISTS job_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id),
  file_path     TEXT NOT NULL,
  original_name TEXT,
  mime_type     TEXT,
  size_bytes    INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_job_photos_job ON job_photos(job_id);

-- settings: key-value store for integration tokens (QuickBooks OAuth etc.)
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

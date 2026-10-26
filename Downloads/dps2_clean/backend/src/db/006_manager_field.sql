-- Migration 006: Add manager_id to users for payroll filtering
ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id);

-- ═══════════════════════════════════════════════════════════
-- DPS Database Schema
-- ═══════════════════════════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- fuzzy search

-- ── ENUMS ──────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin','dispatcher','office','technician','accountant');
CREATE TYPE job_status AS ENUM ('unassigned','scheduled','en_route','on_site','completed','cancelled','warranty');
CREATE TYPE invoice_type AS ENUM ('estimate','invoice');
CREATE TYPE invoice_status AS ENUM ('draft','sent','approved','paid','void');
CREATE TYPE movement_type AS ENUM ('transfer','adjustment','usage','receive','return');
CREATE TYPE location_type AS ENUM ('warehouse','truck','van');
CREATE TYPE followup_type AS ENUM ('estimate','warranty','maintenance','callback');

-- ── USERS / TECHNICIANS ────────────────────────────────────────
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  pin_hash      TEXT,                        -- bcrypt-hashed PIN for mobile login
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  phone         TEXT,
  role          user_role NOT NULL DEFAULT 'technician',
  color         TEXT DEFAULT '#3ecf8e',     -- dispatch board color
  initials      TEXT,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── CUSTOMERS ─────────────────────────────────────────────────
CREATE TABLE customers (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  email          TEXT,
  phone          TEXT,
  phone2         TEXT,
  notes          TEXT,
  tags           TEXT[] DEFAULT '{}',          -- ["VIP","tankless","warranty"]
  marketing_src  TEXT,                          -- lead source
  square_cust_id TEXT,                          -- Square customer ID
  qb_cust_id     TEXT,                          -- QuickBooks customer ID
  customer_type  TEXT DEFAULT 'residential',    -- 'residential' | 'commercial'
  business_name  TEXT,
  contact_name   TEXT,
  contact_title  TEXT,
  phones         JSONB DEFAULT '[]',            -- [{type,number}]
  emails         JSONB DEFAULT '[]',            -- [{type,email}]
  property_info  JSONB DEFAULT '{}',
  sms_opt_out    BOOLEAN DEFAULT false,         -- TCPA: do not send SMS if true
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ── SERVICE ADDRESSES ─────────────────────────────────────────
CREATE TABLE addresses (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       TEXT DEFAULT 'Primary',
  street      TEXT NOT NULL,
  city        TEXT NOT NULL,
  state       TEXT NOT NULL DEFAULT 'TX',
  zip         TEXT,
  lat         NUMERIC(10,7),
  lng         NUMERIC(10,7),
  notes       TEXT,
  is_primary  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── JOBS / WORK ORDERS ────────────────────────────────────────
CREATE TABLE jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number      SERIAL,
  customer_id     UUID NOT NULL REFERENCES customers(id),
  address_id      UUID REFERENCES addresses(id),
  technician_id   UUID REFERENCES users(id),
  status          job_status NOT NULL DEFAULT 'unassigned',
  job_type        TEXT,
  description     TEXT,
  scheduled_start TIMESTAMPTZ,
  scheduled_end   TIMESTAMPTZ,
  actual_start    TIMESTAMPTZ,
  actual_end      TIMESTAMPTZ,
  travel_start    TIMESTAMPTZ,
  notes           TEXT,
  tags            TEXT[] DEFAULT '{}',
  source          TEXT,                      -- marketing source
  arrival_window  TEXT,                      -- e.g. "8am - 10am"
  is_callback     BOOLEAN DEFAULT false,
  is_warranty     BOOLEAN DEFAULT false,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── INVOICES / ESTIMATES ──────────────────────────────────────
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number  SERIAL,
  job_id          UUID REFERENCES jobs(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  type            invoice_type NOT NULL DEFAULT 'invoice',
  status          invoice_status NOT NULL DEFAULT 'draft',
  subtotal        NUMERIC(10,2) DEFAULT 0,
  tax_rate        NUMERIC(5,4) DEFAULT 0.0825,
  tax_amount      NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(10,2) DEFAULT 0,
  notes           TEXT,
  signed_at       TIMESTAMPTZ,
  signature_data  TEXT,                      -- base64 signature
  square_payment_id TEXT,
  paid_at         TIMESTAMPTZ,
  qb_invoice_id        TEXT,
  fb_invoice_id        TEXT,
  amount_paid          NUMERIC(10,2) DEFAULT 0,
  selected_option_id   UUID,
  converted_invoice_id UUID,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ── ESTIMATE OPTIONS (Good / Better / Best) ───────────────────
CREATE TABLE estimate_options (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id  UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  description TEXT,
  subtotal    NUMERIC(10,2) DEFAULT 0,
  tax_amount  NUMERIC(10,2) DEFAULT 0,
  total       NUMERIC(10,2) DEFAULT 0,
  selected    BOOLEAN DEFAULT false,
  sort_order  INT DEFAULT 0
);

CREATE TABLE estimate_option_items (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  estimate_option_id UUID NOT NULL REFERENCES estimate_options(id) ON DELETE CASCADE,
  description        TEXT NOT NULL,
  quantity           NUMERIC(8,2) DEFAULT 1,
  unit_price         NUMERIC(10,2) NOT NULL,
  sort_order         INT DEFAULT 0
);

-- ── INVOICE LINE ITEMS ────────────────────────────────────────
CREATE TABLE invoice_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  pricebook_id  UUID,                        -- optional ref
  description   TEXT NOT NULL,
  quantity      NUMERIC(8,2) DEFAULT 1,
  unit_price    NUMERIC(10,2) NOT NULL,
  line_total    NUMERIC(10,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  cost          NUMERIC(10,2),               -- internal cost (hidden from customer)
  sort_order    INT DEFAULT 0
);

-- ── PRICEBOOK ─────────────────────────────────────────────────
CREATE TABLE pricebook_categories (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  pricebook  TEXT NOT NULL DEFAULT 'residential', -- 'residential' | 'commercial'
  sort_order INT DEFAULT 0
);

CREATE TABLE pricebook_items (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id       UUID REFERENCES pricebook_categories(id),
  code              TEXT,
  name              TEXT NOT NULL,
  description       TEXT,
  labor_hours       NUMERIC(6,2) DEFAULT 1,
  mat_code          TEXT,
  price_good        NUMERIC(10,2) DEFAULT 0,
  price_better      NUMERIC(10,2) DEFAULT 0,
  price_best        NUMERIC(10,2) DEFAULT 0,
  price_premium     NUMERIC(10,2) DEFAULT 0,
  price_elite       NUMERIC(10,2) DEFAULT 0,
  warranty_t1_t2    TEXT,
  warranty_t3_t5    TEXT,
  taxable           BOOLEAN DEFAULT true,
  customer_supplied BOOLEAN DEFAULT false,
  sort_order        INT DEFAULT 0,
  active            BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE pricebook_settings (
  id         TEXT PRIMARY KEY,
  value      NUMERIC(10,4) NOT NULL,
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INVENTORY ─────────────────────────────────────────────────
CREATE TABLE inventory_locations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type          location_type NOT NULL,
  name          TEXT NOT NULL,               -- "Main Warehouse", "Truck #2"
  technician_id UUID REFERENCES users(id),   -- for truck locations
  active        BOOLEAN DEFAULT true
);

CREATE TABLE inventory_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sku         TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  category    TEXT,
  item_type   TEXT DEFAULT 'consumable',  -- consumable|tool|equipment|material
  cost        NUMERIC(10,2),
  price       NUMERIC(10,2),
  min_qty     INT DEFAULT 0,
  max_qty     INT,
  vendor      TEXT,
  vendor_sku  TEXT,
  barcode     TEXT,
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE truck_stock_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  department  TEXT,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE truck_stock_template_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES truck_stock_templates(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  min_qty     INT NOT NULL DEFAULT 1,
  max_qty     INT
);

CREATE TABLE purchase_orders (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_number      SERIAL,
  vendor         TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  notes          TEXT,
  auto_generated BOOLEAN DEFAULT false,
  job_id         UUID REFERENCES jobs(id),
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  po_id       UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  item_id     UUID REFERENCES inventory_items(id),
  description TEXT NOT NULL,
  sku         TEXT,
  qty         INT NOT NULL DEFAULT 1,
  unit_cost   NUMERIC(10,2) DEFAULT 0
);

CREATE TABLE inventory_count_schedules (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  location_id  UUID REFERENCES inventory_locations(id),
  frequency    TEXT NOT NULL DEFAULT 'monthly',
  day_of_week  INT,
  day_of_month INT,
  assigned_to  UUID REFERENCES users(id),
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_counts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id  UUID REFERENCES inventory_count_schedules(id),
  location_id  UUID REFERENCES inventory_locations(id),
  status       TEXT NOT NULL DEFAULT 'in_progress',
  started_at   TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  notes        TEXT,
  counted_by   UUID REFERENCES users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_count_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  count_id     UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES inventory_items(id),
  expected_qty INT DEFAULT 0,
  actual_qty   INT
);

CREATE TABLE inventory_stock (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id     UUID NOT NULL REFERENCES inventory_items(id),
  location_id UUID NOT NULL REFERENCES inventory_locations(id),
  qty         INT NOT NULL DEFAULT 0,
  UNIQUE(item_id, location_id)
);

CREATE TABLE inventory_movements (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         UUID NOT NULL REFERENCES inventory_items(id),
  from_location   UUID REFERENCES inventory_locations(id),
  to_location     UUID REFERENCES inventory_locations(id),
  qty             INT NOT NULL,
  type            movement_type NOT NULL,
  job_id          UUID REFERENCES jobs(id),
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── GPS PINGS ─────────────────────────────────────────────────
CREATE TABLE gps_pings (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  technician_id UUID NOT NULL REFERENCES users(id),
  lat           NUMERIC(10,7) NOT NULL,
  lng           NUMERIC(10,7) NOT NULL,
  accuracy      NUMERIC(8,2),
  speed         NUMERIC(6,2),
  heading       NUMERIC(6,2),
  on_duty       BOOLEAN DEFAULT true,
  job_id        UUID REFERENCES jobs(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast latest-ping lookups
CREATE INDEX idx_gps_tech_time ON gps_pings(technician_id, created_at DESC);

-- ── FOLLOW-UPS ────────────────────────────────────────────────
CREATE TABLE followups (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  job_id        UUID REFERENCES jobs(id),
  invoice_id    UUID REFERENCES invoices(id),
  type          followup_type NOT NULL,
  note          TEXT,
  due_date      DATE,
  completed     BOOLEAN DEFAULT false,
  completed_at  TIMESTAMPTZ,
  assigned_to   UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYMENTS ──────────────────────────────────────────────────
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  amount          NUMERIC(10,2) NOT NULL,
  method          TEXT NOT NULL,             -- 'square_card','cash','check','ach'
  square_payment_id TEXT,
  square_receipt_url TEXT,
  notes           TEXT,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── EMPLOYEES ─────────────────────────────────────────────────
CREATE TABLE employees (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  email        TEXT,
  phone        TEXT,
  department   TEXT,
  role_id      UUID,
  license_type TEXT,
  pay_type     TEXT,                        -- 'hourly' | 'salary'
  hourly_rate  NUMERIC(8,2),
  salary       NUMERIC(10,2),
  hire_date    DATE,
  active       BOOLEAN DEFAULT true,
  notes        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYROLL SETTINGS ──────────────────────────────────────────
CREATE TABLE payroll_settings (
  pay_type   TEXT PRIMARY KEY,
  config     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── INTEGRATIONS ──────────────────────────────────────────────
CREATE TABLE integrations (
  name       TEXT PRIMARY KEY,
  config     JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── COMPANY SETTINGS ──────────────────────────────────────────
CREATE TABLE company_settings (
  id          TEXT PRIMARY KEY DEFAULT 'main',
  name        TEXT,
  phone       TEXT,
  email       TEXT,
  address     TEXT,
  city        TEXT,
  state       TEXT,
  zip         TEXT,
  url         TEXT,
  ein         TEXT,
  logo_url    TEXT,
  res_service BOOLEAN DEFAULT true,
  res_new     BOOLEAN DEFAULT true,
  com_service BOOLEAN DEFAULT true,
  com_new     BOOLEAN DEFAULT true,
  departments JSONB DEFAULT '[]',
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── ROLES ─────────────────────────────────────────────────────
CREATE TABLE roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  permissions JSONB DEFAULT '[]',
  category_id UUID,
  is_system   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── TRIGGERS: updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated      BEFORE UPDATE ON users      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_customers_updated  BEFORE UPDATE ON customers  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_jobs_updated       BEFORE UPDATE ON jobs       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_invoices_updated   BEFORE UPDATE ON invoices   FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_employees_updated  BEFORE UPDATE ON employees  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── DEFAULT ROWS ───────────────────────────────────────────────
INSERT INTO company_settings (id) VALUES ('main');

INSERT INTO pricebook_settings (id, value, label) VALUES
  ('base_labor_rate',   95,   'Base Labor Rate ($/hr)'),
  ('tier1_multiplier',  1.00, 'Good'),
  ('tier2_multiplier',  1.18, 'Better'),
  ('tier3_multiplier',  1.38, 'Best'),
  ('tier4_multiplier',  1.60, 'Premium'),
  ('tier5_multiplier',  1.85, 'Elite');

-- ── SMS MESSAGES ──────────────────────────────────────────────
CREATE TABLE sms_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  phone       TEXT NOT NULL,
  direction   TEXT NOT NULL CHECK(direction IN ('inbound','outbound')),
  body        TEXT NOT NULL,
  twilio_sid  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sms_phone     ON sms_messages(phone);
CREATE INDEX idx_sms_customer  ON sms_messages(customer_id);

-- ── JOB PHOTOS ────────────────────────────────────────────────
CREATE TABLE job_photos (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  uploaded_by   UUID REFERENCES users(id),
  file_path     TEXT NOT NULL,              -- relative path under /uploads/photos/
  original_name TEXT,
  mime_type     TEXT,
  size_bytes    INT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_job_photos_job ON job_photos(job_id);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX idx_jobs_technician   ON jobs(technician_id);
CREATE INDEX idx_jobs_customer     ON jobs(customer_id);
CREATE INDEX idx_jobs_status       ON jobs(status);
CREATE INDEX idx_jobs_scheduled    ON jobs(scheduled_start);
CREATE INDEX idx_invoices_job      ON invoices(job_id);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_customers_phone   ON customers(phone);
CREATE INDEX idx_customers_name    ON customers USING GIN(to_tsvector('english', first_name || ' ' || last_name));

-- ── App Settings (key-value store for integration tokens etc.) ──
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

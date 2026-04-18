-- ═══════════════════════════════════════════════════════════
-- DPS Seed Data — realistic demo for testing
-- ═══════════════════════════════════════════════════════════

-- ── Admin user (password: admin123) ───────────────────────────
INSERT INTO users (id, email, password_hash, first_name, last_name, role, color, initials) VALUES
('00000000-0000-0000-0000-000000000001', 'admin@dps.com',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- password: password
 'Admin', 'User', 'admin', '#f5a623', 'AD');

-- ── Technicians ────────────────────────────────────────────────
INSERT INTO users (id, email, password_hash, first_name, last_name, phone, role, color, initials) VALUES
('00000000-0000-0000-0000-000000000002', 'marcus@dps.local',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'Marcus', 'Reed', '(713)555-0101', 'technician', '#f5a623', 'MR'),
('00000000-0000-0000-0000-000000000003', 'devon@dps.local',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'Devon', 'Liu', '(713)555-0102', 'technician', '#4a9eff', 'DL'),
('00000000-0000-0000-0000-000000000004', 'priya@dps.local',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'Priya', 'Sharma', '(713)555-0103', 'technician', '#3ecf8e', 'PS'),
('00000000-0000-0000-0000-000000000005', 'carl@dps.local',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'Carl', 'Torres', '(713)555-0104', 'technician', '#a78bfa', 'CT'),
('00000000-0000-0000-0000-000000000006', 'jin@dps.local',
 '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
 'Jin', 'Woo', '(713)555-0105', 'technician', '#22d3ee', 'JW');

-- ── Customers ──────────────────────────────────────────────────
INSERT INTO customers (id, first_name, last_name, phone, email, tags, marketing_src) VALUES
('10000000-0000-0000-0000-000000000001', 'Ana', 'Rivera', '(713)555-2041', 'ana.rivera@email.com', '{"VIP","tankless"}', 'Google'),
('10000000-0000-0000-0000-000000000002', 'Bill', 'Thompson', '(713)555-2042', 'bill.t@email.com', '{}', 'Referral'),
('10000000-0000-0000-0000-000000000003', 'Kavya', 'Patel', '(713)555-2043', 'kavya.p@email.com', '{"warranty"}', 'Google'),
('10000000-0000-0000-0000-000000000004', 'Sam', 'McKinley', '(713)555-2044', NULL, '{}', 'Yelp'),
('10000000-0000-0000-0000-000000000005', 'Lily', 'Nguyen', '(713)555-2045', 'lily.n@email.com', '{"tankless"}', 'Google'),
('10000000-0000-0000-0000-000000000006', 'Dario', 'Castellano', '(713)555-2046', 'dario.c@email.com', '{"VIP"}', 'Referral'),
('10000000-0000-0000-0000-000000000007', 'Jennifer', 'Wu', '(713)555-2047', NULL, '{}', 'Google'),
('10000000-0000-0000-0000-000000000008', 'Emeka', 'Okafor', '(713)555-2048', 'emeka.o@email.com', '{}', 'Facebook'),
('10000000-0000-0000-0000-000000000009', 'Ron', 'Davis', '(713)555-3001', NULL, '{}', 'Google'),
('10000000-0000-0000-0000-000000000010', 'Maria', 'Flores', '(713)555-3002', 'maria.f@email.com', '{}', 'Referral');

-- ── Addresses ─────────────────────────────────────────────────
INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, is_primary) VALUES
('10000000-0000-0000-0000-000000000001', '143 Oak Blvd', 'Houston', 'TX', '77001', 29.7620, -95.3720, true),
('10000000-0000-0000-0000-000000000002', '88 Pine St', 'Houston', 'TX', '77002', 29.7580, -95.3810, true),
('10000000-0000-0000-0000-000000000003', '210 Cedar Ave', 'Houston', 'TX', '77003', 29.7680, -95.3630, true),
('10000000-0000-0000-0000-000000000004', '55 Elm Dr', 'Houston', 'TX', '77004', 29.7540, -95.3760, true),
('10000000-0000-0000-0000-000000000005', '901 Birch Ln', 'Houston', 'TX', '77005', 29.7600, -95.4100, true),
('10000000-0000-0000-0000-000000000006', '47 Maple Ct', 'Houston', 'TX', '77006', 29.7710, -95.3580, true),
('10000000-0000-0000-0000-000000000007', '302 Walnut Pl', 'Houston', 'TX', '77007', 29.7650, -95.3900, true),
('10000000-0000-0000-0000-000000000008', '78 Spruce Way', 'Houston', 'TX', '77008', 29.7700, -95.4000, true);

-- ── Inventory Locations ────────────────────────────────────────
INSERT INTO inventory_locations (id, type, name, technician_id) VALUES
('20000000-0000-0000-0000-000000000001', 'warehouse', 'Main Warehouse', NULL),
('20000000-0000-0000-0000-000000000002', 'truck', 'Truck #1 (Marcus)', '00000000-0000-0000-0000-000000000002'),
('20000000-0000-0000-0000-000000000003', 'truck', 'Truck #2 (Devon)', '00000000-0000-0000-0000-000000000003'),
('20000000-0000-0000-0000-000000000004', 'truck', 'Truck #3 (Priya)', '00000000-0000-0000-0000-000000000004'),
('20000000-0000-0000-0000-000000000005', 'truck', 'Truck #4 (Carl)', '00000000-0000-0000-0000-000000000005'),
('20000000-0000-0000-0000-000000000006', 'truck', 'Truck #5 (Jin)', '00000000-0000-0000-0000-000000000006');

-- ── Inventory Items ────────────────────────────────────────────
INSERT INTO inventory_items (id, sku, name, category, cost, price, min_qty, max_qty, vendor) VALUES
('30000000-0000-0000-0000-000000000001', 'WH-40G',     '40-Gal Water Heater',        'Water Heaters', 420, 780,  3, 8,  'Bradford White'),
('30000000-0000-0000-0000-000000000002', 'WH-TANKL',   'Tankless WH Navien NPE-240A','Water Heaters', 890, 1680, 2, 4,  'Navien'),
('30000000-0000-0000-0000-000000000003', 'ANOD-MG',    'Magnesium Anode Rod',        'Parts',         18,  45,   2, 10, 'Rheem'),
('30000000-0000-0000-0000-000000000004', 'WELD-75',    'Weld Coupling 3/4"',         'Fittings',      3,   9,    5, 30, 'Mueller'),
('30000000-0000-0000-0000-000000000005', 'PVC-SCH40',  'PVC Pipe SCH40 10ft',        'Pipe',          12,  28,   10, 40, 'Charlotte Pipe'),
('30000000-0000-0000-0000-000000000006', 'SHUT-BALL',  'Ball Shut-Off Valve 3/4"',   'Valves',        22,  54,   8, 20, 'Nibco'),
('30000000-0000-0000-0000-000000000007', 'DRAIN-SNAKE','Electric Drain Snake 50ft',  'Equipment',     0,   0,    1, 2,  'Ridgid'),
('30000000-0000-0000-0000-000000000008', 'TEFLON',     'Teflon Tape Roll',           'Supplies',      1,   4,    20, 100,'Oatey');

-- ── Inventory Stock ────────────────────────────────────────────
INSERT INTO inventory_stock (item_id, location_id, qty) VALUES
('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 1),  -- WH low!
('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 2),
('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 8),
('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 0),  -- anode out!
('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000001', 15),
('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000006', 2),  -- coupling low!
('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000001', 8),  -- pvc low!
('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000001', 14),
('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000001', 2),
('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000001', 45);

-- ── Pricebook ──────────────────────────────────────────────────
INSERT INTO pricebook_categories (id, name, pricebook, sort_order) VALUES
('40000000-0000-0000-0000-000000000001', 'Water Heaters', 'residential', 1),
('40000000-0000-0000-0000-000000000002', 'Drains',        'residential', 2),
('40000000-0000-0000-0000-000000000003', 'Fixtures',      'residential', 3),
('40000000-0000-0000-0000-000000000004', 'Diagnostics',   'residential', 4);

INSERT INTO pricebook_items (category_id, code, name, description, labor_hours, price_good, price_better, price_best, price_premium, price_elite, taxable, customer_supplied, sort_order) VALUES
('40000000-0000-0000-0000-000000000001', 'WH-40G-INST', '40-Gal Water Heater Install',     'Remove & replace 40-gal gas water heater. Includes haul-away.', 3.0, 1480, 1745, 2040, 2370, 2738, true,  false, 1),
('40000000-0000-0000-0000-000000000001', 'WH-TNK-INST', 'Tankless Water Heater Install',   'Install Navien NPE-240A tankless. Includes gas & venting.',      5.0, 2850, 3363, 3933, 4560, 5273, true,  false, 2),
('40000000-0000-0000-0000-000000000001', 'WH-FLUSH',    'Water Heater Flush & Inspection', 'Flush sediment, check anode rod, pressure relief valve test.',   1.0,  185,  218,  255,  296,  342, true,  false, 3),
('40000000-0000-0000-0000-000000000002', 'DR-MAIN',     'Main Drain Clearing',             'Snake main sewer line up to 100ft.',                             1.0,  320,  378,  441,  512,  592, true,  false, 1),
('40000000-0000-0000-0000-000000000002', 'DR-KITCH',    'Kitchen Drain Clearing',          'Snake kitchen drain, check p-trap.',                             0.75, 180,  212,  248,  288,  333, true,  false, 2),
('40000000-0000-0000-0000-000000000003', 'FX-TOILET',   'Toilet Replace',                  'Remove & install new toilet. Customer supplies fixture.',         1.5,  490,  578,  676,  784,  907, true,  true,  1),
('40000000-0000-0000-0000-000000000003', 'FX-FAUCET',   'Faucet Install',                  'Install customer-supplied kitchen or bath faucet.',               1.0,  240,  283,  331,  384,  444, true,  true,  2),
('40000000-0000-0000-0000-000000000004', 'DX-SLAB',     'Slab Leak Detection',             'Electronic slab leak detection, mark location.',                  2.0,  485,  572,  669,  776,  897, true,  false, 1),
('40000000-0000-0000-0000-000000000004', 'DX-INSP',     'Plumbing Inspection',             'Full visual plumbing inspection, written report.',                1.0,  150,  177,  207,  240,  278, true,  false, 2);

-- ── Jobs ───────────────────────────────────────────────────────
INSERT INTO jobs (id, customer_id, technician_id, status, job_type, scheduled_start, scheduled_end, tags, source) VALUES
('50000000-0000-0000-0000-000000000001',
 '10000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',
 'on_site', 'Water Heater Install',
 NOW() - INTERVAL '2 hours', NOW() + INTERVAL '30 minutes',
 '{"tankless","VIP"}', 'Google'),
('50000000-0000-0000-0000-000000000002',
 '10000000-0000-0000-0000-000000000002',
 '00000000-0000-0000-0000-000000000003',
 'en_route', 'Drain Clearing',
 NOW() + INTERVAL '30 minutes', NOW() + INTERVAL '1.5 hours',
 '{}', 'Referral'),
('50000000-0000-0000-0000-000000000003',
 '10000000-0000-0000-0000-000000000003',
 '00000000-0000-0000-0000-000000000004',
 'completed', 'Fixture Repair',
 NOW() - INTERVAL '5 hours', NOW() - INTERVAL '3.5 hours',
 '{"warranty"}', 'Google'),
('50000000-0000-0000-0000-000000000004',
 '10000000-0000-0000-0000-000000000006',
 '00000000-0000-0000-0000-000000000006',
 'on_site', 'Slab Leak Detect',
 NOW() - INTERVAL '3 hours', NOW() + INTERVAL '1 hour',
 '{"VIP"}', 'Referral');

-- ── Invoices ───────────────────────────────────────────────────
INSERT INTO invoices (id, job_id, customer_id, type, status, subtotal, tax_amount, total) VALUES
('60000000-0000-0000-0000-000000000001',
 '50000000-0000-0000-0000-000000000003',
 '10000000-0000-0000-0000-000000000003',
 'invoice', 'paid', 193.58, 15.92, 210.00);

INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, cost) VALUES
('60000000-0000-0000-0000-000000000001', 'Faucet Install', 1, 240.00, 40.00),
('60000000-0000-0000-0000-000000000001', 'P-Trap Replacement', 1, 85.00, 18.00);

-- ── Follow-Ups ─────────────────────────────────────────────────
INSERT INTO followups (customer_id, type, note, due_date) VALUES
('10000000-0000-0000-0000-000000000009', 'estimate', 'Repiping quote $4,200 sent — called twice, no response.', CURRENT_DATE),
('10000000-0000-0000-0000-000000000003', 'warranty', 'Water heater installed 11 months ago. Check anode rod.', CURRENT_DATE + 1),
('10000000-0000-0000-0000-000000000010', 'maintenance', 'Annual drain treatment due — on maintenance agreement.', CURRENT_DATE + 3),
('10000000-0000-0000-0000-000000000005', 'estimate', 'Fixture upgrade package $890 — needs manager approval.', CURRENT_DATE + 4);

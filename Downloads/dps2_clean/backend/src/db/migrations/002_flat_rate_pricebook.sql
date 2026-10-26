-- Migration 002: Flat-Rate Pricebook + Estimates
-- Replaces old tiered pricebook system with Davis Plumbing flat-rate pricebook
-- 160 materials, 148 tasks, estimate signing flow

BEGIN;

-- ── Drop legacy tables ─────────────────────────────────────────────────────
DROP TABLE IF EXISTS estimate_option_items CASCADE;
DROP TABLE IF EXISTS estimate_options         CASCADE;
DROP TABLE IF EXISTS pricebook_items          CASCADE;
DROP TABLE IF EXISTS pricebook_categories     CASCADE;
DROP TABLE IF EXISTS pricebook_settings       CASCADE;
DROP TABLE IF EXISTS pb_task_materials        CASCADE;
DROP TABLE IF EXISTS pb_tasks                 CASCADE;
DROP TABLE IF EXISTS pb_materials             CASCADE;
DROP TABLE IF EXISTS pb_engine                CASCADE;
DROP TABLE IF EXISTS estimate_items           CASCADE;
DROP TABLE IF EXISTS estimates                CASCADE;

-- ── Create tables ──────────────────────────────────────────────────────────
CREATE TABLE pb_materials (
  id          TEXT PRIMARY KEY,
  description TEXT        NOT NULL,
  unit        TEXT        NOT NULL DEFAULT 'EA',
  cost        NUMERIC(10,2) NOT NULL
);

CREATE TABLE pb_tasks (
  id          SERIAL PRIMARY KEY,
  category_id TEXT        NOT NULL,
  name        TEXT        NOT NULL,
  tag         TEXT,
  hours       NUMERIC(4,2) NOT NULL DEFAULT 0,
  time_range  TEXT,
  difficulty  TEXT,
  notes       TEXT        NOT NULL DEFAULT ''
);

CREATE TABLE pb_task_materials (
  task_id     INT  NOT NULL REFERENCES pb_tasks(id) ON DELETE CASCADE,
  material_id TEXT NOT NULL REFERENCES pb_materials(id),
  qty         NUMERIC(8,3) NOT NULL DEFAULT 1,
  PRIMARY KEY (task_id, material_id)
);

CREATE TABLE pb_engine (
  id        INT  PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  wage      NUMERIC(6,2) NOT NULL DEFAULT 65,
  burden    NUMERIC(5,2) NOT NULL DEFAULT 28,
  truck     NUMERIC(5,2) NOT NULL DEFAULT 12,
  overhead  NUMERIC(5,2) NOT NULL DEFAULT 30,
  profit    NUMERIC(5,2) NOT NULL DEFAULT 20,
  misc      NUMERIC(5,2) NOT NULL DEFAULT 8,
  warranty  NUMERIC(5,2) NOT NULL DEFAULT 3,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE TABLE estimates (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id              UUID        REFERENCES jobs(id),
  customer_id         UUID        REFERENCES customers(id),
  technician_id       UUID        REFERENCES users(id),
  status              TEXT        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','sent','signed','declined','expired','converted')),
  subtotal            NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax_rate            NUMERIC(5,4) NOT NULL DEFAULT 0,
  tax_amount          NUMERIC(10,2) NOT NULL DEFAULT 0,
  total               NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes               TEXT,
  signature_data      TEXT,
  signed_at           TIMESTAMPTZ,
  signed_by_name      TEXT,
  sign_token          TEXT        UNIQUE,
  sign_token_expires_at TIMESTAMPTZ,
  invoice_id          UUID        REFERENCES invoices(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE estimate_items (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  estimate_id   UUID        NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
  task_id       INT         REFERENCES pb_tasks(id),
  description   TEXT        NOT NULL,
  hours         NUMERIC(4,2) NOT NULL DEFAULT 0,
  material_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  labor_cost    NUMERIC(10,2) NOT NULL DEFAULT 0,
  flat_rate     NUMERIC(10,2) NOT NULL DEFAULT 0,
  qty           INT         NOT NULL DEFAULT 1,
  notes         TEXT,
  sort_order    INT         NOT NULL DEFAULT 0
);

CREATE INDEX idx_estimates_job        ON estimates(job_id);
CREATE INDEX idx_estimates_customer   ON estimates(customer_id);
CREATE INDEX idx_estimates_sign_token ON estimates(sign_token);
CREATE INDEX idx_estimate_items_est   ON estimate_items(estimate_id);

-- ── Seed: 160 Materials ────────────────────────────────────────────────────
INSERT INTO pb_materials (id, description, unit, cost) VALUES
('M001','1/2" Type M Copper Pipe','LF',1.85),
('M002','3/4" Type M Copper Pipe','LF',2.60),
('M003','1" Type M Copper Pipe','LF',3.75),
('M004','1-1/2" Type M Copper Pipe','LF',5.20),
('M005','2" Type M Copper Pipe','LF',7.10),
('M006','1/2" Copper 90 Elbow','EA',1.45),
('M007','3/4" Copper 90 Elbow','EA',2.10),
('M008','1/2" Copper 45 Elbow','EA',1.20),
('M009','3/4" Copper 45 Elbow','EA',1.80),
('M010','1/2" Copper Tee','EA',1.85),
('M011','3/4" Copper Tee','EA',2.75),
('M012','1/2" Copper Coupling','EA',0.95),
('M013','3/4" Copper Coupling','EA',1.50),
('M014','1/2" Copper Cap','EA',0.75),
('M015','Copper Reducer 3/4"x1/2"','EA',1.25),
('M016','1/2" PEX-A Pipe','LF',0.55),
('M017','3/4" PEX-A Pipe','LF',0.75),
('M018','1" PEX-A Pipe','LF',1.05),
('M019','1/2" PEX Elbow (expansion)','EA',3.50),
('M020','3/4" PEX Elbow','EA',5.00),
('M021','1/2" PEX Tee','EA',4.50),
('M022','3/4" PEX Tee','EA',6.50),
('M023','SharkBite 1/2" Coupling','EA',8.50),
('M024','SharkBite 3/4" Coupling','EA',11.00),
('M025','SharkBite 1/2" Elbow','EA',9.25),
('M026','SharkBite 1/2" Tee','EA',13.50),
('M027','1/2" CPVC Pipe','LF',0.65),
('M028','3/4" CPVC Pipe','LF',0.90),
('M029','1/2" CPVC 90 Elbow','EA',0.65),
('M030','3/4" CPVC 90 Elbow','EA',0.90),
('M031','1/2" CPVC Tee','EA',0.80),
('M032','CPVC Primer (4oz)','EA',4.50),
('M033','CPVC Cement (4oz)','EA',5.00),
('M034','1-1/2" PVC DWV Pipe','LF',1.10),
('M035','2" PVC DWV Pipe','LF',1.65),
('M036','3" PVC DWV Pipe','LF',2.20),
('M037','4" PVC DWV Pipe','LF',3.10),
('M038','1-1/2" P-Trap PVC','EA',3.50),
('M039','2" P-Trap PVC','EA',5.00),
('M040','3" P-Trap PVC','EA',9.00),
('M041','1-1/2" P-Trap Chrome','EA',12.00),
('M042','4" PVC Wye','EA',8.00),
('M043','4" PVC Sanitary Tee','EA',6.50),
('M044','4" PVC Long Sweep 90','EA',7.00),
('M045','4" Cleanout Plug','EA',8.00),
('M046','4" Fernco Coupling','EA',12.00),
('M047','3" Fernco Coupling','EA',9.00),
('M048','PVC Primer (4oz)','EA',4.50),
('M049','PVC Cement (4oz)','EA',5.00),
('M050','1/2" Ball Valve Brass','EA',12.50),
('M051','3/4" Ball Valve Brass','EA',18.00),
('M052','1" Ball Valve Brass','EA',28.00),
('M053','1/2" Angle Stop','EA',8.50),
('M054','3/4" Angle Stop','EA',11.00),
('M055','1/2" Straight Stop','EA',8.50),
('M056','1/2" Gate Valve','EA',10.00),
('M057','3/4" Gate Valve','EA',14.00),
('M058','3/4" PRV (Watts 25AUB)','EA',55.00),
('M059','1" PRV','EA',75.00),
('M060','1-1/4" PRV','EA',95.00),
('M061','3/4" Dielectric Union','EA',8.50),
('M062','Vacuum Breaker 3/4"','EA',9.00),
('M063','Ball Check Valve 1-1/2"','EA',18.00),
('M064','Ball Check Valve 2"','EA',22.00),
('M065','1/2" PEX Ball Valve','EA',14.00),
('M066','40 Gal Gas WH (Rheem 6yr)','EA',550.00),
('M067','50 Gal Gas WH (Rheem 6yr)','EA',650.00),
('M068','75 Gal Gas WH (Commercial)','EA',1100.00),
('M069','40 Gal Electric WH','EA',480.00),
('M070','50 Gal Electric WH','EA',560.00),
('M071','Tankless Gas WH Indoor','EA',850.00),
('M072','Tankless Gas WH Outdoor','EA',780.00),
('M073','Tankless Electric WH','EA',600.00),
('M074','Heat Pump Water Heater 50gal','EA',1200.00),
('M075','T&P Relief Valve 3/4"','EA',18.00),
('M076','18" Gas Flex Connector','EA',9.00),
('M077','Anode Rod (magnesium)','EA',22.00),
('M078','Thermal Expansion Tank 2gal','EA',45.00),
('M079','Thermal Expansion Tank 4.5gal','EA',65.00),
('M080','Sediment Trap/Drip Leg','EA',8.00),
('M081','WH Drain Pan (22")','EA',15.00),
('M082','WH Drain Pan (24")','EA',18.00),
('M083','Kitchen Faucet Mid-Grade','EA',120.00),
('M084','Kitchen Faucet High-Grade','EA',250.00),
('M085','Kitchen Faucet Pull-Down','EA',185.00),
('M086','Bath Faucet Single-Hole','EA',75.00),
('M087','Bath Faucet Widespread','EA',140.00),
('M088','Shower Valve Cartridge','EA',45.00),
('M089','Shower Pressure Valve (Moen)','EA',95.00),
('M090','Shower Trim Kit','EA',110.00),
('M091','Tub Spout (slip-fit)','EA',18.00),
('M092','Shower Head Standard','EA',35.00),
('M093','Shower Head Rain','EA',85.00),
('M094','Shower Arm 12"','EA',12.00),
('M095','Hose Bib 1/2"','EA',15.00),
('M096','Anti-Siphon Hose Bib 1/2"','EA',22.00),
('M097','Frost-Free Hose Bib 8"','EA',32.00),
('M098','Pot Filler Faucet','EA',195.00),
('M099','Bar/Prep Faucet','EA',95.00),
('M100','Toilet Standard 2pc Round','EA',150.00),
('M101','Toilet Comfort Height 2pc','EA',200.00),
('M102','Toilet 1pc Elongated','EA',350.00),
('M103','Toilet Fill Valve (Fluidmaster)','EA',12.00),
('M104','Toilet Flapper','EA',5.00),
('M105','Toilet Flush Valve Complete','EA',18.00),
('M106','Toilet Wax Ring','EA',6.00),
('M107','Toilet Wax Ring w/Horn','EA',9.00),
('M108','Toilet Supply Line 12"','EA',8.00),
('M109','Toilet Bolt Set','EA',5.00),
('M110','Toilet Seat Standard','EA',30.00),
('M111','Toilet Seat Soft-Close','EA',55.00),
('M112','Bidet Toilet Seat','EA',180.00),
('M113','Toilet Tank Gasket','EA',8.00),
('M114','Toilet Handle','EA',8.00),
('M115','Kitchen Basket Strainer','EA',18.00),
('M116','Pop-Up Drain Assembly','EA',15.00),
('M117','Floor Drain 4"','EA',25.00),
('M118','Shower Drain Chrome','EA',18.00),
('M119','Linear Shower Drain 24"','EA',95.00),
('M120','Tub Drain (trip lever)','EA',35.00),
('M121','Laundry Standpipe 2"','EA',18.00),
('M122','Dishwasher Air Gap','EA',12.00),
('M123','1/2" Black Iron Pipe','LF',2.80),
('M124','3/4" Black Iron Pipe','LF',3.95),
('M125','1" Black Iron Pipe','LF',5.50),
('M126','1/2" CSST Flex Gas Line','LF',3.50),
('M127','3/4" CSST Flex Gas Line','LF',5.00),
('M128','1" CSST Flex Gas Line','LF',7.00),
('M129','1/2" Gas Ball Valve','EA',14.00),
('M130','3/4" Gas Ball Valve','EA',18.00),
('M131','1" Gas Ball Valve','EA',26.00),
('M132','Gas Appliance Connector 18"','EA',12.00),
('M133','Gas Leak Detector Spray','EA',5.00),
('M134','Pipe Dope (8oz)','EA',7.00),
('M135','Sump Pump 1/3 HP','EA',150.00),
('M136','Sump Pump 1/2 HP','EA',220.00),
('M137','Sump Pump 3/4 HP','EA',320.00),
('M138','Sewage Ejector Pump 1/2HP','EA',380.00),
('M139','Battery Backup Sump Pump','EA',275.00),
('M140','Sump Basin 18"x24"','EA',55.00),
('M141','Whole-House Sediment Filter','EA',45.00),
('M142','20"x4.5" Filter Cartridge','EA',22.00),
('M143','RO System 5-Stage','EA',220.00),
('M144','Water Softener 48k Grain','EA',650.00),
('M145','UV Disinfection System','EA',350.00),
('M146','Carbon Filter Whole House','EA',280.00),
('M147','Backflow Preventer 3/4"','EA',45.00),
('M148','Backflow Preventer 1"','EA',65.00),
('M149','Zone Control Valve 3/4"','EA',18.00),
('M150','Sprinkler Valve Box','EA',12.00),
('M151','Solder Lead-Free (1lb)','LB',14.00),
('M152','Flux Paste (4oz)','EA',6.00),
('M153','Teflon Tape 1/2"','EA',1.50),
('M154','Plumber''s Putty 14oz','EA',6.00),
('M155','Silicone Caulk Tube','EA',7.50),
('M156','Pipe Joint Compound 8oz','EA',7.00),
('M157','Supply Line 12" Braided SS','EA',7.00),
('M158','Supply Line 20" Braided SS','EA',9.00),
('M159','Water Alarm/Leak Detector','EA',18.00),
('M160','Drain Cleaning Enzyme (qt)','EA',14.00);

-- ── Seed: Tasks ────────────────────────────────────────────────────────────
-- IDs 1-20: Water Heaters
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('wh','Install 40 Gal Gas Water Heater (Standard)','WH Install',3.0,'2.5-3.5 hrs','Moderate','Includes haul-away of old unit; permit extra if required'),
('wh','Install 50 Gal Gas Water Heater','WH Install',3.5,'3-4 hrs','Moderate',''),
('wh','Install 75 Gal Gas Water Heater (Commercial)','WH Install',5.0,'4-6 hrs','Hard','May require commercial gas regulator upgrade'),
('wh','Install 40 Gal Electric Water Heater','WH Install',2.5,'2-3 hrs','Moderate','No gas line - faster install'),
('wh','Install 50 Gal Electric Water Heater','WH Install',3.0,'2.5-3.5 hrs','Moderate',''),
('wh','Install Tankless Gas Water Heater (Indoor)','WH Install',5.5,'4.5-7 hrs','Complex','Venting, gas upsizing, condensate drain - many variables'),
('wh','Install Tankless Gas Water Heater (Outdoor)','WH Install',4.5,'4-5.5 hrs','Hard','No venting required; weatherproof location needed'),
('wh','Install Tankless Electric Water Heater','WH Install',3.0,'2.5-4 hrs','Moderate','Verify electrical capacity (usually 2x 40-amp circuits)'),
('wh','Install Heat Pump Water Heater (50 gal)','WH Install',4.0,'3.5-5 hrs','Hard','Needs 7-ft ceiling, 700+ cu ft air space, condensate drain'),
('wh','Replace T&P Relief Valve','WH Repair',1.0,'0.75-1 hr','Easy','Always install new discharge pipe to code'),
('wh','Replace Anode Rod','WH Repair',1.0,'0.75-1 hr','Easy','May require element wrench; flush 2 gal during service'),
('wh','Install Thermal Expansion Tank (2 gal)','WH Parts',1.0,'0.75-1 hr','Easy','Required by code in closed systems'),
('wh','Install Thermal Expansion Tank (4.5 gal)','WH Parts',1.0,'0.75-1 hr','Easy','For 75-gal+ tanks or high-pressure systems'),
('wh','Install Water Heater Drain Pan','WH Parts',0.75,'0.5-1 hr','Easy','Slide under existing WH; route drain line to floor drain'),
('wh','Drain & Flush Water Heater (sediment)','WH Service',1.0,'1-1.5 hrs','Easy','Annual maintenance; includes anode rod inspection'),
('wh','Install PRV 3/4" (Pressure Reducing Valve)','WH Parts',1.75,'1.5-2.5 hrs','Moderate','Adjust to 55-65 PSI after install; test with gauge'),
('wh','Install PRV 1"','WH Parts',2.0,'1.5-2.5 hrs','Moderate',''),
('wh','Water Heater Diagnostic / No Hot Water','WH Diag',1.0,'0.5-1.5 hrs','Easy','Includes pilot relight, thermostat check, element test'),
('wh','Water Heater Tune-Up (full service)','WH Service',1.5,'1-2 hrs','Easy','Drain/flush + anode + T&P test + burner inspection'),
('wh','Convert Gas WH from LP to Natural Gas','WH Service',2.0,'1.5-2.5 hrs','Moderate','Orifice swap, regulator adjustment, gas pressure verification');

-- IDs 21-40: Faucets & Fixtures
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('ff','Replace Kitchen Faucet (Mid-Grade)','Faucet Replace',1.5,'1-2 hrs','Easy','Includes basket strainer inspection'),
('ff','Replace Kitchen Faucet (High-Grade / Pull-Down)','Faucet Replace',2.0,'1.5-2.5 hrs','Easy',''),
('ff','Replace Bathroom Faucet (Single Hole)','Faucet Replace',1.5,'1-2 hrs','Easy',''),
('ff','Replace Bathroom Faucet (Widespread 3-Hole)','Faucet Replace',2.0,'1.5-2.5 hrs','Moderate',''),
('ff','Replace Bar / Prep Sink Faucet','Faucet Replace',1.5,'1-2 hrs','Easy',''),
('ff','Install Pot Filler Faucet (at range)','Faucet Install',3.5,'3-4.5 hrs','Hard','Wall-mount - requires access behind tile or drywall; patch not included'),
('ff','Replace Shower Valve Cartridge','Faucet Repair',1.5,'1-2 hrs','Moderate','Identify brand before ordering cartridge'),
('ff','Install New Shower Pressure Balance Valve','Faucet Install',3.0,'2.5-4 hrs','Hard','Requires wall access; tile patch not included'),
('ff','Replace Shower Trim Kit Only','Faucet Replace',1.0,'0.75-1 hr','Easy','Handle, escutcheon, cartridge cover - no valve work'),
('ff','Replace Tub Spout','Faucet Replace',0.5,'0.5 hr','Easy','Slip-fit or threaded - confirm type before ordering'),
('ff','Replace Shower Head','Faucet Replace',0.5,'0.5 hr','Easy',''),
('ff','Install Rain Shower Head (ceiling mount)','Faucet Install',1.0,'0.75-1.5 hrs','Moderate','May need longer arm or ceiling adapter'),
('ff','Replace Standard Hose Bib','Faucet Replace',1.5,'1-2 hrs','Moderate',''),
('ff','Replace Anti-Siphon Hose Bib','Faucet Replace',1.5,'1-2 hrs','Moderate','Code required in most jurisdictions'),
('ff','Replace Frost-Free Hose Bib (8")','Faucet Replace',2.0,'1.5-2.5 hrs','Moderate',''),
('ff','Install New Hose Bib (new location)','Faucet Install',3.5,'3-5 hrs','Hard','Includes running PEX supply; wall/siding patch not included'),
('ff','Rebuild Leaking Faucet (cartridge)','Faucet Repair',1.0,'0.75-1.5 hrs','Moderate',''),
('ff','Rebuild Leaking Faucet (ball/ceramic disc)','Faucet Repair',1.25,'1-1.5 hrs','Moderate','Ball type: seat/spring kit; ceramic: full cartridge'),
('ff','Install Dishwasher Air Gap','Faucet Install',0.75,'0.5-1 hr','Easy','Code required with dishwasher in most areas'),
('ff','Faucet/Fixture Diagnostic','Faucet Diag',0.5,'0.5 hr','Easy','Diagnose drip, low flow, or no water issue');

-- IDs 41-60: Toilets
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('toi','Replace Toilet (Standard Round 2-Piece)','Toilet Install',2.0,'1.5-2.5 hrs','Easy','Haul-away included; flange inspection included'),
('toi','Replace Toilet (Comfort Height 2-Piece)','Toilet Install',2.0,'1.5-2.5 hrs','Easy',''),
('toi','Replace Toilet (1-Piece Elongated)','Toilet Install',2.5,'2-3 hrs','Moderate','Heavier - may require 2 techs'),
('toi','Install Bidet Toilet Seat','Toilet Parts',0.75,'0.5-1 hr','Easy','Includes T-valve; no new plumbing'),
('toi','Replace Toilet Fill Valve','Toilet Repair',0.75,'0.5-1 hr','Easy','Fixes running, hissing, or slow-fill toilet'),
('toi','Replace Toilet Flapper','Toilet Repair',0.5,'0.5 hr','Easy','Most common repair - stops running toilet'),
('toi','Replace Flush Valve Assembly','Toilet Repair',1.0,'0.75-1.5 hrs','Moderate','Requires draining tank'),
('toi','Replace Fill Valve + Flapper (combo)','Toilet Repair',1.0,'0.75-1 hr','Easy','Best value for running toilet'),
('toi','Replace Tank-to-Bowl Gasket','Toilet Repair',1.25,'1-1.5 hrs','Moderate','Fixes leak between tank and bowl'),
('toi','Replace Toilet Handle & Lever','Toilet Repair',0.5,'0.5 hr','Easy',''),
('toi','Replace Toilet Supply Line','Toilet Repair',0.5,'0.5 hr','Easy',''),
('toi','Replace Toilet Shut-Off (Angle Stop)','Toilet Repair',1.0,'0.75-1 hr','Moderate',''),
('toi','Replace Toilet Seat','Toilet Parts',0.5,'0.5 hr','Easy',''),
('toi','Replace Toilet Seat (Soft-Close)','Toilet Parts',0.5,'0.5 hr','Easy',''),
('toi','Reset Toilet - Wax Ring Replacement','Toilet Repair',1.75,'1.5-2 hrs','Moderate','Remove, inspect flange, reset, re-supply'),
('toi','Reset Toilet - Wax Ring w/Horn','Toilet Repair',2.0,'1.5-2.5 hrs','Moderate','Thick floor - tile, mud bed'),
('toi','Repair Toilet Flange (broken)','Toilet Repair',2.0,'1.5-2.5 hrs','Hard','Flange repair ring or PVC replacement'),
('toi','Unclog Toilet (closet auger)','Toilet Drain',0.75,'0.5-1 hr','Easy',''),
('toi','Diagnose Toilet Leak / Running Water','Toilet Diag',0.75,'0.5-1 hr','Easy','Includes dye test; recommend repair parts'),
('toi','Toilet Rough-In (new installation)','Toilet Install',3.5,'3-5 hrs','Hard','DWV rough-in + supply rough-in; fixture install separate');

-- IDs 61-84: Drains & Sewer
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('ds','Machine Snake Kitchen Drain (50ft)','Drain Clear',1.0,'0.75-1.5 hrs','Easy','Hand-feed machine through cleanout or fixture'),
('ds','Machine Snake Main Line (75ft)','Drain Clear',1.5,'1-2 hrs','Moderate','Through main cleanout; locate blockage before snaking'),
('ds','Machine Snake Bathroom Drain','Drain Clear',0.75,'0.5-1 hr','Easy',''),
('ds','Hydro-Jet Drain Line (up to 100ft)','Drain Clear',2.5,'2-3 hrs','Moderate','5,000+ PSI - grease/scale/root cutting'),
('ds','Hydro-Jet with Camera Inspection','Drain Clear',3.5,'3-4 hrs','Hard','Full-service: jet + video before & after'),
('ds','Camera Inspection (sewer/drain line)','Drain Inspect',1.5,'1-2 hrs','Moderate','Provide video/photo report; locate damage or root intrusion'),
('ds','Locate Underground Drain Line','Drain Inspect',1.0,'0.75-1.5 hrs','Moderate','Camera + locator wand; mark on ground'),
('ds','Replace P-Trap (Bathroom Sink, PVC)','Drain Replace',0.75,'0.5-1 hr','Easy',''),
('ds','Replace P-Trap (Kitchen Sink, Chrome)','Drain Replace',0.75,'0.5-1 hr','Easy',''),
('ds','Replace P-Trap (Double Kitchen Sink)','Drain Replace',1.25,'1-1.5 hrs','Easy',''),
('ds','Replace Kitchen Basket Strainer','Drain Replace',1.0,'0.75-1 hr','Easy',''),
('ds','Replace Double Basket Strainer','Drain Replace',1.5,'1-1.5 hrs','Easy',''),
('ds','Replace Pop-Up Drain (bathroom sink)','Drain Replace',0.75,'0.5-1 hr','Easy',''),
('ds','Replace Shower Drain','Drain Replace',1.25,'1-1.5 hrs','Easy',''),
('ds','Install Linear Shower Drain','Drain Replace',2.5,'2-3 hrs','Hard','Requires mortar bed slope reconfiguration - tile not included'),
('ds','Replace Tub Drain (trip lever)','Drain Replace',1.5,'1-2 hrs','Moderate','Access through trip lever plate'),
('ds','Install Laundry Standpipe & P-Trap','Drain Install',2.0,'1.5-2.5 hrs','Moderate',''),
('ds','Install 4" Cleanout','Drain Install',2.5,'2-3 hrs','Hard','Core drill / saw concrete if needed - extra charge'),
('ds','Replace 4" Fernco Coupling','Drain Repair',1.5,'1-2 hrs','Moderate','Cast iron to PVC repair'),
('ds','Replace 3" Fernco Coupling','Drain Repair',1.5,'1-2 hrs','Moderate',''),
('ds','Repair PVC Drain (per 5 LF section)','Drain Repair',2.5,'2-3.5 hrs','Hard','Cut out failed section; replace with PVC & couplings'),
('ds','Clear Floor Drain (machine snake)','Drain Clear',1.0,'0.75-1.5 hrs','Easy',''),
('ds','Install Floor Drain (4")','Drain Install',3.0,'2.5-4 hrs','Hard','Concrete saw/core extra; includes P-trap rough-in'),
('ds','Drain Diagnostic / Slow Drain','Drain Diag',0.75,'0.5-1 hr','Easy','Recommend snake, hydro-jet, or camera');

-- IDs 85-105: Water Lines
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('wl','Replace 1/2" Angle Stop Valve','Valve Replace',0.75,'0.5-1 hr','Easy','Under-sink or toilet shutoff'),
('wl','Replace 3/4" Angle Stop','Valve Replace',0.75,'0.5-1 hr','Easy',''),
('wl','Replace Straight Stop Valve (1/2")','Valve Replace',0.75,'0.5-1 hr','Easy',''),
('wl','Replace Main Shut-Off (3/4" Ball Valve)','Valve Replace',2.0,'1.5-2.5 hrs','Moderate','Requires shutting off at meter; notify occupants'),
('wl','Replace Main Shut-Off (1" Ball Valve)','Valve Replace',2.25,'2-3 hrs','Moderate',''),
('wl','Install New Ball Valve (1/2", copper)','Valve Install',1.25,'1-1.5 hrs','Moderate',''),
('wl','Install New Ball Valve (3/4", copper)','Valve Install',1.5,'1-2 hrs','Moderate',''),
('wl','Install New Ball Valve (1/2", PEX SharkBite)','Valve Install',0.75,'0.5-1 hr','Easy','SharkBite push-fit - fastest option'),
('wl','Repair Pinhole Copper Leak (1/2" - SharkBite)','Leak Repair',1.0,'0.75-1.5 hrs','Easy','Cut out bad section; insert repair coupling'),
('wl','Repair Pinhole Copper Leak (3/4" - SharkBite)','Leak Repair',1.0,'0.75-1.5 hrs','Easy',''),
('wl','Repair Pinhole Copper Leak (1/2" - solder)','Leak Repair',1.5,'1-2 hrs','Moderate','Must drain and dry pipe before soldering'),
('wl','Re-pipe Single Fixture (PEX, to 20 LF)','Re-pipe',3.0,'2.5-4 hrs','Hard','Includes access; drywall patch not included'),
('wl','Re-pipe Single Fixture (Copper, to 20 LF)','Re-pipe',4.0,'3-5 hrs','Hard',''),
('wl','Install Whole-House PEX Manifold System','Re-pipe',8.0,'6-10 hrs','Complex','Home-run manifold - each fixture gets dedicated 1/2" PEX'),
('wl','Install Washing Machine Valve Box','Utility Connect',2.0,'1.5-2.5 hrs','Moderate','Recessed box with hot, cold and drain standpipe'),
('wl','Install Refrigerator Ice Maker Line','Utility Connect',1.0,'0.75-1.5 hrs','Easy','1/4" PEX or copper to 1/4" compression'),
('wl','Install Outdoor Irrigation Shutoff & Backflow','Irrigation',2.5,'2-3 hrs','Moderate',''),
('wl','Install 1" Backflow Preventer (RPZ)','Irrigation',3.0,'2.5-4 hrs','Hard','Requires annual testing in most jurisdictions'),
('wl','Pressure Test Water System (leak search)','Diagnostic',1.5,'1-2 hrs','Moderate','Pressurize with air or water; locate hidden leaks'),
('wl','Install Water Leak Alarm / Sensor','Misc',0.5,'0.5 hr','Easy',''),
('wl','Install Hose Bib Vacuum Breaker','Misc',0.5,'0.5 hr','Easy','Code required on existing non-anti-siphon bibs');

-- IDs 106-124: Gas Lines
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('gas','Install Gas Appliance Connector (18")','Gas Connect',0.75,'0.5-1 hr','Easy','Range, dryer, fireplace, WH - verify BTU rating'),
('gas','Replace Gas Shut-Off Valve (1/2")','Gas Valve',1.0,'0.75-1 hr','Moderate','Purge line after work; relight pilots'),
('gas','Replace Gas Shut-Off Valve (3/4")','Gas Valve',1.0,'0.75-1 hr','Moderate',''),
('gas','Replace Gas Shut-Off Valve (1")','Gas Valve',1.25,'1-1.5 hrs','Moderate',''),
('gas','Install Gas Line - Black Iron (per 10 LF, 1/2")','Gas Line',2.0,'1.5-2.5 hrs','Moderate','Thread, dope, pressure test - per 10 linear feet'),
('gas','Install Gas Line - Black Iron (per 10 LF, 3/4")','Gas Line',2.5,'2-3 hrs','Moderate',''),
('gas','Install Gas Line - Black Iron (per 10 LF, 1")','Gas Line',3.0,'2.5-3.5 hrs','Hard',''),
('gas','Install CSST Flex Gas Line (per 10 LF, 1/2")','Gas Line',1.5,'1-2 hrs','Moderate','Bonding/grounding required per current codes'),
('gas','Install CSST Flex Gas Line (per 10 LF, 3/4")','Gas Line',2.0,'1.5-2.5 hrs','Moderate',''),
('gas','Gas Line Pressure Test (system)','Gas Inspect',1.0,'0.75-1.5 hrs','Moderate','10 PSI test / 15 min for residential'),
('gas','Repair Gas Leak - Minor (accessible fitting)','Gas Repair',1.5,'1-2 hrs','Moderate','Rethread or replace fitting; pressure test after'),
('gas','Repair Gas Leak - Concealed (open wall)','Gas Repair',3.0,'2.5-4 hrs','Hard','Wall patch not included'),
('gas','Install Drip Leg / Sediment Trap','Gas Parts',1.0,'0.75-1 hr','Easy','Required at each appliance per code'),
('gas','Install Gas Line to Range (new location)','Gas Install',3.5,'3-4.5 hrs','Hard',''),
('gas','Install Gas Line to Dryer (new location)','Gas Install',2.5,'2-3.5 hrs','Hard',''),
('gas','Install Gas Line to Standby Generator','Gas Install',4.0,'3.5-5 hrs','Hard','Size line for generator BTU demand - often 3/4" or 1"'),
('gas','Install Gas Line to Outdoor Kitchen / BBQ','Gas Install',3.0,'2.5-4 hrs','Hard','UV-rated CSST or black iron after weatherhead'),
('gas','Convert Appliance LP to Natural Gas','Gas Service',1.5,'1-2 hrs','Moderate','Orifice swap + regulator adjustment + pressure verification'),
('gas','Gas Diagnostic / Odor Investigation','Gas Diag',1.5,'1-2 hrs','Moderate','Includes pressure test and appliance inspection');

-- IDs 125-137: Sump & Sewage
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('ss','Replace Sump Pump (1/3 HP)','Sump Replace',1.5,'1-2 hrs','Easy','Test float switch and discharge head pressure'),
('ss','Replace Sump Pump (1/2 HP)','Sump Replace',1.5,'1-2 hrs','Easy',''),
('ss','Replace Sump Pump (3/4 HP - heavy duty)','Sump Replace',2.0,'1.5-2.5 hrs','Moderate','For deep pits or long discharge runs'),
('ss','Install Battery Backup Sump Pump','Sump Install',2.5,'2-3 hrs','Moderate','Piggyback float; test both primary and backup'),
('ss','Install New Sump Pit & Pump (complete)','Sump Install',8.0,'6-10 hrs','Complex','Excavate pit, liner, pump, discharge - concrete extra'),
('ss','Replace Check Valve (1.5" - sump line)','Sump Parts',1.0,'0.75-1 hr','Easy','Spring-loaded check valve; install in vertical discharge pipe'),
('ss','Replace Check Valve (2" - sump line)','Sump Parts',1.0,'0.75-1 hr','Easy',''),
('ss','Extend Sump Discharge Line (per 10 LF)','Sump Install',1.5,'1-2 hrs','Easy','Route away from foundation; slope 1/4" per foot'),
('ss','Replace Sewage Ejector Pump','Ejector Replace',3.0,'2.5-4 hrs','Hard','Includes basin lid gasket and vent stack inspection'),
('ss','Install Sewage Ejector System (complete)','Ejector Install',8.0,'6-10 hrs','Complex','Includes basin, pump, discharge, vent connection'),
('ss','Clean Sump Pit (maintenance)','Sump Service',1.0,'0.75-1.5 hrs','Easy','Remove debris, clean pit walls, inspect pump'),
('ss','Sump Pump Annual Inspection','Sump Service',0.75,'0.5-1 hr','Easy','Float test, check valve inspection, discharge line check'),
('ss','Sump Pump Diagnostic','Sump Diag',1.0,'0.75-1.5 hrs','Easy','Float, check valve, electrical - determine cause');

-- IDs 138-148: Water Treatment
INSERT INTO pb_tasks (category_id,name,tag,hours,time_range,difficulty,notes) VALUES
('wt','Install Whole-House Sediment Filter','W.Treat Install',1.5,'1-2 hrs','Easy','1" or 3/4" ports; includes shutoff valves'),
('wt','Install Whole-House Carbon Filter','W.Treat Install',2.0,'1.5-2.5 hrs','Moderate','For chlorine/taste/odor'),
('wt','Replace 20"x4.5" Filter Cartridge','W.Treat Service',0.5,'0.5 hr','Easy','Annual replacement recommended'),
('wt','Install Under-Sink RO System (5-Stage)','W.Treat Install',2.5,'2-3 hrs','Moderate','Includes faucet tap and tank installation'),
('wt','Replace RO Filter Set','W.Treat Service',1.0,'0.75-1.5 hrs','Easy','Annual membrane, 6-month pre/post filters'),
('wt','Install Water Softener (48k grain)','W.Treat Install',4.5,'4-5.5 hrs','Hard','Includes bypass valve, drain line, brine tank setup'),
('wt','Service Water Softener (annual)','W.Treat Service',1.25,'1-1.5 hrs','Easy','Brine tank clean, resin check, settings verify'),
('wt','Install UV Disinfection System','W.Treat Install',2.0,'1.5-2.5 hrs','Moderate','Germicidal UV - for well water or post-carbon'),
('wt','Install Multi-Stage Whole-House System','W.Treat Install',3.5,'3-4.5 hrs','Hard','Sediment + carbon + UV combo skid'),
('wt','Water Quality Test & Analysis','W.Treat Diag',1.0,'0.75-1.5 hrs','Easy','Collect samples; recommend treatment based on results'),
('wt','Install Backflow Preventer on Softener Loop','W.Treat Parts',1.0,'0.75-1.5 hrs','Easy','Code required to protect potable supply');

-- ── Seed: Task Materials ───────────────────────────────────────────────────
-- WH (tasks 1-20)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 1: Install 40 Gal Gas WH (Standard)
(1,'M066',1),(1,'M076',1),(1,'M061',2),(1,'M075',1),(1,'M080',1),(1,'M050',1),(1,'M051',1),(1,'M157',2),(1,'M081',1),
-- 2: Install 50 Gal Gas WH
(2,'M067',1),(2,'M076',1),(2,'M061',2),(2,'M075',1),(2,'M080',1),(2,'M051',1),(2,'M157',2),(2,'M082',1),
-- 3: Install 75 Gal Gas WH (Commercial)
(3,'M068',1),(3,'M076',1),(3,'M061',2),(3,'M075',1),(3,'M080',1),(3,'M052',1),(3,'M158',2),
-- 4: Install 40 Gal Electric WH
(4,'M069',1),(4,'M061',2),(4,'M075',1),(4,'M050',1),(4,'M157',2),(4,'M081',1),
-- 5: Install 50 Gal Electric WH
(5,'M070',1),(5,'M061',2),(5,'M075',1),(5,'M051',1),(5,'M157',2),(5,'M082',1),
-- 6: Install Tankless Gas WH (Indoor)
(6,'M071',1),(6,'M076',1),(6,'M129',1),(6,'M050',2),(6,'M051',1),(6,'M078',1),(6,'M158',2),(6,'M153',2),
-- 7: Install Tankless Gas WH (Outdoor)
(7,'M072',1),(7,'M076',1),(7,'M129',1),(7,'M050',2),(7,'M078',1),(7,'M158',2),(7,'M153',2),
-- 8: Install Tankless Electric WH
(8,'M073',1),(8,'M050',2),(8,'M157',2),(8,'M153',2),
-- 9: Install Heat Pump WH
(9,'M074',1),(9,'M061',2),(9,'M075',1),(9,'M051',1),(9,'M079',1),(9,'M157',2),
-- 10: Replace T&P Relief Valve
(10,'M075',1),(10,'M001',3),(10,'M006',1),
-- 11: Replace Anode Rod
(11,'M077',1),
-- 12: Install Thermal Expansion Tank (2 gal)
(12,'M078',1),(12,'M051',1),(12,'M153',1),
-- 13: Install Thermal Expansion Tank (4.5 gal)
(13,'M079',1),(13,'M051',1),(13,'M153',1),
-- 14: Install WH Drain Pan
(14,'M081',1),
-- 15: Drain & Flush WH
(15,'M153',1),
-- 16: Install PRV 3/4"
(16,'M058',1),(16,'M051',2),(16,'M153',1),
-- 17: Install PRV 1"
(17,'M059',1),(17,'M052',2),(17,'M153',1),
-- 18: WH Diagnostic - no materials
-- 19: WH Tune-Up
(19,'M077',1),(19,'M075',1),(19,'M153',1),
-- 20: Convert Gas WH LP to NG
(20,'M076',1),(20,'M129',1),(20,'M133',1);

-- FF (tasks 21-40)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 21: Replace Kitchen Faucet (Mid-Grade)
(21,'M083',1),(21,'M157',2),(21,'M154',1),
-- 22: Replace Kitchen Faucet (High-Grade / Pull-Down)
(22,'M085',1),(22,'M157',2),(22,'M154',1),
-- 23: Replace Bathroom Faucet (Single Hole)
(23,'M086',1),(23,'M157',2),(23,'M116',1),
-- 24: Replace Bathroom Faucet (Widespread 3-Hole)
(24,'M087',1),(24,'M157',2),(24,'M116',1),
-- 25: Replace Bar / Prep Sink Faucet
(25,'M099',1),(25,'M157',2),
-- 26: Install Pot Filler Faucet
(26,'M098',1),(26,'M001',8),(26,'M006',4),(26,'M010',2),(26,'M050',1),(26,'M153',2),(26,'M151',0.25),(26,'M152',1),
-- 27: Replace Shower Valve Cartridge
(27,'M088',1),
-- 28: Install New Shower Pressure Balance Valve
(28,'M089',1),(28,'M090',1),(28,'M001',4),(28,'M006',2),
-- 29: Replace Shower Trim Kit Only
(29,'M090',1),
-- 30: Replace Tub Spout
(30,'M091',1),(30,'M153',1),
-- 31: Replace Shower Head
(31,'M092',1),(31,'M094',1),(31,'M153',1),
-- 32: Install Rain Shower Head
(32,'M093',1),(32,'M094',1),(32,'M153',1),
-- 33: Replace Standard Hose Bib
(33,'M095',1),(33,'M016',2),(33,'M153',1),
-- 34: Replace Anti-Siphon Hose Bib
(34,'M096',1),(34,'M016',2),(34,'M153',1),
-- 35: Replace Frost-Free Hose Bib (8")
(35,'M097',1),(35,'M016',3),(35,'M153',1),
-- 36: Install New Hose Bib (new location)
(36,'M097',1),(36,'M017',12),(36,'M019',3),(36,'M050',1),(36,'M062',1),(36,'M153',2),
-- 37: Rebuild Leaking Faucet (cartridge)
(37,'M088',1),
-- 38: Rebuild Leaking Faucet (ball/ceramic disc)
(38,'M088',1),
-- 39: Install Dishwasher Air Gap
(39,'M122',1);
-- 40: Faucet/Fixture Diagnostic - no materials

-- TOI (tasks 41-60)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 41: Replace Toilet (Standard Round 2-Piece)
(41,'M100',1),(41,'M106',1),(41,'M108',1),(41,'M109',1),(41,'M154',1),
-- 42: Replace Toilet (Comfort Height 2-Piece)
(42,'M101',1),(42,'M106',1),(42,'M108',1),(42,'M109',1),(42,'M154',1),
-- 43: Replace Toilet (1-Piece Elongated)
(43,'M102',1),(43,'M107',1),(43,'M108',1),(43,'M109',1),(43,'M154',1),
-- 44: Install Bidet Toilet Seat
(44,'M112',1),(44,'M108',1),
-- 45: Replace Toilet Fill Valve
(45,'M103',1),(45,'M153',1),
-- 46: Replace Toilet Flapper
(46,'M104',1),
-- 47: Replace Flush Valve Assembly
(47,'M105',1),(47,'M104',1),(47,'M113',1),
-- 48: Replace Fill Valve + Flapper (combo)
(48,'M103',1),(48,'M104',1),
-- 49: Replace Tank-to-Bowl Gasket
(49,'M113',1),(49,'M153',1),
-- 50: Replace Toilet Handle & Lever
(50,'M114',1),
-- 51: Replace Toilet Supply Line
(51,'M108',1),
-- 52: Replace Toilet Shut-Off (Angle Stop)
(52,'M053',1),(52,'M108',1),(52,'M001',1),(52,'M153',1),
-- 53: Replace Toilet Seat
(53,'M110',1),
-- 54: Replace Toilet Seat (Soft-Close)
(54,'M111',1),
-- 55: Reset Toilet - Wax Ring
(55,'M106',1),(55,'M109',1),(55,'M154',1),
-- 56: Reset Toilet - Wax Ring w/Horn
(56,'M107',1),(56,'M109',1),(56,'M154',1),
-- 57: Repair Toilet Flange (broken)
(57,'M036',1),(57,'M042',1),(57,'M106',1),(57,'M109',1),
-- 58: Unclog Toilet - no materials
-- 59: Diagnose Toilet - no materials
-- 60: Toilet Rough-In
(60,'M037',6),(60,'M044',2),(60,'M043',1),(60,'M053',1),(60,'M016',10),(60,'M048',1),(60,'M049',1);

-- DS (tasks 61-84)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 61-67: drain clearing/inspection - no materials
-- 68: Replace P-Trap (Bathroom Sink, PVC)
(68,'M038',1),(68,'M153',1),
-- 69: Replace P-Trap (Kitchen Sink, Chrome)
(69,'M041',1),(69,'M154',1),
-- 70: Replace P-Trap (Double Kitchen Sink)
(70,'M038',2),(70,'M035',2),(70,'M153',1),
-- 71: Replace Kitchen Basket Strainer
(71,'M115',1),(71,'M154',1),
-- 72: Replace Double Basket Strainer
(72,'M115',2),(72,'M154',1),
-- 73: Replace Pop-Up Drain
(73,'M116',1),(73,'M154',1),
-- 74: Replace Shower Drain
(74,'M118',1),(74,'M154',1),
-- 75: Install Linear Shower Drain
(75,'M119',1),(75,'M035',3),(75,'M039',1),(75,'M048',1),(75,'M049',1),
-- 76: Replace Tub Drain (trip lever)
(76,'M120',1),(76,'M154',1),
-- 77: Install Laundry Standpipe & P-Trap
(77,'M121',1),(77,'M039',1),(77,'M035',4),(77,'M048',1),(77,'M049',1),
-- 78: Install 4" Cleanout
(78,'M045',1),(78,'M037',3),(78,'M046',2),(78,'M048',1),(78,'M049',1),
-- 79: Replace 4" Fernco Coupling
(79,'M046',2),
-- 80: Replace 3" Fernco Coupling
(80,'M047',2),
-- 81: Repair PVC Drain (per 5 LF section)
(81,'M037',5),(81,'M046',2),(81,'M044',2),(81,'M048',1),(81,'M049',1),
-- 82: Clear Floor Drain - no materials
-- 83: Install Floor Drain (4")
(83,'M117',1),(83,'M037',4),(83,'M044',2),(83,'M048',1),(83,'M049',1);
-- 84: Drain Diagnostic - no materials

-- WL (tasks 85-105)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 85: Replace 1/2" Angle Stop Valve
(85,'M053',1),(85,'M001',1),(85,'M153',1),
-- 86: Replace 3/4" Angle Stop
(86,'M054',1),(86,'M001',1),(86,'M153',1),
-- 87: Replace Straight Stop Valve (1/2")
(87,'M055',1),(87,'M001',1),(87,'M153',1),
-- 88: Replace Main Shut-Off (3/4" Ball Valve)
(88,'M051',1),(88,'M001',2),(88,'M153',2),(88,'M151',0.25),(88,'M152',1),
-- 89: Replace Main Shut-Off (1" Ball Valve)
(89,'M052',1),(89,'M003',2),(89,'M153',2),(89,'M151',0.25),(89,'M152',1),
-- 90: Install New Ball Valve (1/2", copper)
(90,'M050',1),(90,'M001',3),(90,'M006',2),(90,'M153',2),(90,'M151',0.25),(90,'M152',1),
-- 91: Install New Ball Valve (3/4", copper)
(91,'M051',1),(91,'M002',3),(91,'M007',2),(91,'M153',2),(91,'M151',0.25),(91,'M152',1),
-- 92: Install New Ball Valve (1/2", PEX SharkBite)
(92,'M065',1),(92,'M016',3),(92,'M023',2),
-- 93: Repair Pinhole Copper Leak (1/2" - SharkBite)
(93,'M023',2),(93,'M016',2),
-- 94: Repair Pinhole Copper Leak (3/4" - SharkBite)
(94,'M024',2),(94,'M017',2),
-- 95: Repair Pinhole Copper Leak (1/2" - solder)
(95,'M001',3),(95,'M012',2),(95,'M153',2),(95,'M151',0.25),(95,'M152',1),
-- 96: Re-pipe Single Fixture (PEX, to 20 LF)
(96,'M016',20),(96,'M017',5),(96,'M023',4),(96,'M065',1),
-- 97: Re-pipe Single Fixture (Copper, to 20 LF)
(97,'M001',20),(97,'M002',5),(97,'M006',6),(97,'M010',3),(97,'M153',3),(97,'M151',0.5),(97,'M152',2),
-- 98: Install Whole-House PEX Manifold System
(98,'M017',30),(98,'M016',50),(98,'M021',8),(98,'M022',4),(98,'M065',12),(98,'M052',1),
-- 99: Install Washing Machine Valve Box
(99,'M051',2),(99,'M017',8),(99,'M011',2),(99,'M153',2),(99,'M151',0.25),(99,'M152',1),
-- 100: Install Refrigerator Ice Maker Line
(100,'M016',15),(100,'M053',1),(100,'M023',2),
-- 101: Install Outdoor Irrigation Shutoff & Backflow
(101,'M147',1),(101,'M051',2),(101,'M002',4),(101,'M007',2),(101,'M153',2),
-- 102: Install 1" Backflow Preventer (RPZ)
(102,'M148',1),(102,'M052',2),(102,'M003',4),(102,'M153',2),
-- 103: Pressure Test - no materials
-- 104: Install Water Leak Alarm
(104,'M159',1),
-- 105: Install Hose Bib Vacuum Breaker
(105,'M062',1),(105,'M153',1);

-- GAS (tasks 106-124)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 106: Install Gas Appliance Connector (18")
(106,'M132',1),(106,'M129',1),(106,'M134',1),(106,'M133',1),
-- 107: Replace Gas Shut-Off Valve (1/2")
(107,'M129',1),(107,'M134',1),(107,'M133',1),
-- 108: Replace Gas Shut-Off Valve (3/4")
(108,'M130',1),(108,'M134',1),(108,'M133',1),
-- 109: Replace Gas Shut-Off Valve (1")
(109,'M131',1),(109,'M134',1),(109,'M133',1),
-- 110: Install Gas Line Black Iron (1/2", per 10 LF)
(110,'M123',10),(110,'M134',1),(110,'M133',1),(110,'M129',1),
-- 111: Install Gas Line Black Iron (3/4", per 10 LF)
(111,'M124',10),(111,'M134',1),(111,'M133',1),(111,'M130',1),
-- 112: Install Gas Line Black Iron (1", per 10 LF)
(112,'M125',10),(112,'M134',1),(112,'M133',1),(112,'M131',1),
-- 113: Install CSST Flex Gas Line (1/2", per 10 LF)
(113,'M126',10),(113,'M134',1),(113,'M133',1),(113,'M129',1),
-- 114: Install CSST Flex Gas Line (3/4", per 10 LF)
(114,'M127',10),(114,'M134',1),(114,'M133',1),(114,'M130',1),
-- 115: Gas Line Pressure Test
(115,'M133',2),
-- 116: Repair Gas Leak - Minor
(116,'M134',1),(116,'M133',2),(116,'M129',1),
-- 117: Repair Gas Leak - Concealed
(117,'M123',5),(117,'M134',1),(117,'M133',2),(117,'M129',2),
-- 118: Install Drip Leg / Sediment Trap
(118,'M080',1),(118,'M123',2),(118,'M134',1),
-- 119: Install Gas Line to Range
(119,'M127',15),(119,'M130',2),(119,'M132',1),(119,'M134',1),(119,'M133',2),
-- 120: Install Gas Line to Dryer
(120,'M126',15),(120,'M129',2),(120,'M132',1),(120,'M134',1),(120,'M133',2),
-- 121: Install Gas Line to Standby Generator
(121,'M127',25),(121,'M130',2),(121,'M134',2),(121,'M133',2),
-- 122: Install Gas Line to Outdoor Kitchen / BBQ
(122,'M127',20),(122,'M130',2),(122,'M132',1),(122,'M134',1),(122,'M133',2),
-- 123: Convert Appliance LP to Natural Gas
(123,'M132',1),(123,'M133',1);
-- 124: Gas Diagnostic - no materials

-- SS (tasks 125-137)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 125: Replace Sump Pump (1/3 HP)
(125,'M135',1),(125,'M063',1),(125,'M034',3),(125,'M153',1),
-- 126: Replace Sump Pump (1/2 HP)
(126,'M136',1),(126,'M063',1),(126,'M034',3),(126,'M153',1),
-- 127: Replace Sump Pump (3/4 HP)
(127,'M137',1),(127,'M064',1),(127,'M034',3),(127,'M153',1),
-- 128: Install Battery Backup Sump Pump
(128,'M139',1),(128,'M063',1),(128,'M034',4),(128,'M153',1),
-- 129: Install New Sump Pit & Pump (complete)
(129,'M140',1),(129,'M136',1),(129,'M063',1),(129,'M034',12),(129,'M037',5),(129,'M048',1),(129,'M049',1),
-- 130: Replace Check Valve (1.5")
(130,'M063',1),(130,'M034',2),(130,'M153',1),
-- 131: Replace Check Valve (2")
(131,'M064',1),(131,'M035',2),(131,'M153',1),
-- 132: Extend Sump Discharge Line (per 10 LF)
(132,'M034',10),(132,'M039',2),(132,'M153',1),
-- 133: Replace Sewage Ejector Pump
(133,'M138',1),(133,'M064',1),(133,'M036',3),(133,'M153',1),
-- 134: Install Sewage Ejector System (complete)
(134,'M138',1),(134,'M140',1),(134,'M064',1),(134,'M036',8),(134,'M042',2),(134,'M048',1),(134,'M049',1);
-- 135-137: maintenance/diagnostic - no materials

-- WT (tasks 138-148)
INSERT INTO pb_task_materials (task_id,material_id,qty) VALUES
-- 138: Install Whole-House Sediment Filter
(138,'M141',1),(138,'M051',2),(138,'M017',5),(138,'M153',2),
-- 139: Install Whole-House Carbon Filter
(139,'M146',1),(139,'M051',2),(139,'M017',5),(139,'M153',2),
-- 140: Replace Filter Cartridge
(140,'M142',1),
-- 141: Install Under-Sink RO System
(141,'M143',1),(141,'M157',2),(141,'M053',1),
-- 142: Replace RO Filter Set - no materials (labor only)
-- 143: Install Water Softener
(143,'M144',1),(143,'M051',2),(143,'M017',8),(143,'M011',2),(143,'M153',3),
-- 144: Service Water Softener - no materials
-- 145: Install UV Disinfection System
(145,'M145',1),(145,'M051',2),(145,'M017',4),(145,'M153',2),
-- 146: Install Multi-Stage Whole-House System
(146,'M141',1),(146,'M146',1),(146,'M142',2),(146,'M051',2),(146,'M017',6),(146,'M153',2),
-- 147: Water Quality Test - no materials
-- 148: Install Backflow Preventer on Softener Loop
(148,'M147',1),(148,'M051',2),(148,'M153',1);

-- ── Seed: Engine Defaults ──────────────────────────────────────────────────
INSERT INTO pb_engine (id,wage,burden,truck,overhead,profit,misc,warranty)
VALUES (1,65,28,12,30,20,8,3);

COMMIT;

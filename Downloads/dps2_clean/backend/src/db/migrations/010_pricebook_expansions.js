'use strict';
/**
 * Migration 010: Fill gaps in HVAC, Electrical, Restoration, Renovations, and
 * Pest Control pricebooks. Plumbing is left alone (already at 250 tasks).
 *
 * Idempotent: each task keyed on (service, service_type, name). If a task with
 * the same name already exists on the same pricebook, it's skipped. New
 * materials use ON CONFLICT (id) DO NOTHING so they can be replayed safely.
 *
 * Adds:
 *   HVAC:         ~30 tasks + ~10 materials  (filter subs, boilers, PM plans, geothermal, Aeroseal)
 *   Electrical:   ~30 tasks + ~15 materials  (Al rework, pool bonding, doorbell, low-voltage, more)
 *   Restoration:  ~30 tasks + ~8 materials   (content cleaning, board-up, hoarding, trauma)
 *   Renovations:  ~30 tasks + ~10 materials  (kitchen island/pantry, bath safety, deck refresh, basement)
 *   Pest Control: ~30 tasks + ~10 materials  (birds/voles/skunks, termite bond tiers, drain flies)
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/010_pricebook_expansions.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ═══════════════════════════════════════════════════════════════════════════
// NEW MATERIALS
// ═══════════════════════════════════════════════════════════════════════════
const NEW_MATS = {
  // ── HVAC (H300+) ─
  H300: { d: 'Aeroseal Duct Sealing Session (per system)', u: 'EA', c: 285.00, cat: 'Duct Cleaning', svc: 'hvac' },
  H301: { d: 'Boiler — Cast Iron 100k BTU',           u: 'EA', c: 2850.00, cat: 'Furnaces', svc: 'hvac' },
  H302: { d: 'Boiler — Condensing High-Efficiency 150k BTU', u: 'EA', c: 4650.00, cat: 'Furnaces', svc: 'hvac' },
  H303: { d: 'Circulator Pump 1/25 HP',               u: 'EA', c: 145.00, cat: 'Motors', svc: 'hvac' },
  H304: { d: 'Expansion Tank — Hydronic 4.4gal',      u: 'EA', c: 65.00,  cat: 'Furnaces', svc: 'hvac' },
  H305: { d: 'Zone Valve 1"',                         u: 'EA', c: 85.00,  cat: 'Zoning', svc: 'hvac' },
  H306: { d: 'Package Rooftop A/C 3-Ton',             u: 'EA', c: 2450.00, cat: 'Condensers', svc: 'hvac' },
  H307: { d: 'Package Rooftop A/C 4-Ton',             u: 'EA', c: 2985.00, cat: 'Condensers', svc: 'hvac' },
  H308: { d: 'Geothermal Ground-Loop Fluid (per gal)', u: 'GA', c: 22.00, cat: 'Refrigerant', svc: 'hvac' },
  H309: { d: 'Refrigerant Recovery Cylinder Rental (per day)', u: 'DAY', c: 15.00, cat: 'Refrigerant', svc: 'hvac' },
  H310: { d: 'Static Pressure Test Kit (per day)',    u: 'DAY', c: 25.00, cat: 'Duct Cleaning', svc: 'hvac' },

  // ── Electrical (E280+) ─
  E280: { d: 'AlumiConn 3-Port Connector (25-pk)',    u: 'PK', c: 65.00, cat: 'Consumables', svc: 'electrical' },
  E281: { d: 'CO/ALR Rated Receptacle 15A',           u: 'EA', c: 6.50,  cat: 'Outlets', svc: 'electrical' },
  E282: { d: 'Cat6 Cable — Riser 500ft box',          u: 'EA', c: 135.00, cat: 'Wire', svc: 'electrical' },
  E283: { d: 'Cat6 Keystone Jack RJ45',               u: 'EA', c: 4.50,  cat: 'Outlets', svc: 'electrical' },
  E284: { d: 'Cat6 Faceplate — Dual Port',            u: 'EA', c: 3.50,  cat: 'Outlets', svc: 'electrical' },
  E285: { d: 'Doorbell Transformer 16V',              u: 'EA', c: 22.00, cat: 'Electrical', svc: 'electrical' },
  E286: { d: 'Smart Video Doorbell (customer supply)', u: 'EA', c: 0,     cat: 'Electrical', svc: 'electrical' },
  E287: { d: 'Wired Chime — Standard',                u: 'EA', c: 32.00, cat: 'Electrical', svc: 'electrical' },
  E288: { d: 'Pool Bonding Wire #8 Bare (per ft)',    u: 'LF', c: 1.80, cat: 'Wire', svc: 'electrical' },
  E289: { d: 'Pool Equipotential Grid Kit',           u: 'EA', c: 145.00, cat: 'Safety', svc: 'electrical' },
  E290: { d: 'GFCI Pool Outlet — 20A Weather Res.',   u: 'EA', c: 48.00, cat: 'Outlets', svc: 'electrical' },
  E291: { d: 'Whip 6ft 10AWG (hot tub subpanel)',     u: 'EA', c: 28.00, cat: 'Electrical', svc: 'electrical' },
  E292: { d: '50A GFCI Spa Panel',                    u: 'EA', c: 145.00, cat: 'Panels', svc: 'electrical' },
  E293: { d: 'Coax RG6 Quad-Shield (500ft box)',      u: 'EA', c: 165.00, cat: 'Wire', svc: 'electrical' },
  E294: { d: 'Speaker Wire 16/2 CL2 (500ft box)',     u: 'EA', c: 85.00, cat: 'Wire', svc: 'electrical' },

  // ── Restoration (R220+) ─
  R220: { d: 'Content Ultrasonic Cleaning (per hour)', u: 'HR', c: 45.00, cat: 'Content Cleaning', svc: 'restoration' },
  R221: { d: 'Ozone Chamber (per day)',               u: 'DAY', c: 65.00, cat: 'Content Cleaning', svc: 'restoration' },
  R222: { d: 'Board-Up 3/4" Plywood 4x8 (per sheet)', u: 'EA', c: 42.00, cat: 'Debris', svc: 'restoration' },
  R223: { d: 'Roof Tarp — 20x30 Heavy Poly',          u: 'EA', c: 85.00, cat: 'Debris', svc: 'restoration' },
  R224: { d: 'Wet-Dry Vac Bag / Filter',              u: 'EA', c: 8.00,  cat: 'Drying Equipment', svc: 'restoration' },
  R225: { d: 'Encapsulant Sealer 5-gal',              u: 'EA', c: 145.00, cat: 'Chemicals', svc: 'restoration' },
  R226: { d: 'Soot Sponge (chemical dry) 12-pk',      u: 'PK', c: 32.00, cat: 'Chemicals', svc: 'restoration' },
  R227: { d: 'Biohazard Hard Waste Bin (5 gal)',      u: 'EA', c: 28.00, cat: 'Debris', svc: 'restoration' },

  // ── Renovations (N400+) ─
  N400: { d: 'Kitchen Island 6ft — Custom Cabinet Box', u: 'EA', c: 985.00, cat: 'Cabinets', svc: 'renovations' },
  N401: { d: 'Pantry Slide-Out Drawer Kit (per drawer)', u: 'EA', c: 145.00, cat: 'Cabinets', svc: 'renovations' },
  N402: { d: 'Custom Floating Shelf — Walnut 36"',     u: 'EA', c: 85.00, cat: 'Trim', svc: 'renovations' },
  N403: { d: 'Grab Bar 18" (ADA compliant)',           u: 'EA', c: 45.00, cat: 'Bath Fixtures', svc: 'renovations' },
  N404: { d: 'Comfort-Height Toilet ADA',              u: 'EA', c: 285.00, cat: 'Bath Fixtures', svc: 'renovations' },
  N405: { d: 'Composite Fence Panel 6x8',              u: 'EA', c: 185.00, cat: 'Decks', svc: 'renovations' },
  N406: { d: 'Pressure-Treated Fence Panel 6x8',       u: 'EA', c: 65.00, cat: 'Decks', svc: 'renovations' },
  N407: { d: 'Patio Paver — Concrete 12x12 (per sqft)', u: 'SF', c: 4.50, cat: 'Decks', svc: 'renovations' },
  N408: { d: 'Pergola Kit — Cedar 10x10',              u: 'EA', c: 1250.00, cat: 'Decks', svc: 'renovations' },
  N409: { d: 'Garage Door Insulated 16ft — Steel',     u: 'EA', c: 985.00, cat: 'Doors & Windows', svc: 'renovations' },
  N410: { d: 'Garage Door Opener 3/4HP w/ Wi-Fi',      u: 'EA', c: 385.00, cat: 'Doors & Windows', svc: 'renovations' },
  N411: { d: 'Basement Framing Kit — Foam-Backed',     u: 'EA', c: 145.00, cat: 'Framing', svc: 'renovations' },
  N412: { d: 'Sunroom Kit — 12x14 (structure only)',   u: 'EA', c: 9850.00, cat: 'Framing', svc: 'renovations' },

  // ── Pest Control (P200+) ─
  P200: { d: 'Bird Spike Strip 10ft (stainless)',      u: 'EA', c: 32.00, cat: 'Wildlife', svc: 'pest_control' },
  P201: { d: 'Bird Netting 25x25 (nylon)',             u: 'EA', c: 125.00, cat: 'Wildlife', svc: 'pest_control' },
  P202: { d: 'Bird Gel Repellent (10oz tube)',         u: 'EA', c: 22.00, cat: 'Wildlife', svc: 'pest_control' },
  P203: { d: 'Mole/Vole Bait Worm Pack 20-pk',         u: 'PK', c: 28.00, cat: 'Wildlife', svc: 'pest_control' },
  P204: { d: 'Vole Trap Reusable',                     u: 'EA', c: 12.00, cat: 'Wildlife', svc: 'pest_control' },
  P205: { d: 'Skunk / Groundhog Live Trap',            u: 'EA', c: 72.00, cat: 'Wildlife', svc: 'pest_control' },
  P206: { d: 'Snake Trap Glue',                        u: 'EA', c: 18.00, cat: 'Wildlife', svc: 'pest_control' },
  P207: { d: 'Drain Fly Bio-Treatment (32oz)',         u: 'EA', c: 28.00, cat: 'Insecticides', svc: 'pest_control' },
  P208: { d: 'Termite Damage Repair Bond Rider (per home, admin)', u: 'EA', c: 45.00, cat: 'Termite', svc: 'pest_control' },
  P209: { d: 'Termite Sub-Slab Foam Concentrate 20oz', u: 'EA', c: 55.00, cat: 'Termite', svc: 'pest_control' },
};

// ═══════════════════════════════════════════════════════════════════════════
// NEW TASKS
// ═══════════════════════════════════════════════════════════════════════════

// ── HVAC ─────────────────────────────────────────────────────────────
const HVAC_INSTALL_NEW = [
  { cat:'hvac_dt', tag:'Duct Sealing', n:'Aeroseal Duct Sealing — Whole System', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Aerosol-based duct sealing that fills leaks from the inside. Test pre/post with static-pressure gauge. Typically reduces leakage 60-90%. Priced per system.',
    mats:[['H300',1],['H310',0.25]] },
  { cat:'hvac_furn', tag:'Boiler Install', n:'Cast-Iron Boiler Install 100k BTU', hrs:10, time:'10 hr', diff:'Complex',
    desc:'Install new 100k BTU cast-iron boiler for hydronic heat. Includes circulator pump, expansion tank, near-boiler piping, and startup. Existing zone plumbing retained.',
    mats:[['H301',1],['H303',1],['H304',1]] },
  { cat:'hvac_furn', tag:'Boiler Install', n:'Condensing Boiler Install 150k BTU (high-eff)', hrs:14, time:'~2 days', diff:'Complex',
    desc:'High-efficiency wall-mount condensing boiler. Includes PVC direct-vent, condensate drain, primary loop, and full commissioning.',
    mats:[['H302',1],['H303',2],['H304',1],['H183',1],['H182',2]] },
  { cat:'hvac_furn', tag:'Boiler', n:'Zone Valve Add (hydronic)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Add a zone valve + thermostat control on a hydronic heating system to split existing loop into a new zone.',
    mats:[['H305',1],['H094',1]] },
  { cat:'hvac_ac', tag:'Package RTU', n:'Package Rooftop Unit — 3-Ton Changeout', hrs:12, time:'~1.5 days', diff:'Complex',
    desc:'3-ton residential/light-commercial package rooftop A/C changeout. Includes crane lift, curb adapter, disconnect, and start-up.',
    mats:[['H306',1],['H130',1]] },
  { cat:'hvac_ac', tag:'Package RTU', n:'Package Rooftop Unit — 4-Ton Changeout', hrs:14, time:'~2 days', diff:'Complex',
    desc:'4-ton package unit changeout. Same scope as 3-ton but larger crane/rigging and possibly duct transition.',
    mats:[['H307',1],['H130',1]] },
  { cat:'hvac_hp', tag:'Geothermal', n:'Geothermal Heat Pump Startup & Commissioning', hrs:6, time:'6 hr', diff:'Complex',
    desc:'Ground-source heat pump startup: verify ground loop pressure, purge, top off antifreeze, and commission all zones. Assumes ground loop already installed.',
    mats:[['H308',5]] },
  { cat:'hvac_mini', tag:'Attic Install', n:'Attic Mini-Split Air Handler — 12k BTU', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Ducted mini-split air handler installed in attic serving 1-2 rooms via short flex runs. Great for adding conditioning to a bonus room.',
    mats:[['H051',1],['H061',2],['H070',2],['H080',1]] },
];

const HVAC_SERVICE_NEW = [
  { cat:'hvac_ac', tag:'Filter Sub', n:'Annual Filter Subscription — Standard (4 filters)', hrs:0.5, time:'quarterly delivery', diff:'Easy',
    desc:'Annual delivery of 4 standard 1" filters (16x25, 20x25, or 16x20) with quarterly reminder. Filter cost included.',
    mats:[['H103',0.5]] },
  { cat:'hvac_ac', tag:'Filter Sub', n:'Annual Filter Subscription — 5" Media (2 filters)', hrs:0.5, time:'semi-annual delivery', diff:'Easy',
    desc:'Annual delivery of 2 media-cabinet filters (16x25x5 or 20x25x5). Semi-annual delivery.',
    mats:[['H101',2]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Freon Retrofit Assessment (R-22 → R-410A)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Evaluate feasibility of R-22 system retrofit to R-410A. Includes system capacity check and quote for parts required.',
    mats:[] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Blower Wheel Cleaning', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Remove blower assembly, deep-clean wheel and housing. Restores airflow and reduces motor amp draw. Recommended every 3-5 years.',
    mats:[['H201',0.5]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Refrigerant Leak Repair — Braze Joint', hrs:2.5, time:'2.5 hr', diff:'Hard',
    desc:'Locate refrigerant leak, cut out failed joint, braze repair, evacuate, and recharge. Includes filter drier replacement.',
    mats:[['H172',1],['H176',1],['H001',3]] },
  { cat:'hvac_dt', tag:'Duct Repair', n:'Static Pressure Test & Airflow Balance', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Measure supply and return static pressure across the air handler. Adjust dampers to balance airflow across rooms. Written report.',
    mats:[['H310',0.5]] },
  { cat:'hvac_hp', tag:'HP Repair', n:'Geothermal Ground-Loop Pressure Check & Top-Off', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Check pressure on closed-loop geothermal system. Top off with antifreeze mixture as needed.',
    mats:[['H308',2]] },
  { cat:'hvac_iaq', tag:'IAQ Service', n:'ERV / HRV Annual Service', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Annual maintenance on energy or heat recovery ventilator: filter change, core inspection, motor amp check, damper test.',
    mats:[] },
  { cat:'hvac_iaq', tag:'IAQ Service', n:'Duct Decontamination — Post-Fire / Mold', hrs:6, time:'6 hr', diff:'Hard',
    desc:'HEPA-vac + antimicrobial fog of entire duct system after fire, water, or mold event. Includes coil face clean.',
    mats:[['H201',1],['H205',2]] },
  { cat:'hvac_maint', tag:'PM Plan', n:'Bi-Annual Maintenance Plan (1 system)', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Twice-yearly service (spring A/C + fall furnace) with priority scheduling and 10% off repairs. Popular starter plan.',
    mats:[] },
  { cat:'hvac_maint', tag:'PM Plan', n:'Premium Comfort Plan — 2 systems + IAQ',  hrs:6, time:'~1 day', diff:'Moderate',
    desc:'Premium plan: 4 tune-ups (2/system), IAQ inspection, filter subscription, 20% off repairs, no dispatch fee, warranty extensions.',
    mats:[['H103',2]] },
  { cat:'hvac_comm', tag:'Commercial', n:'Commercial RTU PM (per unit)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Quarterly PM on a single commercial rooftop unit. Includes belt / coil / drain check and refrigerant pressures.',
    mats:[['H202',0.25]] },
];

// ── ELECTRICAL ───────────────────────────────────────────────────────
const ELEC_INSTALL_NEW = [
  { cat:'elec_out', tag:'Outlet Install', n:'CO/ALR Aluminum-Rated Outlet Swap (per outlet)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace standard outlet with CO/ALR aluminum-rated outlet. Combined with AlumiConn pigtail for full aluminum remediation.',
    mats:[['E281',1],['E280',0.05]] },
  { cat:'elec_light', tag:'Doorbell', n:'Wired Doorbell + Chime Install', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Install new wired doorbell button, transformer, and interior chime. Includes running low-voltage wire up to 30 ft.',
    mats:[['E285',1],['E287',1],['E133',0.1]] },
  { cat:'elec_light', tag:'Doorbell', n:'Smart Video Doorbell Install (customer supplied)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install customer-supplied smart video doorbell. Includes 16V transformer upgrade if needed, mount, wire, and app pairing.',
    mats:[['E285',1],['E286',1]] },
  { cat:'elec_wire', tag:'Low-Voltage', n:'Cat6 Data Drop (per run, up to 50 ft)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Run one Cat6 data cable up to 50 ft from a central location to a room. Terminate at keystone jack and patch panel.',
    mats:[['E282',0.1],['E283',2],['E284',1]] },
  { cat:'elec_wire', tag:'Low-Voltage', n:'Whole-Home Cat6 Rough (8 rooms, new construction)', hrs:16, time:'2 days', diff:'Hard',
    desc:'Rough in Cat6 cabling to 8 rooms during new construction or rewire. Includes central patch panel and terminations.',
    mats:[['E282',1],['E283',16],['E284',8]] },
  { cat:'elec_wire', tag:'Low-Voltage', n:'Coax RG6 Drop (per run)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Run one RG6 coax cable to a TV location. Includes wall plate and F-connector terminations.',
    mats:[['E293',0.1]] },
  { cat:'elec_wire', tag:'Audio', n:'Whole-Home Speaker Wire Rough (per room)', hrs:2, time:'2 hr per room', diff:'Moderate',
    desc:'Run 16/2 CL2 speaker wire from central A/V location to a room with dual ceiling or wall speaker locations.',
    mats:[['E294',0.06]] },
  { cat:'elec_safe', tag:'Pool/Spa', n:'Pool Bonding Grid Install (equipotential)', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Install equipotential bonding grid around pool per NEC 680. Includes #8 bare copper, deck bonding, pump/motor bonds.',
    mats:[['E288',60],['E289',1],['E246',4]] },
  { cat:'elec_safe', tag:'Pool/Spa', n:'Pool GFCI Outlet Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install 20A weather-resistant GFCI outlet near pool with correct clearances per NEC.',
    mats:[['E290',1],['E086',1]] },
  { cat:'elec_safe', tag:'Pool/Spa', n:'Hot Tub Sub-Panel Install (50A GFCI)', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Install 50A GFCI spa panel with wire run up to 30 ft from main. Includes disconnect within sight of hot tub.',
    mats:[['E292',1],['E037',30],['E291',1]] },
  { cat:'elec_out', tag:'Outdoor', n:'Landscape Lighting Add-On (per 4 fixtures)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Add 4 low-voltage landscape fixtures to existing transformer. Includes wire tap and stake install.',
    mats:[['E150',4]] },
];

const ELEC_SERVICE_NEW = [
  { cat:'elec_diag', tag:'Service Call', n:'Aluminum Wire Full-Home Survey', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Full-home survey identifying every device on aluminum branch wiring. Written scope with total count and remediation cost.',
    mats:[] },
  { cat:'elec_wire', tag:'Rewire', n:'AlumiConn Pigtail Remediation — Full Home (up to 60 devices)', hrs:12, time:'~1.5 days', diff:'Hard',
    desc:'Remediate aluminum branch wiring at up to 60 devices (outlets + switches) using AlumiConn code-listed connectors. Copper pigtail to device.',
    mats:[['E280',3],['E264',2]] },
  { cat:'elec_light', tag:'Fan Repair', n:'Ceiling Fan Wobble Repair', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Diagnose ceiling fan wobble. Rebalance blades, torque mounting hardware, replace flywheel if needed.',
    mats:[] },
  { cat:'elec_light', tag:'Fan Repair', n:'Bath Exhaust Fan Motor Replace', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace motor in existing bath exhaust fan without swapping the housing. Preserves ceiling opening.',
    mats:[] },
  { cat:'elec_light', tag:'Doorbell', n:'Doorbell Diagnosis & Repair', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Diagnose non-working doorbell. Common causes: transformer, button, or chime. Repair or replace.',
    mats:[['E285',1]] },
  { cat:'elec_gen', tag:'Generator', n:'Generator Annual PM — Portable', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Annual PM on portable generator: oil, spark plug, inlet clean, and load test.',
    mats:[] },
  { cat:'elec_gen', tag:'Generator', n:'Generator Annual PM — Whole-Home (14kW/22kW)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Annual PM on standby generator: oil + filter, plug, battery, air filter, run under load, verify ATS.',
    mats:[] },
  { cat:'elec_safe', tag:'Safety Repair', n:'Interconnect Smoke Detectors on Existing Wiring', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Add interconnect wire between existing hardwired smoke detectors so one alarm triggers all. Up to 6 devices.',
    mats:[['E133',0.15]] },
  { cat:'elec_light', tag:'Lighting Repair', n:'Landscape Lighting Repair (per issue)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Diagnose and repair low-voltage landscape lighting: broken wire, dead fixture, transformer issue.',
    mats:[] },
  { cat:'elec_safe', tag:'Pool/Spa', n:'Pool/Spa Bonding Test & Report', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Voltage-gradient bonding test around pool/spa area. Written report and remediation quote if failed.',
    mats:[] },
  { cat:'elec_maint', tag:'Tune-Up', n:'EV Charger Annual Inspection', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Annual inspection of L2 EV charger: connection torque, thermal scan, receptacle wear check, firmware update.',
    mats:[] },
];

// ── RESTORATION ──────────────────────────────────────────────────────
const RESTO_DRYOUT_NEW = [
  { cat:'resto_wtr', tag:'Cavity Drying', n:'Structural Drying — Whole Floor (per 500 sqft)', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Full whole-floor drying using LGR + desiccant + air movers. Priced per 500 sqft of affected floor area.',
    mats:[['R001',5],['R002',3],['R003',15],['R011',0.5]] },
  { cat:'resto_sewage', tag:'Emergency', n:'Emergency Sewage Backup Response (after-hours)', hrs:3, time:'3 hr', diff:'Complex',
    desc:'After-hours emergency response for sewage backup. Rapid stabilization, extraction, and full Cat-3 protocol setup.',
    mats:[['R008',3],['R022',1],['R047',4]] },
  { cat:'resto_fire', tag:'Fire', n:'Soot Sponge Cleaning — Walls & Ceilings (per 500 sqft)', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Dry chemical sponge cleaning of soot from walls and ceilings. Priced per 500 sqft of surface area.',
    mats:[['R226',0.5],['R047',2]] },
  { cat:'resto_fire', tag:'Fire', n:'Smoke Sealer / Encapsulant Application (per 500 sqft)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Apply encapsulant sealer to affected framing/subfloor to lock in residual smoke odor before rebuild.',
    mats:[['R225',1.5]] },
  { cat:'resto_storm', tag:'Storm', n:'Emergency Board-Up — Standard (per opening)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Board-up a single window or door opening after storm/vandalism. Includes 3/4" plywood, screws, and disposal of removed material.',
    mats:[['R222',1],['R148',0.05]] },
  { cat:'resto_storm', tag:'Storm', n:'Emergency Roof Tarp — up to 400 sqft', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Emergency roof tarping to prevent further loss until permanent repair. Priced per 400 sqft of tarped area.',
    mats:[['R223',1],['R148',0.05]] },
  { cat:'resto_mold', tag:'Assessment', n:'Post-Remediation Verification (PRV) Air Sampling', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Collect post-remediation air samples for lab clearance testing. Priced per sample set (indoor + outdoor).',
    mats:[] },
];

const RESTO_REMOVAL_NEW = [
  { cat:'resto_packout', tag:'Content Cleaning', n:'Ultrasonic Content Cleaning (per hour, at facility)', hrs:1, time:'per hour', diff:'Moderate',
    desc:'Restore contents (electronics, hardware, artwork) using ultrasonic cleaning at facility. Priced per hour of clean time.',
    mats:[['R220',1]] },
  { cat:'resto_packout', tag:'Content Cleaning', n:'Ozone Chamber Deodorization (per pallet, per day)', hrs:0.5, time:'per day', diff:'Easy',
    desc:'Ozone deodorization of packed-out contents in sealed chamber. Removes smoke, mildew, and Cat-2 odors.',
    mats:[['R221',1]] },
  { cat:'resto_wtr', tag:'Hoarding', n:'Hoarding Cleanup — Category 1 (per crew hour)', hrs:1, time:'per hour', diff:'Hard',
    desc:'Hoarding cleanup labor for level 1 hoard (accessible pathways, moderate accumulation). Includes PPE and hauling coordination. Priced per crew hour.',
    mats:[['R047',0.3],['R050',0.2],['R060',0.5]] },
  { cat:'resto_wtr', tag:'Hoarding', n:'Hoarding Cleanup — Category 3 (per crew hour, biohazard)', hrs:1, time:'per hour', diff:'Complex',
    desc:'Level 3 hoard cleanup with biohazard components. Full PPE, respirators, dedicated waste stream, higher labor rate.',
    mats:[['R047',0.5],['R049',0.3],['R050',0.3],['R052',0.3],['R227',0.5]] },
  { cat:'resto_sewage', tag:'Trauma / Bio', n:'Trauma / Crime Scene Cleanup (per hour, minimum 4 hr)', hrs:1, time:'per hour', diff:'Complex',
    desc:'Specialized trauma / crime scene / unattended death cleanup. Full biohazard PPE, dedicated disposal, discretion. Minimum 4 hr billing.',
    mats:[['R047',0.5],['R049',0.3],['R022',0.2],['R227',0.5]] },
  { cat:'resto_fire', tag:'Fire Demo', n:'Fire-Damaged Contents Removal (per sqft of room)', hrs:0.1, time:'per sqft', diff:'Moderate',
    desc:'Photo-document and remove non-salvageable fire-damaged contents from a room. Includes bagging and disposal.',
    mats:[['R060',0.05]] },
  { cat:'resto_wtr', tag:'Debris', n:'Emergency Same-Day Dumpster Placement (upcharge)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Same-day dumpster placement for emergency losses. Upcharge over standard delivery timing.',
    mats:[] },
];

const RESTO_REBUILD_NEW = [
  { cat:'resto_finish', tag:'Cabinetry', n:'Kitchen Cabinet Reinstall (post-restoration, per LF)', hrs:0.5, time:'per LF', diff:'Moderate',
    desc:'Reinstall salvaged or new base + wall cabinets after floor/wall restoration. Level, shim, secure. Priced per LF.',
    mats:[] },
  { cat:'resto_finish', tag:'Bath', n:'Vanity Reinstall (post-flood)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Reinstall salvaged or new vanity with plumbing reconnect after floor replacement.',
    mats:[] },
  { cat:'resto_struct', tag:'Framing', n:'Sistered Joist Repair (per joist)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Sister damaged floor joist with matching lumber, glue and structural screws. Per joist.',
    mats:[['R143',1],['R148',0.1]] },
  { cat:'resto_finish', tag:'Drywall', n:'Drywall Ceiling Patch — Match Popcorn Texture (per patch)', hrs:2, time:'2 hr', diff:'Hard',
    desc:'Patch and match existing popcorn ceiling texture. Priced per typical 4x4 patch area.',
    mats:[['R080',0.25],['R083',0.1],['R084',0.05]] },
  { cat:'resto_finish', tag:'Paint', n:'Full-Room Repaint After Restoration (per 100 sqft wall)', hrs:2, time:'per 100 sqft', diff:'Easy',
    desc:'Prime + 2-coat paint of full room after restoration. Includes trim and ceiling touchup. Priced per 100 sqft wall area.',
    mats:[['R090',0.05],['R092',0.05],['R095',0.02]] },
  { cat:'resto_finish', tag:'Flooring', n:'Baseboard Reinstall Post-Dryout (per LF)', hrs:0.08, time:'per LF', diff:'Easy',
    desc:'Reinstall salvaged or new baseboard after wall/floor repairs. Includes caulk and paint prep.',
    mats:[] },
];

// ── RENOVATIONS ──────────────────────────────────────────────────────
const RENO_KITCHEN_NEW = [
  { cat:'reno_kit_cab', tag:'Island', n:'Kitchen Island Install — 6ft Custom Box', hrs:12, time:'~1.5 days', diff:'Hard',
    desc:'Install 6-ft custom kitchen island with base cabinets, seating overhang, and electrical rough-in for outlets. Countertop separate.',
    mats:[['N400',1],['N021',6],['N022',6]] },
  { cat:'reno_kit_cab', tag:'Island', n:'Kitchen Island — 8ft with Sink & Dishwasher', hrs:24, time:'~3 days', diff:'Complex',
    desc:'Larger island with plumbing and electrical for sink + dishwasher. Includes rough-in coordination.',
    mats:[['N400',1.3],['N046',1],['N082',1],['N083',1]] },
  { cat:'reno_kit_cab', tag:'Pantry', n:'Walk-In Pantry Buildout — Basic', hrs:16, time:'2 days', diff:'Hard',
    desc:'Frame and finish a small walk-in pantry (up to 40 sqft): studs, drywall, door, shelving, light. Assumes existing space and layout.',
    mats:[['N260',12],['N280',6],['N283',1],['N180',1],['N401',3]] },
  { cat:'reno_kit_cab', tag:'Storage', n:'Pull-Out Pantry Drawer Retrofit (per drawer)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install slide-out drawer kit in existing pantry/cabinet. Priced per drawer.',
    mats:[['N401',1]] },
  { cat:'reno_kit_cab', tag:'Shelving', n:'Custom Floating Shelves — Walnut (per shelf)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install one hardwood floating shelf up to 36". Includes hidden bracket and stud fastening.',
    mats:[['N402',1]] },
  { cat:'reno_kit_ct', tag:'Sink', n:'Kitchen Sink Faucet + Disposal Combo Swap', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Replace faucet + disposal + supply lines / P-trap under kitchen sink in one visit. Popular add-on to cabinet or countertop work.',
    mats:[['N048',1],['N083',1]] },
  { cat:'reno_kit_bs', tag:'Backsplash', n:'Cover Existing Backsplash with New Tile (per sqft)', hrs:0.45, time:'per sqft', diff:'Moderate',
    desc:'Tile over an existing backsplash after skim-coating for adhesion. Faster than demo + rebuild.',
    mats:[['N060',1],['N064',0.05]] },
];

const RENO_BATH_NEW = [
  { cat:'reno_bath_van', tag:'ADA', n:'ADA-Compliant Comfort-Height Toilet Install', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Install ADA-compliant comfort-height toilet with grab bar preparation on adjacent wall.',
    mats:[['N404',1]] },
  { cat:'reno_bath_shower', tag:'Safety', n:'Grab Bar Install (per bar, into studs)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install one ADA grab bar securely into studs or with heavy-duty anchors. Includes stud locate and drywall repair if needed.',
    mats:[['N403',1]] },
  { cat:'reno_bath_shower', tag:'Safety', n:'Full ADA Bath Retrofit — Package', hrs:16, time:'2 days', diff:'Hard',
    desc:'Aging-in-place package: 2 grab bars in shower, 1 by toilet, comfort-height toilet, hand-shower slide bar, and non-slip flooring add-on.',
    mats:[['N403',3],['N404',1]] },
  { cat:'reno_bath_shower', tag:'Repair', n:'Shower Door Replacement — Framed Sliding', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Remove existing shower door, install new 60" framed sliding kit. Includes shim and caulk.',
    mats:[['N116',1]] },
  { cat:'reno_bath_shower', tag:'Repair', n:'Shower Door Replacement — Frameless', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Install customer-selected frameless glass shower door. Includes template, hinge mounting, and glass level.',
    mats:[['N117',1]] },
  { cat:'reno_bath_tile', tag:'Repair', n:'Regrout Bath Tile (per 30 sqft)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Grind out failed grout and regrout up to 30 sqft of bath wall or floor tile. Includes clean and seal.',
    mats:[['N146',0.5]] },
  { cat:'reno_bath_tile', tag:'Repair', n:'Recaulk Tub / Shower Perimeter', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Remove old caulk from tub/shower perimeter, clean, and apply new silicone. Prevents wall damage.',
    mats:[['N361',1]] },
];

const RENO_HOME_NEW = [
  { cat:'reno_wh_deck', tag:'Fence', n:'Composite Privacy Fence Install (per LF)', hrs:0.5, time:'per LF', diff:'Moderate',
    desc:'Install composite privacy fence with posts and gates. Priced per LF (typical 6-ft height).',
    mats:[['N405',0.14],['N336',0.15],['N337',0.15]] },
  { cat:'reno_wh_deck', tag:'Fence', n:'Pressure-Treated Privacy Fence (per LF)', hrs:0.4, time:'per LF', diff:'Moderate',
    desc:'6-ft pressure-treated privacy fence with posts. Cost-effective option. Priced per LF.',
    mats:[['N406',0.14],['N336',0.15]] },
  { cat:'reno_wh_deck', tag:'Patio', n:'Paver Patio Install (per sqft)', hrs:0.35, time:'per sqft', diff:'Moderate',
    desc:'Concrete paver patio with base prep. Includes excavation, gravel, sand, and pavers. Priced per sqft.',
    mats:[['N407',1]] },
  { cat:'reno_wh_deck', tag:'Pergola', n:'Cedar Pergola Kit — 10x10 Install', hrs:16, time:'2 days', diff:'Hard',
    desc:'Assemble and install customer-selected 10x10 cedar pergola kit on concrete pad or existing deck.',
    mats:[['N408',1],['N337',6]] },
  { cat:'reno_wh_dw', tag:'Garage', n:'Garage Door Install — 16ft Insulated Steel', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Install 16-ft insulated steel garage door. Includes track, springs, rollers, and existing opener re-tune.',
    mats:[['N409',1]] },
  { cat:'reno_wh_dw', tag:'Garage', n:'Garage Door Opener Install (3/4 HP Wi-Fi)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install customer-supplied or shop-supplied 3/4 HP Wi-Fi belt-drive opener. Includes safety sensors and remote pairing.',
    mats:[['N410',1]] },
  { cat:'reno_wh_extra', tag:'Basement', n:'Basement Finishing — Full (up to 800 sqft)', hrs:200, time:'6-8 weeks', diff:'Complex',
    desc:'Finish unfinished basement up to 800 sqft: framing, insulation, drywall, flooring, drop ceiling or drywall ceiling, egress verification, paint, and trim. Bath / kitchen scope separate.',
    mats:[['N411',20],['N260',80],['N280',80],['N283',5],['N284',400],['N160',800],['N200',200]] },
  { cat:'reno_wh_extra', tag:'Basement', n:'Basement Egress Window Cut-In', hrs:16, time:'2 days', diff:'Complex',
    desc:'Cut existing basement foundation wall and install egress window with well. Includes concrete cutting, framing, waterproofing, and grading.',
    mats:[['N189',1]] },
  { cat:'reno_wh_extra', tag:'Sunroom', n:'Sunroom Addition — 12x14 (structure only)', hrs:120, time:'3-4 weeks', diff:'Complex',
    desc:'Build 12x14 sunroom on existing deck or slab. Aluminum kit shell, windows, roofing, and electrical rough-in. Interior finish separate.',
    mats:[['N412',1]] },
  { cat:'reno_wh_frame', tag:'Stairs', n:'Interior Staircase Refinish (per stair)', hrs:1.5, time:'per stair', diff:'Moderate',
    desc:'Remove carpet, refinish existing hardwood treads, and repaint risers. Priced per stair (typical 12-15 stairs per flight).',
    mats:[['N162',0.15],['N222',0.05]] },
  { cat:'reno_wh_roof', tag:'Paint', n:'Exterior Paint — Full House 2-Story (per sqft)', hrs:0.025, time:'per sqft', diff:'Moderate',
    desc:'Full-house exterior paint with power wash, prep, scrape, prime, and 2-coat topcoat. Priced per sqft of siding.',
    mats:[['N225',0.008]] },
];

// ── PEST CONTROL ─────────────────────────────────────────────────────
const PEST_GENERAL_NEW = [
  { cat:'pest_gp_specialty', tag:'Drain Fly', n:'Drain Fly / Phorid Fly Bio-Treatment', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Diagnose and treat drain fly or phorid fly issues with bio-enzyme foaming treatment applied to affected drains. Includes homeowner sanitation coaching.',
    mats:[['P207',0.5]] },
  { cat:'pest_gp_specialty', tag:'Earwig/Centipede', n:'Earwig / Centipede / Springtail Treatment', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Perimeter granular + interior dust for moisture-loving occasional invaders. Includes yard drainage coaching.',
    mats:[['P011',0.3],['P003',0.15]] },
  { cat:'pest_gp_specialty', tag:'Stinger', n:'Indoor Stinging Insect / Bird Mite Cleanout', hrs:2, time:'2 hr', diff:'Hard',
    desc:'Clean out interior areas where stinging insects or bird mites have entered after bird activity. Includes exclusion recommendation.',
    mats:[['P003',0.2],['P001',0.15]] },
  { cat:'pest_gp_outdoor', tag:'Bee', n:'Carpenter Bee Treatment (per structure)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Locate and dust-treat carpenter bee galleries on decks, eaves, and outbuildings. Includes recommendation for wood treatment.',
    mats:[['P003',0.3]] },
  { cat:'pest_gp_recur', tag:'Plan', n:'Premium Home Program — Pest + Mosquito + Termite Bond', hrs:2, time:'per visit', diff:'Moderate',
    desc:'Highest-tier bundled plan: quarterly pest, monthly mosquito May-Oct, annual termite bond and inspection. Priced per touchpoint.',
    mats:[['P010',0.2],['P014',0.2],['P037',0.05]] },
  { cat:'pest_gp_comm', tag:'Commercial', n:'HACCP Pest Log Audit Prep — Restaurant',  hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Full log audit + trend analysis of a restaurant\'s pest management history in preparation for a third-party audit (Ecolab, Rentokil, health dept).',
    mats:[] },
];

const PEST_TERMITE_NEW = [
  { cat:'pest_term_treat', tag:'Foam Treat', n:'Sub-Slab Foam Injection Treatment', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Foam injection treatment for termite activity in inaccessible sub-slab or wall void areas. Complements liquid perimeter treatment.',
    mats:[['P209',0.5],['P033',1]] },
  { cat:'pest_term_treat', tag:'Spot Treat', n:'Termite Spot Treatment + Damaged Wood Replace (per LF)', hrs:0.75, time:'per LF', diff:'Hard',
    desc:'Spot-treat active termite gallery and replace damaged framing member with borate-treated lumber. Priced per LF of member.',
    mats:[['P032',0.05],['P033',0.2]] },
  { cat:'pest_term_bait', tag:'Sentricon', n:'Sentricon Additional Stations (per 4 added)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Add 4 more Sentricon stations to an existing installation. For larger properties or high-pressure areas.',
    mats:[['P034',4]] },
  { cat:'pest_term_warr', tag:'Bond', n:'Bond Renewal — Damage Warranty (Large Home 3000+ sqft)', hrs:0.5, time:'admin', diff:'Easy',
    desc:'Annual bond renewal on larger homes (3000+ sqft) with damage warranty. Higher premium.',
    mats:[['P208',1]] },
  { cat:'pest_term_insp', tag:'Damage Coord', n:'Termite Damage Repair Coordination', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Coordinate contractor repair of termite-damaged framing under bond damage warranty. Includes scope, contractor referral, and inspection sign-off.',
    mats:[] },
];

const PEST_WILDLIFE_NEW = [
  { cat:'pest_rw_wildlife', tag:'Bird', n:'Pigeon / Starling Exclusion — Spike Strip (per LF)', hrs:0.15, time:'per LF', diff:'Moderate',
    desc:'Install stainless-steel spike strip to prevent birds from landing on ledges, signs, or eaves. Priced per LF.',
    mats:[['P200',0.1]] },
  { cat:'pest_rw_wildlife', tag:'Bird', n:'Bird Netting Install (per 100 sqft)', hrs:2, time:'2 hr per 100 sqft', diff:'Hard',
    desc:'Install nylon bird netting under eaves, patios, or balconies to exclude nesting birds. Priced per 100 sqft.',
    mats:[['P201',0.16]] },
  { cat:'pest_rw_wildlife', tag:'Bird', n:'Bird Gel Repellent Application (per LF)', hrs:0.1, time:'per LF', diff:'Easy',
    desc:'Apply visual/tactile deterrent gel to ledges. Priced per LF. Good for narrow or aesthetically sensitive areas.',
    mats:[['P202',0.05]] },
  { cat:'pest_rw_rodent', tag:'Vole', n:'Vole / Mole Treatment — Yard Program', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Yard-wide treatment for voles/moles: bait worm placement in active tunnels, trap set. Includes follow-up.',
    mats:[['P203',0.5],['P204',6]] },
  { cat:'pest_rw_wildlife', tag:'Skunk', n:'Skunk Live Trapping & Removal', hrs:6, time:'~1 week (multi-visit)', diff:'Hard',
    desc:'Set live trap for skunk under deck or in yard. Multi-visit trap monitoring. State relocation rules followed.',
    mats:[['P205',1]] },
  { cat:'pest_rw_wildlife', tag:'Groundhog', n:'Groundhog Removal & Burrow Sealing', hrs:5, time:'~1 week', diff:'Hard',
    desc:'Trap groundhog(s) and permanently seal burrow entrances with hardware cloth and stone.',
    mats:[['P205',1],['P092',0.15]] },
  { cat:'pest_rw_wildlife', tag:'Snake', n:'Snake Removal (single call)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Single-call snake removal from home/yard/crawlspace. Non-venomous snakes relocated; venomous handled per state rules.',
    mats:[['P206',1]] },
  { cat:'pest_rw_excl', tag:'Exclusion', n:'Chimney Damper / Screen Inspection & Repair', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Inspect chimney damper and cap for gaps allowing wildlife entry. Repair as needed. Ladder work included.',
    mats:[['P099',1]] },
];

// ═══════════════════════════════════════════════════════════════════════════
// Execution
// ═══════════════════════════════════════════════════════════════════════════
async function run() {
  const db = new Client({ connectionString: DB });
  await db.connect();
  console.log('→ Connected to', DB.replace(/:[^:@]+@/, ':***@'));

  try {
    await db.query('BEGIN');

    // Insert new materials (skip if id already exists)
    console.log(`→ Inserting ${Object.keys(NEW_MATS).length} new materials (skipping duplicates)`);
    for (const [id, m] of Object.entries(NEW_MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO NOTHING`,
        [id, m.d, m.u, m.c, m.cat, m.svc]
      );
    }

    // Bulk task inserter — skip existing by (service, service_type, name)
    async function insertBucket(tasks, service, subType, label) {
      console.log(`→ Inserting ${tasks.length} ${service}/${subType} (${label})`);
      let inserted = 0, links = 0;
      for (const t of tasks) {
        const { rows: existing } = await db.query(
          `SELECT id FROM pb_tasks
            WHERE service=$1 AND service_type=$2 AND name=$3 LIMIT 1`,
          [service, subType, t.n]
        );
        if (existing.length) continue;
        const { rows: [row] } = await db.query(
          `INSERT INTO pb_tasks
             (category_id, name, tag, hours, time_range, difficulty, notes, description,
              service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8,$9) RETURNING id`,
          [t.cat, t.n, t.tag, t.hrs, t.time, t.diff, t.desc, service, subType]
        );
        inserted++;
        for (const [mid, qty] of (t.mats || [])) {
          const { rows: matExists } = await db.query('SELECT 1 FROM pb_materials WHERE id=$1', [mid]);
          if (!matExists.length) continue;
          await db.query(
            `INSERT INTO pb_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)`,
            [row.id, mid, qty]
          );
          links++;
        }
      }
      console.log(`   → ${inserted} inserted, ${links} material links`);
    }

    await insertBucket(HVAC_INSTALL_NEW,   'hvac',        'install',  'HVAC install');
    await insertBucket(HVAC_SERVICE_NEW,   'hvac',        'service',  'HVAC service');
    await insertBucket(ELEC_INSTALL_NEW,   'electrical',  'install',  'Electrical install');
    await insertBucket(ELEC_SERVICE_NEW,   'electrical',  'service',  'Electrical service');
    await insertBucket(RESTO_DRYOUT_NEW,   'restoration', 'dryout',   'Restoration dryout');
    await insertBucket(RESTO_REMOVAL_NEW,  'restoration', 'removal',  'Restoration removal');
    await insertBucket(RESTO_REBUILD_NEW,  'restoration', 'rebuild',  'Restoration rebuild');
    await insertBucket(RENO_KITCHEN_NEW,   'renovations', 'kitchen',  'Renovations kitchen');
    await insertBucket(RENO_BATH_NEW,      'renovations', 'bathroom', 'Renovations bathroom');
    await insertBucket(RENO_HOME_NEW,      'renovations', 'home',     'Renovations home');
    await insertBucket(PEST_GENERAL_NEW,   'pest_control', 'general', 'Pest general');
    await insertBucket(PEST_TERMITE_NEW,   'pest_control', 'termite', 'Pest termite');
    await insertBucket(PEST_WILDLIFE_NEW,  'pest_control', 'wildlife','Pest wildlife');

    await db.query('COMMIT');
    console.log('✓ Migration 010 complete.');

    // Sanity print
    const { rows: stats } = await db.query(
      `SELECT service, COUNT(*)::int AS n
         FROM pb_tasks GROUP BY service ORDER BY service`
    );
    console.log('  task totals by service:',
      stats.map(r => `${r.service}=${r.n}`).join(', '));
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('✗ Migration failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });

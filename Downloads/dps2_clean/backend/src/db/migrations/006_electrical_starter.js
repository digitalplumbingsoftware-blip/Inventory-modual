'use strict';
/**
 * Migration 006: Seed the Electrical pricebook (Install + Service).
 *
 * Mirror of 005_hvac_starter.js but for the electrical trade.
 *   - ~120 electrical materials (id prefix E001…)
 *   - 11 categories: panel/wire/out/sw/light/fan/ev/gen/solar/safe/comm (shared),
 *     plus 2 service-only (diag, maint).
 *   - ~32 install tasks + ~32 service tasks
 *   - Seeds both electrical engines (install + service) with the same 10-item
 *     overhead template used elsewhere, monthly = 0 (fill in from Settings).
 *
 * All rows tagged service='electrical' with service_type ∈ ('install','service').
 * Depends on 004 having run.
 *
 * Idempotent: clears existing electrical rows before insert.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/006_electrical_starter.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ── Materials (E001…) ──────────────────────────────────────────────────────
const MATS = {
  // Main panels + breakers
  E001: { d: '100A Main Breaker Panel (indoor, 20-space)',   u: 'EA', c: 165.00, cat: 'Panels' },
  E002: { d: '150A Main Breaker Panel (indoor, 30-space)',   u: 'EA', c: 235.00, cat: 'Panels' },
  E003: { d: '200A Main Breaker Panel (indoor, 40-space)',   u: 'EA', c: 320.00, cat: 'Panels' },
  E004: { d: '200A Main Breaker Panel (outdoor / meter combo)', u: 'EA', c: 485.00, cat: 'Panels' },
  E005: { d: '400A Meter/Panel Combo (outdoor)',             u: 'EA', c: 985.00, cat: 'Panels' },
  E006: { d: 'Sub-Panel 100A (12-space)',                    u: 'EA', c: 145.00, cat: 'Panels' },
  E007: { d: 'Sub-Panel 60A (8-space)',                      u: 'EA', c: 95.00,  cat: 'Panels' },
  E008: { d: '15A Single-Pole Breaker (standard)',           u: 'EA', c: 8.00,   cat: 'Breakers' },
  E009: { d: '20A Single-Pole Breaker (standard)',           u: 'EA', c: 8.50,   cat: 'Breakers' },
  E010: { d: '30A Double-Pole Breaker',                      u: 'EA', c: 16.00,  cat: 'Breakers' },
  E011: { d: '40A Double-Pole Breaker',                      u: 'EA', c: 22.00,  cat: 'Breakers' },
  E012: { d: '50A Double-Pole Breaker',                      u: 'EA', c: 28.00,  cat: 'Breakers' },
  E013: { d: '60A Double-Pole Breaker',                      u: 'EA', c: 34.00,  cat: 'Breakers' },
  E014: { d: '100A Double-Pole Breaker',                     u: 'EA', c: 65.00,  cat: 'Breakers' },
  E015: { d: '15A AFCI Breaker (Arc-Fault)',                 u: 'EA', c: 45.00,  cat: 'Breakers' },
  E016: { d: '20A AFCI Breaker',                             u: 'EA', c: 48.00,  cat: 'Breakers' },
  E017: { d: '15A GFCI Breaker',                             u: 'EA', c: 42.00,  cat: 'Breakers' },
  E018: { d: '20A GFCI Breaker',                             u: 'EA', c: 45.00,  cat: 'Breakers' },
  E019: { d: '20A AFCI/GFCI Dual-Function Breaker',          u: 'EA', c: 55.00,  cat: 'Breakers' },
  E020: { d: 'Panel Ground Bar Kit',                         u: 'EA', c: 18.00,  cat: 'Panels' },
  E021: { d: 'Panel Cover Blank Filler (10-pk)',             u: 'PK', c: 6.00,   cat: 'Panels' },

  // Wire (Romex NM-B + THHN)
  E030: { d: '14/2 Romex NM-B (per ft)',                     u: 'LF', c: 0.55,  cat: 'Wire' },
  E031: { d: '14/3 Romex NM-B (per ft)',                     u: 'LF', c: 0.80,  cat: 'Wire' },
  E032: { d: '12/2 Romex NM-B (per ft)',                     u: 'LF', c: 0.75,  cat: 'Wire' },
  E033: { d: '12/3 Romex NM-B (per ft)',                     u: 'LF', c: 1.10,  cat: 'Wire' },
  E034: { d: '10/2 Romex NM-B (per ft)',                     u: 'LF', c: 1.35,  cat: 'Wire' },
  E035: { d: '10/3 Romex NM-B (per ft)',                     u: 'LF', c: 1.85,  cat: 'Wire' },
  E036: { d: '8/3 Romex NM-B (per ft)',                      u: 'LF', c: 3.20,  cat: 'Wire' },
  E037: { d: '6/3 Romex NM-B (per ft)',                      u: 'LF', c: 5.50,  cat: 'Wire' },
  E038: { d: '4/3 SER Aluminum (per ft)',                    u: 'LF', c: 4.25,  cat: 'Wire' },
  E039: { d: '2/3 SER Aluminum (per ft)',                    u: 'LF', c: 6.85,  cat: 'Wire' },
  E040: { d: '2/0 SEU Aluminum Service Entrance (per ft)',   u: 'LF', c: 8.50,  cat: 'Wire' },
  E041: { d: '4/0 SEU Aluminum Service Entrance (per ft)',   u: 'LF', c: 12.00, cat: 'Wire' },
  E042: { d: '#14 THHN Solid (per ft)',                      u: 'LF', c: 0.22,  cat: 'Wire' },
  E043: { d: '#12 THHN Stranded (per ft)',                   u: 'LF', c: 0.32,  cat: 'Wire' },
  E044: { d: '#10 THHN Stranded (per ft)',                   u: 'LF', c: 0.48,  cat: 'Wire' },
  E045: { d: '#8 THHN Stranded (per ft)',                    u: 'LF', c: 0.85,  cat: 'Wire' },
  E046: { d: '#6 THHN Stranded (per ft)',                    u: 'LF', c: 1.25,  cat: 'Wire' },
  E047: { d: 'Bare Copper #6 Ground (per ft)',               u: 'LF', c: 1.10,  cat: 'Wire' },
  E048: { d: 'Bare Copper #4 Ground (per ft)',               u: 'LF', c: 1.70,  cat: 'Wire' },

  // Conduit + fittings
  E060: { d: '1/2" EMT Conduit (per ft)',                    u: 'LF', c: 0.85,  cat: 'Conduit' },
  E061: { d: '3/4" EMT Conduit (per ft)',                    u: 'LF', c: 1.20,  cat: 'Conduit' },
  E062: { d: '1" EMT Conduit (per ft)',                      u: 'LF', c: 1.80,  cat: 'Conduit' },
  E063: { d: '1/2" PVC Conduit (per ft)',                    u: 'LF', c: 0.55,  cat: 'Conduit' },
  E064: { d: '3/4" PVC Conduit (per ft)',                    u: 'LF', c: 0.75,  cat: 'Conduit' },
  E065: { d: '1" PVC Conduit (per ft)',                      u: 'LF', c: 1.20,  cat: 'Conduit' },
  E066: { d: '3/4" Flex Metal Whip Kit',                     u: 'EA', c: 12.00, cat: 'Conduit' },
  E067: { d: 'EMT Set-Screw Connector 3/4"',                 u: 'EA', c: 1.50,  cat: 'Conduit' },
  E068: { d: 'EMT Compression Connector 3/4"',               u: 'EA', c: 2.80,  cat: 'Conduit' },
  E069: { d: 'PVC Female Adapter 3/4"',                      u: 'EA', c: 0.60,  cat: 'Conduit' },

  // Boxes
  E080: { d: 'Single-Gang Old-Work Box (plastic)',           u: 'EA', c: 2.50,  cat: 'Boxes' },
  E081: { d: 'Double-Gang Old-Work Box (plastic)',           u: 'EA', c: 4.20,  cat: 'Boxes' },
  E082: { d: 'Single-Gang New-Work Nail-On Box',             u: 'EA', c: 1.80,  cat: 'Boxes' },
  E083: { d: 'Double-Gang New-Work Nail-On Box',             u: 'EA', c: 2.80,  cat: 'Boxes' },
  E084: { d: '4" Square Junction Box + Cover',               u: 'EA', c: 4.50,  cat: 'Boxes' },
  E085: { d: 'Ceiling Fan Rated Retrofit Box',               u: 'EA', c: 12.00, cat: 'Boxes' },
  E086: { d: 'Weatherproof Outdoor Box + Bubble Cover',      u: 'EA', c: 14.00, cat: 'Boxes' },

  // Outlets / receptacles
  E100: { d: '15A Standard Duplex Outlet (spec grade)',      u: 'EA', c: 1.75,  cat: 'Outlets' },
  E101: { d: '20A Standard Duplex Outlet (spec grade)',      u: 'EA', c: 3.20,  cat: 'Outlets' },
  E102: { d: '15A Tamper-Resistant Duplex Outlet',           u: 'EA', c: 2.80,  cat: 'Outlets' },
  E103: { d: '15A GFCI Outlet (self-test)',                  u: 'EA', c: 18.00, cat: 'Outlets' },
  E104: { d: '20A GFCI Outlet (self-test)',                  u: 'EA', c: 22.00, cat: 'Outlets' },
  E105: { d: '20A GFCI/Weather-Resistant Outdoor',           u: 'EA', c: 28.00, cat: 'Outlets' },
  E106: { d: '15A USB Type-A/C Combo Outlet',                u: 'EA', c: 32.00, cat: 'Outlets' },
  E107: { d: 'NEMA 14-30R Dryer Receptacle (surface)',       u: 'EA', c: 18.00, cat: 'Outlets' },
  E108: { d: 'NEMA 14-50R Range/EV Receptacle',              u: 'EA', c: 24.00, cat: 'Outlets' },
  E109: { d: 'NEMA 6-50R Welder Receptacle',                 u: 'EA', c: 22.00, cat: 'Outlets' },
  E110: { d: 'NEMA L14-30R Generator Twist-Lock',            u: 'EA', c: 32.00, cat: 'Outlets' },
  E111: { d: 'Cover Plate — Single Gang (standard)',         u: 'EA', c: 0.85,  cat: 'Outlets' },
  E112: { d: 'Cover Plate — Double Gang',                    u: 'EA', c: 1.20,  cat: 'Outlets' },

  // Switches / dimmers
  E120: { d: '15A Single-Pole Switch (spec grade)',          u: 'EA', c: 2.20,  cat: 'Switches' },
  E121: { d: '15A 3-Way Switch',                             u: 'EA', c: 3.80,  cat: 'Switches' },
  E122: { d: '15A 4-Way Switch',                             u: 'EA', c: 8.50,  cat: 'Switches' },
  E123: { d: 'LED-Compatible Dimmer (600W)',                 u: 'EA', c: 22.00, cat: 'Switches' },
  E124: { d: '3-Way LED Dimmer Kit',                         u: 'EA', c: 38.00, cat: 'Switches' },
  E125: { d: 'Smart Switch (Wi-Fi, single-pole)',            u: 'EA', c: 32.00, cat: 'Switches' },
  E126: { d: 'Smart Dimmer (Wi-Fi)',                         u: 'EA', c: 45.00, cat: 'Switches' },
  E127: { d: 'Occupancy Sensor Switch',                      u: 'EA', c: 28.00, cat: 'Switches' },
  E128: { d: 'Timer Switch (7-day programmable)',            u: 'EA', c: 42.00, cat: 'Switches' },

  // Lighting
  E140: { d: '4" LED Recessed Can (retrofit)',               u: 'EA', c: 15.00, cat: 'Lighting' },
  E141: { d: '6" LED Recessed Can (retrofit)',               u: 'EA', c: 18.00, cat: 'Lighting' },
  E142: { d: '6" LED Canless Wafer (new-work)',              u: 'EA', c: 22.00, cat: 'Lighting' },
  E143: { d: 'IC-Rated Housing (new construction)',          u: 'EA', c: 12.00, cat: 'Lighting' },
  E144: { d: 'A19 LED Bulb 9W (soft white)',                 u: 'EA', c: 3.50,  cat: 'Lighting' },
  E145: { d: 'BR30 LED Flood Bulb 10W',                      u: 'EA', c: 4.80,  cat: 'Lighting' },
  E146: { d: 'PAR38 LED Outdoor 15W',                        u: 'EA', c: 8.00,  cat: 'Lighting' },
  E147: { d: '4-ft LED Shop Light (linkable)',               u: 'EA', c: 32.00, cat: 'Lighting' },
  E148: { d: '2x4 LED Troffer 40W (drop-ceiling)',           u: 'EA', c: 65.00, cat: 'Lighting' },
  E149: { d: 'Under-Cabinet LED Strip 24"',                  u: 'EA', c: 28.00, cat: 'Lighting' },
  E150: { d: 'Landscape Path Light LED (12V)',               u: 'EA', c: 32.00, cat: 'Lighting' },
  E151: { d: 'Low-Voltage Transformer 300W',                 u: 'EA', c: 145.00, cat: 'Lighting' },
  E152: { d: 'Motion-Activated Flood Light (dual head)',     u: 'EA', c: 45.00, cat: 'Lighting' },

  // Fans
  E160: { d: 'Ceiling Fan (52" 4-blade)',                    u: 'EA', c: 145.00, cat: 'Fans' },
  E161: { d: 'Ceiling Fan (52" DC motor w/ remote)',         u: 'EA', c: 285.00, cat: 'Fans' },
  E162: { d: 'Bath Exhaust Fan 80 CFM',                      u: 'EA', c: 45.00, cat: 'Fans' },
  E163: { d: 'Bath Exhaust Fan 110 CFM w/ Light',            u: 'EA', c: 95.00, cat: 'Fans' },
  E164: { d: 'Whole-House Attic Fan',                        u: 'EA', c: 385.00, cat: 'Fans' },

  // EV
  E180: { d: 'L2 EV Charger 40A (hardwired)',                u: 'EA', c: 550.00, cat: 'EV Charging' },
  E181: { d: 'L2 EV Charger 48A (hardwired, WiFi)',          u: 'EA', c: 750.00, cat: 'EV Charging' },
  E182: { d: 'L2 EV Charger 50A (plug-in NEMA 14-50)',       u: 'EA', c: 450.00, cat: 'EV Charging' },
  E183: { d: 'Tesla Wall Connector Gen 3',                   u: 'EA', c: 475.00, cat: 'EV Charging' },
  E184: { d: 'EV Load Management Splitter',                  u: 'EA', c: 285.00, cat: 'EV Charging' },

  // Generators
  E200: { d: 'Portable Generator Inlet Box 30A',             u: 'EA', c: 85.00, cat: 'Generators' },
  E201: { d: 'Portable Generator Inlet Box 50A',             u: 'EA', c: 125.00, cat: 'Generators' },
  E202: { d: '10-Circuit Manual Transfer Switch',            u: 'EA', c: 385.00, cat: 'Generators' },
  E203: { d: '200A Automatic Transfer Switch (whole-home)',  u: 'EA', c: 985.00, cat: 'Generators' },
  E204: { d: 'Whole-Home Generator 14kW LP/NG',              u: 'EA', c: 4250.00, cat: 'Generators' },
  E205: { d: 'Whole-Home Generator 22kW LP/NG',              u: 'EA', c: 5450.00, cat: 'Generators' },

  // Solar / Battery
  E220: { d: 'Solar DC Disconnect 30A',                      u: 'EA', c: 85.00, cat: 'Solar' },
  E221: { d: 'Solar AC Disconnect 60A',                      u: 'EA', c: 125.00, cat: 'Solar' },
  E222: { d: 'Battery Backup Interface (critical loads sub)', u: 'EA', c: 685.00, cat: 'Solar' },

  // Life Safety
  E240: { d: 'Smoke Detector (hardwired w/ battery backup)', u: 'EA', c: 22.00, cat: 'Safety' },
  E241: { d: 'Smoke + CO Combo Detector (hardwired)',        u: 'EA', c: 45.00, cat: 'Safety' },
  E242: { d: 'Smoke Detector (10-yr sealed battery)',        u: 'EA', c: 22.00, cat: 'Safety' },
  E243: { d: 'CO Detector Plug-In',                          u: 'EA', c: 32.00, cat: 'Safety' },
  E244: { d: 'Whole-Home Surge Protector (Type 2)',          u: 'EA', c: 185.00, cat: 'Safety' },
  E245: { d: 'Ground Rod 8ft Copper-Clad',                   u: 'EA', c: 18.00, cat: 'Safety' },
  E246: { d: 'Ground Rod Clamp',                             u: 'EA', c: 4.00,  cat: 'Safety' },
  E247: { d: 'Intersystem Bonding Bridge',                   u: 'EA', c: 12.00, cat: 'Safety' },

  // Consumables
  E260: { d: 'Wire Nuts Assorted (500-pk)',                  u: 'PK', c: 28.00, cat: 'Consumables' },
  E261: { d: 'Electrical Tape 3/4" (10-pk)',                 u: 'PK', c: 12.00, cat: 'Consumables' },
  E262: { d: 'Cable Staples (bag 100)',                      u: 'BG', c: 5.00,  cat: 'Consumables' },
  E263: { d: 'Romex Connectors 3/8" (25-pk)',                u: 'PK', c: 9.00,  cat: 'Consumables' },
  E264: { d: 'Anti-Oxidant Compound (Noalox 4oz)',           u: 'EA', c: 8.00,  cat: 'Consumables' },
  E265: { d: 'Fire Caulk 10oz',                              u: 'EA', c: 14.00, cat: 'Consumables' },
  E266: { d: 'Zip Ties Assorted (200-pk)',                   u: 'PK', c: 8.00,  cat: 'Consumables' },
};

// ── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'elec_panel', icon: '🔌', name: 'Panels & Breakers',  color: '#C55A11', desc: 'Main panels, sub-panels, breakers, upgrades' },
  { id: 'elec_wire',  icon: '⚡', name: 'Wiring & Circuits',  color: '#2E5FA3', desc: 'New circuits, rewires, dedicated runs' },
  { id: 'elec_out',   icon: '🔲', name: 'Outlets & Devices',  color: '#1F7A8C', desc: 'Standard, GFCI, USB, 220V, EV receptacles' },
  { id: 'elec_sw',    icon: '💡', name: 'Switches & Dimmers', color: '#5B2D8E', desc: 'Standard, 3/4-way, smart, dimmers, timers' },
  { id: 'elec_light', icon: '💡', name: 'Lighting',           color: '#E8A500', desc: 'Recessed, fixtures, landscape, security' },
  { id: 'elec_fan',   icon: '🌀', name: 'Fans',               color: '#1E6B3C', desc: 'Ceiling, bath exhaust, attic' },
  { id: 'elec_ev',    icon: '🚗', name: 'EV Charging',        color: '#22c55e', desc: 'L2 chargers, Tesla, load management' },
  { id: 'elec_gen',   icon: '⚙️', name: 'Generators',         color: '#7A4B1A', desc: 'Portable inlets, transfer switches, whole-home' },
  { id: 'elec_solar', icon: '☀️', name: 'Solar & Battery',    color: '#f59e0b', desc: 'PV interconnect, battery backup' },
  { id: 'elec_safe',  icon: '🛡', name: 'Life Safety',        color: '#C00000', desc: 'Smoke/CO, surge, grounding, arc-fault' },
  { id: 'elec_comm',  icon: '🏢', name: 'Commercial',         color: '#8B6914', desc: 'Rooftop disconnects, 3-phase, tenant fit-outs' },
  { id: 'elec_diag',  icon: '🔍', name: 'Diagnostics',        color: '#2E5FA3', desc: 'Service call & troubleshoot labor', serviceOnly: 'service' },
  { id: 'elec_maint', icon: '🛠', name: 'Maintenance',        color: '#1E6B3C', desc: 'Panel inspections, PM plans, seasonal', serviceOnly: 'service' },
];

// ── Install Tasks ──────────────────────────────────────────────────────────
const INSTALL_TASKS = [
  // Panels
  { cat:'elec_panel', tag:'Panel Install', n:'100A Panel Upgrade', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Full 100A main panel replacement. Includes new panel, breakers matched to existing loads, ground rod verify, permit-ready. Utility disconnect + reconnect coordination included.',
    mats:[['E001',1],['E008',6],['E009',4],['E010',1],['E011',1],['E015',2],['E017',2],['E020',1],['E245',1],['E246',2],['E260',1]] },
  { cat:'elec_panel', tag:'Panel Install', n:'150A Panel Upgrade', hrs:7, time:'7 hr', diff:'Hard',
    desc:'150A main panel replacement. New panel + matched breakers, meter socket check, grounding + bonding to current code. Ideal for typical single-family upgrade.',
    mats:[['E002',1],['E008',8],['E009',6],['E010',1],['E011',1],['E012',1],['E015',3],['E017',3],['E020',1],['E245',2],['E246',2],['E260',1]] },
  { cat:'elec_panel', tag:'Panel Install', n:'200A Panel Upgrade (Indoor)', hrs:8, time:'8 hr', diff:'Hard',
    desc:'200A main breaker panel replacement (indoor). Full breaker complement, dedicated AFCI/GFCI where required, whole-home surge protector added. Standard for modern homes with EV or HVAC upgrades.',
    mats:[['E003',1],['E008',10],['E009',8],['E010',2],['E011',1],['E012',1],['E013',1],['E015',4],['E017',4],['E019',2],['E020',1],['E244',1],['E245',2],['E246',2],['E260',1]] },
  { cat:'elec_panel', tag:'Panel Install', n:'200A Meter-Panel Combo (Outdoor)', hrs:10, time:'10 hr', diff:'Complex',
    desc:'Full outdoor meter/panel combo replacement. Utility coordination for disconnect/reconnect, weatherhead + service drop as needed, new grounding electrode system.',
    mats:[['E004',1],['E040',10],['E008',10],['E009',8],['E010',2],['E012',1],['E015',4],['E017',4],['E019',2],['E244',1],['E245',2],['E246',2],['E260',1]] },
  { cat:'elec_panel', tag:'Panel Install', n:'400A Meter-Panel Combo', hrs:14, time:'2 days', diff:'Complex',
    desc:'400A service upgrade — required for large homes, workshops, or EV+solar+HVAC combined loads. Includes two 200A panels or single 400A gear, full grounding, utility coordination.',
    mats:[['E005',1],['E041',15],['E014',2],['E008',12],['E009',10],['E010',3],['E012',2],['E019',4],['E244',1],['E245',3],['E246',3],['E260',1]] },
  { cat:'elec_panel', tag:'Sub-Panel', n:'Sub-Panel Install 60A', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Install 60A sub-panel from existing main. Includes feeder run up to 30 ft, isolated neutral, ground bar, and up to 4 branch circuits reterminated.',
    mats:[['E007',1],['E037',30],['E013',1],['E008',3],['E009',3],['E020',1],['E263',1],['E260',1]] },
  { cat:'elec_panel', tag:'Sub-Panel', n:'Sub-Panel Install 100A', hrs:6, time:'6 hr', diff:'Moderate',
    desc:'100A sub-panel install with 12-space capacity. Ideal for garage, ADU, or workshop. Feeder run up to 40 ft, isolated neutral, and grounding.',
    mats:[['E006',1],['E038',40],['E014',1],['E008',4],['E009',4],['E010',1],['E020',1],['E263',1],['E260',1]] },
  { cat:'elec_panel', tag:'Breaker Add', n:'Dedicated Circuit — 20A GFCI', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Run a new 20A dedicated circuit up to 30 ft with GFCI protection. Includes breaker, wire, box, GFCI outlet, and cover.',
    mats:[['E018',1],['E032',30],['E080',1],['E104',1],['E111',1],['E263',1],['E260',1]] },
  { cat:'elec_panel', tag:'Breaker Add', n:'Dedicated Circuit — 30A Dryer', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'New 30A/240V dedicated circuit for electric dryer. Includes double-pole breaker, 10/3 wire up to 40 ft, and NEMA 14-30 receptacle.',
    mats:[['E010',1],['E035',40],['E107',1],['E081',1],['E263',1]] },
  { cat:'elec_panel', tag:'Breaker Add', n:'Dedicated Circuit — 50A Range/EV', hrs:3.5, time:'3.5 hr', diff:'Moderate',
    desc:'New 50A/240V dedicated circuit for electric range or EV charger. Includes double-pole breaker, 6/3 wire up to 40 ft, and NEMA 14-50 receptacle.',
    mats:[['E012',1],['E037',40],['E108',1],['E081',1],['E263',1]] },

  // Wiring / rewires
  { cat:'elec_wire', tag:'Rewire', n:'Whole-House Rewire (1500 sqft)', hrs:60, time:'6 days', diff:'Complex',
    desc:'Complete rewire of a typical 1500-sqft home. All new NM-B branch circuits, updated outlets/switches, new panel per separate scope. Includes patching estimate, permit + inspection.',
    mats:[['E032',600],['E030',400],['E035',100],['E100',35],['E103',6],['E120',25],['E121',6],['E082',60],['E262',5],['E260',3]] },
  { cat:'elec_wire', tag:'Rewire', n:'Aluminum Wire Remediation (per outlet)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'AlumiConn or COPALUM pigtail termination at a device (outlet or switch) to remediate aluminum branch wiring. Includes anti-oxidant and code-listed connector.',
    mats:[['E264',1]] },

  // Outlets / devices install
  { cat:'elec_out', tag:'Outlet Install', n:'New Outlet — Standard (in existing wall)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Add a new 15A duplex outlet with tap from an existing nearby outlet or J-box. Includes old-work box, outlet, cover plate.',
    mats:[['E080',1],['E100',1],['E111',1],['E032',10],['E263',1]] },
  { cat:'elec_out', tag:'Outlet Install', n:'GFCI Outlet Install (protects downstream)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install a GFCI outlet with proper line/load wiring so downstream outlets on the same circuit are protected.',
    mats:[['E103',1],['E080',1],['E111',1]] },
  { cat:'elec_out', tag:'Outlet Install', n:'USB Combo Outlet Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace a standard outlet with a Type-A/C USB combo outlet. Live circuit tested before and after.',
    mats:[['E106',1]] },
  { cat:'elec_out', tag:'Outlet Install', n:'Outdoor Weather-Resistant GFCI (in-use cover)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install exterior WR GFCI outlet in weatherproof box with bubble-style in-use cover. Prevents rain intrusion when a cord is plugged in.',
    mats:[['E105',1],['E086',1]] },

  // Switches
  { cat:'elec_sw', tag:'Switch Install', n:'Smart Switch Install (Wi-Fi)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace standard switch with Wi-Fi smart switch. Includes app pairing and network verify. Requires neutral wire at switch box.',
    mats:[['E125',1]] },
  { cat:'elec_sw', tag:'Switch Install', n:'LED Dimmer Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace standard switch with LED-compatible dimmer. Includes bulb-load matching to prevent flicker.',
    mats:[['E123',1]] },
  { cat:'elec_sw', tag:'Switch Install', n:'3-Way Switch Install (both locations)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Add or replace a 3-way switch pair for stairway/hallway control. Includes both boxes wired, verified operation from both ends.',
    mats:[['E121',2],['E080',2],['E111',2],['E031',20]] },

  // Lighting
  { cat:'elec_light', tag:'Lighting', n:'6" LED Recessed Cans (per 6 fixtures)', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Install six 6" LED canless wafer lights in a room ceiling. Includes cutting drywall, running 14/2 between cans, dimmer at wall switch, tested and dimmed.',
    mats:[['E142',6],['E030',60],['E123',1],['E263',6]] },
  { cat:'elec_light', tag:'Lighting', n:'Recessed Can — Add Single (existing ceiling)', hrs:1, time:'1 hr', diff:'Moderate',
    desc:'Add one 6" LED canless recessed light where a fixture already exists nearby. Includes wire tap, box, and testing.',
    mats:[['E142',1],['E030',15]] },
  { cat:'elec_light', tag:'Lighting', n:'Chandelier / Pendant Install (up to 40lb)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install customer-supplied chandelier or pendant fixture. Includes fixture box upgrade if needed, secure mounting, wiring and testing.',
    mats:[['E085',1]] },
  { cat:'elec_light', tag:'Lighting', n:'Under-Cabinet LED Strips (per 10ft)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install low-voltage LED under-cabinet lighting for kitchen countertop area. Includes driver, strip, and switch or dimmer.',
    mats:[['E149',4],['E123',1]] },
  { cat:'elec_light', tag:'Lighting', n:'Motion Flood Light Install', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install motion-activated dual-head flood light on exterior wall or eave. Includes weatherproof box if not present, wiring back to switch.',
    mats:[['E152',1],['E086',1]] },
  { cat:'elec_light', tag:'Lighting', n:'Landscape Lighting Install (per 6 fixtures)', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Install low-voltage landscape lighting system: transformer, buried 12ga wire, and six path fixtures.',
    mats:[['E151',1],['E150',6]] },
  { cat:'elec_light', tag:'Lighting', n:'2x4 LED Troffer Retrofit (per fixture)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace fluorescent 2x4 drop-ceiling fixture with LED troffer. Direct-wire, remove old ballast.',
    mats:[['E148',1]] },

  // Fans
  { cat:'elec_fan', tag:'Fan Install', n:'Ceiling Fan Install (existing box)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install customer-supplied or standard 52" ceiling fan on an existing ceiling box. Verifies box is fan-rated; upgrades if not.',
    mats:[['E160',1]] },
  { cat:'elec_fan', tag:'Fan Install', n:'Ceiling Fan Install (new circuit / no existing box)', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Full ceiling fan install where no fixture exists — cut ceiling opening, install fan-rated retrofit box, run new switch leg or fish new wire, mount fan.',
    mats:[['E085',1],['E160',1],['E031',20],['E121',1]] },
  { cat:'elec_fan', tag:'Fan Install', n:'Bath Exhaust Fan Install (with light, 110 CFM)', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Replace or install bath exhaust fan/light combo, 110 CFM. Includes venting to exterior via roof or wall cap.',
    mats:[['E163',1]] },

  // EV
  { cat:'elec_ev', tag:'EV Install', n:'L2 EV Charger — Hardwired 40A', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Install a 40A hardwired L2 charger. Includes 50A breaker, 8/3 wire up to 30 ft, disconnect if required by code, and load calc verification.',
    mats:[['E180',1],['E012',1],['E036',30],['E086',1],['E263',2]] },
  { cat:'elec_ev', tag:'EV Install', n:'L2 EV Charger — Plug-In 14-50', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install a NEMA 14-50 receptacle for a plug-in L2 charger. Includes 50A breaker, 6/3 wire up to 25 ft, and outlet.',
    mats:[['E012',1],['E037',25],['E108',1],['E081',1]] },
  { cat:'elec_ev', tag:'EV Install', n:'Tesla Wall Connector Install', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Install Tesla Wall Connector (Gen 3) with 60A breaker and matched wire, up to 30 ft, per Tesla spec.',
    mats:[['E183',1],['E013',1],['E037',30]] },

  // Generators
  { cat:'elec_gen', tag:'Generator', n:'Portable Generator Inlet (30A)', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Install a 30A generator inlet + 10-circuit manual transfer switch. Powers essentials during outage from a portable generator.',
    mats:[['E200',1],['E202',1],['E035',30]] },
  { cat:'elec_gen', tag:'Generator', n:'Whole-Home Automatic Generator 14kW', hrs:16, time:'2 days', diff:'Complex',
    desc:'Full install of 14kW whole-home standby generator with 200A automatic transfer switch. Includes concrete pad, gas connection stub-out, and startup commissioning (gas line by others).',
    mats:[['E204',1],['E203',1],['E041',20]] },
  { cat:'elec_gen', tag:'Generator', n:'Whole-Home Automatic Generator 22kW', hrs:20, time:'2.5 days', diff:'Complex',
    desc:'Full install of 22kW whole-home standby generator with 200A ATS. For larger homes with heavier load profiles.',
    mats:[['E205',1],['E203',1],['E041',25]] },

  // Life Safety
  { cat:'elec_safe', tag:'Safety', n:'Smoke Detectors — Whole House (per 6 units)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install six interconnected hardwired smoke detectors with battery backup, one per bedroom + hallway. Includes wiring interconnect.',
    mats:[['E240',6],['E031',60]] },
  { cat:'elec_safe', tag:'Safety', n:'Smoke + CO Combo — Whole House (per 6 units)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install six interconnected hardwired combo smoke+CO detectors with battery backup.',
    mats:[['E241',6],['E031',60]] },
  { cat:'elec_safe', tag:'Safety', n:'Whole-Home Surge Protector Install', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Install Type 2 whole-home surge protector at main panel. Ties into a two-pole breaker and dedicated ground bar terminal.',
    mats:[['E244',1],['E010',1]] },
  { cat:'elec_safe', tag:'Safety', n:'Grounding Electrode System Upgrade', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install/replace grounding rods + bonding jumpers to bring older service up to current NEC ground requirements.',
    mats:[['E245',2],['E246',2],['E247',1],['E048',20]] },
];

// ── Service Tasks ──────────────────────────────────────────────────────────
const SERVICE_TASKS = [
  // Diagnostics
  { cat:'elec_diag', tag:'Service Call', n:'Standard Service Call & Diagnostic', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Includes travel, arrival, and up to 1 hour of diagnostic time on any electrical issue. Written estimate provided upon diagnosis.',
    mats:[] },
  { cat:'elec_diag', tag:'Service Call', n:'After-Hours / Emergency Diagnostic', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Emergency after-hours service (evenings/weekends/holidays). Includes 1.5 hr diagnostic. Priority response.',
    mats:[] },
  { cat:'elec_diag', tag:'Service Call', n:'Panel Inspection & Report', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Full electrical panel inspection — infrared scan, torque check, breaker exercise, ground/bond verification. Photo report with recommendations.',
    mats:[] },
  { cat:'elec_diag', tag:'Service Call', n:'Whole-Home Safety Inspection', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Comprehensive safety check: panel, outlets, GFCI testing, AFCI testing, smoke/CO verification. Written punch list.',
    mats:[] },

  // Breakers
  { cat:'elec_panel', tag:'Panel Repair', n:'Breaker Replacement — Standard 15/20A', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace a tripped/failed standard 15A or 20A single-pole breaker. Includes verification the underlying cause is resolved.',
    mats:[['E009',1]] },
  { cat:'elec_panel', tag:'Panel Repair', n:'Breaker Replacement — 30A/40A/50A Double-Pole', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Replace a failed 30A, 40A, or 50A double-pole breaker (dryer/range/HVAC circuits).',
    mats:[['E012',1]] },
  { cat:'elec_panel', tag:'Panel Repair', n:'AFCI Breaker Replacement', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed AFCI breaker. Includes root-cause troubleshoot (common causes: shared neutral, damaged wire) so it doesn\'t re-trip.',
    mats:[['E016',1]] },
  { cat:'elec_panel', tag:'Panel Repair', n:'Panel Ground Bar Repair', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Diagnose and repair panel grounding issues — loose or corroded ground bar, missing bond, or improper neutral/ground separation in a sub-panel.',
    mats:[['E020',1]] },

  // Outlets / devices
  { cat:'elec_out', tag:'Outlet Repair', n:'Dead Outlet Troubleshoot & Repair', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Diagnose why an outlet is not working — tripped GFCI upstream, loose wire, back-stab failure — and repair.',
    mats:[['E100',1]] },
  { cat:'elec_out', tag:'Outlet Repair', n:'GFCI Outlet Replacement', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed GFCI outlet. Common when GFCI won\'t reset or trips constantly.',
    mats:[['E103',1]] },
  { cat:'elec_out', tag:'Outlet Repair', n:'Standard Outlet Replacement', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Replace a failed, burnt, or damaged standard 15A/20A outlet.',
    mats:[['E100',1],['E111',1]] },
  { cat:'elec_out', tag:'Outlet Repair', n:'Loose Outlet / Backstab Rework', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Rework a loose or backstabbed outlet — move wires to screw terminals for a solid, code-compliant connection.',
    mats:[['E100',1]] },

  // Switches
  { cat:'elec_sw', tag:'Switch Repair', n:'Switch Replacement — Single-Pole', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Replace failed single-pole switch. Includes cover plate.',
    mats:[['E120',1],['E111',1]] },
  { cat:'elec_sw', tag:'Switch Repair', n:'3-Way Switch Troubleshoot & Repair', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Diagnose and repair a 3-way switch pair that only works from one location or has intermittent operation. Includes reworking travelers if needed.',
    mats:[['E121',2]] },
  { cat:'elec_sw', tag:'Switch Repair', n:'Dimmer Replacement (LED-compatible)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed dimmer with LED-compatible model. Includes bulb-load matching to avoid buzzing/flicker.',
    mats:[['E123',1]] },

  // Lighting
  { cat:'elec_light', tag:'Lighting Repair', n:'Recessed Light Not Working — Troubleshoot', hrs:1, time:'1 hr', diff:'Moderate',
    desc:'Diagnose recessed light that\'s dead. Common causes: LED driver failure, socket issue, thermal cutoff triggered, or upstream wiring.',
    mats:[] },
  { cat:'elec_light', tag:'Lighting Repair', n:'Flickering Lights Diagnosis', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Diagnose flickering lights. Common causes: dimmer/bulb mismatch, loose neutral, or utility voltage. Written report with recommended fix.',
    mats:[] },
  { cat:'elec_light', tag:'Lighting Repair', n:'Fixture Replacement (customer supplied)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Remove existing fixture and install customer-supplied replacement of similar weight and mounting. Excludes chandeliers over 40 lb (see install task).',
    mats:[] },

  // Fans
  { cat:'elec_fan', tag:'Fan Repair', n:'Ceiling Fan Repair', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Diagnose ceiling fan issues — remote sync, wobble, hum, speed control. Repair or recommend replacement.',
    mats:[] },
  { cat:'elec_fan', tag:'Fan Repair', n:'Bath Exhaust Fan Repair / Replace', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Diagnose non-working bath exhaust fan. If motor is bad, swap with equivalent unit; if venting clogged, clear.',
    mats:[['E162',1]] },

  // EV
  { cat:'elec_ev', tag:'EV Repair', n:'EV Charger Diagnosis', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Diagnose L2 EV charger fault codes. Coordinate with manufacturer for warranty units. Repair or replace as needed.',
    mats:[] },

  // Generator
  { cat:'elec_gen', tag:'Gen Repair', n:'Generator Not Starting — Diagnostic', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Diagnose why a standby generator is not starting or failing self-test. Common causes: battery, spark plug, fuel valve, controller.',
    mats:[] },
  { cat:'elec_gen', tag:'Gen Repair', n:'Transfer Switch Repair', hrs:2.5, time:'2.5 hr', diff:'Hard',
    desc:'Diagnose and repair an ATS that isn\'t transferring during power loss. Includes control card check, contactor cleaning or replacement.',
    mats:[] },

  // Safety
  { cat:'elec_safe', tag:'Safety Repair', n:'Smoke Detector Replacement (per unit)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace one hardwired or 10-year sealed-battery smoke detector.',
    mats:[['E242',1]] },
  { cat:'elec_safe', tag:'Safety Repair', n:'Smoke + CO Combo Replacement (per unit)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace one hardwired smoke + CO combo detector.',
    mats:[['E241',1]] },
  { cat:'elec_safe', tag:'Safety Repair', n:'Chirping Smoke Detector Fix', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Silence and diagnose a chirping smoke detector — usually battery, end-of-life, or dirty sensor. Replace unit if past 10-year lifespan.',
    mats:[['E242',1]] },

  // Maintenance
  { cat:'elec_maint', tag:'Tune-Up', n:'Panel Torque & Thermal Scan', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Torque check all panel lugs to manufacturer spec, infrared thermal scan under load to catch loose or overheating connections before failure. Report with photos.',
    mats:[] },
  { cat:'elec_maint', tag:'Tune-Up', n:'Generator Annual Service', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Annual maintenance on standby generator: oil + filter change, spark plugs, battery test, air filter, run under load, verify ATS operation.',
    mats:[] },
  { cat:'elec_maint', tag:'PM Plan', n:'Annual Electrical Safety Plan', hrs:3, time:'3 hr', diff:'Easy',
    desc:'Yearly plan: 1 full home safety inspection, 1 panel tune-up, priority scheduling, 15% off repairs, no dispatch fee.',
    mats:[] },

  // Commercial
  { cat:'elec_comm', tag:'Commercial', n:'Commercial Service Call', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Commercial troubleshoot on lighting, receptacles, or panels. Roof access, arc-flash PPE, and specialty tools included.',
    mats:[] },
];

async function run() {
  const db = new Client({ connectionString: DB });
  await db.connect();
  console.log('→ Connected to', DB.replace(/:[^:@]+@/, ':***@'));

  const DEFAULT_OH = [
    { name:'Office / Rent', monthly:0 }, { name:'Business Insurance', monthly:0 },
    { name:'Phone / Internet', monthly:0 }, { name:'Software / CRM', monthly:0 },
    { name:'Advertising / Marketing', monthly:0 }, { name:'Accounting / Legal', monthly:0 },
    { name:'Office Supplies', monthly:0 }, { name:'Continuing Education', monthly:0 },
    { name:'Licensing & Permits', monthly:0 }, { name:'Uniforms / Branding', monthly:0 },
  ];

  try {
    await db.query('BEGIN');

    console.log('→ Clearing existing electrical data');
    await db.query(
      `DELETE FROM pb_task_materials
        WHERE task_id IN (SELECT id FROM pb_tasks WHERE service = 'electrical')`
    );
    await db.query(`DELETE FROM pb_tasks       WHERE service = 'electrical'`);
    await db.query(`DELETE FROM pb_materials   WHERE service = 'electrical'`);
    await db.query(`DELETE FROM pb_categories  WHERE service = 'electrical'`);

    // Seed both engines (install + service) if not present
    console.log('→ Seeding electrical/install + electrical/service engines');
    for (const st of ['install', 'service']) {
      await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ('electrical', $1, 32, 0, 0, 0, 20, 8, 3,
                 1600, 7.65, 2.5, 8, 0, 0, 0, 0, 0, 0,
                 1, 1600, 0, $2::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [st, JSON.stringify(DEFAULT_OH)]
      );
    }

    console.log(`→ Inserting ${Object.keys(MATS).length} electrical materials`);
    for (const [id, m] of Object.entries(MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,'electrical')`,
        [id, m.d, m.u, m.c, m.cat]
      );
    }

    console.log(`→ Inserting electrical categories`);
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const types = c.serviceOnly ? [c.serviceOnly] : ['install', 'service'];
      for (const t of types) {
        await db.query(
          `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'electrical',$7)
           ON CONFLICT (id, service, service_type) DO NOTHING`,
          [c.id, c.icon, c.name, c.color, c.desc, i, t]
        );
      }
    }

    console.log(`→ Inserting ${INSTALL_TASKS.length} install tasks`);
    let installLinks = 0;
    for (const t of INSTALL_TASKS) {
      const { rows: [row] } = await db.query(
        `INSERT INTO pb_tasks
           (category_id, name, tag, hours, time_range, difficulty, notes, description,
            service, service_type)
         VALUES ($1,$2,$3,$4,$5,$6,'',$7,'electrical','install') RETURNING id`,
        [t.cat, t.n, t.tag, t.hrs, t.time, t.diff, t.desc]
      );
      for (const [mid, qty] of (t.mats || [])) {
        if (!MATS[mid]) continue;
        await db.query(
          `INSERT INTO pb_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)`,
          [row.id, mid, qty]
        );
        installLinks++;
      }
    }

    console.log(`→ Inserting ${SERVICE_TASKS.length} service tasks`);
    let svcLinks = 0;
    for (const t of SERVICE_TASKS) {
      const { rows: [row] } = await db.query(
        `INSERT INTO pb_tasks
           (category_id, name, tag, hours, time_range, difficulty, notes, description,
            service, service_type)
         VALUES ($1,$2,$3,$4,$5,$6,'',$7,'electrical','service') RETURNING id`,
        [t.cat, t.n, t.tag, t.hrs, t.time, t.diff, t.desc]
      );
      for (const [mid, qty] of (t.mats || [])) {
        if (!MATS[mid]) continue;
        await db.query(
          `INSERT INTO pb_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)`,
          [row.id, mid, qty]
        );
        svcLinks++;
      }
    }
    console.log(`  → material links: install=${installLinks}, service=${svcLinks}`);

    // Enable electrical in company settings so pricebook cards + tabs light up
    console.log('→ Enabling electrical in company_settings');
    await db.query(`
      INSERT INTO company_settings (id, service_electrical)
      VALUES ('main', true)
      ON CONFLICT (id) DO UPDATE SET service_electrical = true
    `);

    await db.query('COMMIT');
    console.log('✓ Migration 006 complete.');

    const { rows: stats } = await db.query(
      `SELECT service, service_type, COUNT(*)::int AS n
         FROM pb_tasks GROUP BY service, service_type ORDER BY service, service_type`
    );
    console.log('  task counts:', stats.map(r => `${r.service}/${r.service_type}=${r.n}`).join(', '));
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

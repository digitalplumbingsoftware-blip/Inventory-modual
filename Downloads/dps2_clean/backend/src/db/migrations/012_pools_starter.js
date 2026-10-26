'use strict';
/**
 * Migration 012: Seed the Pools pricebook.
 *
 * Split by scope of work — matches how pool companies book calls:
 *   service_type = 'installation' — new pool builds, spa installs, equipment
 *                                   installs, decking, automation, safety.
 *   service_type = 'repair'       — leak detection, pump/motor/heater repairs,
 *                                   surface & tile repair, plumbing repairs.
 *   service_type = 'maintenance'  — recurring service, opening/closing,
 *                                   chemistry, cleaning, water testing.
 *
 * Each sub-book gets its own engine — pool builds carry huge material margins,
 * repairs are labor-heavy specialty, maintenance is subscription revenue.
 *
 * Contents:
 *   - ~85 materials (id prefix W001…)  (W = "water")
 *   - 14 categories, some sub-book-specific
 *   - ~26 installation tasks, ~28 repair tasks, ~24 maintenance tasks
 *   - 3 engines seeded with the 10-item overhead template
 *
 * Also:
 *   - ALTER TABLE company_settings ADD COLUMN service_pools BOOLEAN.
 *   - Flip service_pools = true so cards / tabs light up.
 *
 * Idempotent: clears existing pools rows before insert.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/012_pools_starter.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ── Materials (W001…) ──────────────────────────────────────────────────────
const MATS = {
  // Structure — new builds
  W001: { d: 'Gunite / Shotcrete (per cu-yd)',                u: 'CY', c: 185.00, cat: 'Structure' },
  W002: { d: 'Rebar #4 20ft',                                 u: 'EA', c: 12.00,  cat: 'Structure' },
  W003: { d: 'White Plaster Marcite (per sqft)',              u: 'SF', c: 4.50,   cat: 'Structure' },
  W004: { d: 'Colored Quartz Plaster (per sqft)',             u: 'SF', c: 6.85,   cat: 'Structure' },
  W005: { d: 'Pebble-Tec Aggregate (per sqft)',               u: 'SF', c: 8.50,   cat: 'Structure' },
  W006: { d: 'Waterline Tile 6x6 (per sqft)',                 u: 'SF', c: 12.00,  cat: 'Structure' },
  W007: { d: 'Glass Waterline Tile (per sqft)',               u: 'SF', c: 22.00,  cat: 'Structure' },
  W008: { d: 'Cantilever Concrete Coping (per LF)',           u: 'LF', c: 28.00,  cat: 'Deck & Coping' },
  W009: { d: 'Travertine Coping (per LF)',                    u: 'LF', c: 42.00,  cat: 'Deck & Coping' },
  W010: { d: 'Brick Coping (per LF)',                         u: 'LF', c: 22.00,  cat: 'Deck & Coping' },
  W011: { d: 'Vinyl Liner — Standard 16x32 In-Ground',        u: 'EA', c: 1450.00, cat: 'Structure' },
  W012: { d: 'Vinyl Liner — Premium Pattern 20x40',           u: 'EA', c: 2650.00, cat: 'Structure' },
  W013: { d: 'Fiberglass Shell 14x28 (delivery + set)',       u: 'EA', c: 14850.00, cat: 'Structure' },
  W014: { d: 'Fiberglass Shell 16x35 (delivery + set)',       u: 'EA', c: 22850.00, cat: 'Structure' },
  W015: { d: 'Pea Gravel Backfill (per cu-yd)',               u: 'CY', c: 42.00,  cat: 'Structure' },
  W016: { d: 'Bond Beam Steel',                               u: 'EA', c: 385.00, cat: 'Structure' },

  // Pumps / motors
  W030: { d: 'Hayward Super Pump 1.5HP',                      u: 'EA', c: 545.00, cat: 'Pumps' },
  W031: { d: 'Pentair IntelliFlo VSF Variable-Speed',         u: 'EA', c: 1385.00, cat: 'Pumps' },
  W032: { d: 'Jandy Stealth 2HP Single-Speed',                u: 'EA', c: 685.00, cat: 'Pumps' },
  W033: { d: 'Pump Motor 1.5HP Replacement',                  u: 'EA', c: 285.00, cat: 'Pumps' },
  W034: { d: 'Pump Motor 2HP Replacement',                    u: 'EA', c: 325.00, cat: 'Pumps' },
  W035: { d: 'Pump Seal Kit (universal)',                     u: 'EA', c: 45.00,  cat: 'Pumps' },
  W036: { d: 'Pump Basket / Strainer',                        u: 'EA', c: 22.00,  cat: 'Pumps' },
  W037: { d: 'Pump Impeller (universal)',                     u: 'EA', c: 85.00,  cat: 'Pumps' },
  W038: { d: 'Booster Pump — Pressure-Side Cleaner',          u: 'EA', c: 385.00, cat: 'Pumps' },

  // Filters
  W050: { d: 'Cartridge Filter 200 sqft',                     u: 'EA', c: 585.00, cat: 'Filters' },
  W051: { d: 'Cartridge Filter 425 sqft',                     u: 'EA', c: 985.00, cat: 'Filters' },
  W052: { d: 'DE Filter 48 sqft',                             u: 'EA', c: 685.00, cat: 'Filters' },
  W053: { d: 'Sand Filter 30" (300 lb)',                      u: 'EA', c: 585.00, cat: 'Filters' },
  W054: { d: 'Filter Cartridge Replacement (200 sqft)',       u: 'EA', c: 145.00, cat: 'Filters' },
  W055: { d: 'DE Powder 25lb',                                u: 'EA', c: 48.00,  cat: 'Filters' },
  W056: { d: 'Filter Sand #20 50lb bag',                      u: 'EA', c: 22.00,  cat: 'Filters' },
  W057: { d: 'Filter Gauge Replacement',                      u: 'EA', c: 22.00,  cat: 'Filters' },

  // Heaters
  W070: { d: 'Gas Pool Heater 250k BTU (NG)',                 u: 'EA', c: 2850.00, cat: 'Heaters' },
  W071: { d: 'Gas Pool Heater 400k BTU (NG)',                 u: 'EA', c: 3650.00, cat: 'Heaters' },
  W072: { d: 'Electric Heat Pump 125k BTU',                   u: 'EA', c: 3450.00, cat: 'Heaters' },
  W073: { d: 'Solar Heating Panel (per 4x12 panel)',          u: 'EA', c: 485.00, cat: 'Heaters' },
  W074: { d: 'Heater Ignitor / Igniter',                      u: 'EA', c: 85.00,  cat: 'Heaters' },
  W075: { d: 'Heater Thermistor Sensor',                      u: 'EA', c: 65.00,  cat: 'Heaters' },
  W076: { d: 'Heater Control Board',                          u: 'EA', c: 385.00, cat: 'Heaters' },

  // Salt / chlorinators / sanitizer
  W090: { d: 'Salt Chlorine Generator (40k gal)',             u: 'EA', c: 1685.00, cat: 'Sanitizers' },
  W091: { d: 'Salt Cell Replacement (40k gal)',               u: 'EA', c: 685.00, cat: 'Sanitizers' },
  W092: { d: 'Inline Chlorinator (3" tab feeder)',            u: 'EA', c: 145.00, cat: 'Sanitizers' },
  W093: { d: 'Ozone Generator — Corona Discharge',            u: 'EA', c: 985.00, cat: 'Sanitizers' },
  W094: { d: 'Pool Salt 40lb bag',                            u: 'EA', c: 12.00,  cat: 'Sanitizers' },

  // Plumbing
  W110: { d: '1.5" Schedule 40 PVC (per ft)',                 u: 'LF', c: 1.20,   cat: 'Plumbing' },
  W111: { d: '2" Schedule 40 PVC (per ft)',                   u: 'LF', c: 1.85,   cat: 'Plumbing' },
  W112: { d: '2" PVC 90 Elbow',                               u: 'EA', c: 3.20,   cat: 'Plumbing' },
  W113: { d: '2" PVC Tee',                                    u: 'EA', c: 4.50,   cat: 'Plumbing' },
  W114: { d: '2" PVC Union',                                  u: 'EA', c: 8.50,   cat: 'Plumbing' },
  W115: { d: '2" 3-Way Diverter Valve',                       u: 'EA', c: 85.00,  cat: 'Plumbing' },
  W116: { d: '2" Check Valve',                                u: 'EA', c: 42.00,  cat: 'Plumbing' },
  W117: { d: 'Skimmer Body Standard',                         u: 'EA', c: 145.00, cat: 'Plumbing' },
  W118: { d: 'Skimmer Weir + Basket',                         u: 'EA', c: 32.00,  cat: 'Plumbing' },
  W119: { d: 'Return Eyeball Jet (per set of 4)',             u: 'PK', c: 22.00,  cat: 'Plumbing' },
  W120: { d: 'Main Drain Cover — VGB Compliant',              u: 'EA', c: 65.00,  cat: 'Plumbing' },
  W121: { d: 'Autofill Float Valve',                          u: 'EA', c: 85.00,  cat: 'Plumbing' },
  W122: { d: 'PVC Primer + Cement Kit',                       u: 'EA', c: 18.00,  cat: 'Plumbing' },

  // Automation / lighting
  W140: { d: 'Pentair EasyTouch Automation Kit',              u: 'EA', c: 985.00, cat: 'Automation' },
  W141: { d: 'Hayward OmniLogic Controller',                  u: 'EA', c: 1385.00, cat: 'Automation' },
  W142: { d: 'Pool Light — LED Color-Changing (spa niche)',   u: 'EA', c: 385.00, cat: 'Automation' },
  W143: { d: 'Pool Light — LED White (main pool)',            u: 'EA', c: 285.00, cat: 'Automation' },
  W144: { d: 'Light Niche Junction Box',                      u: 'EA', c: 85.00,  cat: 'Automation' },

  // Safety / covers
  W160: { d: 'Removable Mesh Safety Fence (per LF)',          u: 'LF', c: 22.00, cat: 'Safety' },
  W161: { d: 'Self-Closing Safety Gate',                      u: 'EA', c: 385.00, cat: 'Safety' },
  W162: { d: 'Pool Alarm — Surface Wave',                     u: 'EA', c: 145.00, cat: 'Safety' },
  W163: { d: 'Gate Alarm',                                    u: 'EA', c: 65.00,  cat: 'Safety' },
  W164: { d: 'Mesh Winter Cover 20x40',                       u: 'EA', c: 685.00, cat: 'Safety' },
  W165: { d: 'Solid Winter Cover 20x40',                      u: 'EA', c: 485.00, cat: 'Safety' },
  W166: { d: 'Automatic Pool Cover Kit',                      u: 'EA', c: 8985.00, cat: 'Safety' },

  // Chemicals
  W180: { d: 'Liquid Chlorine 12.5% (per gal)',               u: 'GA', c: 5.50,  cat: 'Chemicals' },
  W181: { d: '3" Chlorine Tabs 25lb bucket',                  u: 'EA', c: 145.00, cat: 'Chemicals' },
  W182: { d: 'Granular Cal-Hypo 25lb',                        u: 'EA', c: 95.00,  cat: 'Chemicals' },
  W183: { d: 'Muriatic Acid (per gal)',                       u: 'GA', c: 8.50,   cat: 'Chemicals' },
  W184: { d: 'Sodium Bicarb (Alkalinity Up) 25lb',            u: 'EA', c: 32.00,  cat: 'Chemicals' },
  W185: { d: 'Soda Ash (pH Up) 25lb',                         u: 'EA', c: 32.00,  cat: 'Chemicals' },
  W186: { d: 'Cyanuric Acid (Stabilizer) 25lb',               u: 'EA', c: 48.00,  cat: 'Chemicals' },
  W187: { d: 'Algaecide 60% Copper (per gal)',                u: 'GA', c: 28.00,  cat: 'Chemicals' },
  W188: { d: 'Phosphate Remover (per gal)',                   u: 'GA', c: 32.00,  cat: 'Chemicals' },
  W189: { d: 'Pool Shock 1lb pkt',                            u: 'EA', c: 6.50,   cat: 'Chemicals' },
  W190: { d: 'Calcium Chloride Increaser 25lb',               u: 'EA', c: 32.00,  cat: 'Chemicals' },
  W191: { d: 'Metal Sequestrant (per qt)',                    u: 'EA', c: 22.00,  cat: 'Chemicals' },
  W192: { d: 'Pool Antifreeze 1gal (winterization)',          u: 'EA', c: 12.00,  cat: 'Chemicals' },

  // Cleaning / equipment
  W210: { d: 'Manual Vacuum Head + Hose 30ft',                u: 'EA', c: 65.00,  cat: 'Cleaning' },
  W211: { d: 'Telescoping Pool Pole 16ft',                    u: 'EA', c: 45.00,  cat: 'Cleaning' },
  W212: { d: 'Pool Leaf Rake',                                u: 'EA', c: 28.00,  cat: 'Cleaning' },
  W213: { d: 'Pool Brush 18" (nylon)',                        u: 'EA', c: 22.00,  cat: 'Cleaning' },
  W214: { d: 'Polaris 280 Pressure-Side Cleaner',             u: 'EA', c: 685.00, cat: 'Cleaning' },
  W215: { d: 'Dolphin Nautilus Robotic Cleaner',              u: 'EA', c: 985.00, cat: 'Cleaning' },
  W216: { d: 'Test Kit — Taylor K-2006 Complete',             u: 'EA', c: 85.00,  cat: 'Cleaning' },
  W217: { d: 'Test Strips 50-pk (7-way)',                     u: 'PK', c: 18.00,  cat: 'Cleaning' },
  W218: { d: 'Salt Test Strips (25-pk)',                      u: 'PK', c: 22.00,  cat: 'Cleaning' },

  // Consumables
  W230: { d: 'Silicone Pool Sealant (10oz)',                  u: 'EA', c: 12.00, cat: 'Consumables' },
  W231: { d: 'Underwater Epoxy 2-part',                       u: 'EA', c: 32.00, cat: 'Consumables' },
  W232: { d: 'Pool Putty (fiberglass repair)',                u: 'EA', c: 22.00, cat: 'Consumables' },
  W233: { d: 'Tile / Coping Grout 25lb',                      u: 'EA', c: 22.00, cat: 'Consumables' },
};

// ── Categories ─────────────────────────────────────────────────────────────
const CATEGORIES = [
  // Installation-only
  { id: 'pool_new',      icon: '🏗',  name: 'New Pool Builds',          color: '#2E5FA3', desc: 'Concrete, vinyl, fiberglass full builds', subBooks:['installation'] },
  { id: 'pool_spa',      icon: '♨️',   name: 'Spa & Hot Tub',            color: '#C55A11', desc: 'Spa install + spa-side plumbing', subBooks:['installation'] },
  { id: 'pool_auto',     icon: '📱',  name: 'Automation & Lighting',    color: '#5B2D8E', desc: 'Automation controllers, LED lights', subBooks:['installation'] },

  // Repair-only
  { id: 'pool_leak',     icon: '💧',  name: 'Leak Detection & Repair',  color: '#2E5FA3', desc: 'Pressure test, dye test, patch, replumb', subBooks:['repair'] },
  { id: 'pool_surf',     icon: '◨',   name: 'Surface / Tile / Coping',  color: '#8B6914', desc: 'Plaster patch, tile replace, coping repair', subBooks:['repair'] },
  { id: 'pool_plumb',    icon: '🔧',  name: 'Pool Plumbing Repair',     color: '#1F7A8C', desc: 'Skimmers, returns, drains, valves', subBooks:['repair'] },

  // Maintenance-only
  { id: 'pool_diag',     icon: '🔍',  name: 'Inspection & Diagnosis',   color: '#2E5FA3', desc: 'Full system inspection, water test', subBooks:['maintenance'] },
  { id: 'pool_recur',    icon: '🔁',  name: 'Recurring Service Plans',  color: '#E8A500', desc: 'Weekly / bi-weekly service plans', subBooks:['maintenance'] },
  { id: 'pool_seasonal', icon: '🍂',  name: 'Open / Close (Seasonal)',  color: '#1E6B3C', desc: 'Spring open, fall winterize', subBooks:['maintenance'] },
  { id: 'pool_chem',     icon: '🧪',  name: 'Chemistry & Water',        color: '#5B2D8E', desc: 'Water testing, balance, shock, algaecide', subBooks:['maintenance'] },
  { id: 'pool_clean',    icon: '🧹',  name: 'Cleaning & Vacuum',        color: '#1F7A8C', desc: 'Vacuum, brush, skim, empty baskets', subBooks:['maintenance'] },

  // Shared across install + repair (equipment install / equipment repair)
  { id: 'pool_equip',    icon: '⚙️',  name: 'Equipment (Pumps/Filters/Heaters)', color: '#C55A11', desc: 'Pumps, filters, heaters, salt cells — install & repair', subBooks:['installation','repair'] },
  { id: 'pool_deck',     icon: '🪨', name: 'Deck & Coping',             color: '#7A4B1A', desc: 'Pool deck install and repair', subBooks:['installation','repair'] },
  { id: 'pool_safety',   icon: '🛡',  name: 'Safety & Fencing',          color: '#C00000', desc: 'Fencing, gates, alarms, covers', subBooks:['installation','repair','maintenance'] },
];

// ── INSTALLATION TASKS ─────────────────────────────────────────────────────
const INSTALL_TASKS = [
  // New builds
  { cat:'pool_new', tag:'New Build', n:'Concrete/Gunite Pool Build — 16x32 Standard', hrs:280, time:'6-10 weeks', diff:'Complex',
    desc:'Turnkey new-construction gunite pool build 16x32. Includes excavation, steel, gunite, tile, coping, plaster, standard equipment set (pump + cartridge filter), and startup chemistry. Deck and automation separate.',
    mats:[['W001',35],['W002',80],['W003',480],['W006',60],['W008',96],['W016',1],['W030',1],['W050',1],['W117',2],['W119',2],['W120',1],['W111',80],['W143',2],['W144',2]] },
  { cat:'pool_new', tag:'New Build', n:'Concrete/Gunite Pool Build — 20x40 Premium', hrs:400, time:'8-14 weeks', diff:'Complex',
    desc:'Premium 20x40 gunite build with Pebble-Tec finish, glass waterline tile, travertine coping, variable-speed pump, heater, and LED lighting. Deck separate.',
    mats:[['W001',55],['W002',120],['W005',800],['W007',96],['W009',120],['W016',2],['W031',1],['W051',1],['W070',1],['W117',2],['W119',3],['W120',1],['W111',120],['W142',1],['W143',2],['W144',3]] },
  { cat:'pool_new', tag:'New Build', n:'Vinyl-Liner Pool Build — 16x32', hrs:160, time:'3-5 weeks', diff:'Complex',
    desc:'Vinyl-liner in-ground pool build 16x32. Includes excavation, wall panels, floor prep, liner, standard equipment set, and startup. Deck separate.',
    mats:[['W011',1],['W015',20],['W030',1],['W050',1],['W117',1],['W119',2],['W120',1],['W111',60],['W008',96]] },
  { cat:'pool_new', tag:'New Build', n:'Fiberglass Pool Install — 14x28', hrs:80, time:'2-3 weeks', diff:'Complex',
    desc:'Fiberglass shell install 14x28. Excavate, set shell with crane, plumb, backfill, and startup. Deck separate.',
    mats:[['W013',1],['W015',35],['W030',1],['W050',1],['W111',60],['W119',2],['W120',1]] },
  { cat:'pool_new', tag:'New Build', n:'Fiberglass Pool Install — 16x35 Premium', hrs:100, time:'2-3 weeks', diff:'Complex',
    desc:'Premium fiberglass shell install 16x35 with variable-speed pump, heater, salt system, and LED lighting.',
    mats:[['W014',1],['W015',45],['W031',1],['W050',1],['W070',1],['W090',1],['W143',2],['W111',80]] },
  { cat:'pool_new', tag:'Resurface', n:'Plaster Resurface — 16x32 Marcite', hrs:32, time:'1 week', diff:'Hard',
    desc:'Drain, chip old plaster, acid wash, refinish with white marcite plaster. Includes startup chemistry.',
    mats:[['W003',480]] },
  { cat:'pool_new', tag:'Resurface', n:'Pebble-Tec Resurface — 16x32', hrs:40, time:'~1 week', diff:'Hard',
    desc:'Premium pebble aggregate resurface. Includes tile line refresh option (extra).',
    mats:[['W005',480]] },
  { cat:'pool_new', tag:'Vinyl Liner', n:'Vinyl Liner Replacement — 16x32', hrs:16, time:'2 days', diff:'Hard',
    desc:'Drain existing pool, remove and dispose old liner, install new liner with fresh gaskets and startup.',
    mats:[['W011',1]] },
  { cat:'pool_new', tag:'Vinyl Liner', n:'Vinyl Liner Replacement — 20x40 Premium Pattern', hrs:20, time:'2-3 days', diff:'Hard',
    desc:'Premium pattern liner replacement on larger pool.',
    mats:[['W012',1]] },

  // Spa
  { cat:'pool_spa', tag:'Spa Install', n:'Above-Ground Spa Install (electrical + plumbing)', hrs:8, time:'8 hr', diff:'Moderate',
    desc:'Install customer-selected above-ground spa with 240V electrical (subpanel), water fill, and startup.',
    mats:[] },
  { cat:'pool_spa', tag:'Spa Install', n:'In-Ground Spa Add-On (shared equipment)', hrs:60, time:'~2 weeks', diff:'Complex',
    desc:'Build in-ground spa attached to existing pool. Shares pump/filter but adds heater + blower.',
    mats:[['W001',8],['W003',60],['W070',1]] },

  // Equipment install (shared cat)
  { cat:'pool_equip', tag:'Equipment', n:'Pool Pump Install — 1.5 HP Standard', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install new 1.5 HP single-speed pump with unions, gasket, and priming.',
    mats:[['W030',1],['W114',2],['W035',1]] },
  { cat:'pool_equip', tag:'Equipment', n:'Variable-Speed Pump Install (IntelliFlo)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install Pentair IntelliFlo VSF variable-speed pump. Includes wiring and RS-485 automation link.',
    mats:[['W031',1],['W114',2]] },
  { cat:'pool_equip', tag:'Equipment', n:'Filter Install — 425 sqft Cartridge', hrs:2.5, time:'2.5 hr', diff:'Moderate',
    desc:'Install new 425-sqft cartridge filter with pressure gauge and drain plumbing.',
    mats:[['W051',1],['W057',1]] },
  { cat:'pool_equip', tag:'Equipment', n:'Filter Install — DE 48 sqft', hrs:2.5, time:'2.5 hr', diff:'Moderate',
    desc:'Install new 48-sqft DE filter with first charge of DE powder.',
    mats:[['W052',1],['W055',2]] },
  { cat:'pool_equip', tag:'Equipment', n:'Gas Heater Install — 400k BTU', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Install 400k BTU natural-gas pool heater. Includes gas connection, venting, and startup. Gas line rough-in separate.',
    mats:[['W071',1]] },
  { cat:'pool_equip', tag:'Equipment', n:'Electric Heat Pump Install — 125k BTU', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Install electric heat pump for pool with dedicated 60A circuit (electrical separate).',
    mats:[['W072',1]] },
  { cat:'pool_equip', tag:'Equipment', n:'Salt Chlorine Generator Install (40k gal)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install salt cell + control module. Includes initial 6 bags of salt for a 20x40 pool.',
    mats:[['W090',1],['W094',6]] },
  { cat:'pool_equip', tag:'Equipment', n:'Inline Chlorinator Install', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Install inline 3" tab chlorinator on the return plumbing.',
    mats:[['W092',1]] },
  { cat:'pool_equip', tag:'Equipment', n:'Autofill Valve Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install autofill valve tied into an existing water supply. Prevents low-water pump damage.',
    mats:[['W121',1]] },

  // Deck & coping (shared cat)
  { cat:'pool_deck', tag:'Deck', n:'Concrete Pool Deck Install (per sqft)', hrs:0.15, time:'per sqft', diff:'Moderate',
    desc:'Broom-finish concrete pool deck install with expansion joints. Priced per sqft.',
    mats:[['W001',0.02]] },
  { cat:'pool_deck', tag:'Deck', n:'Travertine Pool Deck (per sqft)', hrs:0.3, time:'per sqft', diff:'Hard',
    desc:'Travertine paver pool deck install with proper base prep. Priced per sqft.',
    mats:[['W009',0.6]] },

  // Automation
  { cat:'pool_auto', tag:'Automation', n:'Pentair EasyTouch Automation Install', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Install Pentair EasyTouch automation kit with wireless remote. Wires to pump, heater, salt cell, and 2 valve actuators.',
    mats:[['W140',1]] },
  { cat:'pool_auto', tag:'Automation', n:'Hayward OmniLogic Automation Install', hrs:7, time:'7 hr', diff:'Hard',
    desc:'Install Hayward OmniLogic controller with smartphone app support and up to 4 relays.',
    mats:[['W141',1]] },
  { cat:'pool_auto', tag:'Lighting', n:'LED Pool Light Install (per light)', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Install LED niche light with junction box and low-voltage wiring back to switch or automation.',
    mats:[['W143',1],['W144',1]] },
  { cat:'pool_auto', tag:'Lighting', n:'Color-Changing LED Retrofit (per light)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Retrofit existing niche with color-changing LED. Includes wet-niche gasket and startup pairing.',
    mats:[['W142',1]] },

  // Safety
  { cat:'pool_safety', tag:'Safety', n:'Removable Mesh Safety Fence Install (per LF)', hrs:0.4, time:'per LF', diff:'Moderate',
    desc:'Install removable mesh safety fence around pool perimeter with drilled sleeves in decking. Priced per LF.',
    mats:[['W160',1]] },
  { cat:'pool_safety', tag:'Safety', n:'Self-Closing Safety Gate Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install self-closing / self-latching safety gate to meet code.',
    mats:[['W161',1]] },
  { cat:'pool_safety', tag:'Safety', n:'Automatic Pool Cover Install', hrs:24, time:'~3 days', diff:'Complex',
    desc:'Full automatic pool cover install with tracks, mechanism, and switch. Best done during pool build.',
    mats:[['W166',1]] },
];

// ── REPAIR TASKS ───────────────────────────────────────────────────────────
const REPAIR_TASKS = [
  // Leak
  { cat:'pool_leak', tag:'Leak', n:'Leak Detection — Full System', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Complete leak-detection service using pressure testing, dye testing, and electronic listening. Written report and repair estimate.',
    mats:[] },
  { cat:'pool_leak', tag:'Leak', n:'Underground Line Leak Repair — Locate & Fix', hrs:5, time:'5 hr', diff:'Complex',
    desc:'Locate a specific line leak (skimmer, return, main drain) and dig up to repair. Includes replumbing that section.',
    mats:[['W111',10],['W112',2],['W114',2],['W122',1]] },
  { cat:'pool_leak', tag:'Leak', n:'Skimmer Body Replacement', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Cut out failed skimmer body from concrete pool and install new one. Includes plaster patch and tile touchup.',
    mats:[['W117',1],['W003',12]] },
  { cat:'pool_leak', tag:'Leak', n:'Return Fitting Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed return eyeball fitting with proper gasket and thread sealant.',
    mats:[['W119',0.25]] },
  { cat:'pool_leak', tag:'Leak', n:'Vinyl Liner Patch (single hole)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Locate and patch small hole in vinyl liner. Underwater patch kit.',
    mats:[['W231',1]] },
  { cat:'pool_leak', tag:'Leak', n:'Fiberglass Shell Crack Repair', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Fiberglass gel-coat crack repair with matched color and proper cure. Includes drain-down and refill.',
    mats:[['W232',2]] },

  // Pump / motor
  { cat:'pool_equip', tag:'Pump Repair', n:'Pump Motor Replacement — 1.5 HP', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed 1.5 HP pump motor. Includes new shaft seal and gasket.',
    mats:[['W033',1],['W035',1]] },
  { cat:'pool_equip', tag:'Pump Repair', n:'Pump Motor Replacement — 2 HP', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed 2 HP pump motor with new seal.',
    mats:[['W034',1],['W035',1]] },
  { cat:'pool_equip', tag:'Pump Repair', n:'Pump Shaft Seal Replacement', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace pump shaft seal (fix wet-end leaks) without full motor swap.',
    mats:[['W035',1]] },
  { cat:'pool_equip', tag:'Pump Repair', n:'Pump Basket / Strainer Replacement', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace cracked pump strainer basket.',
    mats:[['W036',1]] },
  { cat:'pool_equip', tag:'Pump Repair', n:'Pump Impeller Replacement', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace worn or clogged pump impeller. Often restores prime and flow rate.',
    mats:[['W037',1]] },
  { cat:'pool_equip', tag:'Pump Repair', n:'Booster Pump Replacement (pressure-side cleaner)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed booster pump used with Polaris-style cleaners.',
    mats:[['W038',1]] },

  // Filter
  { cat:'pool_equip', tag:'Filter Repair', n:'Filter Cartridge Replacement (200 sqft)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace 200-sqft cartridge with new one.',
    mats:[['W054',1]] },
  { cat:'pool_equip', tag:'Filter Repair', n:'Filter Cartridge Deep-Clean (per set)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Deep-clean cartridge filters with degreaser. Extends life 1-2 years vs replace.',
    mats:[] },
  { cat:'pool_equip', tag:'Filter Repair', n:'DE Filter Grid Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace damaged DE filter grid(s). Includes new DE charge.',
    mats:[['W055',2]] },
  { cat:'pool_equip', tag:'Filter Repair', n:'Sand Filter — Sand Change', hrs:2.5, time:'2.5 hr', diff:'Moderate',
    desc:'Full sand change on 30" sand filter (typical 300 lb).',
    mats:[['W056',6]] },
  { cat:'pool_equip', tag:'Filter Repair', n:'Filter Gauge Replacement', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace broken filter pressure gauge.',
    mats:[['W057',1]] },

  // Heater
  { cat:'pool_equip', tag:'Heater Repair', n:'Heater Ignitor Replacement', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace failed heater ignitor. Common cause of no-fire.',
    mats:[['W074',1]] },
  { cat:'pool_equip', tag:'Heater Repair', n:'Heater Thermistor / Sensor Replacement', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace failed water / high-limit temperature sensor.',
    mats:[['W075',1]] },
  { cat:'pool_equip', tag:'Heater Repair', n:'Heater Control Board Replacement', hrs:2.5, time:'2.5 hr', diff:'Hard',
    desc:'Replace failed heater control board.',
    mats:[['W076',1]] },
  { cat:'pool_equip', tag:'Salt System', n:'Salt Cell Replacement', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace worn salt cell. Typical 3-7 year lifespan.',
    mats:[['W091',1]] },

  // Surface / tile / coping
  { cat:'pool_surf', tag:'Tile', n:'Waterline Tile Repair (per LF)', hrs:0.5, time:'per LF', diff:'Moderate',
    desc:'Remove failed waterline tile section and re-set with matching tile. Priced per LF.',
    mats:[['W006',0.5],['W233',0.05]] },
  { cat:'pool_surf', tag:'Plaster', n:'Plaster Spot Repair (per patch)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Localized plaster spot repair — chip out, patch with matching plaster, color-blend.',
    mats:[['W003',4]] },
  { cat:'pool_surf', tag:'Coping', n:'Coping Stone Replacement (per LF)', hrs:0.75, time:'per LF', diff:'Moderate',
    desc:'Replace failed coping stones with matching material. Priced per LF.',
    mats:[['W008',1],['W233',0.05]] },
  { cat:'pool_surf', tag:'Repair', n:'Underwater Silicone / Epoxy Repair', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Apply underwater silicone or 2-part epoxy to seal cracked plaster, tile joints, or fitting flange.',
    mats:[['W230',1],['W231',1]] },

  // Plumbing
  { cat:'pool_plumb', tag:'Plumbing', n:'Skimmer Weir Replacement', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace broken skimmer weir door and basket.',
    mats:[['W118',1]] },
  { cat:'pool_plumb', tag:'Plumbing', n:'Main Drain Cover Replacement (VGB)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace main drain cover with VGB-compliant cover. Required for safety on any pool.',
    mats:[['W120',1]] },
  { cat:'pool_plumb', tag:'Plumbing', n:'3-Way Valve Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Cut in and replace failed 3-way diverter valve on pump/heater/spa plumbing.',
    mats:[['W115',1],['W111',4],['W114',2]] },
  { cat:'pool_plumb', tag:'Plumbing', n:'Check Valve Replacement', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace failed 2" check valve.',
    mats:[['W116',1],['W114',2]] },

  // Safety fixes
  { cat:'pool_safety', tag:'Safety Repair', n:'Safety Fence Repair (per LF)', hrs:0.25, time:'per LF', diff:'Easy',
    desc:'Replace torn mesh section or bent post on existing removable safety fence.',
    mats:[['W160',1]] },
];

// ── MAINTENANCE TASKS ──────────────────────────────────────────────────────
const MAINT_TASKS = [
  // Diagnosis
  { cat:'pool_diag', tag:'Inspection', n:'Full Pool System Inspection', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Whole-system inspection: pump, filter, heater, plumbing, chemistry, safety. Written report and quote for any needed repairs.',
    mats:[] },
  { cat:'pool_diag', tag:'Inspection', n:'Real-Estate Pool Inspection Report', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Pre-purchase pool inspection for real estate transactions. Includes equipment age, condition, code-compliance, and remediation quote.',
    mats:[] },
  { cat:'pool_diag', tag:'Inspection', n:'Emergency Callout / Same-Day', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Emergency same-day pool service call (pump failure, green pool, safety issue). Higher rate.',
    mats:[] },

  // Recurring
  { cat:'pool_recur', tag:'Plan', n:'Weekly Full-Service Plan (per visit)', hrs:1, time:'1 hr per visit', diff:'Easy',
    desc:'Weekly service: skim, brush, vacuum, empty baskets, test water, add chemicals as needed, backwash if applicable. Priced per visit.',
    mats:[['W181',0.05],['W180',0.1],['W183',0.05]] },
  { cat:'pool_recur', tag:'Plan', n:'Bi-Weekly Full-Service Plan (per visit)', hrs:1.25, time:'~1.25 hr per visit', diff:'Easy',
    desc:'Bi-weekly full service. Slightly longer per visit due to more accumulation between visits.',
    mats:[['W181',0.08],['W180',0.15],['W183',0.08]] },
  { cat:'pool_recur', tag:'Plan', n:'Monthly Chemistry-Only Plan (per visit)', hrs:0.5, time:'30 min per visit', diff:'Easy',
    desc:'Monthly water test + chemical top-off only. Customer handles cleaning.',
    mats:[['W181',0.15],['W180',0.2]] },
  { cat:'pool_recur', tag:'Plan', n:'Premium Salt-Pool Weekly Plan', hrs:1.25, time:'~1.25 hr per visit', diff:'Moderate',
    desc:'Salt-pool specialized weekly service. Includes salt cell inspection, salt-level test + top-up, and chemistry balance.',
    mats:[['W094',0.5],['W218',0.05],['W183',0.1]] },

  // Seasonal
  { cat:'pool_seasonal', tag:'Open', n:'Spring Pool Opening — Standard', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Remove winter cover, reinstall skimmer baskets, ladders/rails, prime pump, start filter, shock treatment, initial chemistry balance.',
    mats:[['W189',4],['W180',2]] },
  { cat:'pool_seasonal', tag:'Open', n:'Spring Opening — Extra Cleanup (green pool)', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Full opening including green-pool recovery: extra shock, algaecide, filter clean, extended run-time visit.',
    mats:[['W189',8],['W187',1],['W180',3]] },
  { cat:'pool_seasonal', tag:'Close', n:'Fall Pool Closing — Standard', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Winterize pool: lower water, blow lines, add pool antifreeze, remove skimmer basket + jets, add winter chemicals, install winter cover.',
    mats:[['W192',4],['W189',2]] },
  { cat:'pool_seasonal', tag:'Cover', n:'Mesh Winter Cover Install (20x40)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install mesh safety winter cover with anchor system. Includes anchor drilling if none exists.',
    mats:[['W164',1]] },
  { cat:'pool_seasonal', tag:'Cover', n:'Solid Winter Cover Install (20x40)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Install solid winter cover with water bags around perimeter.',
    mats:[['W165',1]] },

  // Chemistry
  { cat:'pool_chem', tag:'Chem', n:'Complete Water Test & Balance', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'On-site full water test (pH, alkalinity, chlorine, CYA, calcium, phosphates). Balance to spec.',
    mats:[['W183',0.2],['W184',0.1],['W185',0.1]] },
  { cat:'pool_chem', tag:'Chem', n:'Shock Treatment', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Apply granular or liquid shock to break down chloramines and organics.',
    mats:[['W189',3]] },
  { cat:'pool_chem', tag:'Chem', n:'Algae Treatment — Standard', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Treat visible algae: brush walls, shock, algaecide, ensure filter runs 24/7 until clear.',
    mats:[['W189',4],['W187',1]] },
  { cat:'pool_chem', tag:'Chem', n:'Black Algae Treatment', hrs:2, time:'2 hr', diff:'Hard',
    desc:'Aggressive treatment for stubborn black algae — heavy shock, wire brush, spot-treat, algaecide.',
    mats:[['W189',6],['W187',1]] },
  { cat:'pool_chem', tag:'Chem', n:'Phosphate Removal Treatment', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Add phosphate remover to eliminate algae food source. Includes follow-up filter clean.',
    mats:[['W188',1]] },
  { cat:'pool_chem', tag:'Chem', n:'Stain Removal / Metal Sequestrant Treatment', hrs:1, time:'1 hr', diff:'Moderate',
    desc:'Apply metal sequestrant and ascorbic acid to remove iron/copper stains from plaster.',
    mats:[['W191',2]] },

  // Cleaning
  { cat:'pool_clean', tag:'Cleaning', n:'Vacuum & Brush Service (one-time)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Manual vacuum + brush + skim of pool. Best for pools not on a recurring service plan.',
    mats:[] },
  { cat:'pool_clean', tag:'Cleaning', n:'Pool Drain & Acid Wash', hrs:12, time:'2 days', diff:'Hard',
    desc:'Full drain, acid wash of plaster to remove stains + mineral deposits, refill, and startup chemistry.',
    mats:[['W183',10],['W189',6]] },
  { cat:'pool_clean', tag:'Cleaning', n:'Filter Cartridge On-Site Deep-Clean', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Pull cartridges, hose off, soak in degreaser, and reinstall.',
    mats:[] },
  { cat:'pool_clean', tag:'Cleaning', n:'Automatic Cleaner Setup / Tune-Up', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Set up new pressure-side or robotic cleaner. Adjust for pool shape and flow. Includes user training.',
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

    console.log('→ ALTER company_settings ADD COLUMN service_pools');
    await db.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS service_pools BOOLEAN DEFAULT false`);
    await db.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS svc_types_pools JSONB DEFAULT '[]'::jsonb`);
    await db.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS svc_license_pools TEXT`);

    console.log('→ Clearing existing pools data');
    await db.query(
      `DELETE FROM pb_task_materials
        WHERE task_id IN (SELECT id FROM pb_tasks WHERE service = 'pools')`
    );
    await db.query(`DELETE FROM pb_tasks       WHERE service = 'pools'`);
    await db.query(`DELETE FROM pb_materials   WHERE service = 'pools'`);
    await db.query(`DELETE FROM pb_categories  WHERE service = 'pools'`);
    await db.query(`DELETE FROM pb_engine      WHERE service = 'pools'`);

    console.log('→ Seeding pools engines (installation, repair, maintenance)');
    for (const st of ['installation', 'repair', 'maintenance']) {
      await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ('pools', $1, 32, 0, 0, 0, 22, 8, 3,
                 1600, 7.65, 2.5, 8, 0, 0, 0, 0, 0, 0,
                 1, 1600, 0, $2::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [st, JSON.stringify(DEFAULT_OH)]
      );
    }

    console.log(`→ Inserting ${Object.keys(MATS).length} pools materials`);
    for (const [id, m] of Object.entries(MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,'pools')`,
        [id, m.d, m.u, m.c, m.cat]
      );
    }

    console.log(`→ Inserting pools categories`);
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      for (const t of c.subBooks) {
        await db.query(
          `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'pools',$7)
           ON CONFLICT (id, service, service_type) DO NOTHING`,
          [c.id, c.icon, c.name, c.color, c.desc, i, t]
        );
      }
    }

    async function insertBucket(tasks, subType, label) {
      console.log(`→ Inserting ${tasks.length} ${label} tasks`);
      let links = 0;
      for (const t of tasks) {
        const { rows: [row] } = await db.query(
          `INSERT INTO pb_tasks
             (category_id, name, tag, hours, time_range, difficulty, notes, description,
              service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'',$7,'pools',$8) RETURNING id`,
          [t.cat, t.n, t.tag, t.hrs, t.time, t.diff, t.desc, subType]
        );
        for (const [mid, qty] of (t.mats || [])) {
          if (!MATS[mid]) continue;
          await db.query(
            `INSERT INTO pb_task_materials (task_id, material_id, qty) VALUES ($1,$2,$3)`,
            [row.id, mid, qty]
          );
          links++;
        }
      }
      return links;
    }
    const iL = await insertBucket(INSTALL_TASKS, 'installation', 'installation');
    const rL = await insertBucket(REPAIR_TASKS,  'repair',       'repair');
    const mL = await insertBucket(MAINT_TASKS,   'maintenance',  'maintenance');
    console.log(`  → material links: install=${iL}, repair=${rL}, maintenance=${mL}`);

    console.log('→ Enabling pools in company_settings');
    await db.query(`
      INSERT INTO company_settings (id, service_pools)
      VALUES ('main', true)
      ON CONFLICT (id) DO UPDATE SET service_pools = true
    `);

    await db.query('COMMIT');
    console.log('✓ Migration 012 complete.');

    const { rows: stats } = await db.query(
      `SELECT service, service_type, COUNT(*)::int AS n
         FROM pb_tasks
        WHERE service = 'pools'
        GROUP BY service, service_type ORDER BY service_type`
    );
    console.log('  pools task counts:', stats.map(r => `${r.service_type}=${r.n}`).join(', '));
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

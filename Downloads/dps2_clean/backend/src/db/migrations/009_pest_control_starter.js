'use strict';
/**
 * Migration 009: Seed the Pest Control pricebook.
 *
 * Pest Control splits by target/scope — mirrors how PMPs (pest management
 * professionals) actually structure their books:
 *   service_type = 'general'  — household insects (ants, roaches, spiders,
 *                               wasps, bed bugs, mosquitoes, general pest plans)
 *   service_type = 'termite'  — WDI/WDO inspection, treatments, bait stations,
 *                               pre-construction, renewals
 *   service_type = 'wildlife' — rodents (rats/mice), wildlife (squirrels, bats,
 *                               raccoons), exclusion & attic restoration
 *
 * Each sub-book gets its own engine so recurring GP margins stay tight, termite
 * WDI's can price like real inspections, and wildlife exclusion (labor-heavy,
 * one-off) can command a different rate.
 *
 * Contents:
 *   - ~90 materials (id prefix P001…)
 *   - 15 categories
 *   - ~24 general tasks, ~13 termite tasks, ~20 wildlife tasks
 *   - 3 engines seeded with the 10-item overhead template (monthly=0)
 *
 * Also:
 *   - ALTER TABLE company_settings ADD COLUMN service_pest_control BOOLEAN.
 *   - Flip service_pest_control = true so cards / tabs light up.
 *
 * Idempotent: clears existing pest_control rows before insert.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/009_pest_control_starter.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ── Materials (P001…) ──────────────────────────────────────────────────────
const MATS = {
  // ── General-pest chemistry ─
  P001: { d: 'Bifenthrin 7.9% Concentrate 1qt (Talstar)',    u: 'EA', c: 42.00, cat: 'Insecticides' },
  P002: { d: 'Fipronil 0.06% Termite/Ant Bait 8oz',          u: 'EA', c: 22.00, cat: 'Insecticides' },
  P003: { d: 'Deltamethrin Dust 1lb (D-Fense)',              u: 'EA', c: 18.00, cat: 'Insecticides' },
  P004: { d: 'Boric Acid Powder 1lb',                        u: 'EA', c: 8.00,  cat: 'Insecticides' },
  P005: { d: 'Diatomaceous Earth 4lb',                       u: 'EA', c: 14.00, cat: 'Insecticides' },
  P006: { d: 'Roach Gel Bait Syringe 30g (Advion)',          u: 'EA', c: 32.00, cat: 'Insecticides' },
  P007: { d: 'Ant Gel Bait Syringe 30g',                     u: 'EA', c: 28.00, cat: 'Insecticides' },
  P008: { d: 'Aerosol Wasp / Hornet Killer 20oz',            u: 'EA', c: 8.00,  cat: 'Insecticides' },
  P009: { d: 'IGR Concentrate 4oz (Gentrol)',                u: 'EA', c: 48.00, cat: 'Insecticides' },
  P010: { d: 'Cyfluthrin Liquid Perimeter 1gal',             u: 'EA', c: 65.00, cat: 'Insecticides' },
  P011: { d: 'Granular Insecticide 25lb bag',                u: 'EA', c: 48.00, cat: 'Insecticides' },
  P012: { d: 'Silverfish/Firebrat Concentrate 1qt',          u: 'EA', c: 38.00, cat: 'Insecticides' },
  P013: { d: 'Bed Bug Kit — Aerosol + Dust + Encasements',   u: 'KT', c: 145.00, cat: 'Insecticides' },
  P014: { d: 'Mosquito Concentrate 1gal (barrier)',          u: 'EA', c: 55.00, cat: 'Insecticides' },
  P015: { d: 'Mosquito Larvicide Tablets 100-pk',            u: 'PK', c: 32.00, cat: 'Insecticides' },
  P016: { d: 'Flea/Tick Concentrate 1qt (Permethrin)',       u: 'EA', c: 42.00, cat: 'Insecticides' },
  P017: { d: 'Green / Natural Botanical Concentrate 1gal',   u: 'EA', c: 85.00, cat: 'Insecticides' },

  // ── Termite chemistry & bait ─
  P030: { d: 'Termidor SC 78oz (Fipronil termite)',          u: 'EA', c: 385.00, cat: 'Termite' },
  P031: { d: 'Taurus SC 78oz (generic Fipronil)',            u: 'EA', c: 285.00, cat: 'Termite' },
  P032: { d: 'Bora-Care 1gal (borate wood treatment)',       u: 'EA', c: 145.00, cat: 'Termite' },
  P033: { d: 'Termidor Foam 20oz',                           u: 'EA', c: 42.00,  cat: 'Termite' },
  P034: { d: 'Sentricon HD Termite Station',                 u: 'EA', c: 28.00,  cat: 'Termite' },
  P035: { d: 'Sentricon Recruit Bait Cartridge',             u: 'EA', c: 22.00,  cat: 'Termite' },
  P036: { d: 'Advance Termite Bait Station (in-ground)',     u: 'EA', c: 18.00,  cat: 'Termite' },
  P037: { d: 'Termite Monitor / Inspection Blocks (10-pk)',  u: 'PK', c: 14.00,  cat: 'Termite' },
  P038: { d: 'WDIR / WDO Report Form (State-Approved)',      u: 'EA', c: 8.00,   cat: 'Termite' },
  P039: { d: 'Termite Graph / Sketch Software Credit',       u: 'EA', c: 4.00,   cat: 'Termite' },

  // ── Rodent / wildlife control ─
  P060: { d: 'Snap Trap — Wood/Wire Standard',               u: 'EA', c: 1.50,   cat: 'Rodents' },
  P061: { d: 'Snap Trap — Plastic Reusable (T-Rex)',         u: 'EA', c: 4.50,   cat: 'Rodents' },
  P062: { d: 'Glue Board Mouse (10-pk)',                     u: 'PK', c: 14.00,  cat: 'Rodents' },
  P063: { d: 'Glue Board Rat (10-pk)',                       u: 'PK', c: 22.00,  cat: 'Rodents' },
  P064: { d: 'Rodent Bait Station — Locking Tier-1',         u: 'EA', c: 14.00,  cat: 'Rodents' },
  P065: { d: 'Rodent Bait Station — Heavy-Duty Steel',       u: 'EA', c: 42.00,  cat: 'Rodents' },
  P066: { d: 'Bait Block — Bromadiolone 4lb pail',           u: 'EA', c: 45.00,  cat: 'Rodents' },
  P067: { d: 'Bait Block — Difethialone 4lb pail',           u: 'EA', c: 58.00,  cat: 'Rodents' },
  P068: { d: 'Live Trap — Small (mouse/rat)',                u: 'EA', c: 18.00,  cat: 'Rodents' },
  P069: { d: 'Live Trap — Medium (squirrel)',                u: 'EA', c: 42.00,  cat: 'Wildlife' },
  P070: { d: 'Live Trap — Large (raccoon/opossum)',          u: 'EA', c: 68.00,  cat: 'Wildlife' },
  P071: { d: 'One-Way Squirrel Excluder Door',               u: 'EA', c: 22.00,  cat: 'Wildlife' },
  P072: { d: 'Bat Excluder / Check Valve',                   u: 'EA', c: 18.00,  cat: 'Wildlife' },
  P073: { d: 'Chimney Cap — Stainless',                      u: 'EA', c: 145.00, cat: 'Wildlife' },

  // ── Exclusion / physical ─
  P090: { d: 'Copper Mesh 1/8" 100ft roll',                  u: 'RL', c: 85.00,  cat: 'Exclusion' },
  P091: { d: 'Steel Wool Coarse (per pad)',                  u: 'EA', c: 2.50,   cat: 'Exclusion' },
  P092: { d: '1/4" Hardware Cloth 4x25 roll',                u: 'RL', c: 48.00,  cat: 'Exclusion' },
  P093: { d: '1/2" Hardware Cloth 4x25 roll',                u: 'RL', c: 42.00,  cat: 'Exclusion' },
  P094: { d: 'Xcluder Rodent-Proof Fill Fabric (per ft)',    u: 'LF', c: 4.50,   cat: 'Exclusion' },
  P095: { d: 'Expanding Foam Sealant — Great Stuff Pro 24oz', u: 'EA', c: 12.00, cat: 'Exclusion' },
  P096: { d: 'Silicone Caulk — Exterior 10oz',               u: 'EA', c: 6.50,   cat: 'Exclusion' },
  P097: { d: 'Weatherstripping — Door Sweep',                u: 'EA', c: 18.00,  cat: 'Exclusion' },
  P098: { d: 'Vent Cover — Foundation Screen',               u: 'EA', c: 22.00,  cat: 'Exclusion' },
  P099: { d: 'Roof Vent Cover — Galvanized',                 u: 'EA', c: 32.00,  cat: 'Exclusion' },
  P100: { d: 'Ridge Vent Guard 4ft',                         u: 'EA', c: 18.00,  cat: 'Exclusion' },
  P101: { d: 'Aluminum Flashing 12"x10ft',                   u: 'EA', c: 22.00,  cat: 'Exclusion' },
  P102: { d: 'Concrete Patch 20lb',                          u: 'EA', c: 14.00,  cat: 'Exclusion' },

  // ── Attic / sanitation restoration ─
  P120: { d: 'Enzyme Bio Cleaner 1gal (rodent/bat waste)',   u: 'EA', c: 65.00,  cat: 'Sanitation' },
  P121: { d: 'Enzyme Deodorizer 1gal',                       u: 'EA', c: 42.00,  cat: 'Sanitation' },
  P122: { d: 'Attic Insulation Removal — HEPA vac (per day)', u: 'DAY', c: 145.00, cat: 'Sanitation' },
  P123: { d: 'Blown Insulation Replace R-30 (per sqft)',     u: 'SF',  c: 0.75,  cat: 'Sanitation' },
  P124: { d: 'HEPA Vacuum Bag',                              u: 'EA',  c: 22.00, cat: 'Sanitation' },
  P125: { d: 'Biohazard Waste Disposal Bag (5-pk)',          u: 'PK',  c: 18.00, cat: 'Sanitation' },
  P126: { d: 'Contractor Debris Bag 42gal (10-pk)',          u: 'PK',  c: 18.00, cat: 'Sanitation' },

  // ── PPE / equipment consumables ─
  P150: { d: 'Nitrile Gloves 8mil (100-pk)',                 u: 'BX', c: 22.00,  cat: 'PPE' },
  P151: { d: 'N95 Respirator Mask (per unit)',               u: 'EA', c: 3.50,   cat: 'PPE' },
  P152: { d: 'Half-Face P100 Cartridges (pair)',             u: 'PR', c: 18.00,  cat: 'PPE' },
  P153: { d: 'Tyvek Coverall Suit',                          u: 'EA', c: 12.00,  cat: 'PPE' },
  P154: { d: 'Knee Pads (pair)',                             u: 'PR', c: 22.00,  cat: 'PPE' },
  P155: { d: 'B&G Sprayer Rebuild Kit',                      u: 'EA', c: 48.00,  cat: 'Equipment' },
  P156: { d: 'Backpack Sprayer Wand Tip',                    u: 'EA', c: 12.00,  cat: 'Equipment' },
  P157: { d: 'Duster Nozzle / Extension',                    u: 'EA', c: 8.00,   cat: 'Equipment' },
  P158: { d: 'Termite Rod Injector Tip',                     u: 'EA', c: 22.00,  cat: 'Equipment' },
  P159: { d: 'Inspection Flashlight LED',                    u: 'EA', c: 32.00,  cat: 'Equipment' },
  P160: { d: 'Moisture Meter Pin/Pinless',                   u: 'EA', c: 45.00,  cat: 'Equipment' },
  P161: { d: 'Termite Sounding Rod',                         u: 'EA', c: 22.00,  cat: 'Equipment' },
  P162: { d: 'Fogger Solution — ULV 1gal',                   u: 'EA', c: 55.00,  cat: 'Equipment' },
  P163: { d: 'Ladder — Fiberglass 24ft (rental per day)',    u: 'DAY', c: 45.00, cat: 'Equipment' },
};

// ── Categories ─────────────────────────────────────────────────────────────
// subBooks controls which sub-books the category appears under.
const CATEGORIES = [
  // General pest categories
  { id: 'pest_gp_diag',      icon: '🔍',  name: 'Inspection & Diagnosis',  color: '#2E5FA3', desc: 'Home inspection, ID, custom scope', subBooks:['general'] },
  { id: 'pest_gp_indoor',    icon: '🏠',  name: 'Indoor Treatment',         color: '#1F7A8C', desc: 'Kitchens, baths, bedrooms, garages', subBooks:['general'] },
  { id: 'pest_gp_outdoor',   icon: '🌳',  name: 'Perimeter & Outdoor',      color: '#1E6B3C', desc: 'Perimeter spray, yard, mosquito, wasps', subBooks:['general'] },
  { id: 'pest_gp_specialty', icon: '🕷',  name: 'Specialty Pests',          color: '#5B2D8E', desc: 'Bed bugs, fleas, bees/wasps, roaches', subBooks:['general'] },
  { id: 'pest_gp_recur',     icon: '🔁',  name: 'Recurring Plans',          color: '#E8A500', desc: 'Quarterly / monthly / bi-monthly plans', subBooks:['general'] },
  { id: 'pest_gp_comm',      icon: '🏢',  name: 'Commercial',               color: '#8B6914', desc: 'Restaurants, warehouses, offices — HACCP-friendly', subBooks:['general'] },

  // Termite categories
  { id: 'pest_term_insp',    icon: '📋',  name: 'Inspection & Reports',     color: '#2E5FA3', desc: 'WDI / WDO / CL-100 letters, real-estate inspections', subBooks:['termite'] },
  { id: 'pest_term_treat',   icon: '🐜',  name: 'Treatments',               color: '#C55A11', desc: 'Liquid, foam, spot & full treatments', subBooks:['termite'] },
  { id: 'pest_term_bait',    icon: '📍',  name: 'Bait Stations',            color: '#7A4B1A', desc: 'Sentricon / Advance install + annual monitoring', subBooks:['termite'] },
  { id: 'pest_term_pre',     icon: '🏗',   name: 'Pre-Construction',         color: '#5B2D8E', desc: 'Pre-treats for new-construction slabs', subBooks:['termite'] },
  { id: 'pest_term_warr',    icon: '🛡',   name: 'Warranty & Renewal',       color: '#E8A500', desc: 'Annual bond renewals, damage warranties', subBooks:['termite'] },

  // Wildlife categories
  { id: 'pest_rw_diag',      icon: '🔍',  name: 'Inspection & Diagnosis',   color: '#2E5FA3', desc: 'Roof, attic, crawl, and yard survey', subBooks:['wildlife'] },
  { id: 'pest_rw_rodent',    icon: '🐭',  name: 'Rodent Control',           color: '#7A4B1A', desc: 'Mice, rats, voles — trapping and bait', subBooks:['wildlife'] },
  { id: 'pest_rw_wildlife',  icon: '🦝',  name: 'Wildlife Removal',         color: '#5B2D8E', desc: 'Squirrels, bats, raccoons, opossums, birds', subBooks:['wildlife'] },
  { id: 'pest_rw_excl',      icon: '🔧',  name: 'Exclusion & Sealing',      color: '#C55A11', desc: 'Physical exclusion to prevent re-entry', subBooks:['wildlife'] },
  { id: 'pest_rw_clean',     icon: '🧽',  name: 'Sanitation & Restoration', color: '#1E6B3C', desc: 'Waste cleanup, insulation replace, deodorize', subBooks:['wildlife'] },
  { id: 'pest_rw_recur',     icon: '🔁',  name: 'Monitoring Plans',         color: '#E8A500', desc: 'Ongoing monitoring after treatment', subBooks:['wildlife'] },
];

// ── GENERAL PEST tasks ─────────────────────────────────────────────────────
const GENERAL_TASKS = [
  // Inspection / diag
  { cat:'pest_gp_diag', tag:'Inspection', n:'Home Pest Inspection & Custom Scope', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Whole-home inspection: identify pest activity, entry points, harborage, and moisture. Written scope with treatment plan and pricing. Applied toward first treatment on the same visit.',
    mats:[['P159',0.05]] },
  { cat:'pest_gp_diag', tag:'Inspection', n:'Real-Estate Pest Letter (buyer / lender)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'General pest inspection with lender-required letter (no WDI — see termite sub-book). Photo report of any evidence and recommended treatments.',
    mats:[] },
  { cat:'pest_gp_diag', tag:'Inspection', n:'Emergency / Same-Day Callout', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Same-day response for active infestations (swarms, roaches in kitchen, wasps blocking entry). Higher billable rate than a scheduled visit.',
    mats:[] },

  // Indoor
  { cat:'pest_gp_indoor', tag:'Indoor', n:'Initial Interior Treatment — Standard Home', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'First-time interior treatment (up to 2500 sqft): crack-and-crevice spray, gel bait placements in kitchens and baths, dust application in wall voids, sweep for spider webs. Establishes the baseline.',
    mats:[['P001',0.15],['P006',0.4],['P007',0.4],['P003',0.15]] },
  { cat:'pest_gp_indoor', tag:'Indoor', n:'Kitchen Roach Program — Heavy Infestation', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Heavy German roach knock-down: IGR, multiple gel bait placements, void dust, and homeowner sanitation coaching. Includes follow-up visit at 14 days.',
    mats:[['P006',1],['P009',0.25],['P003',0.2]] },
  { cat:'pest_gp_indoor', tag:'Indoor', n:'Ant Colony Eradication (indoor)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Non-repellent perimeter spray + gel bait for trailing ant colonies. Targets sugar/protein ants including odorous house ants.',
    mats:[['P007',0.5],['P001',0.15]] },
  { cat:'pest_gp_indoor', tag:'Indoor', n:'Silverfish / Firebrat Treatment', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Void dust + IGR treatment for silverfish activity. Best applied with attic/crawlspace access.',
    mats:[['P012',0.2],['P003',0.1],['P009',0.15]] },
  { cat:'pest_gp_indoor', tag:'Indoor', n:'Garage / Storage Treatment', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Spider, silverfish, and general-pest treatment in garages and storage rooms. Includes web sweep.',
    mats:[['P001',0.1],['P003',0.1]] },

  // Outdoor / perimeter / specialty outdoor
  { cat:'pest_gp_outdoor', tag:'Perimeter', n:'Perimeter Barrier Treatment', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Perimeter liquid barrier + granular around the foundation (3-ft outside, 1-ft inside) plus soffit and eave sweep. Standard component of most recurring plans.',
    mats:[['P010',0.25],['P011',0.15]] },
  { cat:'pest_gp_outdoor', tag:'Mosquito', n:'Mosquito Barrier Treatment', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Foliage and shaded-area mosquito treatment with residual barrier (~30 days). Includes larvicide in standing-water sources.',
    mats:[['P014',0.25],['P015',0.1]] },
  { cat:'pest_gp_outdoor', tag:'Wasp/Hornet', n:'Wasp / Hornet / Yellow Jacket Nest Removal', hrs:1, time:'1 hr', diff:'Moderate',
    desc:'Locate and treat active nest, remove physically when safe. Includes 30-day callback guarantee for the same nest.',
    mats:[['P008',1],['P003',0.1]] },
  { cat:'pest_gp_outdoor', tag:'Wasp/Hornet', n:'Ground Wasp / Yellow Jacket Colony', hrs:1.5, time:'1.5 hr', diff:'Hard',
    desc:'In-ground nest treatment with dust and follow-up spray. Includes safety perimeter and PPE.',
    mats:[['P003',0.25],['P008',1]] },
  { cat:'pest_gp_outdoor', tag:'Flea/Tick', n:'Yard Flea / Tick Treatment', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Yard-wide flea and tick treatment with residual concentrate. Coordinate with indoor treatment for pets.',
    mats:[['P016',0.5],['P011',0.2]] },

  // Specialty
  { cat:'pest_gp_specialty', tag:'Bed Bugs', n:'Bed Bug Treatment — 1 Bedroom', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Full treatment of a single bedroom: aerosol + dust + mattress/box encasements. Includes follow-up visit at day 14 and day 28.',
    mats:[['P013',0.8]] },
  { cat:'pest_gp_specialty', tag:'Bed Bugs', n:'Bed Bug Treatment — Whole Home (up to 4BR)', hrs:8, time:'8 hr', diff:'Complex',
    desc:'Whole-home bed bug treatment for up to 4 bedrooms. Includes prep instructions, treatment, encasements, and two follow-ups.',
    mats:[['P013',3]] },
  { cat:'pest_gp_specialty', tag:'Bed Bugs', n:'Bed Bug Heat Treatment (1 room)', hrs:6, time:'6 hr', diff:'Complex',
    desc:'Heat treatment of a single room using portable heaters to 135°F for 4+ hours. Chemical-free option.',
    mats:[] },
  { cat:'pest_gp_specialty', tag:'Fleas', n:'Indoor Flea Treatment (whole home)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Whole-home flea treatment with IGR-containing residual. Includes owner prep instructions.',
    mats:[['P016',0.5],['P009',0.2]] },
  { cat:'pest_gp_specialty', tag:'Bees', n:'Honey Bee Removal (live, referral)', hrs:0.5, time:'referral', diff:'Easy',
    desc:'Honey bee colonies referred to a partnering beekeeper for humane relocation. Includes coordination.',
    mats:[] },

  // Recurring
  { cat:'pest_gp_recur', tag:'Plan', n:'Recurring Plan — Quarterly Service (single visit)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Per-visit price for a quarterly recurring pest plan. Includes perimeter barrier, key indoor touch-points, and monitoring. Priced per single visit; typically billed as annual plan.',
    mats:[['P010',0.2],['P011',0.1],['P007',0.15]] },
  { cat:'pest_gp_recur', tag:'Plan', n:'Recurring Plan — Bi-Monthly Service (single visit)', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Per-visit price for bi-monthly recurring pest service. Lighter touch, more frequent.',
    mats:[['P010',0.15],['P011',0.08]] },
  { cat:'pest_gp_recur', tag:'Plan', n:'Recurring Plan — Monthly Service (single visit)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Monthly recurring visit — best for chronic pressure areas (coastal, wooded, restaurant-adjacent).',
    mats:[['P010',0.1]] },
  { cat:'pest_gp_recur', tag:'Plan', n:'Premium Home Program — Includes Termite Monitoring', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Premium home protection plan: quarterly pest + annual termite inspection + mosquito touch-ups May-Oct. Priced per visit.',
    mats:[['P010',0.2],['P014',0.1],['P037',0.1]] },

  // Commercial
  { cat:'pest_gp_comm', tag:'Commercial', n:'Restaurant Pest Program — Monthly Visit', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'HACCP-compliant monthly service for restaurants and food service. Includes bait station monitoring, glue-board changes, log book, and pest activity report.',
    mats:[['P006',0.5],['P007',0.5],['P062',0.3],['P064',0.2]] },
  { cat:'pest_gp_comm', tag:'Commercial', n:'Warehouse / Distribution — Monthly', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Perimeter bait station monitoring + interior fly / rodent surveillance for warehouse and distribution centers.',
    mats:[['P065',0.2],['P066',0.15]] },
];

// ── TERMITE tasks ──────────────────────────────────────────────────────────
const TERMITE_TASKS = [
  // Inspection
  { cat:'pest_term_insp', tag:'WDI', n:'WDI / WDO Inspection — Standard Home', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Wood-destroying insect / organism inspection with state-approved report letter (for real estate closing or refinance). Includes crawl, attic, and perimeter with graph and photos.',
    mats:[['P038',1],['P039',1],['P161',0.05]] },
  { cat:'pest_term_insp', tag:'WDI', n:'CL-100 / State-Specific Wood Letter', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'State-specific wood infestation letter (CL-100 for SC / VA, etc.) with certified moisture and condition report.',
    mats:[['P038',1],['P160',0.05]] },
  { cat:'pest_term_insp', tag:'WDI', n:'Annual Termite Inspection (bond visit)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Annual bond inspection visit — required to maintain warranty on active accounts. Includes bait station check.',
    mats:[['P038',1]] },

  // Liquid treatments
  { cat:'pest_term_treat', tag:'Liquid Treat', n:'Liquid Perimeter Treatment (Termidor) — 100 LF', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Full-label liquid Termidor perimeter treatment (trench and rod) around 100 LF of foundation. Includes concrete drilling for slab, patching, and full labels-to-owner package.',
    mats:[['P030',0.15],['P102',0.5],['P158',0.1]] },
  { cat:'pest_term_treat', tag:'Liquid Treat', n:'Liquid Perimeter Treatment (Taurus) — 100 LF', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Generic Fipronil (Taurus SC) full-label treatment around 100 LF. Cost-effective vs. Termidor with equivalent chemistry.',
    mats:[['P031',0.15],['P102',0.5],['P158',0.1]] },
  { cat:'pest_term_treat', tag:'Liquid Treat', n:'Spot Treatment — Localized Infestation', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Targeted spot treatment of localized termite activity (single mud tube, damaged sill plate). Includes foam void injection and 90-day retreatment.',
    mats:[['P033',0.5],['P030',0.05]] },
  { cat:'pest_term_treat', tag:'Wood', n:'Bora-Care Wood Treatment — New Construction (per sqft)', hrs:0.02, time:'per sqft', diff:'Easy',
    desc:'Borate wood treatment applied to exposed framing in new construction. Priced per sqft of framing surface.',
    mats:[['P032',0.01]] },

  // Bait stations
  { cat:'pest_term_bait', tag:'Sentricon', n:'Sentricon Bait Station System Install (up to 12 stations)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install Sentricon HD bait stations around home perimeter (up to 12 stations). Includes GPS mapping, initial inspection, and welcome kit.',
    mats:[['P034',12],['P035',6]] },
  { cat:'pest_term_bait', tag:'Sentricon', n:'Sentricon Annual Monitoring & Bait Refresh', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Annual monitoring visit with bait cartridge refresh as required. Includes report.',
    mats:[['P035',3]] },
  { cat:'pest_term_bait', tag:'Advance', n:'Advance Bait Station Install (up to 12 stations)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install Advance in-ground termite bait stations around perimeter. Includes monitor blocks and mapping.',
    mats:[['P036',12],['P037',1]] },

  // Pre-construction
  { cat:'pest_term_pre', tag:'Pre-Treat', n:'Pre-Construction Termite Pre-Treat — Slab (per sqft)', hrs:0.005, time:'per sqft', diff:'Moderate',
    desc:'Full-label pre-construction liquid pre-treat applied to soil under slab prior to concrete pour. Priced per sqft of slab area.',
    mats:[['P031',0.001]] },
  { cat:'pest_term_pre', tag:'Pre-Treat', n:'Pre-Construction Bait System Install', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'In-ground bait stations installed before backfill on new construction. Locks in a lower long-term monitoring cost.',
    mats:[['P034',12]] },

  // Warranty / renewal
  { cat:'pest_term_warr', tag:'Bond', n:'Annual Termite Bond Renewal (Retreatment Warranty)', hrs:0.5, time:'admin', diff:'Easy',
    desc:'Annual bond renewal — retreatment warranty. Continues protection without damage coverage.',
    mats:[] },
  { cat:'pest_term_warr', tag:'Bond', n:'Annual Termite Bond Renewal (Damage Warranty)', hrs:0.5, time:'admin', diff:'Easy',
    desc:'Annual bond renewal with damage warranty. Higher-tier plan covering both retreatment and covered damage.',
    mats:[] },
];

// ── WILDLIFE tasks ─────────────────────────────────────────────────────────
const WILDLIFE_TASKS = [
  // Inspection
  { cat:'pest_rw_diag', tag:'Inspection', n:'Wildlife / Rodent Inspection', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Attic, crawl, roof, and exterior inspection for rodents and wildlife activity. Includes photo report of entry points and recommended exclusion + trapping scope.',
    mats:[['P159',0.05]] },
  { cat:'pest_rw_diag', tag:'Inspection', n:'Rodent Assessment & Trapping Scope', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Focused rodent inspection with pack of snap traps and monitoring stations set. Written scope for exclusion & follow-up.',
    mats:[['P061',4]] },

  // Rodents
  { cat:'pest_rw_rodent', tag:'Rodent', n:'Rodent Trap Setup & Baiting (initial)', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Initial setup of snap traps and locking bait stations in attic, crawl, garage, and exterior. Includes 2 follow-up service visits within 30 days.',
    mats:[['P061',8],['P064',6],['P066',0.5]] },
  { cat:'pest_rw_rodent', tag:'Rodent', n:'Follow-Up Trap Service Visit', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Reset traps, remove captures, replenish bait. Included in initial setup — priced separately for standalone visits.',
    mats:[['P066',0.15]] },
  { cat:'pest_rw_rodent', tag:'Rodent', n:'Recurring Rodent Monitoring Visit (monthly)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Monthly bait station monitoring and refresh for ongoing rodent pressure.',
    mats:[['P066',0.2]] },
  { cat:'pest_rw_rodent', tag:'Rodent', n:'Heavy-Duty Commercial Bait Station Install (per 4)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install 4 tamper-resistant heavy-duty bait stations around commercial property. Priced per group of 4.',
    mats:[['P065',4],['P066',0.5]] },

  // Wildlife removal
  { cat:'pest_rw_wildlife', tag:'Squirrel', n:'Squirrel Trapping & Removal (up to 5 captures)', hrs:6, time:'~1 week (multi-visit)', diff:'Hard',
    desc:'Live trapping of squirrels from attic. Includes trap setup, daily monitoring visits (typical 3-5 days), and humane removal. Exclusion sold separately.',
    mats:[['P069',3]] },
  { cat:'pest_rw_wildlife', tag:'Squirrel', n:'Squirrel One-Way Excluder Door Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install one-way excluder door on primary entry point to let squirrels self-evict. Follow-up to verify no more activity.',
    mats:[['P071',1]] },
  { cat:'pest_rw_wildlife', tag:'Raccoon', n:'Raccoon Trapping & Removal', hrs:8, time:'~1 week (multi-visit)', diff:'Hard',
    desc:'Live trap raccoon or raccoon mother with kits. Multi-visit trap monitoring. State relocation rules followed.',
    mats:[['P070',2]] },
  { cat:'pest_rw_wildlife', tag:'Bat', n:'Bat Colony Exclusion (up to 25 bats)', hrs:8, time:'8 hr', diff:'Complex',
    desc:'Bat exclusion using check valves on primary entry points. Best done outside maternity season. Includes cleanup scope separately.',
    mats:[['P072',6]] },
  { cat:'pest_rw_wildlife', tag:'Chimney', n:'Chimney Cap Install (animal exclusion)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install stainless steel chimney cap to prevent bird / squirrel / raccoon entry. Includes ladder setup.',
    mats:[['P073',1],['P163',0.5]] },
  { cat:'pest_rw_wildlife', tag:'Bird', n:'Bird Exclusion — Vent Covers (per 4)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install screen covers over 4 roof/dryer/soffit vents to prevent bird nesting. Includes ladder setup.',
    mats:[['P099',4]] },

  // Exclusion
  { cat:'pest_rw_excl', tag:'Exclusion', n:'Full-Home Rodent Exclusion (standard home)', hrs:8, time:'8 hr', diff:'Hard',
    desc:'Comprehensive rodent exclusion around a typical 2500-sqft home: garage door seals, foundation vent covers, pipe penetrations, gable vents, roof line, and door sweeps. Written 1-year warranty.',
    mats:[['P090',0.5],['P091',20],['P094',30],['P095',6],['P096',10],['P097',3],['P098',6]] },
  { cat:'pest_rw_excl', tag:'Exclusion', n:'Attic Access Exclusion (single access)', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Seal a single attic access point (gable vent, ridge, or dormer gap) with hardware cloth and flashing.',
    mats:[['P092',0.1],['P101',0.5]] },
  { cat:'pest_rw_excl', tag:'Exclusion', n:'Foundation Vent Screen Install (per vent)', hrs:0.4, time:'25 min per vent', diff:'Easy',
    desc:'Install rodent-proof screen over foundation vent. Priced per vent.',
    mats:[['P098',1]] },
  { cat:'pest_rw_excl', tag:'Exclusion', n:'Pipe Penetration Sealing (per penetration)', hrs:0.3, time:'20 min per penetration', diff:'Easy',
    desc:'Seal utility pipe / cable penetrations with copper mesh + expanding foam. Priced per penetration.',
    mats:[['P090',0.02],['P095',0.25]] },

  // Sanitation / attic restoration
  { cat:'pest_rw_clean', tag:'Sanitation', n:'Attic Waste Cleanup — Rodent (per hour)', hrs:1, time:'1 hr', diff:'Hard',
    desc:'HEPA-vac removal of rodent waste and contaminated insulation. Full PPE and biohazard disposal. Priced per hour.',
    mats:[['P122',0.15],['P124',0.3],['P120',0.1],['P125',0.3],['P153',1],['P152',1]] },
  { cat:'pest_rw_clean', tag:'Sanitation', n:'Attic Restoration — Insulation Replace (per sqft)', hrs:0.04, time:'per sqft', diff:'Moderate',
    desc:'Blow in R-30 replacement insulation after attic cleanout. Priced per sqft.',
    mats:[['P123',1]] },
  { cat:'pest_rw_clean', tag:'Sanitation', n:'Deodorization / Enzyme Fog Treatment', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Enzyme fog and hand-treatment of affected areas to eliminate odor after wildlife/rodent activity.',
    mats:[['P121',1],['P162',0.15]] },
  { cat:'pest_rw_clean', tag:'Sanitation', n:'Bat Guano Cleanup (per hour)', hrs:1, time:'1 hr', diff:'Complex',
    desc:'Histoplasmosis-safe bat guano removal with full-face respirator, Tyvek, and HEPA vac. Priced per hour.',
    mats:[['P122',0.15],['P124',0.4],['P152',1.5],['P153',1.5],['P125',0.4]] },

  // Recurring
  { cat:'pest_rw_recur', tag:'Plan', n:'Quarterly Rodent Monitoring Plan (single visit)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Ongoing quarterly bait station monitoring + roof/perimeter check. Priced per visit.',
    mats:[['P066',0.2]] },
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

    // Add company_settings column so front-end toggle is possible.
    console.log('→ ALTER company_settings ADD COLUMN service_pest_control');
    await db.query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS service_pest_control BOOLEAN DEFAULT false`);

    console.log('→ Clearing existing pest_control data');
    await db.query(
      `DELETE FROM pb_task_materials
        WHERE task_id IN (SELECT id FROM pb_tasks WHERE service = 'pest_control')`
    );
    await db.query(`DELETE FROM pb_tasks       WHERE service = 'pest_control'`);
    await db.query(`DELETE FROM pb_materials   WHERE service = 'pest_control'`);
    await db.query(`DELETE FROM pb_categories  WHERE service = 'pest_control'`);
    await db.query(`DELETE FROM pb_engine      WHERE service = 'pest_control'`);

    // Seed 3 engines
    console.log('→ Seeding pest_control engines (general, termite, wildlife)');
    for (const st of ['general', 'termite', 'wildlife']) {
      await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ('pest_control', $1, 28, 0, 0, 0, 22, 8, 3,
                 1600, 7.65, 2.5, 6, 0, 0, 0, 0, 0, 0,
                 1, 1600, 0, $2::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [st, JSON.stringify(DEFAULT_OH)]
      );
    }

    console.log(`→ Inserting ${Object.keys(MATS).length} pest control materials`);
    for (const [id, m] of Object.entries(MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,'pest_control')`,
        [id, m.d, m.u, m.c, m.cat]
      );
    }

    console.log(`→ Inserting pest control categories`);
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      for (const t of c.subBooks) {
        await db.query(
          `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'pest_control',$7)
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
           VALUES ($1,$2,$3,$4,$5,$6,'',$7,'pest_control',$8) RETURNING id`,
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
    const gLinks = await insertBucket(GENERAL_TASKS,  'general',  'general');
    const tLinks = await insertBucket(TERMITE_TASKS,  'termite',  'termite');
    const wLinks = await insertBucket(WILDLIFE_TASKS, 'wildlife', 'wildlife');
    console.log(`  → material links: general=${gLinks}, termite=${tLinks}, wildlife=${wLinks}`);

    console.log('→ Enabling pest_control in company_settings');
    await db.query(`UPDATE company_settings SET service_pest_control = true WHERE id = 'main'`);
    await db.query(`
      INSERT INTO company_settings (id, service_pest_control)
      VALUES ('main', true)
      ON CONFLICT (id) DO UPDATE SET service_pest_control = true
    `);

    await db.query('COMMIT');
    console.log('✓ Migration 009 complete.');

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

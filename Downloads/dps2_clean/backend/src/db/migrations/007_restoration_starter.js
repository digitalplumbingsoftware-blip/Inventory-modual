'use strict';
/**
 * Migration 007: Seed the Restoration pricebook.
 *
 * Restoration is split into THREE sub-books instead of two:
 *   service_type = 'dryout'  — emergency water/moisture mitigation
 *   service_type = 'removal' — demo & content removal (drywall out, floor out, etc)
 *   service_type = 'rebuild' — put it back (drywall in, paint, floor, cabinets, etc)
 *
 * Each sub-book gets its own engine row so you can price mitigation labor
 * (emergency, insurance-billable) differently from removals (dirty work)
 * differently from rebuilds (finish carpentry).
 *
 * Contents:
 *   - 128 materials (id prefix R001…)
 *   - 10 categories: wtr/fire/mold/sewage/storm/bio/comm shared across sub-books,
 *     plus assess (dryout-only) and packout (removal-only)
 *   - ~25 dryout tasks, ~30 removal tasks, ~30 rebuild tasks
 *   - 3 engines seeded with the 10-item overhead template (monthly=0)
 *
 * Idempotent: clears existing restoration rows before insert.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/007_restoration_starter.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ── Materials (R001…) ──────────────────────────────────────────────────────
const MATS = {
  // ─ Drying equipment (daily rental cost — billed per day) ─
  R001: { d: 'LGR Dehumidifier (per day)',            u: 'DAY', c: 65.00,  cat: 'Drying Equipment' },
  R002: { d: 'XL/Desiccant Dehumidifier (per day)',   u: 'DAY', c: 145.00, cat: 'Drying Equipment' },
  R003: { d: 'Air Mover / Blower (per day)',          u: 'DAY', c: 22.00,  cat: 'Drying Equipment' },
  R004: { d: 'Axial Fan (high-volume) per day',       u: 'DAY', c: 35.00,  cat: 'Drying Equipment' },
  R005: { d: 'HEPA Air Scrubber 500 CFM (per day)',   u: 'DAY', c: 85.00,  cat: 'Drying Equipment' },
  R006: { d: 'Injectidry Wall Drying System (per day)', u: 'DAY', c: 95.00, cat: 'Drying Equipment' },
  R007: { d: 'Hardwood Floor Drying Mat System (per day)', u: 'DAY', c: 145.00, cat: 'Drying Equipment' },
  R008: { d: 'Truck-Mount Water Extractor (per hr)',  u: 'HR',  c: 85.00,  cat: 'Drying Equipment' },
  R009: { d: 'Submersible Pump (per day)',            u: 'DAY', c: 55.00,  cat: 'Drying Equipment' },
  R010: { d: 'Thermal Imaging Camera (per day)',      u: 'DAY', c: 45.00,  cat: 'Drying Equipment' },
  R011: { d: 'Moisture Meter Pin/Pinless (per day)',  u: 'DAY', c: 15.00,  cat: 'Drying Equipment' },
  R012: { d: 'Hygrometer Datalogger (per day)',       u: 'DAY', c: 18.00,  cat: 'Drying Equipment' },
  R013: { d: 'Air Scrubber Prefilter (per unit)',     u: 'EA',  c: 8.00,   cat: 'Drying Equipment' },
  R014: { d: 'HEPA Filter for Air Scrubber',          u: 'EA',  c: 65.00,  cat: 'Drying Equipment' },
  R015: { d: 'Cavity Drying Injector Nozzle Kit',     u: 'EA',  c: 45.00,  cat: 'Drying Equipment' },

  // ─ Chemicals / cleaners ─
  R020: { d: 'Antimicrobial Concentrate 1gal (Benefect / equiv)', u: 'EA', c: 68.00, cat: 'Chemicals' },
  R021: { d: 'Antimicrobial RTU Spray 1gal',          u: 'EA',  c: 28.00, cat: 'Chemicals' },
  R022: { d: 'Sporicidal Disinfectant 1gal',          u: 'EA',  c: 85.00, cat: 'Chemicals' },
  R023: { d: 'Deodorizer Concentrate (smoke) 1gal',   u: 'EA',  c: 55.00, cat: 'Chemicals' },
  R024: { d: 'Deodorizer Time-Release Bag',           u: 'EA',  c: 18.00, cat: 'Chemicals' },
  R025: { d: 'Ozone Generator (per day)',             u: 'DAY', c: 75.00, cat: 'Chemicals' },
  R026: { d: 'Thermal Fogger Solution 1gal',          u: 'EA',  c: 48.00, cat: 'Chemicals' },
  R027: { d: 'Enzyme Cleaner (biohazard) 1gal',       u: 'EA',  c: 65.00, cat: 'Chemicals' },
  R028: { d: 'Mold Stain Remover 1gal',               u: 'EA',  c: 42.00, cat: 'Chemicals' },
  R029: { d: 'Content Cleaning Solution 1gal',        u: 'EA',  c: 22.00, cat: 'Chemicals' },
  R030: { d: 'Shampoo — Carpet 1gal',                 u: 'EA',  c: 28.00, cat: 'Chemicals' },
  R031: { d: 'Rinse / Neutralizer 1gal',              u: 'EA',  c: 18.00, cat: 'Chemicals' },

  // ─ Containment / PPE ─
  R040: { d: '6-mil Poly Sheeting 20×100 ft roll',    u: 'RL',  c: 85.00, cat: 'Containment' },
  R041: { d: 'Zip-Wall Containment Pole (per day)',   u: 'DAY', c: 8.00,  cat: 'Containment' },
  R042: { d: 'Zipper Access Door (single-use)',       u: 'EA',  c: 12.00, cat: 'Containment' },
  R043: { d: 'Duct Tape 2" (case of 24)',             u: 'CS',  c: 145.00, cat: 'Containment' },
  R044: { d: 'Painter\'s Tape 2" (per roll)',         u: 'EA',  c: 6.00,  cat: 'Containment' },
  R045: { d: 'Ram Board Floor Protection (per sqft)', u: 'SF',  c: 0.35, cat: 'Containment' },
  R046: { d: 'Corner Guard / Door Jamb Protection',   u: 'EA',  c: 4.00,  cat: 'Containment' },
  R047: { d: 'Tyvek Coverall Suit (per suit)',        u: 'EA',  c: 12.00, cat: 'PPE' },
  R048: { d: 'N95 Respirator Mask (per unit)',        u: 'EA',  c: 3.50,  cat: 'PPE' },
  R049: { d: 'Half-Face P100 Respirator Cartridge (pair)', u: 'PR', c: 18.00, cat: 'PPE' },
  R050: { d: 'Nitrile Gloves 8mil (100-pk)',          u: 'BX',  c: 22.00, cat: 'PPE' },
  R051: { d: 'Rubber Boots — Waders (bio)',           u: 'EA',  c: 45.00, cat: 'PPE' },
  R052: { d: 'Bio Waste Disposal Bag (10-pk)',        u: 'PK',  c: 22.00, cat: 'PPE' },

  // ─ Debris / hauling ─
  R060: { d: 'Debris Bag — Contractor 42gal (10-pk)', u: 'PK',  c: 18.00, cat: 'Debris' },
  R061: { d: '15-yd Dumpster (weekly rental + haul)', u: 'EA',  c: 425.00, cat: 'Debris' },
  R062: { d: '20-yd Dumpster (weekly rental + haul)', u: 'EA',  c: 525.00, cat: 'Debris' },
  R063: { d: '30-yd Dumpster (weekly rental + haul)', u: 'EA',  c: 675.00, cat: 'Debris' },
  R064: { d: 'Bagster (drop-off style, per unit)',    u: 'EA',  c: 185.00, cat: 'Debris' },
  R065: { d: 'Biohazard Sharps Container',            u: 'EA',  c: 22.00, cat: 'Debris' },
  R066: { d: 'Category-3 Water Disposal (per gal)',   u: 'GA',  c: 0.85,  cat: 'Debris' },

  // ─ Drywall / paint / trim ─
  R080: { d: '1/2" Drywall 4x8 sheet',                u: 'EA',  c: 12.50, cat: 'Drywall' },
  R081: { d: '5/8" Drywall 4x8 (fire-rated) sheet',   u: 'EA',  c: 15.50, cat: 'Drywall' },
  R082: { d: 'Moisture-Resistant Drywall 4x8',        u: 'EA',  c: 18.00, cat: 'Drywall' },
  R083: { d: 'Joint Compound 5-gal All-Purpose',      u: 'EA',  c: 22.00, cat: 'Drywall' },
  R084: { d: 'Paper Joint Tape 250ft',                u: 'EA',  c: 5.00,  cat: 'Drywall' },
  R085: { d: 'Mesh Joint Tape 300ft',                 u: 'EA',  c: 8.00,  cat: 'Drywall' },
  R086: { d: 'Drywall Screws 1-5/8" (5lb box)',       u: 'BX',  c: 22.00, cat: 'Drywall' },
  R087: { d: 'Corner Bead Metal 10ft',                u: 'EA',  c: 4.50,  cat: 'Drywall' },
  R088: { d: 'Texture Spray Can — Orange Peel',       u: 'EA',  c: 14.00, cat: 'Drywall' },
  R089: { d: 'Texture Spray Can — Knockdown',         u: 'EA',  c: 15.00, cat: 'Drywall' },
  R090: { d: 'Primer / Sealer 5-gal (Kilz or equiv)', u: 'EA',  c: 85.00, cat: 'Paint' },
  R091: { d: 'Primer Odor/Smoke-Blocking 1gal',       u: 'EA',  c: 45.00, cat: 'Paint' },
  R092: { d: 'Latex Interior Paint 5-gal (contractor)', u: 'EA', c: 145.00, cat: 'Paint' },
  R093: { d: 'Latex Interior Paint 1gal (accent)',    u: 'EA',  c: 42.00, cat: 'Paint' },
  R094: { d: 'Semi-Gloss Trim/Door Paint 1gal',       u: 'EA',  c: 48.00, cat: 'Paint' },
  R095: { d: 'Ceiling Paint 5-gal (flat)',            u: 'EA',  c: 95.00, cat: 'Paint' },
  R096: { d: 'Paint Rollers/Covers (10-pk)',          u: 'PK',  c: 22.00, cat: 'Paint' },
  R097: { d: 'Drop Cloths Canvas 9x12',               u: 'EA',  c: 18.00, cat: 'Paint' },

  // ─ Trim / doors ─
  R100: { d: 'MDF Baseboard 3-1/4" (per LF)',         u: 'LF',  c: 1.20, cat: 'Trim' },
  R101: { d: 'MDF Baseboard 5-1/4" (per LF)',         u: 'LF',  c: 1.80, cat: 'Trim' },
  R102: { d: 'Oak Baseboard 4" stain-grade (per LF)', u: 'LF',  c: 3.50, cat: 'Trim' },
  R103: { d: 'Casing Trim 2-1/4" (per LF)',           u: 'LF',  c: 1.10, cat: 'Trim' },
  R104: { d: 'Quarter-Round 3/4" (per LF)',           u: 'LF',  c: 0.65, cat: 'Trim' },
  R105: { d: 'Crown Molding 3-1/4" (per LF)',         u: 'LF',  c: 2.20, cat: 'Trim' },
  R106: { d: 'Interior Door — Hollow Core 30" prehung', u: 'EA', c: 85.00, cat: 'Doors' },
  R107: { d: 'Interior Door — Solid Core 30" prehung', u: 'EA', c: 165.00, cat: 'Doors' },
  R108: { d: 'Bifold Closet Door 30"',                u: 'EA',  c: 95.00, cat: 'Doors' },
  R109: { d: 'Door Hardware Set (knob, hinges, strike)', u: 'EA', c: 32.00, cat: 'Doors' },

  // ─ Flooring ─
  R120: { d: 'Carpet — Standard Cut Pile (per sqft)', u: 'SF',  c: 2.20, cat: 'Flooring' },
  R121: { d: 'Carpet Pad 8lb (per sqft)',             u: 'SF',  c: 0.45, cat: 'Flooring' },
  R122: { d: 'LVT Plank 5mm (per sqft)',              u: 'SF',  c: 3.50, cat: 'Flooring' },
  R123: { d: 'LVT Plank 7mm rigid-core (per sqft)',   u: 'SF',  c: 4.80, cat: 'Flooring' },
  R124: { d: 'Engineered Hardwood 3/8" (per sqft)',   u: 'SF',  c: 5.85, cat: 'Flooring' },
  R125: { d: 'Solid Oak Hardwood 3/4" (per sqft)',    u: 'SF',  c: 6.85, cat: 'Flooring' },
  R126: { d: 'Ceramic Tile 12x24 (per sqft)',         u: 'SF',  c: 3.20, cat: 'Flooring' },
  R127: { d: 'Porcelain Tile 12x24 (per sqft)',       u: 'SF',  c: 4.50, cat: 'Flooring' },
  R128: { d: 'Tile Setting Mortar 50lb bag',          u: 'EA',  c: 18.00, cat: 'Flooring' },
  R129: { d: 'Grout Sanded 25lb bag',                 u: 'EA',  c: 18.00, cat: 'Flooring' },
  R130: { d: 'Underlayment Foam 100 sqft roll',       u: 'EA',  c: 28.00, cat: 'Flooring' },
  R131: { d: 'Underlayment Cement Board 3x5 sheet',   u: 'EA',  c: 15.00, cat: 'Flooring' },
  R132: { d: 'Transition Strip / T-Molding (per LF)', u: 'LF',  c: 4.50, cat: 'Flooring' },

  // ─ Framing / sheathing / insulation ─
  R140: { d: '2x4x8 SPF Stud',                        u: 'EA',  c: 4.20, cat: 'Framing' },
  R141: { d: '2x4x10 SPF Stud',                       u: 'EA',  c: 5.80, cat: 'Framing' },
  R142: { d: '2x6x8 SPF Stud',                        u: 'EA',  c: 7.20, cat: 'Framing' },
  R143: { d: '2x10x12 SPF Joist',                     u: 'EA',  c: 22.00, cat: 'Framing' },
  R144: { d: '7/16" OSB Sheathing 4x8',               u: 'EA',  c: 24.00, cat: 'Framing' },
  R145: { d: '5/8" Plywood Subfloor T&G 4x8',         u: 'EA',  c: 42.00, cat: 'Framing' },
  R146: { d: '3/4" Plywood Subfloor T&G 4x8',         u: 'EA',  c: 55.00, cat: 'Framing' },
  R147: { d: 'Structural Screws #10 x 3" (5lb)',      u: 'BX',  c: 32.00, cat: 'Framing' },
  R148: { d: 'Framing Nails 16d (5lb)',               u: 'BX',  c: 18.00, cat: 'Framing' },
  R149: { d: 'R-13 Batt Insulation (per sqft)',       u: 'SF',  c: 0.65, cat: 'Insulation' },
  R150: { d: 'R-19 Batt Insulation (per sqft)',       u: 'SF',  c: 0.85, cat: 'Insulation' },
  R151: { d: 'R-30 Batt Insulation (per sqft)',       u: 'SF',  c: 1.20, cat: 'Insulation' },
  R152: { d: 'Blown-in Cellulose (per sqft coverage)', u: 'SF', c: 0.55, cat: 'Insulation' },
  R153: { d: 'Vapor Barrier Poly 6-mil 100sqft roll', u: 'RL',  c: 42.00, cat: 'Insulation' },

  // ─ Cabinets / vanities / countertops (rebuild-grade) ─
  R170: { d: 'Base Cabinet 36" (rebuild-grade white shaker)', u: 'EA', c: 185.00, cat: 'Cabinets' },
  R171: { d: 'Wall Cabinet 30"x30" (rebuild-grade)',  u: 'EA', c: 145.00, cat: 'Cabinets' },
  R172: { d: 'Kitchen Cabinet Pkg — 10x10 basic',     u: 'EA', c: 1850.00, cat: 'Cabinets' },
  R173: { d: 'Bath Vanity 30" w/ top (rebuild)',      u: 'EA', c: 285.00, cat: 'Cabinets' },
  R174: { d: 'Bath Vanity 36" w/ top',                u: 'EA', c: 385.00, cat: 'Cabinets' },
  R175: { d: 'Laminate Countertop 25x8ft (per LF)',   u: 'LF', c: 22.00, cat: 'Countertops' },
  R176: { d: 'Quartz Countertop (per sqft, install)', u: 'SF', c: 65.00, cat: 'Countertops' },

  // ─ Bath rebuild fixtures ─
  R190: { d: 'Toilet — Standard White 2pc',           u: 'EA', c: 145.00, cat: 'Bath Fixtures' },
  R191: { d: 'Tub — Standard Alcove 60" (steel)',     u: 'EA', c: 285.00, cat: 'Bath Fixtures' },
  R192: { d: 'Tub Surround 3pc White',                u: 'EA', c: 185.00, cat: 'Bath Fixtures' },
  R193: { d: 'Shower Door 60" sliding',               u: 'EA', c: 285.00, cat: 'Bath Fixtures' },

  // ─ Misc consumables ─
  R210: { d: 'Sandpaper Asst 5-pk (drywall)',         u: 'PK',  c: 12.00, cat: 'Consumables' },
  R211: { d: 'Caulk — Paintable Latex 10oz',          u: 'EA',  c: 4.50,  cat: 'Consumables' },
  R212: { d: 'Silicone — Kitchen/Bath 10oz',          u: 'EA',  c: 6.00,  cat: 'Consumables' },
  R213: { d: 'Wood Glue 16oz',                        u: 'EA',  c: 8.00,  cat: 'Consumables' },
  R214: { d: 'Wood Filler Interior 16oz',             u: 'EA',  c: 12.00, cat: 'Consumables' },
  R215: { d: 'Content Storage Box (banker style)',    u: 'EA',  c: 4.50,  cat: 'Consumables' },
  R216: { d: 'Furniture Pad / Blanket',               u: 'EA',  c: 12.00, cat: 'Consumables' },
  R217: { d: 'Shrink Wrap 20" roll',                  u: 'EA',  c: 22.00, cat: 'Consumables' },
};

// ── Categories ─────────────────────────────────────────────────────────────
// All shared across dryout/removal/rebuild unless serviceOnly is set.
const CATEGORIES = [
  { id: 'resto_assess', icon: '🔍', name: 'Assessment & Inspection', color: '#2E5FA3', desc: 'Initial loss inspection, moisture mapping, scope of work', serviceOnly: 'dryout' },
  { id: 'resto_wtr',    icon: '💧', name: 'Water Damage',            color: '#2E5FA3', desc: 'Category 1/2/3 water losses' },
  { id: 'resto_fire',   icon: '🔥', name: 'Fire & Smoke',            color: '#C55A11', desc: 'Fire damage, smoke, soot, odor' },
  { id: 'resto_mold',   icon: '🦠', name: 'Mold Remediation',        color: '#1E6B3C', desc: 'Mold containment, removal, HEPA cleaning' },
  { id: 'resto_sewage', icon: '⚠️', name: 'Sewage / Biohazard',      color: '#7A4B1A', desc: 'Category 3 water, sewage, biohazard cleanup' },
  { id: 'resto_storm',  icon: '🌪', name: 'Storm Damage',            color: '#4A4A6A', desc: 'Wind, hail, fallen tree, flooding' },
  { id: 'resto_packout', icon: '📦', name: 'Content Pack-Out',       color: '#8B6914', desc: 'Content inventory, pack-out, storage, cleaning', serviceOnly: 'removal' },
  { id: 'resto_struct', icon: '🏗',  name: 'Structural',              color: '#7A4B1A', desc: 'Framing, subfloor, sheathing repair' },
  { id: 'resto_finish', icon: '🎨', name: 'Finishes',                color: '#5B2D8E', desc: 'Drywall, paint, flooring, trim, fixtures' },
  { id: 'resto_comm',   icon: '🏢', name: 'Commercial',              color: '#1F7A8C', desc: 'Multi-family, office, retail loss work' },
];

// ── DRYOUT tasks (~25) ─────────────────────────────────────────────────────
const DRYOUT_TASKS = [
  // Assessment
  { cat:'resto_assess', tag:'Assessment', n:'Initial Loss Inspection & Moisture Mapping', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'On-site loss inspection: photograph damage, moisture-map affected materials with pin/pinless meters and thermal imaging, produce written scope of work and dry standard. Insurance-billable.',
    mats:[['R010',0.25],['R011',0.25]] },
  { cat:'resto_assess', tag:'Assessment', n:'Xactimate Estimate Preparation', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Prepare full Xactimate estimate for the insurance carrier. Includes line-item pricing, sketches, supplement handling and follow-up. Billable admin task.',
    mats:[] },
  { cat:'resto_assess', tag:'Assessment', n:'After-Hours Emergency Response', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Emergency dispatch and arrival within 60 minutes for a fresh water loss. Includes rapid stop-the-bleed extraction and containment. Higher billable rate after 5pm and weekends.',
    mats:[] },
  { cat:'resto_assess', tag:'Assessment', n:'Daily Moisture Monitor Visit', hrs:0.75, time:'45 min', diff:'Easy',
    desc:'Daily moisture readings on all affected materials during the drying period. Meter data logged with photos. Required by IICRC S500 for insurance-billable drying documentation.',
    mats:[['R011',0.15]] },

  // Water damage — Category 1
  { cat:'resto_wtr', tag:'Cat 1 Water', n:'Water Extraction — up to 500 sqft (Cat 1)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Extract clean-water loss on carpet, hard surfaces, and cavities up to 500 sqft. Includes portable extractor, wand time, and moisture meter verification.',
    mats:[['R008',3],['R011',0.2]] },
  { cat:'resto_wtr', tag:'Cat 1 Water', n:'Standard Dryout Setup — Small Room', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Air mover + LGR dehumidifier setup for a single small room (up to 200 sqft affected). Includes daily monitoring for typical 3-day dry cycle.',
    mats:[['R003',3],['R001',3],['R011',0.15]] },
  { cat:'resto_wtr', tag:'Cat 1 Water', n:'Standard Dryout Setup — Medium Loss', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Complete drying setup for a mid-size loss (400-800 sqft affected). Equipment count based on IICRC S500 dehu capacity + air mover per LF of affected wall.',
    mats:[['R003',12],['R001',6],['R005',3],['R011',0.3]] },
  { cat:'resto_wtr', tag:'Cat 1 Water', n:'Whole-House Dryout Setup', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Full dryout setup for a whole-home loss (1000+ sqft affected). Multi-day drying with LGR + desiccant units, negative-air containment, and daily readings.',
    mats:[['R003',24],['R001',12],['R002',5],['R005',6],['R011',0.5]] },

  // Cat 2 / Cat 3 water
  { cat:'resto_wtr', tag:'Cat 2 Water', n:'Category 2 Water Extraction (up to 500 sqft)', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Grey-water extraction (dishwasher / appliance overflow / washer). Includes disinfectant treatment of affected materials and containment.',
    mats:[['R008',4],['R021',1],['R047',2],['R048',3]] },
  { cat:'resto_sewage', tag:'Cat 3 Water', n:'Category 3 Water Extraction (up to 300 sqft)', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Black-water/sewage extraction with full PPE, containment, and biocide treatment. Water disposal to sanitary sewer or hauled off-site depending on volume.',
    mats:[['R008',5],['R022',1],['R027',1],['R047',3],['R049',2],['R050',2],['R040',0.5]] },

  // Cavity / specialty drying
  { cat:'resto_wtr', tag:'Cavity Drying', n:'Wall Cavity Drying — Injectidry Setup', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Injectidry wall drying setup to save drywall without demo. Includes drilling low-profile injection holes, running system for typical 3-day cycle, patching holes when complete.',
    mats:[['R006',3],['R015',1],['R011',0.15]] },
  { cat:'resto_wtr', tag:'Cavity Drying', n:'Hardwood Floor Drying Mat System', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Hardwood-specific mat drying to save flooring. LGR + mat setup, run for 5-7 days, sand and refinish separately if needed. Alternative to full replacement.',
    mats:[['R007',5],['R001',5],['R011',0.25]] },
  { cat:'resto_wtr', tag:'Cavity Drying', n:'Subfloor / Crawlspace Drying', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Crawlspace drying with dehumidifier + air movers. Includes vapor-barrier check and antimicrobial treatment of framing.',
    mats:[['R001',5],['R003',6],['R021',1],['R047',1],['R048',2]] },

  // Antimicrobial / disinfection
  { cat:'resto_wtr', tag:'Antimicrobial', n:'Antimicrobial Treatment (per 500 sqft)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Apply EPA-registered antimicrobial to affected surfaces after extraction to prevent mold growth. Standard practice on Cat 2/3 losses and any material that stayed wet 24+ hrs.',
    mats:[['R021',1],['R048',2]] },
  { cat:'resto_wtr', tag:'Antimicrobial', n:'HEPA Air Scrubbing Setup (per unit / day)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'HEPA air scrubber setup per affected area for negative-air containment during dryout. Filters particulates and microbial spores. Priced per unit per day.',
    mats:[['R005',3],['R013',1],['R014',0.25]] },

  // Basement / large volume
  { cat:'resto_wtr', tag:'Basement', n:'Basement Pump-Out (up to 1000 gal)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Submersible pump-out of a flooded basement up to 1000 gallons. Includes discharge routing and post-pump extraction of remaining moisture.',
    mats:[['R009',3],['R008',2]] },

  // Mold containment
  { cat:'resto_mold', tag:'Containment', n:'Mold Containment Barrier Build (per room)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'6-mil poly containment with zippered access door, negative-air machine, and proper HEPA-filtered exhaust. Required for Level 2+ mold work.',
    mats:[['R040',0.5],['R041',4],['R042',2],['R043',0.1],['R005',3],['R014',1]] },
  { cat:'resto_mold', tag:'Assessment', n:'Mold Air Sample (per sample)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Collect indoor + outdoor air samples for third-party lab analysis. Used for pre-remediation baseline and post-clearance testing. Lab fee billed separately.',
    mats:[] },

  // Fire / smoke damage — dryout side
  { cat:'resto_fire', tag:'Fire', n:'Smoke/Soot Damage Assessment', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'On-site smoke damage inspection with digital soot swab testing. Photo documentation and written scope for insurance carrier.',
    mats:[] },
  { cat:'resto_fire', tag:'Fire', n:'Ozone Treatment — Whole House (per day)', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Ozone generator treatment to neutralize smoke odor throughout a home. Priced per day the equipment runs; typical residential job runs 2-4 days after cleaning.',
    mats:[['R025',1],['R023',1]] },
  { cat:'resto_fire', tag:'Fire', n:'Thermal Fog Deodorization (per 1000 sqft)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Thermal-fog deodorizer treatment for smoke odor penetration into porous materials. Applied after cleaning; combines with ozone for stubborn odors.',
    mats:[['R026',1]] },

  // Storm
  { cat:'resto_storm', tag:'Storm', n:'Emergency Board-Up / Tarp-Over', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Emergency board-up of broken openings or tarp-over of a compromised roof. Prevents further loss until permanent repair. Materials extra by size.',
    mats:[['R144',3],['R148',0.5]] },
];

// ── REMOVAL tasks (~30) ────────────────────────────────────────────────────
const REMOVAL_TASKS = [
  // Content
  { cat:'resto_packout', tag:'Content', n:'Content Inventory & Photo Documentation', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Detailed inventory of contents with condition photos, categorized by room. Required for insurance content claims. Billable admin.',
    mats:[] },
  { cat:'resto_packout', tag:'Content', n:'Content Pack-Out (per room)', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Pack contents from a single room into boxes, wrap furniture, and load into truck for off-site cleaning/storage. Includes labels tied to inventory list.',
    mats:[['R215',20],['R216',6],['R217',1]] },
  { cat:'resto_packout', tag:'Content', n:'Content Storage — per month per pallet', hrs:0.25, time:'15 min', diff:'Easy',
    desc:'Monthly climate-controlled storage of packed-out contents on a pallet. Billed monthly to carrier while dryout/rebuild is in progress.',
    mats:[] },
  { cat:'resto_packout', tag:'Content', n:'Sewage-Contaminated Content Disposal (per pallet)', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Cat-3 content that cannot be salvaged. Documented disposal per state biohazard rules, PPE, containment during removal.',
    mats:[['R047',2],['R049',1],['R050',2],['R052',1]] },

  // Drywall / ceiling demo
  { cat:'resto_wtr', tag:'Drywall Demo', n:'Flood-Cut Drywall Removal (2 ft, per LF wall)', hrs:0.4, time:'25 min per LF', diff:'Easy',
    desc:'Flood cut: remove wet drywall 2 ft up from the floor along an affected wall. Per LF of wall. Includes debris bagging and site clean.',
    mats:[['R060',0.05],['R047',0.05]] },
  { cat:'resto_wtr', tag:'Drywall Demo', n:'Flood-Cut Drywall Removal (4 ft, per LF wall)', hrs:0.6, time:'35 min per LF', diff:'Easy',
    desc:'Full 4 ft flood cut on affected wall when wicking exceeds 2 ft. Per LF of wall.',
    mats:[['R060',0.05],['R047',0.05]] },
  { cat:'resto_wtr', tag:'Drywall Demo', n:'Full-Height Drywall Removal (per LF wall, 8 ft)', hrs:0.9, time:'55 min per LF', diff:'Moderate',
    desc:'Full-height drywall demo when wicking reaches ceiling or insulation is wet. Per LF of wall.',
    mats:[['R060',0.1],['R047',0.1]] },
  { cat:'resto_wtr', tag:'Ceiling Demo', n:'Ceiling Drywall Removal (per sqft)', hrs:0.06, time:'per sqft', diff:'Moderate',
    desc:'Remove wet ceiling drywall. Includes cutting, bagging, and site clean. Priced per sqft.',
    mats:[['R060',0.02]] },

  // Insulation
  { cat:'resto_wtr', tag:'Insulation', n:'Wet Batt Insulation Removal (per sqft)', hrs:0.05, time:'per sqft', diff:'Easy',
    desc:'Remove wet fiberglass or mineral-wool batt insulation. Bagged and disposed. Per sqft of affected wall/ceiling.',
    mats:[['R060',0.02],['R047',0.02]] },
  { cat:'resto_wtr', tag:'Insulation', n:'Wet Blown-In Insulation Removal (per sqft)', hrs:0.15, time:'per sqft', diff:'Moderate',
    desc:'HEPA-vacuum removal of wet blown-in cellulose or fiberglass. Includes attic access setup and disposal. Per sqft of attic area.',
    mats:[['R047',0.05],['R048',0.1]] },

  // Flooring removal
  { cat:'resto_wtr', tag:'Flooring Demo', n:'Carpet + Pad Removal (per sqft)', hrs:0.03, time:'per sqft', diff:'Easy',
    desc:'Remove carpet and pad, cut into rollable sections, and haul away. Per sqft of area.',
    mats:[['R060',0.02]] },
  { cat:'resto_wtr', tag:'Flooring Demo', n:'Laminate / LVP Removal (per sqft)', hrs:0.04, time:'per sqft', diff:'Easy',
    desc:'Pry up floating laminate or LVP flooring. Includes debris haul.',
    mats:[['R060',0.02]] },
  { cat:'resto_wtr', tag:'Flooring Demo', n:'Glue-Down Vinyl Removal (per sqft)', hrs:0.1, time:'per sqft', diff:'Moderate',
    desc:'Remove glue-down vinyl including scraping residual adhesive from subfloor.',
    mats:[] },
  { cat:'resto_wtr', tag:'Flooring Demo', n:'Hardwood Removal (per sqft)', hrs:0.15, time:'per sqft', diff:'Moderate',
    desc:'Pry up nailed or glued hardwood flooring. Includes nail-set inspection of subfloor and haul-away.',
    mats:[['R060',0.03]] },
  { cat:'resto_wtr', tag:'Flooring Demo', n:'Tile & Thinset Removal (per sqft)', hrs:0.22, time:'per sqft', diff:'Hard',
    desc:'Remove tile and grind or chip thinset back down to subfloor. Dust containment recommended. Per sqft.',
    mats:[['R047',0.03],['R048',0.05]] },
  { cat:'resto_wtr', tag:'Flooring Demo', n:'Subfloor Removal — Damaged (per sqft)', hrs:0.15, time:'per sqft', diff:'Hard',
    desc:'Cut out water-damaged plywood or OSB subfloor. Preserves joists. Per sqft of subfloor removed.',
    mats:[['R060',0.05]] },

  // Trim / cabinets / fixtures for demo
  { cat:'resto_wtr', tag:'Trim Demo', n:'Baseboard & Trim Removal (per LF)', hrs:0.05, time:'per LF', diff:'Easy',
    desc:'Pry and remove baseboard/casing/quarter-round. Salvage stain-grade material if requested.',
    mats:[] },
  { cat:'resto_wtr', tag:'Cabinet Demo', n:'Kitchen Cabinet Removal (per LF)', hrs:0.4, time:'25 min per LF', diff:'Moderate',
    desc:'Remove base/wall cabinets, disconnect plumbing if needed, and stage for disposal or salvage.',
    mats:[] },
  { cat:'resto_wtr', tag:'Cabinet Demo', n:'Bath Vanity Removal', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Disconnect plumbing, remove vanity and top, cap water lines. Per vanity.',
    mats:[] },
  { cat:'resto_wtr', tag:'Fixture Demo', n:'Toilet R&R for Floor Work', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Remove toilet to access flooring, cap flange, reset with new wax ring when floor work is complete. Per unit.',
    mats:[] },

  // Fire / mold demolition
  { cat:'resto_fire', tag:'Fire Demo', n:'Char/Fire-Damaged Framing Removal (per LF)', hrs:0.35, time:'20 min per LF', diff:'Hard',
    desc:'Remove and stage for haul-away charred wall/ceiling framing. Includes cutting, PPE, structural assessment coordination.',
    mats:[['R060',0.05],['R047',0.05]] },
  { cat:'resto_fire', tag:'Fire Demo', n:'Soot/Smoke-Damaged Content Removal (per room)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Remove non-salvageable soft goods and contents from a room per adjuster direction. Includes documentation.',
    mats:[['R060',0.5],['R047',1]] },
  { cat:'resto_mold', tag:'Mold Demo', n:'Level 2 Mold Removal — Drywall (per sqft)', hrs:0.15, time:'per sqft', diff:'Hard',
    desc:'Remove mold-affected drywall inside a full containment. Priced per sqft. Includes HEPA-vac of exposed framing, wire-brushing, and antimicrobial treatment.',
    mats:[['R060',0.05],['R047',0.05],['R022',0.02],['R014',0.05]] },
  { cat:'resto_mold', tag:'Mold Demo', n:'Level 3 Mold Remediation — up to 100 sqft', hrs:8, time:'8 hr', diff:'Complex',
    desc:'Larger mold job (10-100 sqft contaminated). Full containment, negative air, PPE, structural remediation, HEPA cleaning + antimicrobial. Post-clearance test billed separately.',
    mats:[['R040',1],['R041',6],['R042',3],['R005',8],['R014',2],['R022',1],['R047',4]] },

  // Sewage demo
  { cat:'resto_sewage', tag:'Cat 3 Demo', n:'Sewage-Contaminated Drywall Demo (per LF)', hrs:0.8, time:'50 min per LF', diff:'Hard',
    desc:'Cat-3 flood-cut drywall demo with full PPE, containment, and biocide treatment of exposed framing. Priced per LF.',
    mats:[['R060',0.15],['R047',0.2],['R049',0.1],['R022',0.05],['R050',0.3]] },
  { cat:'resto_sewage', tag:'Cat 3 Demo', n:'Sewage-Contaminated Subfloor Removal (per sqft)', hrs:0.25, time:'per sqft', diff:'Hard',
    desc:'Remove biohazard-affected subfloor. Documented biohazard disposal.',
    mats:[['R060',0.05],['R047',0.05],['R022',0.03]] },

  // Debris hauling
  { cat:'resto_wtr', tag:'Debris', n:'Debris Haul-Away — 15yd Dumpster', hrs:1, time:'delivery + haul', diff:'Easy',
    desc:'15-yd dumpster delivered, filled during demo, and hauled off. Weekly rental included.',
    mats:[['R061',1]] },
  { cat:'resto_wtr', tag:'Debris', n:'Debris Haul-Away — 20yd Dumpster', hrs:1, time:'delivery + haul', diff:'Easy',
    desc:'20-yd dumpster — larger single-family or partial multi-family job.',
    mats:[['R062',1]] },
  { cat:'resto_wtr', tag:'Debris', n:'Debris Haul-Away — 30yd Dumpster', hrs:1, time:'delivery + haul', diff:'Easy',
    desc:'30-yd dumpster for whole-home gut. Weekly rental.',
    mats:[['R063',1]] },
];

// ── REBUILD tasks (~30) ────────────────────────────────────────────────────
const REBUILD_TASKS = [
  // Drywall install
  { cat:'resto_finish', tag:'Drywall', n:'Drywall Replace — 1/2" Standard (per sqft)', hrs:0.06, time:'per sqft', diff:'Moderate',
    desc:'Hang, tape, mud, sand, and prime 1/2" drywall on wall or ceiling. Priced per sqft. Two-coat mud, ready for texture.',
    mats:[['R080',0.035],['R083',0.02],['R084',0.02],['R086',0.01],['R087',0.03],['R210',0.02]] },
  { cat:'resto_finish', tag:'Drywall', n:'Drywall Replace — 5/8" Fire-Rated (per sqft)', hrs:0.07, time:'per sqft', diff:'Moderate',
    desc:'5/8" fire-rated drywall install on garage wall/ceiling or code-required areas. Includes tape and finish.',
    mats:[['R081',0.035],['R083',0.02],['R084',0.02],['R086',0.01]] },
  { cat:'resto_finish', tag:'Drywall', n:'Moisture-Resistant Drywall — Bath (per sqft)', hrs:0.08, time:'per sqft', diff:'Moderate',
    desc:'Green-board or purple-board install in bath/laundry with tape and finish.',
    mats:[['R082',0.035],['R083',0.02],['R084',0.02]] },
  { cat:'resto_finish', tag:'Drywall', n:'Texture Match — Orange Peel (per sqft)', hrs:0.03, time:'per sqft', diff:'Moderate',
    desc:'Match existing orange-peel wall or ceiling texture. Includes prep and blend into existing finish.',
    mats:[['R088',0.02]] },
  { cat:'resto_finish', tag:'Drywall', n:'Texture Match — Knockdown (per sqft)', hrs:0.035, time:'per sqft', diff:'Moderate',
    desc:'Match existing knockdown texture. Higher skill requirement to blend into existing.',
    mats:[['R089',0.02]] },
  { cat:'resto_finish', tag:'Drywall', n:'Smooth Level-5 Finish (per sqft)', hrs:0.09, time:'per sqft', diff:'Hard',
    desc:'Premium level-5 smooth finish with skim coat. Used in modern designs. Requires extra sanding and prime.',
    mats:[['R083',0.03],['R210',0.05]] },

  // Paint
  { cat:'resto_finish', tag:'Paint', n:'Prime + 2-Coat Paint — Walls (per sqft)', hrs:0.02, time:'per sqft', diff:'Easy',
    desc:'Prime and apply two coats of latex interior paint on walls. Priced per sqft of wall area painted. Includes drop cloths and standard prep.',
    mats:[['R090',0.005],['R092',0.008],['R096',0.005],['R097',0.005]] },
  { cat:'resto_finish', tag:'Paint', n:'Ceiling Paint — 2-Coat (per sqft)', hrs:0.025, time:'per sqft', diff:'Moderate',
    desc:'Prime + 2 coats flat ceiling paint. Priced per sqft of ceiling.',
    mats:[['R095',0.008],['R096',0.005]] },
  { cat:'resto_finish', tag:'Paint', n:'Smoke Odor Blocking Primer (per sqft)', hrs:0.02, time:'per sqft', diff:'Easy',
    desc:'Sealer/primer specifically designed to block smoke and soot odors. Required before topcoat in fire loss rebuilds.',
    mats:[['R091',0.008]] },
  { cat:'resto_finish', tag:'Paint', n:'Trim + Door Paint — Semi-Gloss (per LF)', hrs:0.08, time:'per LF', diff:'Moderate',
    desc:'Paint baseboard, casing, and doors with semi-gloss latex. Includes light sand and one prime + two topcoats.',
    mats:[['R094',0.02]] },

  // Flooring rebuild
  { cat:'resto_finish', tag:'Flooring', n:'Carpet + Pad Install (per sqft)', hrs:0.05, time:'per sqft', diff:'Moderate',
    desc:'Install carpet with 8-lb rebond pad and tack strip. Includes seaming and stretching. Per sqft.',
    mats:[['R120',1],['R121',1]] },
  { cat:'resto_finish', tag:'Flooring', n:'LVT / LVP Floating Install (per sqft)', hrs:0.06, time:'per sqft', diff:'Moderate',
    desc:'Install click-lock LVT/LVP with underlayment over prepared subfloor. Per sqft. Includes standard cuts and transitions to adjacent flooring.',
    mats:[['R122',1],['R130',0.01]] },
  { cat:'resto_finish', tag:'Flooring', n:'Rigid-Core LVT Install (per sqft)', hrs:0.07, time:'per sqft', diff:'Moderate',
    desc:'Install 7mm rigid-core LVT (SPC/WPC). Underlayment often integrated. Per sqft.',
    mats:[['R123',1]] },
  { cat:'resto_finish', tag:'Flooring', n:'Engineered Hardwood Install (per sqft)', hrs:0.1, time:'per sqft', diff:'Hard',
    desc:'Install engineered hardwood using glue-down or floating method. Per sqft.',
    mats:[['R124',1],['R130',0.01]] },
  { cat:'resto_finish', tag:'Flooring', n:'Solid Hardwood Install & Finish (per sqft)', hrs:0.18, time:'per sqft', diff:'Hard',
    desc:'Nail-down solid hardwood over plywood. Sand, stain and finish separately. Per sqft.',
    mats:[['R125',1]] },
  { cat:'resto_finish', tag:'Flooring', n:'Tile Install w/ Thinset & Grout (per sqft)', hrs:0.22, time:'per sqft', diff:'Hard',
    desc:'Cement-board underlayment, thinset, tile, grout, and seal. Per sqft. Priced for standard 12x24 tile.',
    mats:[['R126',1],['R128',0.02],['R129',0.02],['R131',0.05]] },
  { cat:'resto_finish', tag:'Flooring', n:'Transition Strip Install (per LF)', hrs:0.15, time:'per LF', diff:'Easy',
    desc:'Install T-molding, reducer, or threshold at flooring transitions.',
    mats:[['R132',1]] },

  // Trim / doors
  { cat:'resto_finish', tag:'Trim', n:'Baseboard Install — MDF 3-1/4" (per LF)', hrs:0.12, time:'per LF', diff:'Easy',
    desc:'Install and caulk MDF baseboard, prime and paint separately or with paint task. Per LF.',
    mats:[['R100',1],['R211',0.05]] },
  { cat:'resto_finish', tag:'Trim', n:'Baseboard Install — MDF 5-1/4" (per LF)', hrs:0.14, time:'per LF', diff:'Easy',
    desc:'Install taller MDF baseboard with mitered corners. Per LF.',
    mats:[['R101',1],['R211',0.05]] },
  { cat:'resto_finish', tag:'Trim', n:'Stain-Grade Oak Baseboard (per LF)', hrs:0.2, time:'per LF', diff:'Moderate',
    desc:'Install stain-grade oak baseboard. Per LF. Stain and finish separately.',
    mats:[['R102',1]] },
  { cat:'resto_finish', tag:'Trim', n:'Door Casing Install (per side)', hrs:1, time:'1 hr', diff:'Moderate',
    desc:'Cut and install casing on one side of a doorframe. Priced per side.',
    mats:[['R103',12]] },
  { cat:'resto_finish', tag:'Trim', n:'Crown Molding Install (per LF)', hrs:0.2, time:'per LF', diff:'Hard',
    desc:'Install painted crown molding with proper cope joints. Per LF.',
    mats:[['R105',1]] },
  { cat:'resto_finish', tag:'Doors', n:'Interior Door — Hollow Core Install', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Install pre-hung hollow-core interior door with hardware. Per unit.',
    mats:[['R106',1],['R109',1]] },
  { cat:'resto_finish', tag:'Doors', n:'Interior Door — Solid Core Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install pre-hung solid-core interior door with hardware.',
    mats:[['R107',1],['R109',1]] },

  // Insulation replace
  { cat:'resto_struct', tag:'Insulation', n:'R-13 Batt Insulation Install (per sqft)', hrs:0.03, time:'per sqft', diff:'Easy',
    desc:'Install R-13 batt insulation in exterior walls. Per sqft.',
    mats:[['R149',1],['R047',0.02]] },
  { cat:'resto_struct', tag:'Insulation', n:'R-30 Ceiling Batt (per sqft)', hrs:0.04, time:'per sqft', diff:'Easy',
    desc:'Install R-30 batt insulation in ceiling/attic. Per sqft.',
    mats:[['R151',1],['R047',0.02]] },

  // Framing / subfloor
  { cat:'resto_struct', tag:'Framing', n:'Wall Framing Repair (per LF)', hrs:0.35, time:'per LF', diff:'Moderate',
    desc:'Sister or replace damaged wall studs and reinforce top/bottom plate. Per LF of wall.',
    mats:[['R140',0.5],['R148',0.05]] },
  { cat:'resto_struct', tag:'Framing', n:'Subfloor Install — 3/4" T&G (per sqft)', hrs:0.06, time:'per sqft', diff:'Moderate',
    desc:'Install 3/4" tongue-and-groove plywood subfloor over joists. Screwed and glued. Per sqft.',
    mats:[['R146',0.032],['R147',0.02],['R213',0.02]] },
  { cat:'resto_struct', tag:'Framing', n:'Sheathing OSB 7/16" (per sqft)', hrs:0.05, time:'per sqft', diff:'Moderate',
    desc:'Install 7/16 OSB sheathing on wall or roof. Per sqft.',
    mats:[['R144',0.032],['R148',0.02]] },

  // Cabinets / vanities / tops
  { cat:'resto_finish', tag:'Cabinets', n:'Kitchen Cabinet Install — 10x10 Basic', hrs:16, time:'2 days', diff:'Hard',
    desc:'Install standard 10x10 kitchen cabinet package. Includes base + wall + shim + level + final scribe. Countertop separate.',
    mats:[['R172',1]] },
  { cat:'resto_finish', tag:'Cabinets', n:'Bath Vanity Install — 30" w/ Top', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install 30" bath vanity with pre-installed top. Includes leveling, wall anchor, faucet/drain hook-up.',
    mats:[['R173',1]] },
  { cat:'resto_finish', tag:'Countertops', n:'Laminate Countertop Install (per LF)', hrs:0.75, time:'45 min per LF', diff:'Moderate',
    desc:'Install laminate countertop with build-up strips, level, and end caps. Per LF.',
    mats:[['R175',1]] },
  { cat:'resto_finish', tag:'Countertops', n:'Quartz Countertop Install (per sqft)', hrs:0.35, time:'per sqft', diff:'Hard',
    desc:'Coordinate template + fabrication with stone shop, then install quartz countertop with seams, adhesive, and sink cut-out. Per sqft.',
    mats:[['R176',1]] },

  // Bathroom rebuild
  { cat:'resto_finish', tag:'Bath', n:'Toilet Reinstall', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Reinstall existing (or new) toilet with new wax ring and supply line. Per unit.',
    mats:[['R190',1]] },
  { cat:'resto_finish', tag:'Bath', n:'Alcove Tub + Surround Install', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Install standard 60" alcove tub with 3-piece surround. Plumbing tie-in included.',
    mats:[['R191',1],['R192',1]] },
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

    console.log('→ Clearing existing restoration data');
    await db.query(
      `DELETE FROM pb_task_materials
        WHERE task_id IN (SELECT id FROM pb_tasks WHERE service = 'restoration')`
    );
    await db.query(`DELETE FROM pb_tasks       WHERE service = 'restoration'`);
    await db.query(`DELETE FROM pb_materials   WHERE service = 'restoration'`);
    await db.query(`DELETE FROM pb_categories  WHERE service = 'restoration'`);
    await db.query(`DELETE FROM pb_engine      WHERE service = 'restoration'`);

    // Seed 3 engines — dryout / removal / rebuild
    console.log('→ Seeding restoration engines (dryout, removal, rebuild)');
    for (const st of ['dryout', 'removal', 'rebuild']) {
      await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ('restoration', $1, 32, 0, 0, 0, 20, 8, 3,
                 1600, 7.65, 2.5, 8, 0, 0, 0, 0, 0, 0,
                 1, 1600, 0, $2::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [st, JSON.stringify(DEFAULT_OH)]
      );
    }

    console.log(`→ Inserting ${Object.keys(MATS).length} restoration materials`);
    for (const [id, m] of Object.entries(MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,'restoration')`,
        [id, m.d, m.u, m.c, m.cat]
      );
    }

    console.log(`→ Inserting restoration categories`);
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const types = c.serviceOnly ? [c.serviceOnly] : ['dryout', 'removal', 'rebuild'];
      for (const t of types) {
        await db.query(
          `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'restoration',$7)
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
           VALUES ($1,$2,$3,$4,$5,$6,'',$7,'restoration',$8) RETURNING id`,
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
    const dLinks = await insertBucket(DRYOUT_TASKS,  'dryout',  'dryout');
    const rmLinks = await insertBucket(REMOVAL_TASKS,'removal', 'removal');
    const rbLinks = await insertBucket(REBUILD_TASKS,'rebuild', 'rebuild');
    console.log(`  → material links: dryout=${dLinks}, removal=${rmLinks}, rebuild=${rbLinks}`);

    console.log('→ Enabling restoration in company_settings');
    await db.query(`
      INSERT INTO company_settings (id, service_restoration)
      VALUES ('main', true)
      ON CONFLICT (id) DO UPDATE SET service_restoration = true
    `);

    await db.query('COMMIT');
    console.log('✓ Migration 007 complete.');

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

'use strict';
/**
 * Migration 008: Seed the Renovations pricebook.
 *
 * Renovations is split into THREE sub-books by project type:
 *   service_type = 'kitchen'   — kitchen remodels
 *   service_type = 'bathroom'  — bathroom remodels
 *   service_type = 'home'      — whole-home remodels, additions, exterior, decks, roofing
 *
 * Rationale: remodelers scope work by project type. Cabinet + counter margins
 * on a kitchen are structurally different from framing + drywall margins on
 * an addition — they deserve separate engines.
 *
 * Contents:
 *   - ~110 materials (id prefix N001…)
 *   - 18 categories (6 kitchen, 5 bathroom, 7 home)
 *   - ~25 kitchen tasks, ~22 bathroom tasks, ~28 home tasks
 *   - 3 engines seeded with the 10-item overhead template (monthly=0)
 *
 * Idempotent: clears existing renovation rows before insert.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/008_renovations_starter.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ── Materials (N001…) ──────────────────────────────────────────────────────
const MATS = {
  // ── Cabinetry ─
  N010: { d: 'Base Cabinet 18" (shaker white)',        u: 'EA', c: 165.00, cat: 'Cabinets' },
  N011: { d: 'Base Cabinet 24"',                        u: 'EA', c: 195.00, cat: 'Cabinets' },
  N012: { d: 'Base Cabinet 30"',                        u: 'EA', c: 225.00, cat: 'Cabinets' },
  N013: { d: 'Base Cabinet 36" (sink base)',            u: 'EA', c: 245.00, cat: 'Cabinets' },
  N014: { d: 'Wall Cabinet 30"×30"',                    u: 'EA', c: 175.00, cat: 'Cabinets' },
  N015: { d: 'Wall Cabinet 36"×30"',                    u: 'EA', c: 205.00, cat: 'Cabinets' },
  N016: { d: 'Wall Cabinet 12"×30" (spice)',            u: 'EA', c: 105.00, cat: 'Cabinets' },
  N017: { d: 'Pantry / Tall Cabinet 84"',               u: 'EA', c: 425.00, cat: 'Cabinets' },
  N018: { d: 'Corner Lazy-Susan Base',                  u: 'EA', c: 385.00, cat: 'Cabinets' },
  N019: { d: 'Kitchen Cabinet Pkg — 10x10 Shaker White', u: 'EA', c: 2450.00, cat: 'Cabinets' },
  N020: { d: 'Kitchen Cabinet Pkg — 10x10 Custom Painted', u: 'EA', c: 5850.00, cat: 'Cabinets' },
  N021: { d: 'Soft-Close Hinges (pair)',                u: 'PR', c: 8.00,  cat: 'Cabinets' },
  N022: { d: 'Cabinet Pull — Brushed Nickel',           u: 'EA', c: 4.50,  cat: 'Cabinets' },
  N023: { d: 'Cabinet Pull — Matte Black',              u: 'EA', c: 5.50,  cat: 'Cabinets' },
  N024: { d: 'Toe Kick 96" (finish match)',             u: 'EA', c: 22.00, cat: 'Cabinets' },
  N025: { d: 'Crown Molding for Cabinets (per LF)',     u: 'LF', c: 4.50,  cat: 'Cabinets' },

  // ── Countertops & sinks ─
  N040: { d: 'Laminate Countertop (per LF)',            u: 'LF', c: 28.00, cat: 'Countertops' },
  N041: { d: 'Butcher Block Countertop (per sqft)',     u: 'SF', c: 42.00, cat: 'Countertops' },
  N042: { d: 'Quartz Countertop mid-tier (per sqft)',   u: 'SF', c: 65.00, cat: 'Countertops' },
  N043: { d: 'Quartz Countertop premium (per sqft)',    u: 'SF', c: 95.00, cat: 'Countertops' },
  N044: { d: 'Granite Countertop mid-tier (per sqft)',  u: 'SF', c: 55.00, cat: 'Countertops' },
  N045: { d: 'Marble Countertop (per sqft)',            u: 'SF', c: 125.00, cat: 'Countertops' },
  N046: { d: 'Kitchen Sink — Undermount SS 32"',        u: 'EA', c: 185.00, cat: 'Sinks & Faucets' },
  N047: { d: 'Kitchen Sink — Farmhouse Fireclay 33"',   u: 'EA', c: 685.00, cat: 'Sinks & Faucets' },
  N048: { d: 'Kitchen Faucet Pull-Down Mid',            u: 'EA', c: 185.00, cat: 'Sinks & Faucets' },
  N049: { d: 'Kitchen Faucet Pull-Down Premium',        u: 'EA', c: 385.00, cat: 'Sinks & Faucets' },

  // ── Backsplash / kitchen tile ─
  N060: { d: 'Ceramic Subway Tile 3x6 (per sqft)',      u: 'SF', c: 3.50,  cat: 'Backsplash' },
  N061: { d: 'Glass Mosaic Sheet 12x12 (per sqft)',     u: 'SF', c: 12.00, cat: 'Backsplash' },
  N062: { d: 'Herringbone Marble Mosaic (per sqft)',    u: 'SF', c: 18.00, cat: 'Backsplash' },
  N063: { d: 'Peel-and-Stick Backsplash (per sqft)',    u: 'SF', c: 6.00,  cat: 'Backsplash' },
  N064: { d: 'Tile Adhesive Mastic 3.5gal',             u: 'EA', c: 32.00, cat: 'Backsplash' },

  // ── Kitchen appliances (install-only accounting) ─
  N080: { d: 'Range Hood Ductless (customer supply)',   u: 'EA', c: 0,     cat: 'Appliances' },
  N081: { d: 'Range Hood Ducted (customer supply)',     u: 'EA', c: 0,     cat: 'Appliances' },
  N082: { d: 'Dishwasher (customer supply)',            u: 'EA', c: 0,     cat: 'Appliances' },
  N083: { d: 'Garbage Disposal 3/4HP',                  u: 'EA', c: 145.00, cat: 'Appliances' },
  N084: { d: 'Range Anti-Tip Bracket',                  u: 'EA', c: 12.00, cat: 'Appliances' },
  N085: { d: 'Dishwasher Air Gap',                      u: 'EA', c: 22.00, cat: 'Appliances' },
  N086: { d: 'Range Hood Duct Kit 6"',                  u: 'EA', c: 48.00, cat: 'Appliances' },

  // ── Bath fixtures ─
  N100: { d: 'Bath Vanity 30" w/ Top (single sink)',    u: 'EA', c: 385.00, cat: 'Bath Vanities' },
  N101: { d: 'Bath Vanity 36" w/ Top',                  u: 'EA', c: 485.00, cat: 'Bath Vanities' },
  N102: { d: 'Bath Vanity 48" w/ Top',                  u: 'EA', c: 685.00, cat: 'Bath Vanities' },
  N103: { d: 'Bath Vanity 60" Double Sink',             u: 'EA', c: 985.00, cat: 'Bath Vanities' },
  N104: { d: 'Vanity Faucet Widespread (mid)',          u: 'EA', c: 165.00, cat: 'Sinks & Faucets' },
  N105: { d: 'Vanity Faucet Single-Hole',               u: 'EA', c: 95.00,  cat: 'Sinks & Faucets' },
  N106: { d: 'Vessel Sink Bowl',                        u: 'EA', c: 185.00, cat: 'Sinks & Faucets' },
  N107: { d: 'Bath Sink Undermount White',              u: 'EA', c: 85.00,  cat: 'Sinks & Faucets' },
  N110: { d: 'Alcove Tub 60" (acrylic)',                u: 'EA', c: 385.00, cat: 'Tub & Shower' },
  N111: { d: 'Free-standing Soaker Tub 60"',            u: 'EA', c: 985.00, cat: 'Tub & Shower' },
  N112: { d: 'Drop-in Tub 60"',                         u: 'EA', c: 485.00, cat: 'Tub & Shower' },
  N113: { d: '3-piece Tub Surround (white acrylic)',    u: 'EA', c: 285.00, cat: 'Tub & Shower' },
  N114: { d: 'Shower Base 36×48 Acrylic',               u: 'EA', c: 385.00, cat: 'Tub & Shower' },
  N115: { d: 'Shower Base 48×60 Acrylic (curbless)',    u: 'EA', c: 685.00, cat: 'Tub & Shower' },
  N116: { d: 'Shower Kit — Framed Sliding 60"',         u: 'EA', c: 385.00, cat: 'Tub & Shower' },
  N117: { d: 'Shower Kit — Frameless 60"',              u: 'EA', c: 985.00, cat: 'Tub & Shower' },
  N118: { d: 'Shower Valve + Trim Mid',                 u: 'EA', c: 185.00, cat: 'Tub & Shower' },
  N119: { d: 'Shower Valve + Trim Premium (rain head)', u: 'EA', c: 485.00, cat: 'Tub & Shower' },
  N120: { d: 'Toilet — Standard 2pc White',             u: 'EA', c: 165.00, cat: 'Bath Fixtures' },
  N121: { d: 'Toilet — Comfort Height Elongated',       u: 'EA', c: 245.00, cat: 'Bath Fixtures' },
  N122: { d: 'Toilet — 1pc Skirted',                    u: 'EA', c: 485.00, cat: 'Bath Fixtures' },
  N123: { d: 'Mirror — Standard 24×30',                 u: 'EA', c: 65.00,  cat: 'Bath Fixtures' },
  N124: { d: 'Mirror — LED Backlit 30×36',              u: 'EA', c: 285.00, cat: 'Bath Fixtures' },
  N125: { d: 'Towel Bar / Ring Set (matched)',          u: 'EA', c: 65.00,  cat: 'Bath Fixtures' },
  N126: { d: 'Bath Exhaust Fan 110 CFM w/ Light',       u: 'EA', c: 95.00,  cat: 'Bath Fixtures' },

  // ── Bathroom tile ─
  N140: { d: 'Bath Wall Tile — 4x4 White (per sqft)',   u: 'SF', c: 2.80,  cat: 'Bath Tile' },
  N141: { d: 'Bath Wall Tile — Subway (per sqft)',      u: 'SF', c: 3.50,  cat: 'Bath Tile' },
  N142: { d: 'Bath Wall Tile — Large Format (per sqft)',u: 'SF', c: 6.00,  cat: 'Bath Tile' },
  N143: { d: 'Shower Niche Insert (recessed)',          u: 'EA', c: 45.00, cat: 'Bath Tile' },
  N144: { d: 'Waterproof Membrane — Kerdi (per sqft)',  u: 'SF', c: 2.20,  cat: 'Bath Tile' },
  N145: { d: 'Schluter Edge — Chrome (per LF)',         u: 'LF', c: 8.00,  cat: 'Bath Tile' },
  N146: { d: 'Grout Sanded 25lb',                       u: 'EA', c: 18.00, cat: 'Bath Tile' },
  N147: { d: 'Thinset Mortar 50lb',                     u: 'EA', c: 22.00, cat: 'Bath Tile' },

  // ── Flooring (renovation-grade, incl. tile) ─
  N160: { d: 'LVP Rigid-Core Premium (per sqft)',       u: 'SF', c: 4.85,  cat: 'Flooring' },
  N161: { d: 'Engineered Hardwood Wide-Plank (per sqft)', u: 'SF', c: 7.50, cat: 'Flooring' },
  N162: { d: 'Solid Hardwood Oak Site-Finish (per sqft)', u: 'SF', c: 6.85, cat: 'Flooring' },
  N163: { d: 'Solid Hardwood Prefinished (per sqft)',   u: 'SF', c: 8.50,  cat: 'Flooring' },
  N164: { d: 'Porcelain Tile 12x24 (per sqft)',         u: 'SF', c: 4.50,  cat: 'Flooring' },
  N165: { d: 'Porcelain Wood-Look Plank (per sqft)',    u: 'SF', c: 6.00,  cat: 'Flooring' },
  N166: { d: 'Carpet — Berber Mid-Grade (per sqft)',    u: 'SF', c: 3.20,  cat: 'Flooring' },
  N167: { d: 'Carpet Pad 8lb (per sqft)',               u: 'SF', c: 0.45,  cat: 'Flooring' },
  N168: { d: 'Heated Floor Mat 30 sqft',                u: 'EA', c: 285.00, cat: 'Flooring' },
  N169: { d: 'Underlayment Foam 100 sqft',              u: 'EA', c: 28.00, cat: 'Flooring' },
  N170: { d: 'Transition Strip / T-Molding (per LF)',   u: 'LF', c: 4.50,  cat: 'Flooring' },

  // ── Doors & windows ─
  N180: { d: 'Interior Solid-Core Door 30" prehung',    u: 'EA', c: 185.00, cat: 'Doors & Windows' },
  N181: { d: 'Interior Barn Door 36" (hardware inc.)',  u: 'EA', c: 385.00, cat: 'Doors & Windows' },
  N182: { d: 'French Interior Door Pair 60"',           u: 'EA', c: 585.00, cat: 'Doors & Windows' },
  N183: { d: 'Exterior Fiberglass Door 36"',            u: 'EA', c: 585.00, cat: 'Doors & Windows' },
  N184: { d: 'Exterior Steel Door 36"',                 u: 'EA', c: 385.00, cat: 'Doors & Windows' },
  N185: { d: 'Sliding Patio Door 6ft (vinyl)',          u: 'EA', c: 685.00, cat: 'Doors & Windows' },
  N186: { d: 'Window — Vinyl DH 36×48 Low-E',           u: 'EA', c: 285.00, cat: 'Doors & Windows' },
  N187: { d: 'Window — Vinyl DH 48×48 Low-E',           u: 'EA', c: 345.00, cat: 'Doors & Windows' },
  N188: { d: 'Bay Window 6ft',                          u: 'EA', c: 1685.00, cat: 'Doors & Windows' },
  N189: { d: 'Egress Window 36x48 (basement kit)',      u: 'EA', c: 785.00, cat: 'Doors & Windows' },

  // ── Trim ─
  N200: { d: 'MDF Baseboard 5-1/4" (per LF)',           u: 'LF', c: 1.80, cat: 'Trim' },
  N201: { d: 'Oak Baseboard 4" stain-grade (per LF)',   u: 'LF', c: 3.50, cat: 'Trim' },
  N202: { d: 'Crown Molding 3-1/4" (per LF)',           u: 'LF', c: 2.20, cat: 'Trim' },
  N203: { d: 'Casing Trim 2-1/4" (per LF)',             u: 'LF', c: 1.10, cat: 'Trim' },
  N204: { d: 'Wainscoting Panel 4x8',                   u: 'EA', c: 48.00, cat: 'Trim' },
  N205: { d: 'Board & Batten Kit (per 100 sqft)',       u: 'EA', c: 145.00, cat: 'Trim' },

  // ── Paint (renovation package pricing) ─
  N220: { d: 'Primer 5-gal (Kilz or equiv)',            u: 'EA', c: 85.00,  cat: 'Paint' },
  N221: { d: 'Interior Paint Contractor 5-gal',         u: 'EA', c: 145.00, cat: 'Paint' },
  N222: { d: 'Interior Paint Premium 1gal (accent)',    u: 'EA', c: 55.00,  cat: 'Paint' },
  N223: { d: 'Ceiling Paint 5-gal',                     u: 'EA', c: 95.00,  cat: 'Paint' },
  N224: { d: 'Trim Paint Semi-Gloss 1gal',              u: 'EA', c: 48.00,  cat: 'Paint' },
  N225: { d: 'Exterior Paint Elastomeric 5-gal',        u: 'EA', c: 235.00, cat: 'Paint' },

  // ── Lighting ─
  N240: { d: '6" LED Canless Recessed',                 u: 'EA', c: 22.00, cat: 'Lighting' },
  N241: { d: 'Pendant Light — Mid',                     u: 'EA', c: 85.00, cat: 'Lighting' },
  N242: { d: 'Chandelier — Mid-Grade',                  u: 'EA', c: 285.00, cat: 'Lighting' },
  N243: { d: 'Under-Cabinet LED Strip 24"',             u: 'EA', c: 28.00, cat: 'Lighting' },
  N244: { d: 'Vanity Bar Light 24" LED',                u: 'EA', c: 145.00, cat: 'Lighting' },

  // ── Framing / structural (whole-home) ─
  N260: { d: '2x4x8 SPF Stud',                          u: 'EA', c: 4.20,  cat: 'Framing' },
  N261: { d: '2x6x8 SPF Stud',                          u: 'EA', c: 7.20,  cat: 'Framing' },
  N262: { d: '2x10x12 SPF Joist',                       u: 'EA', c: 22.00, cat: 'Framing' },
  N263: { d: 'LVL Beam 2x10x14',                        u: 'EA', c: 185.00, cat: 'Framing' },
  N264: { d: '7/16" OSB Sheathing 4x8',                 u: 'EA', c: 24.00, cat: 'Framing' },
  N265: { d: '5/8" Plywood Subfloor T&G 4x8',           u: 'EA', c: 42.00, cat: 'Framing' },
  N266: { d: '3/4" Plywood Subfloor T&G 4x8',           u: 'EA', c: 55.00, cat: 'Framing' },
  N267: { d: 'Framing Nails 16d (5lb)',                 u: 'BX', c: 18.00, cat: 'Framing' },
  N268: { d: 'Structural Screws #10x3" (5lb)',          u: 'BX', c: 32.00, cat: 'Framing' },
  N269: { d: 'Simpson Strap / Hurricane Tie',           u: 'EA', c: 4.00,  cat: 'Framing' },

  // ── Drywall / insulation (used across sub-books) ─
  N280: { d: '1/2" Drywall 4x8',                        u: 'EA', c: 12.50, cat: 'Drywall' },
  N281: { d: '5/8" Drywall Fire-Rated 4x8',             u: 'EA', c: 15.50, cat: 'Drywall' },
  N282: { d: 'Moisture-Resistant Drywall 4x8',          u: 'EA', c: 18.00, cat: 'Drywall' },
  N283: { d: 'Joint Compound 5-gal',                    u: 'EA', c: 22.00, cat: 'Drywall' },
  N284: { d: 'R-13 Batt Insulation (per sqft)',         u: 'SF', c: 0.65, cat: 'Insulation' },
  N285: { d: 'R-30 Ceiling Batt (per sqft)',            u: 'SF', c: 1.20, cat: 'Insulation' },

  // ── Roofing / siding (whole-home) ─
  N300: { d: 'Asphalt Architectural Shingle (per sqft)', u: 'SF', c: 1.20, cat: 'Roofing' },
  N301: { d: 'Standing Seam Metal Roof (per sqft)',     u: 'SF', c: 6.50,  cat: 'Roofing' },
  N302: { d: 'Roof Underlayment Synthetic (per sqft)',  u: 'SF', c: 0.35, cat: 'Roofing' },
  N303: { d: 'Ice & Water Shield (per sqft)',           u: 'SF', c: 0.75, cat: 'Roofing' },
  N304: { d: 'Roofing Nails Coil (5lb)',                u: 'BX', c: 32.00, cat: 'Roofing' },
  N305: { d: 'Ridge Vent 4ft',                          u: 'EA', c: 22.00, cat: 'Roofing' },
  N306: { d: 'Drip Edge 10ft',                          u: 'EA', c: 12.00, cat: 'Roofing' },
  N310: { d: 'Vinyl Siding Panel (per sqft)',           u: 'SF', c: 2.50,  cat: 'Siding' },
  N311: { d: 'Fiber Cement Siding Plank (per sqft)',    u: 'SF', c: 4.50,  cat: 'Siding' },
  N312: { d: 'LP SmartSide Panel (per sqft)',           u: 'SF', c: 3.20,  cat: 'Siding' },
  N313: { d: 'House Wrap (per sqft)',                   u: 'SF', c: 0.28,  cat: 'Siding' },

  // ── Decks / outdoor ─
  N330: { d: 'Composite Decking Mid-Grade (per sqft)',  u: 'SF', c: 6.50,  cat: 'Decks' },
  N331: { d: 'Composite Decking Premium (per sqft)',    u: 'SF', c: 9.50,  cat: 'Decks' },
  N332: { d: 'Pressure-Treated 5/4 Deck Board (per LF)', u: 'LF', c: 2.20, cat: 'Decks' },
  N333: { d: 'Hidden Deck Fasteners (per 100)',         u: 'PK', c: 65.00, cat: 'Decks' },
  N334: { d: 'Aluminum Deck Rail Kit 6ft',              u: 'EA', c: 185.00, cat: 'Decks' },
  N335: { d: 'Composite Deck Rail Kit 6ft',             u: 'EA', c: 245.00, cat: 'Decks' },
  N336: { d: 'Deck Post 4x4 PT 8ft',                    u: 'EA', c: 22.00, cat: 'Decks' },
  N337: { d: 'Concrete Deck Footing (bag)',             u: 'EA', c: 8.00,  cat: 'Decks' },
  N338: { d: 'Deck Stain 5-gal',                        u: 'EA', c: 145.00, cat: 'Decks' },

  // ── Consumables ─
  N360: { d: 'Caulk — Paintable Latex 10oz',            u: 'EA', c: 4.50,  cat: 'Consumables' },
  N361: { d: 'Silicone — Kitchen/Bath 10oz',            u: 'EA', c: 6.00,  cat: 'Consumables' },
  N362: { d: 'Construction Adhesive PL Premium',        u: 'EA', c: 8.00,  cat: 'Consumables' },
  N363: { d: 'Painter\'s Tape 2" (per roll)',           u: 'EA', c: 6.00,  cat: 'Consumables' },
  N364: { d: 'Drop Cloths Canvas 9x12',                 u: 'EA', c: 18.00, cat: 'Consumables' },
  N365: { d: 'Ram Board Floor Protection (per sqft)',   u: 'SF', c: 0.35, cat: 'Consumables' },
};

// ── Categories ─────────────────────────────────────────────────────────────
// Each category is scoped to one or more sub-books via `subBooks`.
const CATEGORIES = [
  // Kitchen categories
  { id: 'reno_kit_cab',    icon: '🗄',  name: 'Cabinets & Storage',  color: '#8B6914', desc: 'Cabinet install, refacing, upgrades', subBooks:['kitchen'] },
  { id: 'reno_kit_ct',     icon: '🧊', name: 'Countertops & Sinks',  color: '#4A4A6A', desc: 'Quartz, granite, sinks, faucets', subBooks:['kitchen'] },
  { id: 'reno_kit_bs',     icon: '◨',   name: 'Backsplash & Tile',    color: '#1F7A8C', desc: 'Backsplash design and install', subBooks:['kitchen'] },
  { id: 'reno_kit_appl',   icon: '🍳', name: 'Appliance Install',    color: '#5B2D8E', desc: 'Range hood, dishwasher, disposal, gas', subBooks:['kitchen'] },
  { id: 'reno_kit_pkg',    icon: '🎁', name: 'Kitchen Packages',      color: '#E8A500', desc: 'Small / mid / full remodel packages', subBooks:['kitchen'] },

  // Bathroom categories
  { id: 'reno_bath_shower', icon: '🚿', name: 'Shower / Tub',         color: '#2E5FA3', desc: 'Tub swap, shower conversion, tile shower', subBooks:['bathroom'] },
  { id: 'reno_bath_van',    icon: '🚰', name: 'Vanity & Fixtures',    color: '#1F7A8C', desc: 'Vanity swap, toilet, mirrors, accessories', subBooks:['bathroom'] },
  { id: 'reno_bath_tile',   icon: '◨',   name: 'Tile & Waterproofing', color: '#8B6914', desc: 'Wall tile, floor tile, niches, Kerdi', subBooks:['bathroom'] },
  { id: 'reno_bath_pkg',    icon: '🎁', name: 'Bath Packages',         color: '#E8A500', desc: 'Powder / hall / master remodel packages', subBooks:['bathroom'] },

  // Whole home / additions categories
  { id: 'reno_wh_frame',   icon: '🏗',  name: 'Framing & Structural', color: '#7A4B1A', desc: 'Framing, beams, load-bearing removals', subBooks:['home'] },
  { id: 'reno_wh_dw',      icon: '🚪', name: 'Doors & Windows',       color: '#2E5FA3', desc: 'Interior + exterior door/window R&R', subBooks:['home'] },
  { id: 'reno_wh_roof',    icon: '🏠', name: 'Roofing & Siding',      color: '#C55A11', desc: 'Reroofs, patch, siding install', subBooks:['home'] },
  { id: 'reno_wh_deck',    icon: '🪵', name: 'Decks & Outdoor',       color: '#1E6B3C', desc: 'Composite / PT decks, rails, stairs', subBooks:['home'] },
  { id: 'reno_wh_extra',   icon: '➕', name: 'Additions',              color: '#5B2D8E', desc: 'Bump-outs, garage conversions, ADU', subBooks:['home'] },

  // Shared — appear on all 3 sub-books
  { id: 'reno_floor',      icon: '🪟', name: 'Flooring',              color: '#7A4B1A', desc: 'LVP, hardwood, tile, carpet', subBooks:['kitchen','bathroom','home'] },
  { id: 'reno_paint',      icon: '🎨', name: 'Paint & Wall Finishes', color: '#5B2D8E', desc: 'Prime + paint, accent walls, exterior', subBooks:['kitchen','bathroom','home'] },
  { id: 'reno_trim',       icon: '📏', name: 'Trim & Millwork',       color: '#8B6914', desc: 'Baseboard, casing, crown, wainscot', subBooks:['kitchen','bathroom','home'] },
  { id: 'reno_light',      icon: '💡', name: 'Lighting',              color: '#E8A500', desc: 'Recessed, pendants, chandeliers', subBooks:['kitchen','bathroom','home'] },
];

// ── KITCHEN tasks ──────────────────────────────────────────────────────────
const KITCHEN_TASKS = [
  // Cabinets & storage
  { cat:'reno_kit_cab', tag:'Cabinets', n:'Cabinet Install — Standard 10x10 (Shaker White)', hrs:16, time:'2 days', diff:'Hard',
    desc:'Install a standard 10x10 stock cabinet package (shaker white). Includes base + wall cabinets, level & shim, secure to studs, install hardware, and light scribe. Assumes accessible layout and existing plumbing/electrical rough-in.',
    mats:[['N019',1],['N021',15],['N022',20],['N024',1]] },
  { cat:'reno_kit_cab', tag:'Cabinets', n:'Cabinet Install — Custom-Painted 10x10', hrs:24, time:'3 days', diff:'Complex',
    desc:'Install premium custom-painted 10x10 cabinet package. Higher scribe and finish tolerance, soft-close hardware, decorative crown molding across upper tops.',
    mats:[['N020',1],['N021',20],['N023',20],['N024',1],['N025',20]] },
  { cat:'reno_kit_cab', tag:'Cabinets', n:'Cabinet Refacing (per LF)', hrs:1, time:'1 hr per LF', diff:'Moderate',
    desc:'Reface existing cabinet boxes with new doors, drawer fronts, and matching veneer to boxes. Includes new soft-close hinges and pulls. Priced per LF of cabinets refaced.',
    mats:[['N021',2],['N022',3]] },
  { cat:'reno_kit_cab', tag:'Cabinets', n:'Pantry / Tall Cabinet Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install 84" pantry cabinet secured to studs and adjacent cabinetry. Includes crown / filler as needed.',
    mats:[['N017',1],['N021',3],['N022',2]] },
  { cat:'reno_kit_cab', tag:'Cabinets', n:'Cabinet Hardware — Full Kitchen Swap', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Replace all cabinet pulls / knobs and any failed hinges for a typical kitchen. Includes drilling for new hardware placement if changing style.',
    mats:[['N022',35],['N021',10]] },

  // Countertops & sinks
  { cat:'reno_kit_ct', tag:'Countertops', n:'Quartz Countertop — Mid-Grade (per sqft)', hrs:0.35, time:'per sqft', diff:'Hard',
    desc:'Template, fabricate, and install mid-grade quartz countertops. Includes seams, undermount-sink cutout, edge polish, and adhesive. Priced per sqft.',
    mats:[['N042',1]] },
  { cat:'reno_kit_ct', tag:'Countertops', n:'Quartz Countertop — Premium (per sqft)', hrs:0.4, time:'per sqft', diff:'Hard',
    desc:'Premium quartz install with waterfall edge available. Priced per sqft.',
    mats:[['N043',1]] },
  { cat:'reno_kit_ct', tag:'Countertops', n:'Butcher Block Countertop (per sqft)', hrs:0.3, time:'per sqft', diff:'Moderate',
    desc:'Install butcher-block countertop. Includes seal and oil finish. Priced per sqft.',
    mats:[['N041',1]] },
  { cat:'reno_kit_ct', tag:'Countertops', n:'Undermount Kitchen Sink Install', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install undermount stainless steel kitchen sink with clips, sealant, and disposal-ready drain. Faucet install separate.',
    mats:[['N046',1],['N361',1]] },
  { cat:'reno_kit_ct', tag:'Countertops', n:'Farmhouse Apron-Front Sink Install', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Install fireclay farmhouse sink. Includes cabinet mods for apron support, custom brackets, and sink mount.',
    mats:[['N047',1],['N362',2]] },
  { cat:'reno_kit_ct', tag:'Countertops', n:'Pull-Down Kitchen Faucet Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install customer-selected pull-down kitchen faucet. Includes supply lines and shut-off verification.',
    mats:[['N048',1]] },

  // Backsplash
  { cat:'reno_kit_bs', tag:'Backsplash', n:'Backsplash Install — Subway Tile (per sqft)', hrs:0.35, time:'per sqft', diff:'Moderate',
    desc:'Install ceramic subway tile backsplash. Includes prep, layout, cuts around outlets, thinset, and grout. Priced per sqft of backsplash.',
    mats:[['N060',1],['N064',0.05],['N146',0.02]] },
  { cat:'reno_kit_bs', tag:'Backsplash', n:'Backsplash Install — Herringbone Marble (per sqft)', hrs:0.55, time:'per sqft', diff:'Hard',
    desc:'Install herringbone marble mosaic backsplash. Higher complexity: sheet layout, extra cuts, careful grouting.',
    mats:[['N062',1],['N064',0.05],['N146',0.03]] },
  { cat:'reno_kit_bs', tag:'Backsplash', n:'Backsplash Install — Glass Mosaic (per sqft)', hrs:0.45, time:'per sqft', diff:'Moderate',
    desc:'Install glass mosaic sheet backsplash. Priced per sqft.',
    mats:[['N061',1],['N064',0.05],['N146',0.03]] },
  { cat:'reno_kit_bs', tag:'Backsplash', n:'Peel-and-Stick Backsplash (per sqft)', hrs:0.15, time:'per sqft', diff:'Easy',
    desc:'Install budget-friendly peel-and-stick backsplash. Priced per sqft.',
    mats:[['N063',1]] },

  // Appliances
  { cat:'reno_kit_appl', tag:'Appliances', n:'Range Hood Ducted Install', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Install customer-supplied ducted range hood. Includes 6" duct run up to 10 ft, roof or wall termination cap, and electrical hookup.',
    mats:[['N086',1],['N081',1]] },
  { cat:'reno_kit_appl', tag:'Appliances', n:'Range Hood Ductless Install', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Install customer-supplied ductless / recirculating range hood.',
    mats:[['N080',1]] },
  { cat:'reno_kit_appl', tag:'Appliances', n:'Dishwasher Install (with air gap)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install customer-supplied dishwasher with new supply, drain, and air gap. Level and secure.',
    mats:[['N082',1],['N085',1]] },
  { cat:'reno_kit_appl', tag:'Appliances', n:'Garbage Disposal Install / Replace', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install 3/4 HP garbage disposal with electrical and drain tie-in.',
    mats:[['N083',1]] },
  { cat:'reno_kit_appl', tag:'Appliances', n:'Range / Oven Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install customer-supplied electric or gas range. Includes anti-tip bracket and gas leak check if applicable.',
    mats:[['N084',1]] },

  // Packages
  { cat:'reno_kit_pkg', tag:'Package', n:'Small Kitchen Refresh Package', hrs:60, time:'~2 weeks', diff:'Hard',
    desc:'Cabinet refacing + new quartz counters + subway backsplash + new sink/faucet + paint. No layout changes. Customer keeps existing flooring & appliances. Great for cost-conscious refreshes.',
    mats:[['N048',1],['N046',1],['N042',30],['N060',30],['N064',1],['N221',2]] },
  { cat:'reno_kit_pkg', tag:'Package', n:'Mid-Range Kitchen Remodel', hrs:120, time:'~4 weeks', diff:'Complex',
    desc:'Full 10x10 cabinet replacement (stock shaker) + quartz counters + tile backsplash + new sink/faucet + new LVP flooring + paint + lighting. Standard layout.',
    mats:[['N019',1],['N042',35],['N048',1],['N046',1],['N060',30],['N160',180],['N221',2],['N240',6]] },
  { cat:'reno_kit_pkg', tag:'Package', n:'Full Kitchen Remodel — Custom', hrs:200, time:'~6 weeks', diff:'Complex',
    desc:'Custom cabinet package + premium quartz + specialty backsplash + farmhouse sink + premium hardwood flooring + full trim + custom lighting. Includes minor layout changes and pantry addition.',
    mats:[['N020',1],['N043',40],['N049',1],['N047',1],['N062',30],['N017',1],['N161',180],['N221',3],['N242',1],['N241',3]] },

  // Shared category tasks used inside kitchen sub-book
  { cat:'reno_floor', tag:'Flooring', n:'LVP Install — Rigid Core (per sqft)', hrs:0.06, time:'per sqft', diff:'Moderate',
    desc:'Rigid-core LVP install over prepared subfloor. Includes underlayment and transitions. Priced per sqft.',
    mats:[['N160',1],['N169',0.01]] },
  { cat:'reno_paint', tag:'Paint', n:'Kitchen Prime + 2-Coat (walls, per sqft)', hrs:0.02, time:'per sqft', diff:'Easy',
    desc:'Prime and 2-coat interior paint on kitchen walls. Priced per sqft of wall area.',
    mats:[['N220',0.005],['N221',0.008]] },
  { cat:'reno_light', tag:'Lighting', n:'Recessed Cans (per 6, kitchen)', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Install six 6" LED canless recessed lights in a kitchen ceiling with dimmer at wall switch. Includes standard wire runs.',
    mats:[['N240',6]] },
];

// ── BATHROOM tasks ─────────────────────────────────────────────────────────
const BATHROOM_TASKS = [
  // Shower / tub
  { cat:'reno_bath_shower', tag:'Shower', n:'Tub-to-Shower Conversion — Acrylic Kit', hrs:16, time:'2 days', diff:'Hard',
    desc:'Remove existing tub and install acrylic shower base + surround. Plumbing tie-in, valve upgrade, and door install. Great mid-range conversion.',
    mats:[['N114',1],['N113',1],['N118',1],['N116',1]] },
  { cat:'reno_bath_shower', tag:'Shower', n:'Tub-to-Shower Conversion — Custom Tile', hrs:32, time:'4 days', diff:'Complex',
    desc:'Full custom tiled shower conversion. Includes Kerdi waterproofing, custom tile up to 8x4 wall area, niche, curbless base, and frameless door.',
    mats:[['N115',1],['N118',1],['N117',1],['N142',60],['N143',1],['N144',60],['N145',20],['N147',3],['N146',2]] },
  { cat:'reno_bath_shower', tag:'Tub', n:'Alcove Tub Replacement — Acrylic', hrs:8, time:'8 hr', diff:'Hard',
    desc:'Replace existing tub with new 60" alcove acrylic tub. Includes 3-piece surround, valve upgrade, and plumbing tie-in.',
    mats:[['N110',1],['N113',1],['N118',1]] },
  { cat:'reno_bath_shower', tag:'Tub', n:'Free-Standing Soaker Tub Install', hrs:12, time:'12 hr', diff:'Complex',
    desc:'Install customer-selected free-standing soaker tub. Includes floor-mount tub filler rough-in, level pad, and plumbing tie-in.',
    mats:[['N111',1],['N119',1]] },
  { cat:'reno_bath_shower', tag:'Tub', n:'Drop-in Tub with Tile Deck', hrs:14, time:'~2 days', diff:'Complex',
    desc:'Install drop-in tub with framed tile deck. Includes support framing, waterproofing, tile deck (12 sqft), and plumbing tie-in.',
    mats:[['N112',1],['N142',12],['N144',12],['N118',1]] },

  // Vanity & fixtures
  { cat:'reno_bath_van', tag:'Vanity', n:'Vanity Replacement — 30"', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Remove existing vanity, install new 30" vanity with top. Reconnect plumbing, secure to wall.',
    mats:[['N100',1],['N105',1]] },
  { cat:'reno_bath_van', tag:'Vanity', n:'Vanity Replacement — 60" Double',  hrs:5, time:'5 hr', diff:'Hard',
    desc:'Install 60" double-sink vanity. Includes two faucets and dual drain plumbing.',
    mats:[['N103',1],['N104',2]] },
  { cat:'reno_bath_van', tag:'Vanity', n:'Vessel Sink Vanity Install', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Install vessel-style sink vanity with taller wall-mount faucet. Includes drain adaptation.',
    mats:[['N102',1],['N106',1],['N104',1]] },
  { cat:'reno_bath_van', tag:'Toilet', n:'Toilet Replacement — Standard 2pc', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Replace toilet with standard 2-piece model. New wax ring, supply, and level to floor.',
    mats:[['N120',1]] },
  { cat:'reno_bath_van', tag:'Toilet', n:'Toilet Replacement — Comfort Height', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Comfort-height elongated toilet swap.',
    mats:[['N121',1]] },
  { cat:'reno_bath_van', tag:'Fixtures', n:'Mirror + Light Bar + Accessories Set', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Install mirror, LED light bar, and coordinated towel bar / TP holder set. Priced as a matched package.',
    mats:[['N124',1],['N244',1],['N125',1]] },
  { cat:'reno_bath_van', tag:'Fixtures', n:'Bath Exhaust Fan w/ Light (110 CFM)', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Install bath exhaust fan with integrated light. Vent to exterior. Includes new switch.',
    mats:[['N126',1]] },

  // Tile & waterproofing
  { cat:'reno_bath_tile', tag:'Wall Tile', n:'Bath Wall Tile — Subway (per sqft)', hrs:0.4, time:'per sqft', diff:'Moderate',
    desc:'Install ceramic subway wall tile with waterproofing on shower or tub surround walls. Priced per sqft.',
    mats:[['N141',1],['N144',1],['N147',0.02],['N146',0.02]] },
  { cat:'reno_bath_tile', tag:'Wall Tile', n:'Bath Wall Tile — Large Format 12x24 (per sqft)', hrs:0.5, time:'per sqft', diff:'Hard',
    desc:'Install large-format 12x24 wall tile. Requires laser leveling, back-buttering, and careful lippage control.',
    mats:[['N142',1],['N144',1],['N147',0.02],['N146',0.02]] },
  { cat:'reno_bath_tile', tag:'Floor Tile', n:'Bath Floor Tile — Porcelain (per sqft)', hrs:0.35, time:'per sqft', diff:'Moderate',
    desc:'Install porcelain 12x24 bath floor tile with waterproof underlayment. Priced per sqft.',
    mats:[['N164',1],['N147',0.02],['N146',0.02]] },
  { cat:'reno_bath_tile', tag:'Floor Tile', n:'Heated Bath Floor Add-On (per 30 sqft)', hrs:4, time:'4 hr', diff:'Hard',
    desc:'Add electric radiant heat mat under bath floor tile. Includes thermostat install and dedicated circuit.',
    mats:[['N168',1]] },
  { cat:'reno_bath_tile', tag:'Waterproofing', n:'Kerdi Shower Waterproofing (per sqft)', hrs:0.15, time:'per sqft', diff:'Moderate',
    desc:'Full Kerdi (or equivalent) waterproofing membrane install on shower walls/floor prior to tile.',
    mats:[['N144',1]] },
  { cat:'reno_bath_tile', tag:'Tile Detail', n:'Shower Niche — Recessed', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install pre-formed recessed shower niche. Includes framing mods, waterproofing, and tile prep.',
    mats:[['N143',1]] },

  // Packages
  { cat:'reno_bath_pkg', tag:'Package', n:'Powder Bath Refresh', hrs:20, time:'~1 week', diff:'Moderate',
    desc:'Vanity + toilet + mirror + paint refresh in a half-bath. Existing plumbing rough-in.',
    mats:[['N100',1],['N120',1],['N123',1],['N221',1]] },
  { cat:'reno_bath_pkg', tag:'Package', n:'Full Bath Remodel — Mid-Range', hrs:80, time:'~3 weeks', diff:'Complex',
    desc:'Full hall bath remodel: acrylic tub/surround, new tile floor + wainscoting, vanity 36", toilet, mirror + lighting, paint. Existing plumbing rough-in preserved.',
    mats:[['N110',1],['N113',1],['N118',1],['N101',1],['N120',1],['N124',1],['N244',1],['N164',50],['N141',30],['N221',1]] },
  { cat:'reno_bath_pkg', tag:'Package', n:'Master Bath Remodel — Premium', hrs:160, time:'~5 weeks', diff:'Complex',
    desc:'Premium master remodel: free-standing soaker tub, curbless tile shower with niche + frameless door, 60" double vanity with quartz, heated floor, custom tile, premium fixtures throughout.',
    mats:[['N111',1],['N115',1],['N117',1],['N119',2],['N103',1],['N104',2],['N121',1],['N142',80],['N144',80],['N164',60],['N168',2],['N244',1],['N124',1]] },

  // Shared
  { cat:'reno_paint', tag:'Paint', n:'Bath Paint Package (walls + ceiling)', hrs:6, time:'6 hr', diff:'Easy',
    desc:'Prime + 2-coat walls, ceiling, and trim in a typical bath. Includes moisture-resistant paint.',
    mats:[['N220',0.25],['N221',0.5],['N223',0.25]] },
  { cat:'reno_light', tag:'Lighting', n:'Bath Vanity Light + Recessed Combo', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install LED vanity light + 2 recessed cans over shower / tub area. Includes dimmer switch.',
    mats:[['N244',1],['N240',2]] },
];

// ── HOME tasks (whole-home remodels, additions, exterior) ──────────────────
const HOME_TASKS = [
  // Framing / structural
  { cat:'reno_wh_frame', tag:'Framing', n:'Interior Wall Framing (per LF)', hrs:0.5, time:'per LF', diff:'Moderate',
    desc:'Frame new non-load-bearing interior wall with 2x4 studs, top/bottom plate. Priced per LF of wall.',
    mats:[['N260',1.5],['N267',0.1]] },
  { cat:'reno_wh_frame', tag:'Framing', n:'Load-Bearing Wall Removal + LVL Header', hrs:16, time:'2 days', diff:'Complex',
    desc:'Remove existing load-bearing wall and install engineered LVL header with temporary shoring during work. Per typical 12ft opening.',
    mats:[['N263',3],['N261',6],['N269',6]] },
  { cat:'reno_wh_frame', tag:'Framing', n:'Subfloor Repair / Replacement (per sqft)', hrs:0.08, time:'per sqft', diff:'Moderate',
    desc:'Cut out damaged subfloor and replace with 3/4" T&G plywood, screwed and glued. Per sqft.',
    mats:[['N266',0.032],['N268',0.02]] },
  { cat:'reno_wh_frame', tag:'Framing', n:'Deck Framing — PT (per sqft)', hrs:0.15, time:'per sqft', diff:'Moderate',
    desc:'Pressure-treated deck joist framing on existing footings. Per sqft of deck.',
    mats:[['N261',0.15],['N262',0.05],['N267',0.05]] },

  // Doors & windows
  { cat:'reno_wh_dw', tag:'Doors', n:'Interior Door R&R — Solid Core', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Remove existing interior door + jamb and install new pre-hung solid-core door with hardware. Per unit.',
    mats:[['N180',1]] },
  { cat:'reno_wh_dw', tag:'Doors', n:'Interior Barn Door Install', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install customer-selected barn door with hardware kit and backer board mounting. Per unit.',
    mats:[['N181',1]] },
  { cat:'reno_wh_dw', tag:'Doors', n:'Exterior Fiberglass Door R&R', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Replace exterior door with new fiberglass pre-hung including threshold, weatherstripping, and paint prep.',
    mats:[['N183',1]] },
  { cat:'reno_wh_dw', tag:'Doors', n:'Sliding Patio Door Install (6ft)', hrs:8, time:'8 hr', diff:'Hard',
    desc:'Install customer-selected 6ft vinyl sliding patio door. Includes header verification, flashing, and paint-ready trim.',
    mats:[['N185',1]] },
  { cat:'reno_wh_dw', tag:'Windows', n:'Vinyl Window Replacement — 36×48', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Replace existing window with new vinyl double-hung Low-E 36×48. Includes wrap-and-trim install and paint prep.',
    mats:[['N186',1]] },
  { cat:'reno_wh_dw', tag:'Windows', n:'Vinyl Window Replacement — 48×48', hrs:3.5, time:'3.5 hr', diff:'Moderate',
    desc:'Same as above for larger 48×48 opening.',
    mats:[['N187',1]] },
  { cat:'reno_wh_dw', tag:'Windows', n:'Egress Window Install (basement)', hrs:16, time:'2 days', diff:'Complex',
    desc:'Cut basement wall and install egress window with well and ladder kit. Includes framing, waterproofing, and gravel bed.',
    mats:[['N189',1]] },
  { cat:'reno_wh_dw', tag:'Windows', n:'Bay Window Install (6ft)', hrs:20, time:'2.5 days', diff:'Complex',
    desc:'Install bay window in existing opening or in new framed opening. Includes exterior sealing, interior trim, and shelf.',
    mats:[['N188',1]] },

  // Roofing & siding
  { cat:'reno_wh_roof', tag:'Roofing', n:'Asphalt Shingle Roof — Full Tear-Off (per sqft)', hrs:0.08, time:'per sqft', diff:'Hard',
    desc:'Tear off existing shingles down to deck, install synthetic underlayment, drip edge, ice & water shield at eaves, and architectural shingles. Priced per sqft of roof.',
    mats:[['N300',1],['N302',1],['N303',0.1],['N304',0.01],['N306',0.05]] },
  { cat:'reno_wh_roof', tag:'Roofing', n:'Metal Standing-Seam Roof (per sqft)', hrs:0.18, time:'per sqft', diff:'Complex',
    desc:'Install standing-seam metal roof. Higher labor and specialized fasteners. Priced per sqft.',
    mats:[['N301',1],['N302',1]] },
  { cat:'reno_wh_roof', tag:'Roofing', n:'Roof Patch (up to 8 sqft)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Repair a localized area of failed shingles up to 8 sqft. Includes matching shingles, felt, and seal.',
    mats:[['N300',12],['N303',5]] },
  { cat:'reno_wh_roof', tag:'Siding', n:'Vinyl Siding Install (per sqft)', hrs:0.08, time:'per sqft', diff:'Moderate',
    desc:'Install vinyl siding over house wrap. Priced per sqft of siding installed.',
    mats:[['N310',1],['N313',1]] },
  { cat:'reno_wh_roof', tag:'Siding', n:'Fiber Cement Siding Install (per sqft)', hrs:0.15, time:'per sqft', diff:'Hard',
    desc:'Install fiber cement siding (HardiePlank) over house wrap. Priced per sqft.',
    mats:[['N311',1],['N313',1]] },
  { cat:'reno_wh_roof', tag:'Siding', n:'LP SmartSide Install (per sqft)', hrs:0.13, time:'per sqft', diff:'Moderate',
    desc:'Install LP SmartSide engineered wood siding. Priced per sqft.',
    mats:[['N312',1],['N313',1]] },

  // Decks & outdoor
  { cat:'reno_wh_deck', tag:'Deck', n:'Composite Deck — Mid-Grade (per sqft)', hrs:0.25, time:'per sqft', diff:'Hard',
    desc:'Install mid-grade composite decking on prepared framing. Includes hidden fasteners. Priced per sqft of decking.',
    mats:[['N330',1],['N333',0.02]] },
  { cat:'reno_wh_deck', tag:'Deck', n:'Composite Deck — Premium w/ Fascia (per sqft)', hrs:0.32, time:'per sqft', diff:'Hard',
    desc:'Premium composite decking with matched picture-frame and fascia. Priced per sqft.',
    mats:[['N331',1],['N333',0.02]] },
  { cat:'reno_wh_deck', tag:'Deck', n:'Pressure-Treated Deck (per sqft)', hrs:0.15, time:'per sqft', diff:'Moderate',
    desc:'Install pressure-treated 5/4 deck boards. Priced per sqft. Stain optional.',
    mats:[['N332',3],['N267',0.05]] },
  { cat:'reno_wh_deck', tag:'Deck', n:'Aluminum Deck Rail (per LF)', hrs:0.5, time:'per LF', diff:'Moderate',
    desc:'Install aluminum deck rail system. Priced per LF of railing.',
    mats:[['N334',0.17]] },
  { cat:'reno_wh_deck', tag:'Deck', n:'Composite Rail (per LF)', hrs:0.6, time:'per LF', diff:'Moderate',
    desc:'Install composite deck railing system. Priced per LF.',
    mats:[['N335',0.17]] },
  { cat:'reno_wh_deck', tag:'Deck', n:'Deck Stain / Seal (per sqft)', hrs:0.02, time:'per sqft', diff:'Easy',
    desc:'Clean, prep, and apply stain / seal to existing PT deck. Priced per sqft.',
    mats:[['N338',0.005]] },

  // Additions
  { cat:'reno_wh_extra', tag:'Addition', n:'Bump-Out Addition — 8x10', hrs:200, time:'6-8 weeks', diff:'Complex',
    desc:'Small 8x10 bump-out addition. Includes footings, framing, sheathing, siding, roofing, windows, insulation, drywall, and interior finish to paint-ready. Kitchen/bath scope separate.',
    mats:[['N260',60],['N262',20],['N263',2],['N264',12],['N266',10],['N186',2],['N183',0],['N310',300],['N313',300],['N300',150],['N302',150],['N284',80],['N280',60],['N283',3],['N269',20]] },
  { cat:'reno_wh_extra', tag:'Addition', n:'Garage Conversion to Living Space', hrs:120, time:'4-6 weeks', diff:'Complex',
    desc:'Convert garage to conditioned living space. Insulation upgrade, drywall, flooring, HVAC extension, electrical convert, window in place of overhead door.',
    mats:[['N284',400],['N285',200],['N280',60],['N283',5],['N186',2],['N160',400]] },
  { cat:'reno_wh_extra', tag:'ADU', n:'Detached ADU — 400 sqft turnkey', hrs:600, time:'12-16 weeks', diff:'Complex',
    desc:'Turnkey 400-sqft detached accessory dwelling unit. Foundation, framing, exterior, kitchenette, bath, all utilities. Base pricing — customizable.',
    mats:[['N019',1],['N100',1],['N120',1],['N110',1],['N186',4],['N183',1],['N310',600],['N300',450],['N280',80],['N260',150]] },

  // Shared category tasks used inside home sub-book
  { cat:'reno_floor', tag:'Flooring', n:'Hardwood Wide-Plank Install (per sqft)', hrs:0.12, time:'per sqft', diff:'Hard',
    desc:'Install engineered wide-plank hardwood over prepared subfloor. Priced per sqft.',
    mats:[['N161',1]] },
  { cat:'reno_floor', tag:'Flooring', n:'Solid Hardwood Site-Finish (per sqft)', hrs:0.2, time:'per sqft', diff:'Hard',
    desc:'Install unfinished solid oak, sand, stain, and finish on-site. Priced per sqft.',
    mats:[['N162',1]] },
  { cat:'reno_paint', tag:'Paint', n:'Whole-Room Paint Package (per 100 sqft wall)', hrs:2.5, time:'2.5 hr per 100 sqft', diff:'Easy',
    desc:'Prime + 2-coat walls, 2-coat ceiling, brush all trim/doors. Priced per 100 sqft of wall area.',
    mats:[['N220',0.03],['N221',0.05],['N223',0.02],['N224',0.02]] },
  { cat:'reno_paint', tag:'Paint', n:'Exterior Paint (per sqft)', hrs:0.03, time:'per sqft', diff:'Moderate',
    desc:'Power wash, prep, and 2-coat exterior paint. Priced per sqft of wall.',
    mats:[['N225',0.008]] },
  { cat:'reno_trim', tag:'Trim', n:'Baseboard MDF 5-1/4 Install (per LF)', hrs:0.14, time:'per LF', diff:'Easy',
    desc:'Install MDF baseboard with mitered corners and caulking. Priced per LF.',
    mats:[['N200',1],['N360',0.05]] },
  { cat:'reno_trim', tag:'Trim', n:'Wainscoting Install (per sqft wall)', hrs:0.2, time:'per sqft', diff:'Moderate',
    desc:'Install wainscoting panel to wainscot height with cap rail. Priced per sqft of wall covered.',
    mats:[['N204',0.03]] },
  { cat:'reno_light', tag:'Lighting', n:'Recessed Cans (per 6)', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Install six 6" LED canless recessed lights in a room ceiling. Includes dimmer switch.',
    mats:[['N240',6]] },
  { cat:'reno_light', tag:'Lighting', n:'Chandelier Install (up to 40 lb)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Install customer-supplied chandelier or pendant fixture up to 40 lb on suitable box.',
    mats:[['N242',1]] },
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

    // Bump hours column to NUMERIC(7,2) — some renovation package tasks
    // clock in at 100+ hours (bump-outs, ADUs). Original NUMERIC(4,2) cap
    // was 99.99. Idempotent.
    console.log('→ ALTER pb_tasks.hours → NUMERIC(7,2)');
    await db.query(`ALTER TABLE pb_tasks ALTER COLUMN hours TYPE NUMERIC(7,2)`);

    console.log('→ Clearing existing renovation data');
    await db.query(
      `DELETE FROM pb_task_materials
        WHERE task_id IN (SELECT id FROM pb_tasks WHERE service = 'renovations')`
    );
    await db.query(`DELETE FROM pb_tasks       WHERE service = 'renovations'`);
    await db.query(`DELETE FROM pb_materials   WHERE service = 'renovations'`);
    await db.query(`DELETE FROM pb_categories  WHERE service = 'renovations'`);
    await db.query(`DELETE FROM pb_engine      WHERE service = 'renovations'`);

    // Seed 3 engines
    console.log('→ Seeding renovations engines (kitchen, bathroom, home)');
    for (const st of ['kitchen', 'bathroom', 'home']) {
      await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ('renovations', $1, 32, 0, 0, 0, 20, 8, 3,
                 1600, 7.65, 2.5, 8, 0, 0, 0, 0, 0, 0,
                 1, 1600, 0, $2::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [st, JSON.stringify(DEFAULT_OH)]
      );
    }

    console.log(`→ Inserting ${Object.keys(MATS).length} renovation materials`);
    for (const [id, m] of Object.entries(MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,'renovations')`,
        [id, m.d, m.u, m.c, m.cat]
      );
    }

    console.log(`→ Inserting renovation categories`);
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      for (const t of c.subBooks) {
        await db.query(
          `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'renovations',$7)
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
           VALUES ($1,$2,$3,$4,$5,$6,'',$7,'renovations',$8) RETURNING id`,
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
    const kLinks = await insertBucket(KITCHEN_TASKS, 'kitchen',  'kitchen');
    const bLinks = await insertBucket(BATHROOM_TASKS,'bathroom', 'bathroom');
    const hLinks = await insertBucket(HOME_TASKS,    'home',     'home');
    console.log(`  → material links: kitchen=${kLinks}, bathroom=${bLinks}, home=${hLinks}`);

    console.log('→ Enabling renovations in company_settings');
    await db.query(`
      INSERT INTO company_settings (id, service_renovations)
      VALUES ('main', true)
      ON CONFLICT (id) DO UPDATE SET service_renovations = true
    `);

    await db.query('COMMIT');
    console.log('✓ Migration 008 complete.');

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

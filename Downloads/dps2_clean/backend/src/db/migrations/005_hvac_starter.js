'use strict';
/**
 * Migration 005: Seed the HVAC pricebook (Install + Service).
 *
 * Creates:
 *   - ~130 HVAC materials (id prefix H001…)
 *   - 8 shared categories (ac, furn, hp, mini, dt, iaq) + 2 service-only (diag, maint)
 *   - ~40 install tasks + ~50 service tasks
 *
 * All rows are tagged service='hvac' with service_type='install' or 'service'.
 * Depends on 004 having run (adds the service/service_type columns).
 *
 * Idempotent-ish: clears existing HVAC rows before insert. Leaves plumbing alone.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/005_hvac_starter.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

// ── Materials (H001…) ──────────────────────────────────────────────────────
const MATS = {
  // Refrigerant
  H001: { d: 'R-410A Refrigerant (per lb)',           u: 'LB',  c: 8.50,   cat: 'Refrigerant' },
  H002: { d: 'R-32 Refrigerant (per lb)',             u: 'LB',  c: 12.00,  cat: 'Refrigerant' },
  H003: { d: 'R-22 Refrigerant (per lb)',             u: 'LB',  c: 55.00,  cat: 'Refrigerant' },
  H004: { d: 'Nitrogen (tank rental & fill)',         u: 'EA',  c: 25.00,  cat: 'Refrigerant' },

  // AC Condensers (outdoor units)
  H010: { d: '2.0 Ton 14.3 SEER2 A/C Condenser',      u: 'EA',  c: 1450.00, cat: 'Condensers' },
  H011: { d: '2.5 Ton 14.3 SEER2 A/C Condenser',      u: 'EA',  c: 1620.00, cat: 'Condensers' },
  H012: { d: '3.0 Ton 14.3 SEER2 A/C Condenser',      u: 'EA',  c: 1780.00, cat: 'Condensers' },
  H013: { d: '3.5 Ton 14.3 SEER2 A/C Condenser',      u: 'EA',  c: 1950.00, cat: 'Condensers' },
  H014: { d: '4.0 Ton 14.3 SEER2 A/C Condenser',      u: 'EA',  c: 2180.00, cat: 'Condensers' },
  H015: { d: '5.0 Ton 14.3 SEER2 A/C Condenser',      u: 'EA',  c: 2450.00, cat: 'Condensers' },
  H016: { d: '3.0 Ton 16 SEER2 A/C Condenser (2-stage)', u: 'EA', c: 2350.00, cat: 'Condensers' },
  H017: { d: '3.0 Ton 18 SEER2 A/C Condenser (variable)',u: 'EA', c: 3450.00, cat: 'Condensers' },

  // Air Handlers / Coils
  H020: { d: '2.0 Ton Cased Evaporator Coil',         u: 'EA',  c: 620.00,  cat: 'Coils' },
  H021: { d: '2.5 Ton Cased Evaporator Coil',         u: 'EA',  c: 680.00,  cat: 'Coils' },
  H022: { d: '3.0 Ton Cased Evaporator Coil',         u: 'EA',  c: 740.00,  cat: 'Coils' },
  H023: { d: '3.5 Ton Cased Evaporator Coil',         u: 'EA',  c: 820.00,  cat: 'Coils' },
  H024: { d: '4.0 Ton Cased Evaporator Coil',         u: 'EA',  c: 920.00,  cat: 'Coils' },
  H025: { d: '5.0 Ton Cased Evaporator Coil',         u: 'EA',  c: 1080.00, cat: 'Coils' },
  H026: { d: '3.0 Ton Air Handler (multi-speed)',     u: 'EA',  c: 1150.00, cat: 'Air Handlers' },
  H027: { d: '4.0 Ton Air Handler (variable ECM)',    u: 'EA',  c: 1780.00, cat: 'Air Handlers' },

  // Furnaces
  H030: { d: '60k BTU 80% AFUE Gas Furnace',          u: 'EA',  c: 1150.00, cat: 'Furnaces' },
  H031: { d: '80k BTU 80% AFUE Gas Furnace',          u: 'EA',  c: 1280.00, cat: 'Furnaces' },
  H032: { d: '100k BTU 80% AFUE Gas Furnace',         u: 'EA',  c: 1450.00, cat: 'Furnaces' },
  H033: { d: '80k BTU 96% AFUE Gas Furnace',          u: 'EA',  c: 1850.00, cat: 'Furnaces' },
  H034: { d: '100k BTU 96% AFUE Gas Furnace (2-stage)',u: 'EA', c: 2350.00, cat: 'Furnaces' },
  H035: { d: '120k BTU 96% AFUE Modulating Furnace',  u: 'EA',  c: 3150.00, cat: 'Furnaces' },
  H036: { d: 'Electric Furnace 15kW',                 u: 'EA',  c: 780.00,  cat: 'Furnaces' },
  H037: { d: 'Electric Furnace 20kW',                 u: 'EA',  c: 920.00,  cat: 'Furnaces' },

  // Heat Pumps
  H040: { d: '2.0 Ton 14.3 SEER2 Heat Pump',          u: 'EA',  c: 1780.00, cat: 'Heat Pumps' },
  H041: { d: '3.0 Ton 14.3 SEER2 Heat Pump',          u: 'EA',  c: 2280.00, cat: 'Heat Pumps' },
  H042: { d: '4.0 Ton 14.3 SEER2 Heat Pump',          u: 'EA',  c: 2680.00, cat: 'Heat Pumps' },
  H043: { d: '3.0 Ton 16 SEER2 Heat Pump (2-stage)',  u: 'EA',  c: 2950.00, cat: 'Heat Pumps' },
  H044: { d: '3.0 Ton 20 SEER2 Heat Pump (variable)', u: 'EA',  c: 4150.00, cat: 'Heat Pumps' },

  // Mini-Splits
  H050: { d: '9k BTU Mini-Split (single-zone 20 SEER)', u: 'EA', c: 850.00,  cat: 'Mini-Splits' },
  H051: { d: '12k BTU Mini-Split (single-zone 20 SEER)',u: 'EA', c: 980.00,  cat: 'Mini-Splits' },
  H052: { d: '18k BTU Mini-Split (single-zone 20 SEER)',u: 'EA', c: 1250.00, cat: 'Mini-Splits' },
  H053: { d: '24k BTU Mini-Split (single-zone 20 SEER)',u: 'EA', c: 1580.00, cat: 'Mini-Splits' },
  H054: { d: '36k BTU Multi-Zone Head (24k+12k)',     u: 'EA',  c: 2280.00, cat: 'Mini-Splits' },
  H055: { d: 'Mini-Split Line Set Cover 8ft',         u: 'EA',  c: 45.00,   cat: 'Mini-Splits' },
  H056: { d: 'Mini-Split Wall Bracket',               u: 'EA',  c: 65.00,   cat: 'Mini-Splits' },

  // Ductwork
  H060: { d: '6" Insulated Flex Duct (25 ft)',        u: 'EA',  c: 42.00,   cat: 'Ductwork' },
  H061: { d: '8" Insulated Flex Duct (25 ft)',        u: 'EA',  c: 55.00,   cat: 'Ductwork' },
  H062: { d: '10" Insulated Flex Duct (25 ft)',       u: 'EA',  c: 72.00,   cat: 'Ductwork' },
  H063: { d: '12" Insulated Flex Duct (25 ft)',       u: 'EA',  c: 95.00,   cat: 'Ductwork' },
  H064: { d: '14" Insulated Flex Duct (25 ft)',       u: 'EA',  c: 120.00,  cat: 'Ductwork' },
  H065: { d: '16" Insulated Flex Duct (25 ft)',       u: 'EA',  c: 148.00,  cat: 'Ductwork' },
  H066: { d: 'Sheet Metal Trunk 20"x8" (per ft)',     u: 'LF',  c: 12.50,   cat: 'Ductwork' },
  H067: { d: 'Return Air Plenum (16x25)',             u: 'EA',  c: 45.00,   cat: 'Ductwork' },
  H068: { d: 'Supply Boot 4x10 (side takeoff)',       u: 'EA',  c: 14.00,   cat: 'Ductwork' },
  H069: { d: 'Supply Boot 6x12',                      u: 'EA',  c: 18.00,   cat: 'Ductwork' },
  H070: { d: 'Register 4x10 (steel)',                 u: 'EA',  c: 12.00,   cat: 'Ductwork' },
  H071: { d: 'Register 6x12 (steel)',                 u: 'EA',  c: 15.00,   cat: 'Ductwork' },
  H072: { d: 'Return Grille 16x25',                   u: 'EA',  c: 24.00,   cat: 'Ductwork' },
  H073: { d: 'Return Grille 20x25',                   u: 'EA',  c: 32.00,   cat: 'Ductwork' },
  H074: { d: 'Duct Board 1.5" (48"x120")',            u: 'EA',  c: 58.00,   cat: 'Ductwork' },
  H075: { d: 'Duct Mastic 1gal',                      u: 'EA',  c: 22.00,   cat: 'Ductwork' },
  H076: { d: 'Foil Duct Tape 3" (roll)',              u: 'EA',  c: 14.00,   cat: 'Ductwork' },
  H077: { d: 'Duct Strap 3/4" (100ft roll)',          u: 'EA',  c: 18.00,   cat: 'Ductwork' },

  // Copper Line Sets
  H080: { d: 'Copper Line Set 1/4"x3/8" (25 ft)',     u: 'EA',  c: 85.00,   cat: 'Line Sets' },
  H081: { d: 'Copper Line Set 3/8"x5/8" (25 ft)',     u: 'EA',  c: 125.00,  cat: 'Line Sets' },
  H082: { d: 'Copper Line Set 3/8"x3/4" (25 ft)',     u: 'EA',  c: 150.00,  cat: 'Line Sets' },
  H083: { d: 'Copper Line Set 3/8"x7/8" (25 ft)',     u: 'EA',  c: 180.00,  cat: 'Line Sets' },
  H084: { d: 'Armaflex 3/8" Line Insulation (6ft)',   u: 'EA',  c: 12.00,   cat: 'Line Sets' },
  H085: { d: 'Armaflex 5/8" Line Insulation (6ft)',   u: 'EA',  c: 14.00,   cat: 'Line Sets' },
  H086: { d: 'Armaflex 3/4" Line Insulation (6ft)',   u: 'EA',  c: 16.00,   cat: 'Line Sets' },

  // Thermostats
  H090: { d: 'Basic Non-Programmable Thermostat',     u: 'EA',  c: 45.00,   cat: 'Thermostats' },
  H091: { d: '7-Day Programmable Thermostat',         u: 'EA',  c: 95.00,   cat: 'Thermostats' },
  H092: { d: 'Ecobee Smart Thermostat Premium',       u: 'EA',  c: 249.00,  cat: 'Thermostats' },
  H093: { d: 'Nest Learning Thermostat 4th Gen',      u: 'EA',  c: 279.00,  cat: 'Thermostats' },
  H094: { d: 'Honeywell T6 Pro Programmable',         u: 'EA',  c: 125.00,  cat: 'Thermostats' },
  H095: { d: 'Thermostat Wire 18/5 (250 ft)',         u: 'EA',  c: 65.00,   cat: 'Thermostats' },
  H096: { d: 'Thermostat Wire 18/8 (250 ft)',         u: 'EA',  c: 85.00,   cat: 'Thermostats' },

  // IAQ (Indoor Air Quality)
  H100: { d: 'Media Filter Cabinet (5-inch)',         u: 'EA',  c: 185.00,  cat: 'IAQ' },
  H101: { d: '16x25x5 MERV 13 Media Filter',          u: 'EA',  c: 42.00,   cat: 'IAQ' },
  H102: { d: '20x25x5 MERV 13 Media Filter',          u: 'EA',  c: 48.00,   cat: 'IAQ' },
  H103: { d: '16x20x1 MERV 11 Filter (12pk)',         u: 'BX',  c: 55.00,   cat: 'IAQ' },
  H104: { d: '16x25x1 MERV 11 Filter (12pk)',         u: 'BX',  c: 62.00,   cat: 'IAQ' },
  H105: { d: '20x25x1 MERV 11 Filter (12pk)',         u: 'BX',  c: 68.00,   cat: 'IAQ' },
  H106: { d: 'UV Air Purifier (single lamp)',         u: 'EA',  c: 285.00,  cat: 'IAQ' },
  H107: { d: 'UV Replacement Lamp',                   u: 'EA',  c: 85.00,   cat: 'IAQ' },
  H108: { d: 'Whole-Home Humidifier (bypass)',        u: 'EA',  c: 285.00,  cat: 'IAQ' },
  H109: { d: 'Whole-Home Humidifier (steam)',         u: 'EA',  c: 950.00,  cat: 'IAQ' },
  H110: { d: 'Humidifier Pad (annual)',               u: 'EA',  c: 28.00,   cat: 'IAQ' },
  H111: { d: 'Whole-Home Dehumidifier 70pt',          u: 'EA',  c: 1450.00, cat: 'IAQ' },
  H112: { d: 'ERV — 150 CFM',                         u: 'EA',  c: 850.00,  cat: 'IAQ' },
  H113: { d: 'HRV — 150 CFM',                         u: 'EA',  c: 780.00,  cat: 'IAQ' },
  H114: { d: 'Electronic Air Cleaner (EAC)',          u: 'EA',  c: 685.00,  cat: 'IAQ' },

  // Electrical / Controls
  H120: { d: 'Dual Run Capacitor 45/5 uF 440V',       u: 'EA',  c: 18.00,   cat: 'Electrical' },
  H121: { d: 'Dual Run Capacitor 55/5 uF 440V',       u: 'EA',  c: 22.00,   cat: 'Electrical' },
  H122: { d: 'Dual Run Capacitor 70/5 uF 440V',       u: 'EA',  c: 28.00,   cat: 'Electrical' },
  H123: { d: 'Single Run Capacitor 7.5 uF 370V',      u: 'EA',  c: 8.00,    cat: 'Electrical' },
  H124: { d: 'Single Run Capacitor 10 uF 370V',       u: 'EA',  c: 9.50,    cat: 'Electrical' },
  H125: { d: 'Contactor 1P 30A 24V',                  u: 'EA',  c: 22.00,   cat: 'Electrical' },
  H126: { d: 'Contactor 2P 30A 24V',                  u: 'EA',  c: 28.00,   cat: 'Electrical' },
  H127: { d: 'Contactor 2P 40A 24V',                  u: 'EA',  c: 32.00,   cat: 'Electrical' },
  H128: { d: 'Hard Start Kit (5-2-1)',                u: 'EA',  c: 45.00,   cat: 'Electrical' },
  H129: { d: 'Fuse 30A / 60A Disconnect',             u: 'EA',  c: 12.00,   cat: 'Electrical' },
  H130: { d: 'AC Disconnect Box 60A',                 u: 'EA',  c: 32.00,   cat: 'Electrical' },
  H131: { d: 'Whip 6" 8AWG (flex conduit)',           u: 'EA',  c: 18.00,   cat: 'Electrical' },
  H132: { d: 'Transformer 40VA 24V',                  u: 'EA',  c: 28.00,   cat: 'Electrical' },
  H133: { d: 'Low-Voltage Wire 18/2 (500 ft)',        u: 'EA',  c: 85.00,   cat: 'Electrical' },

  // Motors / Compressors
  H140: { d: 'Condenser Fan Motor 1/4 HP',            u: 'EA',  c: 145.00,  cat: 'Motors' },
  H141: { d: 'Condenser Fan Motor 1/3 HP',            u: 'EA',  c: 165.00,  cat: 'Motors' },
  H142: { d: 'Condenser Fan Motor 1/2 HP',            u: 'EA',  c: 185.00,  cat: 'Motors' },
  H143: { d: 'Blower Motor 1/2 HP (PSC)',             u: 'EA',  c: 195.00,  cat: 'Motors' },
  H144: { d: 'Blower Motor 3/4 HP (PSC)',             u: 'EA',  c: 245.00,  cat: 'Motors' },
  H145: { d: 'ECM Blower Motor 1/2 HP',               u: 'EA',  c: 385.00,  cat: 'Motors' },
  H146: { d: 'ECM Blower Motor 3/4 HP',               u: 'EA',  c: 445.00,  cat: 'Motors' },
  H147: { d: 'Inducer Motor (90% furnace)',           u: 'EA',  c: 285.00,  cat: 'Motors' },
  H148: { d: 'Compressor 2.5 Ton R-410A',             u: 'EA',  c: 685.00,  cat: 'Compressors' },
  H149: { d: 'Compressor 3.0 Ton R-410A',             u: 'EA',  c: 785.00,  cat: 'Compressors' },
  H150: { d: 'Compressor 4.0 Ton R-410A',             u: 'EA',  c: 985.00,  cat: 'Compressors' },
  H151: { d: 'Compressor 5.0 Ton R-410A',             u: 'EA',  c: 1250.00, cat: 'Compressors' },

  // Ignition / Sensors
  H160: { d: 'Hot Surface Ignitor (universal)',       u: 'EA',  c: 32.00,   cat: 'Ignition' },
  H161: { d: 'Flame Sensor (universal)',              u: 'EA',  c: 18.00,   cat: 'Ignition' },
  H162: { d: 'Pressure Switch (single stage)',        u: 'EA',  c: 45.00,   cat: 'Ignition' },
  H163: { d: 'Gas Valve 24V',                         u: 'EA',  c: 145.00,  cat: 'Ignition' },
  H164: { d: 'Furnace Control Board (universal)',     u: 'EA',  c: 245.00,  cat: 'Ignition' },
  H165: { d: 'Thermocouple 24"',                      u: 'EA',  c: 12.00,   cat: 'Ignition' },
  H166: { d: 'Draft Inducer Gasket',                  u: 'EA',  c: 8.00,    cat: 'Ignition' },

  // Refrigerant System Parts
  H170: { d: 'TXV Valve (thermostatic expansion)',    u: 'EA',  c: 145.00,  cat: 'Refrigerant Parts' },
  H171: { d: 'Filter Drier 1/4"',                     u: 'EA',  c: 12.00,   cat: 'Refrigerant Parts' },
  H172: { d: 'Filter Drier 3/8"',                     u: 'EA',  c: 16.00,   cat: 'Refrigerant Parts' },
  H173: { d: 'Schrader Valve Core (pack of 10)',      u: 'PK',  c: 8.00,    cat: 'Refrigerant Parts' },
  H174: { d: 'Refrigerant Service Cap (pack of 10)',  u: 'PK',  c: 6.00,    cat: 'Refrigerant Parts' },
  H175: { d: 'Service Valve 3/8" (replacement)',      u: 'EA',  c: 55.00,   cat: 'Refrigerant Parts' },
  H176: { d: 'Braze Filler Rod 15% Silver (5-pack)',  u: 'PK',  c: 32.00,   cat: 'Refrigerant Parts' },

  // Condensate
  H180: { d: 'Condensate Pump 20ft lift',             u: 'EA',  c: 85.00,   cat: 'Condensate' },
  H181: { d: 'Condensate Safety Switch',              u: 'EA',  c: 22.00,   cat: 'Condensate' },
  H182: { d: 'Condensate PVC 3/4" (10 ft)',           u: 'EA',  c: 8.00,    cat: 'Condensate' },
  H183: { d: 'Condensate P-Trap 3/4"',                u: 'EA',  c: 8.50,    cat: 'Condensate' },
  H184: { d: 'Condensate Tablets (annual)',           u: 'EA',  c: 12.00,   cat: 'Condensate' },

  // Zoning
  H190: { d: 'Zone Damper 6"',                        u: 'EA',  c: 85.00,   cat: 'Zoning' },
  H191: { d: 'Zone Damper 8"',                        u: 'EA',  c: 105.00,  cat: 'Zoning' },
  H192: { d: 'Zone Damper 10"',                       u: 'EA',  c: 135.00,  cat: 'Zoning' },
  H193: { d: 'Zone Control Panel 2-Zone',             u: 'EA',  c: 285.00,  cat: 'Zoning' },
  H194: { d: 'Zone Control Panel 4-Zone',             u: 'EA',  c: 485.00,  cat: 'Zoning' },

  // Misc / Consumables
  H200: { d: 'Refrigerant Leak Sealant',              u: 'EA',  c: 45.00,   cat: 'Consumables' },
  H201: { d: 'A-Coil Cleaner (foaming)',              u: 'EA',  c: 22.00,   cat: 'Consumables' },
  H202: { d: 'Condenser Coil Cleaner 1gal',           u: 'EA',  c: 32.00,   cat: 'Consumables' },
  H203: { d: 'Refrigerant Oil PVE 8oz',               u: 'EA',  c: 28.00,   cat: 'Consumables' },
  H204: { d: 'Vacuum Pump Oil (quart)',               u: 'EA',  c: 15.00,   cat: 'Consumables' },
  H205: { d: 'Anti-microbial Spray',                  u: 'EA',  c: 22.00,   cat: 'Consumables' },
};

// ── Categories (10) ────────────────────────────────────────────────────────
// Categories shared across install + service, plus a few service-only ones.
const CATEGORIES = [
  { id: 'hvac_ac',    icon: '❄️',  name: 'Air Conditioning',      color: '#2E5FA3', desc: 'Split systems, package units, condensers' },
  { id: 'hvac_furn',  icon: '🔥',  name: 'Furnaces',               color: '#C55A11', desc: 'Gas & electric furnaces' },
  { id: 'hvac_hp',    icon: '♻️',  name: 'Heat Pumps',             color: '#1F7A8C', desc: 'Air-source & dual-fuel heat pumps' },
  { id: 'hvac_mini',  icon: '🌡',  name: 'Mini-Splits',            color: '#5B2D8E', desc: 'Ductless single & multi-zone' },
  { id: 'hvac_dt',    icon: '🌀',  name: 'Ductwork',               color: '#7A4B1A', desc: 'Flex, sheet metal, plenums, grilles' },
  { id: 'hvac_iaq',   icon: '🌿',  name: 'IAQ',                    color: '#1E6B3C', desc: 'Filters, UV, humidifiers, ERV/HRV' },
  { id: 'hvac_ctrl',  icon: '📟',  name: 'Thermostats & Controls', color: '#4A4A6A', desc: 'Smart thermostats, zoning, controls' },
  { id: 'hvac_comm',  icon: '🏢',  name: 'Commercial',             color: '#8B6914', desc: 'Rooftops, splits over 5 ton, PTACs' },
  // Service-only:
  { id: 'hvac_diag',  icon: '🔍',  name: 'Diagnostics',            color: '#2E5FA3', desc: 'Service call, diagnostic labor', serviceOnly: 'service' },
  { id: 'hvac_maint', icon: '🛠',  name: 'Maintenance',            color: '#1E6B3C', desc: 'Tune-ups, PM plans, seasonal checks', serviceOnly: 'service' },
];

// ── Install Tasks (40+) ────────────────────────────────────────────────────
const INSTALL_TASKS = [
  // AC
  { cat:'hvac_ac', tag:'A/C Install',  n:'2.0 Ton 14.3 SEER2 A/C — Full Install',  hrs:8,  time:'8 hr',  diff:'Moderate',
    desc:'Remove existing condenser + evaporator coil. Install new 2.0-ton 14.3 SEER2 outdoor condenser and matching cased coil on plenum. Includes new 3/8"×5/8" line set up to 25 ft, filter drier, service valves, disconnect, whip, pad, R-410A charge, and full evacuation/leak test. Startup & thermostat verify included.',
    mats:[['H010',1],['H022',1],['H081',1],['H172',1],['H130',1],['H131',1],['H001',6],['H171',1],['H120',1],['H076',1]] },
  { cat:'hvac_ac', tag:'A/C Install',  n:'2.5 Ton 14.3 SEER2 A/C — Full Install',  hrs:8,  time:'8 hr',  diff:'Moderate',
    desc:'Remove existing 2.5-ton condenser and evaporator coil. Install new 2.5-ton 14.3 SEER2 outdoor condenser and matching cased coil. Includes 3/8"×5/8" line set, filter drier, service valves, disconnect box, whip, condenser pad, refrigerant charge to nameplate, deep vacuum and leak test.',
    mats:[['H011',1],['H021',1],['H081',1],['H172',1],['H130',1],['H131',1],['H001',7],['H171',1],['H121',1],['H076',1]] },
  { cat:'hvac_ac', tag:'A/C Install',  n:'3.0 Ton 14.3 SEER2 A/C — Full Install',  hrs:8,  time:'8 hr',  diff:'Moderate',
    desc:'Complete replacement of 3-ton AC condenser + evaporator coil. Includes matched 3-ton 14.3 SEER2 system, new 3/8"×5/8" copper line set, filter drier, service valves, 60A disconnect, condensate pump if needed, safety float switch, and full startup with charge and airflow verify.',
    mats:[['H012',1],['H022',1],['H081',1],['H172',1],['H130',1],['H131',1],['H001',8],['H171',1],['H122',1],['H181',1],['H076',1]] },
  { cat:'hvac_ac', tag:'A/C Install',  n:'4.0 Ton 14.3 SEER2 A/C — Full Install',  hrs:9,  time:'9 hr',  diff:'Hard',
    desc:'4-ton residential AC changeout. Remove old system, install new 4-ton condenser + matched cased coil, new 3/8"×7/8" line set, filter drier, disconnect, and float switch. Includes refrigerant charge, deep vacuum, leak test, and thermostat calibration.',
    mats:[['H014',1],['H024',1],['H082',1],['H172',1],['H130',1],['H131',1],['H001',10],['H171',1],['H122',1],['H181',1]] },
  { cat:'hvac_ac', tag:'A/C Install',  n:'5.0 Ton 14.3 SEER2 A/C — Full Install',  hrs:10, time:'10 hr', diff:'Hard',
    desc:'5-ton condenser + coil replacement. New 3/8"×7/8" line set, larger disconnect, matched cased coil, and start-up with metered refrigerant charge.',
    mats:[['H015',1],['H025',1],['H083',1],['H172',1],['H130',1],['H131',1],['H001',12],['H171',1],['H122',1],['H181',1]] },
  { cat:'hvac_ac', tag:'A/C Install',  n:'3.0 Ton 16 SEER2 2-Stage A/C — Full Install', hrs:9, time:'9 hr', diff:'Hard',
    desc:'Premium 2-stage 3-ton install. Compatible communicating thermostat included. Line set, filter drier, disconnect, condensate pump if needed.',
    mats:[['H016',1],['H022',1],['H081',1],['H172',1],['H130',1],['H131',1],['H001',8],['H171',1],['H122',1],['H094',1],['H181',1]] },
  { cat:'hvac_ac', tag:'Coil Only',    n:'Evaporator Coil Replacement — 3 Ton',    hrs:4,  time:'4 hr',  diff:'Moderate',
    desc:'Replace only the cased evaporator coil. Includes recovery of refrigerant, new coil, filter drier, evacuation, and recharge to nameplate.',
    mats:[['H022',1],['H172',1],['H001',6],['H171',1],['H203',1]] },

  // Furnaces
  { cat:'hvac_furn', tag:'Furnace Install', n:'80k BTU 80% AFUE Gas Furnace — Install', hrs:6, time:'6 hr', diff:'Moderate',
    desc:'Remove existing furnace. Install new 80k BTU 80% AFUE furnace with new supply/return transitions, gas flex, thermostat wiring, and PVC/metal venting to code. Startup, gas leak check, and combustion analysis included.',
    mats:[['H031',1],['H096',1],['H132',1],['H164',1]] },
  { cat:'hvac_furn', tag:'Furnace Install', n:'100k BTU 80% AFUE Gas Furnace — Install', hrs:7, time:'7 hr', diff:'Moderate',
    desc:'Replace existing furnace with 100k BTU 80% AFUE. Full supply/return transitions, gas connection, venting, and thermostat verify. Combustion analysis included.',
    mats:[['H032',1],['H096',1],['H132',1],['H164',1]] },
  { cat:'hvac_furn', tag:'Furnace Install', n:'80k BTU 96% AFUE Condensing Furnace — Install', hrs:8, time:'8 hr', diff:'Hard',
    desc:'High-efficiency 96% condensing furnace install. Includes 2" PVC intake + exhaust to sidewall, condensate drain routing with P-trap, gas flex, thermostat wiring, and full combustion analysis.',
    mats:[['H033',1],['H096',1],['H132',1],['H183',1],['H182',2]] },
  { cat:'hvac_furn', tag:'Furnace Install', n:'100k BTU 96% AFUE 2-Stage Furnace — Install', hrs:9, time:'9 hr', diff:'Hard',
    desc:'2-stage condensing furnace install with premium thermostat. Sidewall PVC venting, condensate management, gas leak check, and 2-stage thermostat setup.',
    mats:[['H034',1],['H096',1],['H132',1],['H183',1],['H182',2],['H094',1]] },
  { cat:'hvac_furn', tag:'Furnace Install', n:'120k BTU 96% AFUE Modulating Furnace — Install', hrs:10, time:'10 hr', diff:'Complex',
    desc:'Fully modulating variable-speed furnace with communicating thermostat. Premium install with balanced ductwork check.',
    mats:[['H035',1],['H096',1],['H132',1],['H183',1],['H182',2],['H093',1]] },
  { cat:'hvac_furn', tag:'Furnace Install', n:'Electric Furnace 20kW — Install', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Install 20kW electric furnace. Includes 60A disconnect, breaker verify, and thermostat setup.',
    mats:[['H037',1],['H130',1],['H131',1],['H132',1]] },

  // Heat Pumps
  { cat:'hvac_hp', tag:'HP Install', n:'3.0 Ton 14.3 SEER2 Heat Pump — Full Install', hrs:9, time:'9 hr', diff:'Hard',
    desc:'Full heat pump changeout: 3-ton outdoor unit, matched coil or air handler, new line set, filter drier, disconnect, and dual-fuel or emergency-heat thermostat wiring. Includes full startup with defrost verify.',
    mats:[['H041',1],['H022',1],['H081',1],['H172',1],['H130',1],['H131',1],['H001',8],['H171',1],['H122',1],['H094',1]] },
  { cat:'hvac_hp', tag:'HP Install', n:'4.0 Ton 14.3 SEER2 Heat Pump — Full Install', hrs:10, time:'10 hr', diff:'Hard',
    desc:'4-ton heat pump replacement with matched air handler. Full commissioning including defrost cycle, reversing valve check, and thermostat calibration.',
    mats:[['H042',1],['H027',1],['H082',1],['H172',1],['H130',1],['H131',1],['H001',10],['H171',1],['H122',1],['H094',1]] },
  { cat:'hvac_hp', tag:'HP Install', n:'3.0 Ton 20 SEER2 Variable-Speed Heat Pump — Install', hrs:11, time:'11 hr', diff:'Complex',
    desc:'Premium variable-speed heat pump with communicating thermostat. Superior comfort and efficiency. Includes matched variable ECM air handler.',
    mats:[['H044',1],['H027',1],['H081',1],['H172',1],['H130',1],['H131',1],['H001',8],['H171',1],['H093',1]] },

  // Mini-Splits
  { cat:'hvac_mini', tag:'Mini Install', n:'9k BTU Single-Zone Mini-Split — Install', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'Single-zone ductless install. Includes wall-mount indoor head, outdoor condenser, 25ft 1/4"×3/8" line set, line hide cover, wall bracket, 15A disconnect, and full commissioning.',
    mats:[['H050',1],['H080',1],['H055',1],['H056',1],['H130',1],['H084',1]] },
  { cat:'hvac_mini', tag:'Mini Install', n:'12k BTU Single-Zone Mini-Split — Install', hrs:5, time:'5 hr', diff:'Moderate',
    desc:'12k BTU ductless single-zone install. Line set, line hide, wall bracket, disconnect, and startup.',
    mats:[['H051',1],['H080',1],['H055',1],['H056',1],['H130',1],['H084',1]] },
  { cat:'hvac_mini', tag:'Mini Install', n:'18k BTU Single-Zone Mini-Split — Install', hrs:6, time:'6 hr', diff:'Moderate',
    desc:'18k BTU ductless install. Suitable for larger rooms or open areas.',
    mats:[['H052',1],['H081',1],['H055',1],['H056',1],['H130',1],['H085',1]] },
  { cat:'hvac_mini', tag:'Mini Install', n:'24k BTU Single-Zone Mini-Split — Install', hrs:6, time:'6 hr', diff:'Moderate',
    desc:'24k BTU single-zone install for whole-floor conditioning.',
    mats:[['H053',1],['H081',1],['H055',1],['H056',1],['H130',1],['H085',1]] },
  { cat:'hvac_mini', tag:'Mini Install', n:'Multi-Zone Mini-Split (2 Zones) — Install', hrs:10, time:'10 hr', diff:'Hard',
    desc:'2-zone ductless install with 36k BTU outdoor and two indoor heads (24k + 12k). Includes line sets, line hides, brackets, disconnect, and full commissioning.',
    mats:[['H054',1],['H051',1],['H080',1],['H081',1],['H055',2],['H056',2],['H130',1],['H084',1],['H085',1]] },

  // Ductwork
  { cat:'hvac_dt', tag:'Duct Install', n:'Complete Ductwork Replacement (1500 sq ft)', hrs:20, time:'2 days', diff:'Complex',
    desc:'Full ductwork replacement for a typical single-story home. New supply/return trunks, flex runs to all rooms, plenums, boots, registers, mastic-sealed joints, and static-pressure test upon completion.',
    mats:[['H061',6],['H062',4],['H063',2],['H066',20],['H067',2],['H068',10],['H069',6],['H070',10],['H071',6],['H072',2],['H075',2],['H076',3],['H077',2]] },
  { cat:'hvac_dt', tag:'Duct Install', n:'New Supply Run (up to 30 ft)', hrs:3, time:'3 hr', diff:'Easy',
    desc:'Add a new supply air run to a previously unserved room. Includes takeoff from trunk, flex to boot, register, mastic seal, and airflow verify.',
    mats:[['H061',2],['H068',1],['H070',1],['H075',1],['H076',1]] },
  { cat:'hvac_dt', tag:'Duct Install', n:'New Return Air (16x25)', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Install new return-air grille and connect to plenum. Includes cutting wall opening, framing, grille, and mastic-sealed connection.',
    mats:[['H062',1],['H067',1],['H072',1],['H075',1]] },
  { cat:'hvac_dt', tag:'Duct Install', n:'Plenum Fabrication & Install', hrs:4, time:'4 hr', diff:'Moderate',
    desc:'Custom fabricated supply plenum for changeout. Sheet metal, sealed & insulated, connected to air handler.',
    mats:[['H066',8],['H074',1],['H075',1],['H076',1]] },
  { cat:'hvac_dt', tag:'Duct Install', n:'Zone Damper System (2-zone) — Install', hrs:6, time:'6 hr', diff:'Hard',
    desc:'2-zone damper system with control panel and dual thermostats. Includes 2 zone dampers, panel, wiring, and setup.',
    mats:[['H190',2],['H193',1],['H094',2],['H133',1]] },
  { cat:'hvac_dt', tag:'Duct Install', n:'Zone Damper System (4-zone) — Install', hrs:10, time:'10 hr', diff:'Complex',
    desc:'4-zone damper system for multi-story or multi-area homes. 4 dampers, 4-zone panel, thermostats, and full setup.',
    mats:[['H190',2],['H191',1],['H192',1],['H194',1],['H094',4],['H133',1]] },

  // IAQ
  { cat:'hvac_iaq', tag:'IAQ Install', n:'Media Filter Cabinet (5-inch) — Install', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Install 5-inch media filter cabinet on return-air side. Includes cabinet, MERV 13 filter, mastic-sealed connections. Recommended annual filter change.',
    mats:[['H100',1],['H101',1],['H075',1]] },
  { cat:'hvac_iaq', tag:'IAQ Install', n:'UV Air Purifier — Install', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Install UV air purifier on air handler. Includes UV lamp, power supply, and mounting. Bulb lasts ~1 year.',
    mats:[['H106',1]] },
  { cat:'hvac_iaq', tag:'IAQ Install', n:'Whole-Home Humidifier (Bypass) — Install', hrs:3, time:'3 hr', diff:'Moderate',
    desc:'Bypass humidifier install with humidistat. Water line tap, condensate drain, and setup.',
    mats:[['H108',1],['H110',1],['H094',1]] },
  { cat:'hvac_iaq', tag:'IAQ Install', n:'Whole-Home Humidifier (Steam) — Install', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Steam humidifier install for superior humidification control. 240V power required.',
    mats:[['H109',1],['H094',1]] },
  { cat:'hvac_iaq', tag:'IAQ Install', n:'Whole-Home Dehumidifier 70 pt — Install', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Install ducted 70-pt whole-home dehumidifier. Includes drain routing and dedicated circuit.',
    mats:[['H111',1],['H130',1]] },
  { cat:'hvac_iaq', tag:'IAQ Install', n:'ERV — 150 CFM — Install', hrs:6, time:'6 hr', diff:'Hard',
    desc:'Energy recovery ventilator install with dedicated fresh air intake and exhaust. Ideal for tight modern homes.',
    mats:[['H112',1],['H061',2],['H075',1]] },

  // Thermostats & Controls
  { cat:'hvac_ctrl', tag:'T-stat Install', n:'Smart Thermostat (Ecobee Premium) — Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Ecobee Premium install with room sensor. Includes app setup and system verify.',
    mats:[['H092',1]] },
  { cat:'hvac_ctrl', tag:'T-stat Install', n:'Smart Thermostat (Nest 4th Gen) — Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Nest 4th Gen install. Includes wiring adapter if C-wire missing.',
    mats:[['H093',1]] },
  { cat:'hvac_ctrl', tag:'T-stat Install', n:'Programmable Thermostat — Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Standard 7-day programmable thermostat install. Wiring verify + schedule setup.',
    mats:[['H091',1]] },

  // Commercial
  { cat:'hvac_comm', tag:'Commercial', n:'5-Ton Rooftop Package Unit — Install', hrs:14, time:'2 days', diff:'Complex',
    desc:'5-ton package rooftop unit changeout. Includes crane lift, curb adapter if needed, disconnect, condensate, and startup.',
    mats:[['H015',1],['H025',1],['H130',1],['H001',12]] },
];

// ── Service Tasks (50+) ────────────────────────────────────────────────────
const SERVICE_TASKS = [
  // Diagnostics
  { cat:'hvac_diag', tag:'Service Call', n:'Standard Service Call & Diagnostic', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Includes travel, arrival, and up to 1 hour of diagnostic time to determine the issue with any HVAC system. Repair estimate provided upon diagnosis.',
    mats:[] },
  { cat:'hvac_diag', tag:'Service Call', n:'After-Hours / Emergency Diagnostic', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Emergency after-hours diagnostic (evenings/weekends/holidays). Priority response.',
    mats:[] },
  { cat:'hvac_diag', tag:'Refrigerant', n:'Refrigerant Leak Search (electronic)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Full leak search using electronic detector, UV dye, and pressure testing. Report of findings with repair estimate. Charge included only if leak found and sealed.',
    mats:[] },

  // AC Service
  { cat:'hvac_ac', tag:'A/C Repair', n:'Capacitor Replacement (Dual Run)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed dual-run capacitor in outdoor condenser. Cost varies by MFD rating. Includes system startup verify.',
    mats:[['H121',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Contactor Replacement', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed contactor in condenser. Includes system startup verify.',
    mats:[['H126',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Condenser Fan Motor Replacement — 1/4 HP', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed 1/4 HP condenser fan motor. Includes new capacitor if needed, blade rebalance, and startup.',
    mats:[['H140',1],['H123',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Condenser Fan Motor Replacement — 1/3 HP', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed 1/3 HP condenser fan motor and matching capacitor.',
    mats:[['H141',1],['H124',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Blower Motor Replacement (PSC 3/4 HP)', hrs:2.5, time:'2.5 hr', diff:'Moderate',
    desc:'Replace failed PSC blower motor in furnace or air handler. Includes wheel re-alignment.',
    mats:[['H144',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'ECM Blower Motor Replacement', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Replace variable-speed ECM blower motor. Includes module programming and airflow verify.',
    mats:[['H146',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Compressor Replacement — 3 Ton', hrs:5, time:'5 hr', diff:'Hard',
    desc:'Replace failed compressor. Full refrigerant recovery, filter drier replacement, and full evacuation. Refrigerant charge included.',
    mats:[['H149',1],['H172',1],['H001',8]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'Hard Start Kit — Add', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Install 5-2-1 hard start kit to reduce compressor startup amp draw. Extends compressor life.',
    mats:[['H128',1]] },
  { cat:'hvac_ac', tag:'A/C Repair', n:'TXV Valve Replacement', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Replace failed thermostatic expansion valve. Includes recovery, new drier, and full charge.',
    mats:[['H170',1],['H172',1],['H001',6]] },
  { cat:'hvac_ac', tag:'Refrigerant', n:'R-410A Refrigerant Add (per lb)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Top-off refrigerant charge — R-410A per pound after leak repair or during commissioning. Requires a diagnostic charge separately.',
    mats:[['H001',1]] },
  { cat:'hvac_ac', tag:'Refrigerant', n:'Complete Refrigerant Recovery & Recharge', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Recover full charge, replace filter drier, evacuate to 500 microns, and recharge to nameplate. Includes up to 8 lb of R-410A.',
    mats:[['H001',8],['H172',1]] },

  // Furnace Service
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Hot Surface Ignitor Replacement', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed hot surface ignitor. Common cause of no-heat calls. Includes startup verify.',
    mats:[['H160',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Flame Sensor Cleaning / Replacement', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Clean or replace flame sensor. Restores flame proving after intermittent shutdowns.',
    mats:[['H161',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Pressure Switch Replacement', hrs:1.5, time:'1.5 hr', diff:'Moderate',
    desc:'Replace failed pressure switch. Includes venting inspection to rule out blockage.',
    mats:[['H162',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Gas Valve Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed 24V gas valve. Includes gas leak check and combustion analysis.',
    mats:[['H163',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Furnace Control Board Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed integrated control board. Includes DIP switch setup and system verify.',
    mats:[['H164',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Inducer Motor Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed inducer draft motor. Common cause of no-heat calls on 90%+ furnaces.',
    mats:[['H147',1],['H166',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Transformer Replacement 40VA', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed 24V control transformer. Includes short-circuit check.',
    mats:[['H132',1]] },
  { cat:'hvac_furn', tag:'Furnace Repair', n:'Thermocouple Replacement (standing pilot)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed thermocouple on older standing-pilot furnace. Includes pilot verify.',
    mats:[['H165',1]] },

  // Heat Pump Service
  { cat:'hvac_hp', tag:'HP Repair', n:'Reversing Valve Coil Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed reversing valve solenoid coil. Restores heat/cool changeover on heat pump.',
    mats:[] },
  { cat:'hvac_hp', tag:'HP Repair', n:'Defrost Board Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed defrost control board. Includes defrost cycle verify.',
    mats:[['H164',1]] },
  { cat:'hvac_hp', tag:'HP Repair', n:'Emergency Heat Element Replacement (5kW)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace failed 5kW electric heat strip. Includes breaker verify and startup.',
    mats:[] },

  // Mini-Split Service
  { cat:'hvac_mini', tag:'Mini Repair', n:'Mini-Split Indoor Blower Motor Replacement', hrs:2.5, time:'2.5 hr', diff:'Hard',
    desc:'Replace failed indoor head blower wheel motor. Requires partial disassembly.',
    mats:[] },
  { cat:'hvac_mini', tag:'Mini Repair', n:'Mini-Split Refrigerant Leak Repair', hrs:3, time:'3 hr', diff:'Hard',
    desc:'Locate & repair refrigerant leak in mini-split system. Includes braze repair, evacuation, and recharge.',
    mats:[['H176',1],['H001',3]] },
  { cat:'hvac_mini', tag:'Mini Service', n:'Mini-Split Deep Clean (Head Coil + Blower)', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Deep clean of indoor head — coil, blower wheel, drain pan. Restores airflow and eliminates odor.',
    mats:[['H201',1],['H205',1]] },

  // Ductwork Service
  { cat:'hvac_dt', tag:'Duct Repair', n:'Duct Leak Repair (per hour)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Repair leaking ductwork joints with mastic sealant. Priced per hour of labor.',
    mats:[['H075',1],['H076',1]] },
  { cat:'hvac_dt', tag:'Duct Repair', n:'Flex Duct Replacement (per run, up to 25 ft)', hrs:2, time:'2 hr', diff:'Easy',
    desc:'Replace collapsed or torn flex duct run. Includes new insulated flex and connections.',
    mats:[['H061',1],['H077',1]] },
  { cat:'hvac_dt', tag:'Duct Repair', n:'Damper Repair / Replacement', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Replace stuck or failed zone damper motor.',
    mats:[['H190',1]] },

  // IAQ Service
  { cat:'hvac_iaq', tag:'IAQ Service', n:'UV Lamp Replacement (annual)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace annual UV lamp. Includes bulb disposal.',
    mats:[['H107',1]] },
  { cat:'hvac_iaq', tag:'IAQ Service', n:'Humidifier Pad Replacement (annual)', hrs:0.5, time:'30 min', diff:'Easy',
    desc:'Replace annual humidifier evaporator pad. Includes water panel flush.',
    mats:[['H110',1]] },
  { cat:'hvac_iaq', tag:'IAQ Service', n:'Media Filter Replacement (5-inch)', hrs:0.25, time:'15 min', diff:'Easy',
    desc:'Replace 5-inch media filter (16x25 or 20x25).',
    mats:[['H101',1]] },

  // Thermostat Service
  { cat:'hvac_ctrl', tag:'T-stat Repair', n:'Thermostat Diagnosis & Rewire', hrs:1, time:'1 hr', diff:'Moderate',
    desc:'Diagnose thermostat wiring issues, add C-wire if needed, verify system operation.',
    mats:[['H095',1]] },
  { cat:'hvac_ctrl', tag:'T-stat Repair', n:'Thermostat Replacement (basic)', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Replace failed thermostat with programmable model. Wiring verify + schedule setup.',
    mats:[['H091',1]] },

  // Condensate
  { cat:'hvac_ac', tag:'Condensate', n:'Condensate Line Clearing', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Clear clogged condensate line with vacuum + treatment tabs. Prevents overflow shutdown.',
    mats:[['H184',1]] },
  { cat:'hvac_ac', tag:'Condensate', n:'Condensate Pump Replacement', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'Replace failed condensate pump. Includes safety float switch if not present.',
    mats:[['H180',1],['H181',1]] },
  { cat:'hvac_ac', tag:'Condensate', n:'Condensate Safety Float Switch Install', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Add safety float switch to prevent condensate overflow damage. Recommended for attic units.',
    mats:[['H181',1]] },

  // Maintenance / Tune-Ups
  { cat:'hvac_maint', tag:'Tune-Up', n:'A/C Precision Tune-Up (single system)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'21-point A/C tune-up: clean condenser coil, check refrigerant charge, capacitor test, contactor inspection, drain line flush, thermostat calibration, filter check.',
    mats:[['H202',1],['H184',1]] },
  { cat:'hvac_maint', tag:'Tune-Up', n:'Furnace Precision Tune-Up (single system)', hrs:1.5, time:'1.5 hr', diff:'Easy',
    desc:'25-point furnace tune-up: clean burners, flame sensor cleaning, gas pressure check, combustion analysis, blower inspection, ignitor check, safety verify.',
    mats:[] },
  { cat:'hvac_maint', tag:'Tune-Up', n:'Heat Pump Precision Tune-Up', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Full-system heat pump tune-up: refrigerant charge, defrost cycle test, reversing valve check, emergency heat verify, drain flush, all electrical.',
    mats:[['H202',1]] },
  { cat:'hvac_maint', tag:'PM Plan', n:'Annual Maintenance Plan (1 system)', hrs:3, time:'3 hr', diff:'Easy',
    desc:'Yearly plan: 2 tune-ups (spring A/C, fall furnace), priority scheduling, 15% off repairs, no dispatch fee.',
    mats:[] },
  { cat:'hvac_maint', tag:'PM Plan', n:'Annual Maintenance Plan (2 systems)', hrs:5, time:'5 hr', diff:'Easy',
    desc:'Yearly plan covering 2 HVAC systems: 4 tune-ups total, priority scheduling, 15% off repairs, no dispatch fee.',
    mats:[] },
  { cat:'hvac_maint', tag:'Coil Clean', n:'Condenser Coil Deep Clean', hrs:1, time:'1 hr', diff:'Easy',
    desc:'Chemical deep-clean of outdoor condenser coil. Restores efficiency and extends compressor life.',
    mats:[['H202',1]] },
  { cat:'hvac_maint', tag:'Coil Clean', n:'Evaporator Coil Deep Clean', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Foam-based cleaning of indoor evaporator coil. Improves airflow and eliminates musty odors.',
    mats:[['H201',1]] },

  // Commercial service
  { cat:'hvac_comm', tag:'Commercial', n:'Commercial Rooftop Service Call', hrs:2, time:'2 hr', diff:'Moderate',
    desc:'Diagnostic and repair on commercial rooftop unit. Roof access, safety harness, and specialty tools included.',
    mats:[] },
];

async function run() {
  const db = new Client({ connectionString: DB });
  await db.connect();
  console.log('→ Connected to', DB.replace(/:[^:@]+@/, ':***@'));

  try {
    await db.query('BEGIN');

    // Clear existing HVAC data (idempotent replay)
    console.log('→ Clearing existing HVAC data');
    await db.query(
      `DELETE FROM pb_task_materials
        WHERE task_id IN (SELECT id FROM pb_tasks WHERE service = 'hvac')`
    );
    await db.query(`DELETE FROM pb_tasks       WHERE service = 'hvac'`);
    await db.query(`DELETE FROM pb_materials   WHERE service = 'hvac'`);
    await db.query(`DELETE FROM pb_categories  WHERE service = 'hvac'`);

    // Materials
    console.log(`→ Inserting ${Object.keys(MATS).length} HVAC materials`);
    for (const [id, m] of Object.entries(MATS)) {
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost, category, service)
         VALUES ($1,$2,$3,$4,$5,'hvac')`,
        [id, m.d, m.u, m.c, m.cat]
      );
    }

    // Categories — insert one row per (id, service, service_type) as needed
    console.log(`→ Inserting HVAC categories`);
    for (let i = 0; i < CATEGORIES.length; i++) {
      const c = CATEGORIES[i];
      const types = c.serviceOnly ? [c.serviceOnly] : ['install', 'service'];
      for (const t of types) {
        await db.query(
          `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
           VALUES ($1,$2,$3,$4,$5,$6,'hvac',$7)
           ON CONFLICT (id, service, service_type) DO NOTHING`,
          [c.id, c.icon, c.name, c.color, c.desc, i, t]
        );
      }
    }

    // Install tasks
    console.log(`→ Inserting ${INSTALL_TASKS.length} HVAC install tasks`);
    let installLinks = 0;
    for (const t of INSTALL_TASKS) {
      const { rows: [row] } = await db.query(
        `INSERT INTO pb_tasks
           (category_id, name, tag, hours, time_range, difficulty, notes, description,
            service, service_type)
         VALUES ($1,$2,$3,$4,$5,$6,'',$7,'hvac','install') RETURNING id`,
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

    // Service tasks
    console.log(`→ Inserting ${SERVICE_TASKS.length} HVAC service tasks`);
    let svcLinks = 0;
    for (const t of SERVICE_TASKS) {
      const { rows: [row] } = await db.query(
        `INSERT INTO pb_tasks
           (category_id, name, tag, hours, time_range, difficulty, notes, description,
            service, service_type)
         VALUES ($1,$2,$3,$4,$5,$6,'',$7,'hvac','service') RETURNING id`,
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

    await db.query('COMMIT');
    console.log('✓ Migration 005 complete.');

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

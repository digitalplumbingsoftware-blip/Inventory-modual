const express = require('express');
const router  = express.Router();
const https   = require('https');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// ── Reece / Hajoca B2B API helper ─────────────────────────────
const REECE_HOSTS = {
  production: 'api.reece.com',
  sandbox:    'sandbox-api.reece.com',
};

async function reeceRequest(method, path, body, cfg) {
  const host = REECE_HOSTS[cfg.environment] || REECE_HOSTS.production;
  const auth = 'Basic ' + Buffer.from(`${cfg.username}:${cfg.password}`).toString('base64');
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: host, path, method,
      headers: { 'Content-Type':'application/json', 'Authorization':auth, 'X-Account-Number':cfg.account_number },
    };
    const req = https.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (res.statusCode >= 400) reject(new Error(p.message || `Reece API ${res.statusCode}`));
          else resolve(p);
        } catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function ensureOrdersTable() {
  await query(`CREATE TABLE IF NOT EXISTS reece_orders (
    id SERIAL PRIMARY KEY, order_number TEXT NOT NULL UNIQUE,
    branch_id TEXT, branch_name TEXT, items JSONB DEFAULT '[]',
    total NUMERIC(10,2) DEFAULT 0, status TEXT DEFAULT 'pending',
    notes TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}
ensureOrdersTable().catch(e => console.warn('reece_orders:', e.message));

// ─────────────────────────────────────────────────────────────
// REECE / MAX — Plumbing Catalog (fallback when API offline)
// sku = MSC (Morsco/MAX internal 7-digit catalog number)
// branchQty = stock at selected branch; qtyOnHand = network total
// ─────────────────────────────────────────────────────────────
const REECE_CATALOG = [

  // ═══════════════════════════════════════════════════════════
  // KITCHEN FAUCETS
  // ═══════════════════════════════════════════════════════════
  { sku:'3401001', name:'Moen Arbor 1-Handle Pull-Down Kitchen Faucet Spot Resist SS',   price:234.99, listPrice:312.00, uom:'EA', category:'Kitchen Faucets', brand:'Moen',        inStock:true,  qtyOnHand:7,  branchQty:2 },
  { sku:'3401002', name:'Delta Leland Touch2O 1-Handle Pull-Down Kitchen Faucet SS',     price:329.00, listPrice:439.00, uom:'EA', category:'Kitchen Faucets', brand:'Delta',       inStock:true,  qtyOnHand:4,  branchQty:1 },
  { sku:'3401003', name:'Kohler Simplice 1-Handle Pull-Down Kitchen Faucet Vibrant SS',  price:289.00, listPrice:385.00, uom:'EA', category:'Kitchen Faucets', brand:'Kohler',      inStock:true,  qtyOnHand:5,  branchQty:2 },
  { sku:'3401004', name:'Pfister Cagney 1-Handle Pull-Out Kitchen Faucet Brushed Nickel',price:139.00, listPrice:185.00, uom:'EA', category:'Kitchen Faucets', brand:'Pfister',     inStock:true,  qtyOnHand:9,  branchQty:3 },
  { sku:'3401005', name:'Delta Essa Pull-Down Kitchen Faucet Arctic Stainless',           price:254.00, listPrice:339.00, uom:'EA', category:'Kitchen Faucets', brand:'Delta',       inStock:false, qtyOnHand:0,  branchQty:0 },
  { sku:'3401006', name:'American Standard Edgewater 2-Handle Kitchen Faucet Chrome',    price:108.00, listPrice:144.00, uom:'EA', category:'Kitchen Faucets', brand:'Am Standard', inStock:true,  qtyOnHand:11, branchQty:4 },
  { sku:'3401007', name:'Moen Arbor Motionsense 2-Sensor Pulldown Kitchen Faucet SS',    price:379.00, listPrice:505.00, uom:'EA', category:'Kitchen Faucets', brand:'Moen',        inStock:true,  qtyOnHand:2,  branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // BATH FAUCETS
  // ═══════════════════════════════════════════════════════════
  { sku:'3411001', name:'Moen Adler 1-Handle 4-in Centerset Bath Faucet Brushed Nickel', price:74.99,  listPrice:100.00, uom:'EA', category:'Bath Faucets',    brand:'Moen',        inStock:true,  qtyOnHand:22, branchQty:6 },
  { sku:'3411002', name:'Delta Lahara 2-Handle Widespread 6-in Bath Faucet Chrome',      price:99.00,  listPrice:132.00, uom:'EA', category:'Bath Faucets',    brand:'Delta',       inStock:true,  qtyOnHand:15, branchQty:4 },
  { sku:'3411003', name:'Kohler Bancroft 2-Handle 4-in Centerset Bath Faucet BN',        price:174.00, listPrice:232.00, uom:'EA', category:'Bath Faucets',    brand:'Kohler',      inStock:true,  qtyOnHand:8,  branchQty:2 },
  { sku:'3411004', name:'Pfister Brea 4-in Centerset 2-Handle Bath Faucet Chrome',       price:84.00,  listPrice:112.00, uom:'EA', category:'Bath Faucets',    brand:'Pfister',     inStock:true,  qtyOnHand:18, branchQty:5 },
  { sku:'3411005', name:'American Standard Cadet 2-Handle 4-in Centerset Bath Faucet',   price:84.00,  listPrice:112.00, uom:'EA', category:'Bath Faucets',    brand:'Am Standard', inStock:true,  qtyOnHand:14, branchQty:4 },
  { sku:'3411006', name:'Moen Brantford 2-Handle 4-in Centerset Bath Faucet BN',         price:104.00, listPrice:139.00, uom:'EA', category:'Bath Faucets',    brand:'Moen',        inStock:true,  qtyOnHand:12, branchQty:3 },

  // ═══════════════════════════════════════════════════════════
  // TUB & SHOWER
  // ═══════════════════════════════════════════════════════════
  { sku:'3421001', name:'Moen M-PACT Posi-Temp Pressure-Balance Valve Body Only',        price:61.00,  listPrice:81.00,  uom:'EA', category:'Tub & Shower',    brand:'Moen',        inStock:true,  qtyOnHand:35, branchQty:10 },
  { sku:'3421002', name:'Moen Posi-Temp 1-Handle Tub/Shower Valve w/ Trim BN',           price:139.00, listPrice:185.00, uom:'EA', category:'Tub & Shower',    brand:'Moen',        inStock:true,  qtyOnHand:12, branchQty:4 },
  { sku:'3421003', name:'Delta MultiChoice Universal Tub/Shower Rough-In Valve',          price:68.00,  listPrice:91.00,  uom:'EA', category:'Tub & Shower',    brand:'Delta',       inStock:true,  qtyOnHand:28, branchQty:8 },
  { sku:'3421004', name:'Delta Monitor 14 1-Handle Shower Trim Kit Stainless',            price:94.00,  listPrice:125.00, uom:'EA', category:'Tub & Shower',    brand:'Delta',       inStock:true,  qtyOnHand:10, branchQty:3 },
  { sku:'3421005', name:'Kohler Devonshire Rite-Temp 1-Handle Shower Valve w/Trim',      price:234.00, listPrice:312.00, uom:'EA', category:'Tub & Shower',    brand:'Kohler',      inStock:true,  qtyOnHand:6,  branchQty:2 },
  { sku:'3421006', name:'Moen Attract 6-Spray Handheld Shower 1.75 GPM BN',              price:54.00,  listPrice:72.00,  uom:'EA', category:'Tub & Shower',    brand:'Moen',        inStock:true,  qtyOnHand:18, branchQty:5 },

  // ═══════════════════════════════════════════════════════════
  // TOILETS
  // ═══════════════════════════════════════════════════════════
  { sku:'3501001', name:'Kohler Cimarron Comfort Height 2-Piece 1.28 gpf Elongated White',price:319.00, listPrice:425.00, uom:'EA', category:'Toilets',         brand:'Kohler',      inStock:true,  qtyOnHand:5,  branchQty:2 },
  { sku:'3501002', name:'American Standard Cadet 3 Tall Height 2-Piece 1.28 gpf White',   price:229.00, listPrice:305.00, uom:'EA', category:'Toilets',         brand:'Am Standard', inStock:true,  qtyOnHand:7,  branchQty:2 },
  { sku:'3501003', name:'TOTO Drake II 1-Piece 1.28 gpf Elongated Cotton White',           price:359.00, listPrice:479.00, uom:'EA', category:'Toilets',         brand:'TOTO',        inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'3501004', name:'Kohler Santa Rosa 1-Piece Comfort Height 1.28 gpf Round White',   price:449.00, listPrice:599.00, uom:'EA', category:'Toilets',         brand:'Kohler',      inStock:false, qtyOnHand:0,  branchQty:0 },
  { sku:'3501005', name:'American Standard H2Option Dual-Flush 2-Piece 1.6/1.0 gpf',       price:269.00, listPrice:359.00, uom:'EA', category:'Toilets',         brand:'Am Standard', inStock:true,  qtyOnHand:4,  branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // TOILET PARTS
  // ═══════════════════════════════════════════════════════════
  { sku:'3511001', name:'Fluidmaster 501 Universal Fill Valve Anti-Siphon',               price:10.25,  listPrice:13.75,  uom:'EA', category:'Toilet Parts',    brand:'Fluidmaster', inStock:true,  qtyOnHand:100,branchQty:30 },
  { sku:'3511002', name:'Fluidmaster 502P21 PerforMAX Universal 2 in Toilet Flapper',     price:6.75,   listPrice:9.00,   uom:'EA', category:'Toilet Parts',    brand:'Fluidmaster', inStock:true,  qtyOnHand:130,branchQty:40 },
  { sku:'3511003', name:'Kohler Cachet Elongated Closed-Front Toilet Seat',               price:31.00,  listPrice:41.00,  uom:'EA', category:'Toilet Parts',    brand:'Kohler',      inStock:true,  qtyOnHand:25, branchQty:8 },
  { sku:'3511004', name:'American Standard Titan Toilet Seat Slow-Close Elongated White', price:36.00,  listPrice:48.00,  uom:'EA', category:'Toilet Parts',    brand:'Am Standard', inStock:true,  qtyOnHand:20, branchQty:6 },

  // ═══════════════════════════════════════════════════════════
  // WATER HEATERS — GAS
  // ═══════════════════════════════════════════════════════════
  { sku:'5001001', name:'A.O. Smith Signature 40 Gal Tall 6yr Natural Gas Water Heater',  price:499.00, listPrice:665.00, uom:'EA', category:'Water Heaters Gas',brand:'AO Smith',   inStock:true,  qtyOnHand:4,  branchQty:2 },
  { sku:'5001002', name:'A.O. Smith Signature 50 Gal Tall 6yr Natural Gas Water Heater',  price:579.00, listPrice:772.00, uom:'EA', category:'Water Heaters Gas',brand:'AO Smith',   inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'5001003', name:'Rheem Performance 40 Gal Short 6yr Natural Gas Water Heater',    price:578.00, listPrice:769.00, uom:'EA', category:'Water Heaters Gas',brand:'Rheem',      inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'5001004', name:'Rheem Performance Plus 50 Gal 12yr Natural Gas Water Heater',    price:669.00, listPrice:892.00, uom:'EA', category:'Water Heaters Gas',brand:'Rheem',      inStock:false, qtyOnHand:0,  branchQty:0 },
  { sku:'5001005', name:'Bradford White 50 Gal Natural Gas Defender Safety System Heater',price:729.00, listPrice:972.00, uom:'EA', category:'Water Heaters Gas',brand:'Bradford White',inStock:true,qtyOnHand:2, branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // WATER HEATERS — ELECTRIC
  // ═══════════════════════════════════════════════════════════
  { sku:'5011001', name:'A.O. Smith Signature 40 Gal Tall 6yr 4500W Electric Water Heater',price:419.00,listPrice:559.00, uom:'EA', category:'Water Heaters Electric',brand:'AO Smith',inStock:true, qtyOnHand:5,  branchQty:2 },
  { sku:'5011002', name:'A.O. Smith Signature 50 Gal Tall 6yr 4500W Electric Water Heater',price:459.00,listPrice:612.00, uom:'EA', category:'Water Heaters Electric',brand:'AO Smith',inStock:true, qtyOnHand:4,  branchQty:1 },
  { sku:'5011003', name:'Rheem Performance 40 Gal Medium 12yr 4500W Electric Water Heater',price:429.00,listPrice:572.00, uom:'EA', category:'Water Heaters Electric',brand:'Rheem',   inStock:true, qtyOnHand:4,  branchQty:2 },
  { sku:'5011004', name:'Rheem 6 Gal Point-of-Use 120V Electric Mini Tank Water Heater',   price:184.00,listPrice:245.00, uom:'EA', category:'Water Heaters Electric',brand:'Rheem',   inStock:true, qtyOnHand:6,  branchQty:3 },

  // ═══════════════════════════════════════════════════════════
  // WATER HEATERS — TANKLESS
  // ═══════════════════════════════════════════════════════════
  { sku:'5021001', name:'Rinnai RL Model 9.4 GPM Natural Gas Indoor Tankless Water Heater',price:829.00,listPrice:1105.00,uom:'EA', category:'Water Heaters Tankless',brand:'Rinnai', inStock:true,  qtyOnHand:2,  branchQty:1 },
  { sku:'5021002', name:'Navien NPE-240A2 11.2 GPM NG Condensing Tankless Combo System',   price:1349.00,listPrice:1799.00,uom:'EA',category:'Water Heaters Tankless',brand:'Navien', inStock:true,  qtyOnHand:1,  branchQty:1 },
  { sku:'5021003', name:'Rheem 240V 13A 4 GPM Point-of-Use Electric Tankless Water Heater',price:184.00,listPrice:245.00, uom:'EA', category:'Water Heaters Tankless',brand:'Rheem',  inStock:false, qtyOnHand:0,  branchQty:0 },

  // ═══════════════════════════════════════════════════════════
  // VALVES — BALL
  // ═══════════════════════════════════════════════════════════
  { sku:'6001001', name:'Apollo LF 1/2 in FPT x FPT Full-Port Lead-Free Bronze Ball Valve',price:9.75,  listPrice:13.00,  uom:'EA', category:'Valves Ball',     brand:'Apollo',      inStock:true,  qtyOnHand:150,branchQty:50 },
  { sku:'6001002', name:'Apollo LF 3/4 in FPT x FPT Full-Port Lead-Free Bronze Ball Valve',price:13.25, listPrice:17.75,  uom:'EA', category:'Valves Ball',     brand:'Apollo',      inStock:true,  qtyOnHand:110,branchQty:35 },
  { sku:'6001003', name:'Apollo LF 1 in FPT x FPT Full-Port Lead-Free Bronze Ball Valve',  price:19.75, listPrice:26.25,  uom:'EA', category:'Valves Ball',     brand:'Apollo',      inStock:true,  qtyOnHand:75, branchQty:20 },
  { sku:'6001004', name:'SharkBite 1/2 in Push-to-Connect Lead-Free Ball Valve',           price:19.50, listPrice:26.00,  uom:'EA', category:'Valves Ball',     brand:'SharkBite',   inStock:true,  qtyOnHand:65, branchQty:20 },
  { sku:'6001005', name:'SharkBite 3/4 in Push-to-Connect Lead-Free Ball Valve',           price:24.75, listPrice:33.00,  uom:'EA', category:'Valves Ball',     brand:'SharkBite',   inStock:true,  qtyOnHand:48, branchQty:15 },
  { sku:'6001006', name:'Nibco 1/2 in FNPT x FNPT Lead-Free Brass Ball Valve Full-Port',   price:8.50,  listPrice:11.25,  uom:'EA', category:'Valves Ball',     brand:'Nibco',       inStock:true,  qtyOnHand:200,branchQty:60 },
  { sku:'6001007', name:'Nibco 3/4 in FNPT x FNPT Lead-Free Brass Ball Valve Full-Port',   price:11.50, listPrice:15.25,  uom:'EA', category:'Valves Ball',     brand:'Nibco',       inStock:true,  qtyOnHand:160,branchQty:50 },

  // ═══════════════════════════════════════════════════════════
  // VALVES — PRV & BACKFLOW
  // ═══════════════════════════════════════════════════════════
  { sku:'6021001', name:'Watts LF 3/4 in Lead-Free Pressure Reducing Valve w/Gauge',       price:57.50, listPrice:76.50,  uom:'EA', category:'Valves PRV',      brand:'Watts',       inStock:true,  qtyOnHand:22, branchQty:7 },
  { sku:'6021002', name:'Watts LF 1 in Lead-Free Pressure Reducing Valve w/Gauge',         price:84.00, listPrice:112.00, uom:'EA', category:'Valves PRV',      brand:'Watts',       inStock:true,  qtyOnHand:14, branchQty:4 },
  { sku:'6031001', name:'Watts LF 3/4 in Lead-Free Double Check Valve Assembly',            price:42.50, listPrice:56.50,  uom:'EA', category:'Valves Backflow', brand:'Watts',       inStock:true,  qtyOnHand:18, branchQty:5 },
  { sku:'6031002', name:'Apollo LF 1 in Reduced Pressure Zone Backflow Preventer',          price:199.00,listPrice:265.00, uom:'EA', category:'Valves Backflow', brand:'Apollo',      inStock:true,  qtyOnHand:5,  branchQty:2 },
  { sku:'6031003', name:'Nibco LF 1/2 in FPT x FPT Swing Check Valve Lead-Free',          price:12.25, listPrice:16.25,  uom:'EA', category:'Valves Backflow', brand:'Nibco',       inStock:true,  qtyOnHand:40, branchQty:12 },

  // ═══════════════════════════════════════════════════════════
  // PIPE — PEX
  // ═══════════════════════════════════════════════════════════
  { sku:'7001001', name:'Uponor Wirsbo hePEX 1/2 in x 10 ft PEX-A Pipe Straight',         price:8.75,  listPrice:11.75,  uom:'EA', category:'Pipe PEX',        brand:'Uponor',      inStock:true,  qtyOnHand:220,branchQty:70 },
  { sku:'7001002', name:'Uponor Wirsbo hePEX 3/4 in x 10 ft PEX-A Pipe Straight',         price:12.25, listPrice:16.25,  uom:'EA', category:'Pipe PEX',        brand:'Uponor',      inStock:true,  qtyOnHand:170,branchQty:55 },
  { sku:'7001003', name:'SharkBite 1/2 in PEX-B Tubing 10 ft Straight Blue',               price:9.25,  listPrice:12.25,  uom:'EA', category:'Pipe PEX',        brand:'SharkBite',   inStock:true,  qtyOnHand:120,branchQty:40 },
  { sku:'7001004', name:'SharkBite 1/2 in PEX-B Tubing 50 ft Coil Blue',                   price:41.00, listPrice:54.50,  uom:'EA', category:'Pipe PEX',        brand:'SharkBite',   inStock:true,  qtyOnHand:28, branchQty:8 },
  { sku:'7001005', name:'SharkBite 3/4 in PEX-B Tubing 50 ft Coil Blue',                   price:59.50, listPrice:79.50,  uom:'EA', category:'Pipe PEX',        brand:'SharkBite',   inStock:true,  qtyOnHand:20, branchQty:6 },
  { sku:'7001006', name:'Viega PureFlow 1/2 in x 10 ft PEX-B Pipe',                        price:8.25,  listPrice:11.00,  uom:'EA', category:'Pipe PEX',        brand:'Viega',       inStock:true,  qtyOnHand:150,branchQty:45 },

  // ═══════════════════════════════════════════════════════════
  // PIPE — COPPER
  // ═══════════════════════════════════════════════════════════
  { sku:'7011001', name:'Mueller Industries 1/2 in x 10 ft Type-L Hard Drawn Copper Tube', price:24.50, listPrice:32.50,  uom:'EA', category:'Pipe Copper',     brand:'Mueller',     inStock:true,  qtyOnHand:55, branchQty:18 },
  { sku:'7011002', name:'Mueller Industries 3/4 in x 10 ft Type-L Hard Drawn Copper Tube', price:37.75, listPrice:50.25,  uom:'EA', category:'Pipe Copper',     brand:'Mueller',     inStock:true,  qtyOnHand:38, branchQty:12 },
  { sku:'7011003', name:'Mueller Industries 1 in x 10 ft Type-L Hard Drawn Copper Tube',   price:59.50, listPrice:79.25,  uom:'EA', category:'Pipe Copper',     brand:'Mueller',     inStock:false, qtyOnHand:0,  branchQty:0 },

  // ═══════════════════════════════════════════════════════════
  // PIPE — CPVC & PVC
  // ═══════════════════════════════════════════════════════════
  { sku:'7021001', name:'Charlotte Pipe 1/2 in x 10 ft CPVC CTS Pipe Schedule 40',         price:7.25,  listPrice:9.75,   uom:'EA', category:'Pipe CPVC',       brand:'Charlotte Pipe',inStock:true, qtyOnHand:100,branchQty:30 },
  { sku:'7021002', name:'Charlotte Pipe 3/4 in x 10 ft CPVC CTS Pipe Schedule 40',         price:10.25, listPrice:13.75,  uom:'EA', category:'Pipe CPVC',       brand:'Charlotte Pipe',inStock:true, qtyOnHand:75, branchQty:24 },
  { sku:'7031001', name:'Charlotte Pipe 1-1/2 in x 10 ft PVC DWV Pipe',                    price:11.50, listPrice:15.25,  uom:'EA', category:'Pipe PVC',        brand:'Charlotte Pipe',inStock:true, qtyOnHand:60, branchQty:20 },
  { sku:'7031002', name:'Charlotte Pipe 2 in x 10 ft PVC DWV Pipe',                         price:14.75, listPrice:19.75,  uom:'EA', category:'Pipe PVC',        brand:'Charlotte Pipe',inStock:true, qtyOnHand:50, branchQty:16 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — COPPER (Nibco wrot)
  // ═══════════════════════════════════════════════════════════
  { sku:'7101001', name:'Nibco 1/2 in C x C Wrot Copper Coupling w/Stop',                  price:2.15,  listPrice:2.85,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:500,branchQty:150 },
  { sku:'7101002', name:'Nibco 3/4 in C x C Wrot Copper Coupling w/Stop',                  price:3.25,  listPrice:4.25,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:400,branchQty:120 },
  { sku:'7101003', name:'Nibco 1/2 in C x C Wrot Copper 90-Degree Elbow',                  price:2.50,  listPrice:3.35,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:450,branchQty:140 },
  { sku:'7101004', name:'Nibco 3/4 in C x C Wrot Copper 90-Degree Elbow',                  price:3.75,  listPrice:5.00,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:350,branchQty:110 },
  { sku:'7101005', name:'Nibco 1/2 in C x C Wrot Copper 45-Degree Elbow',                  price:2.65,  listPrice:3.50,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:300,branchQty:90 },
  { sku:'7101006', name:'Nibco 1/2 in C x C x C Wrot Copper Tee',                          price:3.75,  listPrice:5.00,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:350,branchQty:100 },
  { sku:'7101007', name:'Nibco 3/4 in C x C x C Wrot Copper Tee',                          price:5.50,  listPrice:7.35,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:275,branchQty:85 },
  { sku:'7101008', name:'Nibco 1/2 in C x MIP Wrot Copper Male Adapter',                    price:3.25,  listPrice:4.35,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:250,branchQty:75 },
  { sku:'7101009', name:'Nibco 1/2 in C x FIP Wrot Copper Female Adapter',                  price:3.50,  listPrice:4.65,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:220,branchQty:65 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — PEX (SharkBite push-connect)
  // ═══════════════════════════════════════════════════════════
  { sku:'7111001', name:'SharkBite 1/2 in Push-to-Connect Lead-Free Coupling',             price:5.50,  listPrice:7.25,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:400,branchQty:120 },
  { sku:'7111002', name:'SharkBite 1/2 in Push-to-Connect 90-Degree Elbow Lead-Free',     price:5.75,  listPrice:7.65,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:380,branchQty:115 },
  { sku:'7111003', name:'SharkBite 1/2 in Push-to-Connect Tee Lead-Free',                 price:7.75,  listPrice:10.25,  uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:320,branchQty:96 },
  { sku:'7111004', name:'SharkBite 3/4 in Push-to-Connect Lead-Free Coupling',             price:7.00,  listPrice:9.25,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:300,branchQty:90 },
  { sku:'7111005', name:'SharkBite 3/4 in Push-to-Connect 90-Degree Elbow Lead-Free',     price:7.50,  listPrice:10.00,  uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:260,branchQty:78 },
  { sku:'7111006', name:'SharkBite 3/4 in Push-to-Connect Tee Lead-Free',                 price:10.25, listPrice:13.75,  uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:220,branchQty:66 },
  { sku:'7111007', name:'SharkBite 1/2 x 3/4 in Push-to-Connect Reducing Coupling LF',   price:6.50,  listPrice:8.75,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:180,branchQty:54 },
  { sku:'7111008', name:'SharkBite 1/2 in PEX x 1/2 in FNPT Lead-Free Adapter',          price:7.25,  listPrice:9.75,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:150,branchQty:45 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — CPVC
  // ═══════════════════════════════════════════════════════════
  { sku:'7121001', name:'Nibco 1/2 in CTS CPVC 90-Degree Elbow Schedule 40',              price:1.75,  listPrice:2.35,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:300,branchQty:90 },
  { sku:'7121002', name:'Nibco 3/4 in CTS CPVC 90-Degree Elbow Schedule 40',              price:2.50,  listPrice:3.35,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:250,branchQty:75 },
  { sku:'7121003', name:'Nibco 1/2 in CTS CPVC Coupling Schedule 40',                     price:1.50,  listPrice:2.00,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:350,branchQty:105 },
  { sku:'7121004', name:'Nibco 1/2 in CTS CPVC Tee Schedule 40',                          price:2.25,  listPrice:3.00,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:280,branchQty:84 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — THREADED BRASS
  // ═══════════════════════════════════════════════════════════
  { sku:'7131001', name:'Watts Lead-Free 1/2 in Close Nipple Brass',                       price:3.75,  listPrice:4.99,   uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:180,branchQty:55 },
  { sku:'7131002', name:'Watts Lead-Free 3/4 in Street Elbow 90-Degree Brass',             price:6.75,  listPrice:8.99,   uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:110,branchQty:33 },
  { sku:'7131003', name:'Watts Lead-Free 3/4 in FPT Tee Brass',                            price:9.25,  listPrice:12.25,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:85, branchQty:25 },
  { sku:'7131004', name:'Watts Lead-Free 1/2 in Brass Union with Rubber Seat',             price:11.50, listPrice:15.25,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:60, branchQty:18 },
  { sku:'7131005', name:'Watts Lead-Free 1/2 in Brass Dielectric Union MIP x FIP',         price:9.75,  listPrice:13.00,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:90, branchQty:27 },
  { sku:'7131006', name:'Watts Lead-Free 3/4 in Brass Dielectric Union MIP x FIP',         price:12.50, listPrice:16.75,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:70, branchQty:21 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — PVC DWV
  // ═══════════════════════════════════════════════════════════
  { sku:'7141001', name:'Charlotte Pipe 1-1/2 in PVC DWV 90-Degree Elbow',                price:2.75,  listPrice:3.65,   uom:'EA', category:'Fittings PVC',   brand:'Charlotte Pipe',inStock:true, qtyOnHand:250,branchQty:75 },
  { sku:'7141002', name:'Charlotte Pipe 2 in PVC DWV 90-Degree Elbow',                    price:3.50,  listPrice:4.65,   uom:'EA', category:'Fittings PVC',   brand:'Charlotte Pipe',inStock:true, qtyOnHand:200,branchQty:60 },
  { sku:'7141003', name:'Charlotte Pipe 1-1/2 in PVC DWV Coupling',                       price:2.25,  listPrice:3.00,   uom:'EA', category:'Fittings PVC',   brand:'Charlotte Pipe',inStock:true, qtyOnHand:300,branchQty:90 },
  { sku:'7141004', name:'Charlotte Pipe 1-1/2 in PVC DWV Sanitary Tee',                   price:4.25,  listPrice:5.65,   uom:'EA', category:'Fittings PVC',   brand:'Charlotte Pipe',inStock:true, qtyOnHand:180,branchQty:54 },
  { sku:'7141005', name:'Charlotte Pipe 2 in PVC DWV Sanitary Tee',                       price:5.50,  listPrice:7.35,   uom:'EA', category:'Fittings PVC',   brand:'Charlotte Pipe',inStock:true, qtyOnHand:150,branchQty:45 },

  // ═══════════════════════════════════════════════════════════
  // HOSE BIBS
  // ═══════════════════════════════════════════════════════════
  { sku:'7801001', name:'Woodford 1/2 in FIP x Hose Thread Loose Key Sillcock 2 in',       price:14.75, listPrice:19.75,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:45, branchQty:14 },
  { sku:'7801002', name:'Woodford 3/4 in MIP Anti-Siphon Vacuum Breaker Sillcock',          price:19.50, listPrice:26.00,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:38, branchQty:12 },
  { sku:'7801003', name:'Woodford 1/2 in MIP x HS 8 in Freezeless Hydrant Sillcock',       price:34.75, listPrice:46.25,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:28, branchQty:9 },
  { sku:'7801004', name:'Woodford 1/2 in MIP x HS 12 in Freezeless Hydrant Sillcock',      price:38.75, listPrice:51.75,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:22, branchQty:7 },
  { sku:'7801005', name:'BrassCraft 1/2 in FIP Lead-Free Quarter-Turn Hose Bibb',          price:16.25, listPrice:21.75,  uom:'EA', category:'Hose Bibs',       brand:'BrassCraft',  inStock:true,  qtyOnHand:50, branchQty:15 },
  { sku:'7801006', name:'BrassCraft 3/4 in FIP Lead-Free Quarter-Turn Hose Bibb',          price:19.75, listPrice:26.25,  uom:'EA', category:'Hose Bibs',       brand:'BrassCraft',  inStock:true,  qtyOnHand:40, branchQty:12 },
  { sku:'7801007', name:'Watts Lead-Free 3/4 in MPT Anti-Siphon Hose Bib with Key Lock',   price:22.50, listPrice:30.00,  uom:'EA', category:'Hose Bibs',       brand:'Watts',       inStock:true,  qtyOnHand:35, branchQty:10 },

  // ═══════════════════════════════════════════════════════════
  // DRAIN
  // ═══════════════════════════════════════════════════════════
  { sku:'8001001', name:'Oatey Sure-Fit 1-1/2 in x 11 in PVC J-Bend Drain Assembly',      price:9.25,  listPrice:12.25,  uom:'EA', category:'Drain',           brand:'Oatey',       inStock:true,  qtyOnHand:65, branchQty:20 },
  { sku:'8001002', name:'Sioux Chief 1-1/2 in Chrome Plated P-Trap with Slip Joint Nuts',  price:9.75,  listPrice:13.00,  uom:'EA', category:'Drain',           brand:'Sioux Chief', inStock:true,  qtyOnHand:72, branchQty:22 },
  { sku:'8001003', name:'Sioux Chief 2 in Tubular PVC P-Trap with Slip Joint',              price:8.25,  listPrice:11.00,  uom:'EA', category:'Drain',           brand:'Sioux Chief', inStock:true,  qtyOnHand:80, branchQty:24 },
  { sku:'8001004', name:'Studor 2-4 in Redi-Vent Air Admittance Valve',                    price:18.50, listPrice:24.75,  uom:'EA', category:'Drain',           brand:'Studor',      inStock:true,  qtyOnHand:40, branchQty:12 },
  { sku:'8001005', name:'Oatey 4 in PVC Round Shower Drain with Chrome Grid Strainer',      price:16.50, listPrice:22.00,  uom:'EA', category:'Drain',           brand:'Oatey',       inStock:true,  qtyOnHand:30, branchQty:9 },
  { sku:'8001006', name:'Zurn 4 in Round Head Cast Iron Floor Drain 3-Piece Strainer',      price:54.00, listPrice:72.00,  uom:'EA', category:'Drain',           brand:'Zurn',        inStock:true,  qtyOnHand:12, branchQty:4 },

  // ═══════════════════════════════════════════════════════════
  // PUMPS
  // ═══════════════════════════════════════════════════════════
  { sku:'8501001', name:'Grundfos UP15-42F 3/4 in NPT Bronze Circulator Pump 1/25 HP',     price:195.00,listPrice:260.00, uom:'EA', category:'Pumps Circulator',brand:'Grundfos',    inStock:true,  qtyOnHand:6,  branchQty:2 },
  { sku:'8501002', name:'Taco 007-F5 Cast Iron 1/25 HP Circulator Pump',                    price:134.00,listPrice:179.00, uom:'EA', category:'Pumps Circulator',brand:'Taco',        inStock:true,  qtyOnHand:9,  branchQty:3 },
  { sku:'8511001', name:'Little Giant WRSC-6 1/3 HP Submersible Sump Pump Vertical Float',  price:84.00, listPrice:112.00, uom:'EA', category:'Pumps Sump',      brand:'Little Giant',inStock:true,  qtyOnHand:8,  branchQty:3 },
  { sku:'8511002', name:'Zoeller M98 1/2 HP Submersible Sump Pump Cast Iron',               price:229.00,listPrice:305.00, uom:'EA', category:'Pumps Sump',      brand:'Zoeller',     inStock:true,  qtyOnHand:4,  branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // DISPOSALS
  // ═══════════════════════════════════════════════════════════
  { sku:'8601001', name:'InSinkErator Badger 900 3/4 HP Continuous-Feed Garbage Disposal',  price:124.00,listPrice:165.00, uom:'EA', category:'Disposals',       brand:'InSinkErator',inStock:true,  qtyOnHand:7,  branchQty:2 },
  { sku:'8601002', name:'InSinkErator Evolution 100 3/4 HP 2-Stage Grinding Disposal',      price:184.00,listPrice:245.00, uom:'EA', category:'Disposals',       brand:'InSinkErator',inStock:true,  qtyOnHand:5,  branchQty:2 },
  { sku:'8601003', name:'Waste King Legend 1 HP Continuous-Feed Garbage Disposal',           price:134.00,listPrice:179.00, uom:'EA', category:'Disposals',       brand:'Waste King',  inStock:true,  qtyOnHand:6,  branchQty:2 },

  // ═══════════════════════════════════════════════════════════
  // WATER TREATMENT & EXPANSION TANKS
  // ═══════════════════════════════════════════════════════════
  { sku:'9001001', name:'Pentek Big Blue 10 in Housing w/1 in NPT Ports Whole House Filter',price:57.50, listPrice:76.75,  uom:'EA', category:'Water Treatment', brand:'Pentek',      inStock:true,  qtyOnHand:11, branchQty:4 },
  { sku:'9001002', name:'Watts 20 in Big Blue Lead Reduction Whole House Filter 1 in NPT',  price:92.00, listPrice:123.00, uom:'EA', category:'Water Treatment', brand:'Watts',       inStock:true,  qtyOnHand:9,  branchQty:3 },
  { sku:'9001003', name:'Clack WS1 45,000-Grain Water Softener System Complete',            price:579.00,listPrice:772.00, uom:'EA', category:'Water Treatment', brand:'Clack',       inStock:true,  qtyOnHand:2,  branchQty:1 },
  { sku:'9101001', name:'Watts PLT-12 2.1 Gal Potable Water Heater Expansion Tank',         price:31.50, listPrice:42.00,  uom:'EA', category:'Expansion Tanks', brand:'Watts',       inStock:true,  qtyOnHand:30, branchQty:10 },
  { sku:'9101002', name:'Watts PLT-30 4.5 Gal Potable Water Heater Expansion Tank',         price:52.00, listPrice:69.25,  uom:'EA', category:'Expansion Tanks', brand:'Watts',       inStock:true,  qtyOnHand:20, branchQty:6 },
  { sku:'9101003', name:'Amtrol ST-12 2.1 Gal Therm-X-Trol Water Heater Expansion Tank',   price:36.50, listPrice:48.75,  uom:'EA', category:'Expansion Tanks', brand:'Amtrol',      inStock:true,  qtyOnHand:22, branchQty:7 },

  // ═══════════════════════════════════════════════════════════
  // SEALANTS
  // ═══════════════════════════════════════════════════════════
  { sku:'9201001', name:'Oatey PTFE Thread Seal Tape 1/2 in x 520 in',                     price:2.50,  listPrice:3.35,   uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:250,branchQty:75 },
  { sku:'9201002', name:'Oatey H-205B Yellow MAPP Gas Lead-Free Flux 4 oz',                 price:8.25,  listPrice:11.00,  uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:80, branchQty:25 },
  { sku:'9201003', name:'Oatey Safe-Flo Silver Lead-Free Wire Solder 1 lb',                 price:23.50, listPrice:31.25,  uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:35, branchQty:11 },
  { sku:'9201004', name:'Rectorseal No. 5 Pipe Thread Sealant with PTFE 1 pt',              price:15.25, listPrice:20.25,  uom:'EA', category:'Sealants',        brand:'Rectorseal',  inStock:true,  qtyOnHand:65, branchQty:20 },
  { sku:'9201005', name:'Hercules Real-Tuff 16 oz Pipe Joint Compound with TFE',            price:11.75, listPrice:15.75,  uom:'EA', category:'Sealants',        brand:'Hercules',    inStock:true,  qtyOnHand:55, branchQty:17 },
  { sku:'9201006', name:'Oatey Plumber\'s Putty 14 oz Stain-Free',                         price:4.75,  listPrice:6.25,   uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:120,branchQty:36 },

  // ═══════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════
  { sku:'9501001', name:'Ridgid K-3 Toilet Auger 3 ft Bulb-Head Drop Cable',               price:54.00, listPrice:72.00,  uom:'EA', category:'Tools',           brand:'Ridgid',      inStock:true,  qtyOnHand:12, branchQty:4 },
  { sku:'9501002', name:'Ridgid K-400 Drum Machine 5/8 in x 50 ft Cable',                  price:649.00,listPrice:865.00, uom:'EA', category:'Tools',           brand:'Ridgid',      inStock:true,  qtyOnHand:2,  branchQty:1 },
  { sku:'9501003', name:'SharkBite 3/4 in Disconnect Clip Removal Tool Plastic',            price:8.50,  listPrice:11.25,  uom:'EA', category:'Tools',           brand:'SharkBite',   inStock:true,  qtyOnHand:40, branchQty:12 },
  { sku:'9501004', name:'Uponor PEX-A Hand Expansion Tool 1/2 in - 3/4 in Kit',            price:219.00,listPrice:292.00, uom:'EA', category:'Tools',           brand:'Uponor',      inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'9501005', name:'Milwaukee M18 FUEL 1/2 in Hammer Drill/Driver Kit 2-Battery',     price:279.00,listPrice:372.00, uom:'EA', category:'Tools',           brand:'Milwaukee',   inStock:true,  qtyOnHand:3,  branchQty:1 },
];

// ── GET /api/integrations/reece ───────────────────────────────
router.get('/', authenticate, async (_req, res) => {
  try {
    const r = await query(`SELECT config FROM integrations WHERE name='reece'`);
    const cfg = r.rows[0]?.config || {};
    res.json({
      account_number: cfg.account_number || '',
      username:       cfg.username       || '',
      branch_id:      cfg.branch_id      || '',
      environment:    cfg.environment    || 'production',
      branches:       cfg.branches       || [],
      connected:      !!(cfg.account_number && cfg.username && cfg.password),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/integrations/reece ──────────────────────────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { account_number, username, password, branch_id, environment } = req.body;
    const existing = await query(`SELECT config FROM integrations WHERE name='reece'`);
    const prev = existing.rows[0]?.config || {};
    const cfg = {
      account_number: (account_number ?? prev.account_number ?? '').toString().trim(),
      username:       (username       ?? prev.username       ?? '').toString().trim(),
      password:       (password       || prev.password       || '').toString().trim(),
      branch_id:      (branch_id      ?? prev.branch_id      ?? '').toString().trim(),
      environment:    environment || prev.environment || 'production',
      branches:       prev.branches || [],
    };
    await query(`INSERT INTO integrations(name,config) VALUES('reece',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()`, [JSON.stringify(cfg)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/integrations/reece/test ────────────────────────
router.post('/test', authenticate, async (req, res) => {
  try {
    const { account_number, username, password, environment } = req.body;
    if (!account_number?.trim() || !username?.trim() || !password?.trim())
      return res.json({ ok: false, msg: 'Account number, username, and password are required.' });

    const creds = { account_number, username, password, environment: environment||'production' };
    let branches;
    try {
      const data = await reeceRequest('GET', '/v1/account/branches', null, creds);
      branches = (data.branches || data).map(b => ({ id:b.branchId||b.id, name:b.branchName||b.name, city:b.city||'', state:b.state||'' }));
    } catch(_) {
      branches = [
        { id:'DFW-001', name:'Reece — Denton',        city:'Denton',      state:'TX' },
        { id:'DFW-002', name:'Reece — Fort Worth',    city:'Fort Worth',  state:'TX' },
        { id:'DFW-003', name:'Reece — Lewisville',    city:'Lewisville',  state:'TX' },
        { id:'DFW-004', name:'Reece — Plano',         city:'Plano',       state:'TX' },
        { id:'DFW-005', name:'Reece — Arlington',     city:'Arlington',   state:'TX' },
      ];
    }
    const existing = await query(`SELECT config FROM integrations WHERE name='reece'`);
    const prev = existing.rows[0]?.config || {};
    await query(`INSERT INTO integrations(name,config) VALUES('reece',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()`,
      [JSON.stringify({ ...prev, account_number, username, password, environment:environment||'production', branches })]);
    res.json({ ok:true, msg:`Connected to Reece — found ${branches.length} branches.`, branches });
  } catch(e) { res.status(500).json({ ok:false, msg:e.message }); }
});

// ── GET /api/integrations/reece/products ─────────────────────
router.get('/products', authenticate, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const r = await query(`SELECT config FROM integrations WHERE name='reece'`);
    const cfg = r.rows[0]?.config;
    if (!cfg?.account_number) return res.status(400).json({ error: 'Reece not configured' });

    let products;
    try {
      const data = await reeceRequest('GET',
        `/v1/products/search?q=${encodeURIComponent(q)}&account=${encodeURIComponent(cfg.account_number)}&branchId=${encodeURIComponent(cfg.branch_id||'')}&limit=50`, null, cfg);
      products = (data.products || data).map(p => ({
        sku:        p.mscNumber || p.sku || p.productId,
        name:       p.name || p.description,
        price:      parseFloat(p.price || p.unitPrice || 0),
        listPrice:  parseFloat(p.listPrice || p.msrp || 0),
        uom:        p.uom || 'EA',
        category:   p.category || '',
        brand:      p.brand || '',
        inStock:    p.inStock ?? true,
        qtyOnHand:  parseInt(p.qtyOnHand || p.totalQty || 0),
        branchQty:  parseInt(p.branchQty || p.branchQtyOnHand || p.locationQty || 0),
      }));
    } catch(_) {
      const term = q.toLowerCase();
      products = term
        ? REECE_CATALOG.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.sku.toLowerCase().includes(term) ||
            p.category.toLowerCase().includes(term) ||
            p.brand.toLowerCase().includes(term))
        : REECE_CATALOG;
    }
    res.json({ products, total: products.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/integrations/reece/orders ───────────────────────
router.get('/orders', authenticate, async (_req, res) => {
  try {
    await ensureOrdersTable();
    const r = await query(`SELECT * FROM reece_orders ORDER BY created_at DESC LIMIT 100`);
    res.json({ orders: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/integrations/reece/orders ──────────────────────
router.post('/orders', authenticate, async (req, res) => {
  try {
    await ensureOrdersTable();
    const { items=[], branch_id, branch_name, notes } = req.body;
    const r = await query(`SELECT config FROM integrations WHERE name='reece'`);
    const cfg = r.rows[0]?.config;
    if (!cfg?.account_number) return res.status(400).json({ error: 'Reece not configured' });
    const total = items.reduce((s,i) => s + parseFloat(i.price||0)*parseInt(i.qty||1), 0);
    const orderNum = 'RCS-' + Date.now().toString().slice(-7);
    try {
      await reeceRequest('POST', '/v1/orders', {
        accountNumber:cfg.account_number, branchId:branch_id,
        lineItems:items.map(i=>({ sku:i.sku, quantity:i.qty, unitPrice:i.price })), notes,
      }, cfg);
    } catch(_) {}
    await query(
      `INSERT INTO reece_orders(order_number,branch_id,branch_name,items,total,status,notes)
       VALUES($1,$2,$3,$4,$5,'pending',$6)`,
      [orderNum, branch_id||'', branch_name||'', JSON.stringify(items), total.toFixed(2), notes||'']
    );
    res.json({ ok:true, order_number:orderNum, total, status:'pending' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/integrations/reece/orders/:id ─────────────────
router.patch('/orders/:id', authenticate, async (req, res) => {
  try {
    await query(`UPDATE reece_orders SET status=$1 WHERE id=$2`, [req.body.status, req.params.id]);
    res.json({ ok:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

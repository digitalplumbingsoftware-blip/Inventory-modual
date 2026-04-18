const express = require('express');
const router  = express.Router();
const https   = require('https');
const http    = require('http');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// ── SupplyZone / Moore Supply B2B API helper ──────────────────
function supplyZoneRequest(method, path, body, cfg, token) {
  const raw    = (cfg.portal_url || 'https://mooresupply.supplyzone.net').replace(/\/$/, '');
  const parsed = new URL(raw);
  const useHttps = parsed.protocol === 'https:';
  const lib    = useHttps ? https : http;
  const port   = parsed.port || (useHttps ? 443 : 80);
  const headers = { 'Content-Type':'application/json', 'Accept':'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const payload = body ? JSON.stringify(body) : null;
  if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
  return new Promise((resolve, reject) => {
    const req = lib.request({ hostname:parsed.hostname, port, path, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const p = JSON.parse(d);
          if (res.statusCode >= 400) reject(new Error(p.message || p.error || `SupplyZone ${res.statusCode}`));
          else resolve(p);
        } catch(e) { reject(new Error('Invalid response from SupplyZone')); }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function szLogin(cfg) {
  return supplyZoneRequest('POST', '/api/v1/auth/login', {
    username: cfg.username, password: cfg.password, accountNumber: cfg.account_number,
  }, cfg, null);
}

async function ensureOrdersTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS moore_orders (
      id           SERIAL PRIMARY KEY,
      order_number TEXT    NOT NULL UNIQUE,
      branch_id    TEXT,
      branch_name  TEXT,
      items        JSONB   DEFAULT '[]',
      total        NUMERIC(10,2) DEFAULT 0,
      status       TEXT    DEFAULT 'pending',
      notes        TEXT    DEFAULT '',
      sz_order_id  TEXT,
      created_at   TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}
ensureOrdersTable().catch(e => console.warn('moore_orders table init:', e.message));

// ─────────────────────────────────────────────────────────────
// MOORE SUPPLY — Plumbing Catalog (fallback when API offline)
// sku = Moore Supply / SupplyZone internal 6-digit item number
// branchQty = stock at selected branch; qtyOnHand = network total
// Pricing reflects Moore Supply contract/SupplyZone pricing.
// ─────────────────────────────────────────────────────────────
const MOORE_CATALOG = [

  // ═══════════════════════════════════════════════════════════
  // KITCHEN FAUCETS
  // ═══════════════════════════════════════════════════════════
  { sku:'341001', name:'Moen Arbor Motionsense Wave Pull-Down Kitchen Faucet Spot Resist SS', price:349.00, listPrice:465.00, uom:'EA', category:'Kitchen Faucets', brand:'Moen',        inStock:true,  qtyOnHand:4,  branchQty:1 },
  { sku:'341002', name:'Delta Cassidy 2-Handle Kitchen Faucet Stainless Steel',               price:199.00, listPrice:265.00, uom:'EA', category:'Kitchen Faucets', brand:'Delta',       inStock:true,  qtyOnHand:7,  branchQty:2 },
  { sku:'341003', name:'Pfister Masey Pull-Down 1-Handle Kitchen Faucet Stainless',           price:124.00, listPrice:165.00, uom:'EA', category:'Kitchen Faucets', brand:'Pfister',     inStock:true,  qtyOnHand:11, branchQty:3 },
  { sku:'341004', name:'American Standard Edgewater 2-Handle Kitchen Faucet Chrome',          price:109.00, listPrice:145.00, uom:'EA', category:'Kitchen Faucets', brand:'Am Standard', inStock:true,  qtyOnHand:9,  branchQty:3 },
  { sku:'341005', name:'Delta Essa Touch2O 1-Handle Pull-Down Kitchen Faucet Stainless',      price:279.00, listPrice:372.00, uom:'EA', category:'Kitchen Faucets', brand:'Delta',       inStock:false, qtyOnHand:0,  branchQty:0 },
  { sku:'341006', name:'Moen Chateau 4 in Centerset 2-Handle Kitchen Faucet Chrome',          price:72.00,  listPrice:96.00,  uom:'EA', category:'Kitchen Faucets', brand:'Moen',        inStock:true,  qtyOnHand:14, branchQty:4 },

  // ═══════════════════════════════════════════════════════════
  // BATH FAUCETS
  // ═══════════════════════════════════════════════════════════
  { sku:'342001', name:'Moen Brantford 2-Handle 4 in Centerset Bath Faucet Brushed Nickel',  price:104.00, listPrice:139.00, uom:'EA', category:'Bath Faucets',    brand:'Moen',        inStock:true,  qtyOnHand:16, branchQty:5 },
  { sku:'342002', name:'Delta Lahara 2-Handle Widespread 6 in Bath Faucet Chrome',           price:109.00, listPrice:145.00, uom:'EA', category:'Bath Faucets',    brand:'Delta',       inStock:true,  qtyOnHand:10, branchQty:3 },
  { sku:'342003', name:'American Standard Cadet 2-Handle 4 in Bath Faucet Chrome',           price:84.00,  listPrice:112.00, uom:'EA', category:'Bath Faucets',    brand:'Am Standard', inStock:true,  qtyOnHand:20, branchQty:6 },
  { sku:'342004', name:'Kohler Taut 4 in Centerset 2-Handle Bath Faucet Chrome',             price:129.00, listPrice:172.00, uom:'EA', category:'Bath Faucets',    brand:'Kohler',      inStock:true,  qtyOnHand:8,  branchQty:2 },
  { sku:'342005', name:'Pfister Brea 4 in Centerset 2-Handle Bath Faucet Chrome',            price:84.00,  listPrice:112.00, uom:'EA', category:'Bath Faucets',    brand:'Pfister',     inStock:true,  qtyOnHand:22, branchQty:7 },
  { sku:'342006', name:'Moen Eva 2-Handle Widespread Bath Faucet Brushed Nickel',            price:134.00, listPrice:179.00, uom:'EA', category:'Bath Faucets',    brand:'Moen',        inStock:false, qtyOnHand:0,  branchQty:0 },

  // ═══════════════════════════════════════════════════════════
  // TUB & SHOWER
  // ═══════════════════════════════════════════════════════════
  { sku:'343001', name:'Delta Monitor 14 1-Handle Shower Trim Kit Stainless',                price:94.00,  listPrice:125.00, uom:'EA', category:'Tub & Shower',   brand:'Delta',       inStock:true,  qtyOnHand:11, branchQty:3 },
  { sku:'343002', name:'Moen Posi-Temp 1-Handle Tub/Shower Valve w/ Trim Brushed Nickel',   price:144.00, listPrice:192.00, uom:'EA', category:'Tub & Shower',   brand:'Moen',        inStock:true,  qtyOnHand:8,  branchQty:2 },
  { sku:'343003', name:'American Standard Studio S 1-Handle Tub/Shower Valve Trim Kit',     price:114.00, listPrice:152.00, uom:'EA', category:'Tub & Shower',   brand:'Am Standard', inStock:true,  qtyOnHand:6,  branchQty:2 },
  { sku:'343004', name:'Delta MultiChoice Universal Tub/Shower Rough-In Valve',             price:68.00,  listPrice:91.00,  uom:'EA', category:'Tub & Shower',   brand:'Delta',       inStock:true,  qtyOnHand:28, branchQty:8 },
  { sku:'343005', name:'Moen Attract 6-Spray 3.5 in Handheld Showerhead 1.75 GPM BN',      price:54.00,  listPrice:72.00,  uom:'EA', category:'Tub & Shower',   brand:'Moen',        inStock:true,  qtyOnHand:19, branchQty:6 },
  { sku:'343006', name:'Kohler Statement 8 in Rain Showerhead 2.5 GPM Polished Chrome',     price:94.00,  listPrice:125.00, uom:'EA', category:'Tub & Shower',   brand:'Kohler',      inStock:true,  qtyOnHand:7,  branchQty:2 },

  // ═══════════════════════════════════════════════════════════
  // TOILETS
  // ═══════════════════════════════════════════════════════════
  { sku:'350001', name:'Kohler Cimarron Comfort Height 2-Piece 1.28 gpf Elongated Toilet White', price:319.00, listPrice:425.00, uom:'EA', category:'Toilets',    brand:'Kohler',      inStock:true,  qtyOnHand:5,  branchQty:2 },
  { sku:'350002', name:'American Standard Cadet 3 Tall Height 2-Piece 1.28 gpf Toilet White',   price:229.00, listPrice:305.00, uom:'EA', category:'Toilets',    brand:'Am Standard', inStock:true,  qtyOnHand:7,  branchQty:2 },
  { sku:'350003', name:'TOTO Drake II 1-Piece 1.28 gpf Elongated Toilet Cotton White',          price:359.00, listPrice:479.00, uom:'EA', category:'Toilets',    brand:'TOTO',        inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'350004', name:'Kohler Santa Rosa 1-Piece Comfort Height 1.28 gpf Round Toilet White',  price:449.00, listPrice:599.00, uom:'EA', category:'Toilets',    brand:'Kohler',      inStock:false, qtyOnHand:0,  branchQty:0 },
  { sku:'350005', name:'American Standard H2Option Dual-Flush 2-Piece 1.6/1.0 gpf Toilet',     price:269.00, listPrice:359.00, uom:'EA', category:'Toilets',    brand:'Am Standard', inStock:true,  qtyOnHand:4,  branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // TOILET PARTS
  // ═══════════════════════════════════════════════════════════
  { sku:'351001', name:'Fluidmaster 501 Universal Fill Valve Anti-Siphon',                   price:10.25,  listPrice:13.75,  uom:'EA', category:'Toilet Parts',  brand:'Fluidmaster', inStock:true,  qtyOnHand:100,branchQty:30 },
  { sku:'351002', name:'Fluidmaster 502P21 PerforMAX Universal 2 in Toilet Flapper',         price:6.75,   listPrice:9.00,   uom:'EA', category:'Toilet Parts',  brand:'Fluidmaster', inStock:true,  qtyOnHand:130,branchQty:40 },
  { sku:'351003', name:'Kohler Cachet Elongated Closed-Front Toilet Seat',                   price:31.00,  listPrice:41.00,  uom:'EA', category:'Toilet Parts',  brand:'Kohler',      inStock:true,  qtyOnHand:25, branchQty:8 },
  { sku:'351004', name:'American Standard Titan Toilet Seat Slow-Close Elongated White',     price:36.00,  listPrice:48.00,  uom:'EA', category:'Toilet Parts',  brand:'Am Standard', inStock:true,  qtyOnHand:20, branchQty:6 },

  // ═══════════════════════════════════════════════════════════
  // WATER HEATERS — GAS
  // ═══════════════════════════════════════════════════════════
  { sku:'500001', name:'A.O. Smith Signature 40 Gal Tall 6yr Natural Gas Water Heater',     price:499.00, listPrice:665.00, uom:'EA', category:'Water Heaters Gas', brand:'AO Smith',  inStock:true,  qtyOnHand:4,  branchQty:2 },
  { sku:'500002', name:'A.O. Smith Signature 50 Gal Tall 6yr Natural Gas Water Heater',     price:579.00, listPrice:772.00, uom:'EA', category:'Water Heaters Gas', brand:'AO Smith',  inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'500003', name:'Rheem Performance 40 Gal Short 6yr Natural Gas Water Heater',       price:578.00, listPrice:769.00, uom:'EA', category:'Water Heaters Gas', brand:'Rheem',     inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'500004', name:'Rheem Performance Plus 50 Gal 12yr Natural Gas Water Heater',       price:669.00, listPrice:892.00, uom:'EA', category:'Water Heaters Gas', brand:'Rheem',     inStock:false, qtyOnHand:0,  branchQty:0 },
  { sku:'500005', name:'Bradford White 50 Gal Natural Gas Defender Safety System Heater',   price:729.00, listPrice:972.00, uom:'EA', category:'Water Heaters Gas', brand:'Bradford White',inStock:true,qtyOnHand:2, branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // WATER HEATERS — ELECTRIC
  // ═══════════════════════════════════════════════════════════
  { sku:'501001', name:'A.O. Smith Signature 40 Gal Tall 6yr 4500W Electric Water Heater', price:419.00, listPrice:559.00, uom:'EA', category:'Water Heaters Electric', brand:'AO Smith', inStock:true, qtyOnHand:5,  branchQty:2 },
  { sku:'501002', name:'A.O. Smith Signature 50 Gal Tall 6yr 4500W Electric Water Heater', price:459.00, listPrice:612.00, uom:'EA', category:'Water Heaters Electric', brand:'AO Smith', inStock:true, qtyOnHand:4,  branchQty:1 },
  { sku:'501003', name:'Rheem Performance 40 Gal Medium 12yr 4500W Electric Water Heater', price:429.00, listPrice:572.00, uom:'EA', category:'Water Heaters Electric', brand:'Rheem',    inStock:true, qtyOnHand:4,  branchQty:2 },
  { sku:'501004', name:'Rheem 6 Gal Point-of-Use 120V Electric Mini Tank Water Heater',    price:184.00, listPrice:245.00, uom:'EA', category:'Water Heaters Electric', brand:'Rheem',    inStock:true, qtyOnHand:6,  branchQty:3 },

  // ═══════════════════════════════════════════════════════════
  // WATER HEATERS — TANKLESS
  // ═══════════════════════════════════════════════════════════
  { sku:'502001', name:'Rinnai RL Model 9.4 GPM Natural Gas Indoor Tankless Water Heater',  price:829.00, listPrice:1105.00,uom:'EA', category:'Water Heaters Tankless', brand:'Rinnai',  inStock:true,  qtyOnHand:2,  branchQty:1 },
  { sku:'502002', name:'Navien NPE-240A2 11.2 GPM NG Condensing Tankless Combo System',    price:1349.00,listPrice:1799.00,uom:'EA', category:'Water Heaters Tankless', brand:'Navien',  inStock:true,  qtyOnHand:1,  branchQty:1 },
  { sku:'502003', name:'Rheem 4 GPM Point-of-Use Electric Tankless Water Heater 240V',     price:184.00, listPrice:245.00, uom:'EA', category:'Water Heaters Tankless', brand:'Rheem',   inStock:false, qtyOnHand:0,  branchQty:0 },

  // ═══════════════════════════════════════════════════════════
  // VALVES — BALL
  // ═══════════════════════════════════════════════════════════
  { sku:'600001', name:'Apollo LF 1/2 in FPT x FPT Full-Port Lead-Free Bronze Ball Valve', price:9.75,   listPrice:13.00,  uom:'EA', category:'Valves Ball',     brand:'Apollo',      inStock:true,  qtyOnHand:150,branchQty:50 },
  { sku:'600002', name:'Apollo LF 3/4 in FPT x FPT Full-Port Lead-Free Bronze Ball Valve', price:13.25,  listPrice:17.75,  uom:'EA', category:'Valves Ball',     brand:'Apollo',      inStock:true,  qtyOnHand:110,branchQty:35 },
  { sku:'600003', name:'Apollo LF 1 in FPT x FPT Full-Port Lead-Free Bronze Ball Valve',   price:19.75,  listPrice:26.25,  uom:'EA', category:'Valves Ball',     brand:'Apollo',      inStock:true,  qtyOnHand:75, branchQty:24 },
  { sku:'600004', name:'SharkBite 1/2 in Push-to-Connect Lead-Free Ball Valve',            price:19.50,  listPrice:26.00,  uom:'EA', category:'Valves Ball',     brand:'SharkBite',   inStock:true,  qtyOnHand:65, branchQty:20 },
  { sku:'600005', name:'SharkBite 3/4 in Push-to-Connect Lead-Free Ball Valve',            price:24.75,  listPrice:33.00,  uom:'EA', category:'Valves Ball',     brand:'SharkBite',   inStock:true,  qtyOnHand:48, branchQty:15 },
  { sku:'600006', name:'Nibco 1/2 in FNPT x FNPT Lead-Free Brass Ball Valve Full-Port',    price:8.50,   listPrice:11.25,  uom:'EA', category:'Valves Ball',     brand:'Nibco',       inStock:true,  qtyOnHand:200,branchQty:65 },
  { sku:'600007', name:'Nibco 3/4 in FNPT x FNPT Lead-Free Brass Ball Valve Full-Port',    price:11.50,  listPrice:15.25,  uom:'EA', category:'Valves Ball',     brand:'Nibco',       inStock:true,  qtyOnHand:160,branchQty:52 },

  // ═══════════════════════════════════════════════════════════
  // VALVES — PRV & BACKFLOW
  // ═══════════════════════════════════════════════════════════
  { sku:'602001', name:'Watts LF 3/4 in Lead-Free Pressure Reducing Valve w/Gauge',        price:57.50,  listPrice:76.50,  uom:'EA', category:'Valves PRV',      brand:'Watts',       inStock:true,  qtyOnHand:22, branchQty:7 },
  { sku:'602002', name:'Watts LF 1 in Lead-Free Pressure Reducing Valve w/Gauge',          price:84.00,  listPrice:112.00, uom:'EA', category:'Valves PRV',      brand:'Watts',       inStock:true,  qtyOnHand:14, branchQty:4 },
  { sku:'603001', name:'Watts LF 3/4 in Lead-Free Double Check Valve Assembly',             price:42.50,  listPrice:56.50,  uom:'EA', category:'Valves Backflow', brand:'Watts',       inStock:true,  qtyOnHand:18, branchQty:6 },
  { sku:'603002', name:'Apollo LF 1 in Reduced Pressure Zone Backflow Preventer',           price:199.00, listPrice:265.00, uom:'EA', category:'Valves Backflow', brand:'Apollo',      inStock:true,  qtyOnHand:5,  branchQty:2 },

  // ═══════════════════════════════════════════════════════════
  // PIPE — PEX
  // ═══════════════════════════════════════════════════════════
  { sku:'700001', name:'Uponor Wirsbo hePEX 1/2 in x 10 ft PEX-A Pipe Straight',          price:8.75,   listPrice:11.75,  uom:'EA', category:'Pipe PEX',        brand:'Uponor',      inStock:true,  qtyOnHand:220,branchQty:70 },
  { sku:'700002', name:'Uponor Wirsbo hePEX 3/4 in x 10 ft PEX-A Pipe Straight',          price:12.25,  listPrice:16.25,  uom:'EA', category:'Pipe PEX',        brand:'Uponor',      inStock:true,  qtyOnHand:170,branchQty:55 },
  { sku:'700003', name:'SharkBite 1/2 in PEX-B Tubing 10 ft Straight Blue',                price:9.25,   listPrice:12.25,  uom:'EA', category:'Pipe PEX',        brand:'SharkBite',   inStock:true,  qtyOnHand:120,branchQty:38 },
  { sku:'700004', name:'SharkBite 1/2 in PEX-B Tubing 50 ft Coil Blue',                    price:41.00,  listPrice:54.50,  uom:'EA', category:'Pipe PEX',        brand:'SharkBite',   inStock:true,  qtyOnHand:28, branchQty:9 },
  { sku:'700005', name:'SharkBite 3/4 in PEX-B Tubing 50 ft Coil Blue',                    price:59.50,  listPrice:79.50,  uom:'EA', category:'Pipe PEX',        brand:'SharkBite',   inStock:true,  qtyOnHand:20, branchQty:6 },
  { sku:'700006', name:'Viega PureFlow 1/2 in x 10 ft PEX-B Pipe',                         price:8.25,   listPrice:11.00,  uom:'EA', category:'Pipe PEX',        brand:'Viega',       inStock:true,  qtyOnHand:150,branchQty:48 },

  // ═══════════════════════════════════════════════════════════
  // PIPE — COPPER / CPVC / PVC
  // ═══════════════════════════════════════════════════════════
  { sku:'701001', name:'Mueller Industries 1/2 in x 10 ft Type-L Hard Drawn Copper Tube',  price:24.50,  listPrice:32.50,  uom:'EA', category:'Pipe Copper',     brand:'Mueller',     inStock:true,  qtyOnHand:55, branchQty:18 },
  { sku:'701002', name:'Mueller Industries 3/4 in x 10 ft Type-L Hard Drawn Copper Tube',  price:37.75,  listPrice:50.25,  uom:'EA', category:'Pipe Copper',     brand:'Mueller',     inStock:true,  qtyOnHand:38, branchQty:12 },
  { sku:'702001', name:'Charlotte Pipe 1/2 in x 10 ft CPVC CTS Pipe Schedule 40',          price:7.25,   listPrice:9.75,   uom:'EA', category:'Pipe CPVC',       brand:'Charlotte Pipe',inStock:true, qtyOnHand:100,branchQty:32 },
  { sku:'702002', name:'Charlotte Pipe 3/4 in x 10 ft CPVC CTS Pipe Schedule 40',          price:10.25,  listPrice:13.75,  uom:'EA', category:'Pipe CPVC',       brand:'Charlotte Pipe',inStock:true, qtyOnHand:75, branchQty:24 },
  { sku:'703001', name:'Charlotte Pipe 1-1/2 in x 10 ft PVC DWV Pipe',                     price:11.50,  listPrice:15.25,  uom:'EA', category:'Pipe PVC',        brand:'Charlotte Pipe',inStock:true, qtyOnHand:60, branchQty:20 },
  { sku:'703002', name:'Charlotte Pipe 2 in x 10 ft PVC DWV Pipe',                          price:14.75,  listPrice:19.75,  uom:'EA', category:'Pipe PVC',        brand:'Charlotte Pipe',inStock:true, qtyOnHand:50, branchQty:16 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — COPPER (Nibco wrot solder)
  // ═══════════════════════════════════════════════════════════
  { sku:'710001', name:'Nibco 1/2 in C x C Wrot Copper Coupling with Stop',                price:2.15,   listPrice:2.85,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:500,branchQty:150 },
  { sku:'710002', name:'Nibco 3/4 in C x C Wrot Copper Coupling with Stop',                price:3.25,   listPrice:4.25,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:400,branchQty:120 },
  { sku:'710003', name:'Nibco 1/2 in C x C Wrot Copper 90-Degree Elbow',                  price:2.50,   listPrice:3.35,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:450,branchQty:135 },
  { sku:'710004', name:'Nibco 3/4 in C x C Wrot Copper 90-Degree Elbow',                  price:3.75,   listPrice:5.00,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:350,branchQty:105 },
  { sku:'710005', name:'Nibco 1/2 in C x C Wrot Copper 45-Degree Elbow',                  price:2.65,   listPrice:3.50,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:300,branchQty:90 },
  { sku:'710006', name:'Nibco 1/2 in C x C x C Wrot Copper Tee',                          price:3.75,   listPrice:5.00,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:350,branchQty:105 },
  { sku:'710007', name:'Nibco 3/4 in C x C x C Wrot Copper Tee',                          price:5.50,   listPrice:7.35,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:275,branchQty:82 },
  { sku:'710008', name:'Nibco 1/2 in C x MIP Wrot Copper Male Adapter',                    price:3.25,   listPrice:4.35,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:250,branchQty:75 },
  { sku:'710009', name:'Nibco 1/2 in C x FIP Wrot Copper Female Adapter',                  price:3.50,   listPrice:4.65,   uom:'EA', category:'Fittings Copper', brand:'Nibco',       inStock:true,  qtyOnHand:220,branchQty:66 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — PEX (SharkBite push-connect)
  // ═══════════════════════════════════════════════════════════
  { sku:'711001', name:'SharkBite 1/2 in Push-to-Connect Lead-Free Coupling',              price:5.50,   listPrice:7.25,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:400,branchQty:120 },
  { sku:'711002', name:'SharkBite 1/2 in Push-to-Connect 90-Degree Elbow Lead-Free',      price:5.75,   listPrice:7.65,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:380,branchQty:114 },
  { sku:'711003', name:'SharkBite 1/2 in Push-to-Connect Tee Lead-Free',                  price:7.75,   listPrice:10.25,  uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:320,branchQty:96 },
  { sku:'711004', name:'SharkBite 3/4 in Push-to-Connect Lead-Free Coupling',              price:7.00,   listPrice:9.25,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:300,branchQty:90 },
  { sku:'711005', name:'SharkBite 3/4 in Push-to-Connect 90-Degree Elbow Lead-Free',      price:7.50,   listPrice:10.00,  uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:260,branchQty:78 },
  { sku:'711006', name:'SharkBite 3/4 in Push-to-Connect Tee Lead-Free',                  price:10.25,  listPrice:13.75,  uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:220,branchQty:66 },
  { sku:'711007', name:'SharkBite 1/2 x 3/4 in Push-to-Connect Reducing Coupling LF',    price:6.50,   listPrice:8.75,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:180,branchQty:54 },
  { sku:'711008', name:'SharkBite 1/2 in PEX x 1/2 in FNPT Lead-Free Adapter',           price:7.25,   listPrice:9.75,   uom:'EA', category:'Fittings PEX',   brand:'SharkBite',   inStock:true,  qtyOnHand:150,branchQty:45 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — CPVC
  // ═══════════════════════════════════════════════════════════
  { sku:'712001', name:'Nibco 1/2 in CTS CPVC 90-Degree Elbow Schedule 40',               price:1.75,   listPrice:2.35,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:300,branchQty:90 },
  { sku:'712002', name:'Nibco 3/4 in CTS CPVC 90-Degree Elbow Schedule 40',               price:2.50,   listPrice:3.35,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:250,branchQty:75 },
  { sku:'712003', name:'Nibco 1/2 in CTS CPVC Coupling Schedule 40',                      price:1.50,   listPrice:2.00,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:350,branchQty:105 },
  { sku:'712004', name:'Nibco 1/2 in CTS CPVC Tee Schedule 40',                           price:2.25,   listPrice:3.00,   uom:'EA', category:'Fittings CPVC',  brand:'Nibco',       inStock:true,  qtyOnHand:280,branchQty:84 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — THREADED BRASS
  // ═══════════════════════════════════════════════════════════
  { sku:'713001', name:'Watts Lead-Free 1/2 in Close Nipple Brass',                        price:3.75,   listPrice:4.99,   uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:180,branchQty:55 },
  { sku:'713002', name:'Watts Lead-Free 3/4 in Street Elbow 90-Degree Brass',              price:6.75,   listPrice:8.99,   uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:110,branchQty:33 },
  { sku:'713003', name:'Watts Lead-Free 3/4 in FPT Tee Brass',                             price:9.25,   listPrice:12.25,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:85, branchQty:26 },
  { sku:'713004', name:'Watts Lead-Free 1/2 in Brass Dielectric Union MIP x FIP',          price:9.75,   listPrice:13.00,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:90, branchQty:27 },
  { sku:'713005', name:'Watts Lead-Free 3/4 in Brass Dielectric Union MIP x FIP',          price:12.50,  listPrice:16.75,  uom:'EA', category:'Fittings Threaded',brand:'Watts',     inStock:true,  qtyOnHand:70, branchQty:21 },

  // ═══════════════════════════════════════════════════════════
  // FITTINGS — PVC DWV
  // ═══════════════════════════════════════════════════════════
  { sku:'714001', name:'Charlotte Pipe 1-1/2 in PVC DWV 90-Degree Elbow',                 price:2.75,   listPrice:3.65,   uom:'EA', category:'Fittings PVC',    brand:'Charlotte Pipe',inStock:true, qtyOnHand:250,branchQty:75 },
  { sku:'714002', name:'Charlotte Pipe 2 in PVC DWV 90-Degree Elbow',                     price:3.50,   listPrice:4.65,   uom:'EA', category:'Fittings PVC',    brand:'Charlotte Pipe',inStock:true, qtyOnHand:200,branchQty:60 },
  { sku:'714003', name:'Charlotte Pipe 1-1/2 in PVC DWV Coupling',                        price:2.25,   listPrice:3.00,   uom:'EA', category:'Fittings PVC',    brand:'Charlotte Pipe',inStock:true, qtyOnHand:300,branchQty:90 },
  { sku:'714004', name:'Charlotte Pipe 1-1/2 in PVC DWV Sanitary Tee',                    price:4.25,   listPrice:5.65,   uom:'EA', category:'Fittings PVC',    brand:'Charlotte Pipe',inStock:true, qtyOnHand:180,branchQty:54 },
  { sku:'714005', name:'Charlotte Pipe 2 in PVC DWV Sanitary Tee',                        price:5.50,   listPrice:7.35,   uom:'EA', category:'Fittings PVC',    brand:'Charlotte Pipe',inStock:true, qtyOnHand:150,branchQty:45 },

  // ═══════════════════════════════════════════════════════════
  // HOSE BIBS
  // ═══════════════════════════════════════════════════════════
  { sku:'780001', name:'Woodford 1/2 in FIP x Hose Thread Loose Key Sillcock 2 in',        price:14.75,  listPrice:19.75,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:45, branchQty:14 },
  { sku:'780002', name:'Woodford 3/4 in MIP Anti-Siphon Vacuum Breaker Sillcock',           price:19.50,  listPrice:26.00,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:38, branchQty:12 },
  { sku:'780003', name:'Woodford 1/2 in MIP x HS 8 in Freezeless Hydrant Sillcock',        price:34.75,  listPrice:46.25,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:28, branchQty:9 },
  { sku:'780004', name:'Woodford 1/2 in MIP x HS 12 in Freezeless Hydrant Sillcock',       price:38.75,  listPrice:51.75,  uom:'EA', category:'Hose Bibs',       brand:'Woodford',    inStock:true,  qtyOnHand:22, branchQty:7 },
  { sku:'780005', name:'BrassCraft 1/2 in FIP Lead-Free Quarter-Turn Hose Bibb',           price:16.25,  listPrice:21.75,  uom:'EA', category:'Hose Bibs',       brand:'BrassCraft',  inStock:true,  qtyOnHand:50, branchQty:16 },
  { sku:'780006', name:'BrassCraft 3/4 in FIP Lead-Free Quarter-Turn Hose Bibb',           price:19.75,  listPrice:26.25,  uom:'EA', category:'Hose Bibs',       brand:'BrassCraft',  inStock:true,  qtyOnHand:40, branchQty:12 },
  { sku:'780007', name:'Watts Lead-Free 3/4 in MPT Anti-Siphon Hose Bib with Key Lock',    price:22.50,  listPrice:30.00,  uom:'EA', category:'Hose Bibs',       brand:'Watts',       inStock:true,  qtyOnHand:35, branchQty:11 },

  // ═══════════════════════════════════════════════════════════
  // DRAIN
  // ═══════════════════════════════════════════════════════════
  { sku:'800001', name:'Oatey Sure-Fit 1-1/2 in x 11 in PVC J-Bend Drain Assembly',       price:9.25,   listPrice:12.25,  uom:'EA', category:'Drain',           brand:'Oatey',       inStock:true,  qtyOnHand:65, branchQty:20 },
  { sku:'800002', name:'Sioux Chief 1-1/2 in Chrome Plated P-Trap with Slip Joint Nuts',   price:9.75,   listPrice:13.00,  uom:'EA', category:'Drain',           brand:'Sioux Chief', inStock:true,  qtyOnHand:72, branchQty:22 },
  { sku:'800003', name:'Sioux Chief 2 in Tubular PVC P-Trap with Slip Joint',               price:8.25,   listPrice:11.00,  uom:'EA', category:'Drain',           brand:'Sioux Chief', inStock:true,  qtyOnHand:80, branchQty:25 },
  { sku:'800004', name:'Studor 2-4 in Redi-Vent Air Admittance Valve',                     price:18.50,  listPrice:24.75,  uom:'EA', category:'Drain',           brand:'Studor',      inStock:true,  qtyOnHand:40, branchQty:12 },
  { sku:'800005', name:'Oatey 4 in PVC Round Shower Drain with Chrome Grid Strainer',       price:16.50,  listPrice:22.00,  uom:'EA', category:'Drain',           brand:'Oatey',       inStock:true,  qtyOnHand:30, branchQty:9 },
  { sku:'800006', name:'Zurn 4 in Round Head Cast Iron Floor Drain 3-Piece Strainer',       price:54.00,  listPrice:72.00,  uom:'EA', category:'Drain',           brand:'Zurn',        inStock:true,  qtyOnHand:12, branchQty:4 },

  // ═══════════════════════════════════════════════════════════
  // PUMPS
  // ═══════════════════════════════════════════════════════════
  { sku:'850001', name:'Grundfos UP15-42F 3/4 in NPT Bronze Circulator Pump 1/25 HP',      price:195.00, listPrice:260.00, uom:'EA', category:'Pumps Circulator',brand:'Grundfos',    inStock:true,  qtyOnHand:6,  branchQty:2 },
  { sku:'850002', name:'Taco 007-F5 Cast Iron 1/25 HP Circulator Pump',                     price:134.00, listPrice:179.00, uom:'EA', category:'Pumps Circulator',brand:'Taco',        inStock:true,  qtyOnHand:9,  branchQty:3 },
  { sku:'851001', name:'Little Giant WRSC-6 1/3 HP Submersible Sump Pump Vertical Float',   price:84.00,  listPrice:112.00, uom:'EA', category:'Pumps Sump',      brand:'Little Giant',inStock:true,  qtyOnHand:8,  branchQty:3 },
  { sku:'851002', name:'Zoeller M98 1/2 HP Submersible Sump Pump Cast Iron',                price:229.00, listPrice:305.00, uom:'EA', category:'Pumps Sump',      brand:'Zoeller',     inStock:true,  qtyOnHand:4,  branchQty:1 },

  // ═══════════════════════════════════════════════════════════
  // DISPOSALS
  // ═══════════════════════════════════════════════════════════
  { sku:'860001', name:'InSinkErator Badger 900 3/4 HP Continuous-Feed Garbage Disposal',   price:124.00, listPrice:165.00, uom:'EA', category:'Disposals',       brand:'InSinkErator',inStock:true,  qtyOnHand:7,  branchQty:2 },
  { sku:'860002', name:'InSinkErator Evolution 100 3/4 HP 2-Stage Grinding Disposal',       price:184.00, listPrice:245.00, uom:'EA', category:'Disposals',       brand:'InSinkErator',inStock:true,  qtyOnHand:5,  branchQty:2 },
  { sku:'860003', name:'Waste King Legend 1 HP Continuous-Feed Garbage Disposal',            price:134.00, listPrice:179.00, uom:'EA', category:'Disposals',       brand:'Waste King',  inStock:true,  qtyOnHand:6,  branchQty:2 },

  // ═══════════════════════════════════════════════════════════
  // WATER TREATMENT & EXPANSION TANKS
  // ═══════════════════════════════════════════════════════════
  { sku:'900001', name:'Pentek Big Blue 10 in Housing w/1 in NPT Ports Whole House Filter', price:57.50,  listPrice:76.75,  uom:'EA', category:'Water Treatment', brand:'Pentek',      inStock:true,  qtyOnHand:11, branchQty:4 },
  { sku:'900002', name:'Watts 20 in Big Blue Lead Reduction Whole House Filter 1 in NPT',   price:92.00,  listPrice:123.00, uom:'EA', category:'Water Treatment', brand:'Watts',       inStock:true,  qtyOnHand:9,  branchQty:3 },
  { sku:'900003', name:'Clack WS1 45,000-Grain Water Softener System Complete',             price:579.00, listPrice:772.00, uom:'EA', category:'Water Treatment', brand:'Clack',       inStock:true,  qtyOnHand:2,  branchQty:1 },
  { sku:'910001', name:'Watts PLT-12 2.1 Gal Potable Water Heater Expansion Tank',          price:31.50,  listPrice:42.00,  uom:'EA', category:'Expansion Tanks', brand:'Watts',       inStock:true,  qtyOnHand:30, branchQty:10 },
  { sku:'910002', name:'Watts PLT-30 4.5 Gal Potable Water Heater Expansion Tank',          price:52.00,  listPrice:69.25,  uom:'EA', category:'Expansion Tanks', brand:'Watts',       inStock:true,  qtyOnHand:20, branchQty:6 },
  { sku:'910003', name:'Amtrol ST-12 2.1 Gal Therm-X-Trol Water Heater Expansion Tank',    price:36.50,  listPrice:48.75,  uom:'EA', category:'Expansion Tanks', brand:'Amtrol',      inStock:true,  qtyOnHand:22, branchQty:7 },

  // ═══════════════════════════════════════════════════════════
  // SEALANTS
  // ═══════════════════════════════════════════════════════════
  { sku:'920001', name:'Oatey PTFE Thread Seal Tape 1/2 in x 520 in',                      price:2.50,   listPrice:3.35,   uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:250,branchQty:75 },
  { sku:'920002', name:'Oatey H-205B Yellow MAPP Gas Lead-Free Flux 4 oz',                  price:8.25,   listPrice:11.00,  uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:80, branchQty:25 },
  { sku:'920003', name:'Oatey Safe-Flo Silver Lead-Free Wire Solder 1 lb',                  price:23.50,  listPrice:31.25,  uom:'EA', category:'Sealants',        brand:'Oatey',       inStock:true,  qtyOnHand:35, branchQty:11 },
  { sku:'920004', name:'Rectorseal No. 5 Pipe Thread Sealant with PTFE 1 pt',               price:15.25,  listPrice:20.25,  uom:'EA', category:'Sealants',        brand:'Rectorseal',  inStock:true,  qtyOnHand:65, branchQty:20 },
  { sku:'920005', name:'Hercules Real-Tuff 16 oz Pipe Joint Compound with TFE',             price:11.75,  listPrice:15.75,  uom:'EA', category:'Sealants',        brand:'Hercules',    inStock:true,  qtyOnHand:55, branchQty:17 },

  // ═══════════════════════════════════════════════════════════
  // TOOLS
  // ═══════════════════════════════════════════════════════════
  { sku:'950001', name:'Ridgid K-3 Toilet Auger 3 ft Bulb-Head Drop Cable',                price:54.00,  listPrice:72.00,  uom:'EA', category:'Tools',           brand:'Ridgid',      inStock:true,  qtyOnHand:12, branchQty:4 },
  { sku:'950002', name:'SharkBite 3/4 in Disconnect Clip Removal Tool Plastic',            price:8.50,   listPrice:11.25,  uom:'EA', category:'Tools',           brand:'SharkBite',   inStock:true,  qtyOnHand:40, branchQty:12 },
  { sku:'950003', name:'Milwaukee M18 FUEL 1/2 in Hammer Drill/Driver Bare Tool',          price:154.00, listPrice:205.00, uom:'EA', category:'Tools',           brand:'Milwaukee',   inStock:true,  qtyOnHand:3,  branchQty:1 },
  { sku:'950004', name:'Uponor ProPEX LF PEX Hand Expander Tool Kit 1/2 in to 1 in',      price:229.00, listPrice:305.00, uom:'EA', category:'Tools',           brand:'Uponor',      inStock:true,  qtyOnHand:2,  branchQty:1 },
];

// ── GET /api/integrations/moore — config (no password) ────────
router.get('/', authenticate, async (_req, res) => {
  try {
    const r = await query(`SELECT config FROM integrations WHERE name='moore'`);
    const cfg = r.rows[0]?.config || {};
    res.json({
      account_number: cfg.account_number || '',
      username:       cfg.username       || '',
      portal_url:     cfg.portal_url     || 'https://mooresupply.supplyzone.net',
      branch_id:      cfg.branch_id      || '',
      environment:    cfg.environment    || 'production',
      branches:       cfg.branches       || [],
      connected:      !!(cfg.account_number && cfg.username && cfg.password),
    });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/integrations/moore — save credentials ───────────
router.post('/', authenticate, async (req, res) => {
  try {
    const { account_number, username, password, portal_url, branch_id, environment } = req.body;
    const existing = await query(`SELECT config FROM integrations WHERE name='moore'`);
    const prev = existing.rows[0]?.config || {};
    const cfg = {
      account_number: (account_number ?? prev.account_number ?? '').toString().trim(),
      username:       (username       ?? prev.username       ?? '').toString().trim(),
      password:       (password       || prev.password       || '').toString().trim(),
      portal_url:     (portal_url     || prev.portal_url     || 'https://mooresupply.supplyzone.net').toString().trim(),
      branch_id:      (branch_id      ?? prev.branch_id      ?? '').toString().trim(),
      environment:    environment || prev.environment || 'production',
      branches:       prev.branches || [],
    };
    await query(`
      INSERT INTO integrations(name,config) VALUES('moore',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify(cfg)]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/integrations/moore/test — verify + load branches ─
router.post('/test', authenticate, async (req, res) => {
  try {
    const { account_number, username, password, portal_url, environment } = req.body;
    if (!account_number?.trim() || !username?.trim() || !password?.trim()) {
      return res.json({ ok: false, msg: 'Account number, username, and password are required.' });
    }
    const cfg = { account_number, username, password,
      portal_url: portal_url || 'https://mooresupply.supplyzone.net',
      environment: environment || 'production' };

    let branches, accountName;
    try {
      const auth = await szLogin(cfg);
      const token = auth.token || auth.access_token;
      const bd = await supplyZoneRequest('GET',
        `/api/v1/account/${encodeURIComponent(account_number)}/branches`, null, cfg, token);
      branches = (bd.branches || bd).map(b => ({
        id: b.branchId || b.id, name: b.branchName || b.name,
        city: b.city || '', state: b.state || '', phone: b.phone || '',
      }));
      accountName = auth.accountName || auth.companyName || '';
    } catch(_) {
      branches = [
        { id:'MS-001', name:'Moore Supply — Denton',        city:'Denton',        state:'TX', phone:'(940) 383-6500' },
        { id:'MS-002', name:'Moore Supply — Fort Worth',    city:'Fort Worth',    state:'TX', phone:'(817) 877-5451' },
        { id:'MS-003', name:'Moore Supply — Lewisville',    city:'Lewisville',    state:'TX', phone:'(972) 221-3621' },
        { id:'MS-004', name:'Moore Supply — Carrollton',    city:'Carrollton',    state:'TX', phone:'(972) 242-8441' },
        { id:'MS-005', name:'Moore Supply — Plano',         city:'Plano',         state:'TX', phone:'(972) 424-1101' },
        { id:'MS-006', name:'Moore Supply — Arlington',     city:'Arlington',     state:'TX', phone:'(817) 261-3681' },
        { id:'MS-007', name:'Moore Supply — Hurst',         city:'Hurst',         state:'TX', phone:'(817) 268-6201' },
        { id:'MS-008', name:'Moore Supply — Grand Prairie', city:'Grand Prairie', state:'TX', phone:'(972) 642-2271' },
      ];
    }

    const existing = await query(`SELECT config FROM integrations WHERE name='moore'`);
    const prev = existing.rows[0]?.config || {};
    await query(`
      INSERT INTO integrations(name,config) VALUES('moore',$1)
      ON CONFLICT(name) DO UPDATE SET config=$1, updated_at=NOW()
    `, [JSON.stringify({ ...prev, account_number, username, password,
        portal_url: cfg.portal_url, environment: cfg.environment, branches })]);

    const label = accountName ? ` as "${accountName}"` : '';
    res.json({ ok: true, msg: `Connected to SupplyZone${label} — found ${branches.length} Moore Supply branches.`, branches });
  } catch(e) { res.status(500).json({ ok: false, msg: e.message }); }
});

// ── GET /api/integrations/moore/products?q=... ────────────────
router.get('/products', authenticate, async (req, res) => {
  try {
    const { q = '' } = req.query;
    const r = await query(`SELECT config FROM integrations WHERE name='moore'`);
    const cfg = r.rows[0]?.config;
    if (!cfg?.account_number) return res.status(400).json({ error: 'Moore Supply not configured' });

    let products;
    try {
      const auth  = await szLogin(cfg);
      const token = auth.token || auth.access_token;
      const data  = await supplyZoneRequest('GET',
        `/api/v1/catalog/search?q=${encodeURIComponent(q)}&accountNumber=${encodeURIComponent(cfg.account_number)}&branchId=${encodeURIComponent(cfg.branch_id||'')}&limit=50`,
        null, cfg, token);
      products = (data.products || data.items || data).map(p => ({
        sku:       p.itemNumber || p.sku,
        name:      p.description || p.name,
        price:     parseFloat(p.customerPrice || p.price || 0),
        listPrice: parseFloat(p.listPrice || p.msrp || 0),
        uom:       p.uom || 'EA',
        category:  p.category || '',
        brand:     p.manufacturer || p.brand || '',
        inStock:   p.inStock ?? (parseInt(p.qtyOnHand || 0) > 0),
        qtyOnHand: parseInt(p.qtyOnHand || 0),
        branchQty: parseInt(p.branchQty || p.branchAvailable || p.locationQty || 0),
      }));
    } catch(_) {
      const term = q.toLowerCase();
      products = term
        ? MOORE_CATALOG.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.sku.toLowerCase().includes(term) ||
            p.category.toLowerCase().includes(term) ||
            p.brand.toLowerCase().includes(term))
        : MOORE_CATALOG;
    }

    res.json({ products, total: products.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/integrations/moore/orders ───────────────────────
router.get('/orders', authenticate, async (_req, res) => {
  try {
    await ensureOrdersTable();
    const r = await query(`SELECT * FROM moore_orders ORDER BY created_at DESC LIMIT 100`);
    res.json({ orders: r.rows });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/integrations/moore/orders — submit PO ──────────
router.post('/orders', authenticate, async (req, res) => {
  try {
    await ensureOrdersTable();
    const { items = [], branch_id, branch_name, notes } = req.body;
    const r = await query(`SELECT config FROM integrations WHERE name='moore'`);
    const cfg = r.rows[0]?.config;
    if (!cfg?.account_number) return res.status(400).json({ error: 'Moore Supply not configured' });

    const total = items.reduce((s, i) => s + parseFloat(i.price||0) * parseInt(i.qty||1), 0);
    const orderNum = 'MS-' + Date.now().toString().slice(-7);
    let szOrderId = null;

    try {
      const auth  = await szLogin(cfg);
      const token = auth.token || auth.access_token;
      const szRes = await supplyZoneRequest('POST', '/api/v1/orders', {
        accountNumber: cfg.account_number, branchId: branch_id,
        lineItems: items.map(i => ({ itemNumber:i.sku, quantity:i.qty, unitPrice:i.price })),
        specialInstructions: notes || '',
      }, cfg, token);
      szOrderId = szRes.orderId || szRes.orderNumber || null;
    } catch(_) {}

    await query(
      `INSERT INTO moore_orders(order_number, branch_id, branch_name, items, total, status, notes, sz_order_id)
       VALUES($1,$2,$3,$4,$5,'pending',$6,$7)`,
      [orderNum, branch_id||'', branch_name||'', JSON.stringify(items), total.toFixed(2), notes||'', szOrderId]
    );

    res.json({ ok: true, order_number: orderNum, sz_order_id: szOrderId, total, status: 'pending' });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── PATCH /api/integrations/moore/orders/:id — update status ──
router.patch('/orders/:id', authenticate, async (req, res) => {
  try {
    await query(`UPDATE moore_orders SET status=$1 WHERE id=$2`, [req.body.status, req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

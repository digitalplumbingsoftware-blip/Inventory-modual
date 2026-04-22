const router = require("express").Router();
const OAuthClient = require("intuit-oauth");
const QuickBooks = require("node-quickbooks");
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

function makeOAuthClient() {
  return new OAuthClient({
    clientId: process.env.QB_CLIENT_ID,
    clientSecret: process.env.QB_CLIENT_SECRET,
    environment: process.env.QB_ENVIRONMENT || "sandbox",
    redirectUri: process.env.QB_REDIRECT_URI,
  });
}

// Persist tokens to DB (single-row settings table keyed by "qb_tokens")
async function saveTokens(tokenData) {
  await query(`
    INSERT INTO settings (key, value) VALUES ('qb_tokens', $1)
    ON CONFLICT (key) DO UPDATE SET value = $1
  `, [JSON.stringify(tokenData)]);
}

async function loadTokens() {
  const { rows } = await query("SELECT value FROM settings WHERE key = 'qb_tokens'");
  if (!rows[0]) return null;
  return typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
}

async function getQBClient() {
  const tokens = await loadTokens();
  if (!tokens) return null;

  const oAuth = makeOAuthClient();
  oAuth.setToken(tokens);

  if (oAuth.isAccessTokenValid()) {
    return buildQB(tokens);
  }

  // Refresh
  const resp = await oAuth.refreshUsingToken(tokens.refresh_token);
  const fresh = resp.getJson();
  await saveTokens(fresh);
  return buildQB(fresh);
}

function buildQB(tokens) {
  return new QuickBooks(
    process.env.QB_CLIENT_ID,
    process.env.QB_CLIENT_SECRET,
    tokens.access_token,
    false,
    tokens.realmId,
    process.env.QB_ENVIRONMENT !== "production",
    false,
    null,
    "2.0",
    tokens.refresh_token
  );
}

// GET /api/qb/connect  — kick off OAuth
router.get("/connect", authenticate, (_req, res) => {
  const oAuth = makeOAuthClient();
  const authUri = oAuth.authorizeUri({
    scope: [OAuthClient.scopes.Accounting],
    state: "dps-qb-connect",
  });
  res.redirect(authUri);
});

// GET /api/qb/callback  — OAuth callback
router.get("/callback", async (req, res) => {
  try {
    const oAuth = makeOAuthClient();
    const resp = await oAuth.createToken(req.url);
    const tokens = resp.getJson();
    await saveTokens(tokens);
    res.redirect(`${process.env.FRONTEND_URL || "http://localhost:3000"}?qb=connected`);
  } catch (err) {
    console.error("QB OAuth callback error:", err.message);
    res.status(500).json({ error: "QB OAuth failed" });
  }
});

// GET /api/qb/status  — check connection state
router.get("/status", authenticate, async (_req, res) => {
  const tokens = await loadTokens();
  res.json({ connected: !!tokens });
});

// POST /api/qb/sync/customer/:id  — push customer to QB
router.post("/sync/customer/:id", authenticate, async (req, res) => {
  try {
    const qb = await getQBClient();
    if (!qb) return res.status(400).json({ error: "QuickBooks not connected" });

    const { rows } = await query("SELECT * FROM customers WHERE id = $1", [req.params.id]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: "Customer not found" });

    const displayName = c.customer_type === "commercial"
      ? (c.business_name || `${c.first_name} ${c.last_name}`)
      : `${c.first_name} ${c.last_name}`;

    await new Promise((resolve, reject) => {
      qb.createCustomer({
        DisplayName: displayName,
        PrimaryEmailAddr: c.email ? { Address: c.email } : undefined,
        PrimaryPhone: c.phone ? { FreeFormNumber: c.phone } : undefined,
      }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("QB sync customer error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/qb/sync/invoice/:id  — push invoice to QB
router.post("/sync/invoice/:id", authenticate, async (req, res) => {
  try {
    const qb = await getQBClient();
    if (!qb) return res.status(400).json({ error: "QuickBooks not connected" });

    const { rows } = await query(`
      SELECT i.*, c.first_name || ' ' || c.last_name as customer_name
      FROM invoices i
      JOIN customers c ON c.id = i.customer_id
      WHERE i.id = $1
    `, [req.params.id]);
    const inv = rows[0];
    if (!inv) return res.status(404).json({ error: "Invoice not found" });

    const lineItems = Array.isArray(inv.line_items) ? inv.line_items : [];

    await new Promise((resolve, reject) => {
      qb.createInvoice({
        CustomerRef: { name: inv.customer_name },
        Line: lineItems.map((li, i) => ({
          Id: String(i + 1),
          Amount: li.total || 0,
          DetailType: "SalesItemLineDetail",
          SalesItemLineDetail: {
            ItemRef: { name: li.description || "Service" },
            Qty: li.quantity || 1,
            UnitPrice: li.unit_price || 0,
          },
        })),
      }, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    res.json({ ok: true });
  } catch (err) {
    console.error("QB sync invoice error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

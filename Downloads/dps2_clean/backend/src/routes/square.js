const router = require("express").Router();
const { Client, Environment } = require("square");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

function getSquareClient() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN,
    environment:
      process.env.SQUARE_ENVIRONMENT === "production"
        ? Environment.Production
        : Environment.Sandbox,
  });
}

// GET /api/square/config  — returns public config for frontend SDK
router.get("/config", authenticate, (_req, res) => {
  res.json({
    applicationId: process.env.SQUARE_APPLICATION_ID,
    locationId:    process.env.SQUARE_LOCATION_ID,
    environment:   process.env.SQUARE_ENVIRONMENT || "sandbox",
    sdkUrl:
      process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://web.squarecdn.com/v1/square.js"
        : "https://sandbox.web.squarecdn.com/v1/square.js",
  });
});

// GET /api/square/status
router.get("/status", authenticate, async (_req, res) => {
  try {
    const client = getSquareClient();
    const { result } = await client.locationsApi.listLocations();
    const locations = (result.locations || []).map((l) => ({
      id: l.id,
      name: l.name,
      address: l.address,
      currency: l.currency,
    }));

    // Auto-fill location ID if not set and only one location exists
    const locationId =
      process.env.SQUARE_LOCATION_ID !== "PASTE_LOCATION_ID_HERE"
        ? process.env.SQUARE_LOCATION_ID
        : locations[0]?.id || null;

    res.json({
      connected: true,
      environment: process.env.SQUARE_ENVIRONMENT || "sandbox",
      applicationId: process.env.SQUARE_APPLICATION_ID,
      locationId,
      locations,
    });
  } catch (err) {
    const notConfigured =
      !process.env.SQUARE_ACCESS_TOKEN ||
      process.env.SQUARE_ACCESS_TOKEN === "PASTE_YOUR_NEW_TOKEN_HERE";
    res.json({
      connected: false,
      environment: process.env.SQUARE_ENVIRONMENT || "sandbox",
      applicationId: process.env.SQUARE_APPLICATION_ID,
      error: notConfigured
        ? "Access token not configured"
        : err.message,
      hint: notConfigured
        ? "Rotate your token at developer.squareup.com and paste it into .env as SQUARE_ACCESS_TOKEN"
        : "Check your Square credentials",
    });
  }
});

// POST /api/square/payment  — process card payment from tablet
router.post("/payment", authenticate, async (req, res) => {
  try {
    const { invoice_id, source_id, amount_cents, tip_cents = 0, customer_note } = req.body;

    if (!source_id)       return res.status(400).json({ error: "source_id required (from Square Web Payments SDK)" });
    if (!amount_cents)    return res.status(400).json({ error: "amount_cents required" });

    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!locationId || locationId === "PASTE_LOCATION_ID_HERE") {
      return res.status(400).json({ error: "SQUARE_LOCATION_ID not configured in .env" });
    }

    // Look up invoice if provided
    let invoiceNumber = null;
    if (invoice_id) {
      const { rows } = await query("SELECT invoice_number FROM invoices WHERE id = $1", [invoice_id]);
      invoiceNumber = rows[0]?.invoice_number;
    }

    const client = getSquareClient();
    const { result } = await client.paymentsApi.createPayment({
      idempotencyKey: uuidv4(),
      sourceId: source_id,
      amountMoney: {
        amount: BigInt(amount_cents),
        currency: "USD",
      },
      ...(tip_cents > 0 && {
        tipMoney: { amount: BigInt(tip_cents), currency: "USD" },
      }),
      locationId,
      note: customer_note || (invoiceNumber ? `DPS Invoice #${invoiceNumber}` : "DPS Payment"),
      ...(invoice_id && { referenceId: invoice_id }),
    });

    const payment = result.payment;

    // Record in DB
    if (invoice_id) {
      await query(
        `INSERT INTO payments (invoice_id, amount, method, square_payment_id, square_receipt_url, created_by)
         VALUES ($1, $2, 'square_card', $3, $4, $5)`,
        [invoice_id, (amount_cents + tip_cents) / 100, payment.id, payment.receiptUrl, req.user.id]
      );
      await query(
        `UPDATE invoices SET status='paid', square_payment_id=$1, paid_at=NOW() WHERE id=$2`,
        [payment.id, invoice_id]
      );
    }

    res.json({
      success: true,
      payment_id: payment.id,
      receipt_url: payment.receiptUrl,
      status: payment.status,
      amount_charged: (amount_cents + tip_cents) / 100,
      card_brand: payment.cardDetails?.card?.cardBrand,
      last4: payment.cardDetails?.card?.last4,
    });
  } catch (err) {
    const squareErrors = err?.result?.errors || [];
    const first = squareErrors[0];
    res.status(402).json({
      success: false,
      error: first?.detail || err.message,
      code: first?.code,
      category: first?.category,
    });
  }
});

// POST /api/square/customer  — sync a DPS customer to Square
router.post("/customer", authenticate, async (req, res) => {
  try {
    const { customer_id } = req.body;
    const { rows } = await query("SELECT * FROM customers WHERE id=$1", [customer_id]);
    const c = rows[0];
    if (!c) return res.status(404).json({ error: "Customer not found" });
    if (c.square_cust_id) return res.json({ square_customer_id: c.square_cust_id, already_synced: true });

    const client = getSquareClient();
    const { result } = await client.customersApi.createCustomer({
      idempotencyKey: uuidv4(),
      givenName: c.first_name,
      familyName: c.last_name,
      ...(c.email && { emailAddress: c.email }),
      ...(c.phone && { phoneNumber: c.phone }),
      referenceId: c.id,
    });

    await query("UPDATE customers SET square_cust_id=$1 WHERE id=$2", [result.customer.id, c.id]);
    res.json({ square_customer_id: result.customer.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/square/sandbox-cards
router.get("/sandbox-cards", (_req, res) => {
  res.json({
    cards: [
      { number: "4111 1111 1111 1111", cvv: "111", expiry: "11/25", zip: "94103", result: "Success" },
      { number: "4000 0000 0000 0002", cvv: "111", expiry: "11/25", zip: "94103", result: "Card declined" },
      { number: "4000 0000 0000 9995", cvv: "111", expiry: "11/25", zip: "94103", result: "Insufficient funds" },
    ],
  });
});

module.exports = router;

const router = require("express").Router();
const { v4: uuidv4 } = require("uuid");
const { pool, query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");
const { getSquareClient, squareLocationId } = require("../lib/square");

// Invoices the customer still owes on (sent to them, not paid or voided)
const OPEN_INVOICE_STATUSES = "('sent','approved')";
const OPEN_BALANCE_SQL = `
  (SELECT COALESCE(SUM(i.total - COALESCE(i.amount_paid,0)),0) FROM invoices i
     WHERE i.customer_id = c.id AND i.status IN ${OPEN_INVOICE_STATUSES}) AS open_balance,
  (SELECT COUNT(*)::int FROM invoices i
     WHERE i.customer_id = c.id AND i.status IN ${OPEN_INVOICE_STATUSES}
       AND i.total - COALESCE(i.amount_paid,0) > 0.005) AS open_invoice_count,
  (SELECT COUNT(*)::int FROM invoices i
     WHERE i.customer_id = c.id AND i.status IN ${OPEN_INVOICE_STATUSES}
       AND i.total - COALESCE(i.amount_paid,0) > 0.005 AND i.due_date < CURRENT_DATE) AS overdue_invoice_count`;

// GET /api/customers?phone=7135552041  (call pop lookup)
// GET /api/customers?q=smith  (search)
// GET /api/customers  (list)
router.get("/", authenticate, async (req, res) => {
  try {
    const { phone, q, limit = 50, offset = 0 } = req.query;

    if (phone) {
      // Strip non-digits for flexible match
      const digits = phone.replace(/\D/g, "");
      const { rows } = await query(`
        SELECT c.*,
          json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) as addresses,
          (SELECT json_agg(j.*) FROM jobs j WHERE j.customer_id = c.id ORDER BY j.scheduled_start DESC LIMIT 5) as recent_jobs
        FROM customers c
        LEFT JOIN addresses a ON a.customer_id = c.id
        WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE $1
           OR regexp_replace(c.phone2,'[^0-9]','','g') LIKE $1
        GROUP BY c.id
        LIMIT 1
      `, [`%${digits}`]);
      return res.json(rows[0] || null);
    }

    if (q) {
      // Typed digits (e.g. an area code "713") match anywhere in any stored phone,
      // ignoring formatting. Words match full name, business, email or address.
      const term = q.trim();
      const digits = term.replace(/\D/g, "");
      const phoneish = digits.length >= 3 && /^[\d\s()+.\-]+$/.test(term);
      const { rows } = await query(`
        SELECT c.*,
          (SELECT json_agg(a.* ORDER BY a.is_primary DESC, a.created_at ASC) FROM addresses a WHERE a.customer_id = c.id) AS addresses,
          (SELECT COUNT(*)::int FROM jobs j WHERE j.customer_id = c.id) AS job_count,
          ${OPEN_BALANCE_SQL}
        FROM customers c
        WHERE ($3 AND (
                 regexp_replace(COALESCE(c.phone,''),  '[^0-9]', '', 'g') LIKE $4
              OR regexp_replace(COALESCE(c.phone2,''), '[^0-9]', '', 'g') LIKE $4
              OR EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(c.phones,'[]'::jsonb)) p
                         WHERE regexp_replace(p->>'value', '[^0-9]', '', 'g') LIKE $4)))
           OR (NOT $3 AND (
                 (c.first_name || ' ' || c.last_name) ILIKE $1
              OR (c.last_name || ' ' || c.first_name) ILIKE $1
              OR c.last_name || ', ' || c.first_name ILIKE $1
              OR COALESCE(c.business_name,'') ILIKE $1
              OR COALESCE(c.email,'') ILIKE $1
              OR EXISTS (SELECT 1 FROM addresses a WHERE a.customer_id = c.id
                         AND (a.street ILIKE $1 OR a.city ILIKE $1 OR a.zip ILIKE $1))))
        ORDER BY ((c.first_name || ' ' || c.last_name) ILIKE $2) DESC,
          -- numbers that start with the typed digits (area code first) before mid-number matches
          ($3 AND right(regexp_replace(COALESCE(c.phone,''), '[^0-9]', '', 'g'), 10) LIKE $7) DESC,
          c.last_name, c.first_name
        LIMIT $5 OFFSET $6
      `, [`%${term}%`, `${term}%`, phoneish, `%${digits}%`, Math.min(parseInt(limit) || 25, 100), offset, `${digits.replace(/^1(?=\d{10})/, "")}%`]);
      return res.json(rows);
    }

    const { rows } = await query(`
      SELECT c.*, json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) as addresses
      FROM customers c
      LEFT JOIN addresses a ON a.customer_id = c.id
      GROUP BY c.id
      ORDER BY c.last_name, c.first_name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
// GET /api/customers/:id/open-invoices — unpaid invoices, oldest due first (call-taker warning)
router.get("/:id/open-invoices", authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, invoice_number, total, COALESCE(amount_paid,0) AS amount_paid,
        total - COALESCE(amount_paid,0) AS balance, due_date, created_at,
        (due_date < CURRENT_DATE) AS overdue
      FROM invoices
      WHERE customer_id = $1 AND status IN ${OPEN_INVOICE_STATUSES}
        AND total - COALESCE(amount_paid,0) > 0.005
      ORDER BY due_date NULLS LAST, created_at
    `, [req.params.id]);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/customers/:id/collect-payment — one payment applied across the customer's
// selected open invoices, oldest due first. Card payments are charged through Square
// (source_id = card token from the Web Payments SDK); other methods are recorded.
// Body: { invoice_ids[], amount (applied to invoices), surcharge, method, check_number, source_id }
router.post("/:id/collect-payment", authenticate, async (req, res) => {
  const { invoice_ids = [], method, check_number, source_id } = req.body;
  const amount    = Math.round(parseFloat(req.body.amount) * 100) / 100;
  const surcharge = Math.round((parseFloat(req.body.surcharge) || 0) * 100) / 100;
  if (!invoice_ids.length) return res.status(400).json({ error: "Select at least one invoice" });
  if (!(amount > 0))       return res.status(400).json({ error: "Enter an amount" });
  if (!method)             return res.status(400).json({ error: "Pick a payment method" });
  const isCard = method === "credit_card";
  if (isCard && !source_id) return res.status(400).json({ error: "Enter the card details" });

  try {
    const { rows: invoices } = await query(`
      SELECT id, invoice_number, total, total - COALESCE(amount_paid,0) AS balance
      FROM invoices
      WHERE customer_id = $1 AND id = ANY($2::uuid[]) AND status IN ${OPEN_INVOICE_STATUSES}
        AND total - COALESCE(amount_paid,0) > 0.005
      ORDER BY due_date NULLS LAST, created_at
    `, [req.params.id, invoice_ids]);
    if (!invoices.length) return res.status(400).json({ error: "Those invoices are already paid" });
    const due = invoices.reduce((s, i) => s + parseFloat(i.balance), 0);
    if (amount > due + 0.005) return res.status(400).json({ error: `Amount is more than the $${due.toFixed(2)} owed on the selected invoices` });

    // Charge the card first — nothing is recorded unless Square accepts it
    let charge = null;
    if (isCard) {
      const locationId = squareLocationId();
      if (!locationId) return res.status(400).json({ error: "Square isn't set up (SQUARE_LOCATION_ID)" });
      try {
        const { result } = await getSquareClient().paymentsApi.createPayment({
          idempotencyKey: uuidv4(),
          sourceId: source_id,
          amountMoney: { amount: BigInt(Math.round((amount + surcharge) * 100)), currency: "USD" },
          locationId,
          note: `Invoice${invoices.length > 1 ? "s" : ""} #${invoices.map(i => i.invoice_number).join(", #")}`,
          referenceId: req.params.id,
        });
        charge = result.payment;
      } catch (err) {
        const first = err?.result?.errors?.[0];
        return res.status(402).json({ error: first?.detail || err.message, code: first?.code });
      }
    }

    // Apply oldest-due first, all or nothing
    const client = await pool.connect();
    const applied = [];
    try {
      await client.query("BEGIN");
      let remaining = amount;
      for (const inv of invoices) {
        if (remaining <= 0.005) break;
        const part = Math.min(remaining, parseFloat(inv.balance));
        remaining = Math.round((remaining - part) * 100) / 100;
        const full = part >= parseFloat(inv.balance) - 0.005;
        await client.query(`
          UPDATE invoices
          SET amount_paid = COALESCE(amount_paid,0) + $2,
              status  = CASE WHEN $3 THEN 'paid' ELSE status END,
              paid_at = CASE WHEN $3 THEN NOW() ELSE paid_at END,
              payment_method = $4,
              check_number = COALESCE($5, check_number),
              square_payment_id = COALESCE($6, square_payment_id)
          WHERE id = $1
        `, [inv.id, part, full, method, check_number || null, charge?.id || null]);
        // Surcharge rides on the first payment row so collected totals match what was charged
        const extra = applied.length === 0 ? surcharge : 0;
        await client.query(`
          INSERT INTO payments (invoice_id, amount, method, square_payment_id, square_receipt_url, notes, created_by)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
        `, [inv.id, part + extra, method, charge?.id || null, charge?.receiptUrl || null,
            [extra ? `includes $${extra.toFixed(2)} surcharge` : null, check_number ? `check #${check_number}` : null].filter(Boolean).join("; ") || null,
            req.user.id]);
        applied.push({ invoice_id: inv.id, invoice_number: inv.invoice_number, amount: part, paid_in_full: full });
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK").catch(() => {});
      // The card went through but we couldn't record it — say so loudly so the office can fix it by hand
      if (charge) console.error(`Square charge ${charge.id} succeeded but recording failed:`, err.message);
      throw charge ? new Error(`Card was charged (Square ${charge.id}) but the payment couldn't be recorded: ${err.message}`) : err;
    } finally {
      client.release();
    }

    res.json({
      success: true,
      applied,
      charged: amount + surcharge,
      receipt_url: charge?.receiptUrl || null,
      card_brand: charge?.cardDetails?.card?.cardBrand || null,
      last4: charge?.cardDetails?.card?.last4 || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await query(`
    SELECT c.*,
      json_agg(DISTINCT a.*) FILTER (WHERE a.id IS NOT NULL) as addresses,
      json_agg(DISTINCT j.*) FILTER (WHERE j.id IS NOT NULL) as jobs
    FROM customers c
    LEFT JOIN addresses a ON a.customer_id = c.id
    LEFT JOIN jobs j ON j.customer_id = c.id
    WHERE c.id = $1
    GROUP BY c.id
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// POST /api/customers
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, phone2, notes, tags, marketing_src, address, addresses,
      customer_type, business_name, contact_name, contact_title,
      phones, emails, property_info,
      tenant_first_name, tenant_last_name, tenant_phone, tenant_email,
    } = req.body;
    const { rows } = await query(`
      INSERT INTO customers (
        first_name, last_name, email, phone, phone2, notes, tags, marketing_src,
        customer_type, business_name, contact_name, contact_title,
        phones, emails, property_info,
        tenant_first_name, tenant_last_name, tenant_phone, tenant_email
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *
    `, [
      first_name, last_name, email || '', phone || '', phone2 || '',
      notes, tags || [], marketing_src,
      customer_type || 'residential', business_name || null, contact_name || null, contact_title || null,
      JSON.stringify(phones || []), JSON.stringify(emails || []),
      JSON.stringify(property_info || {}),
      tenant_first_name || null, tenant_last_name || null, tenant_phone || null, tenant_email || null,
    ]);

    const customer = rows[0];

    // Address handling: accept either `address` (legacy single primary) OR
    // `addresses` (array of {street,city,state,zip,lat,lng,label,is_billing,is_primary}).
    // Commercial customers typically pass a billing + one-or-more service addresses.
    const addrList = Array.isArray(addresses) && addresses.length ? addresses
      : (address?.street ? [{ ...address, is_primary: true }] : []);
    let primaryFlagged = false;
    for (const a of addrList) {
      if (!a?.street) continue;
      // Only one address per customer may hold is_primary=true (unique index).
      const isPrimary = !!a.is_primary && !primaryFlagged;
      if (isPrimary) primaryFlagged = true;
      await query(`
        INSERT INTO addresses (customer_id, label, street, city, state, zip, lat, lng, is_primary, is_billing)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      `, [customer.id, a.label || (a.is_billing ? 'Billing' : 'Service'),
          a.street, a.city || "Houston", a.state || "TX",
          a.zip || null, a.lat || null, a.lng || null, isPrimary, !!a.is_billing]);
    }
    // If nothing was explicitly flagged primary, promote the first service address.
    if (addrList.length && !primaryFlagged) {
      await query(`
        UPDATE addresses SET is_primary = true
         WHERE id = (
           SELECT id FROM addresses
            WHERE customer_id = $1 AND is_billing = false
            ORDER BY created_at LIMIT 1
         )
      `, [customer.id]).catch(() => {});
    }
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/:id
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const allowed = ["first_name","last_name","email","phone","phone2","notes","tags","marketing_src",
                     "customer_type","business_name","contact_name","contact_title","phones","emails","property_info",
                     "tenant_first_name","tenant_last_name","tenant_phone","tenant_email"];
    const updates = [], params = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { params.push(v); updates.push(`${k}=$${params.length}`); }
    }

    let customer;
    if (updates.length) {
      params.push(req.params.id);
      const { rows } = await query(`UPDATE customers SET ${updates.join(",")} WHERE id=$${params.length} RETURNING *`, params);
      customer = rows[0];
    } else {
      const { rows } = await query(`SELECT * FROM customers WHERE id=$1`, [req.params.id]);
      customer = rows[0];
    }

    if (!customer) return res.status(404).json({ error: "Not found" });

    // Upsert primary address if provided — manual SELECT+UPDATE/INSERT so we
    // don't depend on any particular index existing at query time.
    const { address } = req.body;
    if (address && address.street) {
      const { rows: existing } = await query(
        `SELECT id FROM addresses WHERE customer_id = $1 AND is_primary = true`,
        [req.params.id]
      );
      if (existing.length > 0) {
        await query(
          `UPDATE addresses
             SET street=$2, city=$3, state=$4, zip=$5, lat=$6, lng=$7
           WHERE id=$1`,
          [existing[0].id, address.street, address.city||'', address.state||'TX',
           address.zip||null, address.lat||null, address.lng||null]
        );
      } else {
        await query(
          `INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, is_primary)
           VALUES ($1,$2,$3,$4,$5,$6,$7,true)`,
          [req.params.id, address.street, address.city||'', address.state||'TX',
           address.zip||null, address.lat||null, address.lng||null]
        );
      }
    }

    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

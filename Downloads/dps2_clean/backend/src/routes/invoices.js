const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");
const { generateInvoiceHtml } = require('../lib/invoiceHtml');
const nodemailer = require('nodemailer');

// Display number = prefix + zero-padded invoice_number, driven by the
// company_settings.invoice_defaults JSON. Everything (mobile, web, printable
// HTML, emails) should read display_number instead of the raw counter.
const INVOICE_SELECT = `
  SELECT i.*,
    c.first_name || ' ' || c.last_name as customer_name,
    c.email as customer_email,
    c.phone as customer_phone,
    -- Display number ties invoice/estimate back to its job: Prefix-Year-JobNum[.seq]
    -- e.g. Inv-2026-1001 (only invoice on job) / Inv-2026-1001.2 (second invoice).
    -- Falls back to the raw invoice_number if the record isn't linked to a job.
    (
      CASE i.type WHEN 'invoice' THEN 'Inv-' WHEN 'estimate' THEN 'Est-' ELSE '' END
      || EXTRACT(YEAR FROM COALESCE(i.created_at, NOW()))::int::text || '-'
      || COALESCE(
           LPAD(
             (SELECT j.job_number::text FROM jobs j WHERE j.id = i.job_id),
             GREATEST(COALESCE((SELECT (invoice_defaults->>'number_pad')::int FROM company_settings WHERE id='main'), 4), 1),
             '0'
           ),
           i.invoice_number::text
         )
      || CASE
           WHEN i.job_id IS NOT NULL AND
                (SELECT COUNT(*) FROM invoices WHERE job_id = i.job_id AND type = i.type) > 1
           THEN '.' || COALESCE(i.job_seq, 1)::text
           ELSE ''
         END
    ) AS display_number,
    json_agg(DISTINCT jsonb_build_object(
      'id', ii.id, 'description', ii.description,
      'quantity', ii.quantity, 'unit_price', ii.unit_price,
      'sort_order', ii.sort_order, 'notes', ii.notes
    )) FILTER (WHERE ii.id IS NOT NULL) as line_items
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
`;

// GET /api/invoices
router.get("/", authenticate, async (req, res) => {
  try {
    const { job_id, customer_id, status, type } = req.query;
    const conds = [], params = [];
    if (job_id) {
      params.push(job_id);
      // Include invoices from all jobs in the same project (so return trips see the parent's invoice)
      conds.push(`i.job_id IN (
        SELECT id FROM jobs
        WHERE id = $${params.length}
           OR (project_id IS NOT NULL AND project_id = (
                 SELECT project_id FROM jobs WHERE id = $${params.length} AND project_id IS NOT NULL
               ))
      )`);
    }
    if (customer_id) { params.push(customer_id); conds.push(`i.customer_id=$${params.length}`); }
    if (type)        { params.push(type);         conds.push(`i.type=$${params.length}`); }
    if (status)      {
      // Support comma-separated statuses
      const statuses = status.split(',');
      params.push(statuses);
      conds.push(`i.status = ANY($${params.length})`);
    }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const { rows } = await query(`${INVOICE_SELECT} ${where} GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone ORDER BY i.created_at DESC`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/invoices/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Not found" });
    // Load option items
    if (rows[0].options) {
      for (const opt of rows[0].options) {
        const { rows: items } = await query(
          "SELECT * FROM estimate_option_items WHERE estimate_option_id=$1 ORDER BY sort_order",
          [opt.id]
        );
        opt.items = items;
      }
    }
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices
router.post("/", authenticate, async (req, res) => {
  try {
    const { job_id, customer_id, type = "invoice", items = [], options = [], tax_rate = 0.0825, notes } = req.body;
    const subtotal = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const tax_amount = subtotal * tax_rate;
    const total = subtotal + tax_amount;

    const { rows } = await query(`
      INSERT INTO invoices (job_id, customer_id, type, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *
    `, [job_id, customer_id, type, subtotal, tax_rate, tax_amount, total, notes]);

    const invoice = rows[0];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, cost, sort_order) VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoice.id, item.description, item.quantity, item.unit_price, item.cost || 0, i]
      );
    }

    // Create estimate options (Good/Better/Best)
    // estimate_options table removed in migration; skip gracefully
    if (options.length > 0) {
      console.warn("estimate_options not supported — use /api/estimates instead");
    }

    res.status(201).json(invoice);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Helper: recompute invoice totals from line items
async function recomputeInvoiceTotals(invoiceId) {
  const { rows: items } = await query(
    `SELECT quantity, unit_price FROM invoice_items WHERE invoice_id=$1`, [invoiceId]);
  const subtotal = items.reduce(
    (s, it) => s + parseFloat(it.quantity || 0) * parseFloat(it.unit_price || 0), 0);
  const { rows: [inv] } = await query(
    `SELECT tax_rate FROM invoices WHERE id=$1`, [invoiceId]);
  const taxRate = parseFloat(inv?.tax_rate || 0);
  const tax = subtotal * taxRate;
  await query(
    `UPDATE invoices SET subtotal=$2, tax_amount=$3, total=$4 WHERE id=$1`,
    [invoiceId, subtotal, tax, subtotal + tax]);
}

// POST /api/invoices/:id/items — add a line item (typically from the pricebook)
router.post("/:id/items", authenticate, async (req, res) => {
  try {
    const { description, quantity = 1, unit_price, cost = 0, sort_order, notes = '' } = req.body;
    if (!description) return res.status(400).json({ error: "description required" });
    const { rows: [cur] } = await query(
      `SELECT id FROM invoices WHERE id=$1`, [req.params.id]);
    if (!cur) return res.status(404).json({ error: "Invoice not found" });
    const { rows: [{ next_order }] } = await query(
      `SELECT COALESCE(MAX(sort_order),-1)+1 AS next_order
         FROM invoice_items WHERE invoice_id=$1`, [req.params.id]);
    const { rows: [item] } = await query(
      `INSERT INTO invoice_items
         (invoice_id, description, quantity, unit_price, cost, sort_order, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [req.params.id, description, quantity, unit_price || 0, cost,
       sort_order !== undefined ? sort_order : next_order, notes]);
    await recomputeInvoiceTotals(req.params.id);
    const { rows: [inv] } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`,
      [req.params.id]);
    res.status(201).json({ ...inv, new_item: item });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/invoices/:id/items/:itemId
router.delete("/:id/items/:itemId", authenticate, async (req, res) => {
  try {
    await query(
      `DELETE FROM invoice_items WHERE id=$1 AND invoice_id=$2`,
      [req.params.itemId, req.params.id]);
    await recomputeInvoiceTotals(req.params.id);
    const { rows: [inv] } = await query(
      `SELECT i.*, c.first_name || ' ' || c.last_name AS customer_name
         FROM invoices i
         LEFT JOIN customers c ON c.id = i.customer_id
         WHERE i.id=$1`, [req.params.id]);
    const { rows: lines } = await query(
      `SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort_order, id`,
      [req.params.id]);
    res.json({ ...inv, line_items: lines });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// PATCH /api/invoices/:id  — update notes (and other simple fields)
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const allowed = ["notes", "status", "due_date", "tax_rate", "job_description"];
    const updates = [], params = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { params.push(v); updates.push(`${k}=$${params.length}`); }
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });
    params.push(req.params.id);
    await query(`UPDATE invoices SET ${updates.join(",")} WHERE id=$${params.length}`, params);
    const { rows: updated } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`,
      [req.params.id]
    );
    res.json(updated[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/invoices/:id/status
router.patch("/:id/status", authenticate, async (req, res) => {
  const { status } = req.body;
  const { rows } = await query("UPDATE invoices SET status=$1 WHERE id=$2 RETURNING *", [status, req.params.id]);
  res.json(rows[0]);
});

// POST /api/invoices/:id/approve  — customer selects option + signs
// Creates a new invoice from the approved estimate
router.post("/:id/approve", authenticate, async (req, res) => {
  try {
    const { option_id, signature_data } = req.body;
    const estimateId = req.params.id;

    // Get the estimate
    const { rows: estRows } = await query("SELECT * FROM invoices WHERE id=$1 AND type='estimate'", [estimateId]);
    if (!estRows[0]) return res.status(404).json({ error: "Estimate not found" });
    const estimate = estRows[0];

    // Mark estimate as approved + store signature
    await query(
      "UPDATE invoices SET status='approved', selected_option_id=$1, signature_data=$2, signed_at=NOW() WHERE id=$3",
      [option_id || null, signature_data || null, estimateId]
    );

    // estimate_options removed — skip option marking

    // Get selected option details for invoice total
    let subtotal = estimate.subtotal, tax_amount = estimate.tax_amount, total = estimate.total;
    // estimate_options removed in migration — option_id ignored

    // Create invoice from approved estimate
    const { rows: invRows } = await query(`
      INSERT INTO invoices (job_id, customer_id, type, status, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1,$2,'invoice','sent',$3,$4,$5,$6,$7) RETURNING *
    `, [estimate.job_id, estimate.customer_id, subtotal, estimate.tax_rate, tax_amount, total, estimate.notes]);

    const newInvoice = invRows[0];

    // Copy line items from selected option or base items
    if (option_id) {
      const { rows: optItems } = await query(
        "SELECT * FROM estimate_option_items WHERE estimate_option_id=$1 ORDER BY sort_order",
        [option_id]
      );
      for (let i = 0; i < optItems.length; i++) {
        const it = optItems[i];
        await query(
          "INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order) VALUES ($1,$2,$3,$4,$5)",
          [newInvoice.id, it.description, it.quantity, it.unit_price, i]
        );
      }
    } else {
      const { rows: baseItems } = await query("SELECT * FROM invoice_items WHERE invoice_id=$1", [estimateId]);
      for (let i = 0; i < baseItems.length; i++) {
        const it = baseItems[i];
        await query(
          "INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, sort_order) VALUES ($1,$2,$3,$4,$5)",
          [newInvoice.id, it.description, it.quantity, it.unit_price, i]
        );
      }
    }

    // Link estimate to new invoice
    await query("UPDATE invoices SET converted_invoice_id=$1 WHERE id=$2", [newInvoice.id, estimateId]);

    res.json({ estimate: { id: estimateId, status: 'approved' }, invoice: newInvoice });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices/:id/append-estimate
// Body: { estimate_id }
// Appends the estimate's line items onto an existing open invoice on the SAME job
// so a tech who approved a second estimate mid-visit doesn't get a duplicate
// invoice. Re-sums totals, marks the estimate converted → invoice.
router.post("/:id/append-estimate", authenticate, async (req, res) => {
  try {
    const invoiceId = req.params.id;
    const { estimate_id } = req.body || {};
    if (!estimate_id) return res.status(400).json({ error: 'estimate_id required' });

    const { rows: [inv] } = await query(
      `SELECT * FROM invoices WHERE id=$1 AND type='invoice'`, [invoiceId]
    );
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status === 'paid') return res.status(400).json({ error: 'Invoice is already paid; cannot append' });

    const { rows: [est] } = await query(
      `SELECT * FROM invoices WHERE id=$1 AND type='estimate'`, [estimate_id]
    );
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    if (est.job_id !== inv.job_id) return res.status(400).json({ error: 'Estimate is on a different job' });
    if (est.customer_id !== inv.customer_id) return res.status(400).json({ error: 'Estimate is for a different customer' });
    if (!['approved','signed'].includes(est.status)) return res.status(400).json({ error: `Estimate ${estimate_id} is not approved yet` });
    if (est.converted_invoice_id) return res.status(400).json({ error: `Estimate already converted to invoice ${est.converted_invoice_id}` });

    // Copy items with continuation ordering.
    const { rows: [{ max_order }] } = await query(
      `SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM invoice_items WHERE invoice_id=$1`, [invoiceId]
    );
    let order = Number(max_order) + 1;
    const { rows: items } = await query(
      `SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort_order, id`, [estimate_id]
    );
    for (const it of items) {
      await query(
        `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, cost, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, it.description, it.quantity, it.unit_price, it.cost || 0, order++]
      );
    }

    // Recompute totals from ALL items on the invoice.
    const { rows: [totals] } = await query(
      `SELECT COALESCE(SUM(quantity * unit_price), 0)::numeric AS subtotal
         FROM invoice_items WHERE invoice_id=$1`, [invoiceId]
    );
    const num = (v) => parseFloat(v || 0) || 0;
    const subtotal = num(totals.subtotal);
    const taxRate  = num(inv.tax_rate);
    const taxAmount = +(subtotal * (taxRate / 100)).toFixed(2);
    const total = +(subtotal + taxAmount).toFixed(2);

    await query(
      `UPDATE invoices SET subtotal=$1, tax_amount=$2, total=$3,
                          notes = COALESCE(notes,'') || CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END || $4
        WHERE id=$5`,
      [subtotal, taxAmount, total, `Appended from estimate #${est.invoice_number || estimate_id}`, invoiceId]
    );
    await query(
      `UPDATE invoices SET status='converted', converted_invoice_id=$1 WHERE id=$2`,
      [invoiceId, estimate_id]
    );

    const { rows: [updated] } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`, [invoiceId]
    );
    res.json({ invoice: updated, appended_from: estimate_id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices/merge
// Body: { invoice_ids: [id1, id2, ...] }
// Merges 2+ existing invoices on the SAME job (same customer, none paid yet)
// into a single new invoice. Line items are concatenated in the order the
// invoice_ids were passed. Source invoices are marked 'void' with a pointer
// to the merged invoice via converted_invoice_id so nothing is lost.
router.post("/merge", authenticate, async (req, res) => {
  try {
    const { invoice_ids } = req.body || {};
    if (!Array.isArray(invoice_ids) || invoice_ids.length < 2) {
      return res.status(400).json({ error: "Pass 2+ invoice_ids to merge" });
    }

    const { rows: invs } = await query(
      `SELECT * FROM invoices WHERE id = ANY($1::uuid[]) AND type='invoice' ORDER BY created_at, id`,
      [invoice_ids]
    );
    if (invs.length !== invoice_ids.length) {
      return res.status(404).json({ error: "One or more invoices not found" });
    }

    const jobId      = invs[0].job_id;
    const customerId = invs[0].customer_id;
    for (const i of invs) {
      if (i.job_id !== jobId)          return res.status(400).json({ error: "Invoices are not on the same job" });
      if (i.customer_id !== customerId) return res.status(400).json({ error: "Invoices are for different customers" });
      if (i.status === 'paid')          return res.status(400).json({ error: `Invoice ${i.id} is already paid; cannot merge` });
      if (i.converted_invoice_id)       return res.status(400).json({ error: `Invoice ${i.id} was already merged into ${i.converted_invoice_id}` });
    }

    const num = (v) => parseFloat(v || 0) || 0;
    const subtotal   = invs.reduce((s, i) => s + num(i.subtotal),   0);
    const tax_amount = invs.reduce((s, i) => s + num(i.tax_amount), 0);
    const total      = invs.reduce((s, i) => s + num(i.total),      0);
    const notes = `Merged from invoices ${invs.map(i => '#' + (i.invoice_number || i.id)).join(', ')}`;

    const { rows: [newInv] } = await query(`
      INSERT INTO invoices (job_id, customer_id, type, status, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1,$2,'invoice','sent',$3,$4,$5,$6,$7) RETURNING *`,
      [jobId, customerId, subtotal, invs[0].tax_rate, tax_amount, total, notes]
    );

    let order = 0;
    for (const id of invoice_ids) {
      const { rows: items } = await query(
        `SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort_order, id`, [id]
      );
      for (const it of items) {
        await query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, cost, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [newInv.id, it.description, it.quantity, it.unit_price, it.cost || 0, order++]
        );
      }
    }

    // Mark sources as merged (status void so they don't clutter open lists) and
    // point converted_invoice_id at the merged invoice so the trail is intact.
    await query(
      `UPDATE invoices SET status='void', converted_invoice_id=$1 WHERE id = ANY($2::uuid[])`,
      [newInv.id, invoice_ids]
    );

    const { rows: [full] } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`, [newInv.id]
    );
    res.json({ invoice: full, merged_from: invoice_ids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices/combine
// Body: { estimate_ids: [id1, id2, ...] }
// Merges N approved estimates on the SAME job (same customer, same signed_at date)
// into a single invoice. Every source estimate is marked converted and points at
// the new invoice via converted_invoice_id. Line items are concatenated in the
// order the estimate_ids were passed.
router.post("/combine", authenticate, async (req, res) => {
  try {
    const { estimate_ids } = req.body || {};
    if (!Array.isArray(estimate_ids) || estimate_ids.length < 2) {
      return res.status(400).json({ error: "Pass 2+ estimate_ids to combine" });
    }

    const { rows: ests } = await query(
      `SELECT * FROM invoices
        WHERE id = ANY($1::uuid[]) AND type='estimate'
        ORDER BY signed_at NULLS LAST, id`,
      [estimate_ids]
    );
    if (ests.length !== estimate_ids.length) {
      return res.status(404).json({ error: "One or more estimates not found" });
    }

    // Every estimate must be on the same job + customer, and all approved on same date.
    const jobId      = ests[0].job_id;
    const customerId = ests[0].customer_id;
    const firstDay   = ests[0].signed_at ? new Date(ests[0].signed_at).toISOString().slice(0,10) : null;
    for (const e of ests) {
      if (e.job_id !== jobId) return res.status(400).json({ error: "Estimates are not on the same job" });
      if (e.customer_id !== customerId) return res.status(400).json({ error: "Estimates are for different customers" });
      if (!['approved','signed'].includes(e.status)) {
        return res.status(400).json({ error: `Estimate ${e.id} is not approved yet` });
      }
      const day = e.signed_at ? new Date(e.signed_at).toISOString().slice(0,10) : null;
      if (day !== firstDay) return res.status(400).json({ error: "Estimates were approved on different days" });
      if (e.converted_invoice_id) return res.status(400).json({ error: `Estimate ${e.id} already converted to invoice ${e.converted_invoice_id}` });
    }

    // Sum totals. Reuse the first estimate's tax_rate + notes.
    const num = (v) => parseFloat(v || 0) || 0;
    const subtotal   = ests.reduce((s, e) => s + num(e.subtotal),   0);
    const tax_amount = ests.reduce((s, e) => s + num(e.tax_amount), 0);
    const total      = ests.reduce((s, e) => s + num(e.total),      0);
    const notes = ests.map((e) => `From estimate #${e.invoice_number || e.id}${e.notes ? `: ${e.notes}` : ''}`).join('\n');

    // Create merged invoice.
    const { rows: invRows } = await query(`
      INSERT INTO invoices (job_id, customer_id, type, status, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1,$2,'invoice','sent',$3,$4,$5,$6,$7) RETURNING *`,
      [jobId, customerId, subtotal, ests[0].tax_rate, tax_amount, total, notes]
    );
    const newInvoice = invRows[0];

    // Concatenate items across estimates in the caller's estimate_ids order.
    let order = 0;
    for (const id of estimate_ids) {
      const { rows: items } = await query(
        `SELECT * FROM invoice_items WHERE invoice_id=$1 ORDER BY sort_order, id`, [id]
      );
      for (const it of items) {
        await query(
          `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, cost, sort_order)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [newInvoice.id, it.description, it.quantity, it.unit_price, it.cost || 0, order++]
        );
      }
    }

    // Mark every source estimate converted and pointing at the merged invoice.
    await query(
      `UPDATE invoices SET status='converted', converted_invoice_id=$1 WHERE id = ANY($2::uuid[])`,
      [newInvoice.id, estimate_ids]
    );

    res.json({ invoice: newInvoice, combined_from: estimate_ids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/invoices/:id/payment  — record payment, move to paid or unpaid
router.post("/:id/payment", authenticate, async (req, res) => {
  try {
    // Ensure columns exist
    await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS payment_method TEXT`).catch(()=>{});
    await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS check_number TEXT`).catch(()=>{});

    const { amount_paid, payment_method, check_number } = req.body;
    const { rows: invRows } = await query("SELECT * FROM invoices WHERE id=$1", [req.params.id]);
    const invoice = invRows[0];
    if (!invoice) return res.status(404).json({ error: "Not found" });

    const newAmountPaid = parseFloat(invoice.amount_paid || 0) + parseFloat(amount_paid);
    const isPaid = newAmountPaid >= parseFloat(invoice.total);
    const newStatus = isPaid ? 'paid' : 'sent';

    const { rows } = await query(
      `UPDATE invoices
       SET amount_paid=$1, status=$2, paid_at=$3,
           payment_method=COALESCE($4, payment_method),
           check_number=COALESCE($5, check_number)
       WHERE id=$6 RETURNING *`,
      [newAmountPaid, newStatus, isPaid ? new Date() : null,
       payment_method || null, check_number || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Helper: load company + invoice_layout ────────────────────
async function loadCompanyAndLayout() {
  await query(`ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS invoice_layout JSONB DEFAULT '{}'::jsonb`).catch(()=>{});
  const { rows } = await query(
    `SELECT name, address, phone, email, logo_url, updated_at, invoice_layout FROM company_settings WHERE id='main'`
  );
  const row = rows[0] || {};
  const company = { name: row.name, address: row.address, phone: row.phone, email: row.email, logo_url: row.logo_url, updated_at: row.updated_at };
  const layout  = row.invoice_layout || {};
  return { company, layout };
}

// GET /api/invoices/:id/html — public printable invoice (no auth required)
router.get("/:id/html", async (req, res) => {
  try {
    const { rows } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`,
      [req.params.id]
    );
    if (!rows[0]) {
      return res.status(404).send(`<!DOCTYPE html><html><head><title>Not Found</title></head><body style="font-family:sans-serif;padding:48px;text-align:center;"><h2>Invoice not found</h2><p>This invoice does not exist or has been removed.</p></body></html>`);
    }
    const invoice = rows[0];
    const { company, layout } = await loadCompanyAndLayout();
    const html = generateInvoiceHtml(invoice, company, layout);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    res.status(500).send(`<html><body><pre>${err.message}</pre></body></html>`);
  }
});

// POST /api/invoices/:id/send-email — send invoice via email (requires auth)
router.post("/:id/send-email", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name, c.email, c.phone`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Invoice not found" });
    const invoice = rows[0];

    const { company, layout } = await loadCompanyAndLayout();

    const { to, subject, message } = req.body;
    if (!to) return res.status(400).json({ error: "'to' email address is required" });

    // SMTP config comes from Settings → Invoices and Estimates → Email.
    // buildTransport handles STARTTLS (587), implicit SSL (465), and plaintext.
    const { buildTransport, buildFrom } = require('../lib/mailer');
    const transport = buildTransport(layout);
    if (!transport) {
      return res.status(503).json({
        error: "SMTP is not configured. Go to Settings → Invoices and Estimates → Email to set up your outgoing mail server."
      });
    }

    const html = generateInvoiceHtml(invoice, company, layout);
    const { fromName, fromEmail } = buildFrom(layout, company);
    const isEst   = invoice.type === 'estimate';
    const docLabel = isEst ? 'Estimate' : 'Invoice';
    const total    = Number(invoice.total || 0).toLocaleString('en-US', { style:'currency', currency:'USD' });

    // Resolve template variables in subject/body
    const applyVars = (tmpl) => (tmpl || '')
      .replace(/\{number\}/g,   invoice.invoice_number || invoice.id || '')
      .replace(/\{company\}/g,  company.name || fromName)
      .replace(/\{customer\}/g, invoice.customer_name || '')
      .replace(/\{total\}/g,    total);

    const defaultSubjectKey = isEst ? 'email_estimate_subject' : 'email_invoice_subject';
    const defaultBodyKey    = isEst ? 'email_estimate_body'    : 'email_invoice_body';
    const defaultSubject    = `${docLabel} #{number} from {company}`;
    const defaultBody       = `Hi {customer},\n\nPlease find your ${docLabel.toLowerCase()} attached. The total is {total}.\n\nThank you for your business!\n\n{company}`;

    const emailSubject = applyVars(subject || layout[defaultSubjectKey] || defaultSubject);
    const emailBody    = applyVars(message || layout[defaultBodyKey]    || defaultBody);

    // Public "View & Print" link — customer opens the same HTML we render below.
    const publicBase = layout.public_url || process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:4000';
    const printUrl = `${publicBase.replace(/\/$/,'')}/api/invoices/${invoice.id}/html`;
    const printBtn = `
      <div style="text-align:center;margin:20px 0 28px;">
        <a href="${printUrl}"
           style="display:inline-block;background:#1a73e8;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-family:sans-serif;font-size:14px;">
          View &amp; Print ${docLabel}
        </a>
      </div>
      <p style="text-align:center;font-size:11px;color:#9ca3af;font-family:sans-serif;margin-top:-16px;">
        Or open the link: <a href="${printUrl}" style="color:#6b7280;">${printUrl}</a>
      </p>`;

    const mailOptions = {
      from:    `${fromName} <${fromEmail}>`,
      to,
      subject: emailSubject,
      html:    `<p style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#374151;">${emailBody.replace(/\n/g,'<br>')}</p>${printBtn}<hr style="margin:28px 0;border:none;border-top:1px solid #e5e7eb;">` + html,
    };

    await transport.sendMail(mailOptions);

    // Advance status from draft -> sent
    if (invoice.status === 'draft') {
      await query(`UPDATE invoices SET status='sent' WHERE id=$1`, [invoice.id]);
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

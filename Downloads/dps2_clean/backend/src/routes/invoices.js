const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

const INVOICE_SELECT = `
  SELECT i.*,
    c.first_name || ' ' || c.last_name as customer_name,
    json_agg(DISTINCT jsonb_build_object(
      'id', ii.id, 'description', ii.description,
      'quantity', ii.quantity, 'unit_price', ii.unit_price,
      'sort_order', ii.sort_order
    )) FILTER (WHERE ii.id IS NOT NULL) as line_items,
    json_agg(DISTINCT jsonb_build_object(
      'id', eo.id, 'label', eo.label, 'description', eo.description,
      'subtotal', eo.subtotal, 'total', eo.total,
      'selected', eo.selected, 'sort_order', eo.sort_order
    )) FILTER (WHERE eo.id IS NOT NULL) as options
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
  LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
  LEFT JOIN estimate_options eo ON eo.invoice_id = i.id
`;

// GET /api/invoices
router.get("/", authenticate, async (req, res) => {
  try {
    const { job_id, customer_id, status, type } = req.query;
    const conds = [], params = [];
    if (job_id)      { params.push(job_id);      conds.push(`i.job_id=$${params.length}`); }
    if (customer_id) { params.push(customer_id); conds.push(`i.customer_id=$${params.length}`); }
    if (type)        { params.push(type);         conds.push(`i.type=$${params.length}`); }
    if (status)      {
      // Support comma-separated statuses
      const statuses = status.split(',');
      params.push(statuses);
      conds.push(`i.status = ANY($${params.length})`);
    }
    const where = conds.length ? "WHERE " + conds.join(" AND ") : "";
    const { rows } = await query(`${INVOICE_SELECT} ${where} GROUP BY i.id, c.first_name, c.last_name ORDER BY i.created_at DESC`, params);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/invoices/:id
router.get("/:id", authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `${INVOICE_SELECT} WHERE i.id=$1 GROUP BY i.id, c.first_name, c.last_name`,
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
    for (let i = 0; i < options.length; i++) {
      const opt = options[i];
      const optSubtotal = (opt.items || []).reduce((s, it) => s + it.quantity * it.unit_price, 0);
      const optTax = optSubtotal * tax_rate;
      const { rows: optRows } = await query(
        `INSERT INTO estimate_options (invoice_id, label, description, subtotal, tax_amount, total, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [invoice.id, opt.label, opt.description, optSubtotal, optTax, optSubtotal + optTax, i]
      );
      for (let j = 0; j < (opt.items || []).length; j++) {
        const it = opt.items[j];
        await query(
          `INSERT INTO estimate_option_items (estimate_option_id, description, quantity, unit_price, sort_order) VALUES ($1,$2,$3,$4,$5)`,
          [optRows[0].id, it.description, it.quantity, it.unit_price, j]
        );
      }
    }

    res.status(201).json(invoice);
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

    // If option selected, mark it
    if (option_id) {
      await query("UPDATE estimate_options SET selected=true WHERE id=$1", [option_id]);
    }

    // Get selected option details for invoice total
    let subtotal = estimate.subtotal, tax_amount = estimate.tax_amount, total = estimate.total;
    if (option_id) {
      const { rows: optRows } = await query("SELECT * FROM estimate_options WHERE id=$1", [option_id]);
      if (optRows[0]) { subtotal = optRows[0].subtotal; tax_amount = optRows[0].tax_amount; total = optRows[0].total; }
    }

    // Create invoice from approved estimate
    const { rows: invRows } = await query(`
      INSERT INTO invoices (job_id, customer_id, type, status, subtotal, tax_rate, tax_amount, total, notes)
      VALUES ($1,$2,'invoice','current',$3,$4,$5,$6,$7) RETURNING *
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

// POST /api/invoices/:id/payment  — record payment, move to paid or unpaid
router.post("/:id/payment", authenticate, async (req, res) => {
  try {
    const { amount_paid } = req.body;
    const { rows: invRows } = await query("SELECT * FROM invoices WHERE id=$1", [req.params.id]);
    const invoice = invRows[0];
    if (!invoice) return res.status(404).json({ error: "Not found" });

    const newAmountPaid = parseFloat(invoice.amount_paid || 0) + parseFloat(amount_paid);
    const isPaid = newAmountPaid >= parseFloat(invoice.total);
    const newStatus = isPaid ? 'paid' : 'unpaid';

    const { rows } = await query(
      "UPDATE invoices SET amount_paid=$1, status=$2, paid_at=$3 WHERE id=$4 RETURNING *",
      [newAmountPaid, newStatus, isPaid ? new Date() : null, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;

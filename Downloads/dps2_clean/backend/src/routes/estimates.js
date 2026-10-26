const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const nodemailer = require('nodemailer');

// ── Helpers ────────────────────────────────────────────────────────────────
function calcTotals(items, taxRate = 0) {
  const subtotal = items.reduce((s, i) => s + (parseFloat(i.flat_rate) * (i.qty || 1)), 0);
  const taxAmount = subtotal * (parseFloat(taxRate) / 100);
  return { subtotal, taxAmount, total: subtotal + taxAmount };
}

// SQL fragment that builds Est-YYYY-JobNum[.seq] from the estimates row `e`
// plus its joined jobs row `j`. Kept close to the reads so both use the same shape.
const ESTIMATE_DISPLAY_NUMBER = `
  (
    'Est-' || EXTRACT(YEAR FROM COALESCE(e.created_at, NOW()))::int::text || '-'
    || COALESCE(
         LPAD(j.job_number::text,
              GREATEST(COALESCE((SELECT (invoice_defaults->>'number_pad')::int FROM company_settings WHERE id='main'), 4), 1),
              '0'),
         SUBSTRING(e.id::text, 1, 8)
       )
    || CASE
         WHEN e.job_id IS NOT NULL AND
              (SELECT COUNT(*) FROM estimates WHERE job_id = e.job_id) > 1
         THEN '.' || COALESCE(e.job_seq, 1)::text
         ELSE ''
       END
  )
`;

async function getEstimateWithItems(id) {
  const { rows: [est] } = await query(
    `SELECT e.*,
            c.first_name || ' ' || c.last_name AS customer_name,
            c.email AS customer_email, c.phone AS customer_phone,
            j.job_number,
            u.first_name || ' ' || u.last_name AS technician_name,
            ${ESTIMATE_DISPLAY_NUMBER} AS display_number
     FROM estimates e
     LEFT JOIN customers c ON c.id = e.customer_id
     LEFT JOIN jobs j ON j.id = e.job_id
     LEFT JOIN users u ON u.id = e.technician_id
     WHERE e.id = $1`, [id]
  );
  if (!est) return null;

  const { rows: items } = await query(
    `SELECT ei.*, t.name AS task_name, t.category_id
     FROM estimate_items ei
     LEFT JOIN pb_tasks t ON t.id = ei.task_id
     WHERE ei.estimate_id = $1
     ORDER BY ei.sort_order, ei.id`,
    [id]
  );
  return { ...est, items };
}

// ── Auth routes ────────────────────────────────────────────────────────────

// GET /api/estimates
router.get('/', authenticate, async (req, res) => {
  try {
    const { job_id, customer_id, status, limit = 50, offset = 0 } = req.query;
    const params = [];
    const wheres = [];
    if (job_id)      { params.push(job_id);      wheres.push(`e.job_id = $${params.length}`); }
    if (customer_id) { params.push(customer_id); wheres.push(`e.customer_id = $${params.length}`); }
    if (status)      { params.push(status);       wheres.push(`e.status = $${params.length}`); }
    params.push(limit, offset);

    const where = wheres.length ? 'WHERE ' + wheres.join(' AND ') : '';
    const { rows } = await query(
      `SELECT e.id, e.status, e.subtotal, e.total, e.created_at, e.updated_at,
              e.signed_at, e.sign_token,
              c.first_name || ' ' || c.last_name AS customer_name,
              j.job_number,
              u.first_name || ' ' || u.last_name AS technician_name,
              (SELECT COUNT(*) FROM estimate_items WHERE estimate_id = e.id) AS item_count,
              ${ESTIMATE_DISPLAY_NUMBER} AS display_number
       FROM estimates e
       LEFT JOIN customers c ON c.id = e.customer_id
       LEFT JOIN jobs j ON j.id = e.job_id
       LEFT JOIN users u ON u.id = e.technician_id
       ${where}
       ORDER BY e.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates
router.post('/', authenticate, async (req, res) => {
  try {
    const { job_id, customer_id, technician_id, notes, tax_rate = 0 } = req.body;
    const { rows: [est] } = await query(
      `INSERT INTO estimates (job_id,customer_id,technician_id,notes,tax_rate,status)
       VALUES ($1,$2,$3,$4,$5,'draft') RETURNING id`,
      [job_id || null, customer_id || null, technician_id || null, notes || '', tax_rate]
    );
    const full = await getEstimateWithItems(est.id);
    res.status(201).json(full);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// GET /api/estimates/:id
router.get('/:id', authenticate, async (req, res) => {
  try {
    const est = await getEstimateWithItems(req.params.id);
    if (!est) return res.status(404).json({ error: 'Estimate not found' });
    res.json(est);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT /api/estimates/:id
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { notes, tax_rate, status, job_description } = req.body;
    const { rows: [cur] } = await query('SELECT * FROM estimates WHERE id=$1', [req.params.id]);
    if (!cur) return res.status(404).json({ error: 'Not found' });

    const { rows: items } = await query(
      'SELECT * FROM estimate_items WHERE estimate_id=$1', [req.params.id]
    );
    const effectiveTaxRate = tax_rate !== undefined ? tax_rate : cur.tax_rate;
    const { subtotal, taxAmount, total } = calcTotals(items, effectiveTaxRate);

    await query(
      `UPDATE estimates SET
         notes=COALESCE($2,notes), tax_rate=COALESCE($3,tax_rate),
         status=COALESCE($4,status),
         job_description=COALESCE($8, job_description),
         subtotal=$5, tax_amount=$6, total=$7, updated_at=NOW()
       WHERE id=$1`,
      [req.params.id, notes, tax_rate, status, subtotal, taxAmount, total, job_description]
    );
    const full = await getEstimateWithItems(req.params.id);
    res.json(full);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/estimates/:id
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { rows: [est] } = await query('SELECT status FROM estimates WHERE id=$1', [req.params.id]);
    if (!est) return res.status(404).json({ error: 'Not found' });
    if (est.status === 'converted') return res.status(400).json({ error: 'Cannot delete a converted estimate' });
    await query('DELETE FROM estimates WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates/:id/items
router.post('/:id/items', authenticate, async (req, res) => {
  try {
    const body = req.body || {};
    // Accept either `qty` (legacy) or `quantity` (mobile/desktop) — same field.
    const { task_id, description, hours, material_cost, labor_cost, flat_rate, notes, sort_order = 0 } = body;
    const qty = body.qty ?? body.quantity ?? 1;

    const { rows: [item] } = await query(
      `INSERT INTO estimate_items
         (estimate_id,task_id,description,hours,material_cost,labor_cost,flat_rate,qty,notes,sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [req.params.id, task_id || null, description, hours || 0, material_cost || 0,
       labor_cost || 0, flat_rate || 0, qty, notes || '', sort_order]
    );

    // recompute totals
    const { rows: items } = await query('SELECT * FROM estimate_items WHERE estimate_id=$1', [req.params.id]);
    const { rows: [cur] } = await query('SELECT tax_rate FROM estimates WHERE id=$1', [req.params.id]);
    const { subtotal, taxAmount, total } = calcTotals(items, cur.tax_rate);
    await query(
      'UPDATE estimates SET subtotal=$2,tax_amount=$3,total=$4,updated_at=NOW() WHERE id=$1',
      [req.params.id, subtotal, taxAmount, total]
    );

    const full = await getEstimateWithItems(req.params.id);
    res.status(201).json(full);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE /api/estimates/:id/items/:itemId
router.delete('/:id/items/:itemId', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM estimate_items WHERE id=$1 AND estimate_id=$2',
      [req.params.itemId, req.params.id]);

    const { rows: items } = await query('SELECT * FROM estimate_items WHERE estimate_id=$1', [req.params.id]);
    const { rows: [cur] } = await query('SELECT tax_rate FROM estimates WHERE id=$1', [req.params.id]);
    const { subtotal, taxAmount, total } = calcTotals(items, cur.tax_rate);
    await query(
      'UPDATE estimates SET subtotal=$2,tax_amount=$3,total=$4,updated_at=NOW() WHERE id=$1',
      [req.params.id, subtotal, taxAmount, total]
    );

    const full = await getEstimateWithItems(req.params.id);
    res.json(full);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates/:id/send  — generate sign link, email customer
router.post('/:id/send', authenticate, async (req, res) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const { rows: [est] } = await query(
      `UPDATE estimates
       SET sign_token=$2, sign_token_expires_at=$3, status='sent', updated_at=NOW()
       WHERE id=$1 RETURNING *`,
      [req.params.id, token, expires]
    );
    if (!est) return res.status(404).json({ error: 'Estimate not found' });

    const full = await getEstimateWithItems(req.params.id);
    const signUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/sign/${token}`;

    // Try to email if customer has email. Uses SMTP config from
    // Settings → Invoices and Estimates → Email (same one invoices use).
    if (full.customer_email) {
      try {
        const { sendMail, loadCompanyAndLayout } = require('../lib/mailer');
        const { company, layout } = await loadCompanyAndLayout();
        const companyName = company.name || layout.smtp_from_name || 'DPS';
        const total = parseFloat(full.total).toFixed(2);

        const subjectTmpl = layout.email_estimate_subject || `Estimate #{number} from {company}`;
        const bodyTmpl    = layout.email_estimate_body    ||
          `Hi {customer},\n\nYour estimate is ready for review. Total: $${total}.\n\nClick below to review and sign.\n\nThank you!\n{company}`;

        const apply = (tmpl) => (tmpl || '')
          .replace(/\{number\}/g,   full.id)
          .replace(/\{company\}/g,  companyName)
          .replace(/\{customer\}/g, full.customer_name || '')
          .replace(/\{total\}/g,    `$${total}`);

        const subject = apply(subjectTmpl);
        const bodyHtml = apply(bodyTmpl).replace(/\n/g,'<br>');

        const publicBase = layout.public_url || process.env.PUBLIC_URL || process.env.API_URL || 'http://localhost:4000';
        const printUrl = `${publicBase.replace(/\/$/,'')}/api/invoices/${full.id}/html`;

        await sendMail({
          to: full.customer_email,
          subject,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151">
              <p style="font-size:14px;line-height:1.6">${bodyHtml}</p>
              ${full.job_description ? `<div style="background:#fef7e6;border-left:3px solid #e8a84a;padding:10px 14px;margin:12px 0;border-radius:0 6px 6px 0;">
                <div style="font-size:11px;font-weight:700;letter-spacing:.08em;color:#8a5a10;text-transform:uppercase;margin-bottom:4px;">Job Description</div>
                <div style="font-size:13px;color:#374151;white-space:pre-wrap;">${full.job_description.replace(/</g,'&lt;')}</div>
              </div>` : ''}
              <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
                ${full.items.map(i => `
                  <tr>
                    <td style="padding:8px;border-bottom:1px solid #eee">${i.description}</td>
                    <td style="padding:8px;border-bottom:1px solid #eee;text-align:right">$${parseFloat(i.flat_rate).toFixed(2)}</td>
                  </tr>`).join('')}
                <tr>
                  <td style="padding:8px;font-weight:bold">Total</td>
                  <td style="padding:8px;font-weight:bold;text-align:right">$${total}</td>
                </tr>
              </table>
              <div style="text-align:center;margin:22px 0;">
                <a href="${printUrl}" style="display:inline-block;background:#1a73e8;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;margin-right:8px;">View &amp; Print Estimate</a>
                <a href="${signUrl}" style="display:inline-block;background:#E20613;color:#fff;padding:11px 22px;border-radius:8px;text-decoration:none;font-weight:700;">Review &amp; Sign</a>
              </div>
              <p style="color:#666;font-size:12px;margin-top:16px">Sign link expires in 7 days.</p>
            </div>`,
        });
      } catch(mailErr) {
        console.error('Estimate email send failed:', mailErr.message);
      }
    }

    res.json({ ...full, sign_url: signUrl });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates/:id/sign  — in-person signature (technician submits)
router.post('/:id/sign', authenticate, async (req, res) => {
  try {
    const { signature_data, signed_by_name } = req.body;
    if (!signature_data) return res.status(400).json({ error: 'signature_data required' });

    const { rows: [est] } = await query(
      `UPDATE estimates
       SET signature_data=$2, signed_by_name=$3, signed_at=NOW(), status='signed', updated_at=NOW()
       WHERE id=$1 AND status IN ('draft','sent') RETURNING id`,
      [req.params.id, signature_data, signed_by_name || '']
    );
    if (!est) return res.status(400).json({ error: 'Estimate not found or already signed' });

    const full = await getEstimateWithItems(req.params.id);
    res.json(full);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates/:id/append-to-invoice  — append a signed estimate's
// items onto an existing open invoice on the SAME job. Used when a tech
// signs a second estimate mid-visit and wants to bundle it into the invoice
// that's already open instead of creating a duplicate. Legacy estimates
// live in `estimates` table (not the unified invoices/type='estimate'),
// so this needs to bridge across.
router.post('/:id/append-to-invoice', authenticate, async (req, res) => {
  try {
    const estimateId = req.params.id;
    const { invoice_id: invoiceId } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoice_id required' });

    const full = await getEstimateWithItems(estimateId);
    if (!full) return res.status(404).json({ error: 'Estimate not found' });
    if (full.status !== 'signed' && full.status !== 'approved') {
      return res.status(400).json({ error: 'Estimate must be signed before appending' });
    }
    if (full.invoice_id) return res.status(400).json({ error: `Estimate already linked to invoice ${full.invoice_id}` });

    const { rows: [inv] } = await query(`SELECT * FROM invoices WHERE id=$1 AND type='invoice'`, [invoiceId]);
    if (!inv) return res.status(404).json({ error: 'Invoice not found' });
    if (inv.status === 'paid') return res.status(400).json({ error: 'Invoice is already paid; cannot append' });
    if (inv.job_id !== full.job_id) return res.status(400).json({ error: 'Estimate and invoice are on different jobs' });
    if (inv.customer_id !== full.customer_id) return res.status(400).json({ error: 'Estimate and invoice are for different customers' });

    // Append items with continuation sort_order.
    const { rows: [{ max_order }] } = await query(
      `SELECT COALESCE(MAX(sort_order),-1) AS max_order FROM invoice_items WHERE invoice_id=$1`, [invoiceId]
    );
    let order = Number(max_order) + 1;
    for (const it of (full.items || [])) {
      await query(
        `INSERT INTO invoice_items (invoice_id,description,quantity,unit_price,notes,sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [invoiceId, it.description, it.qty || 1, it.flat_rate || 0, it.notes || '', order++]
      );
    }

    // Recompute totals for the invoice.
    const { rows: [totals] } = await query(
      `SELECT COALESCE(SUM(quantity * unit_price), 0)::numeric AS subtotal
         FROM invoice_items WHERE invoice_id=$1`, [invoiceId]
    );
    const num = (v) => parseFloat(v || 0) || 0;
    const subtotal  = num(totals.subtotal);
    const taxRate   = num(inv.tax_rate);
    const taxAmount = +(subtotal * (taxRate / 100)).toFixed(2);
    const total     = +(subtotal + taxAmount).toFixed(2);

    await query(
      `UPDATE invoices SET subtotal=$1, tax_amount=$2, total=$3,
              notes = COALESCE(notes,'') || CASE WHEN COALESCE(notes,'') = '' THEN '' ELSE E'\n' END || $4
        WHERE id=$5`,
      [subtotal, taxAmount, total, `Appended from estimate #${String(estimateId).slice(0,8)}`, invoiceId]
    );

    // Mark the legacy estimate as converted → this invoice.
    await query(
      `UPDATE estimates SET status='converted', invoice_id=$1, updated_at=NOW() WHERE id=$2`,
      [invoiceId, estimateId]
    );

    res.json({ invoice_id: invoiceId, estimate_id: estimateId, subtotal, tax_amount: taxAmount, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates/:id/convert  — convert signed estimate to invoice
router.post('/:id/convert', authenticate, async (req, res) => {
  try {
    const full = await getEstimateWithItems(req.params.id);
    if (!full) return res.status(404).json({ error: 'Estimate not found' });
    if (full.status !== 'signed') return res.status(400).json({ error: 'Estimate must be signed before converting' });

    // Resolve the due date: the job's invoice_due_date (set from the Calls tab)
    // wins, else default to +30 days from today.
    let dueDate = null;
    if (full.job_id) {
      const { rows:[j] } = await query(`SELECT invoice_due_date FROM jobs WHERE id=$1`, [full.job_id]);
      dueDate = j?.invoice_due_date || null;
    }
    if (!dueDate) {
      const d = new Date(); d.setDate(d.getDate() + 30);
      dueDate = d.toISOString().split('T')[0];
    }

    // Create invoice
    const { rows: [inv] } = await query(
      `INSERT INTO invoices (job_id,customer_id,type,status,subtotal,tax_rate,tax_amount,total,notes,due_date)
       VALUES ($1,$2,'invoice','draft',$3,$4,$5,$6,$7,$8) RETURNING id`,
      [full.job_id, full.customer_id, full.subtotal, full.tax_rate, full.tax_amount, full.total, full.notes || '', dueDate]
    );

    // Copy estimate items to invoice line items if invoice_items table exists (skip gracefully)
    try {
      for (const item of full.items) {
        await query(
          `INSERT INTO invoice_items (invoice_id,description,quantity,unit_price)
           VALUES ($1,$2,$3,$4)`,
          [inv.id, item.description, item.qty, item.flat_rate]
        );
      }
    } catch(_) { /* invoice_items may not exist yet */ }

    // Link estimate to invoice
    await query(
      `UPDATE estimates SET invoice_id=$2, status='converted', updated_at=NOW() WHERE id=$1`,
      [full.id, inv.id]
    );

    res.json({ estimate_id: full.id, invoice_id: inv.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ── Public routes (no auth — for customer-facing sign page) ──────────────

// GET /api/estimates/public/:token
router.get('/public/:token', async (req, res) => {
  try {
    const { rows: [est] } = await query(
      `SELECT e.id FROM estimates e
       WHERE e.sign_token = $1 AND e.sign_token_expires_at > NOW()
         AND e.status IN ('sent','draft')`,
      [req.params.token]
    );
    if (!est) return res.status(404).json({ error: 'Link not found or expired' });

    const full = await getEstimateWithItems(est.id);
    // Strip sensitive fields for public view
    const { sign_token, technician_id, ...safe } = full;
    res.json(safe);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST /api/estimates/public/:token/sign
router.post('/public/:token/sign', async (req, res) => {
  try {
    const { signature_data, signed_by_name } = req.body;
    if (!signature_data) return res.status(400).json({ error: 'signature_data required' });

    const { rows: [est] } = await query(
      `UPDATE estimates
       SET signature_data=$2, signed_by_name=$3, signed_at=NOW(), status='signed', updated_at=NOW()
       WHERE sign_token=$1 AND sign_token_expires_at > NOW()
         AND status IN ('sent','draft')
       RETURNING id`,
      [req.params.token, signature_data, signed_by_name || '']
    );
    if (!est) return res.status(400).json({ error: 'Invalid or expired link' });

    res.json({ ok: true, estimate_id: est.id });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

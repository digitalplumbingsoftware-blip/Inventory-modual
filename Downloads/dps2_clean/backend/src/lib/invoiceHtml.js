'use strict';

/**
 * generateInvoiceHtml(invoice, company, layout)
 * Fully layout-driven — every toggle, color, label, and section from
 * the InvoiceLayoutSettings customizer is respected here.
 */
function generateInvoiceHtml(invoice, company, layout = {}) {

  // ── Helpers ────────────────────────────────────────────────────
  const on  = (k, def = true) => layout[k] !== undefined ? !!layout[k] : def;
  const val = (k, fb = '')    => (layout[k] !== undefined && layout[k] !== '') ? layout[k] : fb;

  // ── Branding ───────────────────────────────────────────────────
  const primary   = val('primary_color', val('primaryColor', '#16a34a'));
  const accent    = val('accent_color',  val('accentColor',  '#14532d'));
  const logoUrl   = val('logo_url',      val('logoUrl', company.logo_url || ''));
  const tagline   = val('tagline', '');
  const logoPos   = val('logo_position', 'left');   // left | center | right
  const fontStyle = val('font_style', 'modern');    // modern | classic | minimal

  const fontFace = fontStyle === 'classic'
    ? "'Georgia','Times New Roman',serif"
    : fontStyle === 'minimal'
    ? "'Inter','Segoe UI',system-ui,sans-serif"
    : "'Helvetica Neue',Arial,sans-serif";

  // ── Header visibility ──────────────────────────────────────────
  const showLogo      = on('show_logo',             true);
  const showTagline   = on('show_tagline',           true);
  const showCoAddr    = on('show_company_address',   true);
  const showCoPhone   = on('show_company_phone',     true);
  const showCoEmail   = on('show_company_email',     true);
  const showCoWeb     = on('show_company_website',   false);
  const showCustAddr  = on('show_customer_address',  true);
  const showCustPhone = on('show_customer_phone',    true);
  const showCustEmail = on('show_customer_email',    false);
  const showInvNum    = on('show_invoice_number',    true);
  const showInvDate   = on('show_invoice_date',      true);
  const showDueDate   = on('show_due_date',          true);
  const showPoNum     = on('show_po_number',         false);
  const showJobRef    = on('show_job_reference',     true);

  // ── Line item columns ──────────────────────────────────────────
  const showColIndex  = on('show_col_index',      false);
  const showColSku    = on('show_col_sku',         false);
  const showColQty    = on('show_col_qty',         true);
  const showColUnit   = on('show_col_unit_price',  true);
  const showColTotal  = on('show_col_line_total',  true);
  const showColNotes  = on('show_col_notes',       false);

  // ── Totals ─────────────────────────────────────────────────────
  const showSubtotal  = on('show_subtotal',       true);
  const showDiscount  = on('show_discount_line',  false);
  const showTax       = on('show_tax_line', on('show_tax', true));
  const showAmtPaid   = on('show_amount_paid',    true);
  const showBalDue    = on('show_balance_due',    true);

  // ── Extra sections ─────────────────────────────────────────────
  const showWatermark   = on('show_paid_watermark',       true);
  const showSigLine     = on('show_signature_line',       false);
  const showThankYou    = on('show_thank_you',            true);
  const showPayInstr    = on('show_payment_instructions', true);
  const showNotes       = on('show_notes_section',        true);
  const showTerms       = on('show_terms',                true);
  const showFooter      = on('show_footer',               true);

  // ── Content ────────────────────────────────────────────────────
  const thankYouText  = val('thank_you_text',  'Thank you for your business!');
  const bankDetails   = val('bank_details',    val('bankDetails', ''));
  const termsText     = val('terms', '');
  const footerText    = val('footer_text',     val('footerText', val('paymentTerms', '')));

  // Column header labels (customizable)
  const invoiceTitle = val('invoice_title',          'INVOICE');
  const estimateTitle= val('estimate_title',         'ESTIMATE');
  const lblDesc      = val('col_label_description',  'Description');
  const lblQty       = val('col_label_qty',          'Qty');
  const lblUnit      = val('col_label_unit_price',   'Unit Price');
  const lblAmt       = val('col_label_total',        'Amount');
  const lblSku       = val('col_label_sku',          'SKU');
  const dateFormat   = val('date_format',            'M/D/YYYY');

  // ── Invoice data ───────────────────────────────────────────────
  const isPaid      = invoice.status === 'paid';
  const isEstimate  = invoice.type   === 'estimate';
  const docLabel    = isEstimate ? estimateTitle : invoiceTitle;

  const fmt = (n) =>
    Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const fmtDate = (d) => {
    if (!d) return '—';
    try {
      const dt = new Date(d);
      const M = dt.getMonth() + 1, D = dt.getDate(), Y = dt.getFullYear();
      const MM = String(M).padStart(2, '0'), DD = String(D).padStart(2, '0');
      const MONTHS  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      const MONTHSS = MONTHS.map(m => m.slice(0, 3));
      switch (dateFormat) {
        case 'MM/DD/YYYY':   return `${MM}/${DD}/${Y}`;
        case 'MMMM D, YYYY': return `${MONTHS[dt.getMonth()]} ${D}, ${Y}`;
        case 'MMM D, YYYY':  return `${MONTHSS[dt.getMonth()]} ${D}, ${Y}`;
        case 'YYYY-MM-DD':   return `${Y}-${MM}-${DD}`;
        default:             return `${M}/${D}/${Y}`;
      }
    } catch { return String(d); }
  };

  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];
  const subtotal  = parseFloat(invoice.subtotal      || 0);
  const taxAmt    = parseFloat(invoice.tax_amount    || 0);
  const total     = parseFloat(invoice.total         || 0);
  const amtPaid   = parseFloat(invoice.amount_paid   || 0);
  const discount  = parseFloat(invoice.discount_amount || 0);
  const balDue    = total - amtPaid;
  const taxRate   = invoice.tax_rate
    ? (parseFloat(invoice.tax_rate) * 100).toFixed(2) + '%'
    : '';

  // ── Column count (for colspan math) ───────────────────────────
  const activeCols = [showColIndex, showColSku, true, showColQty, showColUnit, showColTotal].filter(Boolean).length;
  const spacerCols = activeCols - 2; // label + amount columns

  // ── Table header ───────────────────────────────────────────────
  const theadCols = [
    showColIndex && `<th style="text-align:right;width:32px;">#</th>`,
    showColSku   && `<th style="text-align:left;width:78px;">${escHtml(lblSku)}</th>`,
    /* desc */     `<th style="text-align:left;">${escHtml(lblDesc)}</th>`,
    showColQty   && `<th style="text-align:right;width:52px;">${escHtml(lblQty)}</th>`,
    showColUnit  && `<th style="text-align:right;width:88px;">${escHtml(lblUnit)}</th>`,
    showColTotal && `<th style="text-align:right;width:88px;">${escHtml(lblAmt)}</th>`,
  ].filter(Boolean).join('');

  // ── Table body ─────────────────────────────────────────────────
  const tbodyRows = lineItems.length
    ? lineItems.map((it, i) => {
        const qty  = parseFloat(it.quantity   || 1);
        const price= parseFloat(it.unit_price || 0);
        const ext  = qty * price;
        const mainRow = `
        <tr>
          ${showColIndex && `<td class="td-num" style="color:#9ca3af;font-size:0.78em;">${i + 1}</td>` || ''}
          ${showColSku   && `<td class="td-desc" style="font-size:0.78em;color:#6b7280;">${escHtml(it.sku || it.item_code || '')}</td>` || ''}
          <td class="td-desc">${escHtml(it.description || '')}</td>
          ${showColQty   && `<td class="td-num">${qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(2)}</td>` || ''}
          ${showColUnit  && `<td class="td-num">${fmt(price)}</td>` || ''}
          ${showColTotal && `<td class="td-num">${fmt(ext)}</td>` || ''}
        </tr>`;
        // Always render the scope-of-work note when the line has one, even if
        // the layout toggle is off — otherwise techs upload useful detail that
        // never reaches the printable doc.
        const noteRow = it.notes ? `
        <tr style="background:transparent!important;">
          ${showColIndex ? '<td></td>' : ''}
          ${showColSku   ? '<td></td>' : ''}
          <td class="td-desc" style="padding-top:0;padding-bottom:8px;font-size:0.78em;color:#6b7280;font-style:italic;">${escHtml(it.notes)}</td>
          ${showColQty   ? '<td></td>' : ''}
          ${showColUnit  ? '<td></td>' : ''}
          ${showColTotal ? '<td></td>' : ''}
        </tr>` : '';
        return mainRow + noteRow;
      }).join('')
    : `<tr><td colspan="${activeCols}" class="td-desc" style="color:#6b7280;font-style:italic;text-align:center;padding:20px;">No items added yet.</td></tr>`;

  // ── Totals footer ──────────────────────────────────────────────
  const tfootRows = [
    showSubtotal ? `
      <tr>
        <td colspan="${spacerCols}"></td>
        <td class="label">Subtotal</td>
        <td class="amount">${fmt(subtotal)}</td>
      </tr>` : '',
    showDiscount && discount > 0 ? `
      <tr>
        <td colspan="${spacerCols}"></td>
        <td class="label">Discount</td>
        <td class="amount" style="color:#b91c1c;">(${fmt(discount)})</td>
      </tr>` : '',
    showTax ? `
      <tr>
        <td colspan="${spacerCols}"></td>
        <td class="label">Tax${taxRate ? ` (${taxRate})` : ''}</td>
        <td class="amount">${fmt(taxAmt)}</td>
      </tr>` : '',
    `<tr class="total-row">
        <td colspan="${spacerCols}"></td>
        <td class="label" style="color:${accent};font-weight:700;">Total</td>
        <td class="amount">${fmt(total)}</td>
     </tr>`,
    showAmtPaid && amtPaid > 0 ? `
      <tr>
        <td colspan="${spacerCols}"></td>
        <td class="label">Amount Paid</td>
        <td class="amount" style="color:#15803d;">(${fmt(amtPaid)})</td>
      </tr>` : '',
    showBalDue && amtPaid > 0 ? `
      <tr class="balance-row">
        <td colspan="${spacerCols}"></td>
        <td class="label" style="color:${primary};font-weight:800;">Balance Due</td>
        <td class="amount">${fmt(balDue)}</td>
      </tr>` : '',
  ].filter(Boolean).join('');

  // ── Company info lines ─────────────────────────────────────────
  const coLines = [
    company.name    ? `<strong>${escHtml(company.name)}</strong>` : '',
    showTagline && tagline
      ? `<span style="color:${primary};font-size:0.82em;">${escHtml(tagline)}</span>` : '',
    showCoAddr  && company.address ? escHtml(company.address)   : '',
    showCoPhone && company.phone   ? escHtml(company.phone)     : '',
    showCoEmail && company.email
      ? `<a href="mailto:${escHtml(company.email)}" style="color:${primary};">${escHtml(company.email)}</a>` : '',
    showCoWeb   && company.website
      ? `<a href="${escHtml(company.website)}" style="color:${primary};">${escHtml(company.website)}</a>` : '',
  ].filter(Boolean).join('<br>');

  // ── Customer info lines ────────────────────────────────────────
  const custLines = [
    `<strong>${escHtml(invoice.customer_name || 'Customer')}</strong>`,
    showCustAddr  && invoice.customer_address ? escHtml(invoice.customer_address) : '',
    showCustPhone && invoice.customer_phone   ? escHtml(invoice.customer_phone)   : '',
    showCustEmail && invoice.customer_email   ? escHtml(invoice.customer_email)   : '',
  ].filter(Boolean).join('<br>');

  // ── Logo / company block ───────────────────────────────────────
  const alignStyle = logoPos === 'center' ? 'text-align:center;' : logoPos === 'right' ? 'text-align:right;' : '';
  const imgStyle   = logoPos === 'center' ? 'margin:0 auto;display:block;' : logoPos === 'right' ? 'margin-left:auto;display:block;' : 'display:block;';
  // Cache-bust: the file at /uploads/company_logo.png keeps the same URL when
  // re-uploaded, so browsers show a stale image without a version query.
  const bustedLogoUrl = logoUrl && !logoUrl.includes('?')
    ? `${logoUrl}?v=${company.updated_at ? new Date(company.updated_at).getTime() : Date.now()}`
    : logoUrl;
  const logoBlock  = showLogo && logoUrl
    ? `<img src="${escHtml(bustedLogoUrl)}" alt="Logo" style="max-height:72px;max-width:200px;object-fit:contain;${imgStyle}">
       <div class="company-info" style="margin-top:8px;${alignStyle}">${coLines}</div>`
    : `<div class="co-name">${escHtml(company.name || '')}</div>
       <div class="company-info" style="margin-top:6px;">${coLines}</div>`;

  // ── Doc meta (right side of header) ───────────────────────────
  const docMeta = [
    showInvNum  ? `<div class="doc-number">#${escHtml(String(invoice.display_number || invoice.invoice_number || invoice.id || ''))}</div>` : '',
    '<div class="doc-dates">',
    showInvDate
      ? `<span style="color:#374151;font-weight:600;">Date:</span> ${fmtDate(invoice.created_at)}<br>` : '',
    showDueDate && invoice.due_date
      ? `<span style="color:#374151;font-weight:600;">Due:</span> ${fmtDate(invoice.due_date)}<br>` : '',
    showPoNum && invoice.po_number
      ? `<span style="color:#374151;font-weight:600;">PO#:</span> ${escHtml(invoice.po_number)}<br>` : '',
    showJobRef && invoice.job_id
      ? `<span style="color:#374151;font-weight:600;">Job:</span> #${escHtml(String(invoice.job_id))}<br>` : '',
    `<span class="status-badge status-${escHtml(invoice.status || 'draft')}">${escHtml(invoice.status || 'draft')}</span>`,
    '</div>',
  ].filter(Boolean).join('');

  // ── Optional bottom sections ───────────────────────────────────
  const paidWatermark = isPaid && showWatermark
    ? `<div class="paid-stamp">PAID</div>` : '';

  const notesSection = showNotes && invoice.notes
    ? `<div class="notes-section">
         <div class="notes-label">Notes</div>
         <div class="notes-body">${escHtml(invoice.notes)}</div>
       </div>` : '';

  const jobDescSection = invoice.job_description
    ? `<div class="notes-section" style="background:#fef7e6;border-left-color:#e8a84a;margin-bottom:16px;">
         <div class="notes-label" style="color:#8a5a10;">Job Description</div>
         <div class="notes-body">${escHtml(invoice.job_description)}</div>
       </div>` : '';

  const thankYouSection = showThankYou
    ? `<div style="text-align:center;font-size:0.95em;color:#374151;font-style:italic;margin-bottom:20px;">${escHtml(thankYouText)}</div>` : '';

  const bankSection = showPayInstr && bankDetails
    ? `<div class="bank-details">
         <strong>Payment Information</strong><br>
         ${escHtml(bankDetails).replace(/\n/g, '<br>')}
       </div>` : '';

  const termsSection = showTerms && termsText
    ? `<div class="terms-section">
         <div class="terms-label">Terms &amp; Conditions</div>
         <div class="terms-body">${escHtml(termsText).replace(/\n/g, '<br>')}</div>
       </div>` : '';

  const sigSection = showSigLine
    ? `<div class="signature-section">
         <div class="sig-line"><span>Authorized Signature</span></div>
         <div class="sig-line"><span>Date</span></div>
       </div>` : '';

  const footerSection = showFooter && footerText
    ? `<div class="footer-text">${escHtml(footerText)}</div>` : '';

  // ── Final HTML ─────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docLabel} #${escHtml(invoice.display_number || invoice.invoice_number || invoice.id || '')}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: ${fontFace};
    font-size: 13px; color: #111827;
    background: #f3f4f6;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .page {
    background: #fff; max-width: 800px;
    margin: 24px auto; padding: 48px 52px;
    border-radius: 8px; box-shadow: 0 4px 32px rgba(0,0,0,.10);
    position: relative; overflow: hidden;
  }
  /* Header */
  .header    { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:36px; gap:20px; }
  .logo-block { flex:1; }
  .co-name   { font-size:1.4em; font-weight:700; color:${accent}; }
  .company-info { font-size:0.82em; line-height:1.6; color:#374151; }
  .doc-block { text-align:right; flex-shrink:0; }
  .doc-label { font-size:2em; font-weight:800; letter-spacing:.04em; color:${primary}; line-height:1; }
  .doc-number{ font-size:1em; font-weight:600; color:#374151; margin-top:4px; }
  .doc-dates { font-size:0.80em; color:#6b7280; margin-top:6px; line-height:1.7; }
  /* Divider */
  .divider { height:3px; background:linear-gradient(90deg,${primary},${accent}); border-radius:2px; margin-bottom:28px; }
  /* Bill-to */
  .meta-row      { display:flex; justify-content:space-between; margin-bottom:32px; gap:16px; flex-wrap:wrap; }
  .bill-to-label { font-size:0.72em; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:${primary}; margin-bottom:5px; }
  .bill-to-addr  { font-size:0.88em; line-height:1.6; color:#374151; }
  /* Badges */
  .status-badge    { display:inline-block; padding:3px 12px; border-radius:999px; font-size:0.75em; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
  .status-paid     { background:#dcfce7; color:#15803d; }
  .status-sent     { background:#dbeafe; color:#1d4ed8; }
  .status-draft    { background:#f3f4f6; color:#6b7280; }
  .status-overdue  { background:#fee2e2; color:#b91c1c; }
  .status-approved { background:#d1fae5; color:#065f46; }
  /* Table */
  .items-table { width:100%; border-collapse:collapse; margin-bottom:24px; }
  .items-table thead tr { background:${primary}; color:#fff; }
  .items-table th { padding:10px 12px; font-size:0.78em; font-weight:700; text-transform:uppercase; letter-spacing:.07em; }
  .items-table th:first-child { border-radius:6px 0 0 6px; }
  .items-table th:last-child  { border-radius:0 6px 6px 0; }
  .items-table tbody tr:nth-child(even) { background:#f9fafb; }
  .td-desc { padding:10px 12px; vertical-align:top; }
  .td-num  { padding:10px 12px; text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
  .items-table tfoot td { padding:7px 12px; font-size:0.88em; }
  .items-table tfoot tr.total-row td   { font-size:1em; font-weight:700; color:${accent}; border-top:2px solid ${primary}; }
  .items-table tfoot tr.balance-row td { font-size:1.1em; font-weight:800; color:${primary}; padding-top:4px; }
  .items-table tfoot .label  { text-align:right; color:#6b7280; }
  .items-table tfoot .amount { text-align:right; }
  /* Notes */
  .notes-section { background:#f9fafb; border-left:3px solid ${primary}; padding:12px 16px; margin-bottom:20px; border-radius:0 6px 6px 0; }
  .notes-label   { font-size:0.72em; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:${primary}; margin-bottom:4px; }
  .notes-body    { font-size:0.88em; color:#374151; line-height:1.6; white-space:pre-wrap; }
  /* Terms */
  .terms-section { margin-bottom:20px; padding:12px 16px; border:1px solid #e5e7eb; border-radius:6px; }
  .terms-label   { font-size:0.72em; font-weight:700; text-transform:uppercase; letter-spacing:.1em; color:#6b7280; margin-bottom:4px; }
  .terms-body    { font-size:0.78em; color:#9ca3af; line-height:1.6; }
  /* Bank */
  .bank-details { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:12px 16px; margin-bottom:20px; font-size:0.85em; color:#374151; line-height:1.6; }
  /* Signature */
  .signature-section { display:flex; gap:60px; margin:32px 0 24px; }
  .sig-line { flex:1; border-top:1px solid #d1d5db; padding-top:6px; font-size:0.78em; color:#6b7280; }
  /* Footer */
  .footer-text { text-align:center; font-size:0.78em; color:#9ca3af; margin-top:32px; padding-top:16px; border-top:1px solid #e5e7eb; }
  /* PAID watermark */
  .paid-stamp {
    position:absolute; top:50%; left:50%;
    transform:translate(-50%,-50%) rotate(-35deg);
    font-size:6em; font-weight:900; letter-spacing:.15em;
    color:rgba(22,163,74,.12); border:0.12em solid rgba(22,163,74,.15);
    border-radius:10px; padding:0.1em 0.35em;
    pointer-events:none; white-space:nowrap; z-index:0; user-select:none;
  }
  @media print {
    body  { background:#fff !important; }
    .page { box-shadow:none; margin:0; max-width:100%; border-radius:0; padding:24px 32px; }
    a     { color:inherit !important; text-decoration:none; }
  }
  @page { size:letter; margin:0.5in; }
</style>
</head>
<body>
<div class="page">
  ${paidWatermark}

  <div class="header">
    <div class="logo-block">${logoBlock}</div>
    <div class="doc-block">
      <div class="doc-label">${docLabel}</div>
      ${docMeta}
    </div>
  </div>

  <div class="divider"></div>

  <div class="meta-row">
    <div>
      <div class="bill-to-label">Bill To</div>
      <div class="bill-to-addr">${custLines}</div>
    </div>
    ${invoice.payment_method ? `
    <div style="text-align:right;">
      <div class="bill-to-label">Payment Method</div>
      <div style="font-size:0.88em;color:#374151;">${escHtml(invoice.payment_method.replace(/_/g,' '))}</div>
    </div>` : ''}
  </div>

  ${jobDescSection}

  <table class="items-table">
    <thead><tr>${theadCols}</tr></thead>
    <tbody>${tbodyRows}</tbody>
    <tfoot>${tfootRows}</tfoot>
  </table>

  ${notesSection}
  ${thankYouSection}
  ${bankSection}
  ${termsSection}
  ${sigSection}
  ${footerSection}
</div>
</body>
</html>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = { generateInvoiceHtml };

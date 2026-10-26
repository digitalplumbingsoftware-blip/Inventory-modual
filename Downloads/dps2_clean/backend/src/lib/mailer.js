// Shared outgoing mail helper. Reads SMTP config from company_settings.invoice_layout
// so the Settings → Invoices & Estimates → Email screen is the single source of truth
// for both invoice and estimate emails. Falls back to SMTP_* env vars if the layout
// is missing (legacy behavior).

const nodemailer = require('nodemailer');
const { query } = require('../db/pool');

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

// Build a nodemailer transport from the saved layout. Understands the three
// security modes the UI writes: 'tls' (STARTTLS, port 587), 'ssl' (implicit,
// port 465), 'none' (plaintext).
function buildTransport(layout) {
  const host   = layout.smtp_host || layout.smtp?.host || process.env.SMTP_HOST;
  const port   = Number(layout.smtp_port || layout.smtp?.port || process.env.SMTP_PORT || 587);
  const user   = layout.smtp_user || layout.smtp?.auth?.user || layout.smtp?.user || process.env.SMTP_USER;
  const pass   = layout.smtp_pass || layout.smtp?.auth?.pass || layout.smtp?.pass || process.env.SMTP_PASS;
  const secureMode = layout.smtp_secure || (layout.smtp?.secure ? 'ssl' : 'tls');

  if (!host) return null;

  const isSSL   = secureMode === 'ssl';
  const isTLS   = secureMode === 'tls';

  return nodemailer.createTransport({
    host,
    port,
    secure:     isSSL,          // true = SMTPS (465), false = STARTTLS or plain
    requireTLS: isTLS,          // force STARTTLS upgrade on 587 (Brevo, Gmail, SES)
    auth:       user ? { user, pass } : undefined,
  });
}

function buildFrom(layout, company) {
  const fromName  = layout.smtp_from_name  || layout.fromName  || company.name || 'DPS';
  const fromEmail = layout.smtp_from_email || layout.fromEmail
                    || layout.smtp_user   || process.env.SMTP_FROM || process.env.SMTP_USER || '';
  return { fromName, fromEmail, from: `${fromName} <${fromEmail}>` };
}

// One-call helper used by routes.
async function sendMail({ to, subject, html, text }) {
  const { company, layout } = await loadCompanyAndLayout();
  const transport = buildTransport(layout);
  if (!transport) {
    const err = new Error('SMTP is not configured. Go to Settings → Invoices and Estimates → Email to set up your outgoing mail server.');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }
  const { from } = buildFrom(layout, company);
  return transport.sendMail({ from, to, subject, html, text });
}

module.exports = { loadCompanyAndLayout, buildTransport, buildFrom, sendMail };

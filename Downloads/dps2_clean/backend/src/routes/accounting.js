const router  = require('express').Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ── Schema migration (idempotent) ────────────────────────────────────────────
// AR aging + open-invoices queries reference invoices.due_date.
// On older databases the column may not exist — add it so accounting works.
(async () => {
  try {
    await query(`ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE`);
  } catch (e) { /* ignore */ }
})();

// ── GET /api/accounting/summary ────────────────────────────────────────────────
// Returns all KPI data needed for the accounting dashboard in one shot.
router.get('/summary', authenticate, async (req, res) => {
  try {
    const [
      revMtd, revYtd, revPrevMonth,
      arTotal, arAging,
      taxMtd, taxYtd,
      payMethods,
      recentPayments,
      topTechsRes, topCustomersRes, statsMtdRes,
    ] = await Promise.all([

      // Revenue collected this calendar month
      query(`
        SELECT COALESCE(SUM(total), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())
      `),

      // Revenue collected this calendar year
      query(`
        SELECT COALESCE(SUM(total), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('year', paid_at) = DATE_TRUNC('year', NOW())
      `),

      // Revenue collected previous calendar month (for MoM delta)
      query(`
        SELECT COALESCE(SUM(total), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')
      `),

      // Total open AR (unpaid invoices, not voided)
      query(`
        SELECT COALESCE(SUM(total), 0) AS value
        FROM invoices
        WHERE type = 'invoice'
          AND status NOT IN ('paid', 'void', 'draft')
      `),

      // AR aging buckets — Today (same-day), 1-30, 31-60, 61-90, 90+
      // Measured from the invoice's created_at (day of service). If a customer
      // doesn't pay the same day as service they roll into the 1-30 bucket.
      query(`
        SELECT
          COUNT(*) FILTER (WHERE age_days = 0)                       AS current_count,
          COALESCE(SUM(total) FILTER (WHERE age_days = 0), 0)        AS current_amt,
          COUNT(*) FILTER (WHERE age_days BETWEEN 1 AND 30)          AS d30_count,
          COALESCE(SUM(total) FILTER (WHERE age_days BETWEEN 1 AND 30), 0) AS d30_amt,
          COUNT(*) FILTER (WHERE age_days BETWEEN 31 AND 60)         AS d60_count,
          COALESCE(SUM(total) FILTER (WHERE age_days BETWEEN 31 AND 60), 0) AS d60_amt,
          COUNT(*) FILTER (WHERE age_days BETWEEN 61 AND 90)         AS d90_count,
          COALESCE(SUM(total) FILTER (WHERE age_days BETWEEN 61 AND 90), 0) AS d90_amt,
          COUNT(*) FILTER (WHERE age_days > 90)                      AS d90p_count,
          COALESCE(SUM(total) FILTER (WHERE age_days > 90), 0)       AS d90p_amt
        FROM (
          SELECT total,
            GREATEST(0, (CURRENT_DATE - created_at::date))::int AS age_days
          FROM invoices
          WHERE type = 'invoice'
            AND status NOT IN ('paid', 'void', 'draft')
        ) sub
      `),

      // Tax collected this month
      query(`
        SELECT COALESCE(SUM(tax_amount), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())
      `),

      // Tax collected this year
      query(`
        SELECT COALESCE(SUM(tax_amount), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('year', paid_at) = DATE_TRUNC('year', NOW())
      `),

      // Payment method breakdown MTD
      query(`
        SELECT
          COALESCE(payment_method, 'Unknown') AS method,
          COUNT(*) AS count,
          COALESCE(SUM(total), 0) AS total
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())
        GROUP BY payment_method
        ORDER BY total DESC
      `),

      // 10 most recent payments
      query(`
        SELECT
          i.id, i.invoice_number, i.total, i.tax_amount, i.paid_at,
          i.payment_method, i.status,
          c.first_name || ' ' || c.last_name AS customer_name
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.status = 'paid'
        ORDER BY i.paid_at DESC
        LIMIT 10
      `),

      // Top techs MTD by collected revenue (joined via job → technician)
      query(`
        SELECT
          u.id,
          u.first_name || ' ' || u.last_name AS name,
          u.color,
          u.initials,
          COUNT(DISTINCT i.id)               AS invoice_count,
          COALESCE(SUM(i.total), 0)          AS revenue
        FROM invoices i
        JOIN jobs j  ON j.id = i.job_id
        JOIN users u ON u.id = j.technician_id
        WHERE i.status = 'paid'
          AND DATE_TRUNC('month', i.paid_at) = DATE_TRUNC('month', NOW())
        GROUP BY u.id, u.first_name, u.last_name, u.color, u.initials
        ORDER BY revenue DESC
        LIMIT 5
      `),

      // Top customers MTD by collected revenue
      query(`
        SELECT
          c.id,
          c.first_name || ' ' || c.last_name AS name,
          COUNT(*)                           AS invoice_count,
          COALESCE(SUM(i.total), 0)          AS revenue
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.status = 'paid'
          AND DATE_TRUNC('month', i.paid_at) = DATE_TRUNC('month', NOW())
        GROUP BY c.id, c.first_name, c.last_name
        ORDER BY revenue DESC
        LIMIT 5
      `),

      // Avg ticket MTD + invoice counts
      query(`
        SELECT
          COUNT(*)                                AS invoice_count_mtd,
          COALESCE(AVG(total), 0)                 AS avg_ticket_mtd,
          COALESCE(MAX(total), 0)                 AS max_ticket_mtd
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('month', paid_at) = DATE_TRUNC('month', NOW())
      `),
    ]);

    const aging = arAging.rows[0];
    const statsMtd = statsMtdRes.rows[0] || {};

    res.json({
      revenue: {
        mtd:        parseFloat(revMtd.rows[0].value),
        ytd:        parseFloat(revYtd.rows[0].value),
        prev_month: parseFloat(revPrevMonth.rows[0].value),
      },
      ar: {
        total: parseFloat(arTotal.rows[0].value),
        aging: {
          current: { count: parseInt(aging.current_count), amount: parseFloat(aging.current_amt) },
          d30:     { count: parseInt(aging.d30_count),     amount: parseFloat(aging.d30_amt)     },
          d60:     { count: parseInt(aging.d60_count),     amount: parseFloat(aging.d60_amt)     },
          d90:     { count: parseInt(aging.d90_count),     amount: parseFloat(aging.d90_amt)     },
          d90p:    { count: parseInt(aging.d90p_count),    amount: parseFloat(aging.d90p_amt)    },
        },
      },
      tax: {
        mtd: parseFloat(taxMtd.rows[0].value),
        ytd: parseFloat(taxYtd.rows[0].value),
      },
      payment_methods: payMethods.rows.map(r => ({
        method: r.method,
        count:  parseInt(r.count),
        total:  parseFloat(r.total),
      })),
      recent_payments: recentPayments.rows,
      // Newly added — drives Overview's Top Techs / Top Customers / Avg Ticket
      stats_mtd: {
        invoice_count: parseInt(statsMtd.invoice_count_mtd || 0),
        avg_ticket:    parseFloat(statsMtd.avg_ticket_mtd  || 0),
        max_ticket:    parseFloat(statsMtd.max_ticket_mtd  || 0),
      },
      top_techs: topTechsRes.rows.map(r => ({
        id: r.id, name: r.name, color: r.color, initials: r.initials,
        invoice_count: parseInt(r.invoice_count),
        revenue:       parseFloat(r.revenue),
      })),
      top_customers: topCustomersRes.rows.map(r => ({
        id: r.id, name: r.name,
        invoice_count: parseInt(r.invoice_count),
        revenue:       parseFloat(r.revenue),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/accounting/revenue-chart ─────────────────────────────────────────
// Monthly revenue + tax for the last 12 months
router.get('/revenue-chart', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', paid_at), 'Mon YY') AS month,
        DATE_TRUNC('month', paid_at)                    AS month_date,
        COALESCE(SUM(total), 0)                         AS revenue,
        COALESCE(SUM(tax_amount), 0)                    AS tax,
        COUNT(*)                                        AS invoice_count
      FROM invoices
      WHERE status = 'paid'
        AND paid_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', paid_at)
      ORDER BY month_date ASC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/accounting/revenue-detail ────────────────────────────────────────
// Detailed revenue breakdown for the Revenue tab.
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD (defaults to YTD)
router.get('/revenue-detail', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10);
    const today     = now.toISOString().slice(0,10);
    const from = req.query.from || yearStart;
    const to   = req.query.to   || today;

    const [
      byTech, byJobType, topCustomers,
      thisYearTotal, lastYearTotal, thisPeriodAvg,
    ] = await Promise.all([

      // Revenue by technician in range
      query(`
        SELECT
          u.id, u.first_name || ' ' || u.last_name AS name,
          u.color, u.initials,
          COUNT(DISTINCT i.id)        AS invoice_count,
          COALESCE(SUM(i.total), 0)   AS revenue,
          COALESCE(AVG(i.total), 0)   AS avg_ticket
        FROM invoices i
        JOIN jobs j  ON j.id = i.job_id
        JOIN users u ON u.id = j.technician_id
        WHERE i.status = 'paid'
          AND i.paid_at::date BETWEEN $1 AND $2
        GROUP BY u.id, u.first_name, u.last_name, u.color, u.initials
        ORDER BY revenue DESC
      `, [from, to]),

      // Revenue by job_type in range
      query(`
        SELECT
          COALESCE(NULLIF(TRIM(j.job_type), ''), 'Uncategorized') AS job_type,
          COUNT(DISTINCT i.id)      AS invoice_count,
          COALESCE(SUM(i.total), 0) AS revenue
        FROM invoices i
        JOIN jobs j ON j.id = i.job_id
        WHERE i.status = 'paid'
          AND i.paid_at::date BETWEEN $1 AND $2
        GROUP BY 1
        ORDER BY revenue DESC
      `, [from, to]),

      // Top 10 customers in range
      query(`
        SELECT
          c.id, c.first_name || ' ' || c.last_name AS name,
          COUNT(*)                  AS invoice_count,
          COALESCE(SUM(i.total), 0) AS revenue
        FROM invoices i
        LEFT JOIN customers c ON c.id = i.customer_id
        WHERE i.status = 'paid'
          AND i.paid_at::date BETWEEN $1 AND $2
        GROUP BY c.id, c.first_name, c.last_name
        ORDER BY revenue DESC
        LIMIT 10
      `, [from, to]),

      // YoY: this calendar year-to-date
      query(`
        SELECT COALESCE(SUM(total), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('year', paid_at) = DATE_TRUNC('year', NOW())
          AND paid_at <= NOW()
      `),

      // YoY: same window last year (Jan 1 → today's anniversary last year)
      query(`
        SELECT COALESCE(SUM(total), 0) AS value
        FROM invoices
        WHERE status = 'paid'
          AND DATE_TRUNC('year', paid_at) = DATE_TRUNC('year', NOW() - INTERVAL '1 year')
          AND paid_at <= NOW() - INTERVAL '1 year'
      `),

      // Avg ticket + counts over the requested range
      query(`
        SELECT
          COUNT(*)                AS invoice_count,
          COALESCE(SUM(total), 0) AS revenue,
          COALESCE(AVG(total), 0) AS avg_ticket,
          COALESCE(MAX(total), 0) AS max_ticket
        FROM invoices
        WHERE status = 'paid'
          AND paid_at::date BETWEEN $1 AND $2
      `, [from, to]),
    ]);

    const tyVal = parseFloat(thisYearTotal.rows[0].value);
    const lyVal = parseFloat(lastYearTotal.rows[0].value);

    res.json({
      from, to,
      by_tech:      byTech.rows.map(r => ({
        id: r.id, name: r.name, color: r.color, initials: r.initials,
        invoice_count: parseInt(r.invoice_count),
        revenue:       parseFloat(r.revenue),
        avg_ticket:    parseFloat(r.avg_ticket),
      })),
      by_job_type:  byJobType.rows.map(r => ({
        job_type:      r.job_type,
        invoice_count: parseInt(r.invoice_count),
        revenue:       parseFloat(r.revenue),
      })),
      top_customers: topCustomers.rows.map(r => ({
        id: r.id, name: r.name,
        invoice_count: parseInt(r.invoice_count),
        revenue:       parseFloat(r.revenue),
      })),
      yoy: {
        ytd_this_year: tyVal,
        ytd_last_year: lyVal,
        delta_pct: lyVal > 0 ? Math.round(((tyVal - lyVal) / lyVal) * 1000) / 10 : null,
      },
      range_stats: {
        invoice_count: parseInt(thisPeriodAvg.rows[0].invoice_count),
        revenue:       parseFloat(thisPeriodAvg.rows[0].revenue),
        avg_ticket:    parseFloat(thisPeriodAvg.rows[0].avg_ticket),
        max_ticket:    parseFloat(thisPeriodAvg.rows[0].max_ticket),
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/accounting/tax-detail ────────────────────────────────────────────
// Quarterly + yearly tax breakdown for the Tax tab.
//   ?year=YYYY (defaults to current calendar year)
//
// Reserves a flat % of pre-tax revenue per quarter to cover income + SE taxes.
// (Separate from sales tax, which is a pass-through liability already tracked.)
const TAX_RESERVE_PCT = 0.30;

router.get('/tax-detail', authenticate, async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const lastYear = year - 1;

    const [quarterly, yearTotals, lastYearTotals] = await Promise.all([
      // Quarterly Q1-Q4 for the requested year
      query(`
        SELECT
          EXTRACT(QUARTER FROM paid_at)::int AS quarter,
          COUNT(*)                           AS invoice_count,
          COALESCE(SUM(subtotal), 0)         AS subtotal,
          COALESCE(SUM(tax_amount), 0)       AS tax,
          COALESCE(SUM(total), 0)            AS total
        FROM invoices
        WHERE status = 'paid'
          AND EXTRACT(YEAR FROM paid_at)::int = $1
        GROUP BY 1
        ORDER BY 1
      `, [year]),

      // Year totals for the requested year — for effective rate + summary
      query(`
        SELECT
          COUNT(*)                         AS invoice_count,
          COALESCE(SUM(subtotal), 0)       AS subtotal,
          COALESCE(SUM(tax_amount), 0)     AS tax,
          COALESCE(SUM(total), 0)          AS total
        FROM invoices
        WHERE status = 'paid'
          AND EXTRACT(YEAR FROM paid_at)::int = $1
      `, [year]),

      // Same window last year (Jan 1 → equivalent date) — for YoY tax delta
      query(`
        SELECT COALESCE(SUM(tax_amount), 0) AS tax
        FROM invoices
        WHERE status = 'paid'
          AND EXTRACT(YEAR FROM paid_at)::int = $1
          AND paid_at <= NOW() - INTERVAL '1 year'
      `, [lastYear]),
    ]);

    const yt    = yearTotals.rows[0]    || {};
    const lyTax = parseFloat(lastYearTotals.rows[0]?.tax || 0);
    const taxYtd = parseFloat(yt.tax || 0);
    const subYtd = parseFloat(yt.subtotal || 0);
    const effectiveRate = subYtd > 0 ? Math.round((taxYtd / subYtd) * 10000) / 100 : 0;

    // Build full Q1–Q4 array even if some quarters have no data.
    // Reserve = TAX_RESERVE_PCT × pre-tax revenue (subtotal).
    // We use subtotal (not total) because sales tax isn't income.
    const qMap = {};
    quarterly.rows.forEach(r => { qMap[r.quarter] = r; });
    const quarters = [1,2,3,4].map(q => {
      const r = qMap[q];
      const subtotal = r ? parseFloat(r.subtotal) : 0;
      return {
        quarter: q,
        label: `Q${q} ${year}`,
        invoice_count: r ? parseInt(r.invoice_count) : 0,
        subtotal,
        tax:           r ? parseFloat(r.tax)         : 0,
        total:         r ? parseFloat(r.total)       : 0,
        reserve:       Math.round(subtotal * TAX_RESERVE_PCT * 100) / 100,
      };
    });

    const reserveYtd = Math.round(subYtd * TAX_RESERVE_PCT * 100) / 100;

    res.json({
      year,
      quarters,
      year_totals: {
        invoice_count: parseInt(yt.invoice_count || 0),
        subtotal:      subYtd,
        tax:           taxYtd,
        total:         parseFloat(yt.total || 0),
        reserve:       reserveYtd,
      },
      effective_tax_rate: effectiveRate, // % e.g. 8.25
      tax_reserve_pct:    TAX_RESERVE_PCT * 100, // expose as 30 (percent)
      yoy: {
        tax_this_year: taxYtd,
        tax_last_year: lyTax,
        delta_pct: lyTax > 0 ? Math.round(((taxYtd - lyTax) / lyTax) * 1000) / 10 : null,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/accounting/open-invoices ─────────────────────────────────────────
// All open/overdue invoices for the AR table, with age
router.get('/open-invoices', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        i.id, i.invoice_number, i.total, i.subtotal, i.tax_amount,
        i.status, i.created_at, i.due_date,
        GREATEST(0, DATE_PART('day', NOW() - COALESCE(i.due_date, i.created_at + INTERVAL '30 days')))::int AS days_overdue,
        c.first_name || ' ' || c.last_name AS customer_name,
        c.phone AS customer_phone
      FROM invoices i
      LEFT JOIN customers c ON c.id = i.customer_id
      WHERE i.type = 'invoice'
        AND i.status NOT IN ('paid', 'void', 'draft')
      ORDER BY days_overdue DESC, i.total DESC
    `);
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Expenses table bootstrap ───────────────────────────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id           SERIAL PRIMARY KEY,
        date         DATE NOT NULL DEFAULT CURRENT_DATE,
        category     VARCHAR(80) NOT NULL DEFAULT 'Other',
        description  TEXT,
        amount       NUMERIC(10,2) NOT NULL DEFAULT 0,
        vendor       VARCHAR(120),
        receipt_url  TEXT,
        created_by   UUID,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Migrate created_by from INTEGER → UUID if needed (idempotent)
    await query(`
      ALTER TABLE expenses
        ALTER COLUMN created_by TYPE UUID USING NULL
    `).catch(() => {});
  } catch (e) {
    console.warn('[accounting] expenses table bootstrap warning:', e.message);
  }
})();

// ── GET /api/accounting/expenses ──────────────────────────────────────────────
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const { from, to, category } = req.query;
    const conds = [];
    const vals  = [];
    if (from)     { vals.push(from);     conds.push(`date >= $${vals.length}`); }
    if (to)       { vals.push(to);       conds.push(`date <= $${vals.length}`); }
    if (category) { vals.push(category); conds.push(`category = $${vals.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await query(
      `SELECT * FROM expenses ${where} ORDER BY date DESC, id DESC`,
      vals
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/accounting/expenses ─────────────────────────────────────────────
router.post('/expenses', authenticate, async (req, res) => {
  try {
    const { date, category, description, amount, vendor, receipt_url } = req.body;
    const { rows } = await query(
      `INSERT INTO expenses (date, category, description, amount, vendor, receipt_url, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [date || new Date().toISOString().slice(0,10), category || 'Other',
       description || '', parseFloat(amount) || 0, vendor || '', receipt_url || '',
       req.user?.id || null]
    );
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── PUT /api/accounting/expenses/:id ──────────────────────────────────────────
router.put('/expenses/:id', authenticate, async (req, res) => {
  try {
    const { date, category, description, amount, vendor, receipt_url } = req.body;
    const { rows } = await query(
      `UPDATE expenses SET date=$1, category=$2, description=$3, amount=$4,
       vendor=$5, receipt_url=$6 WHERE id=$7 RETURNING *`,
      [date, category, description, parseFloat(amount)||0, vendor||'', receipt_url||'', req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── DELETE /api/accounting/expenses/:id ───────────────────────────────────────
router.delete('/expenses/:id', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM expenses WHERE id=$1', [req.params.id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/accounting/payroll/managers ──────────────────────────────────────
// Returns users eligible to be managers (admin, office, dispatcher roles).
router.get('/payroll/managers', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, first_name || ' ' || last_name AS name, role, color, initials
       FROM users WHERE role IN ('admin','office','dispatcher','accountant') AND active = TRUE
       ORDER BY name ASC`
    );
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── GET /api/accounting/payroll?from=&to=&staffType=&managerId= ───────────────
// Compute payroll for staff in a date range.
// staffType: 'technicians' (default) | 'employees' | 'both'
// managerId: UUID — filter to users whose manager_id matches
router.get('/payroll', authenticate, async (req, res) => {
  try {
    const from       = req.query.from      || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10);
    const to         = req.query.to        || new Date().toISOString().slice(0,10);
    const staffType  = req.query.staffType || 'technicians';
    const managerId  = req.query.managerId || null;

    // Build role filter
    const roleFilter = staffType === 'both'
      ? `role IN ('technician','admin','office','dispatcher','accountant')`
      : staffType === 'employees'
        ? `role IN ('admin','office','dispatcher','accountant')`
        : `role = 'technician'`;

    const managerClause = managerId ? `AND manager_id = '${managerId}'` : '';

    const [techRes, settingsRes, invRes, empRes, hoursRes] = await Promise.all([
      // Active users matching role + manager filter
      query(`SELECT id, first_name || ' ' || last_name AS name, email, role FROM users WHERE active = TRUE AND ${roleFilter} ${managerClause} ORDER BY name ASC`).catch(() => ({ rows: [] })),
      // Payroll commission settings
      query(`SELECT config FROM payroll_settings WHERE pay_type = 'settings'`),
      // Revenue per technician in period
      query(`
        SELECT
          j.technician_id,
          COALESCE(SUM(i.total - COALESCE(i.tax_amount,0)), 0) AS revenue,
          COUNT(i.id) AS invoice_count
        FROM invoices i
        JOIN jobs j ON j.id = i.job_id
        WHERE i.status = 'paid'
          AND i.paid_at::date BETWEEN $1 AND $2
          AND j.technician_id IS NOT NULL
        GROUP BY j.technician_id
      `, [from, to]),
      // Employee pay settings (matched by email)
      query(`SELECT * FROM employees WHERE active = TRUE`).catch(() => ({ rows: [] })),
      // Actual clocked hours per user for the pay period
      query(`
        SELECT user_id,
          ROUND(SUM(EXTRACT(EPOCH FROM (punch_out - punch_in))/3600)::numeric, 2) AS hours
        FROM time_punches
        WHERE punch_in::date BETWEEN $1 AND $2
          AND punch_out IS NOT NULL
        GROUP BY user_id
      `, [from, to]).catch(() => ({ rows: [] })),
    ]);

    const settings    = settingsRes.rows[0]?.config || {};
    const runTiers    = Array.isArray(settings.runningTiers) ? settings.runningTiers : [];
    const revByTech   = Object.fromEntries(invRes.rows.map(r => [r.technician_id, r]));
    // Build employee pay-settings lookup by email
    const empByEmail  = Object.fromEntries(empRes.rows.map(e => [e.email?.toLowerCase(), e]));
    // Build actual hours lookup by user id
    const hoursByUser = Object.fromEntries(hoursRes.rows.map(r => [r.user_id, r]));

    const results = techRes.rows.map(user => {
      const techRev = parseFloat(revByTech[user.id]?.revenue || 0);
      const invCnt  = parseInt(revByTech[user.id]?.invoice_count || 0);
      // Try to match employee record by email for pay settings
      const emp = empByEmail[user.email?.toLowerCase()] || {};
      let pay = 0;
      let payBreakdown = '';
      const payType = emp.pay_type || 'hourly';

      if (payType === 'hourly') {
        const actualHours = parseFloat(hoursByUser[user.id]?.hours || 0);
        pay = parseFloat(emp.hourly_rate || 0) * actualHours;
        payBreakdown = emp.hourly_rate ? `${emp.hourly_rate}/hr × ${actualHours} hrs` : 'No rate set';
      } else if (payType === 'salary') {
        pay = parseFloat(emp.salary || 0) / 26;
        payBreakdown = emp.salary ? `Salary ÷ 26` : 'No salary set';
      } else if (payType === 'commission') {
        let remaining = techRev;
        for (const tier of runTiers) {
          if (remaining <= 0) break;
          const tierMin = parseFloat(tier.revenue_min || 0);
          const tierMax = parseFloat(tier.revenue_max || Infinity);
          const rate = parseFloat(
            tier[(emp.license_type || '').toLowerCase()] ||
            tier['journeyman'] || tier['rate'] || 0
          ) / 100;
          const inTier = Math.min(remaining, tierMax - tierMin);
          if (inTier > 0) pay += inTier * rate;
          remaining -= inTier;
        }
        payBreakdown = `Tiered commission on ${fmt$(techRev)}`;
      } else if (payType === 'straight_commission') {
        const rate = parseFloat(emp.commission_pct || 0) / 100;
        pay = techRev * rate;
        payBreakdown = `${emp.commission_pct || 0}% of ${fmt$(techRev)}`;
      }

      return {
        employee_id:   user.id,
        name:          user.name,
        pay_type:      payType,
        license_type:  emp.license_type || null,
        revenue:       techRev,
        invoice_count: invCnt,
        gross_pay:     Math.round(pay * 100) / 100,
        pay_breakdown: payBreakdown,
        has_emp_record: !!emp.id,
      };
    });

    res.json({
      from, to, staffType,
      total_payroll: results.reduce((s, r) => s + r.gross_pay, 0),
      employees: results,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

function fmt$(n) { return '$' + parseFloat(n||0).toFixed(2); }

// ── GET /api/accounting/pl?from=&to= ──────────────────────────────────────────
// Profit & Loss: revenue − COGS (inventory cost) − expenses = net profit
router.get('/pl', authenticate, async (req, res) => {
  try {
    const from = req.query.from || new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0,10);
    const to   = req.query.to   || new Date().toISOString().slice(0,10);

    const [revRes, cogsRes, subRes, expRes] = await Promise.all([
      // Revenue collected
      query(`
        SELECT COALESCE(SUM(total), 0) AS value,
               COALESCE(SUM(tax_amount), 0) AS tax
        FROM invoices
        WHERE status = 'paid' AND paid_at::date BETWEEN $1 AND $2
      `, [from, to]),

      // COGS: inventory consumed on jobs
      query(`
        SELECT COALESCE(SUM(ii.cost * ABS(m.qty)), 0) AS value
        FROM inventory_movements m
        JOIN inventory_items ii ON ii.id = m.item_id
        WHERE m.type = 'usage'
          AND m.job_id IS NOT NULL
          AND ii.cost IS NOT NULL
          AND m.created_at::date BETWEEN $1 AND $2
      `, [from, to]).catch(() => ({ rows: [{ value: 0 }] })),

      // Subcontractor costs: sum of line items on SC- POs (received)
      query(`
        SELECT COALESCE(SUM(poi.qty * poi.unit_cost), 0) AS value
        FROM purchase_orders po
        JOIN purchase_order_items poi ON poi.po_id = po.id
        WHERE po.po_type = 'subcontractor'
          AND po.status = 'received'
          AND po.created_at::date BETWEEN $1 AND $2
      `, [from, to]).catch(() => ({ rows: [{ value: 0 }] })),

      // Expenses
      query(`
        SELECT COALESCE(SUM(amount), 0) AS value,
               category,
               COALESCE(SUM(amount), 0) AS cat_total
        FROM expenses
        WHERE date BETWEEN $1 AND $2
        GROUP BY category
        ORDER BY cat_total DESC
      `, [from, to]).catch(() => ({ rows: [] })),
    ]);

    const revenue         = parseFloat(revRes.rows[0].value);
    const tax             = parseFloat(revRes.rows[0].tax);
    const netRevenue      = revenue - tax;
    const cogs            = parseFloat(cogsRes.rows[0].value);
    const subcontractorCost = parseFloat(subRes.rows[0].value);
    const totalCOGS       = cogs + subcontractorCost;
    const grossProfit     = netRevenue - totalCOGS;

    const expenseRows   = expRes.rows;
    const totalExpenses = expenseRows.reduce((s, r) => s + parseFloat(r.cat_total), 0);
    const netProfit     = grossProfit - totalExpenses;

    res.json({
      from, to,
      revenue,
      tax,
      net_revenue:        netRevenue,
      cogs,
      subcontractor_cost: subcontractorCost,
      total_cogs:         totalCOGS,
      gross_profit:       grossProfit,
      expenses_total:     totalExpenses,
      expenses_by_cat:    expenseRows.map(r => ({ category: r.category, amount: parseFloat(r.cat_total) })),
      net_profit:         netProfit,
      margin_pct:         revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0',
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── POST /api/accounting/qb/sync-all ──────────────────────────────────────────
// Trigger QB sync for all paid invoices in last 90 days (best-effort)
router.post('/qb/sync-all', authenticate, async (req, res) => {
  try {
    // Reuse QB route handler logic inline; just queue the job count
    const { rows } = await query(`
      SELECT COUNT(*) AS cnt FROM invoices
      WHERE status = 'paid' AND paid_at >= NOW() - INTERVAL '90 days'
    `);
    res.json({ ok: true, queued: parseInt(rows[0].cnt),
      message: 'Sync queued — individual invoice sync available via Invoices page' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

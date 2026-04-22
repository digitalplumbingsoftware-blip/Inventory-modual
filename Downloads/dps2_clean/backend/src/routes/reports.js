const router = require('express').Router();
const pool   = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ── Overview summary stats ─────────────────────────────────────
router.get('/overview', authenticate, async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30;

    const [jobsCreated, jobsCompleted, revenue, newCustomers, openInvoices, openAr] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*) as value FROM jobs WHERE created_at >= NOW() - INTERVAL '1 day' * $1`,
          [period]
        ),
        pool.query(
          `SELECT COUNT(*) as value FROM jobs WHERE status='completed' AND updated_at >= NOW() - INTERVAL '1 day' * $1`,
          [period]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total),0) as value FROM invoices WHERE status='paid' AND paid_at >= NOW() - INTERVAL '1 day' * $1`,
          [period]
        ),
        pool.query(
          `SELECT COUNT(*) as value FROM customers WHERE created_at >= NOW() - INTERVAL '1 day' * $1`,
          [period]
        ),
        pool.query(
          `SELECT COUNT(*) as value FROM invoices WHERE type='invoice' AND status NOT IN ('paid','void') AND created_at >= NOW() - INTERVAL '1 day' * $1`,
          [period]
        ),
        pool.query(
          `SELECT COALESCE(SUM(total),0) as value FROM invoices WHERE type='invoice' AND status NOT IN ('paid','void')`
        ),
      ]);

    res.json({
      jobs_created:   parseInt(jobsCreated.rows[0].value),
      jobs_completed: parseInt(jobsCompleted.rows[0].value),
      revenue:        parseFloat(revenue.rows[0].value),
      new_customers:  parseInt(newCustomers.rows[0].value),
      open_invoices:  parseInt(openInvoices.rows[0].value),
      open_ar:        parseFloat(openAr.rows[0].value),
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Revenue by month (last 12 months) ─────────────────────────
router.get('/revenue', authenticate, async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', paid_at), 'Mon YY') as month,
        DATE_TRUNC('month', paid_at) as month_date,
        COALESCE(SUM(total),0) as revenue,
        COUNT(*) as invoice_count
      FROM invoices
      WHERE status='paid' AND paid_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', paid_at)
      ORDER BY month_date ASC
    `);
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Jobs breakdown ─────────────────────────────────────────────
router.get('/jobs', authenticate, async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30;

    const [byStatus, byType] = await Promise.all([
      pool.query(
        `SELECT status, COUNT(*) as count
         FROM jobs
         WHERE created_at >= NOW() - INTERVAL '1 day' * $1
         GROUP BY status ORDER BY count DESC`,
        [period]
      ),
      pool.query(
        `SELECT COALESCE(job_type,'Unspecified') as type, COUNT(*) as count
         FROM jobs
         WHERE created_at >= NOW() - INTERVAL '1 day' * $1
         GROUP BY job_type ORDER BY count DESC LIMIT 10`,
        [period]
      ),
    ]);

    res.json({ by_status: byStatus.rows, by_type: byType.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Lead sources ───────────────────────────────────────────────
router.get('/leads', authenticate, async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30;
    const r = await pool.query(
      `SELECT COALESCE(marketing_src,'Unknown') as source, COUNT(*) as count
       FROM customers
       WHERE created_at >= NOW() - INTERVAL '1 day' * $1
         AND marketing_src IS NOT NULL AND marketing_src != ''
       GROUP BY marketing_src ORDER BY count DESC`,
      [period]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Technician performance ─────────────────────────────────────
router.get('/techs', authenticate, async (req, res) => {
  try {
    const period = parseInt(req.query.period) || 30;
    const r = await pool.query(
      `SELECT
        u.id,
        u.first_name || ' ' || u.last_name as name,
        u.color,
        u.initials,
        COUNT(j.id) as total_jobs,
        COUNT(j.id) FILTER (WHERE j.status='completed') as completed,
        COALESCE(SUM(i.total) FILTER (WHERE i.status='paid'), 0) as revenue
       FROM users u
       LEFT JOIN jobs j ON j.technician_id = u.id
         AND j.created_at >= NOW() - INTERVAL '1 day' * $1
       LEFT JOIN invoices i ON i.job_id = j.id
       WHERE u.role = 'technician' AND u.active = true
       GROUP BY u.id, u.first_name, u.last_name, u.color, u.initials
       ORDER BY completed DESC`,
      [period]
    );
    res.json(r.rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

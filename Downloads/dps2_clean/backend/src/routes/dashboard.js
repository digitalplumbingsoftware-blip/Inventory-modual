const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// GET /api/dashboard/stats
router.get("/stats", authenticate, async (req, res) => {
  try {
    const today = new Date().toISOString().split("T")[0];

    const [revenueRes, jobsRes, avgTicketRes, lowStockRes, followupRes] = await Promise.all([
      // Revenue today (paid invoices)
      query(`
        SELECT COALESCE(SUM(total), 0) as revenue
        FROM invoices
        WHERE status = 'paid' AND DATE(paid_at) = $1
      `, [today]),

      // Jobs today
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('cancelled')) as total,
          COUNT(*) FILTER (WHERE status = 'completed') as completed,
          COUNT(*) FILTER (WHERE status = 'on_site') as on_site,
          COUNT(*) FILTER (WHERE status = 'en_route') as en_route,
          COUNT(*) FILTER (WHERE status = 'scheduled') as scheduled
        FROM jobs
        WHERE DATE(scheduled_start) = $1
      `, [today]),

      // Avg ticket (last 30 days)
      query(`
        SELECT COALESCE(AVG(total), 0) as avg_ticket
        FROM invoices
        WHERE status = 'paid' AND paid_at > NOW() - INTERVAL '30 days'
      `),

      // Low stock count
      query(`
        SELECT COUNT(*) as count
        FROM inventory_stock s
        JOIN inventory_items i ON i.id = s.item_id
        WHERE s.qty <= i.min_qty AND i.active = true
      `),

      // Open follow-ups
      query(`SELECT COUNT(*) as count FROM followups WHERE completed = false`),
    ]);

    // Revenue last 7 days
    const revenueChart = await query(`
      SELECT
        TO_CHAR(d.date, 'Dy') as label,
        COALESCE(SUM(i.total), 0) as revenue
      FROM generate_series(
        CURRENT_DATE - INTERVAL '6 days', CURRENT_DATE, INTERVAL '1 day'
      ) AS d(date)
      LEFT JOIN invoices i
        ON DATE(i.paid_at) = d.date AND i.status = 'paid'
      GROUP BY d.date
      ORDER BY d.date
    `);

    // Revenue by technician (today)
    const revenueByTech = await query(`
      SELECT
        u.first_name || ' ' || u.last_name as name,
        u.color,
        u.initials,
        COUNT(DISTINCT j.id) as job_count,
        COALESCE(SUM(inv.total), 0) as revenue
      FROM users u
      LEFT JOIN jobs j ON j.technician_id = u.id AND DATE(j.scheduled_start) = $1
      LEFT JOIN invoices inv ON inv.job_id = j.id AND inv.status = 'paid'
      WHERE u.role = 'technician' AND u.active = true
      GROUP BY u.id
      ORDER BY revenue DESC
    `, [today]);

    res.json({
      revenue_today: parseFloat(revenueRes.rows[0].revenue),
      jobs: jobsRes.rows[0],
      avg_ticket: parseFloat(avgTicketRes.rows[0].avg_ticket),
      low_stock_count: parseInt(lowStockRes.rows[0].count),
      open_followups: parseInt(followupRes.rows[0].count),
      revenue_chart: revenueChart.rows,
      revenue_by_tech: revenueByTech.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/dashboard/overview ─────────────────────────────────
// Home dashboard: KPIs for a period (+ the prior period for deltas), revenue
// trend, "needs attention" queue and technician performance.
// Query: from, to, prev_from, prev_to (ISO instants from the browser, so the
// period matches the user's local day/week/month), bucket=day|month, tz.
// trend_from widens the chart window (e.g. last 7 days on the "today" view).
const SOLD_ESTIMATE = "('signed','converted')";

// Payments recorded in a range: payment rows, plus invoices marked paid without any.
const COLLECTED_SQL = `
  SELECT COALESCE((SELECT SUM(amount) FROM payments WHERE created_at >= $1 AND created_at < $2), 0)
       + COALESCE((SELECT SUM(i.total) FROM invoices i
                   WHERE i.status = 'paid' AND i.paid_at >= $1 AND i.paid_at < $2
                     AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)), 0) AS collected`;

async function periodKpis(from, to) {
  const [sales, collected, jobs, est] = await Promise.all([
    query(`SELECT COALESCE(SUM(total),0) AS sales, COUNT(*)::int AS invoices
           FROM invoices WHERE status <> 'void' AND created_at >= $1 AND created_at < $2`, [from, to]),
    query(COLLECTED_SQL, [from, to]),
    query(`SELECT COUNT(*)::int AS completed FROM jobs
           WHERE status = 'completed' AND COALESCE(completed_at, scheduled_end, scheduled_start) >= $1
             AND COALESCE(completed_at, scheduled_end, scheduled_start) < $2`, [from, to]),
    query(`SELECT COUNT(*) FILTER (WHERE status IN ${SOLD_ESTIMATE})::int AS sold,
                  COUNT(*) FILTER (WHERE status <> 'draft')::int AS presented
           FROM estimates WHERE created_at >= $1 AND created_at < $2`, [from, to]),
  ]);
  const s = sales.rows[0], e = est.rows[0];
  const salesNum = parseFloat(s.sales);
  return {
    sales: salesNum,
    collected: parseFloat(collected.rows[0].collected),
    jobs_completed: jobs.rows[0].completed,
    avg_ticket: s.invoices ? salesNum / s.invoices : 0,
    close_rate: e.presented ? e.sold / e.presented : null,
    estimates_presented: e.presented,
  };
}

router.get("/overview", authenticate, async (req, res) => {
  try {
    const { from, to, prev_from, prev_to } = req.query;
    if (!from || !to) return res.status(400).json({ error: "from and to are required" });
    const bucket = req.query.bucket === "month" ? "month" : "day";
    const tz = req.query.tz || "UTC";

    const [current, previous, ar, trend, attention, techs] = await Promise.all([
      periodKpis(from, to),
      prev_from && prev_to ? periodKpis(prev_from, prev_to) : null,

      // Open A/R is a snapshot, not a period figure
      query(`SELECT COALESCE(SUM(total - COALESCE(amount_paid,0)),0) AS open_ar,
                    COUNT(*)::int AS open_count,
                    COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)::int AS overdue_count,
                    COALESCE(SUM(total - COALESCE(amount_paid,0)) FILTER (WHERE due_date < CURRENT_DATE),0) AS overdue_amount
             FROM invoices WHERE status IN ('sent','approved')`),

      // Sales vs collected per local day/month across the period
      query(`
        WITH b AS (
          SELECT gs AS start_local
          FROM generate_series(
            date_trunc($3, $1::timestamptz AT TIME ZONE $4),
            date_trunc($3, ($2::timestamptz - INTERVAL '1 second') AT TIME ZONE $4),
            ('1 ' || $3)::interval) gs
        )
        SELECT b.start_local AS bucket,
          COALESCE((SELECT SUM(i.total) FROM invoices i
                    WHERE i.status <> 'void' AND date_trunc($3, i.created_at AT TIME ZONE $4) = b.start_local), 0) AS sales,
          COALESCE((SELECT SUM(p.amount) FROM payments p
                    WHERE date_trunc($3, p.created_at AT TIME ZONE $4) = b.start_local), 0)
          + COALESCE((SELECT SUM(i.total) FROM invoices i
                      WHERE i.status = 'paid' AND date_trunc($3, i.paid_at AT TIME ZONE $4) = b.start_local
                        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.invoice_id = i.id)), 0) AS collected
        FROM b ORDER BY b.start_local
      `, [req.query.trend_from || from, to, bucket, tz]),

      // Needs-attention queue (snapshots)
      query(`SELECT
        (SELECT COUNT(*)::int FROM jobs WHERE status = 'unassigned') AS unassigned_jobs,
        (SELECT COUNT(*)::int FROM jobs WHERE status NOT IN ('completed','cancelled') AND scheduled_start IS NULL) AS unscheduled_jobs,
        (SELECT COUNT(*)::int FROM estimates WHERE status IN ('draft','sent')) AS open_estimates,
        (SELECT COALESCE(SUM(total),0) FROM estimates WHERE status IN ('draft','sent')) AS open_estimates_amount,
        (SELECT COUNT(*)::int FROM followups WHERE completed = false AND (due_date IS NULL OR due_date <= CURRENT_DATE)) AS followups_due,
        (SELECT COUNT(*)::int FROM inventory_stock s JOIN inventory_items i ON i.id = s.item_id
           WHERE i.active = true AND s.qty <= i.min_qty) AS low_stock,
        (SELECT COUNT(*)::int FROM schedule_blocks WHERE status <> 'completed' AND start_at < $1) AS counts_due
      `, [to]).catch(() => ({ rows: [{}] })),

      // Technician performance for the period
      query(`
        SELECT u.id, u.first_name || ' ' || u.last_name AS name, u.color, u.initials,
          (SELECT COUNT(*)::int FROM jobs j WHERE j.technician_id = u.id AND j.status = 'completed'
             AND COALESCE(j.completed_at, j.scheduled_end, j.scheduled_start) >= $1
             AND COALESCE(j.completed_at, j.scheduled_end, j.scheduled_start) < $2) AS jobs_completed,
          (SELECT COALESCE(SUM(i.total),0) FROM invoices i JOIN jobs j ON j.id = i.job_id
             WHERE j.technician_id = u.id AND i.status <> 'void' AND i.created_at >= $1 AND i.created_at < $2) AS sales,
          (SELECT COUNT(*)::int FROM invoices i JOIN jobs j ON j.id = i.job_id
             WHERE j.technician_id = u.id AND i.status <> 'void' AND i.created_at >= $1 AND i.created_at < $2) AS invoices,
          (SELECT COUNT(*) FILTER (WHERE e.status IN ${SOLD_ESTIMATE})::int FROM estimates e
             WHERE e.technician_id = u.id AND e.created_at >= $1 AND e.created_at < $2) AS est_sold,
          (SELECT COUNT(*) FILTER (WHERE e.status <> 'draft')::int FROM estimates e
             WHERE e.technician_id = u.id AND e.created_at >= $1 AND e.created_at < $2) AS est_presented
        FROM users u
        WHERE u.role = 'technician' AND u.active = true
        ORDER BY sales DESC, jobs_completed DESC
      `, [from, to]),
    ]);

    const a = ar.rows[0];
    res.json({
      current, previous,
      ar: { open: parseFloat(a.open_ar), open_count: a.open_count, overdue_count: a.overdue_count, overdue_amount: parseFloat(a.overdue_amount) },
      trend: trend.rows.map(r => ({ bucket: r.bucket, sales: parseFloat(r.sales), collected: parseFloat(r.collected) })),
      attention: { ...attention.rows[0], open_estimates_amount: parseFloat(attention.rows[0].open_estimates_amount || 0) },
      techs: techs.rows.map(t => ({
        ...t, sales: parseFloat(t.sales),
        avg_ticket: t.invoices ? parseFloat(t.sales) / t.invoices : 0,
        close_rate: t.est_presented ? t.est_sold / t.est_presented : null,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

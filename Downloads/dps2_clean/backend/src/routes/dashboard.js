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

module.exports = router;

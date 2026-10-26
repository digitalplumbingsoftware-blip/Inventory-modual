const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// ── Period helpers ─────────────────────────────────────────────
function getPeriodRange(period) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (period) {
    case "today":
      return { start: today, end: now };
    case "yesterday": {
      const s = new Date(today); s.setDate(s.getDate() - 1);
      return { start: s, end: today };
    }
    case "last_week": {
      const dow = today.getDay();
      const mon = new Date(today); mon.setDate(today.getDate() - ((dow + 6) % 7) - 7);
      const sun = new Date(mon);   sun.setDate(mon.getDate() + 7);
      return { start: mon, end: sun };
    }
    case "week_to_date": {
      const dow = today.getDay();
      const s   = new Date(today); s.setDate(today.getDate() - ((dow + 6) % 7));
      return { start: s, end: now };
    }
    case "trailing_7": {
      const s = new Date(today); s.setDate(s.getDate() - 7);
      return { start: s, end: now };
    }
    case "month_to_date": {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: s, end: now };
    }
    case "last_month": {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: s, end: e };
    }
    case "year_to_date": {
      const s = new Date(today.getFullYear(), 0, 1);
      return { start: s, end: now };
    }
    case "trailing_30":
    default: {
      const s = new Date(today); s.setDate(s.getDate() - 30);
      return { start: s, end: now };
    }
  }
}

// Return the preceding period of equal length for change % calculation
function getPrevRange(start, end) {
  const len    = end.getTime() - start.getTime();
  const pEnd   = new Date(start);
  const pStart = new Date(start.getTime() - len);
  return { start: pStart, end: pEnd };
}

function changePct(curr, prev) {
  if (prev === 0) return curr === 0 ? 0 : 100;
  return Math.round(((curr - prev) / prev) * 100);
}

// Build WHERE clause additions for job_type filter (no dynamic param index needed)
function jobTypeFilter(jobType) {
  if (!jobType || jobType === "total") return "";
  // Match common job type names loosely
  const map = {
    service: "service",
    sales:   "sales",
    install: "install",
  };
  const term = map[jobType] || jobType;
  return `AND LOWER(j.job_type) LIKE '%${term.replace(/'/g, "''")}%'`;
}

// Compute metrics for a technician between two timestamps
async function computeMetrics(techId, start, end, jobType) {
  const s      = start.toISOString();
  const e      = end.toISOString();
  const jf     = jobTypeFilter(jobType);

  // Total Sales: paid invoices linked to this tech's completed jobs in the window
  const salesRes = await query(`
    SELECT
      COUNT(DISTINCT i.id)::int        AS invoice_count,
      COALESCE(SUM(i.total), 0)        AS total_sales,
      COALESCE(AVG(i.total), 0)        AS avg_sale
    FROM invoices i
    JOIN jobs j ON j.id = i.job_id
    WHERE j.technician_id = $1
      AND j.status        = 'completed'
      AND j.completed_at >= $2
      AND j.completed_at <  $3
      AND i.status        = 'paid'
      ${jf}
  `, [techId, s, e]);

  // Opportunities: all non-cancelled jobs scheduled in the window
  const oppsRes = await query(`
    SELECT COUNT(*)::int AS opps
    FROM jobs j
    WHERE j.technician_id  = $1
      AND j.scheduled_start >= $2
      AND j.scheduled_start <  $3
      AND j.status          != 'cancelled'
      ${jf}
  `, [techId, s, e]);

  // Completed count for close rate
  const completedRes = await query(`
    SELECT COUNT(*)::int AS completed
    FROM jobs j
    WHERE j.technician_id  = $1
      AND j.scheduled_start >= $2
      AND j.scheduled_start <  $3
      AND j.status           = 'completed'
      ${jf}
  `, [techId, s, e]);

  // Avg line items per paid invoice (options per opportunity proxy)
  const lineRes = await query(`
    SELECT COALESCE(AVG(line_count), 0) AS avg_lines
    FROM (
      SELECT i.id, COUNT(ii.id)::int AS line_count
      FROM invoices i
      JOIN jobs j ON j.id = i.job_id
      JOIN invoice_items ii ON ii.invoice_id = i.id
      WHERE j.technician_id  = $1
        AND j.status         = 'completed'
        AND j.completed_at  >= $2
        AND j.completed_at  <  $3
        AND i.status         = 'paid'
        ${jf}
      GROUP BY i.id
    ) sub
  `, [techId, s, e]);

  const opps      = parseInt(oppsRes.rows[0]?.opps || 0, 10);
  const completed = parseInt(completedRes.rows[0]?.completed || 0, 10);
  const closeRate = opps > 0 ? Math.round((completed / opps) * 100) : 0;

  return {
    total_sales:     parseFloat(salesRes.rows[0]?.total_sales  || 0),
    sales_opps:      opps,
    close_rate:      closeRate,
    avg_sale:        parseFloat(salesRes.rows[0]?.avg_sale     || 0),
    options_per_opp: parseFloat(lineRes.rows[0]?.avg_lines     || 0),
  };
}

// GET /api/scorecard?period=trailing_30&job_type=total
router.get("/", authenticate, async (req, res) => {
  try {
    const { period = "trailing_30", job_type = "total" } = req.query;
    const techId = req.user.id;

    const { start, end }           = getPeriodRange(period);
    const { start: ps, end: pe }   = getPrevRange(start, end);

    const [curr, prev, techRow] = await Promise.all([
      computeMetrics(techId, start, end, job_type),
      computeMetrics(techId, ps,    pe,  job_type),
      query(`SELECT first_name, last_name, color FROM users WHERE id = $1`, [techId]),
    ]);

    const tech = techRow.rows[0] || {};

    res.json({
      tech:    { first_name: tech.first_name, last_name: tech.last_name, color: tech.color },
      period,
      job_type,
      current:  curr,
      previous: prev,
      changes: {
        total_sales:     changePct(curr.total_sales,     prev.total_sales),
        sales_opps:      changePct(curr.sales_opps,      prev.sales_opps),
        close_rate:      changePct(curr.close_rate,      prev.close_rate),
        avg_sale:        changePct(curr.avg_sale,        prev.avg_sale),
        options_per_opp: changePct(curr.options_per_opp, prev.options_per_opp),
      },
    });
  } catch (err) {
    console.error("scorecard error:", err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

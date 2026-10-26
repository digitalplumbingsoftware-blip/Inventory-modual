// Marketing routes — overview KPIs, campaigns, lead sources (computed), promotions, reviews.
const router = require('express').Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// ── Schema bootstrap ────────────────────────────────────────────────────────
(async () => {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(120) NOT NULL,
        channel     VARCHAR(60),                          -- Google Ads, Facebook, Direct Mail, Radio, Truck Wrap, etc.
        status      VARCHAR(20) NOT NULL DEFAULT 'active',-- active | paused | completed | draft
        start_date  DATE,
        end_date    DATE,
        budget      NUMERIC(10,2) DEFAULT 0,
        spend       NUMERIC(10,2) DEFAULT 0,              -- actual ad spend
        leads_manual INT DEFAULT 0,                       -- manually-entered lead count (for non-attributable campaigns)
        utm_source  VARCHAR(60),
        utm_medium  VARCHAR(60),
        utm_campaign VARCHAR(80),
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS marketing_promotions (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        code          VARCHAR(40) NOT NULL UNIQUE,
        description   TEXT,
        discount_type VARCHAR(10) NOT NULL DEFAULT 'percent', -- percent | fixed
        discount_value NUMERIC(10,2) NOT NULL DEFAULT 0,
        start_date    DATE,
        end_date      DATE,
        max_uses      INT,                                 -- null = unlimited
        usage_count   INT NOT NULL DEFAULT 0,
        min_amount    NUMERIC(10,2),
        active        BOOLEAN NOT NULL DEFAULT TRUE,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`
      CREATE TABLE IF NOT EXISTS marketing_reviews (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
        job_id        UUID REFERENCES jobs(id) ON DELETE SET NULL,
        technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
        platform    VARCHAR(40) NOT NULL,                 -- Google | Yelp | Facebook | BBB | NextDoor | Internal | Other
        rating      INT,                                   -- 1..5
        review_text TEXT,
        responded   BOOLEAN NOT NULL DEFAULT FALSE,
        response_text TEXT,
        url         TEXT,
        received_at DATE,
        is_internal BOOLEAN NOT NULL DEFAULT FALSE,        -- true = internal CSAT survey from our flow
        external_id VARCHAR(120),                          -- platform's own ID, used for dedup on poll
        notes       TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Idempotent column adds for older DBs
    await query(`ALTER TABLE marketing_reviews ADD COLUMN IF NOT EXISTS job_id UUID`);
    await query(`ALTER TABLE marketing_reviews ADD COLUMN IF NOT EXISTS technician_id UUID`);
    await query(`ALTER TABLE marketing_reviews ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE`);
    await query(`ALTER TABLE marketing_reviews ADD COLUMN IF NOT EXISTS external_id VARCHAR(120)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_mreviews_tech ON marketing_reviews(technician_id) WHERE technician_id IS NOT NULL`);
    await query(`CREATE INDEX IF NOT EXISTS idx_mreviews_job  ON marketing_reviews(job_id) WHERE job_id IS NOT NULL`);

    // Outbound review requests — created automatically when a job completes.
    await query(`
      CREATE TABLE IF NOT EXISTS review_requests (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        job_id        UUID REFERENCES jobs(id) ON DELETE CASCADE,
        customer_id   UUID REFERENCES customers(id) ON DELETE SET NULL,
        technician_id UUID REFERENCES users(id) ON DELETE SET NULL,
        token         VARCHAR(40) NOT NULL UNIQUE,
        status        VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | sent | completed | expired
        sent_via      VARCHAR(20),                            -- email | sms | both | manual
        sent_at       TIMESTAMPTZ,
        responded_at  TIMESTAMPTZ,
        review_id     UUID REFERENCES marketing_reviews(id) ON DELETE SET NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await query(`CREATE INDEX IF NOT EXISTS idx_review_req_job ON review_requests(job_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_review_req_status ON review_requests(status)`);
  } catch (e) {
    console.warn('[marketing] schema bootstrap warning:', e.message);
  }
})();

// Generate a short URL-safe random token (12 chars)
function genToken() {
  return require('crypto').randomBytes(9).toString('base64url');
}

// ── GET /api/marketing/overview ─────────────────────────────────────────────
// One-shot KPI bundle for the Overview sub-tab.
router.get('/overview', authenticate, async (req, res) => {
  try {
    const [newCustMtd, newCustYtd, leadsMtd, conversionsMtd, revBySource, totalSpend, activeCampaigns, reviewsAvg] = await Promise.all([

      // New customers this calendar month
      query(`
        SELECT COUNT(*)::int AS value
        FROM customers
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
      `),

      // New customers YTD
      query(`
        SELECT COUNT(*)::int AS value
        FROM customers
        WHERE DATE_TRUNC('year', created_at) = DATE_TRUNC('year', NOW())
      `),

      // "Leads" = new customers MTD with a marketing_src set (i.e. attributable)
      query(`
        SELECT COUNT(*)::int AS value
        FROM customers
        WHERE DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())
          AND marketing_src IS NOT NULL AND TRIM(marketing_src) <> ''
      `),

      // Conversions MTD = customers with a paid invoice in the same month they were created
      query(`
        SELECT COUNT(DISTINCT c.id)::int AS value
        FROM customers c
        JOIN invoices i ON i.customer_id = c.id
        WHERE DATE_TRUNC('month', c.created_at) = DATE_TRUNC('month', NOW())
          AND i.status = 'paid'
      `),

      // Revenue by marketing source — paid invoices only, grouped by customer.marketing_src
      query(`
        SELECT
          COALESCE(NULLIF(TRIM(c.marketing_src), ''), 'Unattributed') AS source,
          COUNT(DISTINCT c.id)::int          AS customers,
          COUNT(DISTINCT i.id)::int          AS invoices,
          COALESCE(SUM(i.total), 0)          AS revenue,
          COALESCE(AVG(i.total), 0)          AS avg_ticket,
          MAX(c.created_at)                  AS last_customer_at
        FROM customers c
        LEFT JOIN invoices i ON i.customer_id = c.id AND i.status = 'paid'
        GROUP BY 1
        ORDER BY revenue DESC NULLS LAST, customers DESC
      `),

      // Total active campaign spend (for blended CPA later)
      query(`
        SELECT COALESCE(SUM(spend), 0) AS spend
        FROM marketing_campaigns
        WHERE status IN ('active','completed')
          AND (start_date IS NULL OR start_date <= NOW())
      `),

      // Active campaign count
      query(`SELECT COUNT(*)::int AS n FROM marketing_campaigns WHERE status = 'active'`),

      // Avg star rating across all platforms
      query(`SELECT COALESCE(AVG(rating), 0) AS avg_rating, COUNT(*)::int AS n FROM marketing_reviews WHERE rating BETWEEN 1 AND 5`),
    ]);

    const newMtd  = newCustMtd.rows[0].value;
    const leads   = leadsMtd.rows[0].value;
    const conv    = conversionsMtd.rows[0].value;
    const spend   = parseFloat(totalSpend.rows[0].spend);
    const conversionRate = leads > 0 ? Math.round((conv / leads) * 1000) / 10 : null;
    const blendedCPA     = conv > 0 ? Math.round((spend / conv) * 100) / 100 : null;

    res.json({
      new_customers_mtd:    newMtd,
      new_customers_ytd:    newCustYtd.rows[0].value,
      leads_mtd:            leads,
      conversions_mtd:      conv,
      conversion_rate_pct:  conversionRate,
      total_active_spend:   spend,
      blended_cpa:          blendedCPA,
      active_campaigns:     activeCampaigns.rows[0].n,
      reviews_avg_rating:   parseFloat(reviewsAvg.rows[0].avg_rating).toFixed(2),
      reviews_count:        reviewsAvg.rows[0].n,
      revenue_by_source:    revBySource.rows.map(r => ({
        source:    r.source,
        customers: parseInt(r.customers),
        invoices:  parseInt(r.invoices),
        revenue:   parseFloat(r.revenue),
        avg_ticket: parseFloat(r.avg_ticket),
        last_customer_at: r.last_customer_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GET /api/marketing/lead-sources ─────────────────────────────────────────
// Detailed lead source performance, supports ?from=&to= range.
router.get('/lead-sources', authenticate, async (req, res) => {
  try {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString().slice(0,10);
    const today     = now.toISOString().slice(0,10);
    const from = req.query.from || yearStart;
    const to   = req.query.to   || today;

    const { rows } = await query(`
      SELECT
        COALESCE(NULLIF(TRIM(c.marketing_src), ''), 'Unattributed') AS source,
        COUNT(DISTINCT c.id)::int        AS customers,
        COUNT(DISTINCT j.id)::int        AS jobs,
        COUNT(DISTINCT i.id) FILTER (WHERE i.status = 'paid')::int AS paid_invoices,
        COALESCE(SUM(i.total) FILTER (WHERE i.status = 'paid'), 0) AS revenue,
        COALESCE(AVG(i.total) FILTER (WHERE i.status = 'paid'), 0) AS avg_ticket,
        MIN(c.created_at) AS first_customer_at,
        MAX(c.created_at) AS last_customer_at
      FROM customers c
      LEFT JOIN jobs j     ON j.customer_id = c.id
      LEFT JOIN invoices i ON i.customer_id = c.id
      WHERE c.created_at::date BETWEEN $1 AND $2
      GROUP BY 1
      ORDER BY revenue DESC NULLS LAST, customers DESC
    `, [from, to]);

    res.json({
      from, to,
      sources: rows.map(r => ({
        source:    r.source,
        customers: parseInt(r.customers),
        jobs:      parseInt(r.jobs),
        paid_invoices: parseInt(r.paid_invoices),
        revenue:   parseFloat(r.revenue),
        avg_ticket: parseFloat(r.avg_ticket),
        conversion_rate: r.customers > 0 ? Math.round((r.paid_invoices / r.customers) * 1000) / 10 : null,
        first_customer_at: r.first_customer_at,
        last_customer_at:  r.last_customer_at,
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Generic CRUD helpers ────────────────────────────────────────────────────
function crud(table, fields) {
  return {
    list: async (req, res) => {
      try {
        const { rows } = await query(`SELECT * FROM ${table} ORDER BY created_at DESC`);
        res.json(rows);
      } catch (e) { res.status(500).json({ error: e.message }); }
    },
    create: async (req, res) => {
      try {
        const cols = fields.filter(f => req.body[f] !== undefined);
        if (!cols.length) return res.status(400).json({ error: 'no fields provided' });
        const vals = cols.map(c => normalize(c, req.body[c]));
        const ph   = cols.map((_, i) => `$${i+1}`).join(',');
        const { rows } = await query(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals);
        res.json(rows[0]);
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'duplicate value' });
        res.status(500).json({ error: e.message });
      }
    },
    update: async (req, res) => {
      try {
        const cols = fields.filter(f => req.body[f] !== undefined);
        if (!cols.length) return res.status(400).json({ error: 'no fields provided' });
        const sc   = cols.map((c, i) => `${c} = $${i+1}`).join(', ');
        const vals = cols.map(c => normalize(c, req.body[c]));
        vals.push(req.params.id);
        const { rows } = await query(`UPDATE ${table} SET ${sc}, updated_at = NOW() WHERE id = $${vals.length} RETURNING *`, vals);
        if (!rows[0]) return res.status(404).json({ error: 'not found' });
        res.json(rows[0]);
      } catch (e) {
        if (e.code === '23505') return res.status(409).json({ error: 'duplicate value' });
        res.status(500).json({ error: e.message });
      }
    },
    remove: async (req, res) => {
      try {
        const r = await query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
        if (r.rowCount === 0) return res.status(404).json({ error: 'not found' });
        res.json({ ok: true });
      } catch (e) { res.status(500).json({ error: e.message }); }
    },
  };
}

function normalize(_col, v) {
  return v === '' ? null : v;
}

// ── Campaigns ───────────────────────────────────────────────────────────────
const campaignFields = ['name','channel','status','start_date','end_date','budget','spend','leads_manual','utm_source','utm_medium','utm_campaign','notes'];
const camp = crud('marketing_campaigns', campaignFields);

// Override list to include attribution stats per campaign (matched by utm_campaign → customers.marketing_src)
router.get('/campaigns', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        mc.*,
        (
          SELECT COUNT(DISTINCT c.id)::int
          FROM customers c
          WHERE TRIM(LOWER(COALESCE(c.marketing_src, ''))) = TRIM(LOWER(COALESCE(mc.utm_campaign, mc.name, '')))
        ) AS attributed_customers,
        (
          SELECT COALESCE(SUM(i.total), 0)
          FROM invoices i
          JOIN customers c ON c.id = i.customer_id
          WHERE i.status = 'paid'
            AND TRIM(LOWER(COALESCE(c.marketing_src, ''))) = TRIM(LOWER(COALESCE(mc.utm_campaign, mc.name, '')))
        ) AS attributed_revenue
      FROM marketing_campaigns mc
      ORDER BY mc.created_at DESC
    `);
    res.json(rows.map(r => ({
      ...r,
      attributed_customers: parseInt(r.attributed_customers || 0),
      attributed_revenue:   parseFloat(r.attributed_revenue || 0),
      roi: parseFloat(r.spend) > 0
        ? Math.round((parseFloat(r.attributed_revenue) - parseFloat(r.spend)) / parseFloat(r.spend) * 1000) / 10
        : null,
    })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post  ('/campaigns',     authenticate, camp.create);
router.put   ('/campaigns/:id', authenticate, camp.update);
router.delete('/campaigns/:id', authenticate, camp.remove);

// ── Promotions ──────────────────────────────────────────────────────────────
const promoFields = ['code','description','discount_type','discount_value','start_date','end_date','max_uses','usage_count','min_amount','active'];
const promo = crud('marketing_promotions', promoFields);
router.get   ('/promotions',     authenticate, promo.list);
router.post  ('/promotions',     authenticate, promo.create);
router.put   ('/promotions/:id', authenticate, promo.update);
router.delete('/promotions/:id', authenticate, promo.remove);

// ── Reviews ─────────────────────────────────────────────────────────────────
const reviewFields = ['customer_id','job_id','technician_id','platform','rating','review_text','responded','response_text','url','received_at','is_internal','external_id','notes'];
const review = crud('marketing_reviews', reviewFields);

// Override review list to include customer + technician name, with optional filters
router.get('/reviews', authenticate, async (req, res) => {
  try {
    const { technician_id, platform, internal_only, external_only } = req.query;
    const conds = [];
    const vals  = [];
    if (technician_id) { vals.push(technician_id); conds.push(`r.technician_id = $${vals.length}`); }
    if (platform)      { vals.push(platform);      conds.push(`r.platform = $${vals.length}`); }
    if (internal_only) { conds.push(`r.is_internal = TRUE`); }
    if (external_only) { conds.push(`r.is_internal = FALSE`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await query(`
      SELECT
        r.*,
        c.first_name || ' ' || c.last_name AS customer_name,
        u.first_name || ' ' || u.last_name AS technician_name,
        u.color    AS technician_color,
        u.initials AS technician_initials
      FROM marketing_reviews r
      LEFT JOIN customers c ON c.id = r.customer_id
      LEFT JOIN users     u ON u.id = r.technician_id
      ${where}
      ORDER BY COALESCE(r.received_at, r.created_at::date) DESC, r.created_at DESC
    `, vals);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.post  ('/reviews',     authenticate, review.create);
router.put   ('/reviews/:id', authenticate, review.update);
router.delete('/reviews/:id', authenticate, review.remove);

// ── Per-technician CSAT aggregation ─────────────────────────────────────────
// Powers the technician profile/scorecard.
//   GET /api/marketing/tech-csat               → all techs ranked
//   GET /api/marketing/tech-csat/:technicianId → single tech detail
router.get('/tech-csat/:technicianId?', authenticate, async (req, res) => {
  try {
    const techFilter = req.params.technicianId ? `AND u.id = $1` : '';
    const vals = req.params.technicianId ? [req.params.technicianId] : [];
    const { rows } = await query(`
      SELECT
        u.id, u.first_name || ' ' || u.last_name AS name, u.color, u.initials,
        COUNT(r.id) FILTER (WHERE r.rating BETWEEN 1 AND 5)::int AS reviews_count,
        COUNT(r.id) FILTER (WHERE r.is_internal = TRUE  AND r.rating BETWEEN 1 AND 5)::int AS internal_count,
        COUNT(r.id) FILTER (WHERE r.is_internal = FALSE AND r.rating BETWEEN 1 AND 5)::int AS external_count,
        COALESCE(AVG(r.rating) FILTER (WHERE r.rating BETWEEN 1 AND 5), 0)::numeric(3,2) AS avg_rating,
        COUNT(r.id) FILTER (WHERE r.rating = 5)::int AS five_star,
        COUNT(r.id) FILTER (WHERE r.rating = 4)::int AS four_star,
        COUNT(r.id) FILTER (WHERE r.rating = 3)::int AS three_star,
        COUNT(r.id) FILTER (WHERE r.rating = 2)::int AS two_star,
        COUNT(r.id) FILTER (WHERE r.rating = 1)::int AS one_star,
        COUNT(r.id) FILTER (WHERE r.rating <= 3 AND r.rating BETWEEN 1 AND 5)::int AS critical_count,
        MAX(r.received_at) AS last_review_at
      FROM users u
      LEFT JOIN marketing_reviews r ON r.technician_id = u.id
      WHERE u.role = 'technician' ${techFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.color, u.initials
      ORDER BY avg_rating DESC NULLS LAST, reviews_count DESC
    `, vals);

    // CSAT % = (4-star + 5-star) / total — industry-standard customer satisfaction metric
    const enriched = rows.map(r => {
      const total = r.reviews_count;
      const positive = (r.five_star || 0) + (r.four_star || 0);
      return {
        ...r,
        avg_rating:        parseFloat(r.avg_rating),
        csat_pct:          total > 0 ? Math.round((positive / total) * 1000) / 10 : null,
        distribution: {
          5: r.five_star  || 0,
          4: r.four_star  || 0,
          3: r.three_star || 0,
          2: r.two_star   || 0,
          1: r.one_star   || 0,
        },
      };
    });

    if (req.params.technicianId) {
      // Include individual reviews for the detail view
      const { rows: tReviews } = await query(`
        SELECT r.*, c.first_name || ' ' || c.last_name AS customer_name, j.id AS jid
        FROM marketing_reviews r
        LEFT JOIN customers c ON c.id = r.customer_id
        LEFT JOIN jobs j      ON j.id = r.job_id
        WHERE r.technician_id = $1
        ORDER BY COALESCE(r.received_at, r.created_at::date) DESC
        LIMIT 50
      `, [req.params.technicianId]);
      return res.json({ ...enriched[0], recent_reviews: tReviews });
    }
    res.json(enriched);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Review Requests ─────────────────────────────────────────────────────────
// Auto-created when a job completes (see jobs.js PATCH handler).
// The token allows the customer to submit feedback without an account.

// Manually generate / retrieve a request for a job (e.g. resend button)
router.post('/review-request/:jobId', authenticate, async (req, res) => {
  try {
    const { jobId } = req.params;
    const { sent_via } = req.body; // 'email' | 'sms' | 'both' | 'manual'

    // Look up the job's customer + technician
    const { rows: jobRows } = await query(`
      SELECT id, customer_id, technician_id FROM jobs WHERE id = $1
    `, [jobId]);
    const j = jobRows[0];
    if (!j) return res.status(404).json({ error: 'job not found' });

    // Reuse existing pending request if one exists
    const existing = await query(
      `SELECT * FROM review_requests WHERE job_id = $1 AND status IN ('pending','sent') LIMIT 1`,
      [jobId]
    );
    let row;
    if (existing.rows[0]) {
      row = existing.rows[0];
    } else {
      const token = genToken();
      const ins = await query(`
        INSERT INTO review_requests (job_id, customer_id, technician_id, token, status)
        VALUES ($1, $2, $3, $4, 'pending')
        RETURNING *
      `, [jobId, j.customer_id, j.technician_id, token]);
      row = ins.rows[0];
    }

    // Mark sent if a delivery method was specified
    if (sent_via) {
      await query(
        `UPDATE review_requests SET status = 'sent', sent_via = $1, sent_at = NOW() WHERE id = $2`,
        [sent_via, row.id]
      );
      row.status = 'sent';
      row.sent_via = sent_via;
      row.sent_at = new Date();
    }

    // The customer-facing URL — frontend route renders the public CSAT form
    const baseUrl = process.env.FRONTEND_URL || `http://localhost:8000`;
    res.json({ ...row, public_url: `${baseUrl}/feedback/${row.token}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List all review requests (status board)
router.get('/review-requests', authenticate, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        rr.*,
        c.first_name || ' ' || c.last_name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        u.first_name || ' ' || u.last_name AS technician_name
      FROM review_requests rr
      LEFT JOIN customers c ON c.id = rr.customer_id
      LEFT JOIN users     u ON u.id = rr.technician_id
      ORDER BY rr.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Public feedback endpoint (NO auth — customer submits via tokenized URL) ─
//   GET  /api/marketing/feedback/:token  → fetch context (customer + tech)
//   POST /api/marketing/feedback/:token  → submit rating + comments
router.get('/feedback/:token', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT
        rr.id, rr.status, rr.responded_at,
        c.first_name AS customer_first_name,
        u.first_name || ' ' || u.last_name AS technician_name,
        u.color AS technician_color,
        u.initials AS technician_initials,
        cs.name AS company_name
      FROM review_requests rr
      LEFT JOIN customers c ON c.id = rr.customer_id
      LEFT JOIN users     u ON u.id = rr.technician_id
      LEFT JOIN company_settings cs ON cs.id = 'main'
      WHERE rr.token = $1
    `, [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'invalid token' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/feedback/:token', async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const r = parseInt(rating);
    if (!r || r < 1 || r > 5) return res.status(400).json({ error: 'rating must be 1-5' });

    const { rows: reqRows } = await query(`SELECT * FROM review_requests WHERE token = $1`, [req.params.token]);
    const rr = reqRows[0];
    if (!rr) return res.status(404).json({ error: 'invalid token' });
    if (rr.status === 'completed') return res.status(409).json({ error: 'already submitted' });

    // Insert the internal review
    const { rows: rev } = await query(`
      INSERT INTO marketing_reviews
        (customer_id, job_id, technician_id, platform, rating, review_text, received_at, is_internal)
      VALUES ($1, $2, $3, 'Internal', $4, $5, CURRENT_DATE, TRUE)
      RETURNING *
    `, [rr.customer_id, rr.job_id, rr.technician_id, r, comment || null]);

    await query(
      `UPDATE review_requests SET status='completed', responded_at=NOW(), review_id=$1 WHERE id=$2`,
      [rev[0].id, rr.id]
    );

    // Look up redirect URLs from review_settings integration config
    const cfg = await query(`SELECT config FROM integrations WHERE name='review_settings'`);
    const conf = cfg.rows[0]?.config || {};
    let redirectUrl = null;
    if (r >= 4) {
      // High rating → push them to the public review platform (Google preferred)
      redirectUrl = conf.google_review_url || conf.yelp_review_url || conf.facebook_review_url || null;
    }
    res.json({ ok: true, rating: r, redirect_url: redirectUrl });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── External Reviews — webhook receiver + import endpoint ───────────────────
// Third-party services (NiceJob, Birdeye, custom Zapier flow) can push reviews
// to this URL. Payload shape:
//   { platform, external_id, customer_email | customer_phone, rating, review_text, url, received_at }
router.post('/reviews/webhook', async (req, res) => {
  try {
    // Optional shared-secret check (skip if not configured)
    const cfg = await query(`SELECT config FROM integrations WHERE name='review_settings'`);
    const secret = cfg.rows[0]?.config?.webhook_secret;
    if (secret) {
      const provided = req.headers['x-webhook-secret'];
      if (provided !== secret) return res.status(401).json({ error: 'invalid webhook secret' });
    }

    const { platform, external_id, customer_email, customer_phone, rating, review_text, url, received_at } = req.body;
    if (!platform || !rating) return res.status(400).json({ error: 'platform and rating required' });

    // Dedup: if external_id already imported, return existing
    if (external_id) {
      const dup = await query(
        `SELECT id FROM marketing_reviews WHERE platform = $1 AND external_id = $2`,
        [platform, external_id]
      );
      if (dup.rows[0]) return res.json({ ok: true, deduped: true, review_id: dup.rows[0].id });
    }

    // Match customer by email or phone
    let customer_id = null;
    let job_id = null;
    let technician_id = null;
    if (customer_email || customer_phone) {
      const m = await query(`
        SELECT id FROM customers
        WHERE ($1::text IS NOT NULL AND email = $1::text)
           OR ($2::text IS NOT NULL AND phone = $2::text)
        LIMIT 1
      `, [customer_email || null, customer_phone || null]);
      if (m.rows[0]) {
        customer_id = m.rows[0].id;
        // Find their most recent completed job + technician
        const j = await query(`
          SELECT id, technician_id FROM jobs
          WHERE customer_id = $1 AND status = 'completed'
          ORDER BY completed_at DESC NULLS LAST, scheduled_start DESC
          LIMIT 1
        `, [customer_id]);
        if (j.rows[0]) {
          job_id        = j.rows[0].id;
          technician_id = j.rows[0].technician_id;
        }
      }
    }

    const { rows } = await query(`
      INSERT INTO marketing_reviews
        (customer_id, job_id, technician_id, platform, rating, review_text, url, received_at, external_id, is_internal)
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE), $9, FALSE)
      RETURNING *
    `, [customer_id, job_id, technician_id, platform, parseInt(rating), review_text || null, url || null, received_at || null, external_id || null]);
    res.json({ ok: true, review_id: rows[0].id, matched_customer: !!customer_id, matched_tech: !!technician_id });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Manual import endpoint — accepts an array of reviews (from a polling cron job)
router.post('/reviews/import', authenticate, async (req, res) => {
  try {
    const items = Array.isArray(req.body) ? req.body : (req.body.reviews || []);
    let imported = 0, deduped = 0;
    for (const it of items) {
      if (!it.platform || !it.rating) continue;
      if (it.external_id) {
        const dup = await query(`SELECT id FROM marketing_reviews WHERE platform = $1 AND external_id = $2`, [it.platform, it.external_id]);
        if (dup.rows[0]) { deduped++; continue; }
      }
      // Reuse the same matching logic as the webhook
      let customer_id = null, job_id = null, technician_id = null;
      if (it.customer_email || it.customer_phone) {
        const m = await query(`
          SELECT id FROM customers
          WHERE ($1::text IS NOT NULL AND email = $1::text)
             OR ($2::text IS NOT NULL AND phone = $2::text)
          LIMIT 1
        `, [it.customer_email || null, it.customer_phone || null]);
        if (m.rows[0]) {
          customer_id = m.rows[0].id;
          const j = await query(`
            SELECT id, technician_id FROM jobs WHERE customer_id = $1 AND status = 'completed'
            ORDER BY completed_at DESC NULLS LAST LIMIT 1
          `, [customer_id]);
          if (j.rows[0]) { job_id = j.rows[0].id; technician_id = j.rows[0].technician_id; }
        }
      }
      await query(`
        INSERT INTO marketing_reviews
          (customer_id, job_id, technician_id, platform, rating, review_text, url, received_at, external_id, is_internal)
        VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE), $9, FALSE)
      `, [customer_id, job_id, technician_id, it.platform, parseInt(it.rating), it.review_text || null, it.url || null, it.received_at || null, it.external_id || null]);
      imported++;
    }
    res.json({ ok: true, imported, deduped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;

const router = require("express").Router();
const { query } = require("../db/pool");
const { authenticate } = require("../middleware/auth");

// GET /api/customers?phone=7135552041  (call pop lookup)
// GET /api/customers?q=smith  (search)
// GET /api/customers  (list)
router.get("/", authenticate, async (req, res) => {
  try {
    const { phone, q, limit = 50, offset = 0 } = req.query;

    if (phone) {
      // Strip non-digits for flexible match
      const digits = phone.replace(/\D/g, "");
      const { rows } = await query(`
        SELECT c.*,
          json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) as addresses,
          (SELECT json_agg(j.*) FROM jobs j WHERE j.customer_id = c.id ORDER BY j.scheduled_start DESC LIMIT 5) as recent_jobs
        FROM customers c
        LEFT JOIN addresses a ON a.customer_id = c.id
        WHERE regexp_replace(c.phone, '[^0-9]', '', 'g') LIKE $1
           OR regexp_replace(c.phone2,'[^0-9]','','g') LIKE $1
        GROUP BY c.id
        LIMIT 1
      `, [`%${digits}`]);
      return res.json(rows[0] || null);
    }

    if (q) {
      const { rows } = await query(`
        SELECT c.*, json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) as addresses
        FROM customers c
        LEFT JOIN addresses a ON a.customer_id = c.id
        WHERE to_tsvector('english', c.first_name || ' ' || c.last_name || ' ' || COALESCE(c.email,'') || ' ' || COALESCE(c.phone,''))
              @@ plainto_tsquery('english', $1)
           OR c.first_name ILIKE $2 OR c.last_name ILIKE $2
        GROUP BY c.id
        LIMIT $3 OFFSET $4
      `, [q, `%${q}%`, limit, offset]);
      return res.json(rows);
    }

    const { rows } = await query(`
      SELECT c.*, json_agg(a.*) FILTER (WHERE a.id IS NOT NULL) as addresses
      FROM customers c
      LEFT JOIN addresses a ON a.customer_id = c.id
      GROUP BY c.id
      ORDER BY c.last_name, c.first_name
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/customers/:id
router.get("/:id", authenticate, async (req, res) => {
  const { rows } = await query(`
    SELECT c.*,
      json_agg(DISTINCT a.*) FILTER (WHERE a.id IS NOT NULL) as addresses,
      json_agg(DISTINCT j.*) FILTER (WHERE j.id IS NOT NULL) as jobs
    FROM customers c
    LEFT JOIN addresses a ON a.customer_id = c.id
    LEFT JOIN jobs j ON j.customer_id = c.id
    WHERE c.id = $1
    GROUP BY c.id
  `, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: "Not found" });
  res.json(rows[0]);
});

// POST /api/customers
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      first_name, last_name, email, phone, phone2, notes, tags, marketing_src, address,
      customer_type, business_name, contact_name, contact_title,
      phones, emails, property_info,
    } = req.body;
    const { rows } = await query(`
      INSERT INTO customers (
        first_name, last_name, email, phone, phone2, notes, tags, marketing_src,
        customer_type, business_name, contact_name, contact_title,
        phones, emails, property_info
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *
    `, [
      first_name, last_name, email || '', phone || '', phone2 || '',
      notes, tags || [], marketing_src,
      customer_type || 'residential', business_name || null, contact_name || null, contact_title || null,
      JSON.stringify(phones || []), JSON.stringify(emails || []),
      JSON.stringify(property_info || {}),
    ]);

    const customer = rows[0];

    // Optionally create address
    if (address?.street) {
      await query(`
        INSERT INTO addresses (customer_id, street, city, state, zip, lat, lng, is_primary)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true)
      `, [customer.id, address.street, address.city || "Houston", address.state || "TX",
          address.zip || null, address.lat || null, address.lng || null]);
    }
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/customers/:id
router.patch("/:id", authenticate, async (req, res) => {
  try {
    const allowed = ["first_name","last_name","email","phone","phone2","notes","tags","marketing_src",
                     "customer_type","business_name","contact_name","contact_title","phones","emails","property_info"];
    const updates = [], params = [];
    for (const [k, v] of Object.entries(req.body)) {
      if (allowed.includes(k)) { params.push(v); updates.push(`${k}=$${params.length}`); }
    }
    if (!updates.length) return res.status(400).json({ error: "No valid fields" });
    params.push(req.params.id);
    const { rows } = await query(`UPDATE customers SET ${updates.join(",")} WHERE id=$${params.length} RETURNING *`, params);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

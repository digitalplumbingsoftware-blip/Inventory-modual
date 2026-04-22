const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function testConnection() {
  try {
    const client = await pool.connect();
    const { rows } = await client.query("SELECT NOW() as now");
    client.release();
    console.log(`✅ PostgreSQL connected at ${rows[0].now}`);
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    process.exit(1);
  }
}

// Helper: run a query with automatic error handling
async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV === "development" && duration > 200) {
      console.warn(`Slow query (${duration}ms): ${text}`);
    }
    return res;
  } catch (err) {
    console.error("Query error:", { text, params, err: err.message });
    throw err;
  }
}

module.exports = { pool, query, testConnection };

'use strict';
/**
 * Migration 011: Re-split plumbing into Install + Service.
 *
 * Reverts the earlier merge (from feedback that "plumbing should be one book")
 * — user has since decided they prefer the sub-book layout used by HVAC/
 * Electrical, so we classify again.
 *
 * What it does:
 *   1. Reclassify all plumbing tasks into 'install' or 'service' using the same
 *      keyword rules from migration 004.
 *   2. Duplicate every plumbing/service category into a plumbing/install row
 *      (composite PK allows both to exist).
 *   3. Clone the tuned plumbing engine row into a plumbing/install engine so
 *      both books have starter engines — user tunes them separately after.
 *
 * Idempotent-ish: the category + engine inserts use ON CONFLICT DO NOTHING.
 * Tasks are reclassified every time (safe — deterministic keyword rules).
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/011_plumbing_install_service_resplit.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

/**
 * Same classifier from migration 004 — keyword rules on tag + name.
 * Install signals win first; explicit service signals second;
 * category fallback last (with plumbing categories that are always install /
 * always service).
 */
function classifyPlumbingTask({ category_id, tag = '', name = '' }) {
  const s = (tag + ' ' + name).toLowerCase();

  // Explicit install signals win first
  if (/\binstall(s|ed|ing)?\b/.test(s)) return 'install';
  if (/\breplace(ment)?s?\b/.test(s)) return 'install';
  if (/\bconnect(ion)?s?\b/.test(s)) return 'install';
  if (/\brepipe\b/.test(s)) return 'install';
  if (/\bnew\b/.test(s) && !/\bnew leak\b/.test(s)) return 'install';
  if (/\brough[- ]?in\b/.test(s)) return 'install';

  // Explicit service signals
  if (/\brepair(s|ed|ing)?\b/.test(s)) return 'service';
  if (/\bdiagnos(is|tic|e)\b/.test(s)) return 'service';
  if (/\bmaintenance\b/.test(s)) return 'service';
  if (/\bclean(ing)?\b/.test(s)) return 'service';
  if (/\bunclog\b/.test(s)) return 'service';
  if (/\bsnake\b/.test(s)) return 'service';
  if (/\bcamera\b/.test(s)) return 'service';
  if (/\bleak\b/.test(s)) return 'service';
  if (/\bextended\b/.test(s)) return 'service';

  // Category-level fallback
  const installCats = new Set(['prmt', 'cs', 'dig', 'pip', 'wpur', 'vlv']);
  const serviceCats = new Set(['acc', 'diag', 'dc', 'fvt', 'swr', 'wlk', 'ewrn']);
  if (installCats.has(category_id)) return 'install';
  if (serviceCats.has(category_id)) return 'service';

  // Ambiguous — default to service (safer for on-a-truck customer expectations)
  return 'service';
}

async function run() {
  const db = new Client({ connectionString: DB });
  await db.connect();
  console.log('→ Connected to', DB.replace(/:[^:@]+@/, ':***@'));

  try {
    await db.query('BEGIN');

    // ── 1. Reclassify tasks ─────────────────────────────────────
    console.log('→ Reclassifying plumbing tasks…');
    const { rows: tasks } = await db.query(
      `SELECT id, category_id, tag, name
         FROM pb_tasks
        WHERE service = 'plumbing'`
    );
    let install = 0, service = 0;
    for (const t of tasks) {
      const type = classifyPlumbingTask(t);
      await db.query(
        `UPDATE pb_tasks SET service_type = $1 WHERE id = $2`,
        [type, t.id]
      );
      if (type === 'install') install++; else service++;
    }
    console.log(`  → ${install} install, ${service} service`);

    // ── 2. Duplicate categories into install variant ────────────
    // The plumbing/service categories exist; the install variant needs a twin
    // row (composite PK is (id, service, service_type)).
    console.log('→ Duplicating plumbing categories into install variant');
    const { rows: cats } = await db.query(
      `SELECT id, icon, name, color, description, sort_order
         FROM pb_categories
        WHERE service = 'plumbing' AND service_type = 'service'`
    );
    let dup = 0;
    for (const c of cats) {
      const { rowCount } = await db.query(
        `INSERT INTO pb_categories
           (id, icon, name, color, description, sort_order, service, service_type)
         VALUES ($1,$2,$3,$4,$5,$6,'plumbing','install')
         ON CONFLICT (id, service, service_type) DO NOTHING`,
        [c.id, c.icon, c.name, c.color, c.description, c.sort_order]
      );
      dup += rowCount;
    }
    console.log(`  → ${dup} categories added to plumbing/install`);

    // ── 3. Clone the tuned plumbing engine into a plumbing/install engine ─
    console.log('→ Cloning plumbing engine into install variant');
    const { rows: eng } = await db.query(
      `SELECT * FROM pb_engine
        WHERE service = 'plumbing' AND service_type = 'service'`
    );
    if (eng.length) {
      const e = eng[0];
      const { rowCount } = await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ('plumbing','install', $1,$2,$3,$4,$5,$6,$7,
                 $8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                 $18,$19,$20, $21::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [
          e.wage, e.burden, e.truck, e.overhead, e.profit, e.misc, e.warranty,
          e.hrs, e.fica, e.unemp, e.wc, e.health, e.vehicle, e.fuel, e.tools, e.uniform, e.phone,
          e.num_techs, e.oh_hrs, e.matmarkup, JSON.stringify(e.oh_items || []),
        ]
      );
      console.log(`  → plumbing/install engine ${rowCount ? 'created' : 'already existed'}`);
    } else {
      console.log('  → no plumbing/service engine to clone (unexpected)');
    }

    await db.query('COMMIT');
    console.log('✓ Migration 011 complete.');

    // Sanity print
    const { rows: stats } = await db.query(
      `SELECT service, service_type, COUNT(*)::int AS n
         FROM pb_tasks
        WHERE service = 'plumbing'
        GROUP BY service, service_type
        ORDER BY service_type`
    );
    console.log('  plumbing tasks:', stats.map(r => `${r.service_type}=${r.n}`).join(', '));

    const { rows: engRows } = await db.query(
      `SELECT service, service_type FROM pb_engine ORDER BY service, service_type`
    );
    console.log('  engines:', engRows.map(r => `${r.service}/${r.service_type}`).join(', '));
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('✗ Migration failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });

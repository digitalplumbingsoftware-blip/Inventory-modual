'use strict';
/**
 * Migration 004: Split every pricebook into (service, service_type).
 *
 * Model shift:
 *   service       ∈ { 'plumbing', 'hvac', ... }
 *   service_type  ∈ { 'install', 'service' }
 *
 * The pair identifies a distinct pricebook — its own engine, categories, tasks.
 *
 * What this does:
 *   1. Adds service (default 'plumbing') + service_type columns to pb_tasks, pb_categories.
 *   2. Adds service_type to pb_engine and replaces the (service) unique index with
 *      a composite (service, service_type) unique.
 *   3. Auto-classifies all existing plumbing tasks into install vs service using
 *      keyword rules on category + tag + name. See classifyPlumbingTask() below.
 *   4. Duplicates each existing engine row across install/service so no pricebook
 *      starts empty (both types inherit the trade's tuned engine).
 *   5. Duplicates each existing category row per service_type so both install
 *      and service pricebooks show a starter category tree.
 *
 * Idempotent: rerun-safe with IF NOT EXISTS + ON CONFLICT DO NOTHING.
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/004_service_type_split.js
 */

const { Client } = require('pg');
const DB = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';

/**
 * Classify an existing plumbing task into 'install' or 'service' from its
 * category_id + tag + name. Kept liberal — err on the side of "service" for
 * anything ambiguous, since it's the more common on-a-truck use case.
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

  // Category-level fallback for anything unmatched
  const installCats = new Set(['prmt', 'cs', 'dig', 'pip', 'wpur', 'vlv']);
  const serviceCats = new Set(['acc', 'diag', 'dc', 'fvt', 'swr', 'wlk', 'ewrn']);
  if (installCats.has(category_id)) return 'install';
  if (serviceCats.has(category_id)) return 'service';

  // Truly mixed categories (bath, kit, lndr, of, gas, wh) that didn't
  // trip a keyword — default to service (safer to over-serve).
  return 'service';
}

async function run() {
  const db = new Client({ connectionString: DB });
  await db.connect();
  console.log('→ Connected to', DB.replace(/:[^:@]+@/, ':***@'));

  try {
    await db.query('BEGIN');

    // ── 1. pb_tasks: add service + service_type ─────────────────
    console.log('→ pb_tasks: add service, service_type');
    await db.query(`ALTER TABLE pb_tasks ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'plumbing'`);
    await db.query(`ALTER TABLE pb_tasks ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'service'`);
    await db.query(`CREATE INDEX IF NOT EXISTS pb_tasks_service_idx ON pb_tasks(service, service_type)`);

    // Classify existing plumbing tasks
    console.log('→ Classifying existing plumbing tasks into install/service…');
    const { rows: existing } = await db.query(
      `SELECT id, category_id, tag, name FROM pb_tasks WHERE service = 'plumbing'`
    );
    let installCount = 0, serviceCount = 0;
    for (const t of existing) {
      const type = classifyPlumbingTask(t);
      await db.query(`UPDATE pb_tasks SET service_type = $1 WHERE id = $2`, [type, t.id]);
      if (type === 'install') installCount++; else serviceCount++;
    }
    console.log(`  → ${installCount} install, ${serviceCount} service`);

    // ── 2. pb_categories: add service + service_type ────────────
    console.log('→ pb_categories: add service, service_type');
    await db.query(`ALTER TABLE pb_categories ADD COLUMN IF NOT EXISTS service TEXT NOT NULL DEFAULT 'plumbing'`);
    await db.query(`ALTER TABLE pb_categories ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'service'`);

    // The PK is `id` alone (text). We want the same category id to be able to
    // appear under multiple (service, service_type) pricebooks. Drop the old
    // PK, keep id as ordinary column, add composite PK.
    console.log('→ pb_categories: composite PK (id, service, service_type)');
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_categories_pkey') THEN
          ALTER TABLE pb_categories DROP CONSTRAINT pb_categories_pkey;
        END IF;
      END $$;
    `);
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'pb_categories_pkey_composite'
        ) THEN
          ALTER TABLE pb_categories
            ADD CONSTRAINT pb_categories_pkey_composite PRIMARY KEY (id, service, service_type);
        END IF;
      END $$;
    `);

    // Duplicate every existing plumbing category into both install and service
    // (so both pricebooks have a starter tree). Existing rows are already
    // marked service_type='service' by the default; add install twins.
    console.log('→ Duplicating plumbing categories into install variant');
    const { rows: plumbCats } = await db.query(
      `SELECT id, icon, name, color, description, sort_order
         FROM pb_categories WHERE service = 'plumbing' AND service_type = 'service'`
    );
    for (const c of plumbCats) {
      await db.query(
        `INSERT INTO pb_categories (id, icon, name, color, description, sort_order, service, service_type)
         VALUES ($1,$2,$3,$4,$5,$6,'plumbing','install')
         ON CONFLICT (id, service, service_type) DO NOTHING`,
        [c.id, c.icon, c.name, c.color, c.description, c.sort_order]
      );
    }

    // ── 3. pb_engine: composite (service, service_type) ─────────
    console.log('→ pb_engine: add service_type + composite unique');
    await db.query(`ALTER TABLE pb_engine ADD COLUMN IF NOT EXISTS service_type TEXT NOT NULL DEFAULT 'service'`);
    // Drop the old service-only unique, add composite
    await db.query(`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_engine_service_unique') THEN
          ALTER TABLE pb_engine DROP CONSTRAINT pb_engine_service_unique;
        END IF;
      END $$;
    `);
    await db.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pb_engine_service_type_unique') THEN
          ALTER TABLE pb_engine
            ADD CONSTRAINT pb_engine_service_type_unique UNIQUE (service, service_type);
        END IF;
      END $$;
    `);

    // Existing rows default to service_type='service'. Now clone each into 'install'
    // so both variants exist with the same tuned settings out of the gate.
    console.log('→ Cloning engines into install variant');
    const { rows: engines } = await db.query(
      `SELECT * FROM pb_engine WHERE service_type = 'service'`
    );
    for (const e of engines) {
      // Insert a twin with service_type='install' unless one already exists
      await db.query(
        `INSERT INTO pb_engine
           (service, service_type, wage, burden, truck, overhead, profit, misc, warranty,
            hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
            num_techs, oh_hrs, matmarkup, oh_items, updated_at)
         VALUES ($1, 'install', $2,$3,$4,$5,$6,$7,$8, $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
                 $19,$20,$21, $22::jsonb, NOW())
         ON CONFLICT (service, service_type) DO NOTHING`,
        [
          e.service, e.wage, e.burden, e.truck, e.overhead, e.profit, e.misc, e.warranty,
          e.hrs, e.fica, e.unemp, e.wc, e.health, e.vehicle, e.fuel, e.tools, e.uniform, e.phone,
          e.num_techs, e.oh_hrs, e.matmarkup, JSON.stringify(e.oh_items || []),
        ]
      );
    }

    // ── 4. pb_materials already has `service` — add index on it ─
    await db.query(`CREATE INDEX IF NOT EXISTS pb_materials_service_idx ON pb_materials(service)`);

    await db.query('COMMIT');
    console.log('✓ Migration 004 complete.');

    // Sanity print
    const { rows: engRows } = await db.query(
      `SELECT service, service_type FROM pb_engine ORDER BY service, service_type`
    );
    console.log('  engines:', engRows.map(r => `${r.service}/${r.service_type}`).join(', '));

    const { rows: taskStats } = await db.query(
      `SELECT service, service_type, COUNT(*)::int AS n
         FROM pb_tasks GROUP BY service, service_type ORDER BY service, service_type`
    );
    console.log('  task counts:', taskStats.map(r => `${r.service}/${r.service_type}=${r.n}`).join(', '));
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

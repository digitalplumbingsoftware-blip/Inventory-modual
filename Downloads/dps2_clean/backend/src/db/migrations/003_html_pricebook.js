'use strict';
/**
 * Migration 003: Load full HTML pricebook (Plumbing_Pricebook_Web_v7.html)
 *
 * - Extracts MATS, CATS, TASKS, and ohItems from the HTML file via eval
 * - Rewrites pb_materials, pb_tasks, pb_task_materials with full dataset
 * - Extends pb_engine with HTML engine fields (hrs, fica, unemp, wc, health,
 *   vehicle, fuel, tools, uniform, phone, num_techs, oh_hrs, matmarkup, oh_items)
 * - Does NOT change the engine formula — only adds fields & defaults
 *
 * Run: DATABASE_URL=postgresql://... node src/db/migrations/003_html_pricebook.js
 */

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const DB  = process.env.DATABASE_URL || 'postgresql://dps_user:dps_secret@localhost:5432/dps';
const HTML = process.env.PRICEBOOK_HTML ||
  '/Users/raysmacbookpro/Desktop/Plumbing_Pricebook_Web_v7.html';

function extractBlock(src, startMarker, endChar) {
  const idx = src.indexOf(startMarker);
  if (idx < 0) throw new Error(`Marker not found: ${startMarker}`);
  // Find opening brace/bracket after the marker
  let i = idx + startMarker.length;
  while (i < src.length && src[i] !== '{' && src[i] !== '[') i++;
  const open = src[i];
  const close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, strCh = '', esc = false;
  let start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') { esc = true; continue; }
      if (c === strCh) { inStr = false; continue; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '/' && src[i+1] === '/') { // line comment
      while (i < src.length && src[i] !== '\n') i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) { return src.slice(start, i+1); }
    }
  }
  throw new Error(`Unterminated block for ${startMarker}`);
}

function parsePricebookHtml(htmlPath) {
  const src = fs.readFileSync(htmlPath, 'utf8');
  const matsSrc  = extractBlock(src, 'const MATS =');
  const catsSrc  = extractBlock(src, 'const CATS =');
  const tasksSrc = extractBlock(src, 'const TASKS =');
  const ohSrc    = extractBlock(src, 'let ohItems =');
  // eslint-disable-next-line no-new-func
  const MATS   = Function(`"use strict";return (${matsSrc});`)();
  const CATS   = Function(`"use strict";return (${catsSrc});`)();
  const TASKS  = Function(`"use strict";return (${tasksSrc});`)();
  const ohItems = Function(`"use strict";return (${ohSrc});`)();
  return { MATS, CATS, TASKS, ohItems };
}

async function run() {
  console.log('→ Reading HTML pricebook:', HTML);
  const { MATS, CATS, TASKS, ohItems } = parsePricebookHtml(HTML);
  const matIds  = Object.keys(MATS);
  const catIds  = CATS.map(c => c.id);
  const taskCount = catIds.reduce((s, id) => s + (TASKS[id]?.length || 0), 0);
  console.log(`  materials: ${matIds.length}`);
  console.log(`  categories: ${catIds.length}`);
  console.log(`  tasks: ${taskCount}`);
  console.log(`  oh items: ${ohItems.length}`);

  const db = new Client({ connectionString: DB });
  await db.connect();
  console.log('→ Connected to', DB.replace(/:[^:@]+@/, ':***@'));

  try {
    await db.query('BEGIN');

    // 1. Schema updates
    console.log('→ Altering pb_tasks (add description)');
    await db.query(`ALTER TABLE pb_tasks ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT ''`);

    console.log('→ Altering pb_engine (add HTML engine fields)');
    const engineCols = [
      ['hrs',        'NUMERIC DEFAULT 1600'],
      ['fica',       'NUMERIC DEFAULT 7.65'],
      ['unemp',      'NUMERIC DEFAULT 2.5'],
      ['wc',         'NUMERIC DEFAULT 8'],
      ['health',     'NUMERIC DEFAULT 0'],
      ['vehicle',    'NUMERIC DEFAULT 0'],
      ['fuel',       'NUMERIC DEFAULT 0'],
      ['tools',      'NUMERIC DEFAULT 0'],
      ['uniform',    'NUMERIC DEFAULT 0'],
      ['phone',      'NUMERIC DEFAULT 0'],
      ['num_techs',  'NUMERIC DEFAULT 1'],
      ['oh_hrs',     'NUMERIC DEFAULT 1600'],
      ['matmarkup',  'NUMERIC DEFAULT 0'],
      ['oh_items',   `JSONB DEFAULT '[]'::jsonb`],
    ];
    for (const [col, def] of engineCols) {
      await db.query(`ALTER TABLE pb_engine ADD COLUMN IF NOT EXISTS ${col} ${def}`);
    }

    // Ensure pb_categories table exists (useful for app UI)
    await db.query(`
      CREATE TABLE IF NOT EXISTS pb_categories (
        id TEXT PRIMARY KEY,
        icon TEXT,
        name TEXT NOT NULL,
        color TEXT,
        description TEXT,
        sort_order INTEGER DEFAULT 0
      )
    `);

    // 2. Wipe existing data (FK order)
    console.log('→ Clearing existing pricebook data');
    await db.query('DELETE FROM pb_task_materials');
    await db.query('DELETE FROM pb_tasks');
    await db.query('DELETE FROM pb_materials');
    await db.query('DELETE FROM pb_categories');

    // 3. Insert categories
    console.log('→ Inserting categories');
    for (let i = 0; i < CATS.length; i++) {
      const c = CATS[i];
      await db.query(
        `INSERT INTO pb_categories (id, icon, name, color, description, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [c.id, c.icon || '', c.name, c.color || '', c.desc || '', i]
      );
    }

    // 4. Insert materials
    console.log('→ Inserting materials');
    for (const id of matIds) {
      const m = MATS[id];
      await db.query(
        `INSERT INTO pb_materials (id, description, unit, cost)
         VALUES ($1,$2,$3,$4)`,
        [id, m.d, m.u || 'EA', m.c]
      );
    }

    // 5. Insert tasks + task materials
    console.log('→ Inserting tasks');
    let taskInserted = 0, matLinks = 0;
    for (const catId of catIds) {
      const list = TASKS[catId] || [];
      for (let idx = 0; idx < list.length; idx++) {
        const t = list[idx];
        const { rows: [row] } = await db.query(
          `INSERT INTO pb_tasks
            (category_id, name, tag, hours, time_range, difficulty, notes, description)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [catId, t.n, t.tag || '', t.hrs || 0, t.time || '', t.diff || 'Easy',
           t.notes || '', t.desc || '']
        );
        taskInserted++;
        for (const [matId, qty] of (t.mats || [])) {
          if (!MATS[matId]) continue; // skip unknown material refs
          await db.query(
            `INSERT INTO pb_task_materials (task_id, material_id, qty)
             VALUES ($1,$2,$3)`,
            [row.id, matId, qty]
          );
          matLinks++;
        }
      }
    }
    console.log(`  → ${taskInserted} tasks, ${matLinks} material links`);

    // 6. Engine defaults (HTML values — do not change formula)
    console.log('→ Writing engine defaults');
    // Wipe & re-insert row id=1 with all HTML defaults
    await db.query('DELETE FROM pb_engine');
    await db.query(
      `INSERT INTO pb_engine
         (id, wage, burden, truck, overhead, profit, misc, warranty,
          hrs, fica, unemp, wc, health, vehicle, fuel, tools, uniform, phone,
          num_techs, oh_hrs, matmarkup, oh_items, updated_at)
       VALUES
         (1, 28, 0, 0, 0, 20, 8, 3,
          1600, 7.65, 2.5, 8, 0, 0, 0, 0, 0, 0,
          1, 1600, 0, $1::jsonb, NOW())`,
      [JSON.stringify(ohItems)]
    );

    await db.query('COMMIT');
    console.log('✓ Migration complete.');
  } catch (err) {
    await db.query('ROLLBACK').catch(()=>{});
    console.error('✗ Migration failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
  } finally {
    await db.end();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});

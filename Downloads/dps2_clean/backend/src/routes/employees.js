
const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

// Department labels that always mean "technician" regardless of substring rules.
const TECH_DEPT_TYPES = new Set([
  'Plumbing','HVAC','Electrical','Restoration','Renovations','Pest Control','Pools','Sales','Technicians',
]);

// Map employee department → user role.
// Tech department list wins first; substring matches handle office variants.
function deptToRole(dept) {
  const raw = (dept || '').trim();
  if (TECH_DEPT_TYPES.has(raw)) return 'technician';
  const d = raw.toLowerCase();
  if (d.includes('admin'))    return 'admin';
  if (d.includes('dispatch')) return 'dispatcher';
  if (d.includes('account'))  return 'accountant';
  if (d.includes('office'))   return 'office';
  if (d.includes('warehouse')) return 'office';
  if (d.includes('management')) return 'office';
  // Anything else → technician (e.g. Field, Service)
  return 'technician';
}

// Random hex color — used when a tech is created without a chosen color.
function randomDispatchColor() {
  return '#' + Math.floor(Math.random()*0xFFFFFF).toString(16).padStart(6, '0');
}

// Upsert a users record for an employee.
// Auto-generates a synthetic email if none provided so techs always appear on the dispatch board.
async function syncUserRecord(emp, opts = {}) {
  const parts = (emp.name || '').trim().split(/\s+/);
  const firstName = parts[0] || emp.name || 'Tech';
  const lastName  = parts.slice(1).join(' ') || '';
  const role = deptToRole(emp.department);
  const initials = ((firstName[0]||'') + (lastName[0]||'')).toUpperCase()
                || firstName.slice(0,2).toUpperCase();

  // Synthesize an email when none provided so the NOT NULL/UNIQUE constraint is satisfied.
  // Technicians without a real email still need a row in `users` to render on dispatch.
  const email = (emp.email && emp.email.trim())
    ? emp.email.trim().toLowerCase()
    : `emp-${emp.id}@local.dps`;

  const tempPassword = opts.temp_password && String(opts.temp_password).trim();
  const color = emp.color || randomDispatchColor();

  // Check if user already exists — match by emp.id linkage OR email.
  const { rows: existing } = await query(
    `SELECT id FROM users WHERE email=$1 LIMIT 1`, [email]
  );

  if (existing.length) {
    // Update name/role/active/color/initials. Optionally rotate password if a new one was provided.
    let passClause = '';
    const vals = [firstName, lastName, role, emp.active !== false, initials, color, email];
    if (tempPassword) {
      const hash = await bcrypt.hash(tempPassword, 10);
      passClause = ', password_hash=$8';
      vals.push(hash);
    }
    await query(
      `UPDATE users SET first_name=$1, last_name=$2, role=$3::user_role, active=$4,
                        initials=$5, color=COALESCE(color,$6), updated_at=NOW()${passClause}
       WHERE email=$7`,
      vals
    );
    return existing[0].id;
  }

  // Create a new user. Use the typed temp password if any, else a random one.
  const pw = tempPassword || ('TempPass' + Math.random().toString(36).slice(2));
  const hash = await bcrypt.hash(pw, 10);
  const { rows: inserted } = await query(
    `INSERT INTO users (email, password_hash, first_name, last_name, role, active, initials, color)
     VALUES ($1,$2,$3,$4,$5::user_role,$6,$7,$8)
     ON CONFLICT (email) DO UPDATE SET
       first_name=$3, last_name=$4, role=$5::user_role, active=$6,
       initials=$7, color=COALESCE(users.color,$8), updated_at=NOW()
     RETURNING id`,
    [email, hash, firstName, lastName, role, emp.active !== false, initials, color]
  );
  return inserted[0]?.id;
}

// GET all employees
router.get('/', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM employees ORDER BY name ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Ensure new columns exist (idempotent). Adds bio/username/avatar_url/color so
// the EmployeeModal form fields actually persist.
(async () => {
  try {
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_pct NUMERIC`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS bio TEXT`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS username TEXT`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_url TEXT`);
    await query(`ALTER TABLE employees ADD COLUMN IF NOT EXISTS color TEXT`);
  } catch(e) { console.warn('employees ALTER:', e.message); }
})();

// POST create employee
router.post('/', authenticate, async (req, res) => {
  try {
    const {
      name, email, phone, department, role_id, license_type, pay_type,
      hourly_rate, commission_pct, salary, hire_date, active, notes,
      bio, username, avatar_url, color, temp_password,
    } = req.body;
    const r = await query(
      `INSERT INTO employees
        (name, email, phone, department, role_id, license_type, pay_type,
         hourly_rate, commission_pct, salary, hire_date, active, notes,
         bio, username, avatar_url, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [name, email || null, phone || null, department, role_id || null, license_type,
       pay_type, hourly_rate || null, commission_pct || null, salary || null,
       hire_date || null, active !== false, notes || '',
       bio || null, username || null, avatar_url || null, color || null]
    );
    const emp = r.rows[0];
    try {
      const userId = await syncUserRecord(emp, { temp_password });
      emp.user_id = userId;
    } catch (syncErr) {
      console.error('syncUserRecord failed:', syncErr.message);
      // Don't fail the whole request — surface a warning so frontend knows.
      emp._sync_warning = syncErr.message;
    }
    res.json(emp);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT update employee
router.put('/:id', authenticate, async (req, res) => {
  try {
    const {
      name, email, phone, department, role_id, license_type, pay_type,
      hourly_rate, commission_pct, salary, hire_date, active, notes,
      bio, username, avatar_url, color, temp_password,
    } = req.body;
    const r = await query(
      `UPDATE employees SET
         name=$1, email=$2, phone=$3, department=$4, role_id=$5, license_type=$6,
         pay_type=$7, hourly_rate=$8, commission_pct=$9, salary=$10, hire_date=$11,
         active=$12, notes=$13,
         bio=$14, username=$15, avatar_url=$16, color=$17,
         updated_at=NOW()
       WHERE id=$18 RETURNING *`,
      [name, email || null, phone || null, department, role_id || null, license_type,
       pay_type, hourly_rate || null, commission_pct || null, salary || null,
       hire_date || null, active !== false, notes || '',
       bio || null, username || null, avatar_url || null, color || null,
       req.params.id]
    );
    const emp = r.rows[0];
    try {
      const userId = await syncUserRecord(emp, { temp_password });
      emp.user_id = userId;
    } catch (syncErr) {
      console.error('syncUserRecord failed:', syncErr.message);
      emp._sync_warning = syncErr.message;
    }
    res.json(emp);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// DELETE employee
router.delete('/:id', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM employees WHERE id=$1', [req.params.id]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

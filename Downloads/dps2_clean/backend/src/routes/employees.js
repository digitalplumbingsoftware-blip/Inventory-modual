
const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

// GET all employees
router.get('/', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM employees ORDER BY name ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST create employee
router.post('/', authenticate, async (req, res) => {
  try {
    const { name,email,phone,department,role_id,license_type,pay_type,hourly_rate,salary,hire_date,active,notes } = req.body;
    const r = await query(
      'INSERT INTO employees (name,email,phone,department,role_id,license_type,pay_type,hourly_rate,salary,hire_date,active,notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *',
      [name,email,phone,department,role_id||null,license_type,pay_type,hourly_rate||null,salary||null,hire_date||null,active!==false,notes||'']
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// PUT update employee
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name,email,phone,department,role_id,license_type,pay_type,hourly_rate,salary,hire_date,active,notes } = req.body;
    const r = await query(
      'UPDATE employees SET name=$1,email=$2,phone=$3,department=$4,role_id=$5,license_type=$6,pay_type=$7,hourly_rate=$8,salary=$9,hire_date=$10,active=$11,notes=$12,updated_at=NOW() WHERE id=$13 RETURNING *',
      [name,email,phone,department,role_id||null,license_type,pay_type,hourly_rate||null,salary||null,hire_date||null,active!==false,notes||'',req.params.id]
    );
    res.json(r.rows[0]);
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

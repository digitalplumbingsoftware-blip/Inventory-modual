const express = require('express');
const router = express.Router();
const { query } = require('../db/pool');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res) => {
  try {
    const r = await query('SELECT * FROM roles ORDER BY is_system DESC, name ASC');
    res.json(r.rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.post('/', authenticate, async (req, res) => {
  try {
    const { name, permissions, category_id } = req.body;
    const r = await query(
      'INSERT INTO roles (name, permissions, category_id) VALUES ($1, $2, $3) RETURNING *',
      [name, JSON.stringify(permissions||[]), category_id||null]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.put('/:id', authenticate, async (req, res) => {
  try {
    const { name, permissions, category_id } = req.body;
    const r = await query(
      'UPDATE roles SET name=$1, permissions=$2, category_id=$3, updated_at=NOW() WHERE id=$4 RETURNING *',
      [name, JSON.stringify(permissions||[]), category_id||null, req.params.id]
    );
    res.json(r.rows[0]);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

router.delete('/:id', authenticate, async (req, res) => {
  try {
    await query('DELETE FROM roles WHERE id=$1 AND is_system=false', [req.params.id]);
    res.json({ success:true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
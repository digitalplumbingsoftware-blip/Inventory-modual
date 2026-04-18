
const express = require('express');
const router = express.Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// GET Wisetack credentials
router.get('/wisetack', authenticate, async (req, res) => {
  try {
    const r = await query("SELECT config FROM integrations WHERE name='wisetack'");
    res.json(r.rows[0] ? r.rows[0].config : {});
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST save Wisetack credentials
router.post('/wisetack', authenticate, async (req, res) => {
  try {
    const config = req.body;
    await query(
      "INSERT INTO integrations (name, config) VALUES ('wisetack',$1) ON CONFLICT (name) DO UPDATE SET config=$1, updated_at=NOW()",
      [JSON.stringify(config)]
    );
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST create Wisetack financing application
router.post('/wisetack/apply', authenticate, async (req, res) => {
  try {
    const { customer_name, customer_phone, amount, job_id } = req.body;

    // Get stored credentials
    const r = await query("SELECT config FROM integrations WHERE name='wisetack'");
    const creds = r.rows[0] ? r.rows[0].config : null;

    if (!creds || !creds.merchant_id) {
      return res.status(400).json({ error: 'Wisetack not configured. Add credentials in Settings > Integrations.' });
    }

    // Sandbox: return a mock application URL
    // Production: call Wisetack API at https://api.wisetack.com/v1/transactions
    if (creds.environment === 'sandbox') {
      const mockUrl = 'https://sandbox.wisetack.com/apply?merchant=' + creds.merchant_id + '&amount=' + amount + '&ref=' + job_id;
      return res.json({ application_url: mockUrl, transaction_id: 'wtk_test_' + Date.now() });
    }

    // Production Wisetack API call
    const response = await fetch('https://api.wisetack.com/v1/transactions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + creds.api_key,
      },
      body: JSON.stringify({
        merchant_id:   creds.merchant_id,
        loan_amount:   amount * 100, // Wisetack uses cents
        first_name:    customer_name ? customer_name.split(' ')[0] : '',
        last_name:     customer_name ? customer_name.split(' ').slice(1).join(' ') : '',
        mobile_number: customer_phone,
        order_id:      String(job_id),
      })
    });
    const data = await response.json();
    if (data.application_url) {
      res.json({ application_url: data.application_url, transaction_id: data.transaction_id });
    } else {
      res.status(400).json({ error: data.message || 'Failed to create application' });
    }
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// POST Wisetack webhook (status updates)
router.post('/wisetack/webhook', async (req, res) => {
  try {
    const { transaction_id, status, loan_amount, job_id } = req.body;
    console.log('Wisetack webhook:', transaction_id, status);
    // TODO: update job/invoice payment status
    res.json({ received: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;

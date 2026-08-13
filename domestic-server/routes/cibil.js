'use strict';
const https   = require('https');
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');

/**
 * POST /domestic-api/cibil/check
 *
 * Proxies a CIBIL consumer-report request to Signzy.
 * The API token (SIGNZY_AUTH_TOKEN) is stored only in .env  never exposed to
 * the browser.  Set SIGNZY_ENV=production to hit the live endpoint.
 *
 * Body fields (all required):
 *   firstName, lastName, gender, phoneNumber, panNumber,
 *   dateOfBirth (YYYY-MM-DD), pincode, address
 */
router.post(
  '/check',
  protect,
  authorize('domagent', 'dom_admin', 'dom_superadmin'),
  async (req, res) => {
    const {
      firstName, lastName, gender,
      phoneNumber, panNumber,
      dateOfBirth, pincode, address,
    } = req.body;

    //  Validation 
    const REQUIRED = ['firstName', 'lastName', 'gender', 'phoneNumber',
                      'panNumber', 'dateOfBirth', 'pincode', 'address'];
    const missing = REQUIRED.filter(k => !req.body[k] || !String(req.body[k]).trim());
    if (missing.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    const authToken = process.env.SIGNZY_AUTH_TOKEN;
    if (!authToken) {
      return res.status(503).json({
        success: false,
        message: 'CIBIL service is not configured. Contact your admin.',
      });
    }

    //  Sanitise inputs 
    // Strip IPv6-mapped IPv4 prefix (::ffff:1.2.3.4  1.2.3.4)
    const rawIp    = req.ip || '0.0.0.0';
    const clientIp = rawIp.startsWith('::ffff:') ? rawIp.slice(7) : rawIp;

    const payload = JSON.stringify({
      firstName:   String(firstName).trim().toUpperCase(),
      lastName:    String(lastName).trim().toUpperCase(),
      gender:      String(gender).trim(),
      // Keep only the last 10 digits of the phone number
      phoneNumber: String(phoneNumber).trim().replace(/\D/g, '').slice(-10),
      panNumber:   String(panNumber).trim().toUpperCase(),
      dateOfBirth: String(dateOfBirth).trim(),   // expects YYYY-MM-DD
      pincode:     String(pincode).trim(),
      address:     String(address).trim(),
      consent: {
        consentFlag:      true,
        consentTimestamp: Math.floor(Date.now() / 1000),
        consentIpAddress: clientIp,
      },
    });

    //  Determine endpoint 
    const useProduction = process.env.SIGNZY_ENV === 'production';
    const hostname      = useProduction
      ? 'api.signzy.app'
      : 'api-preproduction.signzy.app';

    const options = {
      hostname,
      path:    '/api/v3/bureau/cibil-consumer-report',
      method:  'POST',
      headers: {
        Authorization:    authToken,
        'Content-Type':   'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
      timeout: 30000,
    };

    //  Proxy call 
    try {
      const result = await new Promise((resolve, reject) => {
        const outReq = https.request(options, (inRes) => {
          let body = '';
          inRes.on('data', (chunk) => { body += chunk; });
          inRes.on('end', () => {
            try   { resolve({ statusCode: inRes.statusCode, body: JSON.parse(body) }); }
            catch { resolve({ statusCode: inRes.statusCode, body }); }
          });
        });
        outReq.on('error',   reject);
        outReq.on('timeout', () => { outReq.destroy(); reject(new Error('Request timed out')); });
        outReq.write(payload);
        outReq.end();
      });

      if (result.statusCode !== 200) {
        const httpStatus = (result.statusCode >= 400 && result.statusCode < 600)
          ? result.statusCode
          : 502;
        return res.status(httpStatus).json({
          success: false,
          message: 'CIBIL check failed.',
          details: result.body,
        });
      }

      return res.json({ success: true, data: result.body });
    } catch (err) {
      console.error('[CIBIL] Signzy request error:', err.message);
      return res.status(502).json({
        success: false,
        message: err.message || 'CIBIL service error. Please try again.',
      });
    }
  }
);

module.exports = router;


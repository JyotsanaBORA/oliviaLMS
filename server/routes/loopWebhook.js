/**
 * Loop Inbound Webhook
 * --------------------
 * Loop company POSTs lead data to this endpoint from their CRM.
 * All received data is stored in the `loop` MongoDB collection (LoopLead model).
 *
 * Endpoint : POST /api/webhook/loop
 * Auth     : x-loop-secret header must match LOOP_WEBHOOK_SECRET env var
 * Formats  : application/json  (primary, per Loop's spec)
 *            application/x-www-form-urlencoded  (fallback)
 *
 * Webhook URL to share with Loop company:
 *   https://olivialms.cloud/api/webhook/loop
 */

const express = require('express');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const LoopLead  = require('../models/LoopLead');

const router = express.Router();

// ── CORS — Loop's servers may not send an Origin header, but open it up
//    just in case their CRM does.
router.use(cors({
  origin: '*',
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-loop-secret'],
}));

// ── Rate limiting — 500 requests / 15 min per IP
//    (campaigns can be high-volume; tighten if needed)
const loopWebhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

// ── Sanitise a string field — trim + cap length
const str = (val, max = 300) =>
  val !== undefined && val !== null && typeof val === 'string'
    ? val.trim().substring(0, max)
    : (val !== undefined && val !== null ? String(val).trim().substring(0, max) : undefined);

// ============================================================
// POST /api/webhook/loop
// ============================================================
router.post('/', loopWebhookLimiter, async (req, res) => {
  try {
    // ── 1. Authenticate via shared secret ──────────────────────────────────
    const expectedSecret = (process.env.LOOP_WEBHOOK_SECRET || '').trim();

    if (!expectedSecret) {
      // Secret not configured — reject until it is set
      console.error('[Loop Webhook] LOOP_WEBHOOK_SECRET env var is not set. Rejecting request.');
      return res.status(503).json({
        success: false,
        message: 'Webhook not configured. Contact administrator.',
      });
    }

    const providedSecret = (req.headers['x-loop-secret'] || '').trim();

    if (!providedSecret || providedSecret !== expectedSecret) {
      console.warn('[Loop Webhook] Invalid or missing x-loop-secret header. IP:', req.ip);
      return res.status(401).json({
        success: false,
        message: 'Unauthorized. Invalid or missing x-loop-secret header.',
      });
    }

    // ── 2. Extract body ────────────────────────────────────────────────────
    // Loop sends { "fields": { ... } } per their spec, but also handle flat body
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ success: false, message: 'Request body must be JSON.' });
    }

    const fields = body.fields && typeof body.fields === 'object' ? body.fields : body;

    // ── 3. Build document from known Loop fields ───────────────────────────
    const doc = {
      rawPayload: body,
      receivedAt: new Date(),
      sourceIp:   req.ip || req.connection?.remoteAddress || 'unknown',
      status:     'new',
    };

    // Map every known field — all are optional per Loop's spec
    if (fields.firstname    !== undefined) doc.firstname     = str(fields.firstname,    100);
    if (fields.lastname     !== undefined) doc.lastname      = str(fields.lastname,     100);
    if (fields.phone        !== undefined) doc.phone         = str(fields.phone,         30);
    if (fields.email        !== undefined) doc.email         = str(fields.email,        200);
    if (fields.address      !== undefined) doc.address       = str(fields.address,      300);
    if (fields.city         !== undefined) doc.city          = str(fields.city,         100);
    if (fields.state        !== undefined) doc.state         = str(fields.state,         50);
    if (fields.zip          !== undefined) doc.zip           = str(fields.zip,           20);
    if (fields.country      !== undefined) doc.country       = str(fields.country,       50);
    if (fields.debt_amount  !== undefined) doc.debt_amount   = str(fields.debt_amount,  100);
    if (fields.fico         !== undefined) doc.fico          = str(fields.fico,         100);
    if (fields.unsecured_debt !== undefined) doc.unsecured_debt = str(fields.unsecured_debt, 100);
    if (fields.dob          !== undefined) doc.dob           = str(fields.dob,           50);
    if (fields.trusted_form !== undefined) doc.trusted_form  = str(fields.trusted_form, 500);

    // ── 4. Persist to `loop` collection ───────────────────────────────────
    const saved = await LoopLead.create(doc);

    console.log(`[Loop Webhook] Lead stored. ID: ${saved._id}, Phone: ${doc.phone || 'N/A'}, IP: ${doc.sourceIp}`);

    // ── 5. Respond 200 immediately (Loop CRM expects a 2xx) ───────────────
    return res.status(200).json({
      success: true,
      message: 'Lead received.',
      id: saved._id,
    });

  } catch (error) {
    console.error('[Loop Webhook] Error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Internal server error.',
    });
  }
});

module.exports = router;

/**
 * Webhook route — receives lead submissions from marketing website forms.
 * Submissions are saved to the separate `websiteleads` collection (WebsiteLead model).
 * Reddington admin can then review and import them into the main Lead collection.
 *
 * Form 1 ("Send Us a Message"):
 *   firstName, lastName, email, phone, message, smsOptIn
 *
 * Form 2 ("Check If You Qualify"):
 *   firstName, lastName, email, phone, totalDebtAmount, streetAddress,
 *   city, state, zipCode, smsOptIn
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const WebsiteLead = require('../models/WebsiteLead');
const Organization = require('../models/Organization');

const router = express.Router();

// Allow cross-origin requests from any domain (API key is the auth layer)
router.use(cors({
  origin: '*',
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key']
}));

// 100 submissions per 15 minutes per IP
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// ---------------------------------------------------------------------------
// Helper — sanitise a plain string field
// ---------------------------------------------------------------------------
const str = (val, max = 200) =>
  val && typeof val === 'string' ? val.trim().substring(0, max) : null;

// ---------------------------------------------------------------------------
// POST /api/webhook/leads
// ---------------------------------------------------------------------------
router.post('/leads', webhookLimiter, async (req, res) => {
  try {
    // 1. Verify API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(401).json({
        success: false,
        message: 'API key is required in the x-api-key request header.'
      });
    }

    // 2. Find organisation by key
    const org = await Organization
      .findOne({ webhookApiKey: apiKey.trim(), isActive: true })
      .select('+webhookApiKey')
      .lean();

    if (!org) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive API key.'
      });
    }

    // 3. Extract fields — handles both website forms
    const {
      firstName,
      lastName,
      email,
      phone,
      message,         // Form 1: "How can we help you?"
      totalDebtAmount, // Form 2: debt slider ($5,000–$100,000)
      streetAddress,   // Form 2 field name
      city,
      state,
      zipCode,         // Form 2 field name
      smsOptIn         // both forms: SMS consent checkbox
    } = req.body;

    // 4. Build full name
    const first = str(firstName, 50) || '';
    const last  = str(lastName,  50) || '';
    const fullName = [first, last].filter(Boolean).join(' ');

    if (fullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'First Name is required.'
      });
    }

    const optedIn    = smsOptIn === true || smsOptIn === 'true' || smsOptIn === '1';
    const formType   = message ? 'contact-form' : 'qualify-form';

    // 5. Build WebsiteLead document
    const doc = {
      organization: org._id,
      firstName:    str(firstName, 50) || undefined,
      lastName:     str(lastName,  50) || undefined,
      name:         fullName.substring(0, 100),
      smsOptIn:     optedIn,
      formType,
      rawPayload:   req.body,
    };

    const cleanEmail = str(email, 100);
    if (cleanEmail) doc.email = cleanEmail.toLowerCase();

    const cleanPhone = str(phone, 20);
    if (cleanPhone) doc.phone = cleanPhone.replace(/[\s\-\(\)]/g, '');

    if (message)       doc.message       = str(message, 2000);
    if (streetAddress) doc.streetAddress = str(streetAddress, 200);
    if (city)          doc.city          = str(city, 100);
    if (state)         doc.state         = str(state, 50);
    if (zipCode)       doc.zipCode       = str(zipCode, 20);

    if (totalDebtAmount !== undefined && totalDebtAmount !== null) {
      const amount = Number(totalDebtAmount);
      if (!isNaN(amount) && amount >= 0) doc.totalDebtAmount = amount;
    }

    // 6. Save to websiteleads collection
    const websiteLead = await WebsiteLead.create(doc);

    // 7. Real-time notification to Reddington admin
    if (req.io) {
      req.io.emit('newWebsiteLead', {
        _id:       websiteLead._id,
        name:      websiteLead.name,
        formType,
        createdAt: websiteLead.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your submission has been received.',
    });

  } catch (error) {
    console.error('Webhook lead error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process submission. Please try again.'
    });
  }
});

module.exports = router;

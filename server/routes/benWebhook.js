/**
 * Ben Webhook — receives lead submissions from Ben's website form.
 * Saves to the separate `benwebsiteleads` collection.
 *
 * POST /api/webhook/ben-leads
 * Header: x-api-key: <organisation webhookApiKey>
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const BenWebsiteLead = require('../models/BenWebsiteLead');
const Organization = require('../models/Organization');

const router = express.Router();

// Allow cross-origin requests from any domain (API key is the auth layer)
router.use(cors({
  origin: '*',
  methods: ['POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-api-key'],
}));

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});

const str = (val, max = 200) =>
  val && typeof val === 'string' ? val.trim().substring(0, max) : null;

// ---------------------------------------------------------------------------
// POST /api/webhook/ben-leads
// ---------------------------------------------------------------------------
router.post('/ben-leads', webhookLimiter, async (req, res) => {
  try {
    // 1. Verify API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(401).json({ success: false, message: 'API key is required in the x-api-key header.' });
    }

    // 2. Find organisation by Ben-specific key
    const org = await Organization
      .findOne({ benWebhookApiKey: apiKey.trim(), isActive: true })
      .select('+benWebhookApiKey')
      .lean();

    if (!org) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive API key.' });
    }

    // 3. Extract fields
    const {
      firstName, lastName, email, phone,
      message, totalDebtAmount,
      streetAddress, city, state, zipCode,
      smsOptIn,
      preferredContactDate, preferredContactSlot, preferredContactCustomTime,
    } = req.body;

    // 4. Build full name
    const first = str(firstName, 50) || '';
    const last  = str(lastName, 50)  || '';
    const fullName = [first, last].filter(Boolean).join(' ');

    if (fullName.length < 2) {
      return res.status(400).json({ success: false, message: 'First Name is required.' });
    }

    const optedIn  = smsOptIn === true || smsOptIn === 'true' || smsOptIn === '1';
    const formType = message ? 'contact-form' : 'qualify-form';

    // 5. Build document
    const doc = {
      organization: org._id,
      firstName:    str(firstName, 50) || undefined,
      lastName:     str(lastName, 50)  || undefined,
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

    if (preferredContactDate)       doc.preferredContactDate       = str(preferredContactDate, 40);
    if (preferredContactSlot)       doc.preferredContactSlot       = str(preferredContactSlot, 100);
    if (preferredContactCustomTime) doc.preferredContactCustomTime = str(preferredContactCustomTime, 20);

    if (totalDebtAmount !== undefined && totalDebtAmount !== null) {
      const amount = Number(totalDebtAmount);
      if (!isNaN(amount) && amount >= 0) doc.totalDebtAmount = amount;
    }

    // 6. Save to benwebsiteleads collection
    const lead = await BenWebsiteLead.create(doc);

    // 7. Real-time notification (includes organizationId for frontend filtering)
    if (req.io) {
      req.io.emit('newBenWebsiteLead', {
        _id:            lead._id,
        name:           lead.name,
        formType,
        organizationId: String(lead.organization),
        createdAt:      lead.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your submission has been received.',
    });

  } catch (error) {
    console.error('Ben webhook lead error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process submission. Please try again.' });
  }
});

module.exports = router;

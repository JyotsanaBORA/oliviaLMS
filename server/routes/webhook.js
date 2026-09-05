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
  message: { success: false, message: 'Too many requests, please try again later.' }
});

// Helper — sanitise string or number field
const str = (val, max = 200) => {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return String(val).substring(0, max);
  if (typeof val === 'string') return val.trim().substring(0, max) || null;
  return null;
};

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

    // 3. Extract fields — handles both website forms & various field naming conventions
    const rawFirstName = req.body.firstName || req.body.first_name || req.body.fname;
    const rawLastName  = req.body.lastName  || req.body.last_name  || req.body.lname;
    const rawPhone     = req.body.phone     || req.body.phoneNumber || req.body.phone_number || req.body.telephone || req.body.mobile || req.body.cellPhone;
    const rawEmail     = req.body.email     || req.body.emailAddress || req.body.email_address;
    const rawStreet    = req.body.streetAddress || req.body.address1 || req.body.address || req.body.street || req.body.street_address;
    const rawCity      = req.body.city;
    const rawState     = req.body.state;
    const rawZip       = req.body.zipCode   || req.body.zip || req.body.zipcode || req.body.postalCode || req.body.postal_code;
    const rawDebt      = req.body.totalDebtAmount !== undefined ? req.body.totalDebtAmount : (req.body.debtAmount || req.body.estimatedDebt || req.body.debt);
    const message      = req.body.message;
    const smsOptIn     = req.body.smsOptIn;
    const preferredContactDate       = req.body.preferredContactDate;
    const preferredContactSlot       = req.body.preferredContactSlot;
    const preferredContactCustomTime = req.body.preferredContactCustomTime;

    // 4. Build full name
    const first = str(rawFirstName, 50) || '';
    const last  = str(rawLastName,  50) || '';
    let fullName = [first, last].filter(Boolean).join(' ');
    if (!fullName && req.body.name) {
      fullName = str(req.body.name, 100) || '';
    }

    if (fullName.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'First Name or Full Name is required.'
      });
    }

    const optedIn    = smsOptIn === true || smsOptIn === 'true' || smsOptIn === '1';
    const formType   = message ? 'contact-form' : 'qualify-form';

    // 5. Build WebsiteLead document
    const doc = {
      organization: org._id,
      firstName:    str(rawFirstName, 50) || undefined,
      lastName:     str(rawLastName,  50) || undefined,
      name:         fullName.substring(0, 100),
      smsOptIn:     optedIn,
      formType,
      rawPayload:   req.body,
    };

    const cleanEmail = str(rawEmail, 100);
    if (cleanEmail) doc.email = cleanEmail.toLowerCase();

    const cleanPhone = str(rawPhone, 30);
    if (cleanPhone) {
      let digits = cleanPhone.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) {
        digits = digits.substring(1);
      }
      doc.phone = digits || cleanPhone.replace(/[\s\-\(\)]/g, '');
    }

    if (message)       doc.message       = str(message, 2000);
    if (rawStreet)     doc.streetAddress = str(rawStreet, 200);
    if (rawCity)       doc.city          = str(rawCity, 100);
    if (rawState)      doc.state         = str(rawState, 50);
    if (rawZip)        doc.zipCode       = str(rawZip, 20);

    if (preferredContactDate)       doc.preferredContactDate       = str(preferredContactDate, 40);
    if (preferredContactSlot)       doc.preferredContactSlot       = str(preferredContactSlot, 100);
    if (preferredContactCustomTime) doc.preferredContactCustomTime = str(preferredContactCustomTime, 20);

    if (rawDebt !== undefined && rawDebt !== null && String(rawDebt).trim() !== '') {
      const amount = Number(String(rawDebt).replace(/[^0-9.]/g, ''));
      if (!isNaN(amount) && amount >= 0) doc.totalDebtAmount = amount;
    }

    // 6. Check for duplicate lead by phone number for this organization
    let websiteLead;
    if (doc.phone) {
      const existing = await WebsiteLead.findOne({
        organization: org._id,
        phone: doc.phone,
      }).sort({ createdAt: -1 });

      if (existing) {
        Object.assign(existing, doc);
        websiteLead = await existing.save();
        return res.status(200).json({
          success: true,
          message: 'Submission received and updated.',
          leadId: websiteLead._id,
        });
      }
    }

    // Save to websiteleads collection
    websiteLead = await WebsiteLead.create(doc);

    // 7. Real-time notification
    if (req.io) {
      req.io.emit('newWebsiteLead', {
        _id:              websiteLead._id,
        name:             websiteLead.name,
        formType,
        organizationId:   String(websiteLead.organization),
        organizationName: org.name,
        createdAt:        websiteLead.createdAt,
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

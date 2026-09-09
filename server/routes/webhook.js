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
const Lead = require('../models/Lead');

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
// POST /api/webhook/leads & /api/webhook/inbound-leads
// ---------------------------------------------------------------------------
const handleLeadWebhook = async (req, res) => {
  try {
    // 1. Verify API key from headers, query, or body
    let apiKey = req.headers['x-api-key'] || req.headers['api-key'] || req.headers['apikey'];
    if (!apiKey && req.headers['authorization']) {
      const authHeader = req.headers['authorization'].trim();
      apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader;
    }
    if (!apiKey) {
      apiKey = req.query.api_key || req.query.apiKey || req.body?.api_key || req.body?.apiKey;
    }

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(401).json({
        success: false,
        message: 'API key is required in the x-api-key request header.'
      });
    }

    // 2. Find organisation by key (supports webhookApiKey and benWebhookApiKey)
    const org = await Organization
      .findOne({
        $or: [
          { webhookApiKey: apiKey.trim() },
          { benWebhookApiKey: apiKey.trim() }
        ],
        isActive: true
      })
      .select('+webhookApiKey +benWebhookApiKey')
      .lean();

    if (!org) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or inactive API key.'
      });
    }

    // Determine target DID for segregation
    const explicitDid = str(req.body.did || req.body.DID || req.body.vicidialDid || req.body.vicidial_did, 30);
    const trafficType = str(req.body.traffic_type || req.body.trafficType || req.body.lead_type || req.body.type, 50);
    let assignedDid = explicitDid;
    if (!assignedDid) {
      if (trafficType && (trafficType.toLowerCase().includes('inbound') || trafficType.toLowerCase().includes('call'))) {
        assignedDid = org.inboundCallsDid || (org.inboundDids && org.inboundDids[1]) || (org.inboundDids && org.inboundDids[0]);
      } else {
        assignedDid = org.liveTransferDid || (org.inboundDids && org.inboundDids[0]);
      }
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
    const message      = req.body.message   || req.body.notes || req.body.comments;
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
      fullName = rawEmail ? rawEmail.split('@')[0] : 'Inbound Lead';
    }

    const optedIn    = smsOptIn === true || smsOptIn === 'true' || smsOptIn === '1';
    let determinedFormType = message ? 'contact-form' : 'qualify-form';
    if (trafficType && (trafficType.toLowerCase().includes('transfer') || trafficType.toLowerCase().includes('live'))) {
      determinedFormType = 'live-transfer';
    } else if (trafficType && (trafficType.toLowerCase().includes('inbound') || trafficType.toLowerCase().includes('call'))) {
      determinedFormType = 'inbound-call';
    }

    // 5. Build WebsiteLead document
    const doc = {
      organization: org._id,
      firstName:    str(rawFirstName, 50) || undefined,
      lastName:     str(rawLastName,  50) || undefined,
      name:         fullName.substring(0, 100),
      smsOptIn:     optedIn,
      formType:     determinedFormType,
      did:          assignedDid || undefined,
      vicidialDid:  assignedDid || undefined,
      trafficType:  trafficType || (assignedDid === org.inboundCallsDid ? 'inbound' : 'live-transfer'),
      sourceId:     str(req.body.source_id || req.body.sourceId || (assignedDid ? `Webhook-${assignedDid}` : 'WebhookLead'), 100),
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
    let primaryLead;
    if (doc.phone) {
      const existing = await WebsiteLead.findOne({
        organization: org._id,
        phone: doc.phone,
      }).sort({ createdAt: -1 });

      if (existing) {
        Object.assign(existing, doc);

        let existingPrimary = null;
        if (existing.importedLeadId) {
          existingPrimary = await Lead.findById(existing.importedLeadId);
        }
        if (!existingPrimary) {
          existingPrimary = await Lead.findOne({
            organization: org._id,
            phone: doc.phone
          }).sort({ createdAt: -1 });
        }

        if (existingPrimary) {
          existingPrimary.notes = existingPrimary.notes
            ? existingPrimary.notes + '\n\n' + (doc.message || '')
            : doc.message;
          if (doc.totalDebtAmount) existingPrimary.totalDebtAmount = doc.totalDebtAmount;
          if (assignedDid && !existingPrimary.vicidialDid) existingPrimary.vicidialDid = assignedDid;
          primaryLead = await existingPrimary.save();
          existing.importedLeadId = primaryLead._id;
        } else {
          const standardLeadData = {
            name: doc.name || 'Unknown',
            email: doc.email,
            phone: doc.phone,
            totalDebtAmount: doc.totalDebtAmount,
            notes: doc.message,
            address: doc.streetAddress,
            city: doc.city,
            state: doc.state,
            zipcode: doc.zipCode,
            organization: doc.organization,
            createdBy: doc.organization,
            sourceId: (req.body.source_id || req.body.sourceId || 'WebhookLead').toString().trim(),
            vicidialDid: assignedDid || undefined,
            category: 'warm',
            qualificationStatus: 'pending',
          };
          primaryLead = await Lead.create(standardLeadData);
          existing.importedLeadId = primaryLead._id;
        }

        websiteLead = await existing.save();
        return res.status(200).json({
          success: true,
          message: 'Submission received and updated.',
          leadId: websiteLead._id,
          lead: { id: primaryLead?._id || websiteLead._id }
        });
      }
    }

    // Prepare standard Lead in primary collection
    const standardLeadData = {
      name: doc.name || 'Unknown',
      email: doc.email,
      phone: doc.phone,
      totalDebtAmount: doc.totalDebtAmount,
      notes: doc.message,
      address: doc.streetAddress,
      city: doc.city,
      state: doc.state,
      zipcode: doc.zipCode,
      organization: doc.organization,
      createdBy: doc.organization,
      sourceId: (req.body.source_id || req.body.sourceId || 'WebhookLead').toString().trim(),
      vicidialDid: assignedDid || undefined,
      category: 'warm',
      qualificationStatus: 'pending',
    };

    primaryLead = await Lead.create(standardLeadData);
    doc.importedLeadId = primaryLead._id;

    // Save to websiteleads collection
    websiteLead = await WebsiteLead.create(doc);

    // 7. Real-time notification
    if (req.io) {
      req.io.emit('newWebsiteLead', {
        _id:              websiteLead._id,
        name:             websiteLead.name,
        formType:         websiteLead.formType || determinedFormType,
        organizationId:   String(websiteLead.organization),
        organizationName: org.name,
        createdAt:        websiteLead.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your submission has been received.',
      leadId: websiteLead._id,
      lead: { id: primaryLead._id }
    });

  } catch (error) {
    console.error('Webhook lead error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process submission. Please try again.'
    });
  }
};

router.post('/leads', webhookLimiter, handleLeadWebhook);
router.post('/inbound-leads', webhookLimiter, handleLeadWebhook);
router.post('/live-transfers', webhookLimiter, handleLeadWebhook);

module.exports = router;


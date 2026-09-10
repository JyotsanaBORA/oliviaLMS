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
const Lead = require('../models/Lead');
const { findLeadForEnrichment, enrichLeadWithPayload } = require('../utils/leadEnrichment');

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
// POST /api/webhook/leads, /api/webhook/inbound-leads, /api/webhook/ben-leads, /api/webhook/truclick-leads
// ---------------------------------------------------------------------------
const handleWebhookSubmission = async (req, res) => {
  try {
    const body = req.body || {};

    // 1. Verify API key from headers, query parameters, or body
    let apiKey = req.headers['x-api-key'] || req.headers['api-key'] || req.headers['apikey'];
    if (!apiKey && req.headers['authorization']) {
      const authHeader = req.headers['authorization'].trim();
      apiKey = authHeader.startsWith('Bearer ') ? authHeader.substring(7).trim() : authHeader;
    }
    if (!apiKey) {
      apiKey = req.query.api_key || req.query.apiKey || body.api_key || body.apiKey;
    }

    if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim()) {
      return res.status(401).json({
        success: false,
        message: 'API key is required in the x-api-key header or Authorization header.',
      });
    }

    // 2. Find organisation by webhook key (supports both benWebhookApiKey and standard webhookApiKey)
    const org = await Organization
      .findOne({
        $or: [
          { benWebhookApiKey: apiKey.trim() },
          { webhookApiKey: apiKey.trim() }
        ],
        isActive: true
      })
      .select('+benWebhookApiKey +webhookApiKey')
      .lean();

    if (!org) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive API key.' });
    }

    // Determine target DID for segregation
    const explicitDid = str(body.did || body.DID || body.vicidialDid || body.vicidial_did, 30);
    const trafficType = str(body.traffic_type || body.trafficType || body.lead_type || body.type, 50);
    let assignedDid = explicitDid;
    if (!assignedDid) {
      if (trafficType && (trafficType.toLowerCase().includes('inbound') || trafficType.toLowerCase().includes('call'))) {
        assignedDid = org.inboundCallsDid || (org.inboundDids && org.inboundDids[1]) || (org.inboundDids && org.inboundDids[0]);
      } else {
        assignedDid = org.liveTransferDid || (org.inboundDids && org.inboundDids[0]);
      }
    }

    // 3. Extract names flexibly
    const rawName = str(body.name || body.fullName || body.full_name || body.contact_name || body.lead_name, 100);
    const first = str(body.firstName || body.first_name || body.fname || body.given_name || (rawName ? rawName.split(' ')[0] : ''), 50);
    const last = str(body.lastName || body.last_name || body.lname || body.family_name || body.surname || (rawName ? rawName.split(' ').slice(1).join(' ') : ''), 50);

    let fullName = [first, last].filter(Boolean).join(' ') || rawName;
    if (!fullName) {
      const fallbackEmail = body.email || body.emailAddress || body.email_address;
      fullName = fallbackEmail ? fallbackEmail.split('@')[0] : 'Inbound Lead';
    }

    // 4. Extract contact info flexibly
    const rawEmail = str(body.email || body.emailAddress || body.email_address || body.mail || body.contact_email, 100);
    const rawPhone = str(body.phone || body.phoneNumber || body.phone_number || body.mobile || body.mobile_number || body.telephone || body.tel || body.cell || body.contact_number || body.contactNumber, 30);

    // 5. Extract debt / loan amount (supports strings with '$', ',', etc.)
    const rawDebt = body.totalDebtAmount ?? body.total_debt_amount ?? body.debtAmount ?? body.debt_amount ?? body.debt ?? body.totalDebt ?? body.total_debt ?? body.loanAmount ?? body.loan_amount ?? body.amount;
    let debtAmount = undefined;
    if (rawDebt !== undefined && rawDebt !== null) {
      const parsedDebt = typeof rawDebt === 'number' ? rawDebt : parseFloat(String(rawDebt).replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedDebt) && parsedDebt >= 0) {
        debtAmount = parsedDebt;
      }
    }

    // 6. Extract message / inquiry / comments
    const rawMessage = str(body.message || body.notes || body.comments || body.comment || body.description || body.details || body.inquiry || body.remarks, 2000);

    // 7. Extract address fields
    const streetAddress = str(body.streetAddress || body.street_address || body.address || body.address1 || body.street, 200);
    const city = str(body.city || body.town || body.municipality, 100);
    const state = str(body.state || body.province || body.region || body.state_code, 50);
    const zipCode = str(body.zipCode || body.zip_code || body.zip || body.zipcode || body.postalCode || body.postal_code || body.postcode, 20);

    // 8. SMS opt-in
    const rawOptIn = body.smsOptIn ?? body.sms_opt_in ?? body.optIn ?? body.opt_in ?? body.consent;
    const smsOptIn = rawOptIn === true || rawOptIn === 'true' || rawOptIn === '1' || rawOptIn === 1;

    // 9. Build BenWebsiteLead document
    const doc = {
      organization: org._id,
      firstName: first || undefined,
      lastName: last || undefined,
      name: fullName ? fullName.substring(0, 100) : 'Inbound Lead',
      smsOptIn,
      formType: rawMessage ? 'contact-form' : 'qualify-form',
      rawPayload: body,
      source: 'website',
    };

    if (rawEmail) doc.email = rawEmail.toLowerCase();
    if (rawPhone) {
      let digits = rawPhone.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) digits = digits.substring(1);
      doc.phone = digits || rawPhone.replace(/[\s\-\(\)]/g, '');
    }
    if (debtAmount !== undefined) doc.totalDebtAmount = debtAmount;
    if (rawMessage) doc.message = rawMessage;
    if (streetAddress) doc.streetAddress = streetAddress;
    if (city) doc.city = city;
    if (state) doc.state = state;
    if (zipCode) doc.zipCode = zipCode;

    // Prepare standard Lead payload
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
      sourceId: (body.source_id || body.sourceId || 'WebhookLead').toString().trim(),
      vicidialDid: assignedDid || undefined,
      category: 'warm',
      qualificationStatus: 'pending',
    };

    // 10. Check for existing lead by phone within the same organisation
    let lead;
    let primaryLead;
    
    // Find or enrich primary LMS Lead
    if (doc.phone) {
      const existingPrimary = await findLeadForEnrichment(doc.phone, org._id);
      if (existingPrimary) {
        console.log(`✨ [BenWebhook] Enriching existing Lead (${existingPrimary.leadId || existingPrimary._id}) with Live Transfer data`);
        enrichLeadWithPayload(existingPrimary, standardLeadData);
        primaryLead = await existingPrimary.save();
      }
    }

    if (!primaryLead) {
      primaryLead = await Lead.create(standardLeadData);
    }

    doc.importedLeadId = primaryLead._id;

    // Check for existing BenWebsiteLead entry
    if (doc.phone) {
      const existing = await BenWebsiteLead.findOne({
        organization: org._id,
        phone: doc.phone,
      }).sort({ createdAt: -1 });

      if (existing) {
        Object.assign(existing, doc);
        lead = await existing.save();
        if (req.io) {
          req.io.emit('leadUpdated', primaryLead);
        }
        return res.status(200).json({
          success: true,
          message: 'Submission received and updated.',
          leadId: lead._id,
          primaryLeadId: primaryLead._id,
        });
      }
    }

    // Save new lead to database
    lead = await BenWebsiteLead.create(doc);

    // 12. Real-time notification
    if (req.io) {
      req.io.emit('newBenWebsiteLead', {
        _id: lead._id,
        name: lead.name,
        formType: lead.formType || 'contact-form',
        organizationId: String(lead.organization),
        organizationName: org.name,
        createdAt: lead.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Thank you! Your submission has been received.',
      leadId: lead._id,
    });

  } catch (error) {
    console.error('Webhook lead processing error:', error);
    return res.status(500).json({ success: false, message: 'Failed to process submission. Please try again.' });
  }
};

router.post('/leads', webhookLimiter, handleWebhookSubmission);
router.post('/inbound-leads', webhookLimiter, handleWebhookSubmission);
router.post('/ben-leads', webhookLimiter, handleWebhookSubmission);
router.post('/truclick-leads', webhookLimiter, handleWebhookSubmission);
router.post('/jake2-leads', webhookLimiter, handleWebhookSubmission);
router.post('/jake2', webhookLimiter, handleWebhookSubmission);

module.exports = router;

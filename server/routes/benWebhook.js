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

    // 2. Find organisation by webhook key
    const org = await Organization
      .findOne({ benWebhookApiKey: apiKey.trim(), isActive: true })
      .select('+benWebhookApiKey')
      .lean();

    if (!org) {
      return res.status(401).json({ success: false, message: 'Invalid or inactive API key.' });
    }

    // 3. Extract names flexibly
    const rawName = str(body.name || body.fullName || body.full_name || body.contact_name || body.lead_name, 100);
    const first   = str(body.firstName || body.first_name || body.fname || body.given_name || (rawName ? rawName.split(' ')[0] : ''), 50);
    const last    = str(body.lastName || body.last_name || body.lname || body.family_name || body.surname || (rawName ? rawName.split(' ').slice(1).join(' ') : ''), 50);
    
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
    const city          = str(body.city || body.town || body.municipality, 100);
    const state         = str(body.state || body.province || body.region || body.state_code, 50);
    const zipCode       = str(body.zipCode || body.zip_code || body.zip || body.postalCode || body.postal_code || body.postcode, 20);

    // 8. SMS & scheduling
    const rawSms = body.smsOptIn ?? body.sms_opt_in ?? body.smsConsent ?? body.sms_consent ?? body.optIn;
    const smsOptIn = rawSms === true || rawSms === 'true' || rawSms === 1 || rawSms === '1';

    const preferredContactDate       = str(body.preferredContactDate || body.preferred_contact_date || body.contact_date || body.date, 40);
    const preferredContactSlot       = str(body.preferredContactSlot || body.preferred_contact_slot || body.time_slot || body.timeSlot || body.slot, 100);
    const preferredContactCustomTime = str(body.preferredContactCustomTime || body.preferred_contact_custom_time || body.custom_time || body.time, 30);

    // 9. Determine form type
    let formType = body.formType || body.form_type || body.form;
    if (!['contact-form', 'qualify-form'].includes(formType)) {
      formType = rawMessage ? 'contact-form' : (debtAmount ? 'qualify-form' : 'unknown');
    }

    // 10. Build document
    const doc = {
      organization: org._id,
      firstName:    first || undefined,
      lastName:     last || undefined,
      name:         fullName.substring(0, 100),
      smsOptIn,
      formType,
      rawPayload:   body,
    };

    if (rawEmail) doc.email = rawEmail.toLowerCase();
    if (rawPhone) doc.phone = rawPhone.replace(/[\s\-\(\)]/g, '');
    if (debtAmount !== undefined) doc.totalDebtAmount = debtAmount;
    if (rawMessage) doc.message = rawMessage;
    if (streetAddress) doc.streetAddress = streetAddress;
    if (city) doc.city = city;
    if (state) doc.state = state;
    if (zipCode) doc.zipCode = zipCode;
    if (preferredContactDate) doc.preferredContactDate = preferredContactDate;
    if (preferredContactSlot) doc.preferredContactSlot = preferredContactSlot;
    if (preferredContactCustomTime) doc.preferredContactCustomTime = preferredContactCustomTime;

    // 11. Check for duplicate lead by phone number for this organization
    let lead;
    let primaryLead;
    
    if (doc.phone) {
      const existing = await BenWebsiteLead.findOne({
        organization: org._id,
        phone: doc.phone,
      }).sort({ createdAt: -1 });

      const existingPrimaryLead = await Lead.findOne({
        organization: org._id,
        phone: doc.phone,
      }).sort({ createdAt: -1 });

      if (existing) {
        Object.assign(existing, doc);
        
        if (existingPrimaryLead) {
          // Update primary lead notes with new submission message
          existingPrimaryLead.notes = existingPrimaryLead.notes 
            ? existingPrimaryLead.notes + '\n\n' + (doc.message || '') 
            : doc.message;
          if (doc.totalDebtAmount) existingPrimaryLead.totalDebtAmount = doc.totalDebtAmount;
          primaryLead = await existingPrimaryLead.save();
          existing.importedLeadId = primaryLead._id;
        } else {
          // Create standard Lead even if BenWebsiteLead exists but Lead doesn't
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
            sourceId: 'TruClickWebhook',
            category: 'warm',
            qualificationStatus: 'pending',
          };
          primaryLead = await Lead.create(standardLeadData);
          existing.importedLeadId = primaryLead._id;
        }

        lead = await existing.save();
        return res.status(200).json({
          success: true,
          message: 'Submission received and updated.',
          leadId: lead._id,
        });
      }
    }

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
      sourceId: 'TruClickWebhook',
      category: 'warm',
      qualificationStatus: 'pending',
    };
    
    // Create standard Lead in primary collection
    primaryLead = await Lead.create(standardLeadData);
    
    // Link BenWebsiteLead to the standard Lead
    doc.importedLeadId = primaryLead._id;

    // Save new lead to database
    lead = await BenWebsiteLead.create(doc);

    // 12. Real-time notification
    if (req.io) {
      req.io.emit('newBenWebsiteLead', {
        _id:              lead._id,
        name:             lead.name,
        formType,
        organizationId:   String(lead.organization),
        organizationName: org.name,
        createdAt:        lead.createdAt,
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

module.exports = router;

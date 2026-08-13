'use strict';
const express          = require('express');
const DomWebsiteLead   = require('../models/DomWebsiteLead');
const DomNotification  = require('../models/DomNotification');
const DomUser          = require('../models/DomUser');
const apiKeyAuth       = require('../middleware/apiKeyAuth');
const { validateIntakeLead } = require('../middleware/validate');

const router = express.Router();

/**
 * POST /domestic-api/intake/lead
 * Called by mycashbridge website backend with x-api-key header.
 * Creates a DomWebsiteLead + DomNotification for every active domagent,
 * then emits socket event `new_website_lead` to all connected agents.
 */
router.post('/lead', apiKeyAuth, validateIntakeLead, async (req, res) => {
  // Always respond quickly  socket processing is async
  try {
    const data = req.leadData;

    // 5-minute dedup: same mobile number within 5 min  accept silently
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const existing = await DomWebsiteLead.findOne(
      { mobile: data.mobile, createdAt: { $gte: fiveMinsAgo } },
      { _id: 1 }
    ).lean();

    if (existing) {
      return res.status(200).json({ ok: true, note: 'duplicate' });
    }

    // Create the website lead
    const lead = await DomWebsiteLead.create({
      name:          data.name,
      mobile:        data.mobile,
      city:          data.city,
      monthlyIncome: data.monthlyIncome,
      employment:    data.employment,
      productType:   data.productType,
      pan:           data.pan,
      sourcePage:    data.sourcePage,
      utmSource:     data.utmSource,
      utmMedium:     data.utmMedium,
      utmCampaign:   data.utmCampaign,
      ip:            data.ip,
      status:        'new',
    });

    // Create a notification for every active domagent
    const agents = await DomUser.find({ role: 'domagent', isActive: true }, { _id: 1 }).lean();

    if (agents.length > 0) {
      const notifications = agents.map((a) => ({
        websiteLead:      lead._id,
        agent:            a._id,
        leadName:         data.name,
        leadMobile:       data.mobile,
        leadProductType:  data.productType,
      }));
      await DomNotification.insertMany(notifications, { ordered: false });
    }

    // Emit socket event to all connected agents
    const io = req.app.get('io');
    if (io) {
      io.to('domagents').emit('new_website_lead', {
        leadId:      lead._id,
        name:        data.name,
        mobile:      data.mobile,
        productType: data.productType,
        city:        data.city,
        createdAt:   lead.createdAt,
      });
    }

    return res.status(200).json({ ok: true, leadId: lead._id });
  } catch (err) {
    console.error('[Intake] Error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to process lead.' });
  }
});

module.exports = router;


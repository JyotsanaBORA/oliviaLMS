'use strict';
const express         = require('express');
const DomWebsiteLead  = require('../models/DomWebsiteLead');
const DomNotification = require('../models/DomNotification');
const DomLead         = require('../models/DomLead');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// ── GET /domestic-api/website-leads ────────────────────────────────────────
// Admin/superadmin: all website leads with filters and pagination
router.get('/', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const skip   = (page - 1) * limit;
    const status = req.query.status;
    const search = (req.query.search || '').trim();

    const filter = {};
    if (status && ['new', 'loaded', 'completed', 'rejected'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name:   { $regex: search, $options: 'i' } },
        { mobile: { $regex: search, $options: 'i' } },
        { city:   { $regex: search, $options: 'i' } },
      ];
    }

    const [leads, total] = await Promise.all([
      DomWebsiteLead.find(filter)
        .populate('loadedBy', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DomWebsiteLead.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[WebsiteLeads] GET error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch website leads.' });
  }
});

// ── POST /domestic-api/website-leads/:id/load ──────────────────────────────
// Domagent claims a website lead.
// - Only works if status === 'new' (first-come first-served)
// - Sets loadedBy, status = loaded
// - Deletes ALL notifications for this lead (removes popup for all agents)
// - Emits socket `lead_loaded` to all agents
router.post('/:id/load', protect, authorize('domagent', 'dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    // Atomic update — only update if status is still 'new'
    const lead = await DomWebsiteLead.findOneAndUpdate(
      { _id: req.params.id, status: 'new' },
      {
        status:   'loaded',
        loadedBy: req.user._id,
        loadedAt: new Date(),
      },
      { new: true }
    ).lean();

    if (!lead) {
      // Either doesn't exist or was already loaded by someone else
      const existing = await DomWebsiteLead.findById(req.params.id).lean();
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Website lead not found.' });
      }
      return res.status(409).json({
        success: false,
        message: 'This lead has already been loaded by another agent.',
        loadedBy: existing.loadedBy,
      });
    }

    // Delete notifications for this lead for ALL agents
    await DomNotification.deleteMany({ websiteLead: req.params.id });

    // Emit socket — all agents remove this card from their notification panel
    const io = req.app.get('io');
    if (io) {
      io.to('domagents').emit('lead_loaded', { leadId: req.params.id });
    }

    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    console.error('[WebsiteLeads] Load error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to load lead.' });
  }
});

// ── GET /domestic-api/website-leads/my ─────────────────────────────────────
// Domagent: their own loaded leads (the "My Leads" list)
// Returns DomWebsiteLeads loaded by this agent + whether a DomLead exists
router.get('/my', protect, authorize('domagent', 'dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const agentId = req.user._id;

    const leads = await DomWebsiteLead.find({ loadedBy: agentId })
      .sort({ loadedAt: -1 })
      .lean();

    // Find all DomLeads created by this agent — include full doc so documents
    // array is available when the modal opens without a second fetch.
    const domLeads = await DomLead.find({ assignedTo: agentId, sourceWebsiteLead: { $ne: null } }).lean();
    const workedMap = {};
    domLeads.forEach((dl) => {
      if (dl.sourceWebsiteLead) workedMap[dl.sourceWebsiteLead.toString()] = dl;
    });

    const websiteLeadData = leads.map((l) => {
      const worked = workedMap[l._id.toString()];
      return {
        ...l,
        isWorked:  !!worked,
        domLead:   worked || null,
        cardColor: worked ? 'blue' : 'red',
      };
    });

    // Also fetch manual DomLeads (no website lead) created by this agent
    const manualDomLeads = await DomLead.find({ assignedTo: agentId, isManual: true })
      .sort({ createdAt: -1 })
      .lean();

    const manualData = manualDomLeads.map((dl) => ({
      _id:         dl._id,
      name:        dl.name,
      mobile:      dl.mobile,
      city:        dl.city,
      productType: dl.productType,
      createdAt:   dl.createdAt,
      loadedAt:    dl.createdAt,
      isWorked:    true,
      isManual:    true,
      domLead:     dl,
      cardColor:   'blue',
    }));

    const data = [...websiteLeadData, ...manualData];

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[WebsiteLeads] My leads error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch your leads.' });
  }
});

// ── PATCH /domestic-api/website-leads/:id/status ───────────────────────────
// Admin: manually update status (e.g. reject)
router.patch('/:id/status', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'loaded', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const lead = await DomWebsiteLead.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Website lead not found.' });
    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    console.error('[WebsiteLeads] Status update error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
});

module.exports = router;

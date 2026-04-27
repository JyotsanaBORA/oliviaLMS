const express = require('express');
const WebsiteLead = require('../models/WebsiteLead');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Helper — verify caller is Reddington admin or superadmin
const isReddingtonAdminOrSuper = async (user) => {
  if (user.role === 'superadmin') return true;
  if (user.role !== 'admin' || !user.organization) return false;
  try {
    const org = await Organization.findById(user.organization).lean();
    return !!(org && org.name === 'REDDINGTON GLOBAL CONSULTANCY');
  } catch { return false; }
};

// ---------------------------------------------------------------------------
// GET /api/website-leads
// Returns paginated website leads with optional status / search filters
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
  try {
    if (!(await isReddingtonAdminOrSuper(req.user))) {
      return res.status(403).json({ success: false, message: 'Access restricted to Reddington admin.' });
    }

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const skip   = (page - 1) * limit;
    const status = req.query.status; // 'new' | 'reviewed' | 'imported' | 'rejected'
    const search = (req.query.search || '').trim();

    const filter = {};
    if (status && ['new', 'reviewed', 'imported', 'rejected'].includes(status)) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const [leads, total] = await Promise.all([
      WebsiteLead.find(filter)
        .populate('organization', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      WebsiteLead.countDocuments(filter),
    ]);

    // Summary counts
    const counts = await WebsiteLead.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const summary = { new: 0, reviewed: 0, imported: 0, rejected: 0, total: 0 };
    counts.forEach(({ _id, count }) => {
      if (_id in summary) summary[_id] = count;
      summary.total += count;
    });

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary,
    });
  } catch (error) {
    console.error('Get website leads error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching website leads.' });
  }
});

// ---------------------------------------------------------------------------
// PATCH /api/website-leads/:id/status
// Update status (reviewed / rejected)
// ---------------------------------------------------------------------------
router.patch('/:id/status', protect, async (req, res) => {
  try {
    if (!(await isReddingtonAdminOrSuper(req.user))) {
      return res.status(403).json({ success: false, message: 'Access restricted to Reddington admin.' });
    }

    const { status } = req.body;
    if (!['reviewed', 'rejected', 'new'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const lead = await WebsiteLead.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Website lead not found.' });
    return res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Update website lead status error:', error);
    return res.status(500).json({ success: false, message: 'Error updating status.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/website-leads/:id/import
// Import a website lead into the main Lead collection
// ---------------------------------------------------------------------------
router.post('/:id/import', protect, async (req, res) => {
  try {
    if (!(await isReddingtonAdminOrSuper(req.user))) {
      return res.status(403).json({ success: false, message: 'Access restricted to Reddington admin.' });
    }

    const websiteLead = await WebsiteLead.findById(req.params.id);
    if (!websiteLead) {
      return res.status(404).json({ success: false, message: 'Website lead not found.' });
    }
    if (websiteLead.status === 'imported') {
      return res.status(400).json({ success: false, message: 'This lead has already been imported.' });
    }

    // Build the notes string
    const notesParts = [];
    const formLabel = websiteLead.formType === 'contact-form'
      ? '[Website – Contact Form]'
      : '[Website – Qualify Form]';
    notesParts.push(formLabel);
    if (websiteLead.message) notesParts.push(`Message: ${websiteLead.message}`);
    notesParts.push(`SMS Opt-In: ${websiteLead.smsOptIn ? 'YES' : 'NO'}`);

    const leadData = {
      name: websiteLead.name || 'Website Lead',
      organization: websiteLead.organization,
      notes: notesParts.join('\n'),
      createdBy: req.user._id,
    };

    if (websiteLead.email)           leadData.email           = websiteLead.email;
    if (websiteLead.phone)           leadData.phone           = websiteLead.phone;
    if (websiteLead.streetAddress)   leadData.address         = websiteLead.streetAddress;
    if (websiteLead.city)            leadData.city            = websiteLead.city;
    if (websiteLead.state)           leadData.state           = websiteLead.state;
    if (websiteLead.zipCode)         leadData.zipcode         = websiteLead.zipCode;
    if (websiteLead.totalDebtAmount) leadData.totalDebtAmount = websiteLead.totalDebtAmount;

    const importedLead = await Lead.create(leadData);

    // Mark website lead as imported
    websiteLead.status = 'imported';
    websiteLead.importedLeadId = importedLead._id;
    await websiteLead.save();

    return res.status(201).json({
      success: true,
      message: 'Lead imported successfully.',
      data: { importedLeadId: importedLead._id, leadId: importedLead.leadId },
    });
  } catch (error) {
    console.error('Import website lead error:', error);
    return res.status(500).json({ success: false, message: 'Error importing lead.' });
  }
});

module.exports = router;

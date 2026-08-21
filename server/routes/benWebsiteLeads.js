/**
 * Ben Website Leads routes — /api/ben-website-leads
 *
 * Access rules:
 *   READ  → any admin (org-scoped for non-Reddington orgs)
 *   WRITE → Reddington admin or superadmin only
 */

const express = require('express');
const mongoose = require('mongoose');
const BenWebsiteLead = require('../models/BenWebsiteLead');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const { protect } = require('../middleware/auth');

const router = express.Router();

const MAIN_ORG = (process.env.MAIN_ORG_NAME || 'REDDINGTON GLOBAL CONSULTANCY').trim().toUpperCase();

// Returns { allowed, canWrite, orgFilter }
const getAccess = async (user) => {
  if (!user) return { allowed: false };
  if (user.role === 'superadmin') return { allowed: true, canWrite: true, orgFilter: null };
  if (user.role !== 'admin') return { allowed: false };
  try {
    const orgId = user.organization?._id || user.organization;
    if (!orgId) return { allowed: false };
    const org = await Organization.findById(orgId).lean();
    if (!org) return { allowed: false };
    const orgName = (org.name || '').trim().toUpperCase();
    const isMain = orgName === MAIN_ORG || orgName.includes('REDDINGTON');
    return { allowed: true, canWrite: isMain, orgFilter: isMain ? null : org._id };
  } catch { return { allowed: false }; }
};

// GET /api/ben-website-leads
router.get('/', protect, async (req, res) => {
  try {
    const access = await getAccess(req.user);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Access denied.' });

    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(100, parseInt(req.query.limit) || 50);
    const skip   = (page - 1) * limit;
    const status = req.query.status;
    const search = (req.query.search || '').trim();

    const filter = {};
    if (access.orgFilter) {
      filter.organization = access.orgFilter;
    } else if (req.query.organizationId) {
      if (mongoose.isValidObjectId(req.query.organizationId)) {
        filter.organization = new mongoose.Types.ObjectId(req.query.organizationId);
      }
    } else if (req.query.orgName) {
      const term = req.query.orgName.trim();
      const matchOrgs = await Organization.find({
        $or: [
          { name: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },
          { website: { $regex: term, $options: 'i' } },
          ...(term.toLowerCase() === 'ben' ? [{ name: { $regex: 'intro', $options: 'i' } }] : [])
        ]
      }).select('_id').lean();
      if (matchOrgs.length > 0) {
        filter.organization = { $in: matchOrgs.map(o => o._id) };
      } else {
        filter.organization = new mongoose.Types.ObjectId();
      }
    }

    if (status && ['new', 'reviewed', 'imported', 'rejected'].includes(status)) filter.status = status;
    if (search) {
      filter.$or = [
        { name:  { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } },
      ];
    }

    const [leads, total, orgs] = await Promise.all([
      BenWebsiteLead.find(filter).populate('organization', 'name').sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      BenWebsiteLead.countDocuments(filter),
      !access.orgFilter ? Organization.find({ isActive: true }).select('name email website').sort({ name: 1 }).lean() : Promise.resolve([]),
    ]);

    const summaryFilter = {};
    if (filter.organization) {
      if (filter.organization.$in) {
        summaryFilter.organization = {
          $in: filter.organization.$in.map(id => mongoose.isValidObjectId(id) ? new mongoose.Types.ObjectId(id) : id)
        };
      } else if (mongoose.isValidObjectId(filter.organization)) {
        summaryFilter.organization = new mongoose.Types.ObjectId(filter.organization);
      } else {
        summaryFilter.organization = filter.organization;
      }
    }
    if (filter.$or) {
      summaryFilter.$or = filter.$or;
    }

    const counts = await BenWebsiteLead.aggregate([
      { $match: summaryFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const summary = { new: 0, reviewed: 0, imported: 0, rejected: 0, total: 0 };
    counts.forEach(({ _id, count }) => { if (_id in summary) summary[_id] = count; summary.total += count; });

    return res.status(200).json({
      success: true, data: leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary,
      organizations: orgs,
      canWrite: access.canWrite,
    });
  } catch (err) {
    console.error('Get ben-website-leads error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching leads.' });
  }
});

// PATCH /api/ben-website-leads/:id/status  (write — Reddington only)
router.patch('/:id/status', protect, async (req, res) => {
  try {
    const access = await getAccess(req.user);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Access denied.' });
    if (!access.canWrite) return res.status(403).json({ success: false, message: 'Read-only access.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    const { status } = req.body;
    if (!['reviewed', 'rejected', 'new'].includes(status))
      return res.status(400).json({ success: false, message: 'Invalid status value.' });

    const lead = await BenWebsiteLead.findByIdAndUpdate(req.params.id, { status }, { new: true, runValidators: true }).lean();
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    console.error('Update ben-website-lead status error:', err);
    return res.status(500).json({ success: false, message: 'Error updating status.' });
  }
});

// POST /api/ben-website-leads/:id/import  (write — Reddington only)
router.post('/:id/import', protect, async (req, res) => {
  try {
    const access = await getAccess(req.user);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Access denied.' });
    if (!access.canWrite) return res.status(403).json({ success: false, message: 'Read-only access.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    const webLead = await BenWebsiteLead.findById(req.params.id);
    if (!webLead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (webLead.status === 'imported') return res.status(400).json({ success: false, message: 'Already imported.' });

    const notesParts = [];
    const formLabel = webLead.formType === 'contact-form' ? '[Ben Website – Contact Form]' : '[Ben Website – Qualify Form]';
    notesParts.push(formLabel);
    if (webLead.message) notesParts.push(`Message: ${webLead.message}`);
    notesParts.push(`SMS Opt-In: ${webLead.smsOptIn ? 'YES' : 'NO'}`);

    const leadData = {
      name: webLead.name || 'Ben Website Lead',
      organization: webLead.organization,
      notes: notesParts.join('\n'),
      createdBy: req.user._id,
    };

    if (webLead.email) {
      const sanitized = webLead.email.replace(/(\.\w{2,3})\w+$/, '$1');
      if (/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(sanitized)) leadData.email = sanitized;
    }
    if (webLead.phone)           leadData.phone           = webLead.phone;
    if (webLead.streetAddress)   leadData.address         = webLead.streetAddress;
    if (webLead.city)            leadData.city            = webLead.city;
    if (webLead.state)           leadData.state           = webLead.state;
    if (webLead.zipCode)         leadData.zipcode         = webLead.zipCode;
    if (webLead.totalDebtAmount) leadData.totalDebtAmount = webLead.totalDebtAmount;

    const imported = await Lead.create(leadData);
    webLead.status = 'imported';
    webLead.importedLeadId = imported._id;
    await webLead.save();

    return res.status(201).json({ success: true, message: 'Lead imported.', data: { importedLeadId: imported._id, leadId: imported.leadId } });
  } catch (err) {
    console.error('Import ben-website-lead error:', err);
    return res.status(500).json({ success: false, message: 'Error importing lead.' });
  }
});

// GET /api/ben-website-leads/:id
router.get('/:id', protect, async (req, res) => {
  try {
    const access = await getAccess(req.user);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Access denied.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    const lead = await BenWebsiteLead.findById(req.params.id).populate('organization', 'name').lean();
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    if (access.orgFilter && String(lead.organization?._id || lead.organization) !== String(access.orgFilter))
      return res.status(403).json({ success: false, message: 'Access denied to this lead.' });

    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    console.error('Get ben-website-lead detail error:', err);
    return res.status(500).json({ success: false, message: 'Error fetching lead.' });
  }
});

// POST /api/ben-website-leads/:id/comments  (write — Reddington only)
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const access = await getAccess(req.user);
    if (!access.allowed) return res.status(403).json({ success: false, message: 'Access denied.' });
    if (!access.canWrite) return res.status(403).json({ success: false, message: 'Read-only access.' });
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: 'Invalid ID.' });

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ success: false, message: 'Comment text is required.' });
    if (text.length > 1000) return res.status(400).json({ success: false, message: 'Comment must be 1000 characters or fewer.' });

    const newComment = { text, authorId: req.user._id, authorName: req.user.name || req.user.email || 'Staff', createdAt: new Date() };
    const lead = await BenWebsiteLead.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: newComment } },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    const saved = lead.comments[lead.comments.length - 1];
    return res.status(201).json({ success: true, data: saved });
  } catch (err) {
    console.error('Add ben-website-lead comment error:', err);
    return res.status(500).json({ success: false, message: 'Error adding comment.' });
  }
});

module.exports = router;

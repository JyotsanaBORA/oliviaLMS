const express = require('express');
const WebsiteLead = require('../models/WebsiteLead');
const Lead = require('../models/Lead');
const Organization = require('../models/Organization');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ---------------------------------------------------------------------------
// Access control helper
// Returns { allowed: false }
//      OR { allowed: true, canWrite: bool, orgFilter: ObjectId|null }
//
// canWrite=true  → Reddington admin or superadmin (full read + write)
// canWrite=false → any other org admin (read-only, scoped to their org)
// orgFilter=null → no restriction (see all orgs)
// orgFilter=<id> → restrict to that org's leads only
// ---------------------------------------------------------------------------
const getWebsiteLeadsAccess = async (user) => {
  if (!user) return { allowed: false };
  if (user.role === 'superadmin') return { allowed: true, canWrite: true, orgFilter: null };
  if (user.role !== 'admin') return { allowed: false };
  try {
    const orgId = user.organization?._id || user.organization;
    if (!orgId) return { allowed: false };
    const org = await Organization.findById(orgId).lean();
    if (!org) return { allowed: false };
    const isGlobal = (org.name || '').trim().toUpperCase() === 'REDDINGTON GLOBAL CONSULTANCY';
    return {
      allowed: true,
      canWrite: true,
      orgFilter: isGlobal ? null : org._id,
    };
  } catch { return { allowed: false }; }
};

// ---------------------------------------------------------------------------
// GET /api/website-leads
// Returns paginated website leads with optional status / search filters
// ---------------------------------------------------------------------------
router.get('/', protect, async (req, res) => {
  try {
    const access = await getWebsiteLeadsAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(10000, parseInt(req.query.limit) || 50);
    const skip   = (page - 1) * limit;
    const status = req.query.status; // 'new' | 'reviewed' | 'imported' | 'rejected'
    const search = (req.query.search || '').trim();

    const filter = {};
    if (access.orgFilter) {
      filter.organization = access.orgFilter;
    } else if (req.query.organizationId) {
      filter.organization = req.query.organizationId;
    } else if (req.query.orgName) {
      const matchOrgs = await Organization.find({
        name: { $regex: req.query.orgName.trim(), $options: 'i' }
      }).select('_id').lean();
      if (matchOrgs.length > 0) {
        filter.organization = { $in: matchOrgs.map(o => o._id) };
      }
    }
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

    // Deduplicate leads by phone number (keeping the latest submission per phone)
    const pipeline = [
      { $match: filter },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $and: [{ $ne: ['$phone', null] }, { $ne: ['$phone', ''] }] },
              '$phone',
              '$_id'
            ]
          },
          doc: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { createdAt: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }]
        }
      }
    ];

    const [facetResult] = await Promise.all([
      WebsiteLead.aggregate(pipeline)
    ]);

    const leads = facetResult[0]?.data || [];
    const total = facetResult[0]?.totalCount[0]?.count || 0;

    await WebsiteLead.populate(leads, { path: 'organization', select: 'name' });

    // Summary counts based on deduplicated unique leads
    const summaryFilter = {};
    if (filter.organization) summaryFilter.organization = filter.organization;
    if (filter.$or) summaryFilter.$or = filter.$or;

    const summaryCounts = await WebsiteLead.aggregate([
      { $match: summaryFilter },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $and: [{ $ne: ['$phone', null] }, { $ne: ['$phone', ''] }] },
              '$phone',
              '$_id'
            ]
          },
          status: { $first: '$status' }
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const summary = { new: 0, reviewed: 0, imported: 0, rejected: 0, total: 0 };
    summaryCounts.forEach(({ _id, count }) => {
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
    const access = await getWebsiteLeadsAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { status } = req.body;
    if (!['reviewed', 'rejected', 'new'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const leadQuery = { _id: req.params.id };
    if (access.orgFilter) leadQuery.organization = access.orgFilter;

    const lead = await WebsiteLead.findOneAndUpdate(
      leadQuery,
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
    const access = await getWebsiteLeadsAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const leadQuery = { _id: req.params.id };
    if (access.orgFilter) leadQuery.organization = access.orgFilter;

    const websiteLead = await WebsiteLead.findOne(leadQuery);
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

    if (websiteLead.email) {
      // Sanitize email: trim the TLD to 2-3 chars if a typo made it longer (e.g. ".comhu" → ".com")
      const sanitizedEmail = websiteLead.email.replace(/(\.\w{2,3})\w+$/, '$1');
      const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
      if (emailRegex.test(sanitizedEmail)) {
        leadData.email = sanitizedEmail;
      }
      // If still invalid after sanitization, skip email rather than failing the import
    }
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

// ---------------------------------------------------------------------------
// GET /api/website-leads/:id
// Returns a single website lead (used to refresh detail pane with latest comments)
// ---------------------------------------------------------------------------
router.get('/:id', protect, async (req, res) => {
  try {
    const access = await getWebsiteLeadsAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!req.params.id.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID.' });
    }

    const leadQuery = { _id: req.params.id };
    if (access.orgFilter) leadQuery.organization = access.orgFilter;

    const lead = await WebsiteLead.findOne(leadQuery)
      .populate('organization', 'name')
      .lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Website lead not found.' });
    return res.status(200).json({ success: true, data: lead });
  } catch (error) {
    console.error('Get website lead detail error:', error);
    return res.status(500).json({ success: false, message: 'Error fetching lead.' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/website-leads/:id/comments
// Add a comment to a website lead
// ---------------------------------------------------------------------------
router.post('/:id/comments', protect, async (req, res) => {
  try {
    const access = await getWebsiteLeadsAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    if (!req.params.id.match(/^[a-f\d]{24}$/i)) {
      return res.status(400).json({ success: false, message: 'Invalid lead ID.' });
    }

    const text = (req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ success: false, message: 'Comment must be 1000 characters or fewer.' });
    }

    const newComment = {
      text,
      authorId:   req.user._id,
      authorName: req.user.name || req.user.email || 'Staff',
      createdAt:  new Date(),
    };

    const leadQuery = { _id: req.params.id };
    if (access.orgFilter) leadQuery.organization = access.orgFilter;

    const lead = await WebsiteLead.findOneAndUpdate(
      leadQuery,
      { $push: { comments: newComment } },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Website lead not found.' });

    const savedComment = lead.comments[lead.comments.length - 1];
    return res.status(201).json({ success: true, data: savedComment });
  } catch (error) {
    console.error('Add website lead comment error:', error);
    return res.status(500).json({ success: false, message: 'Error adding comment.' });
  }
});

module.exports = router;

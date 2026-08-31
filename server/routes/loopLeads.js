'use strict';

/**
 * Loop Leads API
 * --------------
 * Returns paginated leads from the `loop` MongoDB collection.
 *
 * Access rules:
 *   • superadmin  — always has access (all leads)
 *   • admin       — only when their organisation has showLoopLeads === true
 *
 * Endpoints:
 *   GET  /api/loop-leads         — paginated list with search / status filter
 *   PATCH /api/loop-leads/:id/status — update a single lead's status
 */

const express       = require('express');
const LoopLead      = require('../models/LoopLead');
const Organization  = require('../models/Organization');
const { protect }   = require('../middleware/auth');

const router = express.Router();

// ── Access guard ─────────────────────────────────────────────────────────────
// Returns true if the requesting user may view loop leads.
async function canViewLoopLeads(user) {
  const MAIN_ORG_ID = '68b9c76d2c29dac1220cb81c';
  if (user.role === 'superadmin') return true;
  if (user.role !== 'admin' || !user.organization) return false;
  // Explicit flag is the most reliable source for main-org access.
  if (user.isMainOrgAdmin === true) return true;
  try {
    const org = await Organization.findById(user.organization).lean();
    const orgName = (org?.name || '').trim().toUpperCase();
    const isMainOrgByName = orgName === 'REDDINGTON GLOBAL CONSULTANCY';
    const isMainOrgById = String(org?._id || '') === MAIN_ORG_ID;
    return !!(org && (org.showLoopLeads === true || isMainOrgByName || isMainOrgById));
  } catch {
    return false;
  }
}

// Returns true only for main-organization admins (or superadmin) who are allowed to comment.
async function canCommentOnLoopLeads(user) {
  const MAIN_ORG_ID = '68b9c76d2c29dac1220cb81c';
  if (user.role === 'superadmin') return true;
  if (user.role !== 'admin' || !user.organization) return false;
  if (user.isMainOrgAdmin === true) return true;
  try {
    const org = await Organization.findById(user.organization).lean();
    const orgName = (org?.name || '').trim().toUpperCase();
    const isMainOrgByName = orgName === 'REDDINGTON GLOBAL CONSULTANCY';
    const isMainOrgById = String(org?._id || '') === MAIN_ORG_ID;
    return !!(org && (isMainOrgByName || isMainOrgById));
  } catch {
    return false;
  }
}

// ── GET /api/loop-leads ───────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    if (!(await canViewLoopLeads(req.user))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const page       = Math.max(1, parseInt(req.query.page, 10)  || 1);
    const limit      = Math.min(200, parseInt(req.query.limit, 10) || 25);
    const skip       = (page - 1) * limit;
    const status     = req.query.status;
    const search     = (req.query.search || '').trim();
    const dateFilter = req.query.dateFilter; // 'today' | '7days' | '30days' | 'custom'
    const startDate  = req.query.startDate;
    const endDate    = req.query.endDate;

    const filter = {};

    if (status && ['new', 'reviewed', 'imported'].includes(status)) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [
        { firstname: { $regex: search, $options: 'i' } },
        { lastname:  { $regex: search, $options: 'i' } },
        { email:     { $regex: search, $options: 'i' } },
        { phone:     { $regex: search, $options: 'i' } },
        { city:      { $regex: search, $options: 'i' } },
        { state:     { $regex: search, $options: 'i' } },
      ];
    }

    // ── Date filtering ──────────────────────────────────────────────────────
    if (dateFilter && dateFilter !== 'all') {
      const now = new Date();
      // Work in UTC, leads stored with receivedAt in UTC
      if (dateFilter === 'today') {
        const startOfDay = new Date(now);
        startOfDay.setUTCHours(0, 0, 0, 0);
        filter.receivedAt = { $gte: startOfDay };
      } else if (dateFilter === '7days') {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - 7);
        d.setUTCHours(0, 0, 0, 0);
        filter.receivedAt = { $gte: d };
      } else if (dateFilter === '30days') {
        const d = new Date(now);
        d.setUTCDate(d.getUTCDate() - 30);
        d.setUTCHours(0, 0, 0, 0);
        filter.receivedAt = { $gte: d };
      } else if (dateFilter === 'custom' && startDate && endDate) {
        const start = new Date(startDate);
        start.setUTCHours(0, 0, 0, 0);
        const end = new Date(endDate);
        end.setUTCHours(23, 59, 59, 999);
        filter.receivedAt = { $gte: start, $lte: end };
      }
    }

    // Deduplicate leads by phone number (keeping latest submission per phone)
    const pipeline = [
      { $match: filter },
      { $sort: { receivedAt: -1 } },
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
      { $sort: { receivedAt: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          totalCount: [{ $count: 'count' }]
        }
      }
    ];

    const [facetResult] = await Promise.all([
      LoopLead.aggregate(pipeline)
    ]);

    const leads = facetResult[0]?.data || [];
    const total = facetResult[0]?.totalCount[0]?.count || 0;

    // Summary counts based on deduplicated unique leads
    const summaryFilter = {};
    if (filter.$or) summaryFilter.$or = filter.$or;
    if (filter.receivedAt) summaryFilter.receivedAt = filter.receivedAt;

    const statusCounts = await LoopLead.aggregate([
      { $match: summaryFilter },
      { $sort: { receivedAt: -1 } },
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

    // Build summary { new: N, reviewed: N, imported: N, total: N }
    const summary = { new: 0, reviewed: 0, imported: 0, total: 0 };
    for (const { _id, count } of statusCounts) {
      if (_id in summary) summary[_id] = count;
      summary.total += count;
    }

    return res.json({
      success: true,
      data: leads,
      summary,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('[loop-leads] GET error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── GET /api/loop-leads/:id ─────────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    if (!(await canViewLoopLeads(req.user))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const lead = await LoopLead.findById(req.params.id).lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Loop lead not found.' });
    }

    return res.json({ success: true, data: lead });
  } catch (err) {
    console.error('[loop-leads] GET by id error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── POST /api/loop-leads/:id/comments ───────────────────────────────────────
router.post('/:id/comments', protect, async (req, res) => {
  try {
    if (!(await canCommentOnLoopLeads(req.user))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const text = (req.body.text || '').trim();
    if (!text) {
      return res.status(400).json({ success: false, message: 'Comment text is required.' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ success: false, message: 'Comment must be 1000 characters or fewer.' });
    }

    const comment = {
      text,
      authorId: req.user._id,
      authorName: req.user.name || req.user.email || 'Staff',
      createdAt: new Date(),
    };

    const lead = await LoopLead.findByIdAndUpdate(
      req.params.id,
      { $push: { comments: comment } },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Loop lead not found.' });
    }

    const savedComment = lead.comments[lead.comments.length - 1];
    return res.status(201).json({ success: true, data: savedComment });
  } catch (err) {
    console.error('[loop-leads] POST comment error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

// ── PATCH /api/loop-leads/:id/status ─────────────────────────────────────────
router.patch('/:id/status', protect, async (req, res) => {
  try {
    if (!(await canViewLoopLeads(req.user))) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const { status } = req.body;
    if (!['new', 'reviewed', 'imported'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status value.' });
    }

    const lead = await LoopLead.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) {
      return res.status(404).json({ success: false, message: 'Loop lead not found.' });
    }

    return res.json({ success: true, data: lead });
  } catch (err) {
    console.error('[loop-leads] PATCH status error:', err);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;

/**
 * Affiliate Admin Dashboard routes
 *
 * All routes require JWT auth + role affiliate_admin OR superadmin.
 * Data is scoped to GTIOB campaign — pulls from both:
 *   1. leads collection (disposed/submitted leads with vicidialCampaignName)
 *   2. vicidialcalls collection (all calls including pending ones)
 * No cross-org data or internal LMS data is exposed.
 */
const express = require('express');
const { query } = require('express-validator');
const Lead = require('../models/Lead');
const VicidialCall = require('../models/VicidialCall');
const { protect, authorize } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');
const { formatEasternTime } = require('../utils/timeFilters');

const router = express.Router();

// Campaign values that belong to this affiliate's scope.
const AFFILIATE_CAMPAIGNS = ['GTIOB', 'GtiOB', 'Gti_OB'];

/**
 * Build a MongoDB $in filter for the affiliate campaign names (case-insensitive).
 */
const buildCampaignFilter = (field = 'vicidialCampaignName') => ({
  [field]: {
    $in: AFFILIATE_CAMPAIGNS.map(
      (c) => new RegExp(`^${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
    ),
  },
});

/**
 * Build a date filter on createdAt from YYYY-MM-DD query params.
 */
const buildDateFilter = (startDate, endDate) => {
  const filter = {};
  if (startDate) filter.$gte = new Date(startDate + 'T00:00:00Z');
  if (endDate)   filter.$lte = new Date(endDate   + 'T23:59:59.999Z');
  return Object.keys(filter).length ? { createdAt: filter } : {};
};

// ─── Shared populate config ───────────────────────────────────────────────────
const POPULATE_OPTS = [
  { path: 'createdBy', select: 'name' },    // Agent 1
  { path: 'updatedBy', select: 'name' },    // Agent 2 — most recent updater
  { path: 'assignedTo', select: 'name' },   // Agent 2 assigned
];

// ─── Projection — only the 8 columns the affiliate dashboard shows ────────────
const PROJECTION = {
  createdAt: 1,
  totalDebtAmount: 1,
  phone: 1,
  name: 1,
  draftDate: 1,
  creditScore: 1,
  leadProgressStatus: 1,
  createdBy: 1,
  updatedBy: 1,
  assignedTo: 1,
  vicidialCampaignName: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/affiliate/leads
// Returns paginated affiliate campaign data from BOTH leads and vicidialcalls.
// Leads that were submitted by agents come from the leads collection.
// Calls still pending (not yet submitted) come from vicidialcalls collection.
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/leads',
  protect,
  authorize('affiliate_admin', 'superadmin'),
  [
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('limit must be 1-500'),
    query('startDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('startDate must be YYYY-MM-DD'),
    query('endDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('endDate must be YYYY-MM-DD'),
    query('saleOnly').optional().isIn(['true', 'false']).withMessage('saleOnly must be true or false'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const page  = Math.max(1, parseInt(req.query.page)  || 1);
      const limit = Math.min(500, parseInt(req.query.limit) || 100);
      const skip  = (page - 1) * limit;

      // ── 1. Leads collection (submitted/disposed leads) ───────────
      const leadFilter = {
        ...buildCampaignFilter('vicidialCampaignName'),
        ...buildDateFilter(req.query.startDate, req.query.endDate),
      };

      if (req.query.saleOnly === 'true') {
        leadFilter.leadProgressStatus = { $in: ['SALE', 'Sale Long Play', 'Immediate Enrollment'] };
      }

      // ── 2. VicidialCalls collection (all calls including pending) ─
      const callFilter = {
        ...buildCampaignFilter('campaignName'),
      };
      // Date filter on vicidialcalls uses receivedAt
      if (req.query.startDate || req.query.endDate) {
        const df = {};
        if (req.query.startDate) df.$gte = new Date(req.query.startDate + 'T00:00:00Z');
        if (req.query.endDate)   df.$lte = new Date(req.query.endDate   + 'T23:59:59.999Z');
        callFilter.receivedAt = df;
      }

      // If saleOnly, skip vicidial calls (they have no sale status yet)
      const skipVicidialCalls = req.query.saleOnly === 'true';

      // Run both queries in parallel
      const [leads, vicidialCalls] = await Promise.all([
        Lead.find(leadFilter, PROJECTION)
          .populate(POPULATE_OPTS)
          .sort({ createdAt: -1 })
          .lean(),
        skipVicidialCalls ? Promise.resolve([]) :
          VicidialCall.find(callFilter)
            .populate('agent', 'name')
            .sort({ receivedAt: -1 })
            .lean(),
      ]);

      // Build a set of phone numbers already in leads to avoid duplicates
      const leadPhones = new Set(
        leads.map(l => (l.phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean)
      );

      // Transform vicidial calls into the same shape as leads for the dashboard
      const vicidialAsLeads = skipVicidialCalls ? [] : vicidialCalls
        .filter(vc => {
          // Exclude calls that already have a matching lead (by phone number)
          const vcPhone = (vc.phoneNumber || '').replace(/\D/g, '').slice(-10);
          return vcPhone && !leadPhones.has(vcPhone);
        })
        .map(vc => ({
          _id: vc._id,
          _source: 'vicidial',
          createdAt: vc.receivedAt || vc.createdAt,
          name: vc.callerName || [vc.firstName, vc.lastName].filter(Boolean).join(' ') || '—',
          phone: vc.phoneNumber || '',
          totalDebtAmount: null,
          draftDate: null,
          creditScore: null,
          leadProgressStatus: vc.callStatus || vc.queueStatus || 'Pending',
          createdBy: vc.agent ? { name: vc.agent.name } : null,
          updatedBy: null,
          assignedTo: null,
          vicidialCampaignName: vc.campaignName,
        }));

      // Merge: leads first, then vicidial-only calls
      const allRecords = [
        ...leads.map(l => ({ ...l, _source: 'lead' })),
        ...vicidialAsLeads,
      ];

      // Sort by date descending
      allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      const total = allRecords.length;
      const paged = allRecords.slice(skip, skip + limit);

      return res.status(200).json({
        success: true,
        data: {
          leads: paged,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit),
          },
        },
      });
    } catch (err) {
      console.error('[Affiliate] leads fetch error:', err);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/affiliate/leads/export
// Returns a CSV download of all matching data (leads + vicidial calls).
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/leads/export',
  protect,
  authorize('affiliate_admin', 'superadmin'),
  [
    query('startDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('startDate must be YYYY-MM-DD'),
    query('endDate').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('endDate must be YYYY-MM-DD'),
    query('saleOnly').optional().isIn(['true', 'false']).withMessage('saleOnly must be true or false'),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const leadFilter = {
        ...buildCampaignFilter('vicidialCampaignName'),
        ...buildDateFilter(req.query.startDate, req.query.endDate),
      };

      const skipVicidialCalls = req.query.saleOnly === 'true';

      if (req.query.saleOnly === 'true') {
        leadFilter.leadProgressStatus = { $in: ['SALE', 'Sale Long Play', 'Immediate Enrollment'] };
      }

      const callFilter = {
        ...buildCampaignFilter('campaignName'),
      };
      if (req.query.startDate || req.query.endDate) {
        const df = {};
        if (req.query.startDate) df.$gte = new Date(req.query.startDate + 'T00:00:00Z');
        if (req.query.endDate)   df.$lte = new Date(req.query.endDate   + 'T23:59:59.999Z');
        callFilter.receivedAt = df;
      }

      const [leads, vicidialCalls] = await Promise.all([
        Lead.find(leadFilter, PROJECTION)
          .populate(POPULATE_OPTS)
          .sort({ createdAt: -1 })
          .lean(),
        skipVicidialCalls ? Promise.resolve([]) :
          VicidialCall.find(callFilter)
            .populate('agent', 'name')
            .sort({ receivedAt: -1 })
            .lean(),
      ]);

      // Dedup vicidial calls that already have a lead
      const leadPhones = new Set(
        leads.map(l => (l.phone || '').replace(/\D/g, '').slice(-10)).filter(Boolean)
      );
      const vicidialOnly = skipVicidialCalls ? [] : vicidialCalls.filter(vc => {
        const vcPhone = (vc.phoneNumber || '').replace(/\D/g, '').slice(-10);
        return vcPhone && !leadPhones.has(vcPhone);
      });

      // Merge all records
      const allRecords = [
        ...leads.map(l => ({ ...l, _source: 'lead' })),
        ...vicidialOnly.map(vc => ({
          _source: 'vicidial',
          createdAt: vc.receivedAt || vc.createdAt,
          name: vc.callerName || [vc.firstName, vc.lastName].filter(Boolean).join(' ') || '',
          phone: vc.phoneNumber || '',
          totalDebtAmount: null,
          draftDate: null,
          creditScore: null,
          leadProgressStatus: vc.callStatus || vc.queueStatus || 'Pending',
          createdBy: vc.agent ? { name: vc.agent.name } : null,
          updatedBy: null,
          assignedTo: null,
          vicidialCampaignName: vc.campaignName,
        })),
      ];
      allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // ── CSV generation ─────────────────────────────────────────────────────
      const esc = (val) => {
        if (val === null || val === undefined) return '';
        const s = String(val);
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const fmt = (date) => (date ? formatEasternTime(new Date(date)) : '');

      const header = [
        'Lead Created At',
        'Customer Name',
        'Primary Phone',
        'Total Debt Amount',
        'First Draft Date',
        'Credit Score',
        'Lead Progress Status',
        'Agent 1 (Added By)',
        'Agent 2 (Updated By)',
        'Campaign',
      ].join(',');

      const rows = allRecords.map((l) =>
        [
          esc(fmt(l.createdAt)),
          esc(l.name || ''),
          esc(l.phone || ''),
          esc(l.totalDebtAmount != null ? l.totalDebtAmount : ''),
          esc(l.draftDate ? fmt(l.draftDate) : ''),
          esc(l.creditScore != null ? l.creditScore : ''),
          esc(l.leadProgressStatus || ''),
          esc(l.createdBy?.name || ''),
          esc(l.updatedBy?.name || l.assignedTo?.name || ''),
          esc(l.vicidialCampaignName || ''),
        ].join(',')
      );

      const csv = [header, ...rows].join('\n');
      const ts  = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="affiliate_leads_${ts}.csv"`);
      res.setHeader('Cache-Control', 'no-cache');
      return res.status(200).send(csv);
    } catch (err) {
      console.error('[Affiliate] export error:', err);
      return res.status(500).json({ success: false, message: 'Export failed' });
    }
  }
);

module.exports = router;

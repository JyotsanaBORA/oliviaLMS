'use strict';
const express        = require('express');
const DomUser        = require('../models/DomUser');
const DomWebsiteLead = require('../models/DomWebsiteLead');
const DomLead        = require('../models/DomLead');
const DomImportedLead = require('../models/DomImportedLead');
const bcrypt         = require('bcryptjs');
const { protect, authorize, generateToken } = require('../middleware/auth');

const router = express.Router();

// All admin routes require dom_admin or dom_superadmin
router.use(protect, authorize('dom_admin', 'dom_superadmin'));

// ── GET /domestic-api/admin/stats ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    // Use local midnight so "today" is correct for IST/any timezone
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const [
      totalWebsiteLeads,
      newLeads,
      loadedLeads,
      completedLeads,
      rejectedLeads,
      todayLeads,
      todayImported,
      totalDomLeads,
      completedDomLeads,
      pendingDomLeads,
      totalAgents,
      activeAgents,
      assignedWebLeads,
      assignedImportedLeads,
    ] = await Promise.all([
      DomWebsiteLead.countDocuments(),
      DomWebsiteLead.countDocuments({ status: 'new' }),
      DomWebsiteLead.countDocuments({ status: 'loaded' }),
      DomWebsiteLead.countDocuments({ status: 'completed' }),
      DomWebsiteLead.countDocuments({ status: 'rejected' }),
      DomWebsiteLead.countDocuments({ createdAt: { $gte: todayStart } }),
      DomImportedLead.countDocuments({ createdAt: { $gte: todayStart } }),
      DomLead.countDocuments(),
      DomLead.countDocuments({ status: 'completed' }),
      DomLead.countDocuments({ status: 'pending' }),
      DomUser.countDocuments({ role: 'domagent' }),
      DomUser.countDocuments({ role: 'domagent', isActive: true }),
      DomWebsiteLead.countDocuments({ status: 'loaded' }),
      DomImportedLead.countDocuments({ status: 'assigned' }),
    ]);

    const conversionRate = totalWebsiteLeads > 0
      ? ((completedLeads / totalWebsiteLeads) * 100).toFixed(1)
      : '0.0';

    return res.status(200).json({
      success: true,
      stats: {
        websiteLeads: {
          total:     totalWebsiteLeads,
          new:       newLeads,
          loaded:    loadedLeads,
          completed: completedLeads,
          rejected:  rejectedLeads,
          today:     todayLeads,
        },
        domLeads: {
          total:     totalDomLeads,
          completed: completedDomLeads,
          pending:   pendingDomLeads,
        },
        assigned: {
          websiteLeads:   assignedWebLeads,
          importedLeads:  assignedImportedLeads,
          total:          assignedWebLeads + assignedImportedLeads,
        },
        todayImported,
        agents: {
          total:  totalAgents,
          active: activeAgents,
        },
        conversionRate,
      },
    });
  } catch (err) {
    console.error('[Admin] Stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats.' });
  }
});

// ── GET /domestic-api/admin/agents ─────────────────────────────────────────
// Agent performance table — supports optional dateFrom/dateTo for disposition stats
router.get('/agents', async (req, res) => {
  try {
    const agents = await DomUser.find({ role: 'domagent' })
      .select('name email isActive lastLogin createdAt agentStatus agentStatusUpdatedAt')
      .lean();

    // Counts per agent
    const agentIds = agents.map((a) => a._id);

    // ── Optional date range for disposition stats ─────────────────────────
    // Builds a { field: { $gte, $lte } } object; returns {} when no dates given
    const buildDateCond = (field) => {
      if (!req.query.dateFrom && !req.query.dateTo) return {};
      const cond = {};
      if (req.query.dateFrom) { const [y,m,d] = req.query.dateFrom.split('-').map(Number); cond.$gte = new Date(y,m-1,d,0,0,0,0); }
      if (req.query.dateTo)   { const [y,m,d] = req.query.dateTo.split('-').map(Number);   cond.$lte = new Date(y,m-1,d,23,59,59,999); }
      return { [field]: cond };
    };

    const [loadedCounts, completedCounts, domLeadCounts, poolCounts, interestedCounts, callbackCounts] = await Promise.all([
      DomWebsiteLead.aggregate([
        { $match: { loadedBy: { $in: agentIds }, ...buildDateCond('loadedAt') } },
        { $group: { _id: '$loadedBy', count: { $sum: 1 } } },
      ]),
      DomWebsiteLead.aggregate([
        { $match: { loadedBy: { $in: agentIds }, status: 'completed', ...buildDateCond('completedAt') } },
        { $group: { _id: '$loadedBy', count: { $sum: 1 } } },
      ]),
      DomLead.aggregate([
        { $match: { assignedTo: { $in: agentIds }, ...buildDateCond('createdAt') } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      // Pool / imported leads stats — total assigned (lifetime) + worked in date range
      DomImportedLead.aggregate([
        { $match: { assignedTo: { $in: agentIds } } },
        { $group: {
          _id:    '$assignedTo',
          total:  { $sum: 1 },
          worked: { $sum: { $cond: [{ $ne: ['$workStatus', 'new'] }, 1, 0] } },
        }},
      ]),
      DomLead.aggregate([
        { $match: { assignedTo: { $in: agentIds }, callOutcome: 'interested', ...buildDateCond('createdAt') } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      DomLead.aggregate([
        { $match: { assignedTo: { $in: agentIds }, callOutcome: 'callback', ...buildDateCond('createdAt') } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (arr) => {
      const m = {};
      arr.forEach(({ _id, count }) => { m[_id.toString()] = count; });
      return m;
    };

    const loadedMap    = toMap(loadedCounts);
    const completedMap = toMap(completedCounts);
    const domLeadMap   = toMap(domLeadCounts);
    const poolMap      = {};
    poolCounts.forEach(({ _id, total, worked }) => {
      poolMap[_id.toString()] = { total, worked };
    });
    const interestedMap = toMap(interestedCounts);
    const callbackMap   = toMap(callbackCounts);

    const data = agents.map((a) => {
      const id        = a._id.toString();
      const loaded    = loadedMap[id]    || 0;
      const completed = completedMap[id] || 0;
      const domLeads  = domLeadMap[id]   || 0;
      const pool      = poolMap[id]      || { total: 0, worked: 0 };
      const totalWorked = domLeads; // DomLeads = total forms filled
      const totalCalls  = loaded + pool.total;
      return {
        ...a,
        leadsLoaded:      loaded,
        leadsCompleted:   completed,
        domLeadsCreated:  domLeads,
        poolAssigned:     pool.total,
        poolWorked:       pool.worked,
        interestedCount:  interestedMap[id] || 0,
        callbackCount:    callbackMap[id]   || 0,
        conversionRate:   totalWorked > 0 ? +((completed / totalWorked) * 100).toFixed(1) : 0,
      };
    });

    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[Admin] Agents error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch agents.' });
  }
});

// ── GET /domestic-api/admin/pipeline ──────────────────────────────────────
// Funnel: website → loaded → completed → dom_lead submitted
router.get('/pipeline', async (req, res) => {
  try {
    const [total, loaded, completed, domLeads] = await Promise.all([
      DomWebsiteLead.countDocuments(),
      DomWebsiteLead.countDocuments({ status: { $in: ['loaded', 'completed'] } }),
      DomWebsiteLead.countDocuments({ status: 'completed' }),
      DomLead.countDocuments(),
    ]);

    return res.status(200).json({
      success: true,
      pipeline: [
        { stage: 'Website Leads',    count: total },
        { stage: 'Loaded by Agent',  count: loaded },
        { stage: 'Form Submitted',   count: completed },
        { stage: 'DomLead Created',  count: domLeads },
      ],
    });
  } catch (err) {
    console.error('[Admin] Pipeline error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch pipeline.' });
  }
});

// ────────────────────────────────────────────────────────────────────────────
// USER MANAGEMENT (superadmin only for create/deactivate)
// ────────────────────────────────────────────────────────────────────────────

// GET /domestic-api/admin/users — list all domestic users
router.get('/users', async (req, res) => {
  try {
    const users = await DomUser.find()
      .select('name email role isActive lastLogin createdAt')
      .sort({ createdAt: -1 })
      .lean();
    return res.status(200).json({ success: true, data: users });
  } catch (err) {
    console.error('[Admin] Users list error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch users.' });
  }
});

// POST /domestic-api/admin/users — create new user (superadmin only)
router.post('/users', authorize('dom_superadmin'), async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'name, email, and password are required.' });
    }

    const validRoles = ['domagent', 'dom_admin', 'dom_superadmin'];
    const userRole   = validRoles.includes(role) ? role : 'domagent';

    const existing = await DomUser.findOne({ email: email.toLowerCase().trim() }).lean();
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    const user = await DomUser.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: userRole,
      createdBy: req.user._id,
    });

    return res.status(201).json({
      success: true,
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err) {
    console.error('[Admin] Create user error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create user.' });
  }
});

// PATCH /domestic-api/admin/users/:id — update user (activate/deactivate, reset password)
router.patch('/users/:id', authorize('dom_superadmin'), async (req, res) => {
  try {
    const { isActive, password, name, role } = req.body;
    const update = {};

    if (isActive !== undefined) update.isActive = Boolean(isActive);
    if (name)     update.name = name.trim();
    if (role && ['domagent', 'dom_admin', 'dom_superadmin'].includes(role)) update.role = role;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
      }
      update.password = await bcrypt.hash(password, 12);
    }

    const user = await DomUser.findByIdAndUpdate(req.params.id, update, { new: true })
      .select('name email role isActive')
      .lean();

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('[Admin] Update user error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update user.' });
  }
});

// GET /domestic-api/admin/api-key — show the intake API key (superadmin only)
router.get('/api-key', authorize('dom_superadmin'), (req, res) => {
  const key = process.env.DOM_WEBSITE_API_KEY;
  if (!key) return res.status(500).json({ success: false, message: 'API key not configured.' });
  return res.status(200).json({ success: true, apiKey: key });
});

// ── GET /domestic-api/admin/reports ───────────────────────────────────────
// Comprehensive date-range analytics for super admin
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/reports', authorize('dom_superadmin'), async (req, res) => {
  try {
    const { from, to } = req.query;

    const fromDate = from ? new Date(from) : (() => {
      const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
    })();
    fromDate.setHours(0, 0, 0, 0);

    const toDate = to ? new Date(to) : new Date();
    toDate.setHours(23, 59, 59, 999);

    const df  = { createdAt: { $gte: fromDate, $lte: toDate } };

    const [
      // Website leads
      webTotal, webNew, webLoaded, webCompleted, webRejected,
      // Worked leads
      wkTotal, wkCompleted, wkPending, wkRejected, wkInterested, wkCallback, wkNotAnswering, wkNotReachable, wkWrongNumber,
      // Breakdowns
      outcomeAgg, productAgg, sourceAgg,
      // Agent leaderboard
      agentAgg,
      // Daily trend (DomLeads)
      dailyDomLeads,
      // Daily trend (WebsiteLeads)
      dailyWebLeads,
      // Hourly breakdown
      hourlyAgg,
      // Pool imported in range
      poolTotal,
    ] = await Promise.all([
      DomWebsiteLead.countDocuments(df),
      DomWebsiteLead.countDocuments({ ...df, status: 'new' }),
      DomWebsiteLead.countDocuments({ ...df, status: 'loaded' }),
      DomWebsiteLead.countDocuments({ ...df, status: 'completed' }),
      DomWebsiteLead.countDocuments({ ...df, status: 'rejected' }),

      DomLead.countDocuments(df),
      DomLead.countDocuments({ ...df, status: 'completed' }),
      DomLead.countDocuments({ ...df, status: 'pending' }),
      DomLead.countDocuments({ ...df, status: 'rejected' }),
      DomLead.countDocuments({ ...df, callOutcome: 'interested' }),
      DomLead.countDocuments({ ...df, callOutcome: 'callback' }),
      DomLead.countDocuments({ ...df, callOutcome: 'not_answering' }),
      DomLead.countDocuments({ ...df, callOutcome: 'not_reachable' }),
      DomLead.countDocuments({ ...df, callOutcome: 'wrong_number' }),

      DomLead.aggregate([
        { $match: df },
        { $group: { _id: { $ifNull: ['$callOutcome', 'none'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),

      DomLead.aggregate([
        { $match: df },
        { $group: { _id: { $ifNull: ['$productType', 'other'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 12 },
      ]),

      DomLead.aggregate([
        { $match: df },
        { $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $ne: ['$sourceWebsiteLead', null] },  then: 'Website'  },
                { case: { $ne: ['$sourceImportedLead', null] }, then: 'Imported' },
              ],
              default: 'Manual',
            },
          },
          count: { $sum: 1 },
        }},
      ]),

      DomLead.aggregate([
        { $match: df },
        { $group: {
          _id: '$assignedTo',
          total:     { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          interested:{ $sum: { $cond: [{ $eq: ['$callOutcome', 'interested'] }, 1, 0] } },
        }},
        { $sort: { total: -1 } },
        { $limit: 15 },
        { $lookup: { from: 'domusers', localField: '_id', foreignField: '_id', as: 'agent' } },
        { $unwind: { path: '$agent', preserveNullAndEmptyArrays: true } },
        // Only include actual agents (domagent role) — exclude admins & super admins
        { $match: { 'agent.role': 'domagent' } },
        { $project: { total: 1, completed: 1, interested: 1, 'agent.name': 1, 'agent.agentStatus': 1, 'agent.role': 1 } },
      ]),

      // Daily trend — grouped by IST date
      DomLead.aggregate([
        { $match: df },
        { $group: {
          _id: {
            y: { $year:       { date: '$createdAt', timezone: 'Asia/Kolkata' } },
            m: { $month:      { date: '$createdAt', timezone: 'Asia/Kolkata' } },
            d: { $dayOfMonth: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
          },
          total:     { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
        }},
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
      ]),

      DomWebsiteLead.aggregate([
        { $match: df },
        { $group: {
          _id: {
            y: { $year:       { date: '$createdAt', timezone: 'Asia/Kolkata' } },
            m: { $month:      { date: '$createdAt', timezone: 'Asia/Kolkata' } },
            d: { $dayOfMonth: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
          },
          count: { $sum: 1 },
        }},
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
      ]),

      // Hourly breakdown — using IST timezone so hours match actual working hours
      DomLead.aggregate([
        { $match: df },
        { $group: {
          _id: { $hour: { date: '$createdAt', timezone: 'Asia/Kolkata' } },
          total:     { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          interested:{ $sum: { $cond: [{ $eq: ['$callOutcome', 'interested'] }, 1, 0] } },
        }},
        { $sort: { _id: 1 } },
      ]),

      DomImportedLead.countDocuments(df),
    ]);

    return res.status(200).json({
      success: true,
      range: { from: fromDate, to: toDate },
      summary: {
        websiteLeads: { total: webTotal, new: webNew, loaded: webLoaded, completed: webCompleted, rejected: webRejected },
        workedLeads:  { total: wkTotal, completed: wkCompleted, pending: wkPending, rejected: wkRejected,
                        interested: wkInterested, callback: wkCallback, notAnswering: wkNotAnswering,
                        notReachable: wkNotReachable, wrongNumber: wkWrongNumber },
        poolLeads:    { total: poolTotal },
        conversionRate: wkTotal > 0 ? +((wkCompleted / wkTotal) * 100).toFixed(1) : 0,
        interestRate:   wkTotal > 0 ? +((wkInterested / wkTotal) * 100).toFixed(1) : 0,
      },
      breakdown: { outcome: outcomeAgg, product: productAgg, source: sourceAgg },
      agents: agentAgg,
      trend: {
        domLeads:     dailyDomLeads.map(d => ({ date: `${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`, total: d.total, completed: d.completed })),
        websiteLeads: dailyWebLeads.map(d => ({ date: `${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`, count: d.count })),
        hourly: Array.from({ length: 24 }, (_, h) => {
          const found = hourlyAgg.find(x => x._id === h) || {};
          return { hour: h, total: found.total || 0, completed: found.completed || 0, interested: found.interested || 0 };
        }),
      },
    });
  } catch (err) {
    console.error('[Admin] Reports error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch reports.' });
  }
});

// ── DELETE routes (superadmin only) ─────────────────────────────────────

// DELETE /domestic-api/admin/users/:id — permanently delete a user
router.delete('/users/:id', authorize('dom_superadmin'), async (req, res) => {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }
    const user = await DomUser.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    return res.status(200).json({ success: true, message: `User "${user.name}" deleted.` });
  } catch (err) {
    console.error('[Admin] Delete user error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete user.' });
  }
});

// DELETE /domestic-api/admin/leads/:id — delete a single worked lead (DomLead)
router.delete('/leads/:id', authorize('dom_superadmin'), async (req, res) => {
  try {
    const lead = await DomLead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    return res.status(200).json({ success: true, message: `Lead ${lead.leadRef || lead._id} deleted.` });
  } catch (err) {
    console.error('[Admin] Delete lead error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete lead.' });
  }
});

// DELETE /domestic-api/admin/import-batch/:batchId — delete unworked leads in a batch
// Worked leads (workStatus !== 'new') are preserved so agents' completed cases remain visible.
router.delete('/import-batch/:batchId', authorize('dom_superadmin'), async (req, res) => {
  try {
    const io = req.app.get('io');
    const batchId = req.params.batchId;

    // Get batch name for the notification
    const sample = await DomImportedLead.findOne({ importBatchId: batchId }).lean();
    const batchName = sample?.importBatchName || batchId;

    // Find affected agents BEFORE deleting (to notify them)
    const affectedAgents = await DomImportedLead.distinct('assignedTo', {
      importBatchId: batchId,
      workStatus: 'new',
      assignedTo: { $ne: null },
    });

    // Only delete UNWORKED leads — preserve leads the agent has already called/worked
    const result = await DomImportedLead.deleteMany({
      importBatchId: batchId,
      $or: [{ workStatus: 'new' }, { workStatus: null }, { workStatus: { $exists: false } }],
    });

    // Notify affected agents via socket so their dashboards update immediately
    if (io && affectedAgents.length > 0) {
      io.to('domagents').emit('pool_batch_deleted', {
        batchId,
        batchName,
        deletedCount: result.deletedCount,
        message: `Batch "${batchName}" was removed. ${result.deletedCount} unworked lead(s) have been cleared from your queue.`,
      });
    }

    return res.status(200).json({
      success: true,
      deleted: result.deletedCount,
      message: `Deleted ${result.deletedCount} unworked leads from batch "${batchName}".`,
    });
  } catch (err) {
    console.error('[Admin] Delete batch error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete batch.' });
  }
});

// DELETE /domestic-api/admin/imported-lead/:id — delete a single imported lead
router.delete('/imported-lead/:id', authorize('dom_superadmin'), async (req, res) => {
  try {
    const lead = await DomImportedLead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });
    return res.status(200).json({ success: true, message: 'Imported lead deleted.' });
  } catch (err) {
    console.error('[Admin] Delete imported lead error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to delete lead.' });
  }
});

// ── POST /domestic-api/admin/agents/transfer-leads ─────────────────────────
// Transfer all (or filtered) leads from one agent to another
router.post('/agents/transfer-leads', async (req, res) => {
  try {
    const { fromAgentId, toAgentId, types = ['website', 'pool'], workedOnly = false } = req.body;

    if (!fromAgentId || !toAgentId) {
      return res.status(400).json({ success: false, message: 'fromAgentId and toAgentId are required.' });
    }
    if (fromAgentId === toAgentId) {
      return res.status(400).json({ success: false, message: 'Source and target agent must be different.' });
    }

    const [fromAgent, toAgent] = await Promise.all([
      DomUser.findById(fromAgentId).lean(),
      DomUser.findById(toAgentId).lean(),
    ]);
    if (!fromAgent) return res.status(404).json({ success: false, message: 'Source agent not found.' });
    if (!toAgent)   return res.status(404).json({ success: false, message: 'Target agent not found.' });

    const results = {};

    // Transfer website leads (DomWebsiteLead.loadedBy)
    if (types.includes('website')) {
      const filter = { loadedBy: fromAgentId, status: { $in: ['loaded', 'pending'] } };
      const r = await DomWebsiteLead.updateMany(filter, { $set: { loadedBy: toAgentId } });
      results.websiteLeads = r.modifiedCount;
    }

    // Transfer pool / imported leads (DomImportedLead.assignedTo)
    if (types.includes('pool')) {
      const filter = { assignedTo: fromAgentId };
      if (!workedOnly) filter.workStatus = 'new';   // only unworked by default
      const r = await DomImportedLead.updateMany(filter, { $set: { assignedTo: toAgentId } });
      results.poolLeads = r.modifiedCount;
    }

    // Transfer worked DomLeads (optional — admin explicitly requests)
    if (types.includes('worked')) {
      const r = await DomLead.updateMany(
        { assignedTo: fromAgentId },
        { $set: { assignedTo: toAgentId, lastUpdatedBy: req.user._id } }
      );
      results.workedLeads = r.modifiedCount;
    }

    const total = Object.values(results).reduce((s, v) => s + v, 0);
    return res.status(200).json({
      success: true,
      message: `${total} lead(s) transferred from ${fromAgent.name} to ${toAgent.name}.`,
      results,
      from: { _id: fromAgent._id, name: fromAgent.name },
      to:   { _id: toAgent._id,   name: toAgent.name   },
    });
  } catch (err) {
    console.error('[Admin] Transfer leads error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to transfer leads.' });
  }
});

// ── GET /domestic-api/admin/agent-dom-leads ────────────────────────────────
// Fetch DomLeads for a specific agent, optionally filtered by callOutcome
router.get('/agent-dom-leads', async (req, res) => {
  try {
    const { agentId, callOutcome } = req.query;
    if (!agentId) return res.status(400).json({ success: false, message: 'agentId is required.' });
    const filter = { assignedTo: agentId };
    if (callOutcome && callOutcome !== 'all') filter.callOutcome = callOutcome;
    const leads = await DomLead.find(filter)
      .select('name mobile callOutcome status createdAt updatedAt leadRef productType')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    return res.json({ success: true, data: leads, total: leads.length });
  } catch (err) {
    console.error('[Admin] Agent dom-leads error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch leads.' });
  }
});

// ── POST /domestic-api/admin/bulk-reassign-leads ───────────────────────────
// Bulk reassign DomLeads AND their source (website/imported) leads to another agent
router.post('/bulk-reassign-leads', async (req, res) => {
  try {
    const { leadIds, toAgentId } = req.body;
    if (!Array.isArray(leadIds) || leadIds.length === 0)
      return res.status(400).json({ success: false, message: 'leadIds array is required.' });
    if (!toAgentId)
      return res.status(400).json({ success: false, message: 'toAgentId is required.' });
    if (leadIds.length > 500)
      return res.status(400).json({ success: false, message: 'Maximum 500 leads per batch.' });

    const targetAgent = await DomUser.findById(toAgentId).select('name role').lean();
    if (!targetAgent || targetAgent.role !== 'domagent')
      return res.status(404).json({ success: false, message: 'Target agent not found.' });

    // Fetch source IDs so we can reassign all 3 layers
    const domLeadDocs = await DomLead.find({ _id: { $in: leadIds } })
      .select('sourceWebsiteLead sourceImportedLead')
      .lean();

    const websiteLeadIds  = domLeadDocs.map(l => l.sourceWebsiteLead).filter(Boolean);
    const importedLeadIds = domLeadDocs.map(l => l.sourceImportedLead).filter(Boolean);

    // 1. Update DomLead.assignedTo for all leads
    await DomLead.updateMany(
      { _id: { $in: leadIds } },
      { $set: { assignedTo: toAgentId, lastUpdatedBy: req.user._id } }
    );

    // 2. Update DomWebsiteLead:
    //    • loadedBy  → agent dashboard uses loadedBy to find "my leads"
    //    • assignedTo → for consistency
    //    • status = 'loaded' → must be 'loaded' for agent to see it
    // ALSO clear sourceWebsiteLead on the DomLead so isWorked=false for the new agent
    // (isWorked is computed: DomLead.find({ assignedTo:newAgent, sourceWebsiteLead:{$ne:null} }))
    if (websiteLeadIds.length > 0) {
      await DomWebsiteLead.updateMany(
        { _id: { $in: websiteLeadIds } },
        { $set: { assignedTo: toAgentId, loadedBy: toAgentId, status: 'loaded' } }
      );
      // Unlink website source from DomLead so isWorked=false for new agent
      // (the DomLead is kept as historical record with assignedTo=newAgent)
      await DomLead.updateMany(
        { sourceWebsiteLead: { $in: websiteLeadIds } },
        { $set: { sourceWebsiteLead: null } }
      );
    }

    // 3. Update DomImportedLead:
    //    • assignedTo → agent dashboard filters by assignedTo
    //    • status = 'assigned' → must be 'assigned' for agent to see it
    //    • workStatus = 'new' → makes it appear in "Assigned to Work" tab
    if (importedLeadIds.length > 0) {
      await DomImportedLead.updateMany(
        { _id: { $in: importedLeadIds } },
        { $set: { assignedTo: toAgentId, status: 'assigned', workStatus: 'new' } }
      );
    }

    const io = req.app.get('io');
    if (io) {
      io.to('domagents').emit('leads_bulk_reassigned', {
        toAgentId, toAgentName: targetAgent.name,
        count: leadIds.length, by: req.user.name,
      });
    }

    return res.json({
      success: true,
      message: `${leadIds.length} lead(s) reassigned to ${targetAgent.name}.`,
      reassigned: leadIds.length,
    });
  } catch (err) {
    console.error('[Admin] Bulk reassign error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to reassign leads.' });
  }
});

module.exports = router;

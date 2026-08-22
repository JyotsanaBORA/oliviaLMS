'use strict';
const express        = require('express');
const DomUser        = require('../models/DomUser');
const DomWebsiteLead = require('../models/DomWebsiteLead');
const DomLead        = require('../models/DomLead');
const DomImportedLead = require('../models/DomImportedLead');
const bcrypt         = require('bcryptjs');
const { protect, authorize, generateToken } = require('../middleware/auth');

const router = express.Router();
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const istDayBounds = (date = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10)) => {
  const [year, month, day] = date.split('-').map(Number);
  const start = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 86400000 - 1) };
};

// All admin routes require dom_admin or dom_superadmin
router.use(protect, authorize('dom_admin', 'dom_superadmin'));

//  GET /domestic-api/admin/stats 
router.get('/stats', async (req, res) => {
  try {
    const todayStart = istDayBounds().start;

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

//  GET /domestic-api/admin/agents 
// Agent performance table  supports optional dateFrom/dateTo for disposition stats
router.get('/agents', async (req, res) => {
  try {
    const agents = await DomUser.find({ role: 'domagent' })
      .select('name email isActive lastLogin createdAt agentStatus agentStatusUpdatedAt')
      .lean();

    // Counts per agent
    const agentIds = agents.map((a) => a._id);

    //  Optional date range for disposition stats 
    // Builds a { field: { $gte, $lte } } object; returns {} when no dates given
    const buildDateCond = (field) => {
      if (!req.query.dateFrom && !req.query.dateTo) return {};
      const cond = {};
      if (req.query.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateFrom)) {
        const [y, m, d] = req.query.dateFrom.split('-').map(Number);
        cond.$gte = new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
      }
      if (req.query.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(req.query.dateTo)) {
        const [y, m, d] = req.query.dateTo.split('-').map(Number);
        cond.$lte = new Date(Date.UTC(y, m - 1, d + 1) - IST_OFFSET_MS - 1);
      }
      if (!Object.keys(cond).length) return {};
      if (Array.isArray(field)) {
        return { $or: field.map(f => ({ [f]: cond })) };
      }
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
        { $match: { assignedTo: { $in: agentIds }, ...buildDateCond(['createdAt', 'updatedAt']) } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      // Pool / imported leads stats  total assigned (lifetime) + worked in date range
      DomImportedLead.aggregate([
        { $match: { assignedTo: { $in: agentIds } } },
        { $group: {
          _id:    '$assignedTo',
          total:  { $sum: 1 },
          worked: { $sum: { $cond: [{ $ne: ['$workStatus', 'new'] }, 1, 0] } },
        }},
      ]),
      DomLead.aggregate([
        { $match: { assignedTo: { $in: agentIds }, callOutcome: 'interested', ...buildDateCond(['createdAt', 'updatedAt']) } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      DomLead.aggregate([
        { $match: { assignedTo: { $in: agentIds }, callOutcome: 'callback', ...buildDateCond(['createdAt', 'updatedAt']) } },
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

//  GET /domestic-api/admin/daily-assignments 
// Per-agent allocation counts for one IST calendar day. Website/Meta leads are
// assigned when loaded; imported leads are assigned via the pool.
router.get('/daily-assignments', async (req, res) => {
  try {
    const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
    const date = req.query.date || todayIst;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date must be in YYYY-MM-DD format.' });
    }

    const [year, month, day] = date.split('-').map(Number);
    const istStart = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
    if (new Date(istStart.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) !== date) {
      return res.status(400).json({ success: false, message: 'date is not a valid calendar date.' });
    }
    const istEnd = new Date(istStart.getTime() + 24 * 60 * 60 * 1000);
    const dateFilter = { $gte: istStart, $lt: istEnd };

    const agents = await DomUser.find({ role: 'domagent' })
      .select('name email isActive')
      .sort({ name: 1 })
      .lean();
    const agentIds = agents.map((agent) => agent._id);

    const [websiteAssignments, importedAssignments, manualAssignments, legacyWebsites, legacyImported, legacyManual] = await Promise.all([
      DomWebsiteLead.aggregate([
        { $unwind: '$assignmentHistory' },
        { $match: { 'assignmentHistory.agent': { $in: agentIds }, 'assignmentHistory.assignedAt': dateFilter } },
        { $group: { _id: '$assignmentHistory.agent', count: { $sum: 1 } } },
      ]),
      DomImportedLead.aggregate([
        { $unwind: '$assignmentHistory' },
        { $match: { 'assignmentHistory.agent': { $in: agentIds }, 'assignmentHistory.assignedAt': dateFilter } },
        { $group: { _id: '$assignmentHistory.agent', count: { $sum: 1 } } },
      ]),
      DomLead.aggregate([
        { $unwind: '$assignmentHistory' },
        { $match: { 'assignmentHistory.agent': { $in: agentIds }, 'assignmentHistory.assignedAt': dateFilter } },
        { $group: { _id: '$assignmentHistory.agent', count: { $sum: 1 } } },
      ]),
      DomWebsiteLead.aggregate([
        {
          $match: {
            $or: [
              { loadedBy: { $in: agentIds }, loadedAt: dateFilter },
              { loadedBy: { $in: agentIds }, updatedAt: dateFilter },
              { assignedTo: { $in: agentIds }, assignedAt: dateFilter },
              { assignedTo: { $in: agentIds }, updatedAt: dateFilter },
            ],
            $and: [
              { $or: [{ assignmentHistory: { $exists: false } }, { assignmentHistory: { $size: 0 } }] },
            ],
          },
        },
        { $group: { _id: { $ifNull: ['$loadedBy', '$assignedTo'] }, count: { $sum: 1 } } },
      ]),
      DomImportedLead.aggregate([
        {
          $match: {
            $or: [
              { assignedTo: { $in: agentIds }, assignedAt: dateFilter },
              { assignedTo: { $in: agentIds }, updatedAt: dateFilter },
            ],
            $and: [
              { $or: [{ assignmentHistory: { $exists: false } }, { assignmentHistory: { $size: 0 } }] },
            ],
          },
        },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
      DomLead.aggregate([
        {
          $match: {
            assignedTo: { $in: agentIds },
            $or: [{ assignedAt: dateFilter }, { updatedAt: dateFilter }, { isManual: true, createdAt: dateFilter }],
            $and: [
              { $or: [{ assignmentHistory: { $exists: false } }, { assignmentHistory: { $size: 0 } }] },
            ],
          },
        },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
    ]);

    const toCountMap = (arrList) => {
      const map = {};
      arrList.forEach((rows) => {
        rows.forEach((row) => {
          const k = row._id.toString();
          map[k] = (map[k] || 0) + row.count;
        });
      });
      return map;
    };

    const websiteMap = toCountMap([websiteAssignments, legacyWebsites]);
    const importedMap = toCountMap([importedAssignments, legacyImported]);
    const manualMap = toCountMap([manualAssignments, legacyManual]);

    const data = agents.map((agent) => {
      const id = agent._id.toString();
      const website = (websiteMap[id] || 0) + (manualMap[id] || 0);
      const imported = importedMap[id] || 0;
      return { ...agent, website, imported, total: website + imported };
    });

    return res.status(200).json({
      success: true,
      date,
      timezone: 'Asia/Kolkata',
      data,
      totals: {
        website: data.reduce((sum, agent) => sum + agent.website, 0),
        imported: data.reduce((sum, agent) => sum + agent.imported, 0),
        total: data.reduce((sum, agent) => sum + agent.total, 0),
      },
    });
  } catch (err) {
    console.error('[Admin] Daily assignments error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch daily assignments.' });
  }
});

// GET /domestic-api/admin/daily-assigned-leads
// Lead-level, searchable allocation history for one IST calendar day.
router.get('/daily-assigned-leads', async (req, res) => {
  try {
    const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
    const date = req.query.date || todayIst;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ success: false, message: 'date must be YYYY-MM-DD.' });

    const [year, month, day] = date.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
    if (new Date(start.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10) !== date) return res.status(400).json({ success: false, message: 'Invalid date.' });
    const range = { $gte: start, $lt: new Date(start.getTime() + 86400000) };
    const view = req.query.view === 'worked' ? 'worked' : 'assigned';
    const search = (req.query.search || '').trim();
    const textFilter = search ? { $or: ['name', 'mobile', 'email', 'city', 'productType', 'loanType', 'importBatchName'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) } : {};
    const agentFilterParam = req.query.agentId || null;
    const dailyFields = '_id name mobile email city productType loanType importBatchName loadedBy assignedTo loadedAt assignedAt completedAt status workStatus workedAt callOutcome domLeadId assignmentHistory source isManual documents updateCount callCount createdAt updatedAt';

    const [users, websites, imported, domLeadsList] = await Promise.all([
      DomUser.find().select('name email role').lean(),
      DomWebsiteLead.find({
        ...textFilter,
        $or: [
          { assignmentHistory: { $elemMatch: { assignedAt: range, ...(agentFilterParam ? { agent: agentFilterParam } : {}) } } },
          { loadedAt: range, ...(agentFilterParam ? { loadedBy: agentFilterParam } : {}) },
          { loadedBy: { $ne: null }, updatedAt: range, ...(agentFilterParam ? { loadedBy: agentFilterParam } : {}) },
          { assignedTo: { $ne: null }, updatedAt: range, ...(agentFilterParam ? { assignedTo: agentFilterParam } : {}) },
        ],
      }).select(dailyFields).lean(),
      DomImportedLead.find({
        ...textFilter,
        $or: [
          { assignmentHistory: { $elemMatch: { assignedAt: range, ...(agentFilterParam ? { agent: agentFilterParam } : {}) } } },
          { assignedAt: range, ...(agentFilterParam ? { assignedTo: agentFilterParam } : {}) },
          { assignedTo: { $ne: null }, updatedAt: range, ...(agentFilterParam ? { assignedTo: agentFilterParam } : {}) },
        ],
      }).select(dailyFields).lean(),
      DomLead.find({
        ...textFilter,
        $or: [
          { assignmentHistory: { $elemMatch: { assignedAt: range, ...(agentFilterParam ? { agent: agentFilterParam } : {}) } } },
          { assignedAt: range, ...(agentFilterParam ? { assignedTo: agentFilterParam } : {}) },
          { assignedTo: { $ne: null }, updatedAt: range, ...(agentFilterParam ? { assignedTo: agentFilterParam } : {}) },
          { isManual: true, createdAt: range, ...(agentFilterParam ? { assignedTo: agentFilterParam } : {}) },
        ],
      }).select(dailyFields).lean(),
    ]);
    const userRoles = new Map(users.map((u) => [u._id.toString(), u.role]));
    const usersById = new Map(users.map((u) => [u._id.toString(), u]));

    const event = (lead, defaultSource, history) => {
      const source = lead.source || (lead.isManual ? 'manual' : defaultSource);
      const isWebsiteOrMeta = source === 'website' || source === 'meta';
      const agentId = (history?.agent || (isWebsiteOrMeta ? lead.loadedBy : lead.assignedTo))?.toString();
      const currentId = (isWebsiteOrMeta ? lead.loadedBy : lead.assignedTo)?.toString();
      const workedAt = isWebsiteOrMeta ? lead.completedAt : (lead.workedAt || lead.updatedAt);
      const assignedAtDate = history?.assignedAt ? new Date(history.assignedAt) : (lead.assignedAt || lead.loadedAt || lead.updatedAt || lead.createdAt || start);
      return {
        _id: `${source}-${lead._id}-${assignedAtDate.getTime()}-${agentId || 'unknown'}`,
        leadId: lead._id,
        source,
        name: lead.name,
        mobile: lead.mobile,
        email: lead.email,
        city: lead.city,
        productType: lead.productType || lead.loanType,
        batchName: lead.importBatchName || (source === 'meta' ? 'Meta Ads' : '-'),
        assignedAt: assignedAtDate,
        unassignedAt: history?.unassignedAt || null,
        agentId,
        agent: agentId ? usersById.get(agentId) || { _id: agentId, name: 'Deleted agent' } : { name: 'Unknown' },
        currentlyAssigned: Boolean(agentId && currentId === agentId),
        domLeadId: lead.domLeadId || (source === 'manual' || (!isWebsiteOrMeta && source !== 'imported') ? lead._id : null),
        canUnassign: Boolean(agentId && currentId === agentId && (isWebsiteOrMeta ? lead.status === 'loaded' : source === 'imported' ? lead.workStatus === 'new' : false)),
        rawLead: lead,
      };
    };

    const processLeads = (leads, defaultSource) => (leads || []).flatMap((lead) => {
      const matchingHistory = (lead.assignmentHistory || []).filter(
        (item) => item.assignedAt && new Date(item.assignedAt) >= start && new Date(item.assignedAt) < range.$lt && (!agentFilterParam || item.agent?.toString() === agentFilterParam)
      );
      if (matchingHistory.length > 0) {
        return matchingHistory.map((item) => event(lead, defaultSource, item));
      }
      const fallbackAgent = (defaultSource === 'website' || defaultSource === 'meta') ? (lead.loadedBy || lead.assignedTo) : lead.assignedTo;
      if (fallbackAgent && (!agentFilterParam || fallbackAgent.toString() === agentFilterParam)) {
        const fallbackTime = (lead.assignedAt && lead.assignedAt >= start && lead.assignedAt < range.$lt)
          ? lead.assignedAt
          : (lead.loadedAt && lead.loadedAt >= start && lead.loadedAt < range.$lt)
            ? lead.loadedAt
            : (lead.updatedAt && lead.updatedAt >= start && lead.updatedAt < range.$lt)
              ? lead.updatedAt
              : (lead.createdAt && lead.createdAt >= start && lead.createdAt < range.$lt)
                ? lead.createdAt
                : start;
        return [event(lead, defaultSource, { agent: fallbackAgent, assignedAt: fallbackTime })];
      }
      return [];
    });

    const normalizeMobile = (v) => (v || '').toString().replace(/\D/g, '').slice(-10);
    const normalizeName = (v) => (v || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');

    const webEvents = processLeads(websites, 'website');
    const importedEvents = processLeads(imported, 'imported');

    // Collect all known imported & website IDs and mobiles to avoid duplicate manual rows for the same lead
    const knownParentIds = new Set();
    const knownMobiles = new Set();
    websites.forEach(w => {
      knownParentIds.add(w._id.toString());
      const m = normalizeMobile(w.mobile);
      if (m) knownMobiles.add(m);
    });
    imported.forEach(i => {
      knownParentIds.add(i._id.toString());
      const m = normalizeMobile(i.mobile);
      if (m) knownMobiles.add(m);
    });

    const standaloneDomLeads = domLeadsList.filter(l => {
      if (l.sourceWebsiteLead && knownParentIds.has(l.sourceWebsiteLead.toString())) return false;
      if (l.sourceImportedLead && knownParentIds.has(l.sourceImportedLead.toString())) return false;
      const m = normalizeMobile(l.mobile);
      if (m && knownMobiles.has(m)) return false;
      return true;
    });
    const domEvents = processLeads(standaloneDomLeads, 'manual');

    // Deduplicate by source + leadId + agentId or mobile + agentId
    const seenKeys = new Set();
    const allData = [...webEvents, ...importedEvents, ...domEvents].filter(ev => {
      const mob = normalizeMobile(ev.mobile);
      const k = mob ? `${ev.agentId}-${mob}` : `${ev.source}-${ev.leadId}-${ev.agentId}`;
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    }).sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt));

    const websiteLeadIds = [...new Set(allData.filter((lead) => lead.source === 'website' || lead.source === 'meta').map((lead) => lead.leadId?.toString()).filter(Boolean))];
    const importedLeadIds = [...new Set(allData.filter((lead) => lead.source === 'imported').map((lead) => lead.leadId?.toString()).filter(Boolean))];

    const domLeadFilter = [
      websiteLeadIds.length ? { sourceWebsiteLead: { $in: websiteLeadIds } } : null,
      importedLeadIds.length ? { sourceImportedLead: { $in: importedLeadIds } } : null,
    ].filter(Boolean);
    const workedDomLeads = domLeadFilter.length
      ? await DomLead.find({ $or: domLeadFilter })
          .select('_id sourceWebsiteLead sourceImportedLead assignedTo callOutcome updateCount callCount status documents createdAt updatedAt lastUpdatedBy')
          .lean()
      : [];

    const workedBySourceLead = new Map();
    for (const row of workedDomLeads) {
      if (row.sourceWebsiteLead) {
        const idStr = row.sourceWebsiteLead.toString();
        const prev1 = workedBySourceLead.get(`website-${idStr}`);
        if (!prev1 || new Date(row.updatedAt) > new Date(prev1.updatedAt)) workedBySourceLead.set(`website-${idStr}`, row);
        const prev2 = workedBySourceLead.get(`meta-${idStr}`);
        if (!prev2 || new Date(row.updatedAt) > new Date(prev2.updatedAt)) workedBySourceLead.set(`meta-${idStr}`, row);
      }
      if (row.sourceImportedLead) {
        const idStr = row.sourceImportedLead.toString();
        const prev = workedBySourceLead.get(`imported-${idStr}`);
        if (!prev || new Date(row.updatedAt) > new Date(prev.updatedAt)) workedBySourceLead.set(`imported-${idStr}`, row);
      }
    }

    // Fallback matching for legacy/migrated rows where sourceImportedLead/sourceWebsiteLead linkage
    // may be absent on DomLead: match by assigned agent + mobile + same IST day activity window.
    const fallbackAgentIds = [...new Set(allData.map((lead) => lead.agentId).filter(Boolean))];
    const fallbackDomLeads = fallbackAgentIds.length
      ? await DomLead.find({
          assignedTo: { $in: fallbackAgentIds },
          $or: [
            { createdAt: range },
            { updatedAt: range },
          ],
        })
          .select('_id assignedTo name mobile callOutcome updateCount callCount status documents createdAt updatedAt lastUpdatedBy')
          .lean()
      : [];
    const workedByAgentMobile = new Map();
    const workedByMobile = new Map();
    const workedByAgentName = new Map();
    for (const row of fallbackDomLeads) {
      const agentId = row.assignedTo?.toString() || '';
      const mobile = normalizeMobile(row.mobile);
      const name = normalizeName(row.name);

      if (agentId && mobile) {
        const key = `${agentId}-${mobile}`;
        const prev = workedByAgentMobile.get(key);
        if (!prev || new Date(row.updatedAt) > new Date(prev.updatedAt)) workedByAgentMobile.set(key, row);
      }
      if (mobile) {
        const prev = workedByMobile.get(mobile);
        if (!prev || new Date(row.updatedAt) > new Date(prev.updatedAt)) workedByMobile.set(mobile, row);
      }
      if (agentId && name) {
        const key = `${agentId}-${name}`;
        const prev = workedByAgentName.get(key);
        if (!prev || new Date(row.updatedAt) > new Date(prev.updatedAt)) workedByAgentName.set(key, row);
      }
    }

    const enriched = allData.map((lead) => {
      const key = `${lead.source}-${lead.leadId?.toString()}`;
      const leadMobile = normalizeMobile(lead.mobile);
      const leadName = normalizeName(lead.name);
      const fallbackAgentMobileKey = `${lead.agentId || ''}-${leadMobile}`;
      const fallbackAgentNameKey = `${lead.agentId || ''}-${leadName}`;
      const worked =
        workedBySourceLead.get(key) ||
        workedByAgentMobile.get(fallbackAgentMobileKey) ||
        workedByMobile.get(leadMobile) ||
        workedByAgentName.get(fallbackAgentNameKey) ||
        null;
      const isManualOrDom = lead.source === 'manual' || Boolean(lead.rawLead?.callOutcome || lead.rawLead?.documents);
      const workedRecord = worked || (isManualOrDom ? lead.rawLead : null);
      const workedByAssignedAgent = Boolean(
        (worked && worked.assignedTo && lead.agentId && worked.assignedTo.toString() === lead.agentId) ||
        (isManualOrDom && lead.agentId)
      );
      const hasWorkedLink = Boolean(
        lead.domLeadId ||
        workedRecord ||
        (lead.rawLead?.workStatus && lead.rawLead.workStatus !== 'new') ||
        lead.rawLead?.status === 'completed' ||
        lead.rawLead?.callOutcome
      );

      const isReassigned = Boolean(
        (lead.rawLead?.assignmentHistory && lead.rawLead.assignmentHistory.length > 1) ||
        (lead.rawLead?.sourceImportedLead || lead.rawLead?.sourceWebsiteLead) ||
        (workedRecord?.createdAt && new Date(workedRecord.createdAt) < start) ||
        (lead.rawLead?.createdAt && new Date(lead.rawLead.createdAt) < start)
      );

      const lastUpdBy = workedRecord?.lastUpdatedBy?.toString();
      const isAgentUpdate = lastUpdBy && userRoles.get(lastUpdBy) === 'domagent';
      const isAssignedAgentMatch = lastUpdBy && lead.agentId && lastUpdBy === lead.agentId;

      const workedOnDate = Boolean(
        (workedRecord?.updatedAt && new Date(workedRecord.updatedAt) >= start && new Date(workedRecord.updatedAt) < range.$lt && (isAgentUpdate || isAssignedAgentMatch || workedRecord.callCount > 0 || workedRecord.updateCount > 0)) ||
        (lead.rawLead?.workedAt && new Date(lead.rawLead.workedAt) >= start && new Date(lead.rawLead.workedAt) < range.$lt && lead.rawLead.workStatus !== 'new') ||
        (lead.rawLead?.completedAt && new Date(lead.rawLead.completedAt) >= start && new Date(lead.rawLead.completedAt) < range.$lt && lead.rawLead.status === 'completed')
      );

      const workedOnReassigned = Boolean(isReassigned && workedOnDate);

      return {
        ...lead,
        isReassigned,
        hasWorkedDetails: Boolean(hasWorkedLink),
        workedOnDate,
        workedOnReassigned,
        workedLead: workedRecord ? {
          domLeadId: workedRecord._id,
          callOutcome: workedRecord.callOutcome || '',
          updateCount: workedRecord.updateCount || 0,
          callCount: workedRecord.callCount || 0,
          status: workedRecord.status,
          docsCount: Array.isArray(workedRecord.documents) ? workedRecord.documents.length : 0,
          createdAt: workedRecord.createdAt,
          updatedAt: workedRecord.updatedAt,
          assignedToMatchesAllocationAgent: workedByAssignedAgent,
        } : (lead.domLeadId ? { domLeadId: lead.domLeadId } : null),
      };
    });

    const data =
      view === 'reassigned_worked' ? enriched.filter((lead) => lead.workedOnReassigned) :
      view === 'worked' ? enriched.filter((lead) => lead.workedOnDate) :
      enriched;

    return res.json({
      success: true,
      date,
      view,
      timezone: 'Asia/Kolkata',
      counts: {
        assigned: enriched.length,
        worked: enriched.filter((lead) => lead.workedOnDate).length,
        reassignedWorked: enriched.filter((lead) => lead.workedOnReassigned).length,
      },
      data,
    });
  } catch (err) {
    console.error('[Admin] Daily assigned leads error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch daily assigned leads.' });
  }
});

// DELETE /domestic-api/admin/daily-assigned-leads/:source/:id
// Super Admin can return an unworked lead to its original pool while retaining its audit event.
router.delete('/daily-assigned-leads/:source/:id', authorize('dom_superadmin'), async (req, res) => {
  try {
    const { source, id } = req.params;
    const now = new Date();
    if (source === 'website' || source === 'meta') {
      const lead = await DomWebsiteLead.findOne({ _id: id, status: 'loaded', loadedBy: { $ne: null } });
      if (!lead) return res.status(400).json({ success: false, message: 'Only an unworked loaded lead can be unassigned.' });
      const agent = lead.loadedBy;
      const update = lead.assignmentHistory?.length
        ? { $set: { status: 'new', loadedBy: null, 'assignmentHistory.$[item].unassignedAt': now } }
        : { $set: { status: 'new', loadedBy: null }, $push: { assignmentHistory: { agent, assignedAt: lead.loadedAt || now, unassignedAt: now } } };
      await DomWebsiteLead.updateOne({ _id: id }, update, lead.assignmentHistory?.length ? { arrayFilters: [{ 'item.agent': agent, 'item.unassignedAt': null }] } : undefined);
    } else if (source === 'imported') {
      const lead = await DomImportedLead.findOne({ _id: id, status: 'assigned', assignedTo: { $ne: null }, workStatus: 'new' });
      if (!lead) return res.status(400).json({ success: false, message: 'Only an unworked imported lead can be unassigned.' });
      const agent = lead.assignedTo;
      const status = lead.sharedWith?.length ? 'shared' : 'imported';
      const update = lead.assignmentHistory?.length
        ? { $set: { assignedTo: null, assignedBy: null, status, 'assignmentHistory.$[item].unassignedAt': now } }
        : { $set: { assignedTo: null, assignedBy: null, status }, $push: { assignmentHistory: { agent, assignedAt: lead.assignedAt || now, unassignedAt: now } } };
      await DomImportedLead.updateOne({ _id: id }, update, lead.assignmentHistory?.length ? { arrayFilters: [{ 'item.agent': agent, 'item.unassignedAt': null }] } : undefined);
    } else return res.status(400).json({ success: false, message: 'Invalid lead source.' });
    return res.json({ success: true, message: 'Lead unassigned and returned to the available pool.' });
  } catch (err) {
    console.error('[Admin] Unassign daily lead error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to unassign lead.' });
  }
});

//  GET /domestic-api/admin/pipeline 
// Funnel: website  loaded  completed  dom_lead submitted
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

// 
// USER MANAGEMENT (superadmin only for create/deactivate)
// 

// GET /domestic-api/admin/users  list all domestic users
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

// POST /domestic-api/admin/users  create new user (superadmin only)
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

// PATCH /domestic-api/admin/users/:id  update user (activate/deactivate, reset password)
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

// GET /domestic-api/admin/api-key  show the intake API key (superadmin only)
router.get('/api-key', authorize('dom_superadmin'), (req, res) => {
  const key = process.env.DOM_WEBSITE_API_KEY;
  if (!key) return res.status(500).json({ success: false, message: 'API key not configured.' });
  return res.status(200).json({ success: true, apiKey: key });
});

//  GET /domestic-api/admin/reports 
// Comprehensive date-range analytics for super admin
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/reports', authorize('dom_superadmin'), async (req, res) => {
  try {
    const { from, to } = req.query;

    const todayIst = new Date(Date.now() + IST_OFFSET_MS).toISOString().slice(0, 10);
    const defaultFrom = `${todayIst.slice(0, 7)}-01`;
    const fromDate = istDayBounds(from || defaultFrom).start;
    const toDate = istDayBounds(to || todayIst).end;

    const df    = { createdAt: { $gte: fromDate, $lte: toDate } };
    // Separate filter for leads assigned (loadedAt) in this period  catches leads
    // that arrived before the window but were assigned to agents within it
    const dfLoad = { loadedAt:  { $gte: fromDate, $lte: toDate } };

    const [
      // Website / Meta leads  received (createdAt) in period
      webTotal, webNew, webLoaded, webCompleted, webRejected,
      // Website / Meta leads  assigned (loadedAt) in period
      webAssigned, webAssignedMeta, webAssignedWebsite,
      // Worked leads (DomLead)
      wkTotal, wkCompleted, wkPending, wkRejected, wkInterested, wkCallback, wkNotAnswering, wkNotReachable, wkWrongNumber,
      // Breakdowns
      outcomeAgg, productAgg, sourceAgg,
      // Agent leaderboard
      agentAgg,
      // Daily trend (DomLeads)
      dailyDomLeads,
      // Daily trend (WebsiteLeads by loadedAt so today's assigned leads appear)
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

      // Assigned-in-period counts (by loadedAt)
      DomWebsiteLead.countDocuments({ ...dfLoad, loadedBy: { $ne: null } }),
      DomWebsiteLead.countDocuments({ ...dfLoad, loadedBy: { $ne: null }, source: 'meta' }),
      DomWebsiteLead.countDocuments({ ...dfLoad, loadedBy: { $ne: null }, source: { $in: ['website', 'manual'] } }),

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
        // Only include actual agents (domagent role)  exclude admins & super admins
        { $match: { 'agent.role': 'domagent' } },
        { $project: { total: 1, completed: 1, interested: 1, 'agent.name': 1, 'agent.agentStatus': 1, 'agent.role': 1 } },
      ]),

      // Daily trend  grouped by IST date
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

      // Group website/meta leads by loadedAt date so today-assigned leads are visible
      DomWebsiteLead.aggregate([
        { $match: { ...dfLoad, loadedBy: { $ne: null } } },
        { $group: {
          _id: {
            y: { $year:       { date: '$loadedAt', timezone: 'Asia/Kolkata' } },
            m: { $month:      { date: '$loadedAt', timezone: 'Asia/Kolkata' } },
            d: { $dayOfMonth: { date: '$loadedAt', timezone: 'Asia/Kolkata' } },
          },
          count: { $sum: 1 },
          meta:    { $sum: { $cond: [{ $eq: ['$source', 'meta'] }, 1, 0] } },
          website: { $sum: { $cond: [{ $eq: ['$source', 'website'] }, 1, 0] } },
        }},
        { $sort: { '_id.y': 1, '_id.m': 1, '_id.d': 1 } },
      ]),

      // Hourly breakdown  using IST timezone so hours match actual working hours
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
        websiteLeads: {
          // Received = createdAt in period; Assigned = loadedAt in period (catches older leads assigned today)
          total: webTotal, new: webNew, loaded: webLoaded, completed: webCompleted, rejected: webRejected,
          assigned: webAssigned, assignedMeta: webAssignedMeta, assignedWebsite: webAssignedWebsite,
        },
        workedLeads: {
          total: wkTotal, completed: wkCompleted, pending: wkPending, rejected: wkRejected,
          interested: wkInterested, callback: wkCallback, notAnswering: wkNotAnswering,
          notReachable: wkNotReachable, wrongNumber: wkWrongNumber,
        },
        poolLeads:    { total: poolTotal },
        conversionRate: wkTotal > 0 ? +((wkCompleted / wkTotal) * 100).toFixed(1) : 0,
        interestRate:   wkTotal > 0 ? +((wkInterested / wkTotal) * 100).toFixed(1) : 0,
      },
      breakdown: { outcome: outcomeAgg, product: productAgg, source: sourceAgg },
      agents: agentAgg,
      trend: {
        domLeads:     dailyDomLeads.map(d => ({ date: `${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`, total: d.total, completed: d.completed })),
        websiteLeads: dailyWebLeads.map(d => ({ date: `${d._id.y}-${String(d._id.m).padStart(2,'0')}-${String(d._id.d).padStart(2,'0')}`, count: d.count, meta: d.meta || 0, website: d.website || 0 })),
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

//  DELETE routes (superadmin only) 

// DELETE /domestic-api/admin/users/:id  permanently delete a user
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

// DELETE /domestic-api/admin/leads/:id  delete a single worked lead (DomLead)
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

// DELETE /domestic-api/admin/import-batch/:batchId  delete unworked leads in a batch
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

    // Only delete UNWORKED leads  preserve leads the agent has already called/worked
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

// DELETE /domestic-api/admin/imported-lead/:id  delete a single imported lead
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

//  POST /domestic-api/admin/agents/transfer-leads 
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
    const now = new Date();

    // Transfer website leads (DomWebsiteLead.loadedBy)
    if (types.includes('website')) {
      const filter = { loadedBy: fromAgentId, status: { $in: ['loaded', 'pending'] } };
      const r = await DomWebsiteLead.updateMany(filter, {
        $set: { loadedBy: toAgentId, loadedAt: now, assignedTo: toAgentId },
        $push: { assignmentHistory: { agent: toAgentId, assignedAt: now } },
      });
      results.websiteLeads = r.modifiedCount;
    }

    // Transfer pool / imported leads (DomImportedLead.assignedTo)
    if (types.includes('pool')) {
      const filter = { assignedTo: fromAgentId };
      if (!workedOnly) filter.workStatus = 'new';   // only unworked by default
      const r = await DomImportedLead.updateMany(filter, {
        $set: { assignedTo: toAgentId, assignedBy: req.user._id, assignedAt: now },
        $push: { assignmentHistory: { agent: toAgentId, assignedAt: now } },
      });
      results.poolLeads = r.modifiedCount;
    }

    // Transfer worked DomLeads (optional  admin explicitly requests)
    if (types.includes('worked')) {
      const r = await DomLead.updateMany(
        { assignedTo: fromAgentId },
        {
          $set: { assignedTo: toAgentId, assignedAt: now, lastUpdatedBy: req.user._id },
          $push: { assignmentHistory: { agent: toAgentId, assignedAt: now } },
        }
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

//  GET /domestic-api/admin/agent-dom-leads 
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

//  POST /domestic-api/admin/bulk-reassign-leads 
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

    const now = new Date();

    // Fetch source IDs so we can reassign all 3 layers
    const domLeadDocs = await DomLead.find({ _id: { $in: leadIds } })
      .select('sourceWebsiteLead sourceImportedLead')
      .lean();

    const websiteLeadIds  = domLeadDocs.map(l => l.sourceWebsiteLead).filter(Boolean);
    const importedLeadIds = domLeadDocs.map(l => l.sourceImportedLead).filter(Boolean);

    // 1. Update DomLead.assignedTo for all leads
    await DomLead.updateMany(
      { _id: { $in: leadIds } },
      {
        $set: { assignedTo: toAgentId, lastUpdatedBy: req.user._id, assignedAt: now },
        $push: { assignmentHistory: { agent: toAgentId, assignedAt: now } },
      }
    );

    // 2. Update DomWebsiteLead:
    //     loadedBy   agent dashboard uses loadedBy to find "my leads"
    //     assignedTo  for consistency
    //     status = 'loaded'  must be 'loaded' for agent to see it
    // ALSO clear sourceWebsiteLead on the DomLead so isWorked=false for the new agent
    // (isWorked is computed: DomLead.find({ assignedTo:newAgent, sourceWebsiteLead:{$ne:null} }))
    if (websiteLeadIds.length > 0) {
      await DomWebsiteLead.updateMany(
        { _id: { $in: websiteLeadIds } },
        {
          $set: { assignedTo: toAgentId, loadedBy: toAgentId, loadedAt: now, status: 'loaded' },
          $push: { assignmentHistory: { agent: toAgentId, assignedAt: now } },
        }
      );
      // Unlink website source from DomLead so isWorked=false for new agent
      // (the DomLead is kept as historical record with assignedTo=newAgent)
      await DomLead.updateMany(
        { sourceWebsiteLead: { $in: websiteLeadIds } },
        { $set: { sourceWebsiteLead: null } }
      );
    }

    // 3. Update DomImportedLead:
    //     assignedTo  agent dashboard filters by assignedTo
    //     status = 'assigned'  must be 'assigned' for agent to see it
    //     workStatus = 'new'  makes it appear in "Assigned to Work" tab
    if (importedLeadIds.length > 0) {
      await DomImportedLead.updateMany(
        { _id: { $in: importedLeadIds } },
        {
          $set: { assignedTo: toAgentId, assignedBy: req.user._id, assignedAt: now, status: 'assigned', workStatus: 'new' },
          $push: { assignmentHistory: { agent: toAgentId, assignedAt: now } },
        }
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


const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function debugStatsHandler() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const Lead = require('./models/Lead');
  const Organization = require('./models/Organization');
  const cache = require('./utils/cache');

  const jake = await User.findOne({ email: /jake/i });
  console.log('Jake user:', jake.name, jake.role, jake.organization);

  const req = {
    user: jake,
    query: { _t: Date.now().toString() }
  };

  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { console.log('JSON returned:', data); }
  };

  // Run exact code from router.get('/dashboard/stats')
  try {
    const { role, _id: userId } = req.user;

    // Helper functions from leads.js
    const resolveDidFilter = async (didParam, user) => {
      if (!didParam || !String(didParam).trim() || didParam === 'all') return null;
      const raw = String(didParam).trim();
      if (raw === 'inbound' || raw === 'inbound-call' || raw === 'inbound_call') {
        const orgId = user?.organization?._id || user?.organization;
        const org = orgId ? await Organization.findById(orgId).select('inboundCallsDid inboundDids').lean() : null;
        return org?.inboundCallsDid || (org?.inboundDids && org.inboundDids[1]) || '19162330139';
      }
      if (raw === 'live_transfer' || raw === 'live-transfer' || raw === 'live') {
        const orgId = user?.organization?._id || user?.organization;
        const org = orgId ? await Organization.findById(orgId).select('liveTransferDid inboundDids').lean() : null;
        return org?.liveTransferDid || (org?.inboundDids && org.inboundDids[0]) || '19162330004';
      }
      return raw;
    };

    const buildAdminLeadScopeFilter = async (user) => {
      const adminOrg = await Organization.findById(user.organization)
        .select('name sourceIds inboundDids')
        .lean();
      if (!adminOrg) return { organization: user.organization };
      if (adminOrg.name === 'REDDINGTON GLOBAL CONSULTANCY') return null;
      const hasSourceIds = Array.isArray(adminOrg.sourceIds) && adminOrg.sourceIds.length > 0;
      const hasInboundDids = Array.isArray(adminOrg.inboundDids) && adminOrg.inboundDids.length > 0;
      
      const orgConditions = [{ organization: user.organization }];
      if (hasSourceIds) orgConditions.push({ sourceId: { $in: adminOrg.sourceIds } });
      if (hasInboundDids) orgConditions.push({ vicidialDid: { $in: adminOrg.inboundDids } });
      
      if (orgConditions.length === 1) return orgConditions[0];
      return { $or: orgConditions };
    };

    const resolvedDid = await resolveDidFilter(req.query.did || req.query.vicidialDid, req.user);
    const didSuffix = resolvedDid ? `:did_${resolvedDid}` : '';

    let filter = {};
    let effectiveBaseFilter = {};

    let stats;
    if (role === 'admin') {
      const adminOrganization = await Organization.findById(req.user.organization).select('name').lean();
      const isReddingtonAdmin = adminOrganization && adminOrganization.name === 'REDDINGTON GLOBAL CONSULTANCY';
      const scopeFilter = await buildAdminLeadScopeFilter(req.user);
      let orgFilter = scopeFilter === null ? {} : scopeFilter;

      if (resolvedDid) {
        if (orgFilter.$or) {
          orgFilter = { $and: [orgFilter, { vicidialDid: resolvedDid }] };
        } else {
          orgFilter = { ...orgFilter, vicidialDid: resolvedDid };
        }
      }

      effectiveBaseFilter = orgFilter;

      // Aggregation in leads.js
      console.log('Running aggregation with match:', JSON.stringify(orgFilter));
      const aggregationResults = await Lead.aggregate([
        { $match: orgFilter },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byQualification: [
              { $group: { _id: '$qualificationStatus', count: { $sum: 1 } } }
            ],
            pendingActive: [
              { $match: { qualificationStatus: 'pending', isDisposed: { $ne: true } } },
              { $count: 'count' }
            ],
            disposed: [
              { $match: { isDisposed: true } },
              { $count: 'count' }
            ],
            sales: [
              { $match: { leadProgressStatus: { $in: ['SALE', 'Immediate Enrollment', 'Sale Long Play'] } } },
              { $count: 'count' }
            ]
          }
        }
      ]);

      const results = aggregationResults[0];
      const total = results.total[0]?.count || 0;
      
      const statusMap = {};
      results.byStatus.forEach(item => {
        statusMap[item._id] = item.count;
      });
      
      const qualMap = {};
      results.byQualification.forEach(item => {
        qualMap[item._id] = item.count;
      });
      
      const newLeads = statusMap.new || 0;
      const qualified = qualMap.qualified || 0;
      const notQualified = (qualMap['not-qualified'] || 0) + (qualMap.disqualified || 0) + (qualMap.unqualified || 0);
      const pending = results.pendingActive[0]?.count || 0;
      const disposedLeads = results.disposed[0]?.count || 0;
      const followUp = statusMap['follow-up'] || 0;
      const converted = statusMap.converted || 0;
      const closed = statusMap.closed || 0;
      const immediateEnrollment = results.sales[0]?.count || 0;

      // REDDINGTON admin sees all agents; other admins see only their org's agents
      const agentFilter = isReddingtonAdmin
        ? { role: { $in: ['agent1', 'agent2'] }, isActive: { $ne: false } }
        : { organization: req.user.organization, role: { $in: ['agent1', 'agent2'] }, isActive: { $ne: false } };
      const activeAgents = await User.countDocuments(agentFilter);

      // Calculate conversion rate: (SALE calls ÷ Qualified leads) × 100
      const conversionRate = qualified > 0 ? ((immediateEnrollment / qualified) * 100).toFixed(2) : 0;

      stats = {
        totalLeads: total,
        newLeads,
        qualified,
        qualifiedLeads: qualified,
        notQualifiedLeads: notQualified,
        pendingLeads: pending,
        disposedLeads,
        followUp,
        converted,
        closed,
        immediateEnrollmentLeads: immediateEnrollment,
        conversionRate: conversionRate,
        activeAgents
      };

      const { getEasternTimeRanges, formatEasternTime, getEasternNow } = require('./utils/dateUtils');
      const { today, thisWeek, thisMonth } = getEasternTimeRanges();

      const timeFilters = [
        { createdAt: { $gte: today }, ...effectiveBaseFilter },
        { createdAt: { $gte: thisWeek }, ...effectiveBaseFilter },
        { createdAt: { $gte: thisMonth }, ...effectiveBaseFilter }
      ];

      const [todayStats, weekStats, monthStats] = await Promise.all([
        Lead.countDocuments(timeFilters[0]),
        Lead.countDocuments(timeFilters[1]),
        Lead.countDocuments(timeFilters[2])
      ]);

      const { todayEnd } = getEasternTimeRanges();
      
      const todayFollowUps = await Lead.countDocuments({
        followUpDate: {
          $gte: today,
          $lt: todayEnd
        },
        ...effectiveBaseFilter
      });

      const response = {
        ...stats,
        todayLeads: todayStats,
        weekLeads: weekStats,
        monthLeads: monthStats,
        todayFollowUps,
        userRole: role,
        lastUpdated: formatEasternTime(getEasternNow())
      };

      console.log('Final response stats:', response);
    }
  } catch (err) {
    console.error('STACK TRACE:', err);
  }

  await mongoose.disconnect();
}

debugStatsHandler().catch(console.error);


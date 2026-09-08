const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function testStatsCall() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const Lead = require('./models/Lead');
  const Organization = require('./models/Organization');
  const cache = require('./utils/cache');

  const user = await User.findOne({ email: /jake/i });
  console.log('Jake user:', user.name, user.role, user.organization);

  const req = {
    user: user,
    query: { _t: Date.now().toString() }
  };

  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(data) { console.log('Response status:', this.statusCode, 'Data keys:', Object.keys(data)); }
  };

  // Import router/middleware logic directly or test route handler
  try {
    const role = req.user.role;
    const userId = req.user._id;
    const Organization = require('./models/Organization');

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
      if (adminOrg.name === 'REDDINGTON GLOBAL CONSULTANCY') return null; // no restriction
      const hasSourceIds = Array.isArray(adminOrg.sourceIds) && adminOrg.sourceIds.length > 0;
      const hasInboundDids = Array.isArray(adminOrg.inboundDids) && adminOrg.inboundDids.length > 0;
      
      const orgConditions = [{ organization: user.organization }];
      if (hasSourceIds) orgConditions.push({ sourceId: { $in: adminOrg.sourceIds } });
      if (hasInboundDids) orgConditions.push({ vicidialDid: { $in: adminOrg.inboundDids } });
      
      if (orgConditions.length === 1) return orgConditions[0];
      return { $or: orgConditions };
    };

    const resolvedDid = await resolveDidFilter(req.query.did || req.query.vicidialDid, req.user);
    console.log('resolvedDid:', resolvedDid);

    let filter = {};
    let effectiveBaseFilter = {};

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
    console.log('effectiveBaseFilter:', JSON.stringify(effectiveBaseFilter));

    // Test aggregation in leads.js stats
    const totalLeads = await Lead.countDocuments(effectiveBaseFilter);
    console.log('totalLeads:', totalLeads);

  } catch (err) {
    console.error('Error in stats test:', err);
  }

  await mongoose.disconnect();
}

testStatsCall().catch(console.error);

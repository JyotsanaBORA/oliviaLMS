const express = require('express');
const querystring = require('querystring');
const mongoose = require('mongoose');
const InboundData = require('../../models/InboundData');
const Organization = require('../../models/Organization');
const User = require('../../models/User');
const Lead = require('../../models/Lead');
const { findLeadForEnrichment, enrichLeadWithPayload } = require('../../utils/leadEnrichment');
const { protect } = require('../../middleware/auth');
const { getEasternStartOfDay, getEasternEndOfDay } = require('../../utils/timeFilters');

const router = express.Router();

const MAIN_ORG = (process.env.MAIN_ORG_NAME || 'REDDINGTON GLOBAL CONSULTANCY').trim().toUpperCase();

/**
 * Parse raw string payload from Vicidial or webhooks into an object.
 */
function parseStringPayload(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const trimmed = raw.trim();

  // JSON string
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch (_) { /* continue */ }
  }

  // URL-encoded query string
  if (trimmed.includes('=')) {
    const parsed = querystring.parse(trimmed);
    const keys = Object.keys(parsed);
    if (keys.length > 0 && keys[0] !== trimmed) {
      return parsed;
    }
  }

  // Delimited with header
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2) {
    const delimiter = lines[0].includes('|') ? '|' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const values = lines[1].split(delimiter).map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  }

  // Positional fallback
  if (trimmed.includes('|') || trimmed.includes(',')) {
    const delimiter = trimmed.includes('|') ? '|' : ',';
    const parts = trimmed.split(delimiter).map(v => v.trim());
    return {
      campaign_name: parts[0] || '',
      did: parts[1] || '',
      phone_number: parts[2] || '',
      status: parts[3] || '',
    };
  }

  return { raw_data: trimmed };
}

/**
 * Helper to determine user access level & DID filters.
 */
const getInboundAccess = async (user) => {
  if (!user) return { allowed: false };
  
  if (user.role === 'superadmin') {
    return { allowed: true, canWrite: true, isGlobal: true, orgFilter: null, allowedDids: null };
  }

  const orgId = user.organization?._id || user.organization;
  if (!orgId) return { allowed: false };

  const org = await Organization.findById(orgId).lean();
  if (!org) return { allowed: false };

  const orgName = (org.name || '').trim().toUpperCase();
  const isGlobal = orgName === MAIN_ORG || orgName.includes('REDDINGTON') || String(org._id) === '68b9c76d2c29dac1220cb81c';

  if (isGlobal) {
    return { allowed: true, canWrite: true, isGlobal: true, orgFilter: null, allowedDids: null };
  }

  // Non-Reddington org (e.g. Jake, Jake 2, Partner orgs)
  const orgDids = [
    ...(org.inboundDids || []),
    org.inboundCallsDid,
    org.liveTransferDid
  ].filter(Boolean);

  const canWrite = user.role === 'agent2' || user.role === 'agent1';

  return {
    allowed: true,
    canWrite: canWrite, // Org admins get read-only unless agent role
    isGlobal: false,
    orgFilter: org._id,
    orgName: org.name,
    allowedDids: orgDids,
  };
};

const fs = require('fs');
const path = require('path');

// Temporary debug logger file for live testing with ViciDial
const DEBUG_LOG_FILE = path.join(__dirname, '../../inbound_api_debug.log');

/**
 * Temporary file logger helper.
 * Appends human-readable structured logs to inbound_api_debug.log.
 */
function logInboundDebug(type, details) {
  try {
    const timestamp = new Date().toISOString();
    const divider = '='.repeat(80);
    const subDivider = '-'.repeat(80);
    let content = '';

    if (type === 'INCOMING_REQUEST') {
      content = `\n${divider}\n` +
        `[${timestamp}] 📥 INCOMING INBOUND REQUEST\n` +
        `Method: ${details.method}\n` +
        `URL: ${details.url}\n` +
        `IP: ${details.ip}\n` +
        `User-Agent: ${details.userAgent}\n` +
        `Content-Type: ${details.contentType}\n` +
        `Query Parameters:\n${JSON.stringify(details.query, null, 2)}\n` +
        `Body (Raw/Parsed):\n${typeof details.body === 'object' ? JSON.stringify(details.body, null, 2) : String(details.body)}\n` +
        `Merged Payload:\n${JSON.stringify(details.mergedPayload, null, 2)}\n` +
        `${subDivider}\n`;
    } else if (type === 'SUCCESS_RESPONSE') {
      content = `[${timestamp}] ✅ SUCCESS (Status ${details.statusCode})\n` +
        `Saved Inbound Record ID: ${details.savedId}\n` +
        `Matched Organization: ${details.matchedOrgName || 'None'} (ID: ${details.matchedOrgId || 'N/A'})\n` +
        `Matched Agent: ${details.matchedAgentName || 'None'} (ID: ${details.matchedAgentId || 'N/A'})\n` +
        `Response Sent:\n${JSON.stringify(details.response, null, 2)}\n` +
        `${divider}\n\n`;
    } else if (type === 'VALIDATION_ERROR') {
      content = `[${timestamp}] ⚠️ VALIDATION ERROR (Status ${details.statusCode})\n` +
        `Reason: ${details.message}\n` +
        `Response Sent:\n${JSON.stringify(details.response, null, 2)}\n` +
        `${divider}\n\n`;
    } else if (type === 'SERVER_ERROR') {
      content = `[${timestamp}] ❌ SERVER ERROR (Status ${details.statusCode || 500})\n` +
        `Error Message: ${details.errorMessage}\n` +
        `Stack: ${details.stack || 'No stack'}\n` +
        `Response Sent:\n${JSON.stringify(details.response, null, 2)}\n` +
        `${divider}\n\n`;
    } else {
      content = `[${timestamp}] [${type}]\n${JSON.stringify(details, null, 2)}\n`;
    }

    fs.appendFileSync(DEBUG_LOG_FILE, content, 'utf8');
  } catch (logErr) {
    console.error('⚠️ [Inbound Logger] Failed to write to inbound_api_debug.log:', logErr.message);
  }
}

// ===========================================================================
// PUBLIC INGESTION ENDPOINTS (Option A - No Auth required)
// POST & GET /call-data  (e.g., /api/inbound/call-data or /api/inbound-data/call-data)
// ===========================================================================
const handleInboundIngestion = async (req, res) => {
  const requestStartTime = Date.now();
  let mergedPayload = {};

  try {
    const parsedBody = typeof req.body === 'string' ? parseStringPayload(req.body) : (req.body || {});
    // Merge query parameters and body so query parameters work for both GET and POST seamlessly
    mergedPayload = {
      ...(parsedBody || {}),
      ...(req.query || {})
    };

    // Log the incoming request immediately to debug log file
    logInboundDebug('INCOMING_REQUEST', {
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown',
      contentType: req.headers['content-type'] || 'None',
      query: req.query || {},
      body: req.body || {},
      mergedPayload: mergedPayload
    });

    console.log(`[Inbound API ${req.method}] Ingestion received:`, JSON.stringify(mergedPayload).substring(0, 400));

    // Extract core fields
    const campaignName = (
      mergedPayload.campaign_name || mergedPayload.campaignName || mergedPayload.campaign || mergedPayload.campaign_id || mergedPayload.group || mergedPayload.ingroup || ''
    ).toString().trim();

    const did = (
      mergedPayload.did || mergedPayload.DID || mergedPayload.inbound_did || mergedPayload.inboundDid || mergedPayload.vicidial_did || mergedPayload.vicidialDid || ''
    ).toString().trim();

    let phoneNumber = (
      mergedPayload.phone_number || mergedPayload.phoneNumber || mergedPayload.phone || mergedPayload.caller_id || mergedPayload.callerId || mergedPayload.called || ''
    ).toString().trim();

    // Sanitize phone number digits
    if (phoneNumber) {
      let digits = phoneNumber.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('1')) {
        digits = digits.substring(1);
      }
      phoneNumber = digits || phoneNumber;
    }

    if (!phoneNumber && !did) {
      const errorResp = {
        success: false,
        message: 'At least phone_number or did is required.',
      };
      logInboundDebug('VALIDATION_ERROR', {
        statusCode: 400,
        message: 'Missing phone_number and did in request payload/query',
        response: errorResp
      });
      return res.status(400).json(errorResp);
    }

    // Optional caller details
    const firstName = (mergedPayload.first_name || mergedPayload.firstName || '').toString().trim();
    const lastName = (mergedPayload.last_name || mergedPayload.lastName || '').toString().trim();
    const callerName = (
      mergedPayload.caller_name || mergedPayload.callerName || mergedPayload.name || mergedPayload.full_name ||
      [firstName, lastName].filter(Boolean).join(' ') || ''
    ).trim();

    const email = (mergedPayload.email || mergedPayload.emailAddress || '').toString().trim().toLowerCase();
    const address = (mergedPayload.address || mergedPayload.address1 || mergedPayload.streetAddress || '').toString().trim();
    const city = (mergedPayload.city || '').toString().trim();
    const state = (mergedPayload.state || '').toString().trim();
    const zipcode = (mergedPayload.zipcode || mergedPayload.zipCode || mergedPayload.zip || mergedPayload.postal_code || '').toString().trim();
    const notes = (mergedPayload.notes || mergedPayload.comments || mergedPayload.message || '').toString().trim();
    const rawDebt = mergedPayload.totalDebtAmount !== undefined ? mergedPayload.totalDebtAmount : mergedPayload.debtAmount;
    const totalDebtAmount = rawDebt ? Number(String(rawDebt).replace(/[^0-9.]/g, '')) : undefined;

    const callStatus = (mergedPayload.status || mergedPayload.call_status || mergedPayload.callStatus || 'RECEIVED').toString().trim().toUpperCase();

    // Look up matching Organization by DID
    let matchedOrg = null;
    if (did) {
      matchedOrg = await Organization.findOne({
        $or: [
          { inboundDids: did },
          { inboundCallsDid: did },
          { liveTransferDid: did }
        ],
        isActive: true
      }).select('_id name inboundDids liveTransferDid inboundCallsDid').lean();

      if (matchedOrg) {
        console.log(`✅ [Inbound API] DID ${did} matched Organization: ${matchedOrg.name}`);
      } else {
        console.log(`ℹ️ [Inbound API] DID ${did} has no matching organization assigned`);
      }
    }

    // Optional Agent lookup
    const rawAgentId = (mergedPayload.agent_id || mergedPayload.agentId || mergedPayload.user || mergedPayload.agent || '').toString().trim();
    let matchedAgent = null;
    if (rawAgentId) {
      const isObjectId = mongoose.isValidObjectId(rawAgentId);
      matchedAgent = await User.findOne({
        $or: [
          { vicidialAgentId: rawAgentId },
          ...(isObjectId ? [{ _id: rawAgentId }] : [])
        ],
        isActive: true
      }).select('_id name role organization').lean();
    }

    // Build document
    const inboundDoc = {
      campaignName: campaignName || undefined,
      did: did || undefined,
      phoneNumber: phoneNumber || undefined,
      callStatus: callStatus || 'RECEIVED',
      callerName: callerName || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: email || undefined,
      address: address || undefined,
      city: city || undefined,
      state: state || undefined,
      zipcode: zipcode || undefined,
      totalDebtAmount: !isNaN(totalDebtAmount) ? totalDebtAmount : undefined,
      notes: notes || undefined,
      organization: matchedOrg ? matchedOrg._id : (matchedAgent?.organization || undefined),
      agent: matchedAgent ? matchedAgent._id : undefined,
      rawPayload: mergedPayload,
      receivedAt: new Date(),
    };

    const savedRecord = await InboundData.create(inboundDoc);
    console.log(`💾 [Inbound API] Saved InboundData record ID: ${savedRecord._id}`);

    // Automatically create or update corresponding primary LMS Lead
    let createdLead = null;
    if (phoneNumber) {
      try {
        const leadOrgId = matchedOrg ? matchedOrg._id : (matchedAgent?.organization || undefined);
        
        let existingLead = await findLeadForEnrichment(phoneNumber, leadOrgId);

        if (existingLead) {
          const inboundEnrichPayload = {
            name: callerName || [firstName, lastName].filter(Boolean).join(' ') || undefined,
            email: email || undefined,
            address: address || undefined,
            city: city || undefined,
            state: state || undefined,
            zipcode: zipcode || undefined,
            totalDebtAmount: !isNaN(totalDebtAmount) ? totalDebtAmount : undefined,
            notes: notes || (campaignName ? `Inbound call from campaign: ${campaignName}` : undefined),
            vicidialDid: did || undefined,
            vicidialCampaignName: campaignName || undefined,
          };
          enrichLeadWithPayload(existingLead, inboundEnrichPayload);
          createdLead = await existingLead.save();
          console.log(`🔄 [Inbound API] Updated/Enriched existing Lead ID: ${createdLead._id} (${createdLead.leadId || 'N/A'})`);
        } else {
          const resolvedOrgId = leadOrgId || '68b9c76d2c29dac1220cb81c';
          let creatorId = matchedAgent ? matchedAgent._id : undefined;
          if (!creatorId) {
            const orgAdmin = await User.findOne({ organization: resolvedOrgId, role: 'admin' }).select('_id');
            if (orgAdmin) {
              creatorId = orgAdmin._id;
            } else {
              const superAdmin = await User.findOne({ role: 'superadmin' }).select('_id');
              creatorId = superAdmin?._id;
            }
          }

          const newLeadData = {
            name: callerName || [firstName, lastName].filter(Boolean).join(' ') || 'Inbound Caller',
            phone: phoneNumber,
            email: email || undefined,
            address: address || undefined,
            city: city || undefined,
            state: state || undefined,
            zipcode: zipcode || undefined,
            totalDebtAmount: !isNaN(totalDebtAmount) ? totalDebtAmount : undefined,
            notes: notes || (campaignName ? `Inbound call from campaign: ${campaignName}` : undefined),
            vicidialDid: did || undefined,
            vicidialCampaignName: campaignName || undefined,
            source: 'Inbound Call',
            sourceId: did ? `Inbound-${did}` : 'InboundCall',
            organization: resolvedOrgId,
            createdBy: creatorId,
            assignedTo: matchedAgent ? matchedAgent._id : undefined,
            qualificationStatus: 'pending',
            category: 'warm',
            status: 'new',
          };
          createdLead = await Lead.create(newLeadData);
          console.log(`✨ [Inbound API] Automatically created LMS Lead ID: ${createdLead._id} (LeadID: ${createdLead.leadId || 'Pending'})`);
        }

        if (createdLead) {
          savedRecord.importedLeadId = createdLead._id;
          await savedRecord.save();
        }
      } catch (leadErr) {
        console.error('⚠️ [Inbound API] Failed to auto-create primary lead:', leadErr.message);
      }
    }

    // Real-time notification push via Socket.IO
    if (req.io) {
      if (createdLead) {
        req.io.emit('newLead', createdLead);
        req.io.emit('leadUpdated', createdLead);
      }

      const socketPayload = {
        _id: savedRecord._id,
        campaignName: savedRecord.campaignName,
        did: savedRecord.did,
        phoneNumber: savedRecord.phoneNumber,
        callerName: savedRecord.callerName,
        callStatus: savedRecord.callStatus,
        organization: savedRecord.organization,
        organizationName: matchedOrg?.name || 'Unassigned',
        importedLeadId: savedRecord.importedLeadId,
        receivedAt: savedRecord.receivedAt,
      };

      // Broadcast to admins and agents
      req.io.emit('newInboundData', socketPayload);
      console.log('📡 [Inbound API] Dispatched newInboundData socket event');

      // If specific agent is linked, push to agent
      if (matchedAgent && req.socketOptimizer) {
        req.socketOptimizer.emitToUser(
          matchedAgent._id.toString(),
          matchedAgent.role,
          'inboundCallReceived',
          socketPayload
        );
      }
    }

    const successResponse = {
      success: true,
      message: 'Inbound call recorded successfully',
      id: savedRecord._id,
      leadId: createdLead?._id || null,
      organization: matchedOrg?.name || null,
      did: savedRecord.did,
    };

    // Log success to debug file
    logInboundDebug('SUCCESS_RESPONSE', {
      statusCode: 200,
      savedId: savedRecord._id,
      matchedOrgName: matchedOrg?.name,
      matchedOrgId: matchedOrg?._id,
      matchedAgentName: matchedAgent?.name,
      matchedAgentId: matchedAgent?._id,
      response: successResponse,
      durationMs: Date.now() - requestStartTime
    });

    return res.status(200).json(successResponse);
  } catch (error) {
    console.error('❌ [Inbound API] Ingestion Error:', error);

    const errorResponse = {
      success: false,
      message: 'Internal server error recording inbound call',
    };

    // Log internal error to debug file
    logInboundDebug('SERVER_ERROR', {
      statusCode: 500,
      errorMessage: error.message,
      stack: error.stack,
      response: errorResponse,
      durationMs: Date.now() - requestStartTime
    });

    return res.status(500).json(errorResponse);
  }
};

router.post('/call-data', handleInboundIngestion);
router.get('/call-data', handleInboundIngestion);

// Alternative aliases
router.post('/call', handleInboundIngestion);
router.get('/call', handleInboundIngestion);


// ===========================================================================
// PROTECTED LMS ENDPOINTS (Admin & Agent dashboard access)
// ===========================================================================

/**
 * GET /api/inbound
 * Fetch paginated inbound calls with filtering and DID segregation.
 */
router.get('/', protect, async (req, res) => {
  try {
    const access = await getInboundAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const filter = { isDeleted: { $ne: true } };

    // DID & Organization segregation
    if (!access.isGlobal) {
      // Restricted Org Admin (e.g. Jake, Jake 2, Partner orgs)
      const didList = access.allowedDids || [];
      if (didList.length > 0) {
        filter.$or = [
          { organization: access.orgFilter },
          { did: { $in: didList } }
        ];
      } else {
        filter.organization = access.orgFilter;
      }
    } else {
      // Global Admin (SuperAdmin / Reddington)
      if (req.query.organizationId) {
        filter.organization = req.query.organizationId;
      }
      if (req.query.orgName) {
        const matchOrgs = await Organization.find({
          name: { $regex: req.query.orgName.trim(), $options: 'i' }
        }).select('_id').lean();
        if (matchOrgs.length > 0) {
          filter.organization = { $in: matchOrgs.map(o => o._id) };
        }
      }
    }

    // Specific DID filter
    if (req.query.did && req.query.did.trim()) {
      const explicitDid = req.query.did.trim();
      // Verify if restricted admin is allowed this DID
      if (access.isGlobal || (access.allowedDids && access.allowedDids.includes(explicitDid))) {
        filter.did = explicitDid;
      }
    }

    // Campaign filter
    if (req.query.campaign && req.query.campaign.trim()) {
      filter.campaignName = { $regex: req.query.campaign.trim(), $options: 'i' };
    }

    // Call status / disposition filter
    if (req.query.status && req.query.status.trim()) {
      filter.callStatus = req.query.status.trim().toUpperCase();
    }

    if (req.query.leadProgressStatus && req.query.leadProgressStatus.trim()) {
      filter.leadProgressStatus = req.query.leadProgressStatus.trim();
    }

    // Date range filter
    if (req.query.dateFrom || req.query.dateTo) {
      filter.receivedAt = {};
      if (req.query.dateFrom) {
        filter.receivedAt.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo) {
        const dTo = new Date(req.query.dateTo);
        dTo.setHours(23, 59, 59, 999);
        filter.receivedAt.$lte = dTo;
      }
    }

    // Search term
    if (req.query.search && req.query.search.trim()) {
      const term = req.query.search.trim();
      const phoneDigits = term.replace(/\D/g, '');
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [
          { phoneNumber: { $regex: phoneDigits || term, $options: 'i' } },
          { did: { $regex: term, $options: 'i' } },
          { campaignName: { $regex: term, $options: 'i' } },
          { callerName: { $regex: term, $options: 'i' } },
          { email: { $regex: term, $options: 'i' } },
          { notes: { $regex: term, $options: 'i' } },
        ]
      });
    }

    const [calls, total] = await Promise.all([
      InboundData.find(filter)
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('organization', 'name inboundDids liveTransferDid inboundCallsDid')
        .populate('agent', 'name role')
        .populate('importedLeadId', 'leadId name status category')
        .lean(),
      InboundData.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        calls,
        total,
        page,
        totalPages: Math.ceil(total / limit) || 1,
        canWrite: access.canWrite,
        isGlobal: access.isGlobal,
        allowedDids: access.allowedDids || [],
      }
    });
  } catch (error) {
    console.error('❌ [Inbound API] Error fetching inbound calls:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch inbound calls' });
  }
});

/**
 * GET /api/inbound/stats
 * Stats for badges and dashboard summaries.
 */
router.get('/stats', protect, async (req, res) => {
  try {
    const access = await getInboundAccess(req.user);
    if (!access.allowed) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const filter = { isDeleted: { $ne: true } };
    if (!access.isGlobal) {
      const didList = access.allowedDids || [];
      if (didList.length > 0) {
        filter.$or = [
          { organization: access.orgFilter },
          { did: { $in: didList } }
        ];
      } else {
        filter.organization = access.orgFilter;
      }
    }

    const todayStart = getEasternStartOfDay();
    const todayEnd = getEasternEndOfDay();

    const [totalCalls, todayCalls, newCalls, convertedCalls] = await Promise.all([
      InboundData.countDocuments(filter),
      InboundData.countDocuments({ ...filter, receivedAt: { $gte: todayStart, $lte: todayEnd } }),
      InboundData.countDocuments({ ...filter, callStatus: 'RECEIVED' }),
      InboundData.countDocuments({ ...filter, callStatus: 'CONVERTED' }),
    ]);

    return res.status(200).json({
      success: true,
      stats: {
        totalCalls,
        todayCalls,
        newCalls,
        convertedCalls,
      }
    });
  } catch (error) {
    console.error('❌ [Inbound API] Error fetching stats:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
});

/**
 * PUT /api/inbound/:id/disposition
 * Allows Agent 2 or Admin to update the disposition, progress status, and notes.
 */
router.put('/:id/disposition', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      leadProgressStatus,
      notes,
      callStatus,
      totalDebtAmount,
      callerName,
      email,
      address,
      city,
      state,
      zipcode
    } = req.body;

    const callRecord = await InboundData.findById(id);
    if (!callRecord) {
      return res.status(404).json({ success: false, message: 'Inbound record not found' });
    }

    const updateFields = {
      updatedBy: req.user.name || req.user.email || 'Agent 2',
      agentLastAction: req.user.name ? `${req.user.name} (${req.user.role})` : 'Agent 2',
    };

    if (leadProgressStatus !== undefined) updateFields.leadProgressStatus = leadProgressStatus;
    if (notes !== undefined) updateFields.notes = notes;
    if (callStatus !== undefined) updateFields.callStatus = callStatus;
    else if (leadProgressStatus) updateFields.callStatus = 'DISPOSITIONED';

    if (callerName !== undefined) updateFields.callerName = callerName;
    if (email !== undefined) updateFields.email = email;
    if (address !== undefined) updateFields.address = address;
    if (city !== undefined) updateFields.city = city;
    if (state !== undefined) updateFields.state = state;
    if (zipcode !== undefined) updateFields.zipcode = zipcode;
    if (totalDebtAmount !== undefined) {
      const num = Number(String(totalDebtAmount).replace(/[^0-9.]/g, ''));
      if (!isNaN(num)) updateFields.totalDebtAmount = num;
    }

    const updated = await InboundData.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true }
    ).populate('organization', 'name').populate('agent', 'name');

    return res.status(200).json({
      success: true,
      message: 'Disposition updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('❌ [Inbound API] Error updating disposition:', error);
    return res.status(500).json({ success: false, message: 'Failed to update disposition' });
  }
});

/**
 * POST /api/inbound/:id/convert-to-lead
 * Converts an InboundData record into a full primary LMS Lead.
 */
router.post('/:id/convert-to-lead', protect, async (req, res) => {
  try {
    const { id } = req.params;
    const inbound = await InboundData.findById(id).populate('organization');
    if (!inbound) {
      return res.status(404).json({ success: false, message: 'Inbound call record not found' });
    }

    const {
      name,
      phone,
      alternatePhone,
      email,
      address,
      city,
      state,
      zipcode,
      debtCategory,
      debtTypes,
      totalDebtAmount,
      numberOfCreditors,
      monthlyDebtPayment,
      creditScore,
      creditScoreRange,
      leadProgressStatus,
      notes,
    } = req.body;

    const leadPhone = phone || inbound.phoneNumber;
    if (!leadPhone) {
      return res.status(400).json({ success: false, message: 'Phone number is required to create a lead.' });
    }

    // Determine target organization
    const orgId = req.body.organizationId || inbound.organization?._id || req.user.organization?._id || req.user.organization;

    const newLeadData = {
      name: name || inbound.callerName || 'Inbound Caller',
      phone: leadPhone,
      alternatePhone: alternatePhone || undefined,
      email: email || inbound.email || undefined,
      address: address || inbound.address || undefined,
      city: city || inbound.city || undefined,
      state: state || inbound.state || undefined,
      zipcode: zipcode || inbound.zipcode || undefined,
      debtCategory: debtCategory || 'unsecured',
      debtTypes: Array.isArray(debtTypes) ? debtTypes : [],
      totalDebtAmount: totalDebtAmount !== undefined ? totalDebtAmount : inbound.totalDebtAmount,
      numberOfCreditors: numberOfCreditors || undefined,
      monthlyDebtPayment: monthlyDebtPayment || undefined,
      creditScore: creditScore || undefined,
      creditScoreRange: creditScoreRange || undefined,
      leadProgressStatus: leadProgressStatus || inbound.leadProgressStatus || undefined,
      notes: notes || inbound.notes || undefined,
      vicidialDid: inbound.did || undefined,
      vicidialCampaignName: inbound.campaignName || undefined,
      sourceId: inbound.did ? `Inbound-${inbound.did}` : 'InboundCall',
      source: 'Inbound Call',
      organization: orgId,
      assignedTo: req.user._id,
      createdBy: req.user._id,
      lastUpdatedBy: req.user.name || 'Agent 2',
      status: 'new',
    };

    const newLead = await Lead.create(newLeadData);

    // Update the InboundData record with the linked Lead ID and status
    inbound.importedLeadId = newLead._id;
    inbound.callStatus = 'CONVERTED';
    inbound.leadProgressStatus = newLead.leadProgressStatus || inbound.leadProgressStatus;
    inbound.updatedBy = req.user.name || 'Agent 2';
    await inbound.save();

    return res.status(201).json({
      success: true,
      message: 'Lead successfully created in LMS from inbound call',
      lead: newLead,
      inboundData: inbound,
    });
  } catch (error) {
    console.error('❌ [Inbound API] Error converting inbound call to lead:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create lead from inbound call',
    });
  }
});

/**
 * DELETE /api/inbound/:id
 * Soft deletes an inbound call record (Global Admin / SuperAdmin).
 */
router.delete('/:id', protect, async (req, res) => {
  try {
    const access = await getInboundAccess(req.user);
    if (!access.allowed || !access.canWrite) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const inbound = await InboundData.findById(req.params.id);
    if (!inbound || inbound.isDeleted === true) {
      return res.status(404).json({ success: false, message: 'Inbound record not found' });
    }

    inbound.isDeleted = true;
    inbound.deletedAt = new Date();
    inbound.deletedBy = req.user._id;
    await inbound.save();

    return res.status(200).json({
      success: true,
      message: 'Inbound record deleted successfully',
    });
  } catch (error) {
    console.error('❌ [Inbound API] Error deleting inbound record:', error);
    return res.status(500).json({ success: false, message: 'Failed to delete inbound record' });
  }
});

module.exports = router;

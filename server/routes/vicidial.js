const express = require('express');
const querystring = require('querystring');
const VicidialCall = require('../models/VicidialCall');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * Parse a raw string body from Vicidial into a key-value object.
 * Supports:
 *   1. URL-encoded query string: "agent_id=AGENT001&phone_number=1234567890&call_type=INBOUND"
 *   2. Pipe-delimited with header: "agent_id|phone_number|call_type\nAGENT001|1234567890|INBOUND"
 *   3. Comma-delimited with header: "agent_id,phone_number,call_type\nAGENT001,1234567890,INBOUND"
 *   4. Plain JSON string that wasn't parsed by express.json
 */
function parseStringPayload(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  const trimmed = raw.trim();

  // Try JSON first
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed); } catch (_) { /* not JSON, continue */ }
  }

  // URL-encoded query string (contains = and &)
  if (trimmed.includes('=')) {
    const parsed = querystring.parse(trimmed);
    // querystring.parse always returns an object; check it actually found keys
    const keys = Object.keys(parsed);
    if (keys.length > 0 && keys[0] !== trimmed) {
      return parsed;
    }
  }

  // Pipe-delimited or comma-delimited with header row
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  if (lines.length >= 2) {
    const delimiter = lines[0].includes('|') ? '|' : ',';
    const headers = lines[0].split(delimiter).map(h => h.trim());
    const values = lines[1].split(delimiter).map(v => v.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] || ''; });
    return obj;
  }

  // Single-line pipe or comma delimited (no header — use positional mapping)
  if (trimmed.includes('|') || trimmed.includes(',')) {
    const delimiter = trimmed.includes('|') ? '|' : ',';
    const parts = trimmed.split(delimiter).map(v => v.trim());
    // Best-effort positional mapping for common Vicidial field order
    return {
      agent_id: parts[0] || '',
      phone_number: parts[1] || '',
      call_type: parts[2] || 'inbound',
      first_name: parts[3] || '',
      last_name: parts[4] || '',
      campaign: parts[5] || '',
      call_id: parts[6] || '',
      status: parts[7] || '',
      email: parts[8] || '',
      address1: parts[9] || '',
      city: parts[10] || '',
      state: parts[11] || '',
      postal_code: parts[12] || '',
    };
  }

  // Fallback: return as-is in an object
  return { raw_data: trimmed };
}

// ============================================================
// POST /api/vicidial/call-data
// PUBLIC endpoint — Vicidial posts call data here (no auth)
// Accepts JSON, URL-encoded form data, AND raw strings
// ============================================================
router.post('/call-data', async (req, res) => {
  try {
    // If body is a string (text/plain), parse it into an object
    const payload = typeof req.body === 'string'
      ? parseStringPayload(req.body)
      : req.body;

    console.log('[Vicidial] Received call-data. Content-Type:', req.headers['content-type'], 'Parsed payload:', JSON.stringify(payload).substring(0, 500));

    // Extract fields from Vicidial payload (flexible field naming)
    const vicidialAgentId = (
      payload.agent_id || payload.agentId || payload.user || payload.agent || ''
    ).toString().trim();

    if (!vicidialAgentId) {
      return res.status(400).json({
        success: false,
        message: 'agent_id is required',
      });
    }

    const phoneNumber = (
      payload.phone_number || payload.phoneNumber || payload.phone || payload.called || ''
    ).toString().trim();

    const callType = (
      payload.call_type || payload.callType || payload.type || 'inbound'
    ).toString().trim().toLowerCase();

    const firstName = (payload.first_name || payload.firstName || '').toString().trim();
    const lastName = (payload.last_name || payload.lastName || '').toString().trim();
    const callerName = (
      payload.caller_name || payload.callerName || payload.full_name ||
      [firstName, lastName].filter(Boolean).join(' ') || ''
    ).trim();

    const callId = (
      payload.call_id || payload.callId || payload.uniqueid || payload.call_uuid || ''
    ).toString().trim();

    const campaignName = (
      payload.campaign || payload.campaignName || payload.campaign_id || ''
    ).toString().trim();

    // Look up the LMS user mapped to this Vicidial agent ID
    const agent = await User.findOne({
      vicidialAgentId: vicidialAgentId,
      isActive: true,
    }).populate('organization');

    // Build the call document
    const callData = {
      vicidialAgentId,
      phoneNumber,
      callerName: callerName || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: (payload.email || '').toString().trim() || undefined,
      address: (payload.address1 || payload.address || '').toString().trim() || undefined,
      city: (payload.city || '').toString().trim() || undefined,
      state: (payload.state || '').toString().trim() || undefined,
      zipcode: (payload.postal_code || payload.zipcode || payload.zip || '').toString().trim() || undefined,
      callType: callType === 'outbound' ? 'outbound' : 'inbound',
      callId: callId || undefined,
      campaignName: campaignName || undefined,
      listId: (payload.list_id || payload.listId || '').toString().trim() || undefined,
      vendorLeadCode: (payload.vendor_lead_code || payload.vendorLeadCode || '').toString().trim() || undefined,
      callStatus: (payload.status || payload.dispo || '').toString().trim() || undefined,
      rawPayload: payload,
      priority: callType === 'inbound' ? 'high' : 'normal',
      queueStatus: 'pending',
    };

    // If agent found, link to agent and organization
    if (agent) {
      callData.agent = agent._id;
      callData.organization = agent.organization?._id || agent.organization;
    }

    const vicidialCall = await VicidialCall.create(callData);

    // Real-time push via Socket.IO if agent is connected
    if (agent && req.io) {
      const callPayload = {
        _id: vicidialCall._id,
        vicidialAgentId,
        phoneNumber,
        callerName: callerName || 'Unknown',
        firstName,
        lastName,
        email: callData.email,
        address: callData.address,
        city: callData.city,
        state: callData.state,
        zipcode: callData.zipcode,
        callType: callData.callType,
        callId,
        campaignName,
        priority: callData.priority,
        receivedAt: vicidialCall.receivedAt,
      };

      console.log(`🔥 Real-time ViciDial call: Agent ${agent.name} answered call from ${phoneNumber}`);
      console.log(`📤 Pushing call data to agent via socket (will auto-open form in LMS)...`);

      // Use socketOptimizer to emit to the specific agent
      if (req.socketOptimizer) {
        // Try agent1 role first, then agent2
        req.socketOptimizer.emitToUser(agent._id.toString(), 'agent1', 'vicidialCallData', callPayload);
      } else {
        // Fallback: broadcast to user rooms
        req.io.emit('vicidialCallData', callPayload);
      }
    }

    // Always return 200 to Vicidial even if agent not found (we still store the data)
    return res.status(200).json({
      success: true,
      message: agent ? 'Call data received and pushed to agent' : 'Call data received (agent not mapped)',
      callId: vicidialCall._id,
      agentMapped: !!agent,
    });
  } catch (error) {
    console.error('Vicidial call-data error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error processing call data',
    });
  }
});

// ============================================================
// GET /api/vicidial/call-data
// PUBLIC endpoint — Vicidial URL push via query string (no auth)
// Accepts all fields as URL query parameters
// e.g. /api/vicidial/call-data?agent_id=4013&phone_number=1234567890&...
// ============================================================
router.get('/call-data', async (req, res) => {
  try {
    const payload = req.query;

    console.log('[Vicidial GET] Received call-data query params:', JSON.stringify(payload).substring(0, 500));

    const vicidialAgentId = (
      payload.agent_id || payload.agentId || payload.user || payload.agent || ''
    ).toString().trim();

    if (!vicidialAgentId) {
      return res.status(400).json({ success: false, message: 'agent_id is required' });
    }

    const phoneNumber = (
      payload.phone_number || payload.phoneNumber || payload.phone || payload.called || ''
    ).toString().trim();

    const callType = (
      payload.call_type || payload.callType || payload.type || 'inbound'
    ).toString().trim().toLowerCase();

    const firstName = (payload.first_name || payload.firstName || '').toString().trim();
    const lastName = (payload.last_name || payload.lastName || '').toString().trim();
    const callerName = (
      payload.caller_name || payload.callerName || payload.full_name ||
      [firstName, lastName].filter(Boolean).join(' ') || ''
    ).trim();

    const callId = (
      payload.call_id || payload.callId || payload.uniqueid || payload.call_uuid || ''
    ).toString().trim();

    const campaignName = (
      payload.campaign || payload.campaignName || payload.campaign_id || ''
    ).toString().trim();

    const agent = await User.findOne({
      vicidialAgentId: vicidialAgentId,
      isActive: true,
    }).populate('organization');

    const callData = {
      vicidialAgentId,
      phoneNumber,
      callerName: callerName || undefined,
      firstName: firstName || undefined,
      lastName: lastName || undefined,
      email: (payload.email || '').toString().trim() || undefined,
      address: (payload.address1 || payload.address || '').toString().trim() || undefined,
      city: (payload.city || '').toString().trim() || undefined,
      state: (payload.state || '').toString().trim() || undefined,
      zipcode: (payload.postal_code || payload.zipcode || payload.zip || '').toString().trim() || undefined,
      callType: callType === 'outbound' ? 'outbound' : 'inbound',
      callId: callId || undefined,
      campaignName: campaignName || undefined,
      listId: (payload.list_id || payload.listId || '').toString().trim() || undefined,
      vendorLeadCode: (payload.vendor_lead_code || payload.vendorLeadCode || '').toString().trim() || undefined,
      callStatus: (payload.status || payload.dispo || '').toString().trim() || undefined,
      rawPayload: payload,
      priority: callType === 'inbound' ? 'high' : 'normal',
      queueStatus: 'pending',
    };

    if (agent) {
      callData.agent = agent._id;
      callData.organization = agent.organization?._id || agent.organization;
    }

    const vicidialCall = await VicidialCall.create(callData);

    if (agent && req.io) {
      const callPayload = {
        _id: vicidialCall._id,
        vicidialAgentId,
        phoneNumber,
        callerName: callerName || 'Unknown',
        firstName,
        lastName,
        email: callData.email,
        address: callData.address,
        city: callData.city,
        state: callData.state,
        zipcode: callData.zipcode,
        callType: callData.callType,
        callId,
        campaignName,
        priority: callData.priority,
        receivedAt: vicidialCall.receivedAt,
      };

      console.log('🔥 Real-time ViciDial call (GET) for agent:', vicidialAgentId);
      console.log('📤 Pushing call data to agent via socket:', agent.email);

      if (req.socketOptimizer) {
        req.socketOptimizer.emitToUser(agent._id.toString(), 'agent1', 'vicidialCallData', callPayload);
      } else {
        req.io.emit('vicidialCallData', callPayload);
      }
    }

    return res.status(200).json({
      success: true,
      message: agent ? 'Call data received and pushed to agent' : 'Call data received (agent not mapped)',
      callId: vicidialCall._id,
      agentMapped: !!agent,
    });
  } catch (error) {
    console.error('Vicidial call-data GET error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error processing call data' });
  }
});

// ============================================================
// GET /api/vicidial/queue
// Get pending call queue for the logged-in agent
// Protected — requires auth
// ============================================================
router.get('/queue', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    const pendingCalls = await VicidialCall.find({
      agent: req.user._id,
      queueStatus: { $in: ['pending', 'active'] },
    })
      .sort({ priority: -1, receivedAt: 1 }) // High priority first, then oldest first
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        calls: pendingCalls,
        count: pendingCalls.length,
      },
    });
  } catch (error) {
    console.error('Vicidial queue fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch call queue',
    });
  }
});

// ============================================================
// GET /api/vicidial/queue/count
// Get pending call count for badge display
// Protected — requires auth
// ============================================================
router.get('/queue/count', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    const count = await VicidialCall.countDocuments({
      agent: req.user._id,
      queueStatus: { $in: ['pending', 'active'] },
    });

    return res.status(200).json({
      success: true,
      data: { count },
    });
  } catch (error) {
    console.error('Vicidial queue count error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch queue count',
    });
  }
});

// ============================================================
// GET /api/vicidial/queue/next
// Get next pending call from queue for auto-loading
// Protected — requires auth
// ============================================================
router.get('/queue/next', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    console.log('🔍 Fetching next ViciDial call for user:', req.user._id);
    
    // Find the next pending call (oldest first, high priority first)
    const nextCall = await VicidialCall.findOne({
      agent: req.user._id,
      queueStatus: 'pending',
    })
      .sort({ priority: -1, receivedAt: 1 }) // High priority first, then oldest first
      .lean();

    if (!nextCall) {
      console.log('✅ No pending calls in queue');
      return res.status(200).json({
        success: true,
        data: { call: null },
        message: 'No pending calls',
      });
    }

    console.log('📞 Found next call:', nextCall._id, nextCall.phoneNumber);

    // Mark as active
    await VicidialCall.findByIdAndUpdate(nextCall._id, {
      queueStatus: 'active',
    });

    return res.status(200).json({
      success: true,
      data: { call: nextCall },
    });
  } catch (error) {
    console.error('Vicidial queue next error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch next call',
    });
  }
});

// ============================================================
// PUT /api/vicidial/queue/:callId/activate
// Mark a call as active (agent is filling form for it)
// ============================================================
router.put('/queue/:callId/activate', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    const call = await VicidialCall.findOneAndUpdate(
      {
        _id: req.params.callId,
        agent: req.user._id,
        queueStatus: 'pending',
      },
      {
        queueStatus: 'active',
      },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found or already processed',
      });
    }

    return res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error('Vicidial queue activate error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to activate call',
    });
  }
});

// ============================================================
// PUT /api/vicidial/queue/:callId/complete
// Mark a call as completed (agent submitted the lead form)
// Optionally link the created lead
// ============================================================
router.put('/queue/:callId/complete', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { leadId } = req.body;

    console.log(`✅ Marking ViciDial call ${req.params.callId} as complete, leadId:`, leadId);

    const updateData = {
      queueStatus: 'completed',
      processedAt: new Date(),
    };

    if (leadId) {
      updateData.leadCreated = leadId;
    }

    const call = await VicidialCall.findOneAndUpdate(
      {
        _id: req.params.callId,
        agent: req.user._id,
        queueStatus: { $in: ['pending', 'active'] },
      },
      updateData,
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found or already completed',
      });
    }

    // Notify the agent about updated queue count
    const remainingCount = await VicidialCall.countDocuments({
      agent: req.user._id,
      queueStatus: { $in: ['pending', 'active'] },
    });
    
    console.log(`📊 Remaining calls in queue: ${remainingCount}`);
    
    if (req.socketOptimizer) {
      req.socketOptimizer.emitToUser(
        req.user._id.toString(),
        'agent1',
        'vicidialQueueUpdate',
        { count: remainingCount }
      );
    }

    return res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error('Vicidial queue complete error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to complete call',
    });
  }
});

// ============================================================
// PUT /api/vicidial/queue/:callId/skip
// Skip/dismiss a call from queue
// ============================================================
router.put('/queue/:callId/skip', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    const call = await VicidialCall.findOneAndUpdate(
      {
        _id: req.params.callId,
        agent: req.user._id,
        queueStatus: { $in: ['pending', 'active'] },
      },
      {
        queueStatus: 'expired',
        expiredAt: new Date(),
      },
      { new: true }
    );

    if (!call) {
      return res.status(404).json({
        success: false,
        message: 'Call not found or already processed',
      });
    }

    // Notify the agent about updated queue count
    if (req.socketOptimizer) {
      const remainingCount = await VicidialCall.countDocuments({
        agent: req.user._id,
        queueStatus: { $in: ['pending', 'active'] },
      });
      req.socketOptimizer.emitToUser(
        req.user._id.toString(),
        'agent1',
        'vicidialQueueUpdate',
        { count: remainingCount }
      );
    }

    return res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error) {
    console.error('Vicidial queue skip error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to skip call',
    });
  }
});

// ============================================================
// Admin: GET /api/vicidial/admin/calls
// View all recent vicidial calls (admin/superadmin only)
// ============================================================
router.get('/admin/calls', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const filter = {};

    // Org-scoped for admin, all for superadmin
    if (req.user.role === 'admin' && req.user.organization) {
      filter.organization = req.user.organization;
    }

    if (req.query.queueStatus) {
      filter.queueStatus = req.query.queueStatus;
    }

    if (req.query.callType) {
      filter.callType = req.query.callType;
    }

    const [calls, total] = await Promise.all([
      VicidialCall.find(filter)
        .populate('agent', 'name email vicidialAgentId')
        .sort({ receivedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      VicidialCall.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        calls,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error('Vicidial admin calls error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch vicidial calls',
    });
  }
});

// ============================================================
// Admin: PUT /api/vicidial/admin/map-agent
// Map a Vicidial agent ID to an LMS user
// ============================================================
router.put('/admin/map-agent', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { userId, vicidialAgentId } = req.body;

    if (!userId || !vicidialAgentId) {
      return res.status(400).json({
        success: false,
        message: 'userId and vicidialAgentId are required',
      });
    }

    // Check if this vicidialAgentId is already assigned to another user
    const existingUser = await User.findOne({
      vicidialAgentId: vicidialAgentId.trim(),
      _id: { $ne: userId },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: `Vicidial agent ID "${vicidialAgentId}" is already mapped to user ${existingUser.name}`,
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { vicidialAgentId: vicidialAgentId.trim() },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: `Vicidial agent ID "${vicidialAgentId}" mapped to ${user.name}`,
      data: {
        userId: user._id,
        name: user.name,
        vicidialAgentId: user.vicidialAgentId,
      },
    });
  } catch (error) {
    console.error('Vicidial map-agent error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to map agent',
    });
  }
});

// ============================================================
// Admin: GET /api/vicidial/admin/agent-mappings
// Get all agent mappings
// ============================================================
router.get('/admin/agent-mappings', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const filter = {
      vicidialAgentId: { $exists: true, $ne: null, $ne: '' },
    };

    // Org-scoped for admin
    if (req.user.role === 'admin' && req.user.organization) {
      filter.organization = req.user.organization;
    }

    const agents = await User.find(filter)
      .select('name email role vicidialAgentId organization isActive')
      .populate('organization', 'name')
      .lean();

    return res.status(200).json({
      success: true,
      data: agents,
    });
  } catch (error) {
    console.error('Vicidial agent-mappings error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch agent mappings',
    });
  }
});

// ============================================================
// POST /api/vicidial/hangup
// Hang up the active Vicidial call and stamp a disposition code.
// Called by the LMS after the agent disposes a lead.
//
// Body: { callId: "<VicidialCall._id>", disposition: "<LMS label>" }
//
// The LMS disposition label is automatically mapped to the Vicidial
// short code, e.g. "SALE - Sale Made" → "SALE", "A - Answering Machine" → "A".
// Protected — requires auth
// ============================================================
router.post('/hangup', protect, authorize('agent1', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { callId, disposition } = req.body;

    if (!disposition || !String(disposition).trim()) {
      return res.status(400).json({ success: false, message: 'disposition is required' });
    }

    // Extract short Vicidial code from LMS label, e.g. "SALE - Sale Made" → "SALE"
    const rawDisposition = String(disposition).trim();
    const vicidialCode = rawDisposition.includes(' - ')
      ? rawDisposition.split(' - ')[0].trim()
      : rawDisposition;

    // Resolve vicidialAgentId: call record first, then user profile fallback
    let vicidialAgentId = req.user.vicidialAgentId;
    if (callId) {
      const callRecord = await VicidialCall.findOne({ _id: callId }).lean();
      if (callRecord?.vicidialAgentId) vicidialAgentId = callRecord.vicidialAgentId;
    }

    if (!vicidialAgentId) {
      return res.status(400).json({
        success: false,
        message: 'No Vicidial agent ID is linked to your account. Ask an admin to configure it.',
      });
    }

    const baseUrl = process.env.VICIDIAL_HANGUP_URL || 'http://172.16.1.20/VLC_API/hangup_api.php';
    const fullUrl = `${baseUrl}?agent_user=${encodeURIComponent(vicidialAgentId)}&disposition=${encodeURIComponent(vicidialCode)}`;

    // Fire HTTP GET to Vicidial server (internal network — use Node built-in http, no extra deps)
    let vicidialResponseText = '';
    let vicidialReachable = false;

    await new Promise((resolve) => {
      const http = require('http');
      try {
        const urlObj = new URL(fullUrl);
        const options = {
          hostname: urlObj.hostname,
          port:     urlObj.port || 80,
          path:     urlObj.pathname + urlObj.search,
          method:   'GET',
          timeout:  8000,
        };

        const request = http.request(options, (response) => {
          let data = '';
          response.on('data', (chunk) => { data += chunk; });
          response.on('end',  ()      => {
            vicidialResponseText = data.trim();
            vicidialReachable = true;
            resolve();
          });
        });

        request.on('error',   (err) => { vicidialResponseText = `ERROR: ${err.message}`;    resolve(); });
        request.on('timeout', ()    => { vicidialResponseText = 'ERROR: request timed out'; request.destroy(); resolve(); });
        request.end();
      } catch (parseErr) {
        vicidialResponseText = `ERROR: invalid URL — ${parseErr.message}`;
        resolve();
      }
    });

    console.log(
      `[Vicidial Hangup] agent_user=${vicidialAgentId} dispo=${vicidialCode} ` +
      `reached=${vicidialReachable} response="${vicidialResponseText}"`
    );

    // Persist the applied Vicidial disposition code on the call record
    if (callId) {
      await VicidialCall.findOneAndUpdate(
        { _id: callId, agent: req.user._id },
        { callStatus: vicidialCode }
      ).catch((e) => console.error('[Vicidial Hangup] Failed to update call record:', e));
    }

    const responseBody = {
      success: true,
      data: { vicidialAgentId, vicidialCode, vicidialReachable, vicidialResponse: vicidialResponseText },
    };
    if (!vicidialReachable) {
      responseBody.warning =
        'Vicidial hangup API was unreachable — lead saved in LMS but call was NOT hung up through Vicidial.';
    }
    return res.status(200).json(responseBody);
  } catch (error) {
    console.error('[Vicidial Hangup] Route error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error during hangup' });
  }
});

module.exports = router;

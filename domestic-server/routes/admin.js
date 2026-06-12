'use strict';
const express        = require('express');
const DomUser        = require('../models/DomUser');
const DomWebsiteLead = require('../models/DomWebsiteLead');
const DomLead        = require('../models/DomLead');
const bcrypt         = require('bcryptjs');
const { protect, authorize, generateToken } = require('../middleware/auth');

const router = express.Router();

// All admin routes require dom_admin or dom_superadmin
router.use(protect, authorize('dom_admin', 'dom_superadmin'));

// ── GET /domestic-api/admin/stats ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalWebsiteLeads,
      newLeads,
      loadedLeads,
      completedLeads,
      rejectedLeads,
      todayLeads,
      totalDomLeads,
      completedDomLeads,
      totalAgents,
      activeAgents,
    ] = await Promise.all([
      DomWebsiteLead.countDocuments(),
      DomWebsiteLead.countDocuments({ status: 'new' }),
      DomWebsiteLead.countDocuments({ status: 'loaded' }),
      DomWebsiteLead.countDocuments({ status: 'completed' }),
      DomWebsiteLead.countDocuments({ status: 'rejected' }),
      DomWebsiteLead.countDocuments({ createdAt: { $gte: todayStart } }),
      DomLead.countDocuments(),
      DomLead.countDocuments({ status: 'completed' }),
      DomUser.countDocuments({ role: 'domagent' }),
      DomUser.countDocuments({ role: 'domagent', isActive: true }),
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
        },
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
// Agent performance table
router.get('/agents', async (req, res) => {
  try {
    const agents = await DomUser.find({ role: 'domagent' })
      .select('name email isActive lastLogin createdAt')
      .lean();

    // Counts per agent
    const agentIds = agents.map((a) => a._id);

    const [loadedCounts, completedCounts, domLeadCounts] = await Promise.all([
      DomWebsiteLead.aggregate([
        { $match: { loadedBy: { $in: agentIds } } },
        { $group: { _id: '$loadedBy', count: { $sum: 1 } } },
      ]),
      DomWebsiteLead.aggregate([
        { $match: { loadedBy: { $in: agentIds }, status: 'completed' } },
        { $group: { _id: '$loadedBy', count: { $sum: 1 } } },
      ]),
      DomLead.aggregate([
        { $match: { assignedTo: { $in: agentIds } } },
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

    const data = agents.map((a) => ({
      ...a,
      leadsLoaded:     loadedMap[a._id.toString()]    || 0,
      leadsCompleted:  completedMap[a._id.toString()] || 0,
      domLeadsCreated: domLeadMap[a._id.toString()]   || 0,
    }));

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

module.exports = router;

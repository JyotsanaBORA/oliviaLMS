'use strict';
const express         = require('express');
const DomNotification = require('../models/DomNotification');
const { protect }     = require('../middleware/auth');

const router = express.Router();

// ── GET /domestic-api/notifications ───────────────────────────────────────
// Returns all unread notifications for the logged-in agent.
// ?countOnly=1 — returns just { count } without fetching documents (cheap for badge init).
router.get('/', protect, async (req, res) => {
  try {
    if (req.query.countOnly === '1') {
      const count = await DomNotification.countDocuments({ agent: req.user._id });
      return res.status(200).json({ success: true, count });
    }

    const notifications = await DomNotification.find({ agent: req.user._id })
      .populate('websiteLead', 'name mobile productType city status createdAt')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    return res.status(200).json({ success: true, data: notifications, count: notifications.length });
  } catch (err) {
    console.error('[Notifications] GET error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
});

// ── DELETE /domestic-api/notifications/:id ─────────────────────────────────
// Dismiss a single notification
router.delete('/:id', protect, async (req, res) => {
  try {
    await DomNotification.findOneAndDelete({ _id: req.params.id, agent: req.user._id });
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Notifications] DELETE error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to dismiss notification.' });
  }
});

module.exports = router;

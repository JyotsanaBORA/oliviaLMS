const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────────────────────
// GET /api/notifications
// Return the latest 50 notifications for the logged-in user,
// newest first. Includes unread count in response.
// ─────────────────────────────────────────────────────────────
router.get('/', protect, async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ recipient: req.user._id })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
      Notification.countDocuments({ recipient: req.user._id, isRead: false }),
    ]);

    res.status(200).json({ success: true, data: notifications, unreadCount });
  } catch (err) {
    console.error('GET /notifications error:', err);
    res.status(500).json({ success: false, message: 'Error fetching notifications' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/notifications/mark-all-read
// Mark all unread notifications for the user as read.
// ─────────────────────────────────────────────────────────────
router.patch('/mark-all-read', protect, async (req, res) => {
  try {
    await Notification.updateMany(
      { recipient: req.user._id, isRead: false },
      { $set: { isRead: true } }
    );
    res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (err) {
    console.error('PATCH /notifications/mark-all-read error:', err);
    res.status(500).json({ success: false, message: 'Error marking notifications as read' });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/notifications/:id/read
// Mark a single notification as read.
// ─────────────────────────────────────────────────────────────
router.patch('/:id/read', protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndUpdate(
      { _id: req.params.id, recipient: req.user._id },
      { $set: { isRead: true } },
      { new: true }
    );
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.status(200).json({ success: true, data: notif });
  } catch (err) {
    console.error('PATCH /notifications/:id/read error:', err);
    res.status(500).json({ success: false, message: 'Error marking notification as read' });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/notifications/:id
// Delete a single notification belonging to the user.
// ─────────────────────────────────────────────────────────────
router.delete('/:id', protect, async (req, res) => {
  try {
    const notif = await Notification.findOneAndDelete({
      _id: req.params.id,
      recipient: req.user._id,
    });
    if (!notif) {
      return res.status(404).json({ success: false, message: 'Notification not found' });
    }
    res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (err) {
    console.error('DELETE /notifications/:id error:', err);
    res.status(500).json({ success: false, message: 'Error deleting notification' });
  }
});

module.exports = router;

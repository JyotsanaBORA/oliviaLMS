const mongoose = require('mongoose');

/**
 * One document = one notification for ONE recipient.
 * This keeps queries simple: always filter by { recipient: userId }.
 *
 * Types:
 *   lead_download_alert    – sent to superadmin + Reddington admin when an org admin downloads
 *   lead_download_confirm  – sent to the downloading admin as confirmation
 *   password_change_alert  – sent to superadmin + Reddington admin when any user changes password
 *   password_change_confirm– sent to the user themselves as confirmation
 */
const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: [
        'lead_download_alert',
        'lead_download_confirm',
        'password_change_alert',
        'password_change_confirm',
      ],
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    // Optional extra context (not sensitive — no passwords)
    metadata: {
      performedById: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      performedByName: String,
      performedByRole: String,
      organizationName: String,
      leadCount: Number,
    },
  },
  { timestamps: true }
);

// Compound index for efficient per-user unread queries
notificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });

// Auto-expire notifications after 90 days to keep collection lean
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

module.exports = mongoose.model('Notification', notificationSchema);

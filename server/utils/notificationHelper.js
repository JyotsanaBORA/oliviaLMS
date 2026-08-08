/**
 * notificationHelper.js
 * ---------------------
 * Shared helpers for creating system notifications.
 * All functions are fire-and-forget safe (they never throw; errors are logged only).
 */

const User = require('../models/User');
const Organization = require('../models/Organization');
const Notification = require('../models/Notification');

const MAIN_ORG_NAME = (process.env.MAIN_ORG_NAME || 'REDDINGTON GLOBAL CONSULTANCY').trim().toUpperCase();

/**
 * Find all users that should receive "admin alert" notifications:
 *   - All active superadmins
 *   - All active admins of the main (Reddington) organisation
 * Excludes the triggering user themselves.
 *
 * @param {string|ObjectId} excludeUserId – the user who triggered the action
 * @returns {Promise<ObjectId[]>}
 */
const getAlertRecipients = async (excludeUserId) => {
  try {
    // Find the main org
    const mainOrg = await Organization.findOne({
      name: { $regex: new RegExp(`^${MAIN_ORG_NAME}$`, 'i') },
    })
      .select('_id')
      .lean();

    const recipientQuery = {
      isActive: true,
      $or: [
        { role: 'superadmin' },
        ...(mainOrg ? [{ role: 'admin', organization: mainOrg._id }] : []),
      ],
    };

    if (excludeUserId) {
      recipientQuery._id = { $ne: excludeUserId };
    }

    const recipients = await User.find(recipientQuery).select('_id').lean();
    return recipients.map((u) => u._id);
  } catch (err) {
    console.error('[notificationHelper] getAlertRecipients error:', err.message);
    return [];
  }
};

/**
 * Insert multiple Notification documents in one bulk operation.
 * Silently swallows errors so calling code is never disrupted.
 *
 * @param {ObjectId[]} recipientIds
 * @param {object}     notifFields  – { type, message, metadata }
 */
const createNotificationsForMany = async (recipientIds, notifFields) => {
  if (!recipientIds || recipientIds.length === 0) return;
  try {
    const docs = recipientIds.map((rid) => ({
      recipient: rid,
      type: notifFields.type,
      message: notifFields.message,
      metadata: notifFields.metadata || {},
    }));
    await Notification.insertMany(docs, { ordered: false });
  } catch (err) {
    console.error('[notificationHelper] createNotificationsForMany error:', err.message);
  }
};

// ─────────────────────────────────────────────────────────────
// Public helpers called from route handlers
// ─────────────────────────────────────────────────────────────

/**
 * Called when an admin successfully downloads leads.
 *
 * Creates:
 *   1. An ALERT notification for all superadmins + Reddington admins
 *      (skips this step if the downloader IS a Reddington admin/superadmin)
 *   2. A CONFIRM notification for the downloader themselves
 *
 * @param {object} params
 * @param {object} params.user          – req.user of the downloader
 * @param {string} params.orgName       – organisation name of the downloader
 * @param {number} params.leadCount     – number of leads exported
 */
const notifyLeadDownload = async ({ user, orgName, leadCount }) => {
  try {
    const metadata = {
      performedById: user._id,
      performedByName: user.name,
      performedByRole: user.role,
      organizationName: orgName,
      leadCount,
    };

    // Alert for superadmin + Reddington admin (exclude the downloader)
    const alertRecipients = await getAlertRecipients(user._id);
    if (alertRecipients.length > 0) {
      await createNotificationsForMany(alertRecipients, {
        type: 'lead_download_alert',
        message: `${user.name} (${orgName}) downloaded ${leadCount} lead${leadCount !== 1 ? 's' : ''} as CSV.`,
        metadata,
      });
    }

    // Confirmation for the downloader themselves
    await createNotificationsForMany([user._id], {
      type: 'lead_download_confirm',
      message: `Your CSV download was successful — ${leadCount} lead${leadCount !== 1 ? 's' : ''} exported.`,
      metadata,
    });
  } catch (err) {
    console.error('[notificationHelper] notifyLeadDownload error:', err.message);
  }
};

/**
 * Called when a user successfully changes their password.
 *
 * Creates:
 *   1. An ALERT notification for all superadmins + Reddington admins
 *   2. A CONFIRM notification for the user themselves
 *
 * @param {object} params
 * @param {object} params.user – req.user who changed password
 */
const notifyPasswordChange = async ({ user }) => {
  try {
    const metadata = {
      performedById: user._id,
      performedByName: user.name,
      performedByRole: user.role,
    };

    const roleLabel =
      user.role === 'admin'
        ? 'Admin'
        : user.role === 'superadmin'
        ? 'SuperAdmin'
        : user.role === 'agent1'
        ? 'Agent 1'
        : user.role === 'agent2'
        ? 'Agent 2'
        : user.role;

    // Alert for superadmin + Reddington admin (exclude the user themselves)
    const alertRecipients = await getAlertRecipients(user._id);
    if (alertRecipients.length > 0) {
      await createNotificationsForMany(alertRecipients, {
        type: 'password_change_alert',
        message: `${user.name} (${roleLabel}) changed their account password.`,
        metadata,
      });
    }

    // Confirmation for the user themselves
    await createNotificationsForMany([user._id], {
      type: 'password_change_confirm',
      message: 'Your password was changed successfully.',
      metadata,
    });
  } catch (err) {
    console.error('[notificationHelper] notifyPasswordChange error:', err.message);
  }
};

module.exports = { notifyLeadDownload, notifyPasswordChange };

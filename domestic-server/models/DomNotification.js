'use strict';
const mongoose = require('mongoose');

/**
 * DomNotification  one record per (websiteLead, agent) pair.
 * When a new website lead arrives, a notification is created for every
 * active domagent.  When any agent loads the lead, ALL notifications
 * for that lead are deleted (or marked read)  the popup vanishes for
 * everyone.
 */
const domNotificationSchema = new mongoose.Schema(
  {
    websiteLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomWebsiteLead',
      required: true,
    },
    agent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
      required: true,
    },
    // Quick-access fields so we can render the notification card without
    // a populated query on every poll.
    leadName:       { type: String, trim: true, maxlength: 100 },
    leadMobile:     { type: String, trim: true, maxlength: 20 },
    leadProductType:{ type: String, trim: true, maxlength: 100 },
  },
  { timestamps: true }
);

domNotificationSchema.index({ agent: 1, createdAt: -1 });
domNotificationSchema.index({ websiteLead: 1 }); // for bulk deletion when lead is loaded

module.exports = mongoose.model('DomNotification', domNotificationSchema);


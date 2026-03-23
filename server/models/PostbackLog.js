const mongoose = require('mongoose');

const postbackLogSchema = new mongoose.Schema({
  lead: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    required: false,
  },
  callUuid: {
    type: String,
  },
  primaryPhone: {
    type: String,
  },
  eventType: {
    type: String,
    enum: ['dispose', 'progress'],
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  responseStatus: {
    type: Number,
  },
  responseBody: {
    type: mongoose.Schema.Types.Mixed,
  },
  sentAt: {
    type: Date,
    default: Date.now,
  },
  trigger: {
    type: String,
  },
  error: {
    type: Boolean,
    default: false,
  },
  errorMessage: {
    type: String,
  },
  attempt: {
    type: Number,
    default: 1,
  },
}, {
  timestamps: true,
});

postbackLogSchema.index({ lead: 1, sentAt: -1 });
postbackLogSchema.index({ eventType: 1, sentAt: -1 });
postbackLogSchema.index({ error: 1, sentAt: -1 });

module.exports = mongoose.model('PostbackLog', postbackLogSchema);

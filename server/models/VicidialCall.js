const mongoose = require('mongoose');

const vicidialCallSchema = new mongoose.Schema({
  // Vicidial agent ID string (mapped to LMS user)
  vicidialAgentId: {
    type: String,
    required: [true, 'Vicidial agent ID is required'],
    trim: true,
    index: true,
  },

  // Mapped LMS user
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },

  // Organization (resolved from agent)
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true,
  },

  // Call type: inbound or outbound
  callType: {
    type: String,
    enum: ['inbound', 'outbound'],
    default: 'inbound',
  },

  // Caller/Lead info from Vicidial
  phoneNumber: {
    type: String,
    trim: true,
  },
  callerName: {
    type: String,
    trim: true,
  },
  firstName: {
    type: String,
    trim: true,
  },
  lastName: {
    type: String,
    trim: true,
  },
  email: {
    type: String,
    trim: true,
  },
  address: {
    type: String,
    trim: true,
  },
  city: {
    type: String,
    trim: true,
  },
  state: {
    type: String,
    trim: true,
  },
  zipcode: {
    type: String,
    trim: true,
  },

  // Vicidial call metadata
  callId: {
    type: String,
    index: true,
  },
  campaignName: {
    type: String,
    trim: true,
  },
  listId: {
    type: String,
  },
  vendorLeadCode: {
    type: String,
  },
  callStatus: {
    type: String,
  },

  // Full raw payload for reference
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  // Queue status - tracks whether agent has processed this call
  queueStatus: {
    type: String,
    enum: ['pending', 'active', 'completed', 'expired'],
    default: 'pending',
    index: true,
  },

  // Priority: inbound = high (customer waiting), outbound = normal
  priority: {
    type: String,
    enum: ['high', 'normal'],
    default: 'normal',
  },

  // Reference to lead created from this call data
  leadCreated: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
  },

  // Timestamps
  receivedAt: {
    type: Date,
    default: Date.now,
  },
  processedAt: {
    type: Date,
  },
  expiredAt: {
    type: Date,
  },
}, {
  timestamps: true,
});

// Compound indexes for efficient queue queries
vicidialCallSchema.index({ agent: 1, queueStatus: 1, priority: -1, receivedAt: 1 });
vicidialCallSchema.index({ vicidialAgentId: 1, queueStatus: 1 });
vicidialCallSchema.index({ queueStatus: 1, receivedAt: -1 });
vicidialCallSchema.index({ organization: 1, receivedAt: -1 });

module.exports = mongoose.model('VicidialCall', vicidialCallSchema);

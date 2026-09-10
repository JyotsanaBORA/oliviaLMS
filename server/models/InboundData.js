const mongoose = require('mongoose');

const inboundDataSchema = new mongoose.Schema({
  // Telephony Campaign Name
  campaignName: {
    type: String,
    trim: true,
    index: true,
  },

  // Inbound DID (Direct Inward Dialing number)
  did: {
    type: String,
    trim: true,
    index: true,
  },

  // Caller Contact Phone Number
  phoneNumber: {
    type: String,
    trim: true,
    index: true,
  },

  // Call Status / Life-cycle state (defaults to RECEIVED, accepts telephony dispo codes)
  callStatus: {
    type: String,
    trim: true,
    default: 'RECEIVED',
    index: true,
  },

  // Unified Lead Progress Status / Disposition (Agent 2 options)
  leadProgressStatus: {
    type: String,
    trim: true,
    index: true,
  },

  // Organization resolved from the DID
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    index: true,
  },

  // Assigned / handling agent (optional)
  agent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true,
  },

  // Optional Caller Details
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

  // Financial / Qualification info if captured
  totalDebtAmount: {
    type: Number,
  },

  // Agent notes & tracking
  notes: {
    type: String,
    trim: true,
  },
  agentLastAction: {
    type: String,
    trim: true,
  },
  updatedBy: {
    type: String,
    trim: true,
  },

  // Link to primary LMS Lead if converted/saved
  importedLeadId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead',
    index: true,
    default: null,
  },

  // Complete raw payload from ViciDial for audit/debugging
  rawPayload: {
    type: mongoose.Schema.Types.Mixed,
  },

  receivedAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
  versionKey: false,
});

inboundDataSchema.index({ did: 1, receivedAt: -1 });
inboundDataSchema.index({ organization: 1, receivedAt: -1 });
inboundDataSchema.index({ phoneNumber: 1, receivedAt: -1 });

module.exports = mongoose.model('InboundData', inboundDataSchema);

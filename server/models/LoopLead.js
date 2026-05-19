const mongoose = require('mongoose');

/**
 * LoopLead — stores raw inbound lead data posted by Loop company
 * to our webhook endpoint POST /api/webhook/loop.
 *
 * All known Loop fields are stored as typed properties.
 * The full raw payload is also preserved so nothing is ever lost
 * if Loop adds new fields.
 *
 * Collection name is forced to 'loop' via schema options.
 */
const loopLeadSchema = new mongoose.Schema(
  {
    // ── Known Lead Fields (from Loop's POST Mapping spec) ──────────────────
    firstname: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    lastname: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    phone: {
      type: String,   // stored as string for safe handling; Loop sends integer
      trim: true,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 200,
    },
    address: {
      type: String,
      trim: true,
      maxlength: 300,
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    state: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    zip: {
      type: String,
      trim: true,
      maxlength: 20,
    },
    country: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    debt_amount: {
      type: String,   // Loop spec lists as string; keep raw
      trim: true,
    },
    fico: {
      type: String,
      trim: true,
    },
    unsecured_debt: {
      type: String,
      trim: true,
    },
    dob: {
      type: String,
      trim: true,
      maxlength: 50,
    },
    trusted_form: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    // ── Full raw payload (preserves any fields Loop adds in future) ─────────
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // ── Request metadata ────────────────────────────────────────────────────
    receivedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    sourceIp: {
      type: String,
      trim: true,
    },

    // ── Processing state ─────────────────────────────────────────────────────
    // 'new'      — just received, not yet reviewed
    // 'reviewed' — seen by admin / agent
    // 'imported' — converted into a full Lead document
    status: {
      type: String,
      enum: ['new', 'reviewed', 'imported'],
      default: 'new',
      index: true,
    },

    // If this loop lead was imported into the main leads collection, link it
    importedLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
    },
    importedAt: {
      type: Date,
    },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    collection: 'loop',   // Force collection name to 'loop'
  }
);

loopLeadSchema.index({ phone: 1 });
loopLeadSchema.index({ email: 1 });
loopLeadSchema.index({ status: 1, receivedAt: -1 });

module.exports = mongoose.model('LoopLead', loopLeadSchema);

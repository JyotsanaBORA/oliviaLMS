/**
 * WebsiteLead — separate collection for leads that arrive via the marketing
 * website webhook.  These are raw/unprocessed leads until Reddington admin
 * decides to import them into the main Lead collection.
 */
const mongoose = require('mongoose');

const websiteLeadSchema = new mongoose.Schema(
  {
    // Which organisation's webhook API key was used
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },

    // Submitted form data
    firstName: { type: String, trim: true, maxlength: 50 },
    lastName:  { type: String, trim: true, maxlength: 50 },
    name:      { type: String, trim: true, maxlength: 100 }, // combined
    email:     { type: String, trim: true, lowercase: true, maxlength: 100 },
    phone:     { type: String, trim: true, maxlength: 20 },

    // Form 2 — debt / qualify form
    totalDebtAmount: { type: Number, min: 0 },
    streetAddress:   { type: String, trim: true, maxlength: 200 },
    city:            { type: String, trim: true, maxlength: 100 },
    state:           { type: String, trim: true, maxlength: 50 },
    zipCode:         { type: String, trim: true, maxlength: 20 },

    // Form 1 — contact / message form
    message: { type: String, trim: true, maxlength: 2000 },

    // SMS consent
    smsOptIn: { type: Boolean, default: false },

    // Which form submitted this
    formType: {
      type: String,
      enum: ['contact-form', 'qualify-form', 'unknown'],
      default: 'unknown',
    },

    // Processing state — admin can mark as reviewed / imported
    status: {
      type: String,
      enum: ['new', 'reviewed', 'imported', 'rejected'],
      default: 'new',
      index: true,
    },

    // If imported into main Lead collection
    importedLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },

    // Raw payload stored for audit
    rawPayload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

websiteLeadSchema.index({ organization: 1, createdAt: -1 });
websiteLeadSchema.index({ status: 1, createdAt: -1 });
websiteLeadSchema.index({ email: 1 });
websiteLeadSchema.index({ phone: 1 });

const WebsiteLead = mongoose.model('WebsiteLead', websiteLeadSchema);

module.exports = WebsiteLead;

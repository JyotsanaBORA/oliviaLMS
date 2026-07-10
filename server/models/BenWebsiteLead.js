/**
 * BenWebsiteLead — separate collection for leads that arrive via the
 * /api/webhook/ben-leads endpoint.
 * Ben's admin can read only. Reddington (main org) admin can read + write.
 */
const mongoose = require('mongoose');

const benWebsiteLeadSchema = new mongoose.Schema(
  {
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    firstName: { type: String, trim: true, maxlength: 50 },
    lastName:  { type: String, trim: true, maxlength: 50 },
    name:      { type: String, trim: true, maxlength: 100 },
    email:     { type: String, trim: true, lowercase: true, maxlength: 100 },
    phone:     { type: String, trim: true, maxlength: 20 },
    totalDebtAmount: { type: Number, min: 0 },
    streetAddress:   { type: String, trim: true, maxlength: 200 },
    city:            { type: String, trim: true, maxlength: 100 },
    state:           { type: String, trim: true, maxlength: 50 },
    zipCode:         { type: String, trim: true, maxlength: 20 },
    message:         { type: String, trim: true, maxlength: 2000 },
    preferredContactDate:       { type: String, trim: true, maxlength: 40 },
    preferredContactSlot:       { type: String, trim: true, maxlength: 100 },
    preferredContactCustomTime: { type: String, trim: true, maxlength: 20 },
    smsOptIn: { type: Boolean, default: false },
    formType: {
      type: String,
      enum: ['contact-form', 'qualify-form', 'unknown'],
      default: 'unknown',
    },
    status: {
      type: String,
      enum: ['new', 'reviewed', 'imported', 'rejected'],
      default: 'new',
      index: true,
    },
    importedLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Lead',
      default: null,
    },
    rawPayload: { type: mongoose.Schema.Types.Mixed },
    // Reddington staff comments
    comments: [
      {
        text:       { type: String, required: true, trim: true, maxlength: 1000 },
        authorId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        authorName: { type: String, trim: true, maxlength: 100 },
        createdAt:  { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true, collection: 'benwebsiteleads' }
);

benWebsiteLeadSchema.index({ organization: 1, createdAt: -1 });
benWebsiteLeadSchema.index({ status: 1, createdAt: -1 });
benWebsiteLeadSchema.index({ email: 1 });
benWebsiteLeadSchema.index({ phone: 1 });

const BenWebsiteLead = mongoose.model('BenWebsiteLead', benWebsiteLeadSchema);

module.exports = BenWebsiteLead;

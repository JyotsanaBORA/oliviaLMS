const mongoose = require('mongoose');

const adminUploadSchema = new mongoose.Schema({
  // ── ViciDial / CSV Fields ──────────────────────────────────────
  lead_id:                 { type: String, trim: true, default: '' },
  entry_date:              { type: String, trim: true, default: '' },
  modify_date:             { type: String, trim: true, default: '' },
  status:                  { type: String, trim: true, default: '' },
  user:                    { type: String, trim: true, default: '' },
  vendor_lead_code:        { type: String, trim: true, default: '' },
  source_id:               { type: String, trim: true, default: '' },
  list_id:                 { type: String, trim: true, default: '' },
  gmt_offset_now:          { type: String, trim: true, default: '' },
  called_since_last_reset: { type: String, trim: true, default: '' },
  phone_code:              { type: String, trim: true, default: '' },
  phone_number:            { type: String, trim: true, default: '' },
  title:                   { type: String, trim: true, default: '' },
  first_name:              { type: String, trim: true, default: '' },
  middle_initial:          { type: String, trim: true, default: '' },
  last_name:               { type: String, trim: true, default: '' },
  address1:                { type: String, trim: true, default: '' },
  address2:                { type: String, trim: true, default: '' },
  address3:                { type: String, trim: true, default: '' },
  city:                    { type: String, trim: true, default: '' },
  state:                   { type: String, trim: true, default: '' },
  province:                { type: String, trim: true, default: '' },
  postal_code:             { type: String, trim: true, default: '' },
  country_code:            { type: String, trim: true, default: '' },
  gender:                  { type: String, trim: true, default: '' },
  date_of_birth:           { type: String, trim: true, default: '' },
  alt_phone:               { type: String, trim: true, default: '' },
  email:                   { type: String, trim: true, default: '' },
  security_phrase:          { type: String, trim: true, default: '' },
  comments:                { type: String, trim: true, default: '' },
  called_count:            { type: String, trim: true, default: '' },
  last_local_call_time:    { type: String, trim: true, default: '' },
  rank:                    { type: String, trim: true, default: '' },
  owner:                   { type: String, trim: true, default: '' },
  entry_id:                { type: String, trim: true, default: '' },
  debt:                    { type: String, trim: true, default: '' },
  ccount:                  { type: String, trim: true, default: '' },
  monthly_payment:         { type: String, trim: true, default: '' },
  remark:                  { type: String, trim: true, default: '' },
  custom1:                 { type: String, trim: true, default: '' },
  custom2:                 { type: String, trim: true, default: '' },
  custom3:                 { type: String, trim: true, default: '' },
  custom4:                 { type: String, trim: true, default: '' },
  custom5:                 { type: String, trim: true, default: '' },
  custom6:                 { type: String, trim: true, default: '' },

  // ── Parsed date for efficient date-range queries ───────────────
  entryDateParsed: { type: Date, index: true },

  // ── System / meta fields ───────────────────────────────────────
  sharedWith: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Shared-with user is required'],
    index: true
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Uploader user is required']
  },
  uploadBatchId: {
    type: String,
    required: true,
    index: true
  },
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization'
  }
}, {
  timestamps: true,
  collection: 'adminuploads'      // explicit collection name
});

// ── Indexes ────────────────────────────────────────────────────────
adminUploadSchema.index({ sharedWith: 1, createdAt: -1 });
adminUploadSchema.index({ sharedWith: 1, entryDateParsed: -1 });
adminUploadSchema.index({ uploadedBy: 1, createdAt: -1 });
adminUploadSchema.index({ organization: 1 });

module.exports = mongoose.model('AdminUpload', adminUploadSchema);

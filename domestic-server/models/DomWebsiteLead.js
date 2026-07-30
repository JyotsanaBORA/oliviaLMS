'use strict';
const mongoose = require('mongoose');

/**
 * DomWebsiteLead — raw lead from website form or Meta Lead Ads.
 * An agent loads it, then fills a full DomLead while on the call.
 */
const domWebsiteLeadSchema = new mongoose.Schema(
  {
    // Lead origin: 'website' | 'meta' | 'manual'
    source: {
      type: String,
      enum: ['website', 'meta', 'manual'],
      default: 'website',
      index: true,
    },

    // Data from website form or Meta Lead Ads
    name:           { type: String, trim: true, maxlength: 100 },
    mobile:         { type: String, trim: true, maxlength: 20, index: true },
    city:           { type: String, trim: true, maxlength: 100 },
    monthlyIncome:  { type: String, trim: true, maxlength: 50 },
    employment:     { type: String, trim: true, maxlength: 50 },
    productType:    { type: String, trim: true, maxlength: 100 },
    pan:            { type: String, trim: true, uppercase: true, maxlength: 10 },
    sourcePage:     { type: String, trim: true, maxlength: 300 },
    utmSource:      { type: String, trim: true, maxlength: 100 },
    utmMedium:      { type: String, trim: true, maxlength: 100 },
    utmCampaign:    { type: String, trim: true, maxlength: 100 },
    ip:             { type: String, trim: true, maxlength: 50 },

    // Custom / unrecognised Meta form fields appended here
    customNotes:    { type: String, trim: true, maxlength: 2000 },

    // ── Meta Lead Ads specific ────────────────────────────────────────────
    // Unique Meta leadgen_id — prevents duplicate saves
    metaLeadgenId:  { type: String, trim: true, maxlength: 30, default: null, index: true, sparse: true },

    // Every raw field Meta sent, verbatim — never lose custom form questions
    parsedFields:   { type: mongoose.Schema.Types.Mixed, default: null },

    // Full Meta audit trail (page, form, ad, campaign info)
    metaRawPayload: { type: mongoose.Schema.Types.Mixed, default: null },

    // Processing state
    // new       → lead arrived, no agent has loaded it
    // loaded    → an agent clicked "Load", currently working on it
    // completed → agent submitted the full DomLead form
    // rejected  → admin marked as invalid/spam
    status: {
      type: String,
      enum: ['new', 'loaded', 'completed', 'rejected'],
      default: 'new',
      index: true,
    },

    // Agent who loaded this lead
    loadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
      default: null,
      index: true,
    },

    // When agent loaded / completed
    loadedAt:       { type: Date, default: null },
    completedAt:    { type: Date, default: null },

    // Reference to the full worked lead (set when agent submits DomLead)
    domLeadId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomLead',
      default: null,
    },
  },
  { timestamps: true }
);

domWebsiteLeadSchema.index({ status: 1, createdAt: -1 });
domWebsiteLeadSchema.index({ loadedBy: 1, status: 1 });
domWebsiteLeadSchema.index({ createdAt: -1 });
domWebsiteLeadSchema.index({ name: 'text', mobile: 'text' });

module.exports = mongoose.model('DomWebsiteLead', domWebsiteLeadSchema);

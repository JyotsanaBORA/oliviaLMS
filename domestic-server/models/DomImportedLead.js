'use strict';
const mongoose = require('mongoose');

/**
 * DomImportedLead — a lead row imported from Excel/CSV by the super admin.
 * Supports the standard VINTAGE format headers as shared by the business.
 * Flow: imported → shared (with admin) → assigned (to agent)
 */
const domImportedLeadSchema = new mongoose.Schema(
  {
    // ── Core identifiers ───────────────────────────────────────────────────
    name:   { type: String, trim: true, maxlength: 150 },   // Customer Name
    mobile: { type: String, trim: true, maxlength: 20, index: true }, // Mobile Number
    email:  { type: String, trim: true, lowercase: true, maxlength: 150 }, // E Mail

    // ── Customer profile ───────────────────────────────────────────────────
    dateOfBirth:              { type: String, trim: true, maxlength: 30 },
    age:                      { type: String, trim: true, maxlength: 10 },
    customerAadharNo:         { type: String, trim: true, maxlength: 20 },
    panNumber:                { type: String, trim: true, uppercase: true, maxlength: 15 },
    customerPreferredLanguage:{ type: String, trim: true, maxlength: 50 },

    // ── Address ────────────────────────────────────────────────────────────
    residenceAddress:    { type: String, trim: true, maxlength: 500 },
    residencePhoneNumber:{ type: String, trim: true, maxlength: 20 },
    officeAddress:       { type: String, trim: true, maxlength: 500 },
    officePhoneNumber:   { type: String, trim: true, maxlength: 20 },
    zipCode:             { type: String, trim: true, maxlength: 10 },
    city:                { type: String, trim: true, maxlength: 100 },
    state:               { type: String, trim: true, maxlength: 100 },

    // ── Loan / financial details ───────────────────────────────────────────
    vintage:                 { type: String, trim: true, maxlength: 100 },
    loanType:                { type: String, trim: true, maxlength: 100 },
    productType:             { type: String, trim: true, maxlength: 100 }, // alias / legacy
    amountFinanced:          { type: String, trim: true, maxlength: 50 },
    totalOutstandingAmount:  { type: String, trim: true, maxlength: 50 },
    principalOutstanding:    { type: String, trim: true, maxlength: 50 },
    noOfInstallmentOverdue:  { type: String, trim: true, maxlength: 20 },
    expiryStatus:            { type: String, trim: true, maxlength: 50 },
    expiryDate:              { type: String, trim: true, maxlength: 30 },
    disbursalAmount:         { type: String, trim: true, maxlength: 50 },
    sanctionDate:            { type: String, trim: true, maxlength: 30 },
    countOfLiveLoans:        { type: String, trim: true, maxlength: 10 },
    bankName:                { type: String, trim: true, maxlength: 100 },

    // ── Employment ─────────────────────────────────────────────────────────
    employment:      { type: String, trim: true, maxlength: 100 }, // Employement Type
    firmEmployeeName:{ type: String, trim: true, maxlength: 150 }, // Firm/Employee Name
    monthlyIncome:   { type: String, trim: true, maxlength: 50 },

    // ── Asset / CIBIL ──────────────────────────────────────────────────────
    cibilScore:          { type: String, trim: true, maxlength: 20 },
    cibilScoreDate:      { type: String, trim: true, maxlength: 30 },
    assetDescription:    { type: String, trim: true, maxlength: 300 },
    make:                { type: String, trim: true, maxlength: 100 },
    propertyValueLatest: { type: String, trim: true, maxlength: 50 },
    loanAmount:          { type: String, trim: true, maxlength: 50 }, // legacy
    remarks:             { type: String, trim: true, maxlength: 1000 },

    // ── Import batch tracking ──────────────────────────────────────────────
    importBatchId:   { type: String, index: true },
    importBatchName: { type: String, trim: true, maxlength: 200 },
    importedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
      required: true,
      index: true,
    },

    // ── Sharing ────────────────────────────────────────────────────────────
    sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'DomUser' }],
    sharedAt:   { type: Date, default: null },
    sharedBy:   { type: mongoose.Schema.Types.ObjectId, ref: 'DomUser', default: null },

    // ── Assignment ─────────────────────────────────────────────────────────
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'DomUser', default: null, index: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'DomUser', default: null },
    assignedAt: { type: Date, default: null },

    // ── Work tracking ──────────────────────────────────────────────────────
    domLeadId: { type: mongoose.Schema.Types.ObjectId, ref: 'DomLead', default: null },
    workStatus: {
      type: String,
      enum: ['new', 'in_progress', 'interested', 'not_interested', 'closed'],
      default: 'new',
      index: true,
    },
    callOutcome:  { type: String, trim: true, maxlength: 50 },
    callbackDate: { type: String, trim: true, maxlength: 20 },
    agentNotes:   { type: String, trim: true, maxlength: 1000 },
    workedAt:     { type: Date, default: null },

    // ── Status pipeline ────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['imported', 'shared', 'assigned'],
      default: 'imported',
      index: true,
    },
  },
  { timestamps: true }
);

domImportedLeadSchema.index({ status: 1, createdAt: -1 });
domImportedLeadSchema.index({ sharedWith: 1, status: 1 });
domImportedLeadSchema.index({ importBatchId: 1, createdAt: -1 });

module.exports = mongoose.model('DomImportedLead', domImportedLeadSchema);


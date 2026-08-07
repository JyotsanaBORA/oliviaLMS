'use strict';
const mongoose = require('mongoose');

/**
 * DomLead — agent-worked lead.  Created when a domagent submits the full
 * form after loading a DomWebsiteLead and calling the customer.
 * A lead can be edited after initial submission (e.g. correction of errors).
 */
const documentSchema = new mongoose.Schema(
  {
    docType: {
      type: String,
      enum: [
        'aadhaar_front',
        'aadhaar_back',
        'pan_card',
        'salary_slip_1',
        'salary_slip_2',
        'salary_slip_3',
        'bank_statement',
        'form_16',
        'itr',
        'business_proof',
        'other',
      ],
      required: true,
    },
    originalName: { type: String, trim: true, maxlength: 255 },
    filename:     { type: String, trim: true, maxlength: 255 }, // stored filename on disk
    mimetype:     { type: String, trim: true, maxlength: 100 },
    size:         { type: Number },
    url:          { type: String, trim: true, maxlength: 500 }, // served path
    uploadedAt:   { type: Date, default: Date.now },
  },
  { _id: true }
);

const domLeadSchema = new mongoose.Schema(
  {
    // Link back to the website lead (null for manually entered leads)
    sourceWebsiteLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomWebsiteLead',
      required: false,
      default: null,
      index: true,
    },

    // Link back to an imported lead (when agent works a pool lead)
    sourceImportedLead: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomImportedLead',
      required: false,
      default: null,
      index: true,
    },

    // True when created by agent without a website lead
    isManual: { type: Boolean, default: false },

    // Agent who owns this lead
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
      required: true,
      index: true,
    },

    // Created/last updated by
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
      required: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
    },

    // ── Personal details ───────────────────────────────────────────────────
    name:     { type: String, trim: true, maxlength: 100 },
    dob:      { type: String, trim: true, maxlength: 20 },
    pan:      { type: String, trim: true, uppercase: true, maxlength: 10 },
    aadhaar:  { type: String, trim: true, maxlength: 20 },
    fatherName:      { type: String, trim: true, maxlength: 100 },
    motherName:      { type: String, trim: true, maxlength: 100 },
    maritalStatus:   { type: String, enum: ['single', 'married', 'divorced', 'widowed', ''], default: '' },
    spouseName:      { type: String, trim: true, maxlength: 100 },
    educationDetails:{ type: String, trim: true, maxlength: 150 },
    segment:         { type: String, trim: true, maxlength: 50 },
    location:        { type: String, trim: true, maxlength: 100 },
    tcName:          { type: String, trim: true, maxlength: 100 },

    // ── Contact details ────────────────────────────────────────────────────
    mobile:           { type: String, trim: true, maxlength: 20 },
    alternateMobile:  { type: String, trim: true, maxlength: 20 },
    email:            { type: String, trim: true, lowercase: true, maxlength: 100 },
    address:          { type: String, trim: true, maxlength: 300 },
    city:             { type: String, trim: true, maxlength: 100 },
    state:            { type: String, trim: true, maxlength: 60 },
    pincode:          { type: String, trim: true, maxlength: 10 },
    currentAddressType:     { type: String, enum: ['rented', 'owned', ''], default: '' },
    yearsAtCurrentAddress:  { type: Number, min: 0 },
    permanentAddress:       { type: String, trim: true, maxlength: 300 },
    paContactNumber:        { type: String, trim: true, maxlength: 20 },

    employmentType: {
      type: String,
      enum: ['salaried', 'self_employed', 'business', 'unemployed', 'other', ''],
      default: '',
    },
    companyName:      { type: String, trim: true, maxlength: 150 },
    monthlySalary:    { type: Number, min: 0 },
    customEmploymentType: { type: String, trim: true, maxlength: 100 },
    officeAddress:    { type: String, trim: true, maxlength: 300 },
    officeLandline:   { type: String, trim: true, maxlength: 20 },
    officialEmail:    { type: String, trim: true, lowercase: true, maxlength: 100 },
    yearsAtCurrentJob:{ type: Number, min: 0 },
    totalJobExp:      { type: Number, min: 0 },

    // ── References ─────────────────────────────────────────────────────────
    ref1Name:    { type: String, trim: true, maxlength: 100 },
    ref1Contact: { type: String, trim: true, maxlength: 20 },
    ref1Address: { type: String, trim: true, maxlength: 300 },
    ref2Name:    { type: String, trim: true, maxlength: 100 },
    ref2Contact: { type: String, trim: true, maxlength: 20 },
    ref2Address: { type: String, trim: true, maxlength: 300 },

    // ── Unique trackable reference ID (e.g. PL-260611-A3F7) ───────────────
    // Prefix encodes the service, suffix is date+random — never changes once set.
    // If productType is updated the prefix is rewritten but the date+rand stays.
    leadRef: {
      type:      String,
      trim:      true,
      uppercase: true,
      maxlength: 25,
      index:     true,
      sparse:    true,
    },

    // ── Loan / service details ─────────────────────────────────────────────
    productType: {
      type: String,
      enum: [
        // Loans
        'personal_loan', 'home_loan', 'car_loan', 'business_loan',
        'loan_against_property', 'education_loan', 'gold_loan',
        // Cards
        'credit_card',
        // Insurance
        'health_insurance', 'life_insurance', 'motor_insurance', 'travel_insurance',
        // Investments
        'mutual_fund', 'sip', 'demat',
        // Fallback
        'general', 'other', '',
      ],
      default: '',
    },
    loanAmountRequired: { type: Number, min: 0 },

    // ── Banking details ────────────────────────────────────────────────────
    existingBank:       { type: String, trim: true, maxlength: 100 },
    salaryAccountBank:  { type: String, trim: true, maxlength: 100 },

    // ── Credit details ─────────────────────────────────────────────────────
    cibilScoreRange: {
      type: String,
      enum: ['below_600', '600_699', '700_749', '750_800', 'above_800', 'unknown', ''],
      default: '',
    },
    existingLoans: [{ type: String, trim: true, maxlength: 100 }],
    existingEMI:   { type: Number, min: 0 },

    // ── Call disposition ───────────────────────────────────────────────────
    callOutcome: {
      type: String,
      enum: ['interested', 'not_interested', 'not_eligible', 'callback', 'not_reachable', 'wrong_number', 'not_answering', 'other', ''],
      default: '',
    },
    callbackDate:        { type: String, trim: true, maxlength: 30 },
    notes:               { type: String, trim: true, maxlength: 3000 },
    customCallOutcome:   { type: String, trim: true, maxlength: 100 },

    // ── Documents ──────────────────────────────────────────────────────────
    documents: [documentSchema],

    // ── Lead status ────────────────────────────────────────────────────────
    // pending   → agent submitted form at least once but may still edit
    // completed → admin/agent marks as fully processed
    status: {
      type: String,
      enum: ['pending', 'completed', 'rejected'],
      default: 'pending',
      index: true,
    },
  },
  { timestamps: true }
);

domLeadSchema.index({ assignedTo: 1, createdAt: -1 });
domLeadSchema.index({ status: 1, createdAt: -1 });
domLeadSchema.index({ productType: 1, createdAt: -1 });
domLeadSchema.index({ mobile: 1 });
domLeadSchema.index({ name: 'text', mobile: 'text', leadRef: 'text' });

module.exports = mongoose.model('DomLead', domLeadSchema);

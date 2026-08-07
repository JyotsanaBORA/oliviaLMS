'use strict';
const express        = require('express');
const path           = require('path');
const fs             = require('fs');
const archiver       = require('archiver');
const XLSX           = require('xlsx');
const DomLead         = require('../models/DomLead');
const DomWebsiteLead  = require('../models/DomWebsiteLead');
const DomImportedLead = require('../models/DomImportedLead');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', process.env.UPLOAD_PATH || 'uploads');

// Map callOutcome → workStatus for imported leads
const OUTCOME_TO_WORK_STATUS = {
  interested:     'interested',
  not_interested: 'not_interested',
  not_eligible:   'not_interested',
  wrong_number:   'closed',
  callback:       'in_progress',
  not_reachable:  'in_progress',
  not_answering:  'in_progress',
  other:          'in_progress',
};

// ── POST /domestic-api/leads ───────────────────────────────────────────────
// Domagent submits a worked lead — from a website lead, imported lead, or manual entry
router.post('/', protect, authorize('domagent', 'dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const { sourceWebsiteLead, sourceImportedLead, ...fields } = req.body;

    // ── Website-lead path ──────────────────────────────────────────────────
    if (sourceWebsiteLead) {
      const websiteLead = await DomWebsiteLead.findById(sourceWebsiteLead).lean();
      if (!websiteLead) {
        return res.status(404).json({ success: false, message: 'Website lead not found.' });
      }

      if (
        req.user.role === 'domagent' &&
        websiteLead.loadedBy?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ success: false, message: 'You did not load this lead.' });
      }

      const existing = await DomLead.findOne({ sourceWebsiteLead }).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          message: 'A worked lead already exists for this website lead. Use PATCH to update it.',
          domLeadId: existing._id,
        });
      }

      const sanitized = sanitizeLeadFields(fields);
      // Auto-status: close rejected outcomes immediately
      if (['not_interested', 'wrong_number'].includes(sanitized.callOutcome)) {
        sanitized.status = 'rejected';
      }
      const domLead = await DomLead.create({
        sourceWebsiteLead,
        assignedTo:    websiteLead.loadedBy || req.user._id,
        createdBy:     req.user._id,
        lastUpdatedBy: req.user._id,
        leadRef:       generateLeadRef(sanitized.productType || ''),
        ...sanitized,
      });

      await DomWebsiteLead.findByIdAndUpdate(sourceWebsiteLead, {
        status:      'completed',
        completedAt: new Date(),
        domLeadId:   domLead._id,
      });

      return res.status(201).json({ success: true, data: domLead });
    }

    // ── Imported-lead path ─────────────────────────────────────────────────
    if (sourceImportedLead) {
      const importedLead = await DomImportedLead.findById(sourceImportedLead).lean();
      if (!importedLead) {
        return res.status(404).json({ success: false, message: 'Imported lead not found.' });
      }

      // Agents can only work leads assigned to them
      if (
        req.user.role === 'domagent' &&
        importedLead.assignedTo?.toString() !== req.user._id.toString()
      ) {
        return res.status(403).json({ success: false, message: 'This lead is not assigned to you.' });
      }

      // If already worked, return the existing DomLead for editing
      if (importedLead.domLeadId) {
        return res.status(409).json({
          success: false,
          message: 'This lead is already worked. Use PATCH to update it.',
          domLeadId: importedLead.domLeadId,
        });
      }

      const sanitized = sanitizeLeadFields(fields);
      // Auto-status on create
      if (['not_interested', 'wrong_number', 'not_eligible'].includes(sanitized.callOutcome)) {
        sanitized.status = 'rejected';
      }
      const domLead = await DomLead.create({
        sourceImportedLead,
        assignedTo:    importedLead.assignedTo || req.user._id,
        createdBy:     req.user._id,
        lastUpdatedBy: req.user._id,
        leadRef:       generateLeadRef(sanitized.productType || ''),
        ...sanitized,
      });

      // Update the imported lead to record the worked state
      const workStatus = OUTCOME_TO_WORK_STATUS[sanitized.callOutcome] || 'in_progress';
      await DomImportedLead.findByIdAndUpdate(sourceImportedLead, {
        domLeadId:   domLead._id,
        workStatus,
        callOutcome: sanitized.callOutcome || '',
        workedAt:    new Date(),
      });

      return res.status(201).json({ success: true, data: domLead });
    }

    // ── Manual lead path (no website lead, no imported lead) ──────────────
    const sanitizedManual = sanitizeLeadFields(fields);
    const domLead = await DomLead.create({
      assignedTo:    req.user._id,
      createdBy:     req.user._id,
      lastUpdatedBy: req.user._id,
      isManual:      true,
      leadRef:       generateLeadRef(sanitizedManual.productType || ''),
      ...sanitizedManual,
    });

    return res.status(201).json({ success: true, data: domLead });
  } catch (err) {
    console.error('[Leads] Create error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to create lead.' });
  }
});

// ── PATCH /domestic-api/leads/:id ─────────────────────────────────────────
// Domagent edits their worked lead (corrections, additional info)
router.patch('/:id', protect, authorize('domagent', 'dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const lead = await DomLead.findById(req.params.id).lean();
    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    // Domagent can only edit their own leads
    if (
      req.user.role === 'domagent' &&
      lead.assignedTo?.toString() !== req.user._id.toString()
    ) {
      return res.status(403).json({ success: false, message: 'Not authorized to edit this lead.' });
    }

    const updates = {
      ...sanitizeLeadFields(req.body),
      lastUpdatedBy: req.user._id,
    };

    // ── Auto-status logic based on call outcome ────────────────────────────
    // Agents/admins set callOutcome; we auto-drive the status field so the
    // admin table always reflects the true state without manual intervention.
    if (updates.callOutcome) {
      if (['not_interested', 'wrong_number', 'not_eligible'].includes(updates.callOutcome)) {
        // Customer closed — mark as rejected (no further work needed)
        updates.status = 'rejected';
      } else if (['interested', 'callback', 'not_reachable', 'not_answering', 'other'].includes(updates.callOutcome)) {
        // Still active — keep/restore to pending so it stays in the work queue
        // (only if it was previously rejected, e.g. agent changes their mind)
        if (lead.status === 'rejected') updates.status = 'pending';
      }
    }

    // If productType changed, swap the leadRef prefix (keep the date+rand suffix)
    if (updates.productType && updates.productType !== lead.productType) {
      updates.leadRef = swapLeadRefPrefix(lead.leadRef, updates.productType);
    }
    // If lead has no ref yet (old record), generate one now
    if (!lead.leadRef) {
      updates.leadRef = generateLeadRef(updates.productType || lead.productType || '');
    }

    const updated = await DomLead.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    })
      .populate('assignedTo', 'name email')
      .lean();

    // Sync workStatus back to the imported lead if linked
    if (updated.sourceImportedLead && updates.callOutcome) {
      const workStatus = OUTCOME_TO_WORK_STATUS[updates.callOutcome] || 'in_progress';
      await DomImportedLead.findByIdAndUpdate(updated.sourceImportedLead, {
        workStatus,
        callOutcome: updates.callOutcome,
        workedAt:    new Date(),
      });
    }

    return res.status(200).json({ success: true, data: updated });
  } catch (err) {
    console.error('[Leads] Update error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update lead.' });
  }
});

// ── GET /domestic-api/leads/followups ─────────────────────────────────────
// Agent: get all leads requiring a follow-up call (callback / not_reachable / wrong_number)
// Sorted by callbackDate ascending (overdue first), then updatedAt desc
router.get('/followups', protect, authorize('domagent', 'dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const agentId = req.user.role === 'domagent' ? req.user._id : (req.query.agentId || null);
    const filter  = {
      callOutcome: { $in: ['callback', 'not_reachable', 'wrong_number', 'not_answering'] },
      status:      { $nin: ['completed'] },
    };
    if (agentId) filter.assignedTo = agentId;

    const leads = await DomLead.find(filter)
      .populate('sourceWebsiteLead',  'name mobile productType')
      .populate('sourceImportedLead', 'name mobile loanType totalOutstandingAmount principalOutstanding noOfInstallmentOverdue cibilScore bankName employment residencePhoneNumber officePhoneNumber vintage disbursalAmount amountFinanced')
      .sort({ callbackDate: 1, updatedAt: -1 })
      .limit(200)
      .lean();

    return res.status(200).json({ success: true, data: leads });
  } catch (err) {
    console.error('[Leads] Followups error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch follow-ups.' });
  }
});

// ── GET /domestic-api/leads ────────────────────────────────────────────────
// Domagent: their own leads. Admin/SuperAdmin: all leads with filters.
router.get('/', protect, async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const page   = Math.max(1, parseInt(req.query.page)  || 1);
    const limit  = Math.min(500, parseInt(req.query.limit) || 50);
    const skip   = (page - 1) * limit;
    const status = req.query.status;
    const search = (req.query.search || '').trim();

    const filter = {};

    if (role === 'domagent') {
      filter.assignedTo = userId;
    } else if (req.query.agentId) {
      filter.assignedTo = req.query.agentId;
    }

    if (req.query.isManual === 'true') filter.isManual = true;

    // Date range filter — parse as LOCAL date (handles India/IST timezone correctly)
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) {
        const [y, m, d] = req.query.dateFrom.split('-').map(Number);
        const start = new Date(y, m - 1, d, 0, 0, 0, 0);
        filter.createdAt.$gte = start;
      }
      if (req.query.dateTo) {
        const [y, m, d] = req.query.dateTo.split('-').map(Number);
        const end = new Date(y, m - 1, d, 23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    if (status && ['pending', 'completed', 'rejected'].includes(status)) {
      filter.status = status;
    }
    if (req.query.productType) filter.productType = req.query.productType;
    // Filter by CIBIL score range
    if (req.query.cibilScoreRange) {
      const validRanges = ['below_600', '600_699', '700_749', '750_800', 'above_800', 'unknown'];
      if (validRanges.includes(req.query.cibilScoreRange)) filter.cibilScoreRange = req.query.cibilScoreRange;
    }
    // Filter by specific call outcome / disposition
    if (req.query.callOutcome) {
      const validOutcomes = ['interested', 'not_interested', 'not_eligible', 'callback', 'not_reachable', 'not_answering', 'wrong_number', 'other', 'none'];
      if (req.query.callOutcome === 'none') {
        filter.$or = [{ callOutcome: '' }, { callOutcome: { $exists: false } }];
      } else if (validOutcomes.includes(req.query.callOutcome)) {
        filter.callOutcome = req.query.callOutcome;
      }
    }
    if (search) {
      // Search by leadRef directly if it looks like a ref code (contains a dash)
      if (search.includes('-')) {
        filter.$or = [
          { leadRef: { $regex: search.replace(/-/g, '\\-'), $options: 'i' } },
          { name:    { $regex: search, $options: 'i' } },
          { mobile:  { $regex: search, $options: 'i' } },
        ];
      } else {
        filter.$or = [
          { leadRef: { $regex: search, $options: 'i' } },
          { name:    { $regex: search, $options: 'i' } },
          { mobile:  { $regex: search, $options: 'i' } },
          { pan:     { $regex: search, $options: 'i' } },
          { email:   { $regex: search, $options: 'i' } },
          { city:    { $regex: search, $options: 'i' } },
        ];
      }
    }

    const [leads, total] = await Promise.all([
      DomLead.find(filter)
        .populate('assignedTo', 'name email')
        .populate('createdBy', 'name')
        .populate('sourceWebsiteLead', 'name mobile productType status')
        .populate('sourceImportedLead',
          'name mobile loanType totalOutstandingAmount principalOutstanding ' +
          'noOfInstallmentOverdue cibilScore cibilScoreDate disbursalAmount amountFinanced ' +
          'bankName employment firmEmployeeName panNumber customerAadharNo dateOfBirth age ' +
          'residenceAddress residencePhoneNumber officeAddress officePhoneNumber ' +
          'countOfLiveLoans vintage expiryStatus expiryDate sanctionDate ' +
          'assetDescription zipCode make customerPreferredLanguage workStatus callOutcome'
        )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DomLead.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data: leads,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[Leads] GET error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch leads.' });
  }
});

// ── PATCH /domestic-api/leads/:id/status ──────────────────────────────────
// Admin / SuperAdmin: change a lead's status directly.
// Body: { status: 'pending' | 'completed' | 'rejected' }
router.patch('/:id/status', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'completed', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status. Use: pending, completed, rejected.' });
    }

    const lead = await DomLead.findByIdAndUpdate(
      req.params.id,
      { status, lastUpdatedBy: req.user._id },
      { new: true, runValidators: true }
    ).lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    return res.status(200).json({ success: true, data: lead, message: `Lead marked as ${status}.` });
  } catch (err) {
    console.error('[Leads] Status update error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update lead status.' });
  }
});

// Helper: build MongoDB filter for document completeness
const CORE_DOC_TYPES       = ['aadhaar_front', 'aadhaar_back'];
const FINANCIAL_DOC_TYPES  = ['salary_slip_1', 'bank_statement', 'itr', 'form_16', 'business_proof'];
const FULL_DOC_FILTER = {
  $and: [
    { documents: { $elemMatch: { docType: { $in: CORE_DOC_TYPES } } } },        // has ID doc
    { documents: { $elemMatch: { docType: 'pan_card' } } },                      // has PAN
    { documents: { $elemMatch: { docType: { $in: FINANCIAL_DOC_TYPES } } } },    // has financial doc
  ],
};
function buildDocStatusFilter(docStatus) {
  if (docStatus === 'none')    return { $or: [{ documents: { $size: 0 } }, { 'documents.0': { $exists: false } }] };
  if (docStatus === 'full')    return FULL_DOC_FILTER;
  if (docStatus === 'partial') return { $and: [{ 'documents.0': { $exists: true } }, { $nor: [FULL_DOC_FILTER] }] };
  return null;
}

// ── GET /domestic-api/leads/export ────────────────────────────────────────
// SuperAdmin only: export all filtered leads as Excel download.
router.get('/export', protect, authorize('dom_superadmin'), async (req, res) => {
  try {
    const status      = req.query.status;
    const search      = (req.query.search || '').trim();
    const productType = req.query.productType;
    const agentId     = req.query.agentId;
    const callOutcome = req.query.callOutcome;
    const docStatus   = req.query.docStatus;   // 'none'|'partial'|'full'

    const filter = {};
    if (agentId)    filter.assignedTo = agentId;
    if (status && ['pending', 'completed', 'rejected'].includes(status)) filter.status = status;
    if (productType) filter.productType = productType;
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) { const [y,m,d] = req.query.dateFrom.split('-').map(Number); filter.createdAt.$gte = new Date(y,m-1,d,0,0,0,0); }
      if (req.query.dateTo)   { const [y,m,d] = req.query.dateTo.split('-').map(Number);   filter.createdAt.$lte = new Date(y,m-1,d,23,59,59,999); }
    }
    // Use $and to safely combine callOutcome and search without $or conflict
    const andConds = [];
    if (callOutcome) {
      if (callOutcome === 'none') andConds.push({ $or: [{ callOutcome: '' }, { callOutcome: { $exists: false } }] });
      else andConds.push({ callOutcome });
    }
    if (search) {
      andConds.push({ $or: [
        { leadRef: { $regex: search, $options: 'i' } },
        { name:    { $regex: search, $options: 'i' } },
        { mobile:  { $regex: search, $options: 'i' } },
        { pan:     { $regex: search, $options: 'i' } },
        { email:   { $regex: search, $options: 'i' } },
        { city:    { $regex: search, $options: 'i' } },
      ]});
    }
    if (andConds.length) filter.$and = andConds;

    // Doc status filter
    const dsf = buildDocStatusFilter(docStatus);
    if (dsf) Object.assign(filter, dsf.$and ? { $and: [...(filter.$and || []), ...dsf.$and] } : dsf);

    const leads = await DomLead.find(filter)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(5000)
      .lean();

    const headers = [
      'Lead ID', 'Segment', 'Location', 'TC Name',
      'Name', 'Father Name', 'Mother Name', 'DOB', 'PAN', 'Aadhaar', 'Education', 'Marital Status', 'Spouse Name',
      'Mobile', 'Alt Mobile', 'Email', 'Official Email',
      'Current Address', 'City', 'State', 'Pincode', 'Residence Type', 'Years at Residence',
      'Permanent Address', 'PA Contact',
      'Employment', 'Company', 'Monthly Salary (₹)', 'Office Address', 'Office Landline',
      'Years at Job', 'Total Exp',
      'Product', 'Loan Amount (₹)', 'Existing Bank', 'Salary Bank', 'CIBIL Range', 'Existing EMI (₹)',
      'Ref1 Name', 'Ref1 Contact', 'Ref1 Address',
      'Ref2 Name', 'Ref2 Contact', 'Ref2 Address',
      'Disposition', 'Custom Disposition', 'Callback Date', 'Notes',
      'Status', 'Agent', 'Agent Email',
      'Docs Count', 'Doc Types', 'Created On',
    ];

    const rows = leads.map((l) => [
      l.leadRef || '',
      l.segment || '', l.location || '', l.tcName || '',
      l.name || '', l.fatherName || '', l.motherName || '',
      l.dob || '', l.pan || '', l.aadhaar || '', l.educationDetails || '',
      l.maritalStatus || '', l.spouseName || '',
      l.mobile || '', l.alternateMobile || '', l.email || '', l.officialEmail || '',
      l.address || '', l.city || '', l.state || '', l.pincode || '',
      l.currentAddressType || '', l.yearsAtCurrentAddress ?? '',
      l.permanentAddress || '', l.paContactNumber || '',
      (l.employmentType || '').replace(/_/g, ' '), l.companyName || '',
      l.monthlySalary ? Number(l.monthlySalary) : '',
      l.officeAddress || '', l.officeLandline || '',
      l.yearsAtCurrentJob ?? '', l.totalJobExp ?? '',
      (l.productType || '').replace(/_/g, ' '),
      l.loanAmountRequired ? Number(l.loanAmountRequired) : '',
      l.existingBank || '', l.salaryAccountBank || '',
      (l.cibilScoreRange || '').replace(/_/g, ' '),
      l.existingEMI ? Number(l.existingEMI) : '',
      l.ref1Name || '', l.ref1Contact || '', l.ref1Address || '',
      l.ref2Name || '', l.ref2Contact || '', l.ref2Address || '',
      (l.callOutcome || '').replace(/_/g, ' '), l.customCallOutcome || '',
      l.callbackDate || '', l.notes || '',
      l.status || '', l.assignedTo?.name || '', l.assignedTo?.email || '',
      (l.documents || []).length,
      (l.documents || []).map((d) => d.docType.replace(/_/g, ' ')).join('; '),
      l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN', { hour12: true }) : '',
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);

    // Column widths
    ws['!cols'] = [
      { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 16 }, { wch: 26 },
      { wch: 12 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 },
      { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 22 }, { wch: 16 },
      { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 },
      { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 30 }, { wch: 12 },
      { wch: 20 }, { wch: 26 }, { wch: 8 }, { wch: 30 }, { wch: 22 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Leads');
    const xlsBuf  = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const xlsName = `domestic-leads-${new Date().toISOString().slice(0,10)}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${xlsName}"`);
    return res.send(xlsBuf);
  } catch (err) {
    console.error('[Leads] Export error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to export leads.' });
  }
});

// ── GET /domestic-api/leads/export-zip ────────────────────────────────────
// SuperAdmin only: bulk ZIP — master Excel with all filtered leads + every
// lead's uploaded documents organised in per-lead subfolders.
router.get('/export-zip', protect, authorize('dom_superadmin'), async (req, res) => {
  try {
    const status      = req.query.status;
    const search      = (req.query.search || '').trim();
    const productType = req.query.productType;
    const agentId     = req.query.agentId;
    const callOutcome = req.query.callOutcome;
    const docStatus   = req.query.docStatus;  // 'none'|'partial'|'full'

    const filter = {};
    if (agentId)    filter.assignedTo = agentId;
    if (status && ['pending', 'completed', 'rejected'].includes(status)) filter.status = status;
    if (productType) filter.productType = productType;

    // Date range
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) { const [y,m,d] = req.query.dateFrom.split('-').map(Number); filter.createdAt.$gte = new Date(y,m-1,d,0,0,0,0); }
      if (req.query.dateTo)   { const [y,m,d] = req.query.dateTo.split('-').map(Number);   filter.createdAt.$lte = new Date(y,m-1,d,23,59,59,999); }
    }

    // Call outcome + search via $and to avoid $or conflict
    const andConditions = [];
    if (callOutcome) {
      if (callOutcome === 'none') andConditions.push({ $or: [{ callOutcome: '' }, { callOutcome: { $exists: false } }] });
      else andConditions.push({ callOutcome });
    }
    if (search) {
      andConditions.push({ $or: [
        { leadRef: { $regex: search, $options: 'i' } },
        { name:    { $regex: search, $options: 'i' } },
        { mobile:  { $regex: search, $options: 'i' } },
        { city:    { $regex: search, $options: 'i' } },
      ]});
    }
    // Doc status filter — when partial/full, only leads with matching doc set
    const dsf = buildDocStatusFilter(docStatus);
    if (dsf) {
      if (dsf.$and) andConditions.push(...dsf.$and);
      else andConditions.push(dsf);
    }
    if (andConditions.length) filter.$and = andConditions;

    const leads = await DomLead.find(filter)
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .limit(1000)
      .lean();

    const suffix  = docStatus ? `-${docStatus}-docs` : '';
    const dateTag = new Date().toISOString().slice(0, 10);
    const zipName = `leads-with-docs${suffix}-${dateTag}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('[Export ZIP] Archiver error:', err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Archive error.' });
      else res.destroy();
    });
    archive.pipe(res);

    // ── Master Excel sheet (all fields) ──────────────────────────────────
    const headers = [
      'Lead ID', 'Segment', 'Location', 'TC Name',
      'Name', 'Father Name', 'Mother Name', 'DOB', 'PAN', 'Aadhaar', 'Education', 'Marital Status', 'Spouse Name',
      'Mobile', 'Alt Mobile', 'Email', 'Official Email',
      'Current Address', 'City', 'State', 'Pincode', 'Residence Type', 'Years at Residence',
      'Permanent Address', 'PA Contact',
      'Employment', 'Company', 'Monthly Salary (₹)', 'Office Address', 'Office Landline',
      'Years at Job', 'Total Exp',
      'Product', 'Loan Amount (₹)', 'Existing Bank', 'Salary Bank', 'CIBIL Range', 'Existing EMI (₹)',
      'Ref1 Name', 'Ref1 Contact', 'Ref1 Address',
      'Ref2 Name', 'Ref2 Contact', 'Ref2 Address',
      'Disposition', 'Custom Disposition', 'Callback Date', 'Notes',
      'Status', 'Agent', 'Agent Email',
      'Docs Count', 'Doc Types', 'Created On',
    ];
    const rows = leads.map((l) => [
      l.leadRef || '',
      l.segment || '', l.location || '', l.tcName || '',
      l.name || '', l.fatherName || '', l.motherName || '',
      l.dob || '', l.pan || '', l.aadhaar || '', l.educationDetails || '',
      l.maritalStatus || '', l.spouseName || '',
      l.mobile || '', l.alternateMobile || '', l.email || '', l.officialEmail || '',
      l.address || '', l.city || '', l.state || '', l.pincode || '',
      l.currentAddressType || '', l.yearsAtCurrentAddress ?? '',
      l.permanentAddress || '', l.paContactNumber || '',
      (l.employmentType || '').replace(/_/g, ' '), l.companyName || '',
      l.monthlySalary ? Number(l.monthlySalary) : '',
      l.officeAddress || '', l.officeLandline || '',
      l.yearsAtCurrentJob ?? '', l.totalJobExp ?? '',
      (l.productType || '').replace(/_/g, ' '),
      l.loanAmountRequired ? Number(l.loanAmountRequired) : '',
      l.existingBank || '', l.salaryAccountBank || '',
      (l.cibilScoreRange || '').replace(/_/g, ' '),
      l.existingEMI ? Number(l.existingEMI) : '',
      l.ref1Name || '', l.ref1Contact || '', l.ref1Address || '',
      l.ref2Name || '', l.ref2Contact || '', l.ref2Address || '',
      (l.callOutcome || '').replace(/_/g, ' '), l.customCallOutcome || '',
      l.callbackDate || '', l.notes || '',
      l.status || '', l.assignedTo?.name || '', l.assignedTo?.email || '',
      (l.documents || []).length,
      (l.documents || []).map((d) => d.docType.replace(/_/g, ' ')).join('; '),
      l.createdAt ? new Date(l.createdAt).toLocaleString('en-IN', { hour12: true }) : '',
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, 'All Leads');
    const masterBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    archive.append(masterBuf, { name: `All-Leads-${dateTag}.xlsx` });

    // ── Per-lead document folders ─────────────────────────────────────────
    for (const lead of leads) {
      if (!(lead.documents || []).length) continue;
      const safeName = (lead.leadRef || lead._id.toString()).replace(/[^A-Za-z0-9\-_]/g, '_');
      const leadDir  = path.join(UPLOAD_DIR, lead._id.toString());
      for (const doc of lead.documents) {
        const filePath = path.join(leadDir, doc.filename);
        if (fs.existsSync(filePath)) {
          const docLabel    = doc.docType.replace(/_/g, '-');
          const ext         = path.extname(doc.filename) || path.extname(doc.originalName || '');
          archive.file(filePath, { name: `documents/${safeName}/${docLabel}${ext}` });
        }
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('[Leads] Export ZIP error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate export.' });
    }
  }
});

// ── GET /domestic-api/leads/:id/download ──────────────────────────────────
// Admin/SuperAdmin: download a ZIP containing lead info (CSV) + all uploaded documents.
router.get('/:id/download', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const lead = await DomLead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    const leadRef  = lead.leadRef || lead._id.toString();
    const safeName = leadRef.replace(/[^A-Za-z0-9\-_]/g, '_');
    const filename = `${safeName}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => {
      console.error('[Download ZIP] Archiver error:', err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Archive error.' });
      else res.destroy();
    });
    archive.pipe(res);

    // Build lead info as Excel (.xlsx)
    const infoRows = [
      ['Field', 'Value'],
      ['Lead ID',              lead.leadRef || ''],
      ['Name',                 lead.name || ''],
      ['Mobile',               lead.mobile || ''],
      ['Alternate Mobile',     lead.alternateMobile || ''],
      ['Email',                lead.email || ''],
      ['Date of Birth',        lead.dob || ''],
      ['PAN',                  lead.pan || ''],
      ['Aadhaar',              lead.aadhaar || ''],
      ['Address',              lead.address || ''],
      ['City',                 lead.city || ''],
      ['State',                lead.state || ''],
      ['Pincode',              lead.pincode || ''],
      ['Employment Type',      (lead.employmentType || '').replace(/_/g, ' ')],
      ['Company Name',         lead.companyName || ''],
      ['Monthly Salary (₹)',   lead.monthlySalary ? Number(lead.monthlySalary) : ''],
      ['Product / Service',    (lead.productType || '').replace(/_/g, ' ')],
      ['Loan Amount (₹)',      lead.loanAmountRequired ? Number(lead.loanAmountRequired) : ''],
      ['Existing Bank',        lead.existingBank || ''],
      ['Salary Account Bank',  lead.salaryAccountBank || ''],
      ['CIBIL Score Range',    (lead.cibilScoreRange || '').replace(/_/g, ' ')],
      ['Existing EMI (₹)',     lead.existingEMI ? Number(lead.existingEMI) : ''],
      ['Call Outcome',         (lead.callOutcome || '').replace(/_/g, ' ')],
      ['Callback Date',        lead.callbackDate || ''],
      ['Notes',                lead.notes || ''],
      ['Status',               lead.status || ''],
      ['Agent Name',           lead.assignedTo?.name || ''],
      ['Agent Email',          lead.assignedTo?.email || ''],
      ['Documents Count',      (lead.documents || []).length],
      ['Document Types',       (lead.documents || []).map(d => d.docType.replace(/_/g, ' ')).join(', ')],
      ['Created On',           lead.createdAt ? new Date(lead.createdAt).toLocaleString('en-IN', { hour12: true }) : ''],
    ];
    const infoWb = XLSX.utils.book_new();
    const infoWs = XLSX.utils.aoa_to_sheet(infoRows);
    infoWs['!cols'] = [{ wch: 22 }, { wch: 40 }];
    XLSX.utils.book_append_sheet(infoWb, infoWs, 'Lead Info');
    const infoBuf = XLSX.write(infoWb, { type: 'buffer', bookType: 'xlsx' });

    archive.append(infoBuf, { name: `${safeName}-info.xlsx` });

    // Add each document file
    const leadDir = path.join(UPLOAD_DIR, lead._id.toString());
    console.log(`[ZIP] leadDir=${leadDir}, docs=${(lead.documents||[]).length}`);
    for (const doc of (lead.documents || [])) {
      const filePath = path.join(leadDir, doc.filename);
      const exists   = fs.existsSync(filePath);
      console.log(`[ZIP]   ${doc.filename} exists=${exists}`);
      if (exists) {
        const docLabel    = doc.docType.replace(/_/g, '-');
        const ext         = path.extname(doc.filename) || path.extname(doc.originalName || '');
        const archiveName = `documents/${docLabel}${ext}`;
        archive.file(filePath, { name: archiveName });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error('[Leads] Download ZIP error:', err.message);
    if (!res.headersSent) {
      return res.status(500).json({ success: false, message: 'Failed to generate download.' });
    }
  }
});

// ── GET /domestic-api/leads/:id ────────────────────────────────────────────
router.get('/:id', protect, async (req, res) => {
  try {
    const lead = await DomLead.findById(req.params.id)
      .populate('assignedTo', 'name email')
      .populate('sourceWebsiteLead')
      .lean();

    if (!lead) return res.status(404).json({ success: false, message: 'Lead not found.' });

    // Domagent can only view their own
    if (req.user.role === 'domagent' && lead.assignedTo?._id?.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Not authorized.' });
    }

    return res.status(200).json({ success: true, data: lead });
  } catch (err) {
    console.error('[Leads] GET /:id error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch lead.' });
  }
});

// ── Lead Reference ID helpers ──────────────────────────────────────────────
// Format: {PREFIX}-{YYMMDD}-{4CHAR}
// e.g. PL-260611-A3F7, HL-260611-B9XK, CC-260611-M2QW
// The date+random suffix is immutable; prefix updates if productType changes.
const PRODUCT_PREFIX = {
  personal_loan:         'PL',
  home_loan:             'HL',
  car_loan:              'CL',
  business_loan:         'BL',
  loan_against_property: 'LAP',
  education_loan:        'EL',
  gold_loan:             'GL',
  credit_card:           'CC',
  health_insurance:      'HI',
  life_insurance:        'LI',
  motor_insurance:       'MI',
  travel_insurance:      'TI',
  mutual_fund:           'MF',
  sip:                   'SIP',
  demat:                 'DM',
  general:               'GEN',
  other:                 'OTH',
  '':                    'GEN',
};

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/I/1 (ambiguous)

function generateLeadRef(productType) {
  const prefix = PRODUCT_PREFIX[productType] || 'GEN';
  const d      = new Date();
  const date   = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  let rand = '';
  for (let i = 0; i < 4; i++) rand += REF_CHARS[Math.floor(Math.random() * REF_CHARS.length)];
  return `${prefix}-${date}-${rand}`;
}

// When productType changes we swap the prefix but keep the date+rand suffix
// so the same unique code still tracks the same customer.
function swapLeadRefPrefix(existingRef, newProductType) {
  if (!existingRef) return generateLeadRef(newProductType);
  const parts = existingRef.split('-');
  // parts: [PREFIX, DATE(6), RAND(4)] — but PREFIX could be multi-char (LAP, SIP)
  // Last two segments are always DATE and RAND, everything before is the prefix
  if (parts.length < 3) return generateLeadRef(newProductType);
  const suffix    = parts.slice(-2).join('-');        // "YYMMDD-XXXX"
  const newPrefix = PRODUCT_PREFIX[newProductType] || 'GEN';
  return `${newPrefix}-${suffix}`;
}

// ── Helper: whitelist allowed fields ──────────────────────────────────────
// Also normalizes employmentType and productType to lowercase enum values
// so that intake leads from mycashbridge (which may use different casing/names)
// don't fail Mongoose validation.
const EMPLOYMENT_MAP = {
  salaried:         'salaried',
  'self-employed':  'self_employed',
  self_employed:    'self_employed',
  selfemployed:     'self_employed',
  business:         'business',
  'business owner': 'business',
  unemployed:       'unemployed',
  other:            'other',
};

const PRODUCT_MAP = {
  personal_loan:         'personal_loan',
  'personal loan':       'personal_loan',
  personalloan:          'personal_loan',
  home_loan:             'home_loan',
  'home loan':           'home_loan',
  homeloan:              'home_loan',
  car_loan:              'car_loan',
  'car loan':            'car_loan',
  carloan:               'car_loan',
  business_loan:         'business_loan',
  'business loan':       'business_loan',
  businessloan:          'business_loan',
  loan_against_property: 'loan_against_property',
  'loan against property': 'loan_against_property',
  loanagainstproperty:   'loan_against_property',
  lap:                   'loan_against_property',
  education_loan:        'education_loan',
  'education loan':      'education_loan',
  educationloan:         'education_loan',
  gold_loan:             'gold_loan',
  'gold loan':           'gold_loan',
  goldloan:              'gold_loan',
  credit_card:           'credit_card',
  'credit card':         'credit_card',
  creditcard:            'credit_card',
  health_insurance:      'health_insurance',
  'health insurance':    'health_insurance',
  healthinsurance:       'health_insurance',
  life_insurance:        'life_insurance',
  'life insurance':      'life_insurance',
  lifeinsurance:         'life_insurance',
  motor_insurance:       'motor_insurance',
  'motor insurance':     'motor_insurance',
  motorinsurance:        'motor_insurance',
  travel_insurance:      'travel_insurance',
  'travel insurance':    'travel_insurance',
  travelinsurance:       'travel_insurance',
  mutual_fund:           'mutual_fund',
  'mutual fund':         'mutual_fund',
  mutualfund:            'mutual_fund',
  mf:                    'mutual_fund',
  sip:                   'sip',
  demat:                 'demat',
  'demat account':       'demat',
  general:               'general',
  'general enquiry':     'general',
  other:                 'other',
};

function normalizeEmployment(val) {
  if (!val) return '';
  const key = val.toString().trim().toLowerCase();
  return EMPLOYMENT_MAP[key] || '';
}

function normalizeProduct(val) {
  if (!val) return '';
  const key = val.toString().trim().toLowerCase();
  return PRODUCT_MAP[key] || 'other';
}

function sanitizeLeadFields(body) {
  const allowed = [
    // Core personal
    'name', 'dob', 'pan', 'aadhaar',
    'fatherName', 'motherName', 'maritalStatus', 'spouseName',
    'educationDetails', 'segment', 'location', 'tcName',
    // Contact
    'mobile', 'alternateMobile', 'email',
    // Current address
    'address', 'city', 'state', 'pincode',
    'currentAddressType', 'yearsAtCurrentAddress',
    // Permanent address
    'permanentAddress', 'paContactNumber',
    // Employment
    'employmentType', 'companyName', 'monthlySalary',
    'officeAddress', 'officeLandline', 'officialEmail',
    'yearsAtCurrentJob', 'totalJobExp', 'customEmploymentType',
    // Loan / credit
    'productType', 'loanAmountRequired',
    'existingBank', 'salaryAccountBank',
    'cibilScoreRange', 'existingLoans', 'existingEMI',
    // References
    'ref1Name', 'ref1Contact', 'ref1Address',
    'ref2Name', 'ref2Contact', 'ref2Address',
    // Disposition
    'callOutcome', 'callbackDate', 'notes', 'customCallOutcome',
    'status',
  ];
  const clean = {};
  allowed.forEach((k) => {
    if (body[k] !== undefined) clean[k] = body[k];
  });
  // Normalize enum fields to prevent Mongoose validation errors
  if (clean.employmentType !== undefined) clean.employmentType = normalizeEmployment(clean.employmentType);
  if (clean.productType    !== undefined) clean.productType    = normalizeProduct(clean.productType);
  return clean;
}

module.exports = router;

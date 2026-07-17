'use strict';
const express         = require('express');
const multer          = require('multer');
const crypto          = require('crypto');
const XLSX            = require('xlsx');
const DomImportedLead = require('../models/DomImportedLead');
const DomUser         = require('../models/DomUser');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

// In-memory storage — we parse the buffer and discard the raw file
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.mimetype === 'text/csv' ||
      /\.(xlsx|xls|csv)$/i.test(file.originalname);
    if (ok) cb(null, true);
    else cb(new Error('Only Excel (.xlsx, .xls) and CSV files are allowed.'));
  },
});

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalise a header string so we can do fuzzy matching */
const norm = (s) => String(s || '').toLowerCase().replace(/[\s_\-()./]/g, '');

/** Build { normalisedHeader → columnIndex } map from the first row of the sheet */
function buildHeaderMap(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, idx) => { map[norm(cell)] = idx; });
  return map;
}

/** Extract lead fields from a single row using the header map */
function mapRow(row, hm) {
  const get = (...keys) => {
    for (const k of keys) {
      const idx = hm[k];
      if (idx !== undefined && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
        return String(row[idx]).trim();
      }
    }
    return '';
  };
  return {
    // Core identifiers
    name:   get('customername', 'name', 'fullname', 'customer'),
    mobile: get('mobilenumber', 'mobile', 'mobileno', 'phone', 'phoneno', 'contact'),
    email:  get('email', 'emailid', 'emailaddress', 'emai', 'mail'),

    // Customer profile
    dateOfBirth:               get('dateofbirth', 'dob', 'birthdate'),
    age:                       get('age'),
    customerAadharNo:          get('customeraadharno', 'aadharno', 'aadharnumber', 'aadhar', 'adharnumber'),
    panNumber:                 get('pannumber', 'pan', 'panno'),
    customerPreferredLanguage: get('customerpreferredlanguage', 'preferredlanguage', 'language'),

    // Address
    residenceAddress:     get('residenceaddress', 'address', 'homeaddress'),
    residencePhoneNumber: get('residencephonenumber', 'residencephone', 'homephone'),
    officeAddress:        get('officeaddress'),
    officePhoneNumber:    get('officephonenumber', 'officephone'),
    zipCode:              get('zipcode', 'zip', 'pincode'),
    city:                 get('city', 'location'),
    state:                get('state'),

    // Loan / financial
    vintage:                get('vintage'),
    loanType:               get('loantype', 'loan'),
    productType:            get('producttype', 'product', 'service'),
    amountFinanced:         get('amountfinanced', 'financed'),
    totalOutstandingAmount: get('totaloutstandingamount', 'totaloutstanding', 'outstandingamount'),
    principalOutstanding:   get('principaloutstanding', 'principal'),
    noOfInstallmentOverdue: get('noofinstallmentoverdue', 'installmentoverdue', 'overdueinstallments'),
    expiryStatus:           get('expirystatus'),
    expiryDate:             get('expirydate'),
    disbursalAmount:        get('disbursalamount', 'disbursal'),
    sanctionDate:           get('sanctiondate'),
    countOfLiveLoans:       get('countofliveLOans', 'countliveloans', 'liveloans', 'countofliveloans'),
    bankName:               get('bankname', 'bank'),
    loanAmount:             get('loanamount', 'loanamountrequired', 'amount'),

    // Employment
    employment:       get('employementtype', 'employmenttype', 'employment', 'jobtype'),
    firmEmployeeName: get('firmemployeename', 'firmname', 'employeename', 'firm'),
    monthlyIncome:    get('monthlyincome', 'income', 'salary', 'monthlysalary'),

    // Asset / CIBIL
    cibilScore:          get('cibilscore', 'cibil', 'creditscore'),
    cibilScoreDate:      get('cibilscoredate', 'cibildate'),
    assetDescription:    get('assetdescription', 'asset'),
    make:                get('make'),
    propertyValueLatest: get('propertyvaluelatest', 'propertyvalue'),

    remarks: get('remarks', 'notes', 'comment', 'comments'),
  };
}

// ── POST /domestic-api/import-leads/upload ────────────────────────────────
// Super admin uploads an Excel / CSV file to create a new import batch
router.post(
  '/upload',
  protect,
  authorize('dom_superadmin'),
  (req, res, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `Upload error: ${err.message}` });
      }
      if (err) return res.status(400).json({ success: false, message: err.message });
      next();
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
      }

      const batchName =
        (req.body.batchName || '').trim() ||
        `Import ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`;

      const wb   = XLSX.read(req.file.buffer, { type: 'buffer' });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (rows.length < 2) {
        return res.status(400).json({
          success: false,
          message: 'File must have a header row and at least one data row.',
        });
      }

      const hm = buildHeaderMap(rows[0]);

      if (hm['customername'] === undefined && hm['name'] === undefined &&
          hm['mobilenumber'] === undefined && hm['mobile'] === undefined) {
        return res.status(400).json({
          success: false,
          message: `File must have at least a "Customer Name" or "Mobile Number" column. Found: ${rows[0].join(', ')}`,
        });
      }

      const batchId = crypto.randomUUID();
      const leads   = [];

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every((c) => c === '' || c === null || c === undefined)) continue;
        const fields = mapRow(row, hm);
        if (!fields.name && !fields.mobile) continue;
        leads.push({
          ...fields,
          importBatchId:   batchId,
          importBatchName: batchName,
          importedBy:      req.user._id,
          status:          'imported',
        });
      }

      if (leads.length === 0) {
        return res.status(400).json({ success: false, message: 'No valid data rows found in file.' });
      }

      await DomImportedLead.insertMany(leads, { ordered: false });

      return res.status(201).json({
        success:   true,
        batchId,
        batchName,
        count:     leads.length,
        message:   `Successfully imported ${leads.length} leads.`,
      });
    } catch (err) {
      console.error('[ImportLeads] Upload error:', err.message);
      return res.status(500).json({ success: false, message: 'Failed to import leads.' });
    }
  }
);

// ── GET /domestic-api/import-leads/batches ────────────────────────────────
// Super admin — list all import batches with summary counts
router.get('/batches', protect, authorize('dom_superadmin'), async (req, res) => {
  try {
    const batches = await DomImportedLead.aggregate([
      {
        $group: {
          _id:         '$importBatchId',
          batchName:   { $first: '$importBatchName' },
          importedBy:  { $first: '$importedBy' },
          createdAt:   { $first: '$createdAt' },
          total:       { $sum: 1 },
          sharedCount: { $sum: { $cond: [{ $gt: [{ $size: '$sharedWith' }, 0] }, 1, 0] } },
          assigned:    { $sum: { $cond: [{ $eq: ['$status', 'assigned'] }, 1, 0] } },
        },
      },
      { $sort: { createdAt: -1 } },
    ]);

    await DomUser.populate(batches, { path: 'importedBy', select: 'name email', model: 'DomUser' });

    return res.status(200).json({ success: true, data: batches });
  } catch (err) {
    console.error('[ImportLeads] Batches error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch batches.' });
  }
});

// ── GET /domestic-api/import-leads/pool-stats ─────────────────────────────
// Admin / SuperAdmin — count of available vs assigned leads in the pool
router.get('/pool-stats', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const baseFilter = role === 'dom_admin' ? { sharedWith: userId } : {};

    const [total, available, assigned, agentBreakdown] = await Promise.all([
      DomImportedLead.countDocuments({ ...baseFilter }),
      DomImportedLead.countDocuments({ ...baseFilter, status: 'shared', assignedTo: null }),
      DomImportedLead.countDocuments({ ...baseFilter, status: 'assigned' }),
      DomImportedLead.aggregate([
        { $match: { ...baseFilter, status: 'assigned', assignedTo: { $ne: null } } },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
      ]),
    ]);

    await DomUser.populate(agentBreakdown, { path: '_id', select: 'name email', model: 'DomUser' });

    return res.status(200).json({
      success: true,
      stats: { total, available, assigned },
      agentBreakdown: agentBreakdown.map((b) => ({ agent: b._id, count: b.count })),
    });
  } catch (err) {
    console.error('[ImportLeads] Pool stats error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch pool stats.' });
  }
});

// ── GET /domestic-api/import-leads ────────────────────────────────────────
// Super admin: all leads (optionally filtered by batchId/status)
// Admin:       only leads shared with them
// Agent:       only leads assigned to them
router.get('/', protect, async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    const filter = {};

    if (role === 'dom_superadmin') {
      if (req.query.batchId) filter.importBatchId = req.query.batchId;
      if (req.query.status)  filter.status = req.query.status;
    } else if (role === 'dom_admin') {
      filter.sharedWith = userId;
      if (req.query.status && ['shared', 'assigned'].includes(req.query.status)) {
        filter.status = req.query.status;
      }
      if (req.query.agentId) filter.assignedTo = req.query.agentId;
    } else {
      // domagent — only their assigned leads
      filter.assignedTo = userId;
      filter.status     = 'assigned';
    }

    const [data, total] = await Promise.all([
      DomImportedLead.find(filter)
        .populate('assignedTo', 'name email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      DomImportedLead.countDocuments(filter),
    ]);

    return res.status(200).json({
      success: true,
      data,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[ImportLeads] GET error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to fetch leads.' });
  }
});

// ── POST /domestic-api/import-leads/share ────────────────────────────────
// Super admin shares a full batch (or specific lead IDs) with admin(s)
// Body: { batchId, adminIds }  OR  { leadIds, adminIds }
router.post('/share', protect, authorize('dom_superadmin'), async (req, res) => {
  try {
    const { batchId, leadIds, adminIds } = req.body;

    if (!adminIds || !Array.isArray(adminIds) || adminIds.length === 0) {
      return res.status(400).json({ success: false, message: 'adminIds array is required.' });
    }

    const admins = await DomUser.find({
      _id:      { $in: adminIds },
      role:     'dom_admin',
      isActive: true,
    }).lean();

    if (admins.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid active admins found.' });
    }

    const validAdminIds = admins.map((a) => a._id);
    const filter        = {};

    if (batchId) {
      filter.importBatchId = batchId;
    } else if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      filter._id = { $in: leadIds };
    } else {
      return res.status(400).json({ success: false, message: 'batchId or leadIds is required.' });
    }

    const result = await DomImportedLead.updateMany(
      { ...filter, status: 'imported' },
      {
        $addToSet: { sharedWith: { $each: validAdminIds } },
        $set:      { status: 'shared', sharedAt: new Date(), sharedBy: req.user._id },
      }
    );

    // Also update already-shared leads to add the new admins (re-share to more admins)
    const result2 = await DomImportedLead.updateMany(
      { ...filter, status: { $in: ['shared', 'assigned'] } },
      { $addToSet: { sharedWith: { $each: validAdminIds } } }
    );

    return res.status(200).json({
      success: true,
      message: `Shared ${result.modifiedCount} new leads and updated ${result2.modifiedCount} existing leads with ${admins.length} admin(s).`,
      shared:  result.modifiedCount,
    });
  } catch (err) {
    console.error('[ImportLeads] Share error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to share leads.' });
  }
});

// ── POST /domestic-api/import-leads/assign ───────────────────────────────
// Admin assigns N leads from the shared pool to an agent
// Body: { agentId, count }  OR  { agentId, leadIds: [...] }
router.post('/assign', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const { agentId, count, leadIds } = req.body;
    const { role, _id: userId } = req.user;

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'agentId is required.' });
    }

    const agent = await DomUser.findOne({ _id: agentId, role: 'domagent', isActive: true }).lean();
    if (!agent) {
      return res.status(400).json({ success: false, message: 'Agent not found or is inactive.' });
    }

    let updateFilter;

    if (leadIds && Array.isArray(leadIds) && leadIds.length > 0) {
      updateFilter = {
        _id:    { $in: leadIds },
        status: 'shared',
        assignedTo: null,
      };
      if (role === 'dom_admin') updateFilter.sharedWith = userId;
    } else {
      const num = parseInt(count, 10);
      if (!num || num < 1 || num > 500) {
        return res.status(400).json({ success: false, message: 'count must be between 1 and 500.' });
      }

      const poolFilter = { status: 'shared', assignedTo: null };
      if (role === 'dom_admin') poolFilter.sharedWith = userId;

      const toAssign = await DomImportedLead.find(poolFilter)
        .sort({ createdAt: 1 }) // FIFO — oldest first
        .limit(num)
        .select('_id')
        .lean();

      if (toAssign.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No available leads in the shared pool to assign.',
        });
      }

      updateFilter = { _id: { $in: toAssign.map((l) => l._id) } };
    }

    const result = await DomImportedLead.updateMany(updateFilter, {
      $set: {
        assignedTo: agentId,
        assignedBy: userId,
        assignedAt: new Date(),
        status:     'assigned',
      },
    });

    return res.status(200).json({
      success: true,
      message: `Assigned ${result.modifiedCount} lead(s) to ${agent.name}.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error('[ImportLeads] Assign error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to assign leads.' });
  }
});

// ── PATCH /domestic-api/import-leads/:id/reassign ─────────────────────────
// Admin / SuperAdmin: reassign an already-assigned lead to a different agent.
// Works on any lead regardless of current assignedTo.
// Body: { agentId }
router.patch('/:id/reassign', protect, authorize('dom_admin', 'dom_superadmin'), async (req, res) => {
  try {
    const { agentId } = req.body;
    const { role, _id: userId } = req.user;

    if (!agentId) {
      return res.status(400).json({ success: false, message: 'agentId is required.' });
    }

    const newAgent = await DomUser.findOne({ _id: agentId, role: 'domagent', isActive: true }).lean();
    if (!newAgent) {
      return res.status(400).json({ success: false, message: 'Agent not found or is inactive.' });
    }

    // Admins can only reassign leads shared with them
    const filter = { _id: req.params.id };
    if (role === 'dom_admin') filter.sharedWith = userId;

    const lead = await DomImportedLead.findOne(filter).lean();
    if (!lead) {
      return res.status(404).json({ success: false, message: 'Lead not found or not accessible.' });
    }

    const previousAgent = lead.assignedTo;

    const updated = await DomImportedLead.findByIdAndUpdate(
      req.params.id,
      {
        assignedTo: agentId,
        assignedBy: userId,
        assignedAt: new Date(),
        status:     'assigned',
      },
      { new: true }
    )
      .populate('assignedTo', 'name email')
      .lean();

    // Emit socket so new agent's list refreshes
    const io = req.app.get('io');
    if (io) {
      io.to('domagents').emit('lead_assigned_to_you', {
        agentId:    agentId.toString(),
        leadName:   lead.name || lead.mobile,
        assignedBy: req.user.name,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Lead reassigned from ${previousAgent ? 'previous agent' : 'unassigned'} to ${newAgent.name}.`,
      data:    updated,
    });
  } catch (err) {
    console.error('[ImportLeads] Reassign error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to reassign lead.' });
  }
});

module.exports = router;

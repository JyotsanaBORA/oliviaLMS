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
  // Normalize keys before lookup so mixed-case or typo keys in the code never fail
  const get = (...keys) => {
    for (const k of keys) {
      const idx = hm[norm(k)]; // always normalize the lookup key
      if (idx !== undefined && row[idx] !== undefined && row[idx] !== null && row[idx] !== '') {
        return String(row[idx]).trim();
      }
    }
    return '';
  };

  return {
    // ── Core identifiers ──────────────────────────────────────────────────
    name:   get('customer name','customername','name','fullname','customer','client name','clientname','borrower name','borrowername'),
    mobile: get('mobile number','mobilenumber','mobile','mobile no','mobileno','phone number','phonenumber','phone','phone no','phoneno','contact number','contactnumber','contact','mob no','mobno','mob'),
    email:  get('e mail','email','email id','emailid','email address','emailaddress','e-mail','emai','mail'),

    // ── Customer profile ──────────────────────────────────────────────────
    dateOfBirth:              get('date of birth','dateofbirth','dob','birth date','birthdate','d.o.b','dob date'),
    age:                      get('age','customer age','customerage'),
    customerAadharNo:         get('customer aadhar no','customeraadharno','aadhar no','aadharno','aadhar number','aadharnumber','aadhar','adhar no','adharno','uid','uid number'),
    panNumber:                get('pan number','pannumber','pan no','panno','pan','pan card no','pancardno'),
    customerPreferredLanguage:get('customer preferred language','customerpreferredlanguage','preferred language','preferredlanguage','language'),

    // ── Address ───────────────────────────────────────────────────────────
    residenceAddress:    get('residence address','residenceaddress','res address','resaddress','home address','homeaddress','resi address','resiaddress','address','resi. address','res. address'),
    residencePhoneNumber:get('residence phone number','residencephonenumber','res phone number','resphone','residence phone','home phone','homephone','resi phone','resiphone','res ph no'),
    officeAddress:       get('office address','officeaddress','off address','offaddress','work address','workaddress','office add'),
    officePhoneNumber:   get('office phone number','officephonenumber','off phone number','officephone','office phone','work phone','workphone','off ph no'),
    zipCode:             get('zip code','zipcode','zip','pin code','pincode','pin','postal code','postalcode'),
    city:                get('city','location','district'),
    state:               get('state'),

    // ── Loan / financial ──────────────────────────────────────────────────
    vintage:                get('vintage','loan vintage','loanvintage','product vintage'),
    loanType:               get('loan type','loantype','loan','type of loan','typeofloan','product','product name','productname'),
    productType:            get('product type','producttype','product name','productname','service type','servicetype'),
    amountFinanced:         get('amount financed','amountfinanced','financed amount','financedamount','loan amt financed','financed','original amount','originalamount'),
    totalOutstandingAmount: get('total outstanding amount','totaloutstandingamount','total outstanding','totaloutstanding','outstanding amount','outstandingamount','total os','os amount','osamount','outstanding'),
    principalOutstanding:   get('principal outstanding','principaloutstanding','principal os','principalos','principal amount outstanding','principal balance'),
    noOfInstallmentOverdue: get('no of installment overdue','noofinstallmentoverdue','no. of installment overdue','installment overdue','installmentoverdue','overdue installments','overdueinstallments','emi overdue','emioverdue','dpd','no of emi overdue','no. of emi overdue','overdue emi'),
    expiryStatus:           get('expiry status','expirystatus','expiry','loan expiry status','product expiry status'),
    expiryDate:             get('expiry date','expirydate','expiry dt','expiry dt.','loan expiry date'),
    disbursalAmount:        get('disbursal amount','disbursalamount','disbursed amount','disbursedamount','disbursal amt','disbursed','loan disbursed','loan disbursal'),
    sanctionDate:           get('sanction date','sanctiondate','sanctioned date','sanctioneddate','loan sanction date','date of sanction','sanction dt'),
    countOfLiveLoans:       get('count of live loans','countofliveloans','live loans count','liveloanscount','live loan count','live loans','liveloans','no of live loans','active loans','activeloans'),
    bankName:               get('bank name','bankname','bank','lender name','lendername','financier','financier name'),
    loanAmount:             get('loan amount','loanamount','loan amt','loanamt','amount','sanctioned amount','sanctionedamount','loan amount required'),

    // ── Employment ────────────────────────────────────────────────────────
    employment:       get('employement type','employementtype','employment type','employmenttype','employment','emp type','emptype','job type','jobtype','occupation','occupation type'),
    firmEmployeeName: get('firm/ employee name','firmemployeename','firm employee name','firm name','firmname','employer name','employername','firm','employee name','employeename','company name','companyname','employer'),
    monthlyIncome:    get('monthly income','monthlyincome','income','salary','monthly salary','monthlysalary','net income','netincome','monthly salary income','income monthly'),

    // ── Asset / CIBIL ─────────────────────────────────────────────────────
    cibilScore:          get('cibil score','cibilscore','cibil','credit score','creditscore','cibil score value','bureau score','bureauscore'),
    cibilScoreDate:      get('cibil score date','cibilscoredate','cibil date','cibildate','credit score date','bureau date','bureaudate'),
    assetDescription:    get('asset description','assetdescription','asset','vehicle description','vehicledescription','asset desc','property description','propertydescription'),
    make:                get('make','vehicle make','vehiclemake','asset make','car make','carmake'),
    propertyValueLatest: get('property value (latest)','propertyvaluelatest','property value latest','property value','propertyvalue','latest property value','current property value'),

    remarks: get('remarks','remark','notes','note','comment','comments','observation','observations'),
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

      // Show which of the 32 mapped fields were found vs missing (for info only — never blocks upload)
      const MAPPED_FIELDS = {
        'Customer Name':            ['customername','name','fullname','customer'],
        'Mobile Number':            ['mobilenumber','mobile','mobileno','phone','phoneno'],
        'Email':                    ['email','emailid','emailaddress'],
        'Date of Birth':            ['dateofbirth','dob'],
        'Age':                      ['age'],
        'Aadhar No':                ['customeraadharno','aadharno'],
        'PAN':                      ['pannumber','pan'],
        'Language':                 ['customerpreferredlanguage','language'],
        'Residence Address':        ['residenceaddress','address'],
        'Residence Phone':          ['residencephonenumber','residencephone'],
        'Office Address':           ['officeaddress'],
        'Office Phone':             ['officephonenumber','officephone'],
        'Zip Code':                 ['zipcode','zip','pincode'],
        'City':                     ['city'],
        'State':                    ['state'],
        'Vintage':                  ['vintage'],
        'Loan Type':                ['loantype','loan'],
        'Product Type':             ['producttype','product'],
        'Amount Financed':          ['amountfinanced'],
        'Total Outstanding':        ['totaloutstandingamount','totaloutstanding'],
        'Principal Outstanding':    ['principaloutstanding','principal'],
        'EMI Overdue':              ['noofinstallmentoverdue','installmentoverdue'],
        'Expiry Status':            ['expirystatus'],
        'Expiry Date':              ['expirydate'],
        'Disbursal Amount':         ['disbursalamount'],
        'Sanction Date':            ['sanctiondate'],
        'Live Loans Count':         ['countofliveloans','liveloans'],
        'Bank Name':                ['bankname','bank'],
        'Employment Type':          ['employementtype','employmenttype','employment'],
        'Firm / Employee Name':     ['firmemployeename','firmname'],
        'CIBIL Score':              ['cibilscore','cibil'],
        'Remarks':                  ['remarks','notes'],
      };

      const foundFields   = [];
      const missingFields = [];
      for (const [label, keys] of Object.entries(MAPPED_FIELDS)) {
        // Use norm() when checking hm so it matches correctly
        const found = keys.some(k => hm[norm(k)] !== undefined);
        if (found) foundFields.push(label);
        else missingFields.push(label);
      }

      const batchId = crypto.randomUUID();
      const leads   = [];
      let skippedRows = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        // Skip rows where ALL cells are completely empty
        if (!row || row.every((c) => c === '' || c === null || c === undefined)) {
          skippedRows++;
          continue;
        }
        const fields = mapRow(row, hm);
        // Accept the row even if name/mobile are blank — just store whatever was found
        leads.push({
          ...fields,
          importBatchId:   batchId,
          importBatchName: batchName,
          importedBy:      req.user._id,
          status:          'imported',
        });
      }

      if (leads.length === 0) {
        return res.status(400).json({ success: false, message: 'No data rows found in file (all rows were empty).' });
      }

      await DomImportedLead.insertMany(leads, { ordered: false });

      return res.status(201).json({
        success:        true,
        batchId,
        batchName,
        count:          leads.length,
        skippedRows,
        foundFields,
        missingFields,
        message: `Successfully imported ${leads.length} lead${leads.length !== 1 ? 's' : ''}${skippedRows > 0 ? ` (${skippedRows} empty rows skipped)` : ''}.`,
        ...(missingFields.length > 0 && {
          warning: `${missingFields.length} field${missingFields.length !== 1 ? 's' : ''} not found in Excel (will be blank): ${missingFields.join(', ')}`,
        }),
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
    // For SA, both 'imported' and 'shared' with no assignedTo = available to assign
    const availableFilter = role === 'dom_admin'
      ? { ...baseFilter, status: 'shared', assignedTo: null }
      : { status: { $in: ['imported', 'shared'] }, assignedTo: null };

    const [total, available, assigned, agentBreakdown] = await Promise.all([
      DomImportedLead.countDocuments({ ...baseFilter }),
      DomImportedLead.countDocuments(availableFilter),
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
      if (req.query.status) {
        // 'shared' tab in UI means "unassigned" — for SA include both imported+shared unassigned
        if (req.query.status === 'shared') {
          filter.status    = { $in: ['imported', 'shared'] };
          filter.assignedTo = null;
        } else {
          filter.status = req.query.status;
        }
      }
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

    // Date range filter — parse as LOCAL date
    if (req.query.dateFrom || req.query.dateTo) {
      filter.createdAt = {};
      if (req.query.dateFrom) {
        const [y, m, d] = req.query.dateFrom.split('-').map(Number);
        filter.createdAt.$gte = new Date(y, m - 1, d, 0, 0, 0, 0);
      }
      if (req.query.dateTo) {
        const [y, m, d] = req.query.dateTo.split('-').map(Number);
        filter.createdAt.$lte = new Date(y, m - 1, d, 23, 59, 59, 999);
      }
    }

    // Search filter
    if (req.query.search) {
      const s = req.query.search.trim();
      if (s) {
        filter.$or = [
          { name:   { $regex: s, $options: 'i' } },
          { mobile: { $regex: s, $options: 'i' } },
          { loanType: { $regex: s, $options: 'i' } },
        ];
      }
    }

    const [data, total] = await Promise.all([
      DomImportedLead.find(filter)
        .populate('assignedTo', 'name email')
        // Populate the worked DomLead to expose documents + callOutcome for doc-status badges
        .populate('domLeadId', 'documents callOutcome status name')
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

// ── POST /domestic-api/import-leads/assign-batch ─────────────────────────
// Super Admin: directly assign all unassigned leads in a batch to an agent
router.post('/assign-batch', protect, authorize('dom_superadmin'), async (req, res) => {
  try {
    const { batchId, agentId } = req.body;
    if (!batchId || !agentId) {
      return res.status(400).json({ success: false, message: 'batchId and agentId are required.' });
    }
    const agent = await DomUser.findOne({ _id: agentId, role: 'domagent', isActive: true }).lean();
    if (!agent) return res.status(400).json({ success: false, message: 'Agent not found or inactive.' });

    const result = await DomImportedLead.updateMany(
      { importBatchId: batchId, assignedTo: null, status: { $in: ['imported', 'shared'] } },
      { $set: { assignedTo: agentId, assignedBy: req.user._id, assignedAt: new Date(), status: 'assigned' } }
    );

    if (result.modifiedCount === 0) {
      return res.status(400).json({ success: false, message: 'No unassigned leads found in this batch.' });
    }

    // Get batch name for the notification
    const sample = await DomImportedLead.findOne({ importBatchId: batchId }).lean();
    const batchName = sample?.importBatchName || batchId;

    // Notify the agent via socket — their dashboard will refresh immediately
    const io = req.app.get('io');
    if (io) {
      io.to('domagents').emit('pool_batch_assigned', {
        agentId,
        batchId,
        batchName,
        count: result.modifiedCount,
        message: `${result.modifiedCount} new lead(s) from batch "${batchName}" have been assigned to you.`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} lead(s) from batch assigned to ${agent.name}.`,
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error('[ImportLeads] Assign batch error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to assign batch.' });
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
      if (role === 'dom_admin') {
        updateFilter = { _id: { $in: leadIds }, status: 'shared', assignedTo: null, sharedWith: userId };
      } else {
        // SA can assign imported or shared leads directly
        updateFilter = { _id: { $in: leadIds }, status: { $in: ['imported', 'shared'] }, assignedTo: null };
      }
    } else {
      const num = parseInt(count, 10);
      if (!num || num < 1 || num > 500) {
        return res.status(400).json({ success: false, message: 'count must be between 1 and 500.' });
      }

      const poolFilter = role === 'dom_admin'
        ? { status: 'shared', assignedTo: null, sharedWith: userId }
        : { status: { $in: ['imported', 'shared'] }, assignedTo: null };

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

    if (result.modifiedCount === 0) {
      return res.status(400).json({
        success: false,
        message: 'No eligible leads found to assign. Leads may already be assigned or not in the pool.',
      });
    }

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

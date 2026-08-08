const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const XLSX = require('xlsx');
const DataVendorUpload = require('../models/DataVendorUpload');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Header normalisation map (mirrors adminUploads.js) ──────────
const HEADER_MAP = {
  'lead_id': 'lead_id',
  'entry_date': 'entry_date',
  'modify_date': 'modify_date',
  'status': 'status',
  'user': 'user',
  'vendor_lead_code': 'vendor_lead_code',
  'source_id': 'source_id',
  'list_id': 'list_id',
  'gmt_offset_now': 'gmt_offset_now',
  'called_since_last_reset': 'called_since_last_reset',
  'phone_code': 'phone_code',
  'phone_number': 'phone_number',
  'title': 'title',
  'first_name': 'first_name',
  'middle_initial': 'middle_initial',
  'last_name': 'last_name',
  'address1': 'address1',
  'address2': 'address2',
  'address3': 'address3',
  'city': 'city',
  'state': 'state',
  'province': 'province',
  'postal_code': 'postal_code',
  'country_code': 'country_code',
  'gender': 'gender',
  'date_of_birth': 'date_of_birth',
  'alt_phone': 'alt_phone',
  'email': 'email',
  'security_phrase': 'security_phrase',
  'comments': 'comments',
  'called_count': 'called_count',
  'last_local_call_time': 'last_local_call_time',
  'rank': 'rank',
  'owner': 'owner',
  'entry_id': 'entry_id',
  'entry': 'entry_id',
  'debt': 'debt',
  'ccount': 'ccount',
  'monthly_payment': 'monthly_payment',
  'monlypayment': 'monthly_payment',
  'monthlypayment': 'monthly_payment',
  'remark': 'remark',
  'custom1': 'custom1',
  'custom2': 'custom2',
  'custom3': 'custom3',
  'custom4': 'custom4',
  'custom5': 'custom5',
  'custom6': 'custom6',
  'enrolled_debt': 'enrolled_debt',
  'enrolleddebt': 'enrolled_debt',
  'enrolled debt': 'enrolled_debt',
  'enrolleddebtamount': 'enrolled_debt',
  'enrolled_debt_amount': 'enrolled_debt'
};

const DATE_FIELDS = new Set(['entry_date', 'modify_date', 'last_local_call_time']);

// ── Helpers (identical logic to adminUploads.js) ─────────────────

function formatExcelDate(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const dd  = String(value.getUTCDate()).padStart(2, '0');
    const mm  = String(value.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = value.getUTCFullYear();
    const hh  = String(value.getUTCHours()).padStart(2, '0');
    const min = String(value.getUTCMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  }
  const str = String(value).trim();
  if (/^\d{2}-\d{2}-\d{4}/.test(str)) return str;
  const num = Number(value);
  if (!isNaN(num) && num > 25569) {
    const totalDays = num - 25569;
    const wholeDays = Math.floor(totalDays);
    const fracMs    = Math.round((totalDays - wholeDays) * 86400000);
    const date      = new Date(wholeDays * 86400000 + fracMs);
    const dd  = String(date.getUTCDate()).padStart(2, '0');
    const mm  = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const hh  = String(date.getUTCHours()).padStart(2, '0');
    const min = String(date.getUTCMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  }
  return str;
}

function parseEntryDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, day, month, year, hour, minute, second = '0'] = m;
    return new Date(parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour), parseInt(minute), parseInt(second));
  }
  const iso = new Date(str);
  return isNaN(iso.getTime()) ? null : iso;
}

function normaliseHeader(raw) {
  const key = String(raw).trim().toLowerCase().replace(/[\s\-]+/g, '_');
  return HEADER_MAP[key] || null;
}

// ── Role guards ───────────────────────────────────────────────────

function requireAdminOrSuper(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  };
}

// Helper: build sharedWith match for data_vendor vs admin viewing
function buildVendorMatch(req) {
  if (req.user.role === 'data_vendor') {
    return { sharedWith: req.user._id };
  }
  if (req.query.vendorId) {
    return { sharedWith: new mongoose.Types.ObjectId(req.query.vendorId) };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/vendors
// List all data_vendor users (for admin share dropdown)
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/vendors', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const vendors = await User.find({ role: 'data_vendor', isActive: true })
      .select('name email organization')
      .populate('organization', 'name')
      .lean();
    res.json({ success: true, data: vendors });
  } catch (err) {
    console.error('Error fetching data vendors:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/vendors/:vendorId/lists
// Existing list names for a vendor (for upload modal dropdown)
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/vendors/:vendorId/lists', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const lists = await DataVendorUpload.distinct('listName', {
      sharedWith: new mongoose.Types.ObjectId(req.params.vendorId)
    });
    res.json({ success: true, data: lists.sort() });
  } catch (err) {
    console.error('Error fetching vendor lists:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/data-vendor-uploads/upload
// Upload a ViciDial CSV run for a data vendor
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.post(
  '/upload',
  express.json({ limit: '50mb' }),
  protect,
  requireAdminOrSuper,
  async (req, res) => {
    try {
      const { fileData, fileName, vendorId, listName, runDate, runLabel } = req.body;

      if (!fileData || !vendorId || !listName) {
        return res.status(400).json({
          success: false,
          message: 'fileData (base64), vendorId, and listName are required'
        });
      }

      const trimmedListName = listName.trim();
      if (!trimmedListName) {
        return res.status(400).json({ success: false, message: 'List name cannot be empty' });
      }

      // Validate vendor
      const targetVendor = await User.findById(vendorId);
      if (!targetVendor || targetVendor.role !== 'data_vendor') {
        return res.status(400).json({ success: false, message: 'Invalid data vendor user' });
      }

      // Auto-calculate run number: count existing runs for this vendor+list
      const existingBatches = await DataVendorUpload.distinct('runBatchId', {
        sharedWith: targetVendor._id,
        listName: trimmedListName
      });
      const runNumber = existingBatches.length + 1;

      const parsedRunDate = runDate ? new Date(runDate) : new Date();

      // Decode base64 → parse workbook
      const buffer = Buffer.from(fileData, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ success: false, message: 'Empty workbook' });
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'No data rows found in file' });
      }

      // Map raw CSV headers to model fields
      const rawHeaders = Object.keys(rows[0]);
      const columnMap = {};
      rawHeaders.forEach(h => {
        const field = normaliseHeader(h);
        if (field) columnMap[h] = field;
      });

      const batchId = `DVB_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

      const docs = rows.map(row => {
        const doc = {
          sharedWith:   targetVendor._id,
          uploadedBy:   req.user._id,
          organization: req.user.organization || null,
          listName:     trimmedListName,
          runBatchId:   batchId,
          runNumber,
          runDate:      parsedRunDate,
          runLabel:     (runLabel || '').trim()
        };

        for (const [rawH, modelField] of Object.entries(columnMap)) {
          const rawValue = row[rawH];
          doc[modelField] = DATE_FIELDS.has(modelField)
            ? formatExcelDate(rawValue)
            : String(rawValue ?? '').trim();
        }

        doc.entryDateParsed = parseEntryDate(doc.entry_date);
        return doc;
      });

      const inserted = await DataVendorUpload.insertMany(docs, { ordered: false });

      res.status(201).json({
        success: true,
        message: `Run #${runNumber} uploaded — ${inserted.length.toLocaleString()} records for list "${trimmedListName}"`,
        batchId,
        runNumber,
        count: inserted.length
      });
    } catch (err) {
      console.error('Data vendor upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/lists
// All lists for the current data_vendor with aggregate stats
// Dispositions are dynamic — whatever statuses exist in the data
// Access: data_vendor (own), admin/superadmin (by vendorId param)
// ─────────────────────────────────────────────────────────────────
router.get('/lists', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const match = buildVendorMatch(req);

    const lists = await DataVendorUpload.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$listName',
          totalLeads:  { $sum: 1 },
          runBatchIds: { $addToSet: '$runBatchId' },
          lastRunDate: { $max: '$runDate' },
          firstRunDate: { $min: '$runDate' }
        }
      },
      {
        $project: {
          _id: 0,
          listName:     '$_id',
          totalLeads:   1,
          totalRuns:    { $size: '$runBatchIds' },
          lastRunDate:  1,
          firstRunDate: 1
        }
      },
      { $sort: { listName: 1 } }
    ]);

    res.json({ success: true, data: lists });
  } catch (err) {
    console.error('Error fetching vendor lists:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/lists/:listName/runs
// All runs for a list with DYNAMIC per-run disposition counts
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/lists/:listName/runs', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const listName = decodeURIComponent(req.params.listName);
    const match = { listName, ...buildVendorMatch(req) };

    // Two-stage aggregation: status counts per run, then pivot into dispositions map
    const runs = await DataVendorUpload.aggregate([
      { $match: match },
      // Stage 1: count per (runBatchId, status)
      {
        $group: {
          _id: {
            runBatchId: '$runBatchId',
            status:     { $toUpper: { $ifNull: ['$status', 'UNKNOWN'] } }
          },
          count:     { $sum: 1 },
          runNumber: { $first: '$runNumber' },
          runDate:   { $first: '$runDate' },
          runLabel:  { $first: '$runLabel' }
        }
      },
      // Stage 2: collect all statuses into a map per runBatchId
      {
        $group: {
          _id:            '$_id.runBatchId',
          runNumber:      { $first: '$runNumber' },
          runDate:        { $first: '$runDate' },
          runLabel:       { $first: '$runLabel' },
          totalLeads:     { $sum: '$count' },
          dispositionArr: {
            $push: { k: '$_id.status', v: '$count' }
          }
        }
      },
      {
        $project: {
          _id: 0,
          runBatchId:   '$_id',
          runNumber:    1,
          runDate:      1,
          runLabel:     1,
          totalLeads:   1,
          dispositions: { $arrayToObject: '$dispositionArr' }
        }
      },
      { $sort: { runNumber: 1 } }
    ]);

    res.json({ success: true, data: runs, listName });
  } catch (err) {
    console.error('Error fetching runs:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/runs/:runBatchId
// Paginated records for a single run
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/runs/:runBatchId', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { runBatchId } = req.params;
    const { page = 1, limit = 100, statusFilter, search } = req.query;
    const pageNum  = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

    const query = { runBatchId };
    if (req.user.role === 'data_vendor') {
      query.sharedWith = req.user._id;
    }

    if (statusFilter) {
      query.status = { $regex: new RegExp(`^${statusFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') };
    }

    if (search) {
      const re = { $regex: search, $options: 'i' };
      query.$or = [
        { lead_id: re }, { phone_number: re }, { first_name: re },
        { last_name: re }, { email: re }, { status: re }, { comments: re }
      ];
    }

    const [records, total] = await Promise.all([
      DataVendorUpload.find(query)
        .select('-__v -entryDateParsed -sharedWith -uploadedBy -organization')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      DataVendorUpload.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: records,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('Error fetching run records:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/runs/:runBatchId/stats
// Dynamic disposition stats for a single run
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/runs/:runBatchId/stats', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { runBatchId } = req.params;
    const query = { runBatchId };
    if (req.user.role === 'data_vendor') query.sharedWith = req.user._id;

    const [result] = await DataVendorUpload.aggregate([
      { $match: query },
      {
        $group: {
          _id: { $toUpper: { $ifNull: ['$status', 'UNKNOWN'] } },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: '$count' },
          dispositionArr: { $push: { k: '$_id', v: '$count' } }
        }
      },
      {
        $project: {
          _id: 0,
          totalLeads:   1,
          dispositions: { $arrayToObject: '$dispositionArr' }
        }
      }
    ]);

    res.json({
      success: true,
      data: result || { totalLeads: 0, dispositions: {} }
    });
  } catch (err) {
    console.error('Error fetching run stats:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/runs/:runBatchId/export
// Download a single run as CSV
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/runs/:runBatchId/export', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { runBatchId } = req.params;
    const query = { runBatchId };
    if (req.user.role === 'data_vendor') query.sharedWith = req.user._id;

    const records = await DataVendorUpload.find(query)
      .select('-__v -_id -entryDateParsed -sharedWith -uploadedBy -organization')
      .lean();

    if (!records.length) {
      return res.status(404).json({ success: false, message: 'No records found for this run' });
    }

    const CSV_FIELDS = [
      'lead_id','entry_date','modify_date','status','user','vendor_lead_code',
      'source_id','list_id','gmt_offset_now','called_since_last_reset',
      'phone_code','phone_number','title','first_name','middle_initial',
      'last_name','address1','address2','address3','city','state','province',
      'postal_code','country_code','gender','date_of_birth','alt_phone',
      'email','security_phrase','comments','called_count','last_local_call_time',
      'rank','owner','entry_id','debt','ccount','monthly_payment','remark',
      'custom1','custom2','custom3','custom4','custom5','custom6','enrolled_debt'
    ];

    const escape = v => {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const first = records[0];
    const safeList = (first.listName || 'run').replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeList}_run${first.runNumber}_${new Date().toISOString().slice(0, 10)}.csv`;

    const header = CSV_FIELDS.join(',');
    const rows = records.map(r => CSV_FIELDS.map(f => escape(r[f])).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('Export run error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/lists/:listName/export
// Download all runs of a list as CSV (with run metadata columns)
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/lists/:listName/export', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const listName = decodeURIComponent(req.params.listName);
    const query = { listName, ...buildVendorMatch(req) };

    const records = await DataVendorUpload.find(query)
      .select('-__v -_id -entryDateParsed -sharedWith -uploadedBy -organization')
      .sort({ runNumber: 1 })
      .lean();

    if (!records.length) {
      return res.status(404).json({ success: false, message: 'No records found for this list' });
    }

    const CSV_FIELDS = [
      'runNumber','runDate','runLabel',
      'lead_id','entry_date','modify_date','status','user','vendor_lead_code',
      'source_id','list_id','called_since_last_reset','phone_code','phone_number',
      'title','first_name','middle_initial','last_name','city','state','country_code',
      'date_of_birth','alt_phone','email','comments','called_count',
      'last_local_call_time','debt','monthly_payment','remark',
      'custom1','custom2','custom3','custom4','custom5','custom6','enrolled_debt'
    ];

    const escape = v => {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const safeList = listName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `${safeList}_all_runs_${new Date().toISOString().slice(0, 10)}.csv`;

    const header = CSV_FIELDS.join(',');
    const rows = records.map(r => CSV_FIELDS.map(f => {
      if (f === 'runDate') return escape(r[f] ? new Date(r[f]).toISOString().slice(0, 10) : '');
      return escape(r[f]);
    }).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('Export list error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/export
// Download ALL data for vendor (all lists, all runs)
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/export', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const query = buildVendorMatch(req);

    const records = await DataVendorUpload.find(query)
      .select('-__v -_id -entryDateParsed -sharedWith -uploadedBy -organization')
      .sort({ listName: 1, runNumber: 1 })
      .lean();

    if (!records.length) {
      return res.status(404).json({ success: false, message: 'No records found' });
    }

    const CSV_FIELDS = [
      'listName','runNumber','runDate','runLabel',
      'lead_id','entry_date','modify_date','status','user','vendor_lead_code',
      'source_id','list_id','called_since_last_reset','phone_code','phone_number',
      'first_name','last_name','email','comments','called_count',
      'last_local_call_time','debt','monthly_payment','remark',
      'custom1','custom2','custom3','custom4','custom5','custom6','enrolled_debt'
    ];

    const escape = v => {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const header = CSV_FIELDS.join(',');
    const rows = records.map(r => CSV_FIELDS.map(f => {
      if (f === 'runDate') return escape(r[f] ? new Date(r[f]).toISOString().slice(0, 10) : '');
      return escape(r[f]);
    }).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="vendor_all_data_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('Export all error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// POST /api/data-vendor-uploads/manual-sale
// Manually create a single SALE record for a data vendor
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.post('/manual-sale', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const {
      vendorId,
      listName,
      runDate,
      runLabel,
      first_name,
      last_name,
      phone_number,
      email,
      debt,
      enrolled_debt,
      entry_date,
      paymentStatus,
      paymentType,
      draftDate1,
      draftDate2
    } = req.body;

    if (!vendorId) return res.status(400).json({ success: false, message: 'Data vendor is required' });
    if (!listName || !listName.trim()) return res.status(400).json({ success: false, message: 'List name is required' });
    if (!first_name || !first_name.trim()) return res.status(400).json({ success: false, message: 'First name is required' });
    if (!phone_number || !phone_number.trim()) return res.status(400).json({ success: false, message: 'Phone number is required' });
    if (!enrolled_debt) return res.status(400).json({ success: false, message: 'Enrolled debt is required' });

    const targetVendor = await User.findById(vendorId);
    if (!targetVendor || targetVendor.role !== 'data_vendor') {
      return res.status(400).json({ success: false, message: 'Invalid data vendor user' });
    }

    const trimmedListName = listName.trim();

    // Auto-calculate run number
    const existingBatches = await DataVendorUpload.distinct('runBatchId', {
      sharedWith: targetVendor._id,
      listName: trimmedListName
    });
    const runNumber = existingBatches.length + 1;

    const parsedRunDate = runDate ? new Date(runDate) : new Date();
    const batchId = `MANUAL_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const entryDateStr = entry_date
      ? new Date(entry_date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
      : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');

    const doc = {
      status:       'SALE',
      first_name:   (first_name || '').trim(),
      last_name:    (last_name || '').trim(),
      phone_number: (phone_number || '').trim(),
      email:        (email || '').trim(),
      debt:         String(debt || ''),
      enrolled_debt: String(enrolled_debt || ''),
      entry_date:   entryDateStr,
      entryDateParsed: entry_date ? new Date(entry_date) : new Date(),
      listName:     trimmedListName,
      runBatchId:   batchId,
      runNumber,
      runDate:      parsedRunDate,
      runLabel:     (runLabel || '').trim(),
      sharedWith:   targetVendor._id,
      uploadedBy:   req.user._id,
      organization: req.user.organization || null
    };

    if (paymentStatus) {
      doc.paymentStatus = paymentStatus;
      doc.paymentStatusUpdatedBy = req.user._id;
      doc.paymentStatusUpdatedAt = new Date();
    }
    if (paymentType) doc.paymentType = paymentType;
    if (draftDate1) doc.draftDate1 = new Date(draftDate1);
    if (draftDate2) doc.draftDate2 = new Date(draftDate2);

    const record = await DataVendorUpload.create(doc);

    res.status(201).json({
      success: true,
      message: `Manual sale created for "${first_name} ${last_name || ''}".`,
      data: record
    });
  } catch (err) {
    console.error('Manual sale creation error:', err);
    res.status(500).json({ success: false, message: err.message || 'Failed to create manual sale' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/sales-stats
// Enrolled-debt / SALE disposition stats with optional date range
// Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/sales-stats', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const match = buildVendorMatch(req);

    // Only SALE records (case-insensitive)
    match.status = { $regex: /^SALE$/i };

    // Optional date-range on entryDateParsed
    if (req.query.startDate || req.query.endDate) {
      const dateFilter = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        if (isNaN(start.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid startDate' });
        }
        dateFilter.$gte = start;
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        if (isNaN(end.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid endDate' });
        }
        // Include all records through the end of that day
        end.setDate(end.getDate() + 1);
        dateFilter.$lt = end;
      }
      match.entryDateParsed = dateFilter;
    }

    // Aggregation helper: safely convert enrolled_debt string → number.
    // Uses $toDouble which is available in MongoDB 4.0+.
    // Empty strings / non-numeric values yield 0 via the $ifNull + $cond guard.
    const toDebt = {
      $cond: {
        if: {
          $and: [
            { $ne: [{ $ifNull: ['$enrolled_debt', ''] }, ''] },
            { $ne: ['$enrolled_debt', null] }
          ]
        },
        then: {
          $convert: {
            input: '$enrolled_debt',
            to: 'double',
            onError: 0,
            onNull: 0
          }
        },
        else: 0
      }
    };

    // Summary stats
    const [summary] = await DataVendorUpload.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSales: { $sum: 1 },
          totalEnrolledDebt: { $sum: toDebt }
        }
      },
      {
        $project: {
          _id: 0,
          totalSales: 1,
          totalEnrolledDebt: { $round: ['$totalEnrolledDebt', 2] },
          avgEnrolledDebt: {
            $cond: [
              { $eq: ['$totalSales', 0] }, 0,
              { $round: [{ $divide: ['$totalEnrolledDebt', '$totalSales'] }, 2] }
            ]
          }
        }
      }
    ]);

    // Daily breakdown — only records with a valid entryDateParsed
    const dailyBaseMatch = { ...match };
    if (dailyBaseMatch.entryDateParsed) {
      // Already filtered — just ensure not-null
      dailyBaseMatch.entryDateParsed = { ...dailyBaseMatch.entryDateParsed, $ne: null };
    } else {
      dailyBaseMatch.entryDateParsed = { $ne: null };
    }

    const daily = await DataVendorUpload.aggregate([
      { $match: dailyBaseMatch },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$entryDateParsed' } },
          sales: { $sum: 1 },
          enrolledDebt: { $sum: toDebt }
        }
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          date: '$_id',
          sales: 1,
          enrolledDebt: { $round: ['$enrolledDebt', 2] }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        ...(summary || { totalSales: 0, totalEnrolledDebt: 0, avgEnrolledDebt: 0 }),
        dailyBreakdown: daily
      }
    });
  } catch (err) {
    console.error('Sales stats error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/sales-export
// Download ALL SALE records (optional date range) as CSV
// Query params: startDate, endDate (YYYY-MM-DD, optional)
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/sales-export', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const match = buildVendorMatch(req);
    match.status = { $regex: /^SALE$/i };

    if (req.query.startDate || req.query.endDate) {
      const dateFilter = {};
      if (req.query.startDate) {
        const start = new Date(req.query.startDate);
        if (!isNaN(start.getTime())) dateFilter.$gte = start;
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        if (!isNaN(end.getTime())) {
          end.setDate(end.getDate() + 1);
          dateFilter.$lt = end;
        }
      }
      if (Object.keys(dateFilter).length) match.entryDateParsed = dateFilter;
    }

    const CSV_FIELDS = [
      'lead_id','entry_date','modify_date','status','user','vendor_lead_code',
      'source_id','list_id','gmt_offset_now','called_since_last_reset',
      'phone_code','phone_number','title','first_name','middle_initial',
      'last_name','address1','address2','address3','city','state','province',
      'postal_code','country_code','gender','date_of_birth','alt_phone',
      'email','security_phrase','comments','called_count','last_local_call_time',
      'rank','owner','entry_id','debt','ccount','monthly_payment','remark',
      'custom1','custom2','custom3','custom4','custom5','custom6','enrolled_debt',
      'listName','runNumber','runLabel'
    ];

    const records = await DataVendorUpload.find(match)
      .select(CSV_FIELDS.join(' ') + ' -_id')
      .sort({ listName: 1, runNumber: 1, entryDateParsed: 1 })
      .lean();

    if (!records.length) {
      return res.status(404).json({ success: false, message: 'No SALE records found' });
    }

    const escape = v => {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const suffix = req.query.startDate || req.query.endDate
      ? `_${req.query.startDate || 'start'}_to_${req.query.endDate || 'end'}`
      : `_all_${new Date().toISOString().slice(0, 10)}`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="sales${suffix}.csv"`);
    const header = CSV_FIELDS.join(',');
    const rows = records.map(r => CSV_FIELDS.map(f => escape(r[f])).join(','));
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('Sales export error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/sales-records-day
// Return individual SALE records for a specific date as JSON
// Query param: date (YYYY-MM-DD, required)
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/sales-records-day', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date param required (YYYY-MM-DD)' });
    }

    const match = buildVendorMatch(req);
    match.status = { $regex: /^SALE$/i };

    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd   = new Date(date + 'T00:00:00.000Z');
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    match.entryDateParsed = { $gte: dayStart, $lt: dayEnd };

    const records = await DataVendorUpload.find(match)
      .select('first_name last_name phone_code phone_number debt enrolled_debt listName runNumber runLabel entry_date paymentStatus')
      .sort({ listName: 1, runNumber: 1, first_name: 1 })
      .lean();

    res.json({ success: true, data: records });
  } catch (err) {
    console.error('Sales records day error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/sales-export-day
// Download all SALE records for a specific date as CSV
// Query param: date (YYYY-MM-DD, required)
// Access: data_vendor (own), admin/superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/sales-export-day', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { date } = req.query;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, message: 'date param required (YYYY-MM-DD)' });
    }

    const match = buildVendorMatch(req);
    match.status = { $regex: /^SALE$/i };

    // Use UTC day boundaries — consistent with the $dateToString grouping in sales-stats
    const dayStart = new Date(date + 'T00:00:00.000Z');
    const dayEnd   = new Date(date + 'T00:00:00.000Z');
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
    match.entryDateParsed = { $gte: dayStart, $lt: dayEnd };

    const CSV_FIELDS = [
      'lead_id','entry_date','modify_date','status','user','vendor_lead_code',
      'source_id','list_id','gmt_offset_now','called_since_last_reset',
      'phone_code','phone_number','title','first_name','middle_initial',
      'last_name','address1','address2','address3','city','state','province',
      'postal_code','country_code','gender','date_of_birth','alt_phone',
      'email','security_phrase','comments','called_count','last_local_call_time',
      'rank','owner','entry_id','debt','ccount','monthly_payment','remark',
      'custom1','custom2','custom3','custom4','custom5','custom6','enrolled_debt',
      'listName','runNumber','runLabel'
    ];

    const records = await DataVendorUpload.find(match)
      .select(CSV_FIELDS.join(' ') + ' -_id')
      .sort({ listName: 1, runNumber: 1 })
      .lean();

    if (!records.length) {
      return res.status(404).json({ success: false, message: `No SALE records found for ${date}` });
    }

    const escape = v => {
      const s = String(v ?? '');
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const filename = `sales_${date}.csv`;
    const header = CSV_FIELDS.join(',');
    const rows = records.map(r => CSV_FIELDS.map(f => escape(r[f])).join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send([header, ...rows].join('\n'));
  } catch (err) {
    console.error('Sales export day error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PUT /api/data-vendor-uploads/runs/:runBatchId/replace
// Replace ALL data in an existing run with a new CSV upload.
// Preserves runBatchId, runNumber, listName, sharedWith.
// Optionally updates runDate and runLabel.
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.put(
  '/runs/:runBatchId/replace',
  express.json({ limit: '50mb' }),
  protect,
  requireAdminOrSuper,
  async (req, res) => {
    try {
      const { runBatchId } = req.params;
      const { fileData, runDate, runLabel } = req.body;

      if (!fileData) {
        return res.status(400).json({ success: false, message: 'fileData (base64) is required' });
      }

      // Find the existing run to get its identity metadata
      const existingDoc = await DataVendorUpload.findOne({ runBatchId }).lean();
      if (!existingDoc) {
        return res.status(404).json({ success: false, message: 'Run not found' });
      }

      const { listName, runNumber, sharedWith } = existingDoc;

      // Decode base64 → parse workbook
      const buffer = Buffer.from(fileData, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ success: false, message: 'Empty workbook' });
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'No data rows found in file' });
      }

      // Map raw CSV headers to model fields
      const rawHeaders = Object.keys(rows[0]);
      const columnMap = {};
      rawHeaders.forEach(h => {
        const field = normaliseHeader(h);
        if (field) columnMap[h] = field;
      });

      const parsedRunDate = runDate ? new Date(runDate) : existingDoc.runDate;
      const resolvedRunLabel = (runLabel !== undefined && runLabel !== null)
        ? String(runLabel).trim()
        : (existingDoc.runLabel || '');

      const docs = rows.map(row => {
        const doc = {
          sharedWith,
          uploadedBy:   req.user._id,
          organization: req.user.organization || null,
          listName,
          runBatchId,
          runNumber,
          runDate:      parsedRunDate,
          runLabel:     resolvedRunLabel
        };

        for (const [rawH, modelField] of Object.entries(columnMap)) {
          const rawValue = row[rawH];
          doc[modelField] = DATE_FIELDS.has(modelField)
            ? formatExcelDate(rawValue)
            : String(rawValue ?? '').trim();
        }

        doc.entryDateParsed = parseEntryDate(doc.entry_date);
        return doc;
      });

      // Delete old records, then insert new ones
      await DataVendorUpload.deleteMany({ runBatchId });
      const inserted = await DataVendorUpload.insertMany(docs, { ordered: false });

      res.json({
        success: true,
        message: `Run #${runNumber} replaced — ${inserted.length.toLocaleString()} records for list "${listName}"`,
        runBatchId,
        runNumber,
        count: inserted.length
      });
    } catch (err) {
      console.error('Data vendor replace run error:', err);
      res.status(500).json({ success: false, message: err.message || 'Replace failed' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// DELETE /api/data-vendor-uploads/runs/:runBatchId
// Delete an entire run (admin/superadmin only)
// ─────────────────────────────────────────────────────────────────
router.delete('/runs/:runBatchId', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const result = await DataVendorUpload.deleteMany({ runBatchId: req.params.runBatchId });
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} records`,
      deleted: result.deletedCount
    });
  } catch (err) {
    console.error('Delete run error:', err);
    res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/payment-status/sales
// List SALE records for the Payment Status page (main org admin)
// Query: vendorId, search, startDate, endDate, page, limit
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/payment-status/sales', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const { vendorId, search, startDate, endDate, paymentStatusFilter, page = 1, limit = 50 } = req.query;

    const match = { status: { $regex: /^SALE$/i } };

    if (paymentStatusFilter !== undefined && paymentStatusFilter !== '') {
      if (paymentStatusFilter === 'not_set') {
        match.$and = [{ $or: [{ paymentStatus: '' }, { paymentStatus: { $exists: false } }] }];
      } else {
        match.paymentStatus = paymentStatusFilter;
      }
    }

    if (vendorId) {
      if (!mongoose.Types.ObjectId.isValid(vendorId)) {
        return res.status(400).json({ success: false, message: 'Invalid vendorId' });
      }
      match.sharedWith = new mongoose.Types.ObjectId(vendorId);
    }

    if (startDate || endDate) {
      match.entryDateParsed = {};
      if (startDate) match.entryDateParsed.$gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate)   match.entryDateParsed.$lte = new Date(endDate   + 'T23:59:59.999Z');
    }

    if (search && search.trim()) {
      const s = search.trim();
      match.$or = [
        { first_name:    { $regex: s, $options: 'i' } },
        { last_name:     { $regex: s, $options: 'i' } },
        { phone_number:  { $regex: s, $options: 'i' } },
        { email:         { $regex: s, $options: 'i' } },
        { listName:      { $regex: s, $options: 'i' } },
        { paymentStatus: { $regex: s, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Helper: safely convert enrolled_debt (string or number) → numeric value
    const toDebtExpr = {
      $cond: {
        if: {
          $and: [
            { $ne: [{ $ifNull: ['$enrolled_debt', ''] }, ''] },
            { $ne: ['$enrolled_debt', null] }
          ]
        },
        then: {
          $convert: { input: '$enrolled_debt', to: 'double', onError: 0, onNull: 0 }
        },
        else: 0
      }
    };

    const [total, records, revenueAgg] = await Promise.all([
      DataVendorUpload.countDocuments(match),
      DataVendorUpload.find(match)
        .select('first_name last_name phone_code phone_number email debt enrolled_debt listName runNumber runLabel entryDateParsed paymentStatus paymentType draftDate1 draftDate2 paymentStatusUpdatedAt sharedWith')
        .populate('sharedWith', 'name email')
        .sort({ entryDateParsed: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DataVendorUpload.aggregate([
        { $match: match },
        { $group: { _id: null, totalEnrolledDebt: { $sum: toDebtExpr } } },
        { $project: { _id: 0, totalEnrolledDebt: { $round: ['$totalEnrolledDebt', 2] } } }
      ])
    ]);

    const totalEnrolledDebt = revenueAgg[0]?.totalEnrolledDebt || 0;
    const totalRevenue = Math.round(totalEnrolledDebt * 0.025 * 100) / 100;

    res.json({ success: true, data: records, total, page: parseInt(page), limit: parseInt(limit), totalEnrolledDebt, totalRevenue });
  } catch (err) {
    console.error('Payment status sales fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/payment-status/vendor-sales
// List SALE records for data vendor's own Payment Status view (read-only).
// Data vendors are automatically filtered to records shared with them.
// Access: data_vendor, admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/payment-status/vendor-sales', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { search, startDate, endDate, paymentStatusFilter, page = 1, limit = 50 } = req.query;

    const match = { status: { $regex: /^SALE$/i }, ...buildVendorMatch(req) };

    if (paymentStatusFilter !== undefined && paymentStatusFilter !== '') {
      if (paymentStatusFilter === 'not_set') {
        match.$and = [{ $or: [{ paymentStatus: '' }, { paymentStatus: { $exists: false } }] }];
      } else {
        match.paymentStatus = paymentStatusFilter;
      }
    }

    if (startDate || endDate) {
      const dateCondition = {};
      if (startDate) dateCondition.$gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate)   dateCondition.$lte = new Date(endDate   + 'T23:59:59.999Z');
      const draftDateFilter = { $or: [{ draftDate1: dateCondition }, { draftDate2: dateCondition }] };
      if (match.$and) {
        match.$and.push(draftDateFilter);
      } else {
        match.$and = [draftDateFilter];
      }
    }

    if (search && search.trim()) {
      const s = search.trim();
      match.$or = [
        { first_name:    { $regex: s, $options: 'i' } },
        { last_name:     { $regex: s, $options: 'i' } },
        { phone_number:  { $regex: s, $options: 'i' } },
        { email:         { $regex: s, $options: 'i' } },
        { listName:      { $regex: s, $options: 'i' } },
        { paymentStatus: { $regex: s, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const toDebtExpr = {
      $cond: {
        if: { $and: [{ $ne: [{ $ifNull: ['$enrolled_debt', ''] }, ''] }, { $ne: ['$enrolled_debt', null] }] },
        then: { $convert: { input: '$enrolled_debt', to: 'double', onError: 0, onNull: 0 } },
        else: 0
      }
    };

    const [total, records, statusBreakdownAgg] = await Promise.all([
      DataVendorUpload.countDocuments(match),
      DataVendorUpload.find(match)
        .select('first_name last_name phone_code phone_number email debt enrolled_debt listName runNumber runLabel entryDateParsed paymentStatus paymentType draftDate1 draftDate2 paymentStatusUpdatedAt')
        .sort({ entryDateParsed: 1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      DataVendorUpload.aggregate([
        { $match: match },
        { $group: {
          _id: { $ifNull: ['$paymentStatus', ''] },
          count: { $sum: 1 },
          enrolledDebt: { $sum: toDebtExpr }
        }},
        { $project: {
          _id: 0,
          status: '$_id',
          count: 1,
          enrolledDebt: { $round: ['$enrolledDebt', 2] },
          revenue: { $round: [{ $multiply: ['$enrolledDebt', 0.025] }, 2] }
        }}
      ])
    ]);

    const totalEnrolledDebt = Math.round(statusBreakdownAgg.reduce((s, g) => s + g.enrolledDebt, 0) * 100) / 100;
    const statusBreakdown = {};
    for (const g of statusBreakdownAgg) {
      statusBreakdown[g.status || ''] = { count: g.count, revenue: g.revenue, enrolledDebt: g.enrolledDebt };
    }

    res.json({ success: true, data: records, total, page: parseInt(page), limit: parseInt(limit), totalEnrolledDebt, statusBreakdown });
  } catch (err) {
    console.error('Vendor payment status sales fetch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// GET /api/data-vendor-uploads/payment-status/vendor-sales-export
// CSV export of data vendor's SALE records with payment status
// Access: data_vendor, admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/payment-status/vendor-sales-export', protect, requireRoles('data_vendor', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { search, startDate, endDate, paymentStatusFilter } = req.query;

    const match = { status: { $regex: /^SALE$/i }, ...buildVendorMatch(req) };

    if (paymentStatusFilter && paymentStatusFilter !== '') {
      if (paymentStatusFilter === 'not_set') {
        match.$and = [{ $or: [{ paymentStatus: '' }, { paymentStatus: { $exists: false } }] }];
      } else {
        match.paymentStatus = paymentStatusFilter;
      }
    }

    if (startDate || endDate) {
      const dateCondition = {};
      if (startDate) dateCondition.$gte = new Date(startDate + 'T00:00:00.000Z');
      if (endDate)   dateCondition.$lte = new Date(endDate   + 'T23:59:59.999Z');
      const draftDateFilter = { $or: [{ draftDate1: dateCondition }, { draftDate2: dateCondition }] };
      if (match.$and) {
        match.$and.push(draftDateFilter);
      } else {
        match.$and = [draftDateFilter];
      }
    }

    if (search && search.trim()) {
      const s = search.trim();
      match.$or = [
        { first_name:    { $regex: s, $options: 'i' } },
        { last_name:     { $regex: s, $options: 'i' } },
        { phone_number:  { $regex: s, $options: 'i' } },
        { email:         { $regex: s, $options: 'i' } },
        { listName:      { $regex: s, $options: 'i' } },
        { paymentStatus: { $regex: s, $options: 'i' } },
      ];
    }

    const records = await DataVendorUpload.find(match)
      .select('first_name last_name phone_code phone_number email debt enrolled_debt listName runNumber runLabel entryDateParsed paymentStatus paymentStatusUpdatedAt')
      .sort({ entryDateParsed: 1 })
      .lean();

    if (records.length === 0) {
      return res.status(404).json({ success: false, message: 'No records found' });
    }

    const headers = ['First Name','Last Name','Phone','Email','Enrolled Debt','Revenue','List','Run','Enrollment Date','Payment Status','Status Updated'];
    const rows = records.map(r => {
      const enrolledDebt = parseFloat(r.enrolled_debt) || 0;
      const revenue = (enrolledDebt * 0.025).toFixed(2);
      const phone = [r.phone_code && r.phone_code !== '1' ? `+${r.phone_code}` : '', r.phone_number].filter(Boolean).join(' ');
      const runLabel = `Run #${r.runNumber}${r.runLabel ? ` · ${r.runLabel}` : ''}`;
      const enrollDate = r.entryDateParsed ? new Date(r.entryDateParsed).toISOString().slice(0, 10) : '';
      const statusUpdated = r.paymentStatusUpdatedAt ? new Date(r.paymentStatusUpdatedAt).toISOString().slice(0, 10) : '';
      return [r.first_name||'', r.last_name||'', phone, r.email||'', enrolledDebt||'', revenue, r.listName||'', runLabel, enrollDate, r.paymentStatus||'', statusUpdated]
        .map(v => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="payment_status_${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send(csv);
  } catch (err) {
    console.error('Vendor payment status export error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// PATCH /api/data-vendor-uploads/:id/payment-status
// Update paymentStatus for a single SALE record
// Access: admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.patch('/:id/payment-status', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const { paymentStatus, paymentType, draftDate1, draftDate2 } = req.body;

    const allowedStatus = ['', 'Cleared', 'Pending', 'NSF', 'Cancellation', 'Refunded'];
    if (paymentStatus !== undefined && !allowedStatus.includes(paymentStatus)) {
      return res.status(400).json({ success: false, message: 'Invalid paymentStatus value' });
    }

    const allowedType = ['', 'Monthly', 'Semi Monthly'];
    if (paymentType !== undefined && !allowedType.includes(paymentType)) {
      return res.status(400).json({ success: false, message: 'Invalid paymentType value' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid record ID' });
    }

    const updateFields = {
      paymentStatusUpdatedBy: req.user._id,
      paymentStatusUpdatedAt: new Date()
    };
    if (paymentStatus !== undefined) updateFields.paymentStatus = paymentStatus;
    if (paymentType   !== undefined) updateFields.paymentType   = paymentType;
    if (draftDate1    !== undefined) updateFields.draftDate1    = draftDate1 ? new Date(draftDate1) : null;
    if (draftDate2    !== undefined) updateFields.draftDate2    = draftDate2 ? new Date(draftDate2) : null;

    const record = await DataVendorUpload.findByIdAndUpdate(
      req.params.id,
      updateFields,
      { new: true, select: 'paymentStatus paymentType draftDate1 draftDate2 paymentStatusUpdatedAt' }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, data: record });
  } catch (err) {
    console.error('Payment status update error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

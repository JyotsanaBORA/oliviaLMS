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
  'custom6': 'custom6'
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
      'custom1','custom2','custom3','custom4','custom5','custom6'
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
      'custom1','custom2','custom3','custom4','custom5','custom6'
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
      'custom1','custom2','custom3','custom4','custom5','custom6'
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

module.exports = router;

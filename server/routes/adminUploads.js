const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const AdminUpload = require('../models/AdminUpload');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

// ── Header normalisation map (CSV header → model field) ─────────
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
  'entry': 'entry_id',              // column sometimes named just "entry"
  'debt': 'debt',
  'ccount': 'ccount',
  'monthly_payment': 'monthly_payment',
  'monlypayment': 'monthly_payment',       // ViciDial spelling variant
  'monthlypayment': 'monthly_payment',
  'remark': 'remark',
  'custom1': 'custom1',
  'custom2': 'custom2',
  'custom3': 'custom3',
  'custom4': 'custom4',
  'custom5': 'custom5',
  'custom6': 'custom6'
};

// Valid model fields (used to filter unknown columns)
const VALID_FIELDS = new Set(Object.values(HEADER_MAP));

// ── Helpers ──────────────────────────────────────────────────────

// Date fields that need Excel-serial → DD-MM-YYYY HH:MM conversion
const DATE_FIELDS = new Set(['entry_date', 'modify_date', 'last_local_call_time']);

/**
 * Convert a value that may be an Excel serial number, a Date object,
 * or an already-formatted string into DD-MM-YYYY HH:MM (24-hr).
 */
function formatExcelDate(value) {
  if (value == null || value === '') return '';

  // Already a Date object (e.g. cellDates: true)
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return '';
    const dd = String(value.getUTCDate()).padStart(2, '0');
    const mm = String(value.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = value.getUTCFullYear();
    const hh = String(value.getUTCHours()).padStart(2, '0');
    const min = String(value.getUTCMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  }

  const str = String(value).trim();

  // Already in DD-MM-YYYY … format (CSV uploads)
  if (/^\d{2}-\d{2}-\d{4}/.test(str)) return str;

  // Excel serial number (e.g. 46063.6194 → 10-02-2026 14:51)
  const num = Number(value);
  if (!isNaN(num) && num > 25569) {           // 25569 = 01-01-1970
    const totalDays = num - 25569;
    const wholeDays = Math.floor(totalDays);
    const fracMs    = Math.round((totalDays - wholeDays) * 86400000);
    const date      = new Date(wholeDays * 86400000 + fracMs);

    const dd   = String(date.getUTCDate()).padStart(2, '0');
    const mm   = String(date.getUTCMonth() + 1).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const hh   = String(date.getUTCHours()).padStart(2, '0');
    const min  = String(date.getUTCMinutes()).padStart(2, '0');
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`;
  }

  return str;
}

/**
 * Parse DD-MM-YYYY HH:MM or DD-MM-YYYY HH:MM:SS to Date
 */
function parseEntryDate(dateStr) {
  if (!dateStr) return null;
  const str = String(dateStr).trim();

  // DD-MM-YYYY HH:MM[:SS]
  const m = str.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const [, day, month, year, hour, minute, second = '0'] = m;
    return new Date(
      parseInt(year), parseInt(month) - 1, parseInt(day),
      parseInt(hour), parseInt(minute), parseInt(second)
    );
  }

  // YYYY-MM-DD fallback
  const iso = new Date(str);
  return isNaN(iso.getTime()) ? null : iso;
}

/**
 * Normalise a raw CSV header to a model field name
 */
function normaliseHeader(raw) {
  const key = String(raw).trim().toLowerCase().replace(/[\s\-]+/g, '_');
  return HEADER_MAP[key] || null;
}

/**
 * Build a Mongo date-range filter on `entryDateParsed`
 */
function buildDateFilter(query) {
  const { dateFilter, startDate, endDate } = query;
  if (!dateFilter || dateFilter === 'all') return {};

  const now = new Date();
  let start, end;

  switch (dateFilter) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      end = new Date(start);
      end.setDate(end.getDate() + 1);
      break;
    }
    case '7days': {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      start = new Date(end);
      start.setDate(start.getDate() - 7);
      break;
    }
    case '30days': {
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      start = new Date(end);
      start.setDate(start.getDate() - 30);
      break;
    }
    case 'custom': {
      if (!startDate || !endDate) return {};
      // Expect DD-MM-YYYY
      const sm = startDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      const em = endDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      if (!sm || !em) return {};
      start = new Date(parseInt(sm[3]), parseInt(sm[2]) - 1, parseInt(sm[1]));
      end = new Date(parseInt(em[3]), parseInt(em[2]) - 1, parseInt(em[1]));
      end.setDate(end.getDate() + 1);   // inclusive end
      break;
    }
    default:
      return {};
  }

  return { entryDateParsed: { $gte: start, $lt: end } };
}

// ── Middleware helpers ────────────────────────────────────────────

/** Only admins, superadmins */
function requireAdminOrSuper(req, res, next) {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
}

/** Only the specified roles */
function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    next();
  };
}

// ─────────────────────────────────────────────────────────────────
// @route   GET /api/admin-uploads/restricted-admins
// @desc    List all restricted_admin users (for share dropdown)
// @access  admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/restricted-admins', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const admins = await User.find({ role: 'restricted_admin', isActive: true })
      .select('name email organization')
      .populate('organization', 'name')
      .lean();

    res.json({ success: true, data: admins });
  } catch (err) {
    console.error('Error fetching restricted admins:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// @route   POST /api/admin-uploads/upload
// @desc    Upload CSV/Excel and store rows for a restricted admin
// @access  admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.post(
  '/upload',
  express.json({ limit: '50mb' }),
  protect,
  requireAdminOrSuper,
  async (req, res) => {
    try {
      const { fileData, fileName, sharedWith } = req.body;

      if (!fileData || !sharedWith) {
        return res.status(400).json({
          success: false,
          message: 'fileData (base64) and sharedWith (user ID) are required'
        });
      }

      // Validate restricted admin exists
      const targetUser = await User.findById(sharedWith);
      if (!targetUser || targetUser.role !== 'restricted_admin') {
        return res.status(400).json({
          success: false,
          message: 'Invalid restricted admin user'
        });
      }

      // Decode base64 → buffer → workbook
      const buffer = Buffer.from(fileData, 'base64');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return res.status(400).json({ success: false, message: 'Empty workbook' });
      }

      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
      if (!rows.length) {
        return res.status(400).json({ success: false, message: 'No data rows found' });
      }

      // Build header map from actual columns
      const rawHeaders = Object.keys(rows[0]);
      const columnMap = {};    // rawHeader → modelField
      rawHeaders.forEach(h => {
        const field = normaliseHeader(h);
        if (field) columnMap[h] = field;
      });

      // Build batch
      const batchId = `BATCH_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const docs = rows.map(row => {
        const doc = {
          sharedWith: targetUser._id,
          uploadedBy: req.user._id,
          uploadBatchId: batchId,
          organization: req.user.organization || null
        };

        // Map CSV columns (format date fields, stringify the rest)
        for (const [rawH, modelField] of Object.entries(columnMap)) {
          const rawValue = row[rawH];
          if (DATE_FIELDS.has(modelField)) {
            doc[modelField] = formatExcelDate(rawValue);
          } else {
            doc[modelField] = String(rawValue ?? '').trim();
          }
        }

        // Parse entry_date for date queries
        doc.entryDateParsed = parseEntryDate(doc.entry_date);

        return doc;
      });

      // Bulk insert
      const inserted = await AdminUpload.insertMany(docs, { ordered: false });

      res.status(201).json({
        success: true,
        message: `${inserted.length} records uploaded successfully`,
        batchId,
        count: inserted.length
      });
    } catch (err) {
      console.error('Admin upload error:', err);
      res.status(500).json({ success: false, message: err.message || 'Upload failed' });
    }
  }
);

// ─────────────────────────────────────────────────────────────────
// @route   GET /api/admin-uploads
// @desc    Get admin uploads with date filtering + pagination
// @access  restricted_admin (own data), admin/superadmin (all)
// ─────────────────────────────────────────────────────────────────
router.get('/', protect, requireRoles('restricted_admin', 'admin', 'superadmin'), async (req, res) => {
  try {
    const { page = 1, limit = 100 } = req.query;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(500, Math.max(1, parseInt(limit)));

    // Build query
    const query = {};

    // Role-based scoping
    if (req.user.role === 'restricted_admin') {
      query.sharedWith = req.user._id;
    }
    // superadmin and admin see all (or filter by sharedWith if passed)
    if (['admin', 'superadmin'].includes(req.user.role) && req.query.sharedWith) {
      query.sharedWith = req.query.sharedWith;
    }

    // Date filtering
    const dateQuery = buildDateFilter(req.query);
    Object.assign(query, dateQuery);

    const [total, records] = await Promise.all([
      AdminUpload.countDocuments(query),
      AdminUpload.find(query)
        .sort({ entryDateParsed: -1, createdAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .populate('sharedWith', 'name email')
        .populate('uploadedBy', 'name email')
        .lean()
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
    console.error('Error fetching admin uploads:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// @route   GET /api/admin-uploads/export
// @desc    Export filtered admin uploads as CSV
// @access  restricted_admin, admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/export', protect, requireRoles('restricted_admin', 'admin', 'superadmin'), async (req, res) => {
  try {
    const query = {};

    if (req.user.role === 'restricted_admin') {
      query.sharedWith = req.user._id;
    }
    if (['admin', 'superadmin'].includes(req.user.role) && req.query.sharedWith) {
      query.sharedWith = req.query.sharedWith;
    }

    const dateQuery = buildDateFilter(req.query);
    Object.assign(query, dateQuery);

    const records = await AdminUpload.find(query)
      .sort({ entryDateParsed: -1, createdAt: -1 })
      .lean();

    // Build CSV columns (all ViciDial fields)
    const CSV_COLUMNS = [
      'lead_id', 'entry_date', 'modify_date', 'status', 'user',
      'vendor_lead_code', 'source_id', 'list_id', 'gmt_offset_now',
      'called_since_last_reset', 'phone_code', 'phone_number', 'title',
      'first_name', 'middle_initial', 'last_name', 'address1', 'address2',
      'address3', 'city', 'state', 'province', 'postal_code', 'country_code',
      'gender', 'date_of_birth', 'alt_phone', 'email', 'security_phrase',
      'comments', 'called_count', 'last_local_call_time', 'rank', 'owner',
      'entry_id', 'debt', 'ccount', 'monthly_payment', 'remark',
      'custom1', 'custom2', 'custom3', 'custom4', 'custom5', 'custom6'
    ];

    // Escape CSV value
    const esc = (v) => {
      const s = String(v ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
      }
      return s;
    };

    let csv = CSV_COLUMNS.join(',') + '\n';
    for (const r of records) {
      csv += CSV_COLUMNS.map(c => esc(r[c])).join(',') + '\n';
    }

    const fileName = `admin_uploads_${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(csv);
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ success: false, message: 'Export failed' });
  }
});

// ─────────────────────────────────────────────────────────────────
// @route   GET /api/admin-uploads/batches
// @desc    List upload batches (for management overview)
// @access  admin, superadmin
// ─────────────────────────────────────────────────────────────────
router.get('/batches', protect, requireAdminOrSuper, async (req, res) => {
  try {
    const batches = await AdminUpload.aggregate([
      {
        $group: {
          _id: '$uploadBatchId',
          count: { $sum: 1 },
          uploadedAt: { $first: '$createdAt' },
          uploadedBy: { $first: '$uploadedBy' },
          sharedWith: { $first: '$sharedWith' },
          organization: { $first: '$organization' }
        }
      },
      { $sort: { uploadedAt: -1 } },
      { $limit: 100 }
    ]);

    // Populate user info
    await AdminUpload.populate(batches, [
      { path: 'uploadedBy', select: 'name email', model: 'User' },
      { path: 'sharedWith', select: 'name email', model: 'User' }
    ]);

    res.json({ success: true, data: batches });
  } catch (err) {
    console.error('Error fetching batches:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// @route   DELETE /api/admin-uploads/batch/:batchId
// @desc    Delete an entire upload batch
// @access  superadmin, or admin who uploaded it
// ─────────────────────────────────────────────────────────────────
router.delete('/batch/:batchId', protect, requireRoles('admin', 'superadmin'), async (req, res) => {
  try {
    const { batchId } = req.params;

    // Non-superadmin can only delete their own uploads
    const filter = { uploadBatchId: batchId };
    if (req.user.role !== 'superadmin') {
      filter.uploadedBy = req.user._id;
    }

    const result = await AdminUpload.deleteMany(filter);

    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Batch not found or access denied' });
    }

    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} records from batch`,
      deletedCount: result.deletedCount
    });
  } catch (err) {
    console.error('Delete batch error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────
// @route   DELETE /api/admin-uploads/:id
// @desc    Delete a single upload record
// @access  superadmin only
// ─────────────────────────────────────────────────────────────────
router.delete('/:id', protect, requireRoles('superadmin'), async (req, res) => {
  try {
    const record = await AdminUpload.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    res.json({ success: true, message: 'Record deleted' });
  } catch (err) {
    console.error('Delete record error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

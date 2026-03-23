const express = require('express');
const { body, query } = require('express-validator');
const moment = require('moment-timezone');
const Lead = require('../models/Lead');
const User = require('../models/User');
const Organization = require('../models/Organization');
const { protect, authorize } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');
const { 
  getEasternNow, 
  getEasternTimeRanges, 
  formatEasternTime,
  getEasternStartOfDay,
  getEasternEndOfDay 
} = require('../utils/timeFilters');
const { sendGTIPostback, syncLeadWithInboundCall } = require('../utils/gtiPostbackService');

const EASTERN_TIMEZONE = 'America/New_York';

const router = express.Router();

const GTI_ORG_CANONICAL_NAME = (process.env.GTI_ORG_NAME || 'GTI').trim().toUpperCase();

const normalizeOrgName = (name = '') => name.trim().toUpperCase();
const isGtiOrganizationName = (name) => !!name && normalizeOrgName(name) === GTI_ORG_CANONICAL_NAME;

const parseDraftDateInput = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : new Date(value.getTime());
  }

  if (typeof value === 'number') {
    const numericDate = new Date(value);
    return isNaN(numericDate.getTime()) ? null : numericDate;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const slashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (slashMatch) {
      const day = parseInt(slashMatch[1], 10);
      const month = parseInt(slashMatch[2], 10);
      const year = parseInt(slashMatch[3], 10);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        const utcDate = new Date(Date.UTC(year, month - 1, day));
        if (
          utcDate.getUTCFullYear() === year &&
          utcDate.getUTCMonth() === month - 1 &&
          utcDate.getUTCDate() === day
        ) {
          return utcDate;
        }
      }
      return null;
    }

    const parsed = new Date(trimmed);
    return isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
};

const isValidDraftDateInput = (value) => {
  if (value === undefined || value === null || value === '') {
    return true;
  }
  return !!parseDraftDateInput(value);
};

const getOrganizationNameById = async (organizationId) => {
  if (!organizationId) {
    return null;
  }
  const org = await Organization.findById(organizationId).select('name');
  return org ? org.name : null;
};

// Validation rules
const createLeadValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('phone')
    .custom((value) => {
      if (!value || value.trim() === '') return true; // allow empty or missing
      if (typeof value !== 'string') throw new Error('Phone must be a string');
      // Accept either +1XXXXXXXXXX or just XXXXXXXXXX format
      const cleanPhone = value.trim().replace(/[\s\-\(\)]/g, '');
      if (!/^(\+1)?\d{10}$/.test(cleanPhone)) {
        throw new Error('Phone number must be 10 digits with optional +1 prefix (e.g., +12345678901 or 2345678901)');
      }
      return true;
    })
    .withMessage('Phone number must be 10 digits with optional +1 prefix (e.g., +12345678901 or 2345678901)'),
  body('alternatePhone')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!value || value.trim() === '') return true; // allow empty or missing
      if (typeof value !== 'string') throw new Error('Alternate phone must be a string');
      // Accept either +1XXXXXXXXXX or just XXXXXXXXXX format
      const cleanPhone = value.trim().replace(/[\s\-\(\)]/g, '');
      if (!/^(\+1)?\d{10}$/.test(cleanPhone)) {
        throw new Error('Alternate phone number must be 10 digits with optional +1 prefix (e.g., +12345678901 or 2345678901)');
      }
      return true;
    })
    .withMessage('Alternate phone number must be 10 digits with optional +1 prefix (e.g., +12345678901 or 2345678901)'),
  body('debtCategory')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['secured', 'unsecured'])
    .withMessage('Debt category must be secured or unsecured'),
  body('debtTypes')
    .optional({ nullable: true, checkFalsy: true })
    .isArray()
    .withMessage('Debt types must be an array'),
  body('totalDebtAmount')
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage('Total debt amount must be a number'),
  body('numberOfCreditors')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Number of creditors must be a non-negative integer'),
  body('monthlyDebtPayment')
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage('Monthly debt payment must be a number'),
  body('creditScore')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 900 })
    .withMessage('Credit score must be a whole number between 0 and 900'),
  body('creditScoreRange')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['300-549', '550-649', '650-699', '700-749', '750-850'])
    .withMessage('Credit score range must be 300-549, 550-649, 650-699, 700-749, or 750-850'),
  body('budget')
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage('Budget must be a number'),
  body('source')
    .optional({ nullable: true, checkFalsy: true })
    .isIn([
      'Personal Debt', 'Secured Debt', 'Unsecured Debt', 'Revolving Debt', 
      'Installment Debt', 'Credit Card Debt', 'Mortgage Debt', 'Student Loans',
      'Auto Loans', 'Personal Loans', 'Medical Debt', 'Home Equity Loans (HELOCs)',
      'Payday Loans', 'Buy Now, Pay Later (BNPL) loans'
    ])
    .withMessage('Invalid debt type'),
  body('company')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Company name cannot exceed 100 characters'),
  body('jobTitle')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Job title cannot exceed 100 characters'),
  body('location')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('Location cannot exceed 200 characters'),
  body('requirements')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 1000 })
    .withMessage('Requirements cannot exceed 1000 characters'),
  body('notes')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 2000 })
    .withMessage('Notes cannot exceed 2000 characters'),
  body('address')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('Address cannot exceed 200 characters'),
  body('city')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('City cannot exceed 100 characters'),
  body('state')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  body('zipcode')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 20 })
    .withMessage('Zipcode cannot exceed 20 characters'),
  body('disposition1')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('Disposition 1 cannot exceed 200 characters'),
  body('isDisposed')
    .optional()
    .isBoolean()
    .withMessage('isDisposed must be a boolean value')
    .toBoolean(),
  body('draftDate')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!isValidDraftDateInput(value)) {
        throw new Error('Draft date must be dd/mm/yyyy or a valid ISO date');
      }
      return true;
    })
];

const updateLeadValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .optional({ nullable: true, checkFalsy: true })
    .isEmail()
    .withMessage('Please enter a valid email'),
  body('phone')
    .optional()
    .custom((value) => {
      if (!value || value.trim() === '') return true; // allow empty or missing
      if (typeof value !== 'string') throw new Error('Phone must be a string');
      if (value.length < 5 || value.length > 20) throw new Error('Phone must be 5-20 characters');
      if (!/^[\d+\-()\s]+$/.test(value)) throw new Error('Phone can only contain numbers, spaces, +, -, (, )');
      return true;
    })
    .withMessage('Phone must be 5-20 characters and contain only numbers, spaces, +, -, (, )'),
  body('alternatePhone')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!value || value.trim() === '') return true; // allow empty or missing
      if (typeof value !== 'string') throw new Error('Alternate phone must be a string');
      if (value.length < 5 || value.length > 20) throw new Error('Alternate phone must be 5-20 characters');
      if (!/^[\d+\-()\s]+$/.test(value)) throw new Error('Alternate phone can only contain numbers, spaces, +, -, (, )');
      return true;
    })
    .withMessage('Alternate phone must be 5-20 characters and contain only numbers, spaces, +, -, (, )'),
  body('debtCategory')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['secured', 'unsecured'])
    .withMessage('Debt category must be secured or unsecured'),
  body('debtTypes')
    .optional({ nullable: true, checkFalsy: true })
    .isArray()
    .withMessage('Debt types must be an array'),
  body('totalDebtAmount')
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage('Total debt amount must be a number'),
  body('numberOfCreditors')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0 })
    .withMessage('Number of creditors must be a non-negative integer'),
  body('monthlyDebtPayment')
    .optional({ nullable: true, checkFalsy: true })
    .isNumeric()
    .withMessage('Monthly debt payment must be a number'),
  body('creditScore')
    .optional({ nullable: true, checkFalsy: true })
    .isInt({ min: 0, max: 900 })
    .withMessage('Credit score must be a whole number between 0 and 900'),
  body('creditScoreRange')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['300-549', '550-649', '650-699', '700-749', '750-850'])
    .withMessage('Credit score range must be 300-549, 550-649, 650-699, 700-749, or 750-850'),
  body('address')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('Address cannot exceed 200 characters'),
  body('city')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('City cannot exceed 100 characters'),
  body('state')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  body('zipcode')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 20 })
    .withMessage('Zipcode cannot exceed 20 characters'),
  body('notes')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 2000 })
    .withMessage('Notes cannot exceed 2000 characters'),
  body('company')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 100 })
    .withMessage('Company name cannot exceed 100 characters'),
  body('source')
    .optional({ nullable: true, checkFalsy: true })
    .isIn([
      'Personal Debt', 'Secured Debt', 'Unsecured Debt', 'Revolving Debt', 
      'Installment Debt', 'Credit Card Debt', 'Mortgage Debt', 'Student Loans',
      'Auto Loans', 'Personal Loans', 'Medical Debt', 'Home Equity Loans (HELOCs)',
      'Payday Loans', 'Buy Now, Pay Later (BNPL) loans'
    ])
    .withMessage('Invalid debt type'),
  body('status')
    .optional()
    .isIn(['new', 'interested', 'not-interested', 'successful', 'follow-up'])
    .withMessage('Invalid status'),
  body('leadStatus')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['Warm Transfer – Pre-Qualified', 'Cold Transfer – Not - Qualified', 'From Internal Dept.', 'Test / Training Call'])
    .withMessage('Invalid lead status'),
  body('contactStatus')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['Connected & Engaged', 'Connected – Requested Callback', 'No Answer', 'Wrong Number', 'Call Dropped'])
    .withMessage('Invalid contact status'),
  body('qualificationOutcome')
    .optional({ nullable: true, checkFalsy: true })
    .isIn([
      'Qualified – Meets Criteria', 'Pre-Qualified – Docs Needed', 'Not - Qualified – Debt Too Low',
      'Not - Qualified – Secured Debt Only', 'Not - Qualified – Non-Service State', 'Not - Qualified – No Hardship',
      'Not - Qualified – Active with Competitor'
    ])
    .withMessage('Invalid qualification outcome'),
  body('callDisposition')
    .optional({ nullable: true, checkFalsy: true })
    .isIn([
      'Appointment Scheduled', 'Immediate Enrollment', 'Info Provided – Awaiting Decision',
      'Nurture – Not Ready', 'Declined Services', 'DNC'
    ])
    .withMessage('Invalid call disposition'),
  body('engagementOutcome')
    .optional({ nullable: true, checkFalsy: true })
    .isIn([
      'Proceeding with Program', 'Callback Needed', 'Hung Up',
      'Info Only – Follow-up Needed', 'Not Interested', 'DNC'
    ])
    .withMessage('Invalid engagement outcome'),
  body('disqualification')
    .optional({ nullable: true, checkFalsy: true })
    .isIn(['Debt Too Low', 'Secured Debt Only', 'No Debt', 'Wrong Number / Bad Contact'])
    .withMessage('Invalid disqualification'),
  body('followUpDate')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return true; // Allow empty values
      }
      // Check if it's a valid date
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid follow-up date');
      }
      return true;
    }),
  body('followUpTime')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return true; // Allow empty values
      }
      // Check if it matches HH:MM format
      if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(value)) {
        throw new Error('Follow-up time must be in HH:MM format');
      }
      return true;
    }),
  body('followUpNotes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Follow-up notes cannot exceed 500 characters'),
  body('conversionValue')
    .optional()
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return true; // Allow empty values
      }
      const num = parseFloat(value);
      if (isNaN(num) || num < 0) {
        throw new Error('Conversion value must be a positive number');
      }
      return true;
    }),
  body('requestedLoanAmount')
    .optional({ nullable: true })
    .custom((value) => {
      if (value === '' || value === null || value === undefined) {
        return true;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return true;
      }
      const num = Number(value);
      if (!Number.isInteger(num) || num <= 0) {
        throw new Error('Requested loan amount must be a positive integer');
      }
      return true;
    })
    .customSanitizer((value) => {
      if (value === null) {
        return null;
      }
      if (value === '' || value === undefined) {
        return undefined;
      }
      if (typeof value === 'string' && value.trim() === '') {
        return undefined;
      }
      return Number(value);
    }),
  body('leadProgressStatus')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!value || value.trim() === '') return true; // Allow empty values
      
      const allowedStatuses = [
        'SALE',
        'Callback Needed',
        'Existing Client',
        'Unacceptable Creditors',
        'Not Serviceable State',
        'Sale Long Play',
        'Request for Loan',
        'DO NOT CALL - Litigator',
        'DO NOT CALL',
        'Hang-up',
        'Not Interested',
        'No Answer',
        'AIP Client',
        'Not Qualified',
        'Affordability',
        'Others'
      ];
      
      // Allow predefined statuses or any custom string (for "Others" option and backward compatibility)
      if (allowedStatuses.includes(value) || typeof value === 'string') {
        return true;
      }
      
      throw new Error('Lead progress status must be a valid string');
    })
    .withMessage('Invalid lead progress status'),
  body('agent2LastAction')
    .optional()
    .isString()
    .withMessage('Agent2 last action must be a string'),
  body('lastUpdatedBy')
    .optional()
    .isString()
    .withMessage('Last updated by must be a string'),
  body('lastUpdatedAt')
    .optional()
    .isISO8601()
    .withMessage('Last updated at must be a valid date'),
  body('disposition1')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 200 })
    .withMessage('Disposition 1 cannot exceed 200 characters'),
  body('isDisposed')
    .optional()
    .isBoolean()
    .withMessage('isDisposed must be a boolean value')
    .toBoolean(),
  body('draftDate')
    .optional({ nullable: true, checkFalsy: true })
    .custom((value) => {
      if (!isValidDraftDateInput(value)) {
        throw new Error('Draft date must be dd/mm/yyyy or a valid ISO date');
      }
      return true;
    })
];

// @route   GET /api/leads/export
// @desc    Export leads as CSV
// @access  Protected (All authenticated users can export their accessible leads)
router.get('/export', [
  protect,
  // Same validation as the main leads route
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query cannot exceed 100 characters'),
  query('leadId')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Lead ID cannot exceed 50 characters'),
  query('assignedTo')
    .optional()
    .isMongoId()
    .withMessage('Invalid assigned agent ID'),
  query('status')
    .optional()
    .isIn(['new', 'interested', 'not-interested', 'successful', 'follow-up'])
    .withMessage('Invalid status filter'),
  query('category')
    .optional()
    .isIn(['hot', 'warm', 'cold'])
    .withMessage('Invalid category filter'),
  query('qualificationStatus')
    .optional()
    .isIn(['qualified', 'not-qualified', 'pending'])
    .withMessage('Invalid qualification status filter'),
  query('duplicateStatus')
    .optional()
    .isIn(['all', 'duplicates', 'non-duplicates'])
    .withMessage('Invalid duplicate status filter'),
  query('organization')
    .optional()
    .isMongoId()
    .withMessage('Invalid organization ID'),
  query('dateFilterType')
    .optional()
    .isIn(['all', 'today', 'week', 'month', 'custom'])
    .withMessage('Invalid date filter type'),
  query('startDate')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Accept both YYYY-MM-DD and ISO8601 formats
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(value) || !isNaN(Date.parse(value))) {
        return true;
      }
      throw new Error('Invalid start date format');
    }),
  query('endDate')
    .optional()
    .custom((value) => {
      if (!value) return true;
      // Accept both YYYY-MM-DD and ISO8601 formats
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(value) || !isNaN(Date.parse(value))) {
        return true;
      }
      throw new Error('Invalid end date format');
    }),
  handleValidationErrors
], async (req, res) => {
  try {
    const user = req.user;

    console.log(`Export request from ${user.role} user: ${user._id}`);

    // Build filter object using EXACT same logic as main leads route
    const filter = {};
    
    // IMPORTANT: Apply organization filter FIRST for non-REDDINGTON admins
    // This ensures all subsequent filters work within the correct organization scope
    if (req.user.role === 'admin') {
      const adminOrganization = await Organization.findById(req.user.organization);
      
      if (adminOrganization && adminOrganization.name === 'REDDINGTON GLOBAL CONSULTANCY') {
        // REDDINGTON GLOBAL CONSULTANCY Admin can filter by organization
        if (req.query.organization) {
          filter.organization = req.query.organization;
        }
        // If no organization filter specified, they can see all organizations
      } else {
        // Other organization admins can ONLY see leads from their own organization
        // This restriction is applied FIRST and cannot be overridden by query params
        filter.organization = req.user.organization;
        console.log('Export - Non-REDDINGTON Admin: Restricting to organization', req.user.organization);
      }
    } else if (req.user.role === 'superadmin' && req.query.organization) {
      // SuperAdmin can filter by organization if specified
      filter.organization = req.query.organization;
    }
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.qualificationStatus) {
      // Handle backward compatibility: 'not-qualified' filter should include 'not-qualified', 'disqualified', and 'unqualified'
      if (req.query.qualificationStatus === 'not-qualified') {
        filter.qualificationStatus = { $in: ['not-qualified', 'disqualified', 'unqualified'] };
      } else {
        filter.qualificationStatus = req.query.qualificationStatus;
      }
    }

    // Duplicate status filter
    if (req.query.duplicateStatus) {
      if (req.query.duplicateStatus === 'duplicates') {
        filter.isDuplicate = true;
      } else if (req.query.duplicateStatus === 'non-duplicates') {
        filter.isDuplicate = { $ne: true };
      }
      // 'all' shows both duplicates and non-duplicates (no filter added)
    }

    // Search functionality
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { company: { $regex: req.query.search, $options: 'i' } },
        { phone: { $regex: req.query.search, $options: 'i' } },
        { leadId: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Lead ID filter
    if (req.query.leadId && req.query.leadId.trim()) {
      const leadIdRegex = new RegExp(req.query.leadId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.leadId = leadIdRegex;
    }

    // Assigned to filter (for SuperAdmin dashboard)
    if (req.query.assignedTo) {
      filter.assignedTo = req.query.assignedTo;
    }

    // Date filtering functionality - EXACT same logic as main route
    if (req.query.dateFilterType && req.query.dateFilterType !== 'all') {
      const now = getEasternNow();
      let startDate, endDate;

      switch (req.query.dateFilterType) {
        case 'today':
          startDate = getEasternStartOfDay();
          endDate = getEasternEndOfDay();
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          endDate = getEasternEndOfDay();
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
          endDate = getEasternEndOfDay();
          break;
        case 'custom':
          if (req.query.startDate && req.query.endDate) {
            // CRITICAL: Parse dates as UTC to match MongoDB Compass behavior
            // Input format: "YYYY-MM-DD" from frontend date picker
            // MongoDB Compass uses: ISODate("2025-10-08T00:00:00Z")
            // We need to match that exact format for consistency
            startDate = new Date(req.query.startDate + 'T00:00:00Z');
            endDate = new Date(req.query.endDate + 'T23:59:59.999Z');
            
            console.log(`Export Custom date filter: ${req.query.startDate} to ${req.query.endDate}`);
            console.log(`Export Converted to UTC: ${startDate.toISOString()} to ${endDate.toISOString()}`);
          }
          break;
      }

      if (startDate && endDate) {
        filter.createdAt = {
          $gte: startDate,
          $lte: endDate
        };
      }
    } else if (req.query.startDate || req.query.endDate) {
      // Handle individual date parameters (fallback for backwards compatibility)
      // CRITICAL: Parse dates as UTC to match MongoDB Compass behavior
      const dateFilter = {};
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate + 'T00:00:00Z');
        dateFilter.$gte = startDate;
        console.log(`Export Individual startDate filter: ${startDate.toISOString()}`);
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate + 'T23:59:59.999Z');
        dateFilter.$lte = endDate;
        console.log(`Export Individual endDate filter: ${endDate.toISOString()}`);
      }
      filter.createdAt = dateFilter;
    }

    // Organization filter is now applied at the top of the filter building process
    // This section has been moved to ensure proper filter precedence

    // CRITICAL: Apply EXACT same role-based filtering as main leads route
    if (req.user.role === 'agent1') {
      filter.createdBy = req.user._id;
      filter.adminProcessed = { $ne: true }; // Hide admin-processed leads
      console.log('Agent1 export filter applied:', filter);
    } else if (req.user.role === 'agent2') {
      // Agent2 can see:
      // 1. Leads assigned to them
      // 2. Duplicate leads (for review)
      // 3. Leads with qualificationStatus 'pending' (persistent across days)
      // 4. Leads with leadProgressStatus 'Callback Needed' (persistent across days)
      filter.$or = [
        { 
          assignedTo: req.user._id,
          adminProcessed: { $ne: true }
        },
        { 
          isDuplicate: true,
          adminProcessed: { $ne: true }
        },
        {
          assignedTo: req.user._id,
          qualificationStatus: 'pending',
          adminProcessed: { $ne: true }
        },
        {
          assignedTo: req.user._id,
          leadProgressStatus: 'Callback Needed',
          adminProcessed: { $ne: true }
        }
      ];
      console.log('Agent2 export filter applied:', filter);
    } else if (req.user.role === 'admin') {
      // Admin organization filtering is now handled at the top of filter building
      // No additional filtering needed here - organization filter already applied
      console.log('Admin export filter applied: organization already set at top of filter chain');
    } else if (req.user.role === 'superadmin') {
      // SuperAdmin can see all leads including duplicates from all organizations
      // No additional filters needed beyond query parameters
      console.log('SuperAdmin export filter applied: No restrictions');
    }

    console.log('Final export filter:', JSON.stringify(filter, null, 2));
    console.log('User role:', req.user.role, 'User ID:', req.user._id);

    // Get all matching leads (no pagination for export) - EXACT same query as main route
    const leads = await Lead.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('organization', 'name description')
      .populate('disposedBy', 'name email')
      .populate('duplicateOf', 'leadId name email phone')
      .populate('duplicateDetectedBy', 'name email')
      .sort({ createdAt: -1, _id: -1 }); // Added _id for consistent sorting

    console.log(`Export found ${leads.length} leads`);
    
    // Debug: Log first lead to check data structure
    if (leads.length > 0) {
      console.log('Sample lead structure:', {
        leadId: leads[0].leadId,
        name: leads[0].name,
        duplicateOf: leads[0].duplicateOf,
        organization: leads[0].organization?.name,
        createdAt: leads[0].createdAt
      });
    }

    // Convert to CSV format - ONLY ACTIVE FIELDS (removed deprecated fields)
    const csvHeader = [
      'Lead ID',
      'Name',
      'Email', 
      'Phone',
      'Alternate Phone',
      'Debt Category',
      'Debt Types',
      'Total Debt Amount',
      'Number of Creditors',
      'Monthly Debt Payment',
      'Credit Score',
      'Credit Score Range',
      'Notes',
      'Address',
      'City',
      'State',
      'Zipcode',
      'Category',
      'Completion Percentage',
      'Lead Progress Status',
      'Qualification Status',
      'Last Updated By',
      'Last Updated At',
      'Follow Up Date',
      'Follow Up Time',
      'Follow Up Notes',
      'Created By',
      'Updated By',
      'Organization',
      'Assigned To',
      'Assigned By',
      'Assigned At',
      'Assignment Notes',
      'Converted At',
      'Conversion Value',
      'Admin Processed',
      'Admin Processed At',
      'Is Duplicate',
      'Duplicate Of',
      'Duplicate Reason',
      'Duplicate Detected At',
      'Duplicate Detected By',
      'Created Date (Eastern)',
      'Updated Date (Eastern)'
    ].join(',');

    const csvRows = leads.map((lead, index) => {
      const formatValue = (value) => {
        try {
          if (value === null || value === undefined) return '';
          
          // Handle objects (including MongoDB ObjectIds and populated objects)
          if (typeof value === 'object' && value !== null) {
            // If it's a populated object with name, use the name
            if (value.name) return String(value.name);
            // If it's a populated object with leadId, use the leadId
            if (value.leadId) return String(value.leadId);
            // If it's an ObjectId or similar, convert to string
            if (value.toString && typeof value.toString === 'function') {
              const stringified = value.toString();
              // Avoid [object Object] outputs
              if (stringified === '[object Object]') {
                return JSON.stringify(value);
              }
              return String(stringified);
            }
            // Fallback for other objects
            return JSON.stringify(value);
          }
          
          // Convert to string first to handle all data types
          const stringValue = String(value);
          
          // Escape CSV special characters
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          
          return stringValue;
        } catch (error) {
          console.error(`Error formatting value for lead ${index}:`, error, 'Value:', value);
          return ''; // Return empty string on error
        }
      };

      const formatArray = (arr) => {
        if (!Array.isArray(arr)) return '';
        const formattedItems = arr.map(item => formatValue(item));
        return `"${formattedItems.join('; ')}"`;
      };
      
      return [
        formatValue(lead.leadId || ''),
        formatValue(lead.name || ''),
        formatValue(lead.email || ''),
        formatValue(lead.phone || ''),
        formatValue(lead.alternatePhone || ''),
        formatValue(lead.debtCategory || ''),
        formatArray(lead.debtTypes || []),
        formatValue(lead.totalDebtAmount || ''),
        formatValue(lead.numberOfCreditors || ''),
        formatValue(lead.monthlyDebtPayment || ''),
        formatValue(lead.creditScore || ''),
        formatValue(lead.creditScoreRange || ''),
        formatValue(lead.notes || ''),
        formatValue(lead.address || ''),
        formatValue(lead.city || ''),
        formatValue(lead.state || ''),
        formatValue(lead.zipcode || ''),
        formatValue(lead.category || ''),
        formatValue(lead.completionPercentage || ''),
        formatValue(lead.leadProgressStatus || ''),
        formatValue(lead.qualificationStatus || ''),
        formatValue(lead.lastUpdatedBy || ''),
        formatValue(lead.lastUpdatedAt ? formatEasternTime(lead.lastUpdatedAt) : ''),
        formatValue(lead.followUpDate ? formatEasternTime(lead.followUpDate) : ''),
        formatValue(lead.followUpTime || ''),
        formatValue(lead.followUpNotes || ''),
        formatValue(lead.createdBy?.name || ''),
        formatValue(lead.updatedBy?.name || ''),
        formatValue(lead.organization?.name || ''),
        formatValue(lead.assignedTo?.name || ''),
        formatValue(lead.assignedBy?.name || ''),
        formatValue(lead.assignedAt ? formatEasternTime(lead.assignedAt) : ''),
        formatValue(lead.assignmentNotes || ''),
        formatValue(lead.convertedAt ? formatEasternTime(lead.convertedAt) : ''),
        formatValue(lead.conversionValue || ''),
        formatValue(lead.adminProcessed ? 'Yes' : 'No'),
        formatValue(lead.adminProcessedAt ? formatEasternTime(lead.adminProcessedAt) : ''),
        formatValue(lead.isDuplicate ? 'Yes' : 'No'),
        formatValue(lead.duplicateOf ? (lead.duplicateOf.leadId || lead.duplicateOf.name || String(lead.duplicateOf._id || lead.duplicateOf)) : ''),
        formatValue(lead.duplicateReason || ''),
        formatValue(lead.duplicateDetectedAt ? formatEasternTime(lead.duplicateDetectedAt) : ''),
        formatValue(lead.duplicateDetectedBy?.name || ''),
        formatValue(formatEasternTime(lead.createdAt)),
        formatValue(formatEasternTime(lead.updatedAt))
      ].join(',');
    });

    // Validate CSV rows before joining
    const validCsvRows = csvRows.filter((row, index) => {
      if (typeof row !== 'string' || row.trim() === '') {
        console.warn(`Invalid CSV row at index ${index}:`, row);
        return false;
      }
      return true;
    });

    console.log(`Generated ${validCsvRows.length} valid CSV rows out of ${csvRows.length} total rows`);

    const csvContent = [csvHeader, ...validCsvRows].join('\n');

    // Set headers for CSV download
    const timestamp = formatEasternTime(getEasternNow()).replace(/[^0-9]/g, '');
    const filename = `leads_export_${timestamp}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Pragma', 'no-cache');

    res.status(200).send(csvContent);

  } catch (error) {
    console.error('Export leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting leads',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @route   GET /api/leads/assigned-to-me
// @desc    Get leads assigned to current Agent2 user (for persistent dashboard)
// @access  Private (Agent2 only)
router.get('/assigned-to-me', protect, async (req, res) => {
  try {
    if (req.user.role !== 'agent2') {
      return res.status(403).json({
        success: false,
        message: 'Only Agent2 can access assigned leads'
      });
    }

    const { status } = req.query;

    // Build filter for assigned leads
    let filter = {
      assignedTo: req.user._id,
      adminProcessed: { $ne: true }
    };

    // Add status-specific filters
    if (status === 'pending') {
      filter.qualificationStatus = 'pending';
    } else if (status === 'callback') {
      filter.leadProgressStatus = 'Callback Needed';
    }

    // Fetch assigned leads (no date filtering for persistence)
    const leads = await Lead.find(filter)
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('organization', 'name')
      .populate('disposedBy', 'name email')
      .sort({ assignedAt: -1 });

    res.json({
      success: true,
      message: 'Assigned leads fetched successfully',
      data: {
        leads,
        total: leads.length
      }
    });

  } catch (error) {
    console.error('Assigned leads fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching assigned leads',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get all leads with pagination and filtering
// @route   GET /api/leads
// @access  Private (Agent1, Agent2, Admin)
router.get('/', protect, [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 })
    .withMessage('Limit must be between 1 and 1000'),
  query('status')
    .optional()
    .isIn(['new', 'interested', 'not-interested', 'successful', 'follow-up'])
    .withMessage('Invalid status filter'),
  query('category')
    .optional()
    .isIn(['hot', 'warm', 'cold'])
    .withMessage('Invalid category filter'),
  query('qualificationStatus')
    .optional()
    .isIn(['qualified', 'not-qualified', 'pending'])
    .withMessage('Invalid qualification status filter'),
  query('duplicateStatus')
    .optional()
    .isIn(['all', 'duplicates', 'non-duplicates'])
    .withMessage('Invalid duplicate status filter'),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query cannot exceed 100 characters'),
  query('leadId')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Lead ID cannot exceed 50 characters'),
  query('organization')
    .optional()
    .isMongoId()
    .withMessage('Invalid organization ID'),
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Start date must be a valid ISO date'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('End date must be a valid ISO date'),
  query('dateFilterType')
    .optional()
    .isIn(['all', 'today', 'week', 'month', 'custom'])
    .withMessage('Invalid date filter type')
], handleValidationErrors, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;

    // Build filter object
    const filter = {};
    
    // IMPORTANT: Apply organization filter FIRST for non-REDDINGTON admins
    // This ensures all subsequent filters work within the correct organization scope
    if (req.user.role === 'admin') {
      // Use .lean() and select only name to avoid full document overhead
      const adminOrganization = await Organization.findById(req.user.organization).select('name').lean();
      
      if (adminOrganization && adminOrganization.name === 'REDDINGTON GLOBAL CONSULTANCY') {
        // REDDINGTON GLOBAL CONSULTANCY Admin can filter by organization
        if (req.query.organization) {
          filter.organization = req.query.organization;
        }
        // If no organization filter specified, they can see all organizations
      } else {
        // Other organization admins can ONLY see leads from their own organization
        // This restriction is applied FIRST and cannot be overridden by query params
        filter.organization = req.user.organization;
        console.log('Non-REDDINGTON Admin: Restricting to organization', req.user.organization);
      }
    } else if (req.user.role === 'superadmin' && req.query.organization) {
      // SuperAdmin can filter by organization if specified
      filter.organization = req.query.organization;
    }
    
    if (req.query.status) {
      filter.status = req.query.status;
    }
    
    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.qualificationStatus) {
      // Handle backward compatibility: 'not-qualified' filter should include 'not-qualified', 'disqualified', and 'unqualified'
      if (req.query.qualificationStatus === 'not-qualified') {
        filter.qualificationStatus = { $in: ['not-qualified', 'disqualified', 'unqualified'] };
      } else {
        filter.qualificationStatus = req.query.qualificationStatus;
      }
    }

    // Duplicate status filter
    if (req.query.duplicateStatus) {
      if (req.query.duplicateStatus === 'duplicates') {
        filter.isDuplicate = true;
      } else if (req.query.duplicateStatus === 'non-duplicates') {
        filter.isDuplicate = { $ne: true };
      }
      // 'all' shows both duplicates and non-duplicates (no filter added)
    }

    // Lead progress status filter
    if (req.query.progressStatus && req.query.progressStatus !== 'all') {
      if (req.query.progressStatus === 'sale') {
        filter.leadProgressStatus = { $in: ['SALE', 'Sale Long Play', 'Immediate Enrollment'] };
      } else if (req.query.progressStatus === 'callback') {
        filter.leadProgressStatus = 'Callback Needed';
      }
    }

    // Search functionality
    if (req.query.search) {
      filter.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } },
        { company: { $regex: req.query.search, $options: 'i' } },
        { phone: { $regex: req.query.search, $options: 'i' } },
        { leadId: { $regex: req.query.search, $options: 'i' } },
        { clientId: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Lead ID filter
    if (req.query.leadId && req.query.leadId.trim()) {
      const leadIdRegex = new RegExp(req.query.leadId.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.leadId = leadIdRegex;
    }

    // Date filtering functionality
    if (req.query.dateFilterType && req.query.dateFilterType !== 'all') {
      const now = getEasternNow();
      let startDate, endDate;

      switch (req.query.dateFilterType) {
        case 'today':
          startDate = getEasternStartOfDay();
          endDate = getEasternEndOfDay();
          break;
        case 'week':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          startDate.setHours(0, 0, 0, 0);
          endDate = getEasternEndOfDay();
          break;
        case 'month':
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 30);
          startDate.setHours(0, 0, 0, 0);
          endDate = getEasternEndOfDay();
          break;
        case 'custom':
          if (req.query.startDate && req.query.endDate) {
            // CRITICAL: Parse dates as UTC to match MongoDB Compass behavior
            // Input format: "YYYY-MM-DD" from frontend date picker
            // MongoDB Compass uses: ISODate("2025-10-08T00:00:00Z")
            // We need to match that exact format for consistency
            startDate = new Date(req.query.startDate + 'T00:00:00Z');
            endDate = new Date(req.query.endDate + 'T23:59:59.999Z');
            
            console.log(`Main API Custom date filter: ${req.query.startDate} to ${req.query.endDate}`);
            console.log(`Main API Converted to UTC: ${startDate.toISOString()} to ${endDate.toISOString()}`);
          }
          break;
      }

      if (startDate && endDate) {
        filter.createdAt = {
          $gte: startDate,
          $lte: endDate
        };
      }
    } else if (req.query.startDate || req.query.endDate) {
      // Handle individual date parameters (fallback for backwards compatibility)
      // CRITICAL: Parse dates as UTC to match MongoDB Compass behavior
      const dateFilter = {};
      if (req.query.startDate) {
        const startDate = new Date(req.query.startDate + 'T00:00:00Z');
        dateFilter.$gte = startDate;
        console.log(`Main API Individual startDate filter: ${startDate.toISOString()}`);
      }
      if (req.query.endDate) {
        const endDate = new Date(req.query.endDate + 'T23:59:59.999Z');
        dateFilter.$lte = endDate;
        console.log(`Main API Individual endDate filter: ${endDate.toISOString()}`);
      }
      filter.createdAt = dateFilter;
    }

    // Organization filter is now applied at the top of the filter building process
    // This section has been moved to ensure proper filter precedence

    // Role-based filtering
    if (req.user.role === 'agent1') {
      filter.createdBy = req.user._id;
      filter.adminProcessed = { $ne: true }; // Hide admin-processed leads
      console.log('Agent1 filter applied:', filter);
    } else if (req.user.role === 'agent2') {
      // Agent2 can see:
      // 1. Leads assigned to them
      // 2. Duplicate leads (for review)
      // 3. Leads with qualificationStatus 'pending' (persistent across days)
      // 4. Leads with leadProgressStatus 'Callback Needed' (persistent across days)
      filter.$or = [
        { 
          assignedTo: req.user._id,
          adminProcessed: { $ne: true }
        },
        { 
          isDuplicate: true,
          adminProcessed: { $ne: true }
        },
        {
          assignedTo: req.user._id,
          qualificationStatus: 'pending',
          adminProcessed: { $ne: true }
        },
        {
          assignedTo: req.user._id,
          leadProgressStatus: 'Callback Needed',
          adminProcessed: { $ne: true }
        }
      ];
      console.log('Agent2 filter applied:', filter);
    } else if (req.user.role === 'admin') {
      // Admin organization filtering is now handled at the top of filter building
      // No additional filtering needed here - organization filter already applied
      console.log('Admin filter applied: organization already set at top of filter chain');
    } else if (req.user.role === 'superadmin') {
      // SuperAdmin can see all leads including duplicates from all organizations
      // No additional filters needed beyond query parameters
      console.log('SuperAdmin filter applied: No restrictions');
    }

    console.log('Final filter:', filter);
    console.log('User role:', req.user.role, 'User ID:', req.user._id);

    // List-view projection — only fields needed for the table (not editing/detail views)
    const listProjection = {
      leadId: 1, name: 1, email: 1, phone: 1, alternatePhone: 1,
      status: 1, category: 1, qualificationStatus: 1, leadProgressStatus: 1,
      isDuplicate: 1, duplicateReason: 1, duplicateOf: 1,
      isDisposed: 1, disposition1: 1,
      totalDebtAmount: 1, debtCategory: 1, debtTypes: 1, numberOfCreditors: 1,
      monthlyDebtPayment: 1, creditScore: 1, creditScoreRange: 1,
      requestedLoanAmount: 1,
      address: 1, city: 1, state: 1, zipcode: 1,
      notes: 1, followUpDate: 1, followUpTime: 1, followUpNotes: 1,
      draftDate: 1, adminProcessed: 1, adminProcessedAt: 1,
      assignedAt: 1, assignmentNotes: 1,
      createdBy: 1, updatedBy: 1, assignedTo: 1, assignedBy: 1,
      organization: 1, disposedBy: 1, duplicateDetectedBy: 1,
      gtiCallUuid: 1, gtiPrimaryPhone: 1,
      clientId: 1, conversionValue: 1, convertedAt: 1,
      lastUpdatedBy: 1, lastUpdatedAt: 1,
      createdAt: 1, updatedAt: 1
    };

    // Run leads fetch and count in parallel — saves one DB round-trip
    const [leads, total] = await Promise.all([
      Lead.find(filter, listProjection)
        .populate('createdBy', 'name email')
        .populate('updatedBy', 'name email')
        .populate('assignedTo', 'name email')
        .populate('assignedBy', 'name email')
        .populate('organization', 'name description')
        .populate('disposedBy', 'name email')
        .populate('duplicateOf', 'leadId name email phone')
        .populate('duplicateDetectedBy', 'name email')
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Lead.countDocuments(filter)
    ]);

    console.log('Found leads:', leads.length, 'Total count:', total);

    res.status(200).json({
      success: true,
      data: {
        leads,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    console.error('Get leads error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching leads',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get available Agent2 users based on organization rules
// @route   GET /api/leads/available-agents
// @access  Private (Agent1 only)
router.get('/available-agents', protect, async (req, res) => {
  try {
    if (req.user.role !== 'agent1') {
      return res.status(403).json({
        success: false,
        message: 'Only Agent1 can view available agents'
      });
    }

    // Get current user's organization
    const currentUserWithOrg = await User.findById(req.user._id).populate('organization');
    const mainOrgName = 'REDDINGTON GLOBAL CONSULTANCY';
    let availableAgents;
    
    if (currentUserWithOrg.organization.name === mainOrgName) {
      // Main organization Agent1 can see Agent2 users in same organization
      availableAgents = await User.find({
        role: 'agent2',
        organization: req.user.organization,
        isActive: true
      }).select('name email');
    } else {
      // Other organizations' Agent1 can only see Agent2 users from main organization
      const mainOrg = await Organization.findOne({ name: mainOrgName });
      if (!mainOrg) {
        return res.status(404).json({
          success: false,
          message: `Main organization "${mainOrgName}" not found`
        });
      }
      
      availableAgents = await User.find({
        role: 'agent2',
        organization: mainOrg._id,
        isActive: true
      }).select('name email');
    }

    res.status(200).json({
      success: true,
      data: { agents: availableAgents }
    });

  } catch (error) {
    console.error('Get available agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching available agents',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get today's lead statistics for admin dashboard Today Leads view
// @route   GET /api/leads/today-stats
// @access  Private (Admin, SuperAdmin)
router.get('/today-stats', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const todayStart = getEasternStartOfDay();
    const todayEnd = getEasternEndOfDay();
    const dateFilter = { createdAt: { $gte: todayStart, $lte: todayEnd } };

    // Apply organization filter for non-superadmin
    let orgFilter = {};
    if (req.user.role === 'admin') {
      orgFilter = { organization: req.user.organization };
    }

    const baseFilter = { ...orgFilter, ...dateFilter };

    const [total, qualified, notQualified, pending, sale] = await Promise.all([
      Lead.countDocuments(baseFilter),
      Lead.countDocuments({ ...baseFilter, qualificationStatus: 'qualified' }),
      Lead.countDocuments({ ...baseFilter, qualificationStatus: { $in: ['not-qualified', 'disqualified', 'unqualified'] } }),
      Lead.countDocuments({ ...baseFilter, qualificationStatus: 'pending' }),
      Lead.countDocuments({ ...baseFilter, leadProgressStatus: { $in: ['SALE', 'Immediate Enrollment'] } })
    ]);

    const qualificationRate = (qualified + notQualified) > 0
      ? parseFloat(((qualified / (qualified + notQualified)) * 100).toFixed(1))
      : 0;

    res.json({
      success: true,
      data: { total, qualified, notQualified, pending, sale, qualificationRate }
    });
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// @desc    Get single lead
// @route   GET /api/leads/:id
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const lead = await Lead.findByLeadId(req.params.id)
      .populate('createdBy', 'name email organization')
      .populate('updatedBy', 'name email')
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('disposedBy', 'name email');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Role-based access
    if (req.user.role === 'agent1' && lead.createdBy._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this lead'
      });
    }

    // Organization-based access for admin
    if (req.user.role === 'admin') {
      if (lead.createdBy.organization.toString() !== req.user.organization.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to view leads from other organizations'
        });
      }
    }
    // SuperAdmin and Agent2 can view any lead (existing behavior)

    res.status(200).json({
      success: true,
      data: { lead }
    });

  } catch (error) {
    console.error('Get lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Create new lead
// @route   POST /api/leads
// @access  Private (Agent1, Agent2, Admin)
router.post('/', protect, createLeadValidation, handleValidationErrors, async (req, res) => {
  try {
    console.log('Create lead request body:', req.body);
    console.log('Create lead request user:', req.user ? req.user.role : 'No user');
    console.log('Create lead request user ID:', req.user ? req.user._id : 'No user ID');
    
    // Check if user has permission (agent1, agent2, or admin)
    if (req.user && !['agent1', 'agent2', 'admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to create leads`
      });
    }
    
    const leadData = {
      ...req.body,
      source: req.body.source && req.body.source.trim() !== '' ? req.body.source : 'Personal Debt',
      createdBy: req.user._id,
      organization: req.user.organization
    };

    const organizationName = await getOrganizationNameById(req.user.organization);
    const isGtiOrg = isGtiOrganizationName(organizationName);
    const dispositionText = typeof req.body.disposition1 === 'string' ? req.body.disposition1.trim() : '';
    const hasDisposition = dispositionText.length > 0;
    const shouldDisposeLead = Boolean(hasDisposition && req.body.isDisposed === true);

    if ((req.body.isDisposed || shouldDisposeLead) && !hasDisposition) {
      return res.status(400).json({
        success: false,
        message: 'Disposition reason is required when disposing a lead'
      });
    }

    // draftDate is a GTI-only field
    if (isGtiOrg) {
      if (req.body.draftDate) {
        const parsedDraftDate = parseDraftDateInput(req.body.draftDate);
        if (!parsedDraftDate) {
          return res.status(400).json({
            success: false,
            message: 'Draft date must be dd/mm/yyyy or a valid ISO date'
          });
        }
        leadData.draftDate = parsedDraftDate;
      } else {
        delete leadData.draftDate;
      }
    } else {
      delete leadData.draftDate;
    }

    // Disposal logic applies to all orgs
    if (shouldDisposeLead) {
      leadData.disposition1 = dispositionText;
      leadData.isDisposed = true;
      leadData.disposedBy = req.user._id;
      leadData.status = 'Dead';
      delete leadData.assignedTo;
      delete leadData.assignedBy;
      delete leadData.assignedAt;
    } else {
      delete leadData.disposition1;
      leadData.isDisposed = false;
      delete leadData.disposedBy;
    }

    // Auto-assign to Agent2 if they are creating the lead and it is not immediately disposed
    if (req.user.role === 'agent2' && !leadData.isDisposed) {
      leadData.assignedTo = req.user._id;
      leadData.assignedBy = req.user._id;
      leadData.assignedAt = new Date();
      console.log('Auto-assigning lead to Agent2:', req.user._id);
    }

    console.log('Creating lead with data:', leadData);

    const lead = await Lead.create(leadData);
    
    console.log('Lead created successfully:', lead._id);
    console.log('Saved lead data:', JSON.stringify(lead, null, 2));

    if (isGtiOrg) {
      await syncLeadWithInboundCall(lead);

      if (shouldDisposeLead && req.user.role === 'agent1' && !lead.isDuplicate) {
        await sendGTIPostback({
          lead,
          eventType: 'dispose',
          trigger: 'lead-create-agent1-dispose',
        });
      }
    }
    
    // Set duplicate detection user if it's a duplicate
    if (lead.isDuplicate) {
      lead.duplicateDetectedBy = req.user._id;
      await lead.save();
    }
    
    // Populate the created lead
    await lead.populate('createdBy', 'name email');
    if (lead.assignedTo) {
      await lead.populate('assignedTo', 'name email');
    }
    if (lead.disposedBy) {
      await lead.populate('disposedBy', 'name email role');
    }
    if (lead.duplicateOf) {
      await lead.populate('duplicateOf', 'leadId name email phone');
    }

    // Emit real-time update
    if (req.io) {
      const eventData = {
        lead: lead,
        createdBy: req.user.name,
        assignedTo: lead.assignedTo ? lead.assignedTo.name : null,
        isDuplicate: lead.isDuplicate,
        duplicateInfo: lead.isDuplicate ? {
          duplicateOf: lead.duplicateOf,
          duplicateReason: lead.duplicateReason
        } : null
      };
      
      req.io.emit('leadCreated', eventData);
      // Also emit to specific rooms
      req.io.to('admin').emit('leadCreated', eventData);
      req.io.to('superadmin').emit('leadCreated', eventData);
      req.io.to('agent2').emit('leadCreated', eventData);
      
      // Special notification for duplicates
      if (lead.isDuplicate) {
        req.io.to('admin').emit('duplicateLeadDetected', eventData);
        req.io.to('superadmin').emit('duplicateLeadDetected', eventData);
        req.io.to('agent2').emit('duplicateLeadDetected', eventData);
      }
    }

    const successMessage = req.user.role === 'agent2' 
      ? (lead.isDuplicate 
        ? `Lead created and auto-assigned to you, but marked as duplicate (${lead.duplicateReason} match found)`
        : 'Lead created and auto-assigned to you successfully!')
      : (lead.isDuplicate 
        ? `Lead created successfully but marked as duplicate (${lead.duplicateReason} match found)`
        : 'Lead created successfully');

    res.status(201).json({
      success: true,
      message: successMessage,
      data: { 
        lead,
        status: lead.status,
        isDisposed: lead.isDisposed,
        disposition1: lead.disposition1 || null,
        disposedBy: lead.disposedBy || null,
        isDuplicate: lead.isDuplicate,
        duplicateInfo: lead.isDuplicate ? {
          duplicateOf: lead.duplicateOf,
          duplicateReason: lead.duplicateReason,
          duplicateDetectedAt: lead.duplicateDetectedAt
        } : null
      }
    });

  } catch (error) {
    console.error('Create lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update lead status
// @route   PUT /api/leads/:id
// @access  Private (Agent1 for own leads, Agent2, Admin)
router.put('/:id', protect, updateLeadValidation, handleValidationErrors, async (req, res) => {
  try {
    console.log('Update request body:', req.body);
    console.log('Update request user:', req.user ? req.user.role : 'No user');
    console.log('Update request user ID:', req.user ? req.user._id : 'No user ID');
    console.log('Lead ID to update:', req.params.id);
    
    // Use findById for MongoDB _id or findByLeadId for custom leadId
    let lead;
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      // It's a MongoDB ObjectId
      lead = await Lead.findById(req.params.id).populate('createdBy', 'organization');
    } else {
      // It's a custom leadId
      lead = await Lead.findByLeadId(req.params.id).populate('createdBy', 'organization');
    }

    if (!lead) {
      console.log('Lead not found with ID:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    console.log('Found lead:', lead.leadId || lead._id);
    console.log('Lead createdBy:', lead.createdBy);
    console.log('Current user role:', req.user.role);
    console.log('Current user ID:', req.user._id);

    // Check permissions based on user role
    if (req.user.role === 'agent1') {
      console.log('User is agent1, checking if they created this lead...');
      // Agent1 can only update their own leads
      if (lead.createdBy._id.toString() !== req.user._id.toString()) {
        console.log('Agent1 trying to update lead they did not create');
        return res.status(403).json({
          success: false,
          message: 'Agent1 can only update leads they created'
        });
      }
      console.log('Agent1 authorized to update their own lead');
    } else if (req.user.role === 'admin') {
      console.log('User is admin, checking organization access...');
      // Get admin's organization
      const adminOrganization = await Organization.findById(req.user.organization);
      
      if (adminOrganization && adminOrganization.name === 'REDDINGTON GLOBAL CONSULTANCY') {
        // REDDINGTON GLOBAL CONSULTANCY Admin can update leads from all organizations
        console.log('REDDINGTON GLOBAL CONSULTANCY Admin authorized to update any lead');
      } else {
        // Other organization admins can only VIEW leads from their organization (no update access)
        return res.status(403).json({
          success: false,
          message: 'Only REDDINGTON GLOBAL CONSULTANCY admins can update leads'
        });
      }
    } else if (['agent2', 'superadmin'].includes(req.user.role)) {
      console.log('User is agent2/superadmin, authorized to update leads');
    } else {
      console.log('User role not authorized:', req.user.role);
      return res.status(403).json({
        success: false,
        message: `User role ${req.user.role} is not authorized to update leads`
      });
    }

    const wasDisposed = Boolean(lead.isDisposed);
    const previousProgressStatus = lead.leadProgressStatus || null;
    const progressStatusProvided = Object.prototype.hasOwnProperty.call(req.body, 'leadProgressStatus');

    // Define which fields each role can update
    let allowedFields = [];
    
    if (req.user.role === 'agent1') {
      // Agent1 can update basic lead information but not status fields
      allowedFields = [
        'name', 'email', 'phone', 'alternatePhone', 'debtCategory', 'debtTypes',
        'totalDebtAmount', 'numberOfCreditors', 'monthlyDebtPayment', 'creditScore', 'creditScoreRange',
        'address', 'city', 'state', 'zipcode', 'notes', 'company', 'source'
      ];
    } else if (req.user.role === 'admin') {
      // Check if admin is from REDDINGTON GLOBAL CONSULTANCY
      const adminOrganization = await Organization.findById(req.user.organization);
      
      if (adminOrganization && adminOrganization.name === 'REDDINGTON GLOBAL CONSULTANCY') {
        // REDDINGTON GLOBAL CONSULTANCY Admin can update ALL fields
        allowedFields = [
          // Basic lead information
          'name', 'email', 'phone', 'alternatePhone', 'debtCategory', 'debtTypes',
          'totalDebtAmount', 'numberOfCreditors', 'monthlyDebtPayment', 'creditScore', 'creditScoreRange',
          'address', 'city', 'state', 'zipcode', 'notes', 'company', 'source', 'category', 'completionPercentage',
          // Status fields
          'status', 'leadStatus', 'contactStatus', 'qualificationOutcome', 
          'callDisposition', 'engagementOutcome', 'disqualification',
          'followUpDate', 'followUpTime', 'followUpNotes', 'conversionValue', 'requestedLoanAmount',
          'leadProgressStatus', 'agent2LastAction', 'lastUpdatedBy', 'lastUpdatedAt',
          'qualificationStatus', 'assignmentNotes', 'clientId'
        ];
      } else {
        // Other organization admins have limited update access
        allowedFields = [
          'status', 'leadStatus', 'contactStatus', 'qualificationOutcome', 
          'callDisposition', 'engagementOutcome', 'disqualification',
          'followUpDate', 'followUpTime', 'followUpNotes', 'conversionValue', 'requestedLoanAmount',
          'leadProgressStatus', 'agent2LastAction', 'lastUpdatedBy', 'lastUpdatedAt',
          'qualificationStatus', 'clientId'
        ];
      }
    } else if (['agent2', 'superadmin'].includes(req.user.role)) {
      // Agent2 and superadmin can update all fields
      allowedFields = [
        // Basic lead information
        'name', 'email', 'phone', 'alternatePhone', 'debtCategory', 'debtTypes',
        'totalDebtAmount', 'numberOfCreditors', 'monthlyDebtPayment', 'creditScore', 'creditScoreRange',
        'address', 'city', 'state', 'zipcode', 'notes', 'company', 'source', 'category', 'completionPercentage',
        // Status fields
        'status', 'leadStatus', 'contactStatus', 'qualificationOutcome', 
        'callDisposition', 'engagementOutcome', 'disqualification',
        'followUpDate', 'followUpTime', 'followUpNotes', 'conversionValue', 'requestedLoanAmount',
        'leadProgressStatus', 'agent2LastAction', 'lastUpdatedBy', 'lastUpdatedAt',
        'qualificationStatus', 'assignmentNotes', 'clientId'
      ];
    }

    // Update allowed fields
    console.log('Allowed fields for', req.user.role, ':', allowedFields);
    console.log('Fields in request body:', Object.keys(req.body));
    
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) {
        console.log(`Updating ${field} from "${lead[field]}" to:`, req.body[field]);
        lead[field] = req.body[field];
      }
    });

    const organizationId = lead.organization || (lead.createdBy && lead.createdBy.organization);
    const organizationName = await getOrganizationNameById(organizationId);
    const isGtiOrg = isGtiOrganizationName(organizationName);
    const hasDispositionField = Object.prototype.hasOwnProperty.call(req.body, 'disposition1');
    const hasIsDisposedField = Object.prototype.hasOwnProperty.call(req.body, 'isDisposed');
    const hasDraftDateField = Object.prototype.hasOwnProperty.call(req.body, 'draftDate');
    const canEditDraftDate = ['agent2', 'admin', 'superadmin'].includes(req.user.role);
    let normalizedDispositionInput;

    if (isGtiOrg && hasDispositionField) {
      const rawDisposition = typeof req.body.disposition1 === 'string' ? req.body.disposition1.trim() : '';
      normalizedDispositionInput = rawDisposition;

      if (rawDisposition) {
        lead.disposition1 = rawDisposition;
      } else {
        if (lead.isDisposed && !hasIsDisposedField) {
          return res.status(400).json({
            success: false,
            message: 'Remove the dispose flag before clearing the disposition reason'
          });
        }
        lead.disposition1 = undefined;
      }
    }

    if (isGtiOrg && hasIsDisposedField) {
      const shouldDispose = req.body.isDisposed === true;
      const effectiveDisposition = typeof normalizedDispositionInput === 'string'
        ? normalizedDispositionInput
        : (typeof lead.disposition1 === 'string' ? lead.disposition1.trim() : '');

      if (shouldDispose && !effectiveDisposition) {
        return res.status(400).json({
          success: false,
          message: 'Disposition reason is required when disposing a lead'
        });
      }

      if (shouldDispose) {
        lead.isDisposed = true;
        lead.disposedBy = req.user._id;
        lead.status = 'Dead';
        lead.assignedTo = undefined;
        lead.assignedBy = undefined;
        lead.assignedAt = undefined;
      } else {
        lead.isDisposed = false;
        lead.disposedBy = undefined;
      }
    } else if (!isGtiOrg && (hasDispositionField || hasIsDisposedField)) {
      console.log('Ignoring GTI-only disposition fields for non-GTI organization lead:', lead._id);
    }

    if (hasDraftDateField) {
      if (!isGtiOrg) {
        console.log('Ignoring draft date update for non-GTI organization lead:', lead._id);
      } else if (!canEditDraftDate) {
        return res.status(403).json({
          success: false,
          message: 'Only Agent2 or Admin users can update the draft date'
        });
      } else {
        const incomingDraftDate = req.body.draftDate;
        if (incomingDraftDate === null || incomingDraftDate === '' || incomingDraftDate === undefined) {
          lead.draftDate = undefined;
        } else {
          const parsedDraftDate = parseDraftDateInput(incomingDraftDate);
          if (!parsedDraftDate) {
            return res.status(400).json({
              success: false,
              message: 'Draft date must be dd/mm/yyyy or a valid ISO date'
            });
          }
          lead.draftDate = parsedDraftDate;
        }
      }
    }

    // Set update tracking fields
    lead.lastUpdatedBy = req.user.name || req.user.email;
    lead.lastUpdatedAt = getEasternNow();

    // Mark as admin processed if updated by admin or superadmin
    if (['admin', 'superadmin'].includes(req.user.role)) {
      lead.adminProcessed = true;
      lead.adminProcessedAt = getEasternNow();
    }

    lead.updatedBy = req.user._id;
    await lead.save();

    console.log('Lead saved successfully');

    const isNowDisposed = Boolean(lead.isDisposed);
    const currentProgressStatus = lead.leadProgressStatus || null;

    if (isGtiOrg && req.user.role === 'agent1' && !wasDisposed && isNowDisposed && lead.disposition1) {
      await sendGTIPostback({
        lead,
        eventType: 'dispose',
        trigger: 'lead-update-agent1-dispose',
      });
    }

    const shouldSendProgressPostback = Boolean(
      isGtiOrg &&
      currentProgressStatus &&
      (
        previousProgressStatus !== currentProgressStatus ||
        (progressStatusProvided && previousProgressStatus === currentProgressStatus)
      )
    );

    if (shouldSendProgressPostback) {
      await sendGTIPostback({
        lead,
        eventType: 'progress',
        trigger: 'lead-update-progress',
      });
    }

    // Populate the updated lead
    await lead.populate(['createdBy updatedBy', 'name email']);

    // Emit real-time update
    if (req.io) {
      req.io.emit('leadUpdated', {
        lead: lead,
        updatedBy: req.user.name
      });
      // Also emit to specific rooms
      req.io.to('admin').emit('leadUpdated', {
        lead: lead,
        updatedBy: req.user.name
      });
      req.io.to('agent2').emit('leadUpdated', {
        lead: lead,
        updatedBy: req.user.name
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lead updated successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('Update lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Delete lead
// @route   DELETE /api/leads/:id
// @access  Private (Admin and SuperAdmin)
router.delete('/:id', protect, authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const lead = await Lead.findByLeadId(req.params.id).populate('createdBy');

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check if admin can access this lead (organization-based access control)
    if (req.user.role === 'admin') {
      if (lead.createdBy.organization.toString() !== req.user.organization.toString()) {
        return res.status(403).json({
          success: false,
          message: 'You can only delete leads from your organization'
        });
      }
    }
    // SuperAdmin can delete any lead (no additional check needed)

    await Lead.findOneAndDelete({ leadId: req.params.id });

    // Emit real-time update
    req.io.emit('leadDeleted', {
      leadId: req.params.id,
      deletedBy: req.user.name
    });
    // Also emit to specific rooms
    req.io.to('admin').emit('leadDeleted', {
      leadId: req.params.id,
      deletedBy: req.user.name
    });
    req.io.to('agent2').emit('leadDeleted', {
      leadId: req.params.id,
      deletedBy: req.user.name
    });

    res.status(200).json({
      success: true,
      message: 'Lead deleted successfully'
    });

  } catch (error) {
    console.error('Delete lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Assign lead to Agent2
// @route   POST /api/leads/:id/assign
// @access  Private (Agent1 only)
router.post('/:id/assign', protect, [
  body('assignedTo')
    .isMongoId()
    .withMessage('Valid Agent ID is required'),
  body('assignmentNotes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Assignment notes cannot exceed 500 characters')
], handleValidationErrors, async (req, res) => {
  try {
    if (req.user.role !== 'agent1') {
      return res.status(403).json({
        success: false,
        message: 'Only Agent1 can assign leads'
      });
    }

    const { assignedTo, assignmentNotes } = req.body;

    // Find the lead
    const lead = await Lead.findByLeadId(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check if Agent1 owns this lead
    if (lead.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only assign leads you created'
      });
    }

    const leadStatus = (lead.status || '').toLowerCase();
    if (lead.isDisposed || leadStatus === 'dead') {
      return res.status(400).json({
        success: false,
        message: 'Disposed leads cannot be assigned'
      });
    }

    // Check if lead is already assigned
    if (lead.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Lead is already assigned'
      });
    }

    // Verify the assigned agent exists and is Agent2
    const assignedAgent = await User.findById(assignedTo).populate('organization');
    if (!assignedAgent) {
      return res.status(404).json({
        success: false,
        message: 'Assigned agent not found'
      });
    }

    if (assignedAgent.role !== 'agent2') {
      return res.status(400).json({
        success: false,
        message: 'Can only assign to Agent2 users'
      });
    }

    // Get current user's organization
    const currentUserWithOrg = await User.findById(req.user._id).populate('organization');
    const mainOrgName = 'REDDINGTON GLOBAL CONSULTANCY';
    
    // Check assignment rules based on organization
    if (currentUserWithOrg.organization.name === mainOrgName) {
      // Main organization Agent1 can only assign to Agent2 in same organization
      if (assignedAgent.organization._id.toString() !== req.user.organization.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Can only assign to agents in the same organization'
        });
      }
    } else {
      // Other organizations' Agent1 can only assign to Agent2 of main organization
      if (assignedAgent.organization.name !== mainOrgName) {
        return res.status(400).json({
          success: false,
          message: `Agent1 from other organizations can only assign leads to Agent2 of ${mainOrgName}`
        });
      }
    }

    // Assign the lead
    lead.assignedTo = assignedTo;
    lead.assignedBy = req.user._id;
    lead.assignedAt = getEasternNow();
    lead.assignmentNotes = assignmentNotes || '';
    lead.updatedBy = req.user._id;
    
    // Set initial status for persistent tracking
    lead.qualificationStatus = 'pending';
    lead.leadProgressStatus = 'Callback Needed';
    lead.lastUpdatedBy = req.user.name;
    lead.lastUpdatedAt = getEasternNow();

    await lead.save();

    // Populate the updated lead
    await lead.populate(['createdBy updatedBy assignedTo assignedBy', 'name email']);

    // Emit real-time update
    if (req.io) {
      req.io.emit('leadAssigned', {
        lead: lead,
        assignedBy: req.user.name,
        assignedTo: assignedAgent.name
      });
      // Emit to specific rooms
      req.io.to('admin').emit('leadAssigned', {
        lead: lead,
        assignedBy: req.user.name,
        assignedTo: assignedAgent.name
      });
      req.io.to(`user_${assignedTo}`).emit('leadAssigned', {
        lead: lead,
        assignedBy: req.user.name,
        assignedTo: assignedAgent.name
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lead assigned successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('Assign lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Error assigning lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Unassign lead (remove assignment)
// @route   POST /api/leads/:id/unassign
// @access  Private (Agent1 only - for their own leads)
router.post('/:id/unassign', protect, async (req, res) => {
  try {
    if (req.user.role !== 'agent1') {
      return res.status(403).json({
        success: false,
        message: 'Only Agent1 can unassign leads'
      });
    }

    const lead = await Lead.findByLeadId(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check if Agent1 owns this lead
    if (lead.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only unassign leads you created'
      });
    }

    if (!lead.assignedTo) {
      return res.status(400).json({
        success: false,
        message: 'Lead is not assigned'
      });
    }

    // Store the previous assignment info for notification
    const previousAssignedTo = lead.assignedTo;

    // Unassign the lead
    lead.assignedTo = null;
    lead.assignedBy = null;
    lead.assignedAt = null;
    lead.assignmentNotes = '';
    lead.updatedBy = req.user._id;

    await lead.save();

    // Populate the updated lead
    await lead.populate(['createdBy updatedBy', 'name email']);

    // Emit real-time update
    if (req.io) {
      req.io.emit('leadUnassigned', {
        lead: lead,
        unassignedBy: req.user.name
      });
      // Emit to specific rooms
      req.io.to('admin').emit('leadUnassigned', {
        lead: lead,
        unassignedBy: req.user.name
      });
      req.io.to(`user_${previousAssignedTo}`).emit('leadUnassigned', {
        lead: lead,
        unassignedBy: req.user.name
      });
    }

    res.status(200).json({
      success: true,
      message: 'Lead unassigned successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('Unassign lead error:', error);
    res.status(500).json({
      success: false,
      message: 'Error unassigning lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get dashboard statistics
// @route   GET /api/leads/dashboard/stats
// @access  Private (All authenticated users)
router.get('/dashboard/stats', protect, async (req, res) => {
  try {
    const { role, _id: userId } = req.user;
    
    let filter = {};
    
    // Apply filters based on user role
    if (role === 'agent1') {
      filter = { assignedAgent: userId, status: { $in: ['new', 'contacted', 'qualified'] } };
    } else if (role === 'agent2') {
      filter = { assignedAgent: userId, status: { $in: ['follow-up', 'converted', 'closed'] } };
    }
    // Admin sees all data (no filter applied)

    // Get basic statistics
    let stats;
    if (role === 'superadmin') {
      // SuperAdmin sees all data from all organizations
      stats = await Lead.getStatistics();
      
      // Get active agents count for superadmin
      const User = require('../models/User');
      const activeAgents = await User.countDocuments({ 
        role: { $in: ['agent1', 'agent2'] },
        isActive: { $ne: false } // Count users who are not explicitly inactive
      });
      stats.activeAgents = activeAgents;
    } else if (role === 'admin') {
      // Check if this admin belongs to REDDINGTON (same logic as the main leads list endpoint).
      // REDDINGTON admin can see all organizations; other admins see only their own org.
      const adminOrganization = await Organization.findById(req.user.organization).select('name').lean();
      const isReddingtonAdmin = adminOrganization && adminOrganization.name === 'REDDINGTON GLOBAL CONSULTANCY';
      const orgFilter = isReddingtonAdmin ? {} : { organization: req.user.organization };

      // Use single aggregation pipeline for better performance
      const aggregationResults = await Lead.aggregate([
        { $match: orgFilter },
        {
          $facet: {
            total: [{ $count: 'count' }],
            byStatus: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            byQualification: [
              { $group: { _id: '$qualificationStatus', count: { $sum: 1 } } }
            ],
            sales: [
              { $match: { leadProgressStatus: { $in: ['SALE', 'Immediate Enrollment'] } } },
              { $count: 'count' }
            ]
          }
        }
      ]);

      const results = aggregationResults[0];
      const total = results.total[0]?.count || 0;
      
      const statusMap = {};
      results.byStatus.forEach(item => {
        statusMap[item._id] = item.count;
      });
      
      const qualMap = {};
      results.byQualification.forEach(item => {
        qualMap[item._id] = item.count;
      });
      
      const newLeads = statusMap.new || 0;
      const qualified = qualMap.qualified || 0;
      const notQualified = (qualMap['not-qualified'] || 0) + (qualMap.disqualified || 0) + (qualMap.unqualified || 0);
      const pending = qualMap.pending || 0;
      const followUp = statusMap['follow-up'] || 0;
      const converted = statusMap.converted || 0;
      const closed = statusMap.closed || 0;
      const immediateEnrollment = results.sales[0]?.count || 0;

      // REDDINGTON admin sees all agents; other admins see only their org's agents
      const agentFilter = isReddingtonAdmin
        ? { role: { $in: ['agent1', 'agent2'] }, isActive: { $ne: false } }
        : { organization: req.user.organization, role: { $in: ['agent1', 'agent2'] }, isActive: { $ne: false } };
      const activeAgents = await User.countDocuments(agentFilter);

      // Calculate conversion rate: (SALE calls ÷ Qualified leads) × 100
      const conversionRate = qualified > 0 ? ((immediateEnrollment / qualified) * 100).toFixed(2) : 0;

      stats = {
        totalLeads: total,
        newLeads,
        qualified,
        qualifiedLeads: qualified,
        notQualifiedLeads: notQualified,
        pendingLeads: pending,
        followUp,
        converted,
        closed,
        immediateEnrollmentLeads: immediateEnrollment,
        conversionRate: conversionRate,
        activeAgents
      };
    } else {
      // Get filtered stats for agents
      const [total, newLeads, qualified, notQualified, pending, followUp, converted, closed, immediateEnrollment] = await Promise.all([
        Lead.countDocuments(filter),
        Lead.countDocuments({ ...filter, status: 'new' }),
        Lead.countDocuments({ ...filter, qualificationStatus: 'qualified' }),
        Lead.countDocuments({ ...filter, qualificationStatus: { $in: ['not-qualified', 'disqualified', 'unqualified'] } }),
        Lead.countDocuments({ ...filter, qualificationStatus: 'pending' }),
        Lead.countDocuments({ ...filter, status: 'follow-up' }),
        Lead.countDocuments({ ...filter, status: 'converted' }),
        Lead.countDocuments({ ...filter, status: 'closed' }),
        Lead.countDocuments({ ...filter, leadProgressStatus: { $in: ['SALE', 'Immediate Enrollment'] } })
      ]);

      // Calculate conversion rate: (SALE calls ÷ Qualified leads) × 100
      const conversionRate = qualified > 0 ? ((immediateEnrollment / qualified) * 100).toFixed(2) : 0;

      stats = {
        totalLeads: total,
        newLeads,
        qualified,
        qualifiedLeads: qualified,
        notQualifiedLeads: notQualified,
        pendingLeads: pending,
        followUp,
        converted,
        closed,
        immediateEnrollmentLeads: immediateEnrollment,
        conversionRate: conversionRate
      };
    }

    // Get additional time-based statistics using Eastern Time
    const { today, thisWeek, thisMonth } = getEasternTimeRanges();

    const timeFilters = [
      { createdAt: { $gte: today }, ...filter },
      { createdAt: { $gte: thisWeek }, ...filter },
      { createdAt: { $gte: thisMonth }, ...filter }
    ];

    const [todayStats, weekStats, monthStats] = await Promise.all([
      Lead.countDocuments(timeFilters[0]),
      Lead.countDocuments(timeFilters[1]),
      Lead.countDocuments(timeFilters[2])
    ]);

    // Get follow-up leads for today
    const { todayEnd } = getEasternTimeRanges();
    
    const todayFollowUps = await Lead.countDocuments({
      followUpDate: {
        $gte: today,
        $lt: todayEnd
      },
      ...filter
    });

    const response = {
      ...stats,
      todayLeads: todayStats,
      weekLeads: weekStats,
      monthLeads: monthStats,
      todayFollowUps,
      userRole: role,
      lastUpdated: formatEasternTime(getEasternNow())
    };

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get upcoming follow-ups
// @route   GET /api/leads/follow-ups
// @access  Private (Agent2, Admin)
router.get('/dashboard/follow-ups', protect, authorize('agent2', 'admin'), async (req, res) => {
  try {
    const { today } = getEasternTimeRanges();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);

    const followUps = await Lead.find({
      status: 'follow-up',
      followUpDate: { $gte: today, $lte: nextWeek }
    })
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name email')
    .sort({ followUpDate: 1, followUpTime: 1 });

    res.status(200).json({
      success: true,
      data: { followUps }
    });

  } catch (error) {
    console.error('Get follow-ups error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching follow-ups',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Reassign lead to another agent
// @route   PUT /api/leads/:id/reassign
// @access  Private (Admin of REDDINGTON GLOBAL CONSULTANCY only)
router.put('/:id/reassign', protect, [
  body('assignedTo')
    .notEmpty()
    .withMessage('assignedTo is required')
    .isMongoId()
    .withMessage('assignedTo must be a valid user ID'),
  body('assignmentNotes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Assignment notes cannot exceed 500 characters')
], handleValidationErrors, async (req, res) => {
  try {
    console.log('Reassign request body:', req.body);
    console.log('Reassign request user:', req.user ? req.user.role : 'No user');
    console.log('Lead ID to reassign:', req.params.id);

    // Check if user is admin of REDDINGTON GLOBAL CONSULTANCY
    if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can reassign leads'
      });
    }

    // For admin role, check if they're from REDDINGTON GLOBAL CONSULTANCY
    if (req.user.role === 'admin') {
      const adminOrganization = await Organization.findById(req.user.organization);
      if (!adminOrganization || adminOrganization.name !== 'REDDINGTON GLOBAL CONSULTANCY') {
        return res.status(403).json({
          success: false,
          message: 'Only REDDINGTON GLOBAL CONSULTANCY admins can reassign leads'
        });
      }
    }

    // Find the lead
    let lead;
    if (req.params.id.match(/^[0-9a-fA-F]{24}$/)) {
      lead = await Lead.findById(req.params.id).populate('assignedTo createdBy', 'name email');
    } else {
      lead = await Lead.findByLeadId(req.params.id).populate('assignedTo createdBy', 'name email');
    }

    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Verify the target user exists and is agent2
    const targetAgent = await User.findById(req.body.assignedTo);
    if (!targetAgent) {
      return res.status(404).json({
        success: false,
        message: 'Target agent not found'
      });
    }

    if (targetAgent.role !== 'agent2') {
      return res.status(400).json({
        success: false,
        message: 'Can only reassign leads to Agent 2 users'
      });
    }

    if (!targetAgent.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Cannot assign lead to inactive agent'
      });
    }

    // Update lead assignment
    const previousAssignedTo = lead.assignedTo;
    lead.assignedTo = req.body.assignedTo;
    lead.assignedBy = req.user._id;
    lead.assignedAt = getEasternNow();
    lead.assignmentNotes = req.body.assignmentNotes || '';
    
    // Update tracking fields
    lead.lastUpdatedBy = req.user.name || req.user.email;
    lead.lastUpdatedAt = getEasternNow();
    lead.updatedBy = req.user._id;

    // EXPLICITLY clear adminProcessed flag when reassigning - Agent 2 needs to work on it
    // This ensures old leads with adminProcessed=true become visible to Agent 2
    lead.adminProcessed = false;

    await lead.save();

    // Populate the updated lead
    await lead.populate(['assignedTo assignedBy createdBy updatedBy', 'name email']);

    console.log('Lead reassigned successfully from', 
      previousAssignedTo ? previousAssignedTo.name : 'unassigned', 
      'to', targetAgent.name);

    // Emit real-time update
    if (req.io) {
      const updateData = {
        lead: lead,
        reassignedBy: req.user.name,
        previousAgent: previousAssignedTo ? previousAssignedTo.name : 'Unassigned',
        newAgent: targetAgent.name
      };

      req.io.emit('leadReassigned', updateData);
      // Emit to specific rooms
      req.io.to('admin').emit('leadReassigned', updateData);
      req.io.to('agent2').emit('leadReassigned', updateData);
      
      // Notify the specific agents if they're online
      if (previousAssignedTo) {
        req.io.to(`user_${previousAssignedTo._id}`).emit('leadReassigned', updateData);
      }
      req.io.to(`user_${targetAgent._id}`).emit('leadReassigned', updateData);
    }

    res.status(200).json({
      success: true,
      message: `Lead successfully reassigned to ${targetAgent.name}`,
      lead: lead,
      reassignmentDetails: {
        previousAgent: previousAssignedTo ? previousAssignedTo.name : 'Unassigned',
        newAgent: targetAgent.name,
        reassignedBy: req.user.name || req.user.email,
        reassignedAt: lead.assignedAt
      }
    });

  } catch (error) {
    console.error('Lead reassignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Error reassigning lead',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @route   PUT /api/leads/:id/qualification-status
// @desc    Update lead qualification status (Agent2 only)
// @access  Private
router.put('/:id/qualification-status', protect, [
  body('qualificationStatus')
    .isIn(['qualified', 'not-qualified', 'pending'])
    .withMessage('Invalid qualification status')
], handleValidationErrors, async (req, res) => {
  try {
    if (req.user.role !== 'agent2') {
      return res.status(403).json({
        success: false,
        message: 'Only Agent2 can update qualification status'
      });
    }

    const { qualificationStatus, updatedBy } = req.body;

    // Find the lead
    const lead = await Lead.findByLeadId(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    // Check if lead is assigned to this Agent2
    if (!lead.assignedTo || lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update leads assigned to you'
      });
    }

    // Update qualification status
    lead.qualificationStatus = qualificationStatus;
    lead.lastUpdatedBy = updatedBy || req.user.name;
    lead.lastUpdatedAt = getEasternNow();
    lead.updatedBy = req.user._id;

    await lead.save();

    // Populate the updated lead
    await lead.populate(['createdBy updatedBy assignedTo assignedBy', 'name email']);

    // Emit real-time update
    if (req.io) {
      req.io.emit('leadUpdated', {
        lead: lead,
        updatedBy: req.user.name,
        updateType: 'qualification_status'
      });
    }

    res.json({
      success: true,
      message: 'Qualification status updated successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('Qualification status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating qualification status',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @route   PUT /api/leads/:id/progress-status
// @desc    Update lead progress status (Agent2 only)
// @access  Private
router.put('/:id/progress-status', protect, [
  body('leadProgressStatus')
    .notEmpty()
    .withMessage('Progress status is required')
], handleValidationErrors, async (req, res) => {
  try {
    if (req.user.role !== 'agent2') {
      return res.status(403).json({
        success: false,
        message: 'Only Agent2 can update progress status'
      });
    }

    const { leadProgressStatus, updatedBy } = req.body;

    // Find the lead
    const lead = await Lead.findByLeadId(req.params.id);
    if (!lead) {
      return res.status(404).json({
        success: false,
        message: 'Lead not found'
      });
    }

    const organizationName = await getOrganizationNameById(lead.organization);
    const isGtiOrg = isGtiOrganizationName(organizationName);
    const previousProgressStatus = lead.leadProgressStatus || null;

    // Check if lead is assigned to this Agent2
    if (!lead.assignedTo || lead.assignedTo.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only update leads assigned to you'
      });
    }

    // Update progress status
    lead.leadProgressStatus = leadProgressStatus;
    lead.lastUpdatedBy = updatedBy || req.user.name;
    lead.lastUpdatedAt = getEasternNow();
    lead.updatedBy = req.user._id;

    await lead.save();

    if (isGtiOrg && lead.leadProgressStatus) {
      await sendGTIPostback({
        lead,
        eventType: 'progress',
        trigger: 'lead-progress-status-agent2',
      });
    }

    // Populate the updated lead
    await lead.populate(['createdBy updatedBy assignedTo assignedBy', 'name email']);

    // Emit real-time update
    if (req.io) {
      req.io.emit('leadUpdated', {
        lead: lead,
        updatedBy: req.user.name,
        updateType: 'progress_status'
      });
    }

    res.json({
      success: true,
      message: 'Progress status updated successfully',
      data: { lead }
    });

  } catch (error) {
    console.error('Progress status update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating progress status',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;

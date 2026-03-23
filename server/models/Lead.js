const mongoose = require('mongoose');
const { getEasternNow, getEasternStartOfDay, getEasternEndOfDay, formatEasternTime } = require('../utils/timeFilters');

const leadSchema = new mongoose.Schema({
  // Custom Lead ID
  leadId: {
    type: String,
    unique: true,
    sparse: true, // Allow multiple documents without leadId during creation
    validate: {
      validator: function(v) {
        if (!v) return true; // Allow empty during creation
        // Accept both old and new formats during transition
        const oldFormat = /^LEAD\d{8}$/; // Old: LEAD24091234
        const oldOrgFormat = /^ORG\d{11}$/; // Previous ORG format: ORG25091900001
        const newFormat = /^[A-Z]{3}\d{11}$/; // New: RED25092200001 (3 letters + 11 digits)
        return oldFormat.test(v) || oldOrgFormat.test(v) || newFormat.test(v);
      },
      message: 'Invalid Lead ID format. Expected {ORG_PREFIX}{YYMMDD}{NNNNN} (e.g., RED25092200001) or legacy formats'
    }
  },
  
  // Basic Information
  name: {
    type: String,
    required: [true, 'Lead name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // allow missing/undefined
        const str = String(v).trim();
        if (str === '') return true; // treat empty as not provided
        // Accept either +1XXXXXXXXXX or just XXXXXXXXXX format
        return /^(\+1)?\d{10}$/.test(str.replace(/[\s\-\(\)]/g, ''));
      },
      message: 'Phone number must be 10 digits with optional +1 prefix (e.g., +12345678901 or 2345678901)'
    }
  },
  alternatePhone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // allow missing/undefined
        const str = String(v).trim();
        if (str === '') return true; // treat empty as not provided
        // Accept either +1XXXXXXXXXX or just XXXXXXXXXX format
        return /^(\+1)?\d{10}$/.test(str.replace(/[\s\-\(\)]/g, ''));
      },
      message: 'Alternate phone number must be 10 digits with optional +1 prefix (e.g., +12345678901 or 2345678901)'
    }
  },

  // GTI integration metadata
  gtiCallUuid: {
    type: String,
    index: true,
  },
  gtiPrimaryPhone: {
    type: String,
    index: true,
  },
  gtiLastPostback: {
    type: Date,
  },
  gtiPostbackHistory: [{
    eventType: {
      type: String,
      enum: ['dispose', 'progress'],
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
    },
    responseStatus: {
      type: Number,
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    success: {
      type: Boolean,
      default: false,
    },
    attempt: {
      type: Number,
      default: 1,
    },
    errorMessage: {
      type: String,
    }
  }],
  
  // Debt Information
  debtCategory: {
    type: String,
    enum: ['secured', 'unsecured'],
    default: 'unsecured'
  },
  debtTypes: [{
    type: String,
    enum: [
      // Secured Debt Types
      'Mortgage Loans', 'Auto Loans', 'Secured Personal Loans', 'Home Equity Loans', 'Title Loans',
      // Unsecured Debt Types
      'Credit Cards', 'Instalment Loans (Unsecured)', 'Medical Bills', 'Utility Bills', 'Payday Loans',
      'Student Loans (private loan)', 'Store/Charge Cards', 'Overdraft Balances', 'Business Loans (unsecured)', 'Collection Accounts'
    ]
  }],
  totalDebtAmount: {
    type: Number,
    min: [0, 'Total debt amount cannot be negative']
  },
  numberOfCreditors: {
    type: Number,
    min: [0, 'Number of creditors cannot be negative']
  },
  monthlyDebtPayment: {
    type: Number,
    min: [0, 'Monthly debt payment cannot be negative']
  },
  creditScore: {
    type: Number,
    min: [0, 'Credit score cannot be negative'],
    max: [900, 'Credit score cannot exceed 900'],
    validate: {
      validator: function(v) {
        return !v || (Number.isInteger(v) && v >= 0 && v <= 900);
      },
      message: 'Credit score must be a whole number between 0 and 900'
    }
  },
  creditScoreRange: {
    type: String,
    enum: ['300-549', '550-649', '650-699', '700-749', '750-850']
  },
  
  // Lead Details
  notes: {
    type: String,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },

  // Address Information
  address: {
    type: String,
    trim: true,
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  city: {
    type: String,
    trim: true,
    maxlength: [100, 'City cannot exceed 100 characters']
  },
  state: {
    type: String,
    trim: true,
    maxlength: [50, 'State cannot exceed 50 characters']
  },
  zipcode: {
    type: String,
    trim: true,
    maxlength: [20, 'Zipcode cannot exceed 20 characters']
  },

  // Lead Categorization (Auto-calculated)
  category: {
    type: String,
    enum: ['hot', 'warm', 'cold'],
    default: 'cold'
  },
  completionPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },

  // Agent 2 Unified Progress Status
  leadProgressStatus: {
    type: String,
    validate: {
      validator: function(value) {
        if (!value || value.trim() === '') return true; // Allow empty values
        
        const predefinedStatuses = [
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
        
        // Allow predefined statuses or any custom string (for "Others" option and backward compatibility with old dispositions)
        return predefinedStatuses.includes(value) || (typeof value === 'string' && value.trim().length > 0);
      },
      message: 'Lead progress status must be a valid string'
    }
  },

  requestedLoanAmount: {
    type: Number,
    min: [0, 'Requested loan amount cannot be negative'],
    validate: {
      validator: function(value) {
        if (value === null || value === undefined) return true;
        return Number.isInteger(value);
      },
      message: 'Requested loan amount must be a whole number'
    }
  },

  disposition1: {
    type: String,
    trim: true,
    maxlength: [200, 'Disposition 1 cannot exceed 200 characters']
  },
  isDisposed: {
    type: Boolean,
    default: false
  },
  disposedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Lead Qualification Status (for admin filtering)
  // Supports backward compatibility: 'disqualified' and 'unqualified' from old data
  // New leads should use 'not-qualified'
  qualificationStatus: {
    type: String,
    enum: ['qualified', 'not-qualified', 'disqualified', 'unqualified', 'pending'],
    default: 'pending'
  },
  
  // Agent 2 Tracking Fields
  lastUpdatedBy: {
    type: String
  },
  lastUpdatedAt: {
    type: Date
  },
  
  // Follow-up Information
  followUpDate: {
    type: Date
  },
  followUpTime: {
    type: String
  },
  followUpNotes: {
    type: String,
    maxlength: [500, 'Follow-up notes cannot exceed 500 characters']
  },
  draftDate: {
    type: Date
  },

  // Tracking Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Organization Association
  organization: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    required: true
  },
  
  // Assignment Information
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedAt: {
    type: Date
  },
  assignmentNotes: {
    type: String,
    maxlength: [500, 'Assignment notes cannot exceed 500 characters']
  },
  
  // Conversion tracking
  convertedAt: {
    type: Date
  },
  conversionValue: {
    type: Number,
    min: 0
  },
  clientId: {
    type: String,
    trim: true
  },
  
  // Admin processing flag
  adminProcessed: {
    type: Boolean,
    default: false
  },
  adminProcessedAt: {
    type: Date
  },
  
  // Duplicate detection fields
  isDuplicate: {
    type: Boolean,
    default: false
  },
  duplicateOf: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Lead'
  },
  duplicateReason: {
    type: String,
    enum: ['email', 'phone', 'both'],
    required: function() {
      return this.isDuplicate;
    }
  },
  duplicateDetectedAt: {
    type: Date
  },
  duplicateDetectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes for better performance
leadSchema.index({ leadId: 1 }, { unique: true });
leadSchema.index({ createdBy: 1 });
leadSchema.index({ organization: 1 });
leadSchema.index({ assignedTo: 1 });
leadSchema.index({ assignedBy: 1 });
leadSchema.index({ status: 1 });
leadSchema.index({ category: 1 });
leadSchema.index({ qualificationStatus: 1 });
leadSchema.index({ leadProgressStatus: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ followUpDate: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ phone: 1 });
leadSchema.index({ isDuplicate: 1 });
leadSchema.index({ duplicateOf: 1 });
leadSchema.index({ isDisposed: 1 });
leadSchema.index({ draftDate: 1 });
leadSchema.index({ gtiCallUuid: 1 });
leadSchema.index({ gtiPrimaryPhone: 1 });
leadSchema.index({ gtiLastPostback: -1 });

// PERFORMANCE OPTIMIZATION: Compound indexes for frequently used query combinations
leadSchema.index({ organization: 1, status: 1 });
leadSchema.index({ organization: 1, qualificationStatus: 1 });
leadSchema.index({ organization: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, qualificationStatus: 1 });
leadSchema.index({ assignedTo: 1, leadProgressStatus: 1 });
leadSchema.index({ assignedTo: 1, adminProcessed: 1 });
leadSchema.index({ assignedTo: 1, assignedAt: -1 });
leadSchema.index({ createdBy: 1, organization: 1 });
leadSchema.index({ status: 1, qualificationStatus: 1 });
leadSchema.index({ organization: 1, status: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, qualificationStatus: 1, adminProcessed: 1 });

// Text index for search functionality
leadSchema.index({ 
  name: 'text', 
  email: 'text', 
  phone: 'text', 
  alternatePhone: 'text',
  leadId: 'text',
  company: 'text'
}, {
  weights: {
    leadId: 10,
    name: 5,
    email: 3,
    phone: 3,
    company: 2,
    alternatePhone: 1
  }
});

// Function to generate unique lead ID using Eastern Time
// New format: {ORG_PREFIX}{YYMMDD}{00000_SEQUENCE} (e.g., RED2509220001)
const generateLeadId = async function() {
  const currentDate = getEasternNow();
  
  // Get organization for prefix generation
  if (!this.organization) {
    throw new Error('Organization is required to generate Lead ID');
  }
  
  // Import Organization model to get prefix
  const Organization = require('./Organization');
  const orgPrefix = await Organization.getLeadIdPrefixById(this.organization);
  
  // New format: {ORG_PREFIX}{YYMMDD}{NNNNN}
  const year = currentDate.getFullYear().toString().slice(-2); // Last 2 digits: 25 for 2025
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // 2-digit month: 09
  const day = String(currentDate.getDate()).padStart(2, '0'); // 2-digit day: 22
  
  // Get date boundaries for Eastern Time
  const startOfDay = getEasternStartOfDay(currentDate);
  const endOfDay = getEasternEndOfDay(currentDate);
  
  let attempts = 0;
  const maxAttempts = 10;
  
  while (attempts < maxAttempts) {
    // Count leads created today for THIS SPECIFIC ORGANIZATION in Eastern Time
    const todayLeadsCount = await this.constructor.countDocuments({
      organization: this.organization, // Organization-specific counter
      createdAt: { $gte: startOfDay, $lte: endOfDay }
    });
    
    // Lead number from 1-99999, padded to 5 digits (per organization per day)
    const leadNumber = todayLeadsCount + 1 + attempts;
    
    // Ensure we don't exceed 99999 leads per day per organization
    if (leadNumber > 99999) {
      throw new Error(`Daily lead limit exceeded for organization (99999) - ${orgPrefix}`);
    }
    
    const sequence = String(leadNumber).padStart(5, '0'); // 5-digit sequence: 00001
    const leadId = `${orgPrefix}${year}${month}${day}${sequence}`; // Final format: RED2509220001
    
    // Check for uniqueness (should be unique due to org-specific counter, but double-check)
    const existingLead = await this.constructor.findOne({ leadId });
    if (!existingLead) {
      return leadId;
    }
    
    attempts++;
  }
  
  // Fallback: use timestamp-based sequence if somehow duplicates occur
  const timestamp = Date.now().toString().slice(-5); // Last 5 digits
  const fallbackId = `${orgPrefix}${year}${month}${day}${timestamp}`;
  
  console.warn(`Using fallback Lead ID: ${fallbackId} for organization: ${orgPrefix}`);
  return fallbackId;
};

// Pre-save middleware to generate leadId and calculate completion percentage and category
leadSchema.pre('save', async function(next) {
  // Generate leadId for new documents
  if (this.isNew && !this.leadId) {
    try {
      this.leadId = await generateLeadId.call(this);
    } catch (error) {
      return next(error);
    }
  }

  const requiredFields = [
    'name', 'email', 'phone', 'totalDebtAmount', 'debtCategory', 
    'numberOfCreditors', 'monthlyDebtPayment', 'creditScoreRange'
  ];
  
  let filledFields = 0;
  requiredFields.forEach(field => {
    if (this[field] && this[field] !== '') {
      filledFields++;
    }
  });

  this.completionPercentage = Math.round((filledFields / requiredFields.length) * 100);

  // Categorize based on completion percentage
  if (this.completionPercentage >= 80) {
    this.category = 'hot';
  } else if (this.completionPercentage >= 50) {
    this.category = 'warm';
  } else {
    this.category = 'cold';
  }

  // Normalize phone numbers to include +1 prefix
  if (this.phone) {
    let phone = String(this.phone).trim().replace(/[\s\-\(\)]/g, '');
    if (phone && !phone.startsWith('+1') && phone.length === 10) {
      this.phone = '+1' + phone;
    }
  }
  
  if (this.alternatePhone) {
    let altPhone = String(this.alternatePhone).trim().replace(/[\s\-\(\)]/g, '');
    if (altPhone && !altPhone.startsWith('+1') && altPhone.length === 10) {
      this.alternatePhone = '+1' + altPhone;
    }
  }

  // Duplicate detection for new leads - Phone number only
  if (this.isNew && this.phone) {
    const duplicateQuery = { $and: [
      { _id: { $ne: this._id } }, // Exclude current document
      { phone: this.phone } // Only check phone number for duplicates
    ]};
    
    const existingLead = await this.constructor.findOne(duplicateQuery);
    
    if (existingLead) {
      this.isDuplicate = true;
      this.duplicateOf = existingLead._id;
      this.duplicateDetectedAt = getEasternNow();
      this.duplicateReason = 'phone'; // Always phone since we only check phone
    }
  }

  // Note: qualificationStatus and leadProgressStatus are now independent fields
  // They must be set manually and are not automatically linked to each other

  next();
});

// Static method to find lead by leadId
leadSchema.statics.findByLeadId = function(leadId) {
  return this.findOne({ leadId: leadId });
};

// Static method to get statistics
leadSchema.statics.getStatistics = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalLeads: { $sum: 1 },
        hotLeads: {
          $sum: { $cond: [{ $eq: ['$category', 'hot'] }, 1, 0] }
        },
        warmLeads: {
          $sum: { $cond: [{ $eq: ['$category', 'warm'] }, 1, 0] }
        },
        coldLeads: {
          $sum: { $cond: [{ $eq: ['$category', 'cold'] }, 1, 0] }
        },
        interestedLeads: {
          $sum: { $cond: [{ $eq: ['$status', 'interested'] }, 1, 0] }
        },
        successfulLeads: {
          $sum: { $cond: [{ $eq: ['$status', 'successful'] }, 1, 0] }
        },
        followUpLeads: {
          $sum: { $cond: [{ $eq: ['$status', 'follow-up'] }, 1, 0] }
        },
        qualifiedLeads: {
          $sum: { $cond: [{ $eq: ['$qualificationStatus', 'qualified'] }, 1, 0] }
        },
        notQualifiedLeads: {
          $sum: { $cond: [{ $in: ['$qualificationStatus', ['not-qualified', 'disqualified', 'unqualified']] }, 1, 0] }
        },
        pendingLeads: {
          $sum: { $cond: [{ $eq: ['$qualificationStatus', 'pending'] }, 1, 0] }
        },
        immediateEnrollmentLeads: {
          $sum: { 
            $cond: [
              { $in: ['$leadProgressStatus', ['SALE', 'Immediate Enrollment']] }, 
              1, 
              0
            ] 
          }
        }
      }
    }
  ]);

  const result = stats[0] || {
    totalLeads: 0,
    hotLeads: 0,
    warmLeads: 0,
    coldLeads: 0,
    interestedLeads: 0,
    successfulLeads: 0,
    followUpLeads: 0,
    qualifiedLeads: 0,
    notQualifiedLeads: 0,
    pendingLeads: 0,
    immediateEnrollmentLeads: 0
  };

  // Calculate conversion rate: (SALE call disposition leads ÷ Qualified leads) × 100
  result.conversionRate = result.qualifiedLeads > 0 
    ? ((result.immediateEnrollmentLeads / result.qualifiedLeads) * 100).toFixed(2)
    : 0;

  // Calculate qualification rate
  result.qualificationRate = result.totalLeads > 0 
    ? ((result.qualifiedLeads / result.totalLeads) * 100).toFixed(2)
    : 0;

  return result;
};

// Instance method to get category color
leadSchema.methods.getCategoryColor = function() {
  const colors = {
    hot: '#ef4444', // red-500
    warm: '#eab308', // yellow-500
    cold: '#3b82f6'  // blue-500
  };
  return colors[this.category] || colors.cold;
};

module.exports = mongoose.model('Lead', leadSchema);

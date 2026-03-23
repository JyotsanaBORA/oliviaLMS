const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Organization name is required'],
    trim: true,
    maxLength: [100, 'Organization name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxLength: [500, 'Description cannot exceed 500 characters']
  },
  address: {
    type: String,
    trim: true,
    maxLength: [200, 'Address cannot exceed 200 characters']
  },
  phone: {
    type: String,
    trim: true,
    maxLength: [20, 'Phone cannot exceed 20 characters']
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxLength: [100, 'Email cannot exceed 100 characters']
  },
  website: {
    type: String,
    trim: true,
    maxLength: [100, 'Website cannot exceed 100 characters']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field before saving
organizationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for getting organization stats
organizationSchema.virtual('stats', {
  ref: 'User',
  localField: '_id',
  foreignField: 'organization',
  count: true
});

// Ensure virtual fields are serialized
organizationSchema.set('toJSON', { virtuals: true });
organizationSchema.set('toObject', { virtuals: true });

// Instance methods
organizationSchema.methods.toJSON = function() {
  const organization = this.toObject();
  
  // Remove sensitive information if needed
  return organization;
};

// Method to generate organization prefix for Lead IDs
organizationSchema.methods.getLeadIdPrefix = function() {
  const orgName = this.name?.trim();
  
  if (!orgName) {
    return 'ORG'; // Fallback prefix
  }
  
  // Special case for REDDINGTON GLOBAL CONSULTANCY
  if (orgName.toUpperCase() === 'REDDINGTON GLOBAL CONSULTANCY') {
    return 'RED';
  }
  
  // For all other organizations: first 3 letters in uppercase
  // Extract only letters and take first 3
  const letters = orgName.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.substring(0, 3).padEnd(3, 'X'); // Pad with X if less than 3 letters
};

// Static method to get prefix by organization ID
organizationSchema.statics.getLeadIdPrefixById = async function(organizationId) {
  try {
    const organization = await this.findById(organizationId);
    return organization ? organization.getLeadIdPrefix() : 'ORG';
  } catch (error) {
    console.error('Error getting organization prefix:', error);
    return 'ORG'; // Fallback
  }
};

// Static methods
organizationSchema.statics.findActiveOrganizations = function() {
  return this.find({ isActive: true }).populate('createdBy', 'name email');
};

organizationSchema.statics.findByCreator = function(creatorId) {
  return this.find({ createdBy: creatorId }).populate('createdBy', 'name email');
};

const Organization = mongoose.model('Organization', organizationSchema);

module.exports = Organization;

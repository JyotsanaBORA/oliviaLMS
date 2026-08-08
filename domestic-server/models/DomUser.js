'use strict';
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const domUserSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [60, 'Name cannot exceed 60 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false,
    },
    role: {
      type: String,
      enum: ['domagent', 'dom_admin', 'dom_superadmin'],
      default: 'domagent',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: { type: Date },
    // Agent availability status (set by the agent themselves)
    agentStatus: {
      type: String,
      enum: ['available', 'break', 'unavailable'],
      default: 'available',
    },
    agentStatusUpdatedAt: { type: Date, default: null },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DomUser',
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes (email unique index is already set via schema field definition; only extra indexes here)
domUserSchema.index({ role: 1 });

// Hash password before saving
domUserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare plain-text password with hashed
domUserSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

module.exports = mongoose.model('DomUser', domUserSchema);

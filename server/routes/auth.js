const express = require('express');
const { body } = require('express-validator');
const User = require('../models/User');
const { protect, generateToken } = require('../middleware/auth');
const handleValidationErrors = require('../middleware/validation');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('role')
    .optional()
    .isIn(['agent1', 'agent2', 'admin', 'superadmin'])
    .withMessage('Role must be agent1, agent2, admin, or superadmin')
];

const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

// @desc    Register user (Public - Only for initial admin setup)
// @route   POST /api/auth/register
// @access  Public (Restricted)
router.post('/register', registerValidation, handleValidationErrors, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if any admin exists
    const adminExists = await User.findOne({ role: 'admin' });
    
    // If admin exists, only admin can create new users
    if (adminExists) {
      return res.status(403).json({
        success: false,
        message: 'Registration is restricted. Only admin can create new accounts.'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create user (first user becomes admin)
    const user = await User.create({
      name,
      email,
      password,
      role: 'admin' // First user is always admin
    });

    // Generate token
    const token = generateToken(user._id);

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    res.status(201).json({
      success: true,
      message: 'Admin user created successfully',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating user',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Create Agent (Admin only)
// @route   POST /api/auth/create-agent
// @access  Private (Admin only)
router.post('/create-agent', protect, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    // Check if user is admin or superadmin
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or superadmin can create agent accounts'
      });
    }

    const { name, email, password, role } = req.body;
    const vicidialAgentId = (req.body.vicidialAgentId || '').toString().trim();

    // Validate role for agents
    if (!['agent1', 'agent2'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Role must be either agent1 or agent2'
      });
    }

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Check if vicidialAgentId is already in use
    if (vicidialAgentId) {
      const existingVicidialUser = await User.findOne({ vicidialAgentId });
      if (existingVicidialUser) {
        return res.status(400).json({
          success: false,
          message: `Vicidial Agent ID "${vicidialAgentId}" is already assigned to ${existingVicidialUser.name}`
        });
      }
    }

    // For admin users, agents must be in same organization
    // For super admin, organization must be provided in the request body
    let organizationId = null;
    if (req.user.role === 'admin') {
      organizationId = req.user.organization;
    } else if (req.user.role === 'superadmin') {
      const orgId = (req.body.organization || '').toString().trim();
      if (!orgId) {
        return res.status(400).json({
          success: false,
          message: 'organization is required when superadmin creates an agent'
        });
      }
      organizationId = orgId;
    }

    // Create agent user
    const user = await User.create({
      name,
      email,
      password,
      role,
      organization: organizationId,
      createdBy: req.user._id,
      vicidialAgentId: vicidialAgentId || undefined
    });

    // Populate organization for response
    await user.populate('organization', 'name');

    res.status(201).json({
      success: true,
      message: `${role} account created successfully`,
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating agent account',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Create Admin (SuperAdmin only)
// @route   POST /api/auth/create-admin
// @access  Private (SuperAdmin only)
router.post('/create-admin', protect, registerValidation, handleValidationErrors, async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can create admin accounts'
      });
    }

    const { name, email, password } = req.body;

    // Check if user already exists
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create admin user
    const user = await User.create({
      name,
      email,
      password,
      role: 'admin',
      createdBy: req.user._id
    });

    res.status(201).json({
      success: true,
      message: 'Admin account created successfully',
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    console.error('Create admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating admin account',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
router.post('/login', loginValidation, handleValidationErrors, async (req, res) => {
  try {
    const { email, password } = req.body;

    // Check if user exists and get password field
    const user = await User.findByEmail(email).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Populate organization name for client-side role checks
    await user.populate('organization', 'name');

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: user.toJSON(),
        token
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during login',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = req.user;

    if (user && user.populate) {
      await user.populate('organization', 'name');
    }

    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user data',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('vicidialAgentId')
    .optional({ checkFalsy: false })
    .trim()
    .isLength({ max: 50 })
    .withMessage('Vicidial Agent ID cannot exceed 50 characters')
], handleValidationErrors, async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = req.user;

    // Check if email is being changed and if it already exists
    if (email && email !== user.email) {
      const existingUser = await User.findByEmail(email);
      if (existingUser && existingUser._id.toString() !== user._id.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use by another account'
        });
      }
      user.email = email;
    }

    if (name) user.name = name;

    // Allow agents to self-manage their Vicidial Agent ID
    if (typeof req.body.vicidialAgentId !== 'undefined' && ['agent1', 'agent2'].includes(user.role)) {
      const trimmedViciId = (req.body.vicidialAgentId || '').toString().trim();
      if (trimmedViciId) {
        // Ensure no other user already has this ID
        const existingViciUser = await User.findOne({
          vicidialAgentId: trimmedViciId,
          _id: { $ne: user._id }
        });
        if (existingViciUser) {
          return res.status(400).json({
            success: false,
            message: `Vicidial Agent ID "${trimmedViciId}" is already assigned to another agent`
          });
        }
        user.vicidialAgentId = trimmedViciId;
      } else {
        user.vicidialAgentId = undefined;
      }
    }

    await user.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        user: user.toJSON()
      }
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating profile',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
], handleValidationErrors, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    // Check current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({
      success: false,
      message: 'Error changing password',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Logout user (client-side token removal)
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully'
  });
});

// @desc    Get all agents (Admin only)
// @route   GET /api/auth/agents
// @access  Private (Admin only)
router.get('/agents', protect, async (req, res) => {
  try {
    // Check if user is admin or superadmin
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or superadmin can view agent accounts'
      });
    }

    let query = { role: { $in: ['agent1', 'agent2'] } };
    
    // If admin, only show agents from their organization
    if (req.user.role === 'admin') {
      query.organization = req.user.organization;
    }

    // SuperAdmin can filter by organization
    if (req.user.role === 'superadmin' && req.query.organization) {
      query.organization = req.query.organization;
    }

    // Search by name or email
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by status (active/inactive)
    if (req.query.status) {
      query.isActive = req.query.status === 'active';
    }

    const agents = await User.find(query)
      .populate('organization', 'name')
      .populate('createdBy', 'name email')
      .select('-password');

    res.status(200).json({
      success: true,
      count: agents.length,
      data: agents
    });

  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching agents',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update agent status (Admin only)
// @route   PUT /api/auth/agents/:id/status
// @access  Private (Admin only)
router.put('/agents/:id/status', protect, async (req, res) => {
  try {
    // Check if user is admin or superadmin
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or superadmin can update agent status'
      });
    }

    const { isActive } = req.body;
    const agent = await User.findById(req.params.id);

    if (!agent || !['agent1', 'agent2'].includes(agent.role)) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    agent.isActive = isActive;
    await agent.save();

    res.status(200).json({
      success: true,
      message: `Agent ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        agent: agent.toJSON()
      }
    });

  } catch (error) {
    console.error('Update agent status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating agent status',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update agent information (Admin only)
// @route   PUT /api/auth/agents/:id
// @access  Private (Admin only)
router.put('/agents/:id', protect, [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email')
], handleValidationErrors, async (req, res) => {
  try {
    // Check if user is admin or superadmin
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or superadmin can update agent information'
      });
    }

    const { name, email } = req.body;
    const vicidialAgentId = (req.body.vicidialAgentId || '').toString().trim();
    const agent = await User.findById(req.params.id);

    if (!agent || !['agent1', 'agent2'].includes(agent.role)) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Check if email is already taken by another user
    if (email !== agent.email) {
      const existingUser = await User.findOne({ 
        email: email,
        _id: { $ne: req.params.id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use by another user'
        });
      }
    }

    // Check if vicidialAgentId is already assigned to another user
    if (vicidialAgentId) {
      const existingVicidialUser = await User.findOne({
        vicidialAgentId: vicidialAgentId,
        _id: { $ne: req.params.id }
      });
      if (existingVicidialUser) {
        return res.status(400).json({
          success: false,
          message: `Vicidial Agent ID "${vicidialAgentId}" is already assigned to ${existingVicidialUser.name}`
        });
      }
    }

    // Update agent information
    agent.name = name;
    agent.email = email;
    agent.vicidialAgentId = vicidialAgentId || undefined;
    await agent.save();

    res.status(200).json({
      success: true,
      message: 'Agent information updated successfully',
      data: {
        agent: agent.toJSON()
      }
    });

  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating agent information',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update user information (SuperAdmin only - supports all user types including password)
// @route   PUT /api/auth/users/:id
// @access  Private (SuperAdmin only)
router.put('/users/:id', protect, [
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please enter a valid email'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number')
], handleValidationErrors, async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can update user information'
      });
    }

    const { name, email, password } = req.body;
    const vicidialAgentId = (req.body.vicidialAgentId || '').toString().trim();
    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // SuperAdmin can update agent1, agent2, and admin users
    if (!['agent1', 'agent2', 'admin'].includes(targetUser.role)) {
      return res.status(400).json({
        success: false,
        message: 'Can only update agent1, agent2, or admin users'
      });
    }

    // Prevent superadmin from updating themselves through this route
    if (targetUser._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update your own account through this route'
      });
    }

    // Check if email is already taken by another user
    if (email !== targetUser.email) {
      const existingUser = await User.findOne({ 
        email: email,
        _id: { $ne: req.params.id }
      });
      
      if (existingUser) {
        return res.status(400).json({
          success: false,
          message: 'Email is already in use by another user'
        });
      }
    }

    // Check if vicidialAgentId is already assigned to another user (agents only)
    if (['agent1', 'agent2'].includes(targetUser.role) && vicidialAgentId) {
      const existingVicidialUser = await User.findOne({
        vicidialAgentId: vicidialAgentId,
        _id: { $ne: req.params.id }
      });
      if (existingVicidialUser) {
        return res.status(400).json({
          success: false,
          message: `Vicidial Agent ID "${vicidialAgentId}" is already assigned to ${existingVicidialUser.name}`
        });
      }
    }

    // Update user information
    targetUser.name = name;
    targetUser.email = email;

    // Update vicidialAgentId for agents
    if (['agent1', 'agent2'].includes(targetUser.role)) {
      targetUser.vicidialAgentId = vicidialAgentId || undefined;
    }

    // Update password if provided
    if (password && password.trim() !== '') {
      targetUser.password = password; // Will be hashed by the pre-save middleware
    }

    await targetUser.save();

    res.status(200).json({
      success: true,
      message: `${targetUser.role} information updated successfully${password ? ' (including password)' : ''}`,
      data: {
        user: targetUser.toJSON()
      }
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user information',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Delete agent (Admin only)
// @route   DELETE /api/auth/agents/:id
// @access  Private (Admin only)
router.delete('/agents/:id', protect, async (req, res) => {
  try {
    // Check if user is admin or superadmin
    if (!['admin', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admin or superadmin can delete agent accounts'
      });
    }

    const agent = await User.findById(req.params.id);

    if (!agent || !['agent1', 'agent2'].includes(agent.role)) {
      return res.status(404).json({
        success: false,
        message: 'Agent not found'
      });
    }

    // Prevent admin from deleting themselves
    if (agent._id.toString() === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Agent deleted successfully'
    });

  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting agent',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Get all admins (SuperAdmin only)
// @route   GET /api/auth/admins
// @access  Private (SuperAdmin only)
router.get('/admins', protect, async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can view admin accounts'
      });
    }

    let query = { role: { $in: ['admin', 'restricted_admin'] } };

    // SuperAdmin can filter by organization
    if (req.query.organization) {
      query.organization = req.query.organization;
    }

    // Search by name or email
    if (req.query.search) {
      query.$or = [
        { name: { $regex: req.query.search, $options: 'i' } },
        { email: { $regex: req.query.search, $options: 'i' } }
      ];
    }

    // Filter by status (active/inactive)
    if (req.query.status) {
      query.isActive = req.query.status === 'active';
    }

    const admins = await User.find(query)
      .select('-password')
      .populate('createdBy', 'name email')
      .populate('organization', 'name');

    res.status(200).json({
      success: true,
      count: admins.length,
      data: admins
    });

  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching admin accounts',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Delete admin (SuperAdmin only)
// @route   DELETE /api/auth/admins/:id
// @access  Private (SuperAdmin only)
router.delete('/admins/:id', protect, async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can delete admin accounts'
      });
    }

    const admin = await User.findById(req.params.id);

    if (!admin || !['admin', 'restricted_admin'].includes(admin.role)) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Admin deleted successfully'
    });

  } catch (error) {
    console.error('Delete admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting admin',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

// @desc    Update admin status (SuperAdmin only)
// @route   PUT /api/auth/admins/:id/status
// @access  Private (SuperAdmin only)
router.put('/admins/:id/status', protect, async (req, res) => {
  try {
    // Check if user is superadmin
    if (req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Only superadmin can update admin status'
      });
    }

    const { isActive } = req.body;
    const admin = await User.findById(req.params.id);

    if (!admin || !['admin', 'restricted_admin'].includes(admin.role)) {
      return res.status(404).json({
        success: false,
        message: 'Admin not found'
      });
    }

    admin.isActive = isActive;
    await admin.save();

    res.status(200).json({
      success: true,
      message: `Admin ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: {
        admin: admin.toJSON()
      }
    });

  } catch (error) {
    console.error('Update admin status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating admin status',
      error: process.env.NODE_ENV === 'development' ? error.message : {}
    });
  }
});

module.exports = router;

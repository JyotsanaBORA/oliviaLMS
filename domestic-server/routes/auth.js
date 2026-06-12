'use strict';
const express  = require('express');
const DomUser  = require('../models/DomUser');
const { protect, generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /domestic-api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required.' });
    }

    // Fetch user with password field (select: false by default)
    const user = await DomUser.findOne({ email: email.toLowerCase().trim() }).select('+password');

    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact your admin.' });
    }

    // Update last login
    await DomUser.findByIdAndUpdate(user._id, { lastLogin: new Date() });

    const token = generateToken(user._id);

    return res.status(200).json({
      success: true,
      token,
      user: {
        _id:   user._id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// GET /domestic-api/auth/me
router.get('/me', protect, async (req, res) => {
  try {
    const user = await DomUser.findById(req.user._id).lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    return res.status(200).json({
      success: true,
      user: {
        _id:       user._id,
        name:      user.name,
        email:     user.email,
        role:      user.role,
        lastLogin: user.lastLogin,
      },
    });
  } catch (err) {
    console.error('[Auth] /me error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error.' });
  }
});

module.exports = router;

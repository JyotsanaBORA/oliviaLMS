'use strict';
const jwt    = require('jsonwebtoken');
const DomUser = require('../models/DomUser');

/**
 * protect  verifies the JWT and attaches the DomUser to req.user.
 * Uses DOM_JWT_SECRET  completely separate from international LMS.
 */
const protect = async (req, res, next) => {
  try {
    let token;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ success: false, message: 'Not authorized  no token provided.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.DOM_JWT_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Not authorized  token invalid or expired.' });
    }

    const user = await DomUser.findById(decoded.id).lean();

    if (!user) {
      return res.status(401).json({ success: false, message: 'Not authorized  user not found.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account is deactivated. Contact your admin.' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('[Auth] Middleware error:', err.message);
    return res.status(500).json({ success: false, message: 'Server error during authentication.' });
  }
};

/**
 * authorize  restrict access to specific roles.
 * Usage: router.get('/route', protect, authorize('dom_admin', 'dom_superadmin'), handler)
 */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authorized.' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: `Role '${req.user.role}' is not allowed here.` });
  }
  next();
};

/**
 * generateToken  signs a JWT with the domestic secret.
 */
const generateToken = (id) =>
  jwt.sign({ id }, process.env.DOM_JWT_SECRET, {
    expiresIn: process.env.DOM_JWT_EXPIRE || '7d',
  });

module.exports = { protect, authorize, generateToken };


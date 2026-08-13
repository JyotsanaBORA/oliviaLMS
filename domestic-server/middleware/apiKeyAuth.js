'use strict';

/**
 * apiKeyAuth  validates the x-api-key header for the intake endpoint.
 * The mycashbridge website backend sends this key when pushing a lead.
 */
const apiKeyAuth = (req, res, next) => {
  const key      = req.headers['x-api-key'];
  const expected = process.env.DOM_WEBSITE_API_KEY;

  if (!expected) {
    console.error('[ApiKeyAuth] DOM_WEBSITE_API_KEY is not set in .env');
    return res.status(500).json({ success: false, message: 'Server misconfiguration  API key not set.' });
  }

  if (!key || key !== expected) {
    return res.status(401).json({ success: false, message: 'Invalid or missing API key.' });
  }

  next();
};

module.exports = apiKeyAuth;


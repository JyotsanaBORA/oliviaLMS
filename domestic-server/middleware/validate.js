'use strict';

/**
 * validateIntakeLead — sanitize and validate incoming website lead payload.
 * Attaches req.leadData with only the fields we trust.
 */
const validateIntakeLead = (req, res, next) => {
  const b = req.body || {};

  // Honeypot check — should always be empty from real users
  if (b._hp && b._hp.toString().trim() !== '') {
    // Silently accept to not reveal the check to bots
    return res.status(200).json({ ok: true });
  }

  // Name is required
  const name = (b.name || '').toString().trim().slice(0, 100);
  if (!name) {
    return res.status(400).json({ success: false, message: 'name is required.' });
  }

  // Mobile — strip +91 prefix if present, validate 10 digits
  let mobile = (b.mobile || '').toString().trim();
  mobile = mobile.replace(/^\+91[\s-]?/, '').replace(/\D/g, '');
  if (mobile.length !== 10) {
    return res.status(400).json({ success: false, message: 'A valid 10-digit mobile number is required.' });
  }
  mobile = '+91' + mobile;

  req.leadData = {
    name,
    mobile,
    city:          (b.city          || '').toString().trim().slice(0, 100),
    monthlyIncome: (b.monthly_income || b.monthlyIncome || '').toString().trim().slice(0, 50),
    employment:    (b.employment     || '').toString().trim().slice(0, 50),
    productType:   (b.product_type   || b.productType   || 'General enquiry').toString().trim().slice(0, 100),
    pan:           (b.pan            || '').toString().trim().toUpperCase().slice(0, 10),
    sourcePage:    (b.source_page    || b.sourcePage    || '').toString().trim().slice(0, 300),
    utmSource:     (b.utm_source     || '').toString().trim().slice(0, 100),
    utmMedium:     (b.utm_medium     || '').toString().trim().slice(0, 100),
    utmCampaign:   (b.utm_campaign   || '').toString().trim().slice(0, 100),
    ip:            req.ip || '',
  };

  next();
};

module.exports = { validateIntakeLead };

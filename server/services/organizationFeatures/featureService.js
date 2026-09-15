/**
 * Organization Feature Service
 * Resolves organization features and permissions dynamically with 100% backward-compatible fallbacks.
 */

const { DEFAULT_ORG_FEATURES, FEATURE_METADATA } = require('./featureConstants');

/**
 * Resolves the effective feature flags for an organization.
 * If an explicit flag exists in org.features, it is respected.
 * If unset/undefined, it falls back to existing schema fields and legacy patterns
 * to guarantee zero breaking changes for existing organizations.
 *
 * @param {Object} org - Organization document or lean object
 * @returns {Object} Normalized features object with boolean values for all keys
 */
const resolveOrgFeatures = (org) => {
  if (!org) {
    return { ...DEFAULT_ORG_FEATURES };
  }

  const rawFeatures = org.features || {};
  const orgNameLower = (org.name || '').trim().toLowerCase();
  const orgIdStr = String(org._id || '');

  // Helper to get boolean if explicitly defined (true/false)
  const isExplicit = (val) => typeof val === 'boolean';

  // 1. Live Transfer feature
  const hasLiveTransfer = isExplicit(rawFeatures.hasLiveTransfer)
    ? rawFeatures.hasLiveTransfer
    : Boolean(
        (org.liveTransferDid && String(org.liveTransferDid).trim().length > 0) ||
        orgNameLower.includes('socialupmedia 3') ||
        orgNameLower.includes('socialupmedia 4') ||
        orgIdStr === '6a99ddd7cea428c97ea29bdb' // Social Up Media LLC (Jake 1)
      );

  // 2. Inbound Calls feature
  const hasInboundCalls = isExplicit(rawFeatures.hasInboundCalls)
    ? rawFeatures.hasInboundCalls
    : Boolean(
        (org.inboundCallsDid && String(org.inboundCallsDid).trim().length > 0) ||
        orgIdStr === '6a99ddd7cea428c97ea29bdb' || // Social Up Media LLC (Jake 1)
        orgIdStr === '6aa03313a396c53fdf24e16f'   // Socialupmedia 2
      );

  // 3. Dual-DID Segregated Dashboard Switcher
  const hasDualDidSwitcher = isExplicit(rawFeatures.hasDualDidSwitcher)
    ? rawFeatures.hasDualDidSwitcher
    : Boolean(
        orgIdStr === '6a99ddd7cea428c97ea29bdb' || // Social Up Media LLC (Jake 1)
        (org.liveTransferDid && org.inboundCallsDid)
      );

  // 4. Dedicated Vendor Lead Portal (Jake / TruClick / Ben vendor modal)
  const hasVendorLeadPortal = isExplicit(rawFeatures.hasVendorLeadPortal)
    ? rawFeatures.hasVendorLeadPortal
    : Boolean(
        orgNameLower.includes('jake') ||
        orgNameLower.includes('socialupmedia') ||
        orgNameLower.includes('social up media') ||
        orgNameLower.includes('truclick') ||
        orgNameLower.includes('tru click') ||
        orgNameLower.includes('ben')
      );

  // 5. Outbound / Vendor Data Access
  const hasOutboundData = isExplicit(rawFeatures.hasOutboundData)
    ? rawFeatures.hasOutboundData
    : Boolean(
        org.showVendorData === true ||
        orgNameLower.includes('westlake') ||
        orgNameLower.includes('social up') ||
        orgNameLower.includes('socialup')
      );

  // 6. CSV Export Permission
  const canDownloadCsv = isExplicit(rawFeatures.canDownloadCsv)
    ? rawFeatures.canDownloadCsv
    : false;

  return {
    hasLiveTransfer,
    hasInboundCalls,
    hasDualDidSwitcher,
    hasVendorLeadPortal,
    hasOutboundData,
    canDownloadCsv,
  };
};

/**
 * Check if a specific organization has a given feature enabled.
 *
 * @param {Object} org - Organization document or lean object
 * @param {string} featureKey - Key from DEFAULT_ORG_FEATURES
 * @returns {boolean}
 */
const hasFeature = (org, featureKey) => {
  if (!org || !featureKey) return false;
  const resolved = resolveOrgFeatures(org);
  return Boolean(resolved[featureKey]);
};

/**
 * Sanitize and clean features payload received from client requests.
 * Only permits valid feature keys and ensures values are strict booleans.
 *
 * @param {Object} input - Raw features object from req.body
 * @returns {Object} Cleaned features object
 */
const sanitizeFeatures = (input) => {
  if (!input || typeof input !== 'object') return {};
  const cleaned = {};
  for (const key of Object.keys(DEFAULT_ORG_FEATURES)) {
    if (input[key] !== undefined) {
      cleaned[key] = Boolean(input[key]);
    }
  }
  return cleaned;
};

module.exports = {
  resolveOrgFeatures,
  hasFeature,
  sanitizeFeatures,
  DEFAULT_ORG_FEATURES,
  FEATURE_METADATA,
};

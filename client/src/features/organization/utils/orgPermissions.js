/**
 * Organization Feature & Permission Helpers (Client-side)
 * Dedicated helpers to check features, access permissions, and portal visibility.
 */

export const DEFAULT_CLIENT_FEATURES = Object.freeze({
  hasLiveTransfer: false,
  hasInboundCalls: false,
  hasDualDidSwitcher: false,
  hasVendorLeadPortal: false,
  hasOutboundData: false,
  canDownloadCsv: false,
});

/**
 * Resolves effective features on the client.
 * If backend provided resolved features, uses them directly.
 * Otherwise, applies client-side fallback matching backend logic.
 *
 * @param {Object} org - Organization object
 * @returns {Object} Clean boolean feature flags
 */
export const resolveClientOrgFeatures = (org) => {
  if (!org) return { ...DEFAULT_CLIENT_FEATURES };

  // If backend already resolved features, return them
  if (org.features && typeof org.features === 'object') {
    const isExplicit = (val) => typeof val === 'boolean';
    const allExplicit = Object.keys(DEFAULT_CLIENT_FEATURES).every(k => isExplicit(org.features[k]));
    if (allExplicit) {
      return org.features;
    }
  }

  const rawFeatures = org.features || {};
  const orgNameLower = (org.name || '').trim().toLowerCase();
  const orgIdStr = String(org._id || org.id || '');

  const isExplicit = (val) => typeof val === 'boolean';

  return {
    hasLiveTransfer: isExplicit(rawFeatures.hasLiveTransfer)
      ? rawFeatures.hasLiveTransfer
      : Boolean(
          (org.liveTransferDid && String(org.liveTransferDid).trim().length > 0) ||
          orgNameLower.includes('socialupmedia 3') ||
          orgNameLower.includes('socialupmedia 4') ||
          orgIdStr === '6a99ddd7cea428c97ea29bdb'
        ),

    hasInboundCalls: isExplicit(rawFeatures.hasInboundCalls)
      ? rawFeatures.hasInboundCalls
      : Boolean(
          (org.inboundCallsDid && String(org.inboundCallsDid).trim().length > 0) ||
          orgIdStr === '6a99ddd7cea428c97ea29bdb' ||
          orgIdStr === '6aa03313a396c53fdf24e16f'
        ),

    hasDualDidSwitcher: isExplicit(rawFeatures.hasDualDidSwitcher)
      ? rawFeatures.hasDualDidSwitcher
      : Boolean(
          orgIdStr === '6a99ddd7cea428c97ea29bdb' ||
          (org.liveTransferDid && org.inboundCallsDid)
        ),

    hasVendorLeadPortal: isExplicit(rawFeatures.hasVendorLeadPortal)
      ? rawFeatures.hasVendorLeadPortal
      : Boolean(
          orgNameLower.includes('jake') ||
          orgNameLower.includes('socialupmedia') ||
          orgNameLower.includes('social up media') ||
          orgNameLower.includes('truclick') ||
          orgNameLower.includes('tru click') ||
          orgNameLower.includes('ben')
        ),

    hasOutboundData: isExplicit(rawFeatures.hasOutboundData)
      ? rawFeatures.hasOutboundData
      : (typeof org.showVendorData === 'boolean'
          ? org.showVendorData
          : Boolean(
              orgNameLower.includes('westlake') ||
              orgNameLower.includes('social up') ||
              orgNameLower.includes('socialup')
            )),

    canDownloadCsv: isExplicit(rawFeatures.canDownloadCsv)
      ? rawFeatures.canDownloadCsv
      : false,
  };
};

/**
 * Check if an organization has a specific feature enabled.
 *
 * @param {Object} org - Organization object
 * @param {string} featureKey - Key from DEFAULT_CLIENT_FEATURES
 * @returns {boolean}
 */
export const hasOrgFeature = (org, featureKey) => {
  if (!org || !featureKey) return false;
  const resolved = resolveClientOrgFeatures(org);
  return Boolean(resolved[featureKey]);
};

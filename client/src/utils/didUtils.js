/**
 * Utility functions for handling DID Aliases across LMS dashboards, tables, and modals.
 */

/**
 * Normalizes any format of didAliases (array of { did, alias }, object map, or undefined)
 * into a standard key-value map: { [did]: alias }.
 *
 * @param {Array|Object} didAliases - Array of objects or object map
 * @returns {Object} { [did]: alias }
 */
export const getDidAliasMap = (didAliases) => {
  const map = {};
  if (!didAliases) return map;

  if (Array.isArray(didAliases)) {
    didAliases.forEach(item => {
      if (item && item.did && item.alias) {
        map[String(item.did).trim()] = String(item.alias).trim();
      }
    });
  } else if (typeof didAliases === 'object') {
    Object.entries(didAliases).forEach(([did, alias]) => {
      if (did && alias && typeof alias === 'string') {
        map[String(did).trim()] = String(alias).trim();
      }
    });
  }

  return map;
};

/**
 * Returns the alias for a given DID number if one exists.
 *
 * @param {string} did - DID phone number string
 * @param {Array|Object} didAliases - Array or map of DID aliases
 * @returns {string|null} The alias string or null
 */
export const getDidAlias = (did, didAliases) => {
  if (!did) return null;
  const cleanDid = String(did).trim();
  const aliasMap = getDidAliasMap(didAliases);
  return aliasMap[cleanDid] || null;
};

/**
 * Formats a DID for display, showing the alias if available.
 *
 * Examples:
 * - "Phoenix Line (19162330145)" (if alias exists)
 * - "19162330145" or fallbackLabel (if no alias exists)
 *
 * @param {string} did - DID phone number
 * @param {Array|Object} didAliases - Array or map of DID aliases
 * @param {string} [fallbackLabel] - Optional fallback if no alias
 * @returns {string} Formatted display string
 */
export const formatDidDisplay = (did, didAliases, fallbackLabel = null) => {
  if (!did) return fallbackLabel || '—';
  const alias = getDidAlias(did, didAliases);
  if (alias) {
    return `${alias} (${did})`;
  }
  return fallbackLabel || did;
};

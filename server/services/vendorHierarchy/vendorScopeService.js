'use strict';

/**
 * Vendor Scope Service
 * Centralizes DID resolution, query scoping, and export permissions across all roles.
 * Follows DRY principles so auth, leads, and inbound routes never duplicate scope logic.
 */

const MAIN_ORG_NAME = 'REDDINGTON GLOBAL CONSULTANCY';

/**
 * Checks if a user is a Full Access Admin (Superadmin or Reddington main org admin).
 * @param {Object} user - Mongoose User document or lean object
 * @returns {boolean}
 */
const isFullAccessAdmin = (user) => {
  if (!user) return false;
  if (user.role === 'superadmin') return true;
  if (user.role === 'admin' && user.organization) {
    const orgName = (user.organization.name || '').trim().toUpperCase();
    return orgName === MAIN_ORG_NAME;
  }
  return false;
};

/**
 * Returns the effective list of DIDs a user is allowed to access.
 * Returns null if the user has unrestricted global access.
 * @param {Object} user - User document with populated organization
 * @returns {string[] | null}
 */
const getUserEffectiveDids = (user) => {
  if (!user) return [];
  if (isFullAccessAdmin(user)) return null; // null means unrestricted

  // Sub-agents are strictly scoped to their assignedDids
  if (user.role === 'sub_agent' || user.role === 'vendor_agent') {
    return Array.isArray(user.assignedDids) ? user.assignedDids : [];
  }

  // Tenant admins are scoped to their organization's inboundDids
  if (user.organization && Array.isArray(user.organization.inboundDids)) {
    return user.organization.inboundDids;
  }

  return [];
};

/**
 * Validates that requested DIDs for a sub-agent belong to the parent organization's pool.
 * @param {string[]} orgDids - Array of DIDs in the organization
 * @param {string[]} requestedDids - Array of DIDs to assign to the sub-agent
 * @returns {{ valid: boolean, cleanDids: string[], invalidDids: string[] }}
 */
const validateAssignedDids = (orgDids = [], requestedDids = []) => {
  const cleanOrgDids = (orgDids || []).map(d => String(d).trim());
  const cleanReqDids = (requestedDids || []).map(d => String(d).trim()).filter(Boolean);

  const invalidDids = cleanReqDids.filter(d => !cleanOrgDids.includes(d));
  return {
    valid: invalidDids.length === 0,
    cleanDids: cleanReqDids,
    invalidDids,
  };
};

/**
 * Determines if a user has permission to download/export leads as CSV.
 * Sub-agents are strictly barred from downloading CSVs.
 * @param {Object} user - User document
 * @returns {boolean}
 */
const canUserExportCsv = (user) => {
  if (!user) return false;
  if (user.role === 'sub_agent' || user.role === 'vendor_agent') {
    return false; // Strictly forbidden
  }
  if (isFullAccessAdmin(user)) {
    return true;
  }
  return Boolean(user.canDownloadLeads);
};

/**
 * Applies DID scoping safely to a MongoDB query or match object.
 * @param {Object} query - The base query object to mutate
 * @param {Object} user - The authenticated user document
 * @param {string} [requestedDid] - Optional specific DID requested in query params
 * @returns {Object} Mutated query object
 */
const applyDidScopeToQuery = (query, user, requestedDid) => {
  const allowedDids = getUserEffectiveDids(user);

  // Unrestricted user (SuperAdmin / Reddington Full Access)
  if (allowedDids === null) {
    if (requestedDid && String(requestedDid).trim()) {
      query.vicidialDid = String(requestedDid).trim();
    }
    return query;
  }

  // Scoped user (Sub-Agent or Tenant Org Admin)
  if (requestedDid && String(requestedDid).trim()) {
    const cleanReq = String(requestedDid).trim();
    if (!allowedDids.includes(cleanReq)) {
      const err = new Error(`Access denied to DID ${cleanReq}`);
      err.status = 403;
      throw err;
    }
    query.vicidialDid = cleanReq;
  } else {
    // No specific DID requested: filter to all allowed DIDs
    if (allowedDids.length === 1) {
      query.vicidialDid = allowedDids[0];
    } else if (allowedDids.length > 1) {
      query.vicidialDid = { $in: allowedDids };
    } else {
      // User has no DIDs assigned -> match none
      query.vicidialDid = '__NO_DID_ASSIGNED__';
    }
  }

  return query;
};

module.exports = {
  isFullAccessAdmin,
  getUserEffectiveDids,
  validateAssignedDids,
  canUserExportCsv,
  applyDidScopeToQuery,
};

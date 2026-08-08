/**
 * Cache invalidation utility for lead management system
 * Clears relevant cache entries when data changes
 */

const cache = require('./cache');

class CacheInvalidator {
  /**
   * Invalidate dashboard stats cache for specific user and organization
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @param {string} organizationId - Organization ID
   */
  invalidateDashboardStats(userId, role, organizationId = null) {
    const cacheKey = cache.generateDashboardStatsKey(userId, role, organizationId);
    cache.delete(cacheKey);
    
    // Also invalidate superadmin cache if this affects global stats
    if (role !== 'superadmin') {
      const superAdminKey = cache.generateDashboardStatsKey('all', 'superadmin', null);
      cache.delete(superAdminKey);
    }
  }

  /**
   * Invalidate persistent leads cache for Agent2
   * @param {string} userId - Agent2 User ID
   */
  invalidatePersistentLeads(userId) {
    const allKey = cache.generatePersistentLeadsKey(userId, 'all');
    const pendingKey = cache.generatePersistentLeadsKey(userId, 'pending');
    const callbackKey = cache.generatePersistentLeadsKey(userId, 'callback');
    
    cache.delete(allKey);
    cache.delete(pendingKey);
    cache.delete(callbackKey);
  }

  /**
   * Invalidate admin persistent leads cache
   * @param {string} organizationId - Organization ID
   */
  invalidateAdminPersistentLeads(organizationId) {
    const adminKey = cache.generateAdminPersistentLeadsKey(organizationId);
    cache.delete(adminKey);
  }

  /**
   * Comprehensive cache invalidation when a lead is modified
   * @param {object} lead - Lead document
   * @param {object} user - User who made the change
   */
  invalidateLeadRelatedCaches(lead, user) {
    // Invalidate dashboard stats for the user who made the change
    this.invalidateDashboardStats(user._id, user.role, user.organization);

    // If lead is assigned to Agent2, invalidate their persistent leads cache
    if (lead.assignedTo) {
      this.invalidatePersistentLeads(lead.assignedTo);
    }

    // If lead belongs to an organization, invalidate admin persistent leads
    if (lead.organization) {
      this.invalidateAdminPersistentLeads(lead.organization);
    }

    // Invalidate dashboard stats for admin of the lead's organization
    if (lead.organization && user.organization?.toString() !== lead.organization?.toString()) {
      // Find and invalidate admin cache for the lead's organization
      // This is a simplified approach - in production you might want to maintain
      // a mapping of organization -> admin users for more efficient invalidation
      this.invalidateAdminCacheForOrganization(lead.organization);
    }
  }

  /**
   * Invalidate admin dashboard cache for a specific organization
   * @param {string} organizationId - Organization ID
   */
  invalidateAdminCacheForOrganization(organizationId) {
    // This is a simplified approach - clears all admin dashboard caches
    // In production, you might want to maintain organization -> admin user mappings
    const stats = cache.getStats();
    stats.keys.forEach(key => {
      if (key.includes('dashboard_stats:admin:') && key.includes(organizationId)) {
        cache.delete(key);
      }
    });
  }

  /**
   * Clear all caches (nuclear option for emergencies)
   */
  clearAllCaches() {
    cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return cache.getStats();
  }
}

// Create singleton instance
const cacheInvalidator = new CacheInvalidator();

module.exports = cacheInvalidator;
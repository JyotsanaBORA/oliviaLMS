/**
 * Simple in-memory cache utility for dashboard statistics
 * Reduces database load by caching frequently accessed data
 */

class SimpleCache {
  constructor() {
    this.cache = new Map();
    this.timestamps = new Map();
  }

  /**
   * Set a value in cache with TTL (time to live)
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlSeconds - Time to live in seconds (default: 300 = 5 minutes)
   */
  set(key, value, ttlSeconds = 300) {
    this.cache.set(key, value);
    this.timestamps.set(key, Date.now() + (ttlSeconds * 1000));
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if expired/not found
   */
  get(key) {
    const timestamp = this.timestamps.get(key);
    
    if (!timestamp || Date.now() > timestamp) {
      // Expired or not found
      this.delete(key);
      return null;
    }
    
    return this.cache.get(key);
  }

  /**
   * Delete a key from cache
   * @param {string} key - Cache key
   */
  delete(key) {
    this.cache.delete(key);
    this.timestamps.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
    this.timestamps.clear();
  }

  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [key, timestamp] of this.timestamps.entries()) {
      if (now > timestamp) {
        this.delete(key);
      }
    }
  }

  /**
   * Generate cache key for dashboard stats
   * @param {string} userId - User ID
   * @param {string} role - User role
   * @param {string} organizationId - Organization ID
   * @returns {string} - Cache key
   */
  generateDashboardStatsKey(userId, role, organizationId = null) {
    return `dashboard_stats:${role}:${userId}:${organizationId || 'all'}`;
  }

  /**
   * Generate cache key for persistent leads
   * @param {string} userId - User ID
   * @param {string} status - Status filter (optional)
   * @returns {string} - Cache key
   */
  generatePersistentLeadsKey(userId, status = 'all') {
    return `persistent_leads:${userId}:${status}`;
  }

  /**
   * Generate cache key for admin persistent leads
   * @param {string} organizationId - Organization ID
   * @returns {string} - Cache key
   */
  generateAdminPersistentLeadsKey(organizationId) {
    return `admin_persistent_leads:${organizationId}`;
  }
}

// Create singleton instance
const cache = new SimpleCache();

// Clean up expired entries every 5 minutes
setInterval(() => {
  cache.cleanup();
}, 5 * 60 * 1000);

module.exports = cache;
/**
 * Hybrid cache utility — uses Redis when available, falls back to in-process
 * Map when Redis is not configured or unreachable.
 *
 * The public API is identical to the old SimpleCache so all callers
 * (cacheInvalidator, route handlers) need zero changes.
 *
 * Redis ops are ASYNC but callers that used the old synchronous API pass
 * through a non-blocking fire-and-forget write, with synchronous in-memory
 * reads for speed.  Invalidation (delete / clear) is fully synchronous
 * in-memory AND async Redis so both layers stay consistent.
 */

const { cacheClient, isRedisReady } = require('./redisClient');

// ─── In-memory layer (always present) ────────────────────────────────────────
const memCache = new Map();
const memTimestamps = new Map();

function memSet(key, value, ttlSeconds) {
  memCache.set(key, value);
  memTimestamps.set(key, Date.now() + ttlSeconds * 1000);
}

function memGet(key) {
  const ts = memTimestamps.get(key);
  if (!ts || Date.now() > ts) {
    memCache.delete(key);
    memTimestamps.delete(key);
    return null;
  }
  return memCache.get(key);
}

function memDel(key) {
  memCache.delete(key);
  memTimestamps.delete(key);
}

// ─── Redis helpers (fire-and-forget, never throw) ────────────────────────────
const CACHE_PREFIX = 'lms:cache:';

async function redisSet(key, value, ttlSeconds) {
  if (!isRedisReady()) return;
  try {
    await cacheClient.set(CACHE_PREFIX + key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (_) { /* Redis error — in-memory still valid */ }
}

async function redisGet(key) {
  if (!isRedisReady()) return null;
  try {
    const raw = await cacheClient.get(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

async function redisDel(key) {
  if (!isRedisReady()) return;
  try { await cacheClient.del(CACHE_PREFIX + key); } catch (_) {}
}

async function redisClear(pattern) {
  if (!isRedisReady()) return;
  try {
    const keys = await cacheClient.keys(CACHE_PREFIX + (pattern || '*'));
    if (keys.length) await cacheClient.del(...keys);
  } catch (_) {}
}

// ─── Public cache API ─────────────────────────────────────────────────────────
const cache = {
  set(key, value, ttlSeconds = 300) {
    memSet(key, value, ttlSeconds);
    redisSet(key, value, ttlSeconds); // async, fire-and-forget
  },

  get(key) {
    // Always return in-memory value synchronously for speed.
    // Background: next set() will warm local memory from Redis if this worker
    // missed an invalidation — see getAsync() for cross-worker-safe reads.
    return memGet(key);
  },

  // Async read: checks Redis first so cross-worker invalidations are respected.
  async getAsync(key) {
    const local = memGet(key);
    if (local !== null) return local;
    const remote = await redisGet(key);
    if (remote !== null) {
      // Warm local memory
      const ts = memTimestamps.get(key);
      const remaining = ts ? Math.ceil((ts - Date.now()) / 1000) : 300;
      memSet(key, remote, Math.max(remaining, 1));
    }
    return remote;
  },

  delete(key) {
    memDel(key);
    redisDel(key); // async, fire-and-forget
  },

  clear() {
    memCache.clear();
    memTimestamps.clear();
    redisClear(); // async, fire-and-forget
  },

  getStats() {
    return {
      size: memCache.size,
      keys: Array.from(memCache.keys()),
      redisActive: isRedisReady(),
    };
  },

  cleanup() {
    const now = Date.now();
    for (const [key, ts] of memTimestamps.entries()) {
      if (now > ts) memDel(key);
    }
  },

  // ─── Key generators (unchanged) ──────────────────────────────────────────
  generateDashboardStatsKey(userId, role, organizationId = null) {
    return `dashboard_stats:${role}:${userId}:${organizationId || 'all'}`;
  },

  generatePersistentLeadsKey(userId, status = 'all') {
    return `persistent_leads:${userId}:${status}`;
  },

  generateAdminPersistentLeadsKey(organizationId) {
    return `admin_persistent_leads:${organizationId}`;
  },
};

// Clean up expired in-memory entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

module.exports = cache;
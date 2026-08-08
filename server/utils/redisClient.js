/**
 * Redis client factory — shared across the entire server process.
 *
 * Exports:
 *   cacheClient  — ioredis instance used by cache.js for get/set/del
 *   pubClient    — ioredis instance used by Socket.IO Redis adapter (publish)
 *   subClient    — ioredis instance used by Socket.IO Redis adapter (subscribe)
 *   isRedisReady — function() → boolean
 *
 * Graceful degradation:
 *   If REDIS_URL is not set or Redis is unreachable, all clients are null
 *   and isRedisReady() returns false.  cache.js falls back to in-memory Map;
 *   server.js skips the Redis adapter and uses the default in-memory adapter
 *   (correct for single-process / development mode).
 */

const Redis = require('ioredis');

const REDIS_URL = process.env.REDIS_URL;

let cacheClient = null;
let pubClient   = null;
let subClient   = null;
let redisReady  = false;

if (REDIS_URL) {
  // ──────────────────────────────────────────────────────────────────────────
  // Shared retry strategy — give up after 6 attempts so a missing Redis
  // server doesn't block startup or spam logs indefinitely.
  // ──────────────────────────────────────────────────────────────────────────
  const retryStrategy = (times) => {
    if (times > 6) {
      console.warn('[Redis] Max retries reached — operating without Redis.');
      return null; // stop retrying
    }
    return Math.min(times * 300, 3000); // exponential back-off, max 3 s
  };

  // Cache client — used for key/value reads and writes.
  // maxRetriesPerRequest: 3 so individual cache ops fail fast instead of hanging.
  try {
    cacheClient = new Redis(REDIS_URL, {
      retryStrategy,
      maxRetriesPerRequest: 3,
      enableOfflineQueue: false, // drop commands while disconnected
    });

    cacheClient.on('ready', () => {
      redisReady = true;
      console.log('[Redis] Cache client ready');
    });
    cacheClient.on('error', (err) => {
      // Only log first occurrence to avoid spam
      if (redisReady) console.warn('[Redis] Cache client error:', err.message);
      redisReady = false;
    });
    cacheClient.on('close', () => { redisReady = false; });
    cacheClient.on('reconnecting', () => { console.log('[Redis] Reconnecting...'); });
  } catch (err) {
    console.warn('[Redis] cacheClient creation failed:', err.message);
  }

  // Pub/sub clients — used exclusively by the Socket.IO Redis adapter.
  // maxRetriesPerRequest: null is REQUIRED for pub/sub to work correctly.
  // enableOfflineQueue: true so the adapter can queue commands during brief reconnects.
  try {
    pubClient = new Redis(REDIS_URL, {
      retryStrategy,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });
    subClient = new Redis(REDIS_URL, {
      retryStrategy,
      maxRetriesPerRequest: null,
      enableOfflineQueue: true,
    });

    // Log pub/sub errors only once per error code to avoid log spam during retries
    const loggedPub = new Set();
    const loggedSub = new Set();
    pubClient.on('error', (err) => {
      const key = err.code || err.message;
      if (!loggedPub.has(key)) { loggedPub.add(key); console.warn('[Redis] pub error:', err.message); }
    });
    subClient.on('error', (err) => {
      const key = err.code || err.message;
      if (!loggedSub.has(key)) { loggedSub.add(key); console.warn('[Redis] sub error:', err.message); }
    });
  } catch (err) {
    console.warn('[Redis] pub/sub client creation failed:', err.message);
    pubClient = null;
    subClient = null;
  }
} else {
  console.log('[Redis] REDIS_URL not set — using in-memory cache and single-adapter Socket.IO.');
}

/**
 * Returns true only when the cache Redis client has an active connection.
 * @returns {boolean}
 */
function isRedisReady() {
  return redisReady && cacheClient !== null;
}

module.exports = { cacheClient, pubClient, subClient, isRedisReady };

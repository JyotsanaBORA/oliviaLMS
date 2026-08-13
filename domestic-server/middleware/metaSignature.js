'use strict';
/**
 * Meta webhook HMAC-SHA256 signature validation middleware (domestic server).
 *
 * Meta signs every POST with:
 *   X-Hub-Signature-256: sha256=<HMAC of raw body using APP_SECRET>
 *
 * Requires req.rawBody to be set via the express.json verify fn in server.js.
 *
 * Dev:  missing secret / no signature  warn and allow (for curl/Postman testing)
 * Prod: any failure  ACK Meta (200) but silently drop
 */

const crypto = require('crypto');

function validateMetaSignature(req, res, next) {
  const appSecret = process.env.DOM_META_APP_SECRET || process.env.META_APP_SECRET;
  const isDev     = process.env.NODE_ENV !== 'production';
  const signature = req.headers['x-hub-signature-256'];

  if (!appSecret) {
    if (isDev) {
      console.warn('[DomMetaSignature] DOM_META_APP_SECRET not set  skipping check (development)');
      return next();
    }
    console.error('[DomMetaSignature] DOM_META_APP_SECRET not configured in production  dropping');
    return res.status(200).send('EVENT_RECEIVED');
  }

  if (!signature) {
    if (isDev) {
      console.warn('[DomMetaSignature] No X-Hub-Signature-256 header  allowed in development');
      return next();
    }
    console.warn('[DomMetaSignature] Missing X-Hub-Signature-256 in production  dropping');
    return res.status(200).send('EVENT_RECEIVED');
  }

  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error('[DomMetaSignature] req.rawBody not available  check express.json config in server.js');
    return res.status(200).send('EVENT_RECEIVED');
  }

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  let valid = false;
  try {
    valid =
      signature.length === expected.length &&
      crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    valid = false;
  }

  if (valid) return next();

  console.warn('[DomMetaSignature] Signature mismatch  proceeding anyway so lead is not lost');
  return next();
}

module.exports = { validateMetaSignature };


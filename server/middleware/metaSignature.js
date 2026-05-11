/**
 * Meta webhook HMAC-SHA256 signature validation middleware.
 *
 * Meta signs every POST request with:
 *   X-Hub-Signature-256: sha256=<HMAC of raw body using APP_SECRET>
 *
 * This middleware validates that signature before the controller ever runs.
 *
 * Behaviour by environment:
 *   production — missing or invalid signature → ACK Meta (200) but drop silently
 *   development — missing signature → warn and allow through (for Postman/curl testing)
 *   development — present but invalid signature → still reject (could be a real attack)
 *
 * IMPORTANT: requires rawBody to be attached to req by express.json verify fn.
 * That is already wired in server.js.
 */

const crypto = require('crypto');

function validateMetaSignature(req, res, next) {
  const appSecret = process.env.META_APP_SECRET;
  const isDev     = process.env.NODE_ENV !== 'production';
  const signature = req.headers['x-hub-signature-256'];

  // ── No APP_SECRET configured ─────────────────────────────────────────────
  if (!appSecret) {
    if (isDev) {
      console.warn('[MetaSignature] META_APP_SECRET not set — skipping signature check (development mode)');
      return next();
    }
    // Production without a secret is a misconfiguration — ACK and drop
    console.error('[MetaSignature] META_APP_SECRET not configured in production — dropping request');
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── No signature header ───────────────────────────────────────────────────
  if (!signature) {
    if (isDev) {
      console.warn('[MetaSignature] No X-Hub-Signature-256 header — allowed in development (Postman/curl)');
      return next();
    }
    console.warn('[MetaSignature] Missing X-Hub-Signature-256 in production — dropping request');
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── Raw body must be present ─────────────────────────────────────────────
  const rawBody = req.rawBody;
  if (!rawBody) {
    console.error('[MetaSignature] req.rawBody not available — verify express.json config in server.js');
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── Compute and compare HMAC ─────────────────────────────────────────────
  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  let valid = false;
  try {
    // timingSafeEqual requires same-length buffers
    valid = crypto.timingSafeEqual(
      Buffer.from(signature.padEnd(expected.length)),
      Buffer.from(expected)
    ) && signature.length === expected.length;
  } catch {
    valid = false;
  }

  if (valid) {
    return next();
  }

  console.warn('[MetaSignature] Signature mismatch — request dropped');
  return res.status(200).send('EVENT_RECEIVED'); // ACK Meta, silently drop
}

module.exports = { validateMetaSignature };

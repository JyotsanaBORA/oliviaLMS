/**
 * Meta Instant Form (Lead Ads) Webhook
 *
 * Two-step flow:
 *   1. GET  /api/webhook/meta  — Meta sends a one-time verification challenge.
 *                                 We echo hub.challenge back to activate the subscription.
 *   2. POST /api/webhook/meta  — Meta notifies us that a new lead was submitted.
 *                                 We validate the X-Hub-Signature-256 header, then call
 *                                 the Graph API to fetch full lead details, map the fields
 *                                 to our WebsiteLead schema, and save to DB.
 *
 * Environment variables required (see server/.env):
 *   META_VERIFY_TOKEN   — any secret string you choose when registering the webhook in Meta
 *   META_APP_SECRET     — your Meta App's App Secret (used to verify POST signatures)
 *   META_ACCESS_TOKEN   — a Page or System User access token with leads_retrieval permission
 */

const express  = require('express');
const crypto   = require('crypto');
const https    = require('https');
const { parse: parseURL } = require('url');
const { parse: parseQS  } = require('querystring');

const WebsiteLead  = require('../models/WebsiteLead');
const Organization = require('../models/Organization');

const router = express.Router();

// ---------------------------------------------------------------------------
// GET /api/webhook/meta — Meta verification challenge
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  // express-mongo-sanitize strips query-string keys that contain dots,
  // so hub.mode / hub.verify_token / hub.challenge are gone from req.query.
  // Parse the raw URL query string directly to get the original Meta params.
  const raw     = parseURL(req.url).query || '';
  const params  = parseQS(raw);

  const mode      = params['hub.mode'];
  const token     = params['hub.verify_token'];
  const challenge = params['hub.challenge'];

  const expected = process.env.META_VERIFY_TOKEN;
  console.log(`[Meta Webhook] GET verify — mode="${mode}" token_match=${token === expected} env_set=${!!expected}`);

  if (mode === 'subscribe' && token === expected) {
    console.log('[Meta Webhook] Verification successful');
    return res.status(200).send(challenge);
  }

  if (!expected) {
    console.error('[Meta Webhook] META_VERIFY_TOKEN is not set in .env — restart the server after editing .env');
  }

  console.warn('[Meta Webhook] Verification failed — token mismatch or wrong mode');
  return res.status(403).json({ error: 'Verification failed' });
});

// ---------------------------------------------------------------------------
// Signature verification helper
// Uses the raw body buffer that server.js captures via express.json verify fn
// ---------------------------------------------------------------------------
function isValidMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;

  // If app secret is not configured, skip in dev; warn loudly
  if (!appSecret) {
    if (process.env.NODE_ENV !== 'production') return true;
    console.error('[Meta Webhook] META_APP_SECRET not set — rejecting all POST events');
    return false;
  }

  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const rawBody = req.rawBody;
  if (!rawBody) return false;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Fetch full lead data from Meta Graph API
// ---------------------------------------------------------------------------
function fetchMetaLead(leadgenId, accessToken) {
  return new Promise((resolve, reject) => {
    const fields = 'field_data,created_time,ad_id,form_id,page_id,ad_name,adset_name,campaign_name';
    const url    = `https://graph.facebook.com/v19.0/${encodeURIComponent(leadgenId)}`
                 + `?fields=${encodeURIComponent(fields)}`
                 + `&access_token=${encodeURIComponent(accessToken)}`;

    https.get(url, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Failed to parse Graph API response'));
        }
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Map Meta field_data array → WebsiteLead fields
// Meta field names vary by form — this handles the common ones.
// Unknown fields are appended to `message` so no data is lost.
// ---------------------------------------------------------------------------
function mapMetaFields(fieldData) {
  const mapped = {};
  if (!Array.isArray(fieldData)) return mapped;

  const extras = [];

  for (const item of fieldData) {
    const key   = (item.name || '').toLowerCase().replace(/\s+/g, '_');
    const value = Array.isArray(item.values) ? (item.values[0] || '').trim() : '';
    if (!value) continue;

    switch (key) {
      case 'full_name':
      case 'name': {
        const parts          = value.split(/\s+/);
        mapped.firstName     = (parts[0] || '').substring(0, 50);
        mapped.lastName      = parts.slice(1).join(' ').substring(0, 50);
        mapped.name          = value.substring(0, 100);
        break;
      }
      case 'first_name':   mapped.firstName = value.substring(0, 50);  break;
      case 'last_name':    mapped.lastName  = value.substring(0, 50);  break;

      case 'email':
      case 'email_address':
        mapped.email = value.toLowerCase().substring(0, 100);
        break;

      case 'phone_number':
      case 'phone':
        mapped.phone = value.replace(/[\s\-\(\)]/g, '').substring(0, 20);
        break;

      case 'street_address':
      case 'address':
        mapped.streetAddress = value.substring(0, 200);
        break;

      case 'city':    mapped.city    = value.substring(0, 100); break;
      case 'state':
      case 'province': mapped.state  = value.substring(0, 50);  break;
      case 'zip':
      case 'zip_code':
      case 'postal_code': mapped.zipCode = value.substring(0, 20); break;

      default:
        // Preserve any unknown custom question as key: value in message
        extras.push(`${item.name}: ${value}`);
    }
  }

  if (extras.length) {
    mapped.message = extras.join('\n').substring(0, 2000);
  }

  // Build full name if we have first/last but not full
  if (!mapped.name && (mapped.firstName || mapped.lastName)) {
    mapped.name = [mapped.firstName, mapped.lastName].filter(Boolean).join(' ').substring(0, 100);
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// POST /api/webhook/meta — Meta lead notification
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  // Always respond 200 immediately — Meta will retry if we don't
  res.status(200).send('EVENT_RECEIVED');

  // Validate signature
  if (!isValidMetaSignature(req)) {
    console.warn('[Meta Webhook] Invalid X-Hub-Signature-256 — request ignored');
    return;
  }

  const body = req.body;

  // Meta sends object: "page" for Lead Ads
  if (!body || body.object !== 'page') {
    return;
  }

  const entries = body.entry || [];

  for (const entry of entries) {
    const pageId  = String(entry.id || '');
    const changes = entry.changes || [];

    for (const change of changes) {
      if (change.field !== 'leadgen') continue;

      const { leadgen_id, form_id, created_time } = change.value || {};
      if (!leadgen_id) continue;

      try {
        // 1. Find which organisation owns this Facebook page
        const org = await Organization.findOne({ metaPageId: pageId, isActive: true }).lean();
        if (!org) {
          console.warn(`[Meta Webhook] No active org found for page_id: ${pageId} — set metaPageId on the organization`);
          continue;
        }

        // 2. Fetch full lead details from Graph API
        const accessToken = process.env.META_ACCESS_TOKEN;
        if (!accessToken) {
          console.error('[Meta Webhook] META_ACCESS_TOKEN not configured in .env');
          continue;
        }

        const leadData = await fetchMetaLead(leadgen_id, accessToken);

        if (leadData.error) {
          console.error('[Meta Webhook] Graph API error for leadgen_id', leadgen_id, leadData.error);
          continue;
        }

        // 3. Map Meta fields to our schema
        const fields = mapMetaFields(leadData.field_data);

        if (!fields.name && !fields.firstName) {
          console.warn('[Meta Webhook] Lead missing name — skipping leadgen_id:', leadgen_id);
          continue;
        }

        // 4. Build WebsiteLead document
        const doc = {
          organization:  org._id,
          source:        'meta',
          formType:      'meta-lead-form',
          firstName:     fields.firstName   || undefined,
          lastName:      fields.lastName    || undefined,
          name:          fields.name        || fields.firstName,
          email:         fields.email       || undefined,
          phone:         fields.phone       || undefined,
          streetAddress: fields.streetAddress || undefined,
          city:          fields.city        || undefined,
          state:         fields.state       || undefined,
          zipCode:       fields.zipCode     || undefined,
          message:       fields.message     || undefined,
          smsOptIn:      false,
          rawPayload: {
            source:       'meta',
            pageId,
            formId:       form_id,
            leadgenId:    leadgen_id,
            createdTime:  created_time,
            adName:       leadData.ad_name       || null,
            adsetName:    leadData.adset_name    || null,
            campaignName: leadData.campaign_name || null,
            graphData:    leadData,
          },
        };

        // Remove undefined fields to keep document clean
        Object.keys(doc).forEach(k => { if (doc[k] === undefined) delete doc[k]; });

        // 5. Save to same WebsiteLead collection (shared review pipeline)
        const websiteLead = await WebsiteLead.create(doc);

        // 6. Real-time notification to admins (same event as website leads)
        if (req.io) {
          req.io.emit('newWebsiteLead', {
            _id:      websiteLead._id,
            name:     websiteLead.name,
            source:   'meta',
            formType: 'meta-lead-form',
            createdAt: websiteLead.createdAt,
          });
        }

        console.log(`[Meta Webhook] Lead saved: ${websiteLead.name} | org: ${org.name} | leadgen_id: ${leadgen_id}`);

      } catch (err) {
        console.error('[Meta Webhook] Error processing leadgen_id', leadgen_id, ':', err.message);
      }
    }
  }
});

module.exports = router;

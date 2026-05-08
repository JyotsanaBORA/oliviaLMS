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
  const isDev     = process.env.NODE_ENV !== 'production';

  // No app secret configured at all
  if (!appSecret) {
    if (isDev) return true; // allow in dev, warn loudly in prod
    console.error('[Meta Webhook] META_APP_SECRET not set — rejecting all POST events');
    return false;
  }

  const signature = req.headers['x-hub-signature-256'];

  // In development, allow requests without a signature header (local Postman/curl testing).
  // In production, always require it.
  if (!signature) {
    if (isDev) {
      console.warn('[Meta Webhook] No X-Hub-Signature-256 header — allowed in development mode');
      return true;
    }
    return false;
  }

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
// Handles every standard Meta Instant Form field name.
// Any unrecognised custom question is appended to `message` — no data lost.
// ---------------------------------------------------------------------------
function mapMetaFields(fieldData) {
  const mapped = {};
  if (!Array.isArray(fieldData)) return mapped;

  const extras = [];

  for (const item of fieldData) {
    const key   = (item.name || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
    const value = Array.isArray(item.values) ? (item.values[0] || '').trim() : '';
    if (!value) continue;

    switch (key) {
      // ── Name variants ──────────────────────────────────────────────────
      case 'full_name':
      case 'name': {
        const parts      = value.split(/\s+/);
        mapped.firstName = (parts[0] || '').substring(0, 50);
        mapped.lastName  = parts.slice(1).join(' ').substring(0, 50);
        mapped.name      = value.substring(0, 100);
        break;
      }
      case 'first_name':
      case 'firstname':
        mapped.firstName = value.substring(0, 50);
        break;
      case 'last_name':
      case 'lastname':
      case 'surname':
        mapped.lastName = value.substring(0, 50);
        break;

      // ── Contact ─────────────────────────────────────────────────────────
      case 'email':
      case 'email_address':
      case 'work_email':
        mapped.email = value.toLowerCase().substring(0, 100);
        break;

      case 'phone_number':
      case 'phone':
      case 'mobile_number':
      case 'mobile':
      case 'contact_number':
        mapped.phone = value.replace(/[\s\-\(\)\.]/g, '').substring(0, 20);
        break;

      // ── Address ─────────────────────────────────────────────────────────
      case 'street_address':
      case 'address':
      case 'street':
        mapped.streetAddress = value.substring(0, 200);
        break;
      case 'city':
      case 'town':
        mapped.city = value.substring(0, 100);
        break;
      case 'state':
      case 'province':
      case 'region':
        mapped.state = value.substring(0, 50);
        break;
      case 'zip':
      case 'zip_code':
      case 'postal_code':
      case 'postcode':
        mapped.zipCode = value.substring(0, 20);
        break;

      // ── Debt / financial (matches your qualify-form fields) ─────────────
      case 'total_debt':
      case 'debt_amount':
      case 'total_debt_amount':
      case 'how_much_debt':
      case 'amount_of_debt': {
        const n = Number(value.replace(/[^0-9.]/g, ''));
        if (!isNaN(n) && n >= 0) mapped.totalDebtAmount = n;
        break;
      }

      // ── Message / comments ───────────────────────────────────────────────
      case 'message':
      case 'comment':
      case 'comments':
      case 'notes':
      case 'how_can_we_help':
      case 'description':
        mapped.message = value.substring(0, 2000);
        break;

      default:
        // All unrecognised custom questions stored verbatim in message
        extras.push(`${item.name}: ${value}`);
    }
  }

  // Merge extras into message (append after any recognised message)
  if (extras.length) {
    const prefix    = mapped.message ? mapped.message + '\n\n' : '';
    mapped.message  = (prefix + extras.join('\n')).substring(0, 2000);
  }

  // Build full name from parts if we only got first/last
  if (!mapped.name && (mapped.firstName || mapped.lastName)) {
    mapped.name = [mapped.firstName, mapped.lastName].filter(Boolean).join(' ').substring(0, 100);
  }

  return mapped;
}

// ---------------------------------------------------------------------------
// Extract the core lead notification value from whatever POST body Meta sends.
//
// Meta sends TWO different payload shapes:
//
//  A) Real webhook (production):
//     { object: "page", entry: [{ id: PAGE_ID, changes: [{ field: "leadgen", value: {...} }] }] }
//
//  B) "Send to My Server" test from Meta Developer Portal:
//     { sample: { field: "leadgen", value: { leadgen_id, page_id, form_id, ... } },
//       sub_field_options: null, sample_context_metadata: null }
//
// Returns array of { leadgenId, pageId, formId, createdTime, isTest }
// ---------------------------------------------------------------------------
function extractLeadEvents(body) {
  const events = [];
  if (!body) return events;

  // ── Format B: test / sample payload ──────────────────────────────────────
  if (body.sample && body.sample.field === 'leadgen' && body.sample.value) {
    const v = body.sample.value;
    events.push({
      leadgenId:   String(v.leadgen_id  || ''),
      pageId:      String(v.page_id     || ''),
      formId:      String(v.form_id     || ''),
      createdTime: v.created_time || null,
      adId:        String(v.ad_id       || ''),
      adgroupId:   String(v.adgroup_id  || ''),
      isTest:      true,
    });
    return events;
  }

  // ── Format A: real webhook payload ───────────────────────────────────────
  if (body.object === 'page' && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      const pageId  = String(entry.id || '');
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;
        const v = change.value || {};
        events.push({
          leadgenId:   String(v.leadgen_id  || ''),
          pageId:      v.page_id ? String(v.page_id) : pageId,
          formId:      String(v.form_id     || ''),
          createdTime: v.created_time || null,
          adId:        String(v.ad_id       || ''),
          adgroupId:   String(v.adgroup_id  || ''),
          isTest:      false,
        });
      }
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// POST /api/webhook/meta — Meta lead notification (real + test)
// ---------------------------------------------------------------------------
router.post('/', async (req, res) => {
  // Always ACK immediately — Meta retries on non-200
  res.status(200).send('EVENT_RECEIVED');

  // Signature check
  if (!isValidMetaSignature(req)) {
    console.warn('[Meta Webhook] Invalid X-Hub-Signature-256 — request ignored');
    return;
  }

  const events = extractLeadEvents(req.body);

  if (!events.length) {
    console.log('[Meta Webhook] POST received but no leadgen events found — body:', JSON.stringify(req.body));
    return;
  }

  const accessToken = process.env.META_ACCESS_TOKEN;

  for (const event of events) {
    const { leadgenId, pageId, formId, createdTime, adId, adgroupId, isTest } = event;
    console.log(`[Meta Webhook] leadgen event — leadgenId=${leadgenId} pageId=${pageId} isTest=${isTest}`);

    try {
      // 1. Find organisation by Facebook Page ID
      let org = await Organization.findOne({ metaPageId: pageId, isActive: true }).lean();

      // In dev/test mode with fake page IDs, fall back to first active org
      if (!org && (isTest || process.env.NODE_ENV !== 'production')) {
        org = await Organization.findOne({ isActive: true }).lean();
        if (org) {
          console.warn(`[Meta Webhook] No org for page_id ${pageId} — falling back to "${org.name}" (dev/test mode)`);
        }
      }

      if (!org) {
        console.warn(`[Meta Webhook] No active org found for page_id: ${pageId} — set metaPageId on the organization`);
        continue;
      }

      // 2. Attempt to fetch full lead data from Graph API
      let graphData   = null;
      let mappedFields = {};

      if (accessToken && leadgenId && !leadgenId.startsWith('444')) {
        // Real leadgen_id — fetch from Graph API
        graphData = await fetchMetaLead(leadgenId, accessToken);
        if (graphData.error) {
          console.warn(`[Meta Webhook] Graph API error for leadgen_id ${leadgenId}:`, graphData.error.message);
          graphData = null;
        } else {
          mappedFields = mapMetaFields(graphData.field_data);
        }
      } else if (isTest) {
        console.log(`[Meta Webhook] Test event with fake leadgen_id (${leadgenId}) — skipping Graph API call`);
        // Synthesise a test name so the lead saves successfully
        mappedFields = {
          firstName: 'Meta',
          lastName:  'Test Lead',
          name:      'Meta Test Lead',
          message:   `Test event from Meta Developer Portal\nPage ID: ${pageId}\nForm ID: ${formId}`,
        };
      }

      // 3. Build WebsiteLead document from whatever we have
      const doc = {
        organization:  org._id,
        source:        'meta',
        formType:      'meta-lead-form',
        smsOptIn:      false,
        rawPayload: {
          source:       'meta',
          isTest,
          pageId,
          formId,
          leadgenId,
          adId,
          adgroupId,
          createdTime,
          adName:       graphData?.ad_name       || null,
          adsetName:    graphData?.adset_name    || null,
          campaignName: graphData?.campaign_name || null,
          graphData:    graphData || null,
          originalBody: req.body,
        },
      };

      // Apply mapped fields — only set fields that have a value
      const fieldKeys = ['firstName','lastName','name','email','phone','streetAddress','city','state','zipCode','totalDebtAmount','message'];
      for (const k of fieldKeys) {
        if (mappedFields[k] !== undefined && mappedFields[k] !== null && mappedFields[k] !== '') {
          doc[k] = mappedFields[k];
        }
      }

      // Need at least a name to save
      if (!doc.name && !doc.firstName) {
        console.warn(`[Meta Webhook] No name found for leadgen_id ${leadgenId} — saving with placeholder`);
        doc.name = `Meta Lead (${leadgenId})`.substring(0, 100);
      }

      // 4. Save to WebsiteLead collection
      const websiteLead = await WebsiteLead.create(doc);

      // 5. Realtime notification to admin dashboard
      if (req.io) {
        req.io.emit('newWebsiteLead', {
          _id:      websiteLead._id,
          name:     websiteLead.name,
          source:   'meta',
          formType: 'meta-lead-form',
          isTest,
          createdAt: websiteLead.createdAt,
        });
      }

      console.log(`[Meta Webhook] ✓ Lead saved: "${websiteLead.name}" | org: ${org.name} | leadgenId: ${leadgenId} | isTest: ${isTest}`);

    } catch (err) {
      console.error(`[Meta Webhook] Error processing leadgen_id ${leadgenId}:`, err.message);
    }
  }
});

module.exports = router;


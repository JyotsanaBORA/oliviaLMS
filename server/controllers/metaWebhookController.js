/**
 * Meta Webhook Controller
 *
 * Handles two routes:
 *   GET  /api/webhook/meta  — one-time verification challenge from Meta
 *   POST /api/webhook/meta  — lead notification events from Meta Lead Ads
 *
 * Architecture:
 *   - Controller handles HTTP concerns only (request/response, logging)
 *   - metaLeadService handles Graph API fetching
 *   - metaFieldParser handles universal dynamic field mapping
 *   - WebsiteLead model stores everything (same collection as website leads)
 *
 * Supports two payload formats Meta can send:
 *   A) Real webhook: { object: "page", entry: [...] }
 *   B) Developer Portal test: { sample: { field: "leadgen", value: {...} } }
 *
 * Duplicate prevention: leadgen_id is stored with a unique sparse index.
 * If a leadgen_id already exists the lead is silently skipped and logged.
 */

const { parse: parseURL } = require('url');
const { parse: parseQS  } = require('querystring');

const WebsiteLead         = require('../models/WebsiteLead');
const Organization        = require('../models/Organization');
const { fetchLeadFromGraph }   = require('../services/metaLeadService');
const { parseMetaFieldData }   = require('../utils/metaFieldParser');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Detect whether a leadgen_id is a Meta fake/test ID (all same digits like 444…)
 */
function isFakeLeadgenId(id) {
  return /^(\d)\1+$/.test(String(id));
}

/**
 * Extract normalised lead events from whichever payload format Meta sends.
 *
 * Returns array of event objects:
 * { leadgenId, pageId, formId, adId, adgroupId, createdTime, isTest }
 */
function extractLeadEvents(body) {
  const events = [];
  if (!body) return events;

  // ── Format B: Developer Portal "Send to My Server" test ──────────────────
  if (body.sample?.field === 'leadgen' && body.sample?.value) {
    const v = body.sample.value;
    events.push({
      leadgenId:   String(v.leadgen_id  || ''),
      pageId:      String(v.page_id     || ''),
      formId:      String(v.form_id     || ''),
      adId:        String(v.ad_id       || ''),
      adgroupId:   String(v.adgroup_id  || ''),
      createdTime: v.created_time || null,
      isTest:      true,
    });
    return events;
  }

  // ── Format A: Real production webhook ────────────────────────────────────
  if (body.object === 'page' && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      const pageIdFromEntry = String(entry.id || '');
      for (const change of (entry.changes || [])) {
        if (change.field !== 'leadgen') continue;
        const v = change.value || {};
        events.push({
          leadgenId:   String(v.leadgen_id  || ''),
          pageId:      v.page_id ? String(v.page_id) : pageIdFromEntry,
          formId:      String(v.form_id     || ''),
          adId:        String(v.ad_id       || ''),
          adgroupId:   String(v.adgroup_id  || ''),
          createdTime: v.created_time || null,
          isTest:      false,
        });
      }
    }
  }

  return events;
}

/**
 * Find the organisation that owns a given Facebook Page.
 * In development/test, falls back to the first active org if no match found.
 */
async function resolveOrganisation(pageId) {
  let org = await Organization.findOne({ metaPageId: pageId, isActive: true }).lean();

  if (!org && process.env.NODE_ENV !== 'production') {
    org = await Organization.findOne({ isActive: true }).lean();
    if (org) {
      console.warn(`[MetaWebhook] No org mapped to page_id "${pageId}" — falling back to "${org.name}" (dev/test)`);
    }
  }

  return org;
}

// ─── Controller methods ───────────────────────────────────────────────────────

/**
 * GET /api/webhook/meta
 * Meta one-time verification challenge.
 *
 * express-mongo-sanitize strips dot-notation keys from req.query,
 * so we read directly from the raw URL query string.
 */
function verify(req, res) {
  const raw    = parseURL(req.url).query || '';
  const params = parseQS(raw);

  const mode      = params['hub.mode'];
  const token     = params['hub.verify_token'];
  const challenge = params['hub.challenge'];
  const expected  = process.env.META_VERIFY_TOKEN;

  console.log(`[MetaWebhook] GET verify — mode="${mode}" match=${token === expected} env_set=${!!expected}`);

  if (!expected) {
    console.error('[MetaWebhook] META_VERIFY_TOKEN not set in .env');
    return res.status(403).json({ error: 'Server misconfiguration' });
  }

  if (mode === 'subscribe' && token === expected) {
    console.log('[MetaWebhook] ✓ Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[MetaWebhook] Verification failed — token mismatch or wrong mode');
  return res.status(403).json({ error: 'Verification failed' });
}

/**
 * POST /api/webhook/meta
 * Receive Meta lead notification, fetch full data, save to WebsiteLead.
 *
 * Always responds 200 immediately (before async processing) so Meta
 * does not retry due to slow response. Processing runs asynchronously.
 */
function receive(req, res) {
  // ACK Meta immediately — MUST respond within 20 seconds or Meta retries
  res.status(200).send('EVENT_RECEIVED');

  // Run processing async so the HTTP response is already sent
  processWebhookEvents(req).catch(err => {
    console.error('[MetaWebhook] Unhandled error in processWebhookEvents:', err.message);
  });
}

// ─── Async processing (runs after 200 is already sent to Meta) ────────────────

async function processWebhookEvents(req) {
  const events = extractLeadEvents(req.body);

  if (!events.length) {
    console.log('[MetaWebhook] POST received — no leadgen events found. Body object:', req.body?.object || 'unknown');
    return;
  }

  console.log(`[MetaWebhook] Processing ${events.length} leadgen event(s)`);

  for (const event of events) {
    await processSingleEvent(req, event);
  }
}

async function processSingleEvent(req, event) {
  const { leadgenId, pageId, formId, adId, adgroupId, createdTime, isTest } = event;
  const tag = `leadgenId=${leadgenId} pageId=${pageId} isTest=${isTest}`;

  if (!leadgenId) {
    console.warn(`[MetaWebhook] Skipping event with empty leadgen_id (pageId=${pageId})`);
    return;
  }

  try {
    // ── 1. Duplicate check ────────────────────────────────────────────────
    const exists = await WebsiteLead.exists({ 'rawPayload.leadgenId': leadgenId });
    if (exists) {
      console.log(`[MetaWebhook] Duplicate — leadgenId ${leadgenId} already saved. Skipping.`);
      return;
    }

    // ── 2. Resolve organisation ───────────────────────────────────────────
    const org = await resolveOrganisation(pageId);
    if (!org) {
      console.warn(`[MetaWebhook] No active org for page_id "${pageId}" — set metaPageId on the organization`);
      return;
    }

    // ── 3. Fetch / synthesise lead data ───────────────────────────────────
    let graphData    = null;
    let parsedFields = {};
    let schemaFields = {};

    const realId = !isFakeLeadgenId(leadgenId);

    if (realId) {
      // Real lead — call Graph API
      console.log(`[MetaWebhook] Fetching lead from Graph API — ${tag}`);
      try {
        graphData = await fetchLeadFromGraph(leadgenId);
        console.log(`[MetaWebhook] Graph API response received — fields: ${graphData.field_data?.length ?? 0}`);
        ({ parsedFields, schemaFields } = parseMetaFieldData(graphData.field_data));
      } catch (err) {
        console.error(`[MetaWebhook] Graph API fetch failed for ${leadgenId}: ${err.message}`);
        // Save partial record so the lead isn't lost — admin can follow up
        schemaFields.name    = `Meta Lead (${leadgenId})`;
        schemaFields.message = `Graph API fetch failed: ${err.message}`;
      }
    } else {
      // Test / fake ID from Developer Portal
      console.log(`[MetaWebhook] Test event — fake leadgen_id detected, skipping Graph API call`);
      schemaFields.name    = 'Meta Test Lead';
      schemaFields.message = `Test event from Meta Developer Portal\nPage ID: ${pageId}\nForm ID: ${formId}`;
      parsedFields         = { _test: 'true', page_id: pageId, form_id: formId };
    }

    // ── 4. Build WebsiteLead document ─────────────────────────────────────
    const doc = {
      organization: org._id,
      source:       'meta',
      formType:     'meta-lead-form',
      smsOptIn:     false,

      // Schema-mapped contact fields (only set if we have a value)
      ...(schemaFields.firstName     && { firstName:     schemaFields.firstName }),
      ...(schemaFields.lastName      && { lastName:      schemaFields.lastName }),
      ...(schemaFields.name          && { name:          schemaFields.name }),
      ...(schemaFields.email         && { email:         schemaFields.email }),
      ...(schemaFields.phone         && { phone:         schemaFields.phone }),
      ...(schemaFields.streetAddress && { streetAddress: schemaFields.streetAddress }),
      ...(schemaFields.city          && { city:          schemaFields.city }),
      ...(schemaFields.state         && { state:         schemaFields.state }),
      ...(schemaFields.zipCode       && { zipCode:       schemaFields.zipCode }),
      ...(schemaFields.message       && { message:       schemaFields.message }),
      ...(schemaFields.totalDebtAmount != null && { totalDebtAmount: schemaFields.totalDebtAmount }),

      // All raw Meta fields stored verbatim — never lose custom questions
      parsedFields,

      // Full audit trail
      rawPayload: {
        source:       'meta',
        isTest,
        leadgenId,
        pageId,
        formId,
        adId,
        adgroupId,
        createdTime,
        adName:       graphData?.ad_name       || null,
        adsetName:    graphData?.adset_name    || null,
        campaignName: graphData?.campaign_name || null,
        graphData:    graphData || null,
        receivedAt:   new Date().toISOString(),
      },
    };

    // Ensure we always have a name
    if (!doc.name && !doc.firstName) {
      doc.name = `Meta Lead (${leadgenId})`.substring(0, 100);
    }

    // ── 5. Save to WebsiteLead collection ─────────────────────────────────
    const saved = await WebsiteLead.create(doc);
    console.log(`[MetaWebhook] ✓ Lead saved — "${saved.name}" | org: ${org.name} | ${tag}`);

    // ── 6. Real-time socket notification to admin dashboard ───────────────
    if (req.io) {
      req.io.emit('newWebsiteLead', {
        _id:      saved._id,
        name:     saved.name,
        email:    saved.email  || null,
        phone:    saved.phone  || null,
        source:   'meta',
        formType: 'meta-lead-form',
        isTest,
        createdAt: saved.createdAt,
      });
    }

  } catch (err) {
    // Duplicate key error from the DB unique index — safe to ignore
    if (err.code === 11000) {
      console.log(`[MetaWebhook] DB duplicate key for leadgenId ${leadgenId} — skipped`);
      return;
    }
    console.error(`[MetaWebhook] Error processing ${tag}: ${err.message}`);
  }
}

module.exports = { verify, receive };

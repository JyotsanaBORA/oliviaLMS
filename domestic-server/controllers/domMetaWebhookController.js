'use strict';
/**
 * Meta Webhook Controller — domestic LMS.
 *
 * Routes:
 *   GET  /domestic-api/webhook/meta  — Meta one-time verification challenge
 *   POST /domestic-api/webhook/meta  — Meta lead notification events
 *
 * Flow:
 *   POST → ACK Meta immediately with 200 → process async in background
 *   Lead fetched from Graph API → parsed → saved as DomWebsiteLead (status=new)
 *   Socket.io notifies connected agents of the new lead in real-time.
 *
 * Supports two Meta payload formats:
 *   A) Production:        { object: "page", entry: [...] }
 *   B) Developer Portal:  { sample: { field: "leadgen", value: {...} } }
 *
 * Deduplication: metaLeadgenId has a unique sparse index on DomWebsiteLead.
 */

const { parse: parseURL } = require('url');
const { parse: parseQS  } = require('querystring');

const DomWebsiteLead            = require('../models/DomWebsiteLead');
const { fetchLeadFromGraph }    = require('../services/metaLeadService');
const { parseDomMetaFieldData } = require('../utils/domMetaFieldParser');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Meta test IDs are all the same digit repeated (e.g. 4444444444). */
function isFakeLeadgenId(id) {
  return /^(\d)\1+$/.test(String(id));
}

/**
 * Extract normalised lead events from whatever payload format Meta sends.
 * Returns array of { leadgenId, pageId, formId, adId, adgroupId, createdTime, isTest }.
 */
function extractLeadEvents(body) {
  const events = [];
  if (!body) return events;

  // Format B — Developer Portal "Send to My Server" test button
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

  // Format A — production webhook
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

// ── Controller exports ────────────────────────────────────────────────────────

/**
 * GET /domestic-api/webhook/meta
 * Meta one-time verification challenge.
 *
 * express-mongo-sanitize strips dot-notation keys from req.query so we read
 * hub.mode / hub.verify_token / hub.challenge directly from the raw URL.
 */
function verify(req, res) {
  const raw    = parseURL(req.url).query || '';
  const params = parseQS(raw);

  const mode      = params['hub.mode'];
  const token     = params['hub.verify_token'];
  const challenge = params['hub.challenge'];
  const expected  = process.env.DOM_META_VERIFY_TOKEN || process.env.META_VERIFY_TOKEN;

  console.log(`[DomMetaWebhook] GET verify — mode="${mode}" match=${token === expected} env_set=${!!expected}`);

  if (!expected) {
    console.error('[DomMetaWebhook] DOM_META_VERIFY_TOKEN not set in .env');
    return res.status(403).json({ error: 'Server misconfiguration' });
  }

  if (mode === 'subscribe' && token === expected) {
    console.log('[DomMetaWebhook] ✓ Verification successful');
    return res.status(200).send(challenge);
  }

  console.warn('[DomMetaWebhook] Verification failed — token mismatch or wrong mode');
  return res.status(403).json({ error: 'Verification failed' });
}

/**
 * POST /domestic-api/webhook/meta
 * Receive Meta lead notification and process asynchronously.
 *
 * Always responds 200 immediately — Meta will retry if we don't ACK in 20 s.
 */
function receive(req, res) {
  // ACK Meta before any async work
  res.status(200).send('EVENT_RECEIVED');

  const io = req.app.get('io');
  processWebhookEvents(req, io).catch(err => {
    console.error('[DomMetaWebhook] Unhandled error in processWebhookEvents:', err.message);
  });
}

// ── Async processing (runs after 200 already sent) ────────────────────────────

async function processWebhookEvents(req, io) {
  const events = extractLeadEvents(req.body);

  if (!events.length) {
    console.log('[DomMetaWebhook] POST received — no leadgen events. Body object:', req.body?.object || 'unknown');
    return;
  }

  console.log(`[DomMetaWebhook] Processing ${events.length} leadgen event(s)`);
  for (const event of events) {
    await processSingleEvent(event, io);
  }
}

async function processSingleEvent(event, io) {
  const { leadgenId, pageId, formId, adId, adgroupId, createdTime, isTest } = event;
  const tag = `leadgenId=${leadgenId} pageId=${pageId} isTest=${isTest}`;

  if (!leadgenId) {
    console.warn(`[DomMetaWebhook] Skipping event with empty leadgen_id (pageId=${pageId})`);
    return;
  }

  try {
    // ── 1. Duplicate check ────────────────────────────────────────────────
    const exists = await DomWebsiteLead.exists({ metaLeadgenId: leadgenId });
    if (exists) {
      console.log(`[DomMetaWebhook] Duplicate — leadgenId ${leadgenId} already saved. Skipping.`);
      return;
    }

    // ── 2. Fetch / synthesise lead data ───────────────────────────────────
    let graphData    = null;
    let parsedFields = {};
    let schemaFields = {};

    const realId = !isTest && !isFakeLeadgenId(leadgenId);

    if (realId) {
      console.log(`[DomMetaWebhook] Fetching from Graph API — ${tag}`);
      try {
        graphData = await fetchLeadFromGraph(leadgenId);
        console.log(`[DomMetaWebhook] Graph API fields: ${graphData.field_data?.length ?? 0}`);
        ({ parsedFields, schemaFields } = parseDomMetaFieldData(graphData.field_data));
      } catch (err) {
        console.error(`[DomMetaWebhook] Graph API fetch failed for ${leadgenId}: ${err.message}`);
        // Save partial record so lead is not lost
        schemaFields.name        = `Meta Lead (${leadgenId})`;
        schemaFields.customNotes = `Graph API fetch failed: ${err.message}`;
      }
    } else {
      // Test / fake ID from Developer Portal
      console.log(`[DomMetaWebhook] Test event — fake leadgen_id detected, skipping Graph API`);
      schemaFields.name        = 'Meta Test Lead';
      schemaFields.customNotes = `Test event from Meta Developer Portal\nPage ID: ${pageId}\nForm ID: ${formId}`;
      parsedFields             = { _test: 'true', page_id: pageId, form_id: formId };
    }

    // ── 3. Build DomWebsiteLead document ─────────────────────────────────
    // Synthesise name from first+last if only separate parts came through
    const fullName = schemaFields.name
      || [schemaFields.firstName, schemaFields.lastName].filter(Boolean).join(' ')
      || undefined;

    const doc = {
      source:         'meta',
      metaLeadgenId:  leadgenId,

      // Schema-mapped fields (only set if we have a value)
      ...(fullName                   && { name:          fullName }),
      ...(schemaFields.mobile        && { mobile:        schemaFields.mobile }),
      ...(schemaFields.city          && { city:          schemaFields.city }),
      ...(schemaFields.monthlyIncome && { monthlyIncome: schemaFields.monthlyIncome }),
      ...(schemaFields.employment    && { employment:    schemaFields.employment }),
      ...(schemaFields.productType   && { productType:   schemaFields.productType }),
      ...(schemaFields.pan           && { pan:           schemaFields.pan }),
      ...(schemaFields.utmSource     && { utmSource:     schemaFields.utmSource }),
      ...(schemaFields.utmMedium     && { utmMedium:     schemaFields.utmMedium }),
      ...(schemaFields.utmCampaign   && { utmCampaign:   schemaFields.utmCampaign }),
      ...(schemaFields.sourcePage    && { sourcePage:    schemaFields.sourcePage }),
      ...(schemaFields.customNotes   && { customNotes:   schemaFields.customNotes }),

      // All raw Meta fields stored verbatim — never lose custom questions
      parsedFields,

      // Full audit trail
      metaRawPayload: {
        isTest,
        leadgenId,
        pageId,
        formId,
        adId,
        adgroupId,
        createdTime,
        adName:      graphData?.ad_name      || null,
        adsetName:   graphData?.adset_name   || null,
        campaignName: graphData?.campaign_name || null,
        receivedAt:  new Date().toISOString(),
      },

      status: 'new',
    };

    const lead = await DomWebsiteLead.create(doc);
    console.log(`[DomMetaWebhook] ✓ Saved DomWebsiteLead ${lead._id} — name="${fullName || 'unknown'}" mobile="${schemaFields.mobile || '-'}" ${tag}`);

    // ── 4. Real-time notification to agents ───────────────────────────────
    if (io) {
      io.to('domagents').emit('new_website_lead', {
        _id:         lead._id,
        name:        lead.name,
        mobile:      lead.mobile,
        city:        lead.city,
        productType: lead.productType,
        source:      'meta',
        createdAt:   lead.createdAt,
      });
    }

  } catch (err) {
    console.error(`[DomMetaWebhook] Error processing event ${tag}:`, err.message);
  }
}

module.exports = { verify, receive };

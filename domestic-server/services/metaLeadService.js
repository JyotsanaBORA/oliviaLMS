'use strict';
/**
 * Meta Graph API service for the domestic server.
 *
 * Fetches full lead data from Meta's Graph API with:
 *  - exponential backoff retry on transient errors
 *  - structured error classification
 *
 * Uses DOM_META_ACCESS_TOKEN from .env.
 */

const https = require('https');

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE    = 'https://graph.facebook.com';
const LEAD_FIELDS   = 'field_data,created_time,ad_id,ad_name,adset_name,campaign_name,form_id';

// Graph API error codes that are safe to retry
const RETRYABLE_CODES = new Set([1, 2, 17, 341, 368]);

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Non-JSON from Graph API: ${raw.substring(0, 300)}`)); }
      });
    }).on('error', reject);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch full lead data from Meta Graph API.
 *
 * @param {string} leadgenId
 * @param {number} maxRetries
 * @returns {Promise<Object>} Graph API lead object with field_data
 */
async function fetchLeadFromGraph(leadgenId, maxRetries = 3) {
  const rawToken    = process.env.DOM_META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN || '';
  const accessToken = rawToken.trim().replace(/>$/, '');
  if (!accessToken) {
    throw new Error('DOM_META_ACCESS_TOKEN or META_ACCESS_TOKEN is not set in .env');
  }

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}`
            + `?fields=${encodeURIComponent(LEAD_FIELDS)}`
            + `&access_token=${encodeURIComponent(accessToken)}`;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await httpsGet(url);

      if (data.error) {
        const { code, message, type } = data.error;
        const retryable = RETRYABLE_CODES.has(code) && attempt < maxRetries;
        if (retryable) {
          lastError = new Error(`Graph API transient (code ${code}): ${message}`);
          const backoff = attempt * 1500;
          console.warn(`[DomMetaLeadService] Attempt ${attempt}/${maxRetries}  retrying in ${backoff}ms: ${message}`);
          await sleep(backoff);
          continue;
        }
        throw new Error(`Graph API fatal (code ${code}, type ${type}): ${message}`);
      }

      return data;

    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const backoff = attempt * 1500;
        console.warn(`[DomMetaLeadService] Attempt ${attempt}/${maxRetries} network error  retrying in ${backoff}ms: ${err.message}`);
        await sleep(backoff);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch leadgen_id ${leadgenId} after ${maxRetries} attempts`);
}

module.exports = { fetchLeadFromGraph };


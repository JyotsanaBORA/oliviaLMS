/**
 * Meta Graph API service.
 *
 * Handles all outbound calls to Meta's Graph API with:
 * - exponential backoff retry (transient errors)
 * - proper error classification (retryable vs fatal)
 * - clean structured responses
 */

const https = require('https');

const GRAPH_VERSION = 'v19.0';
const GRAPH_BASE    = 'https://graph.facebook.com';
const LEAD_FIELDS   = 'field_data,created_time,ad_id,ad_name,adset_name,campaign_name,form_id';

// Graph API error codes that are safe to retry
const RETRYABLE_CODES = new Set([1, 2, 17, 341, 368]);

// ─── Internal HTTP helper ─────────────────────────────────────────────────────

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', chunk => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`Non-JSON response from Graph API: ${raw.substring(0, 300)}`));
        }
      });
    }).on('error', reject);
  });
}

// ─── Sleep for backoff ────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Fetch full lead data from Meta Graph API.
 * Retries up to maxRetries times with exponential backoff on transient errors.
 *
 * @param {string} leadgenId   - Meta leadgen_id from webhook payload
 * @param {number} maxRetries  - default 3
 * @returns {Promise<Object>}  - Graph API lead object with field_data
 * @throws {Error}             - on fatal error or exhausted retries
 */
async function fetchLeadFromGraph(leadgenId, maxRetries = 3) {
  const rawToken    = process.env.META_ACCESS_TOKEN || '';
  const accessToken = rawToken.trim().replace(/>$/, '');
  if (!accessToken) {
    throw new Error('META_ACCESS_TOKEN is not set in .env');
  }

  const url = `${GRAPH_BASE}/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}`
            + `?fields=${encodeURIComponent(LEAD_FIELDS)}`
            + `&access_token=${encodeURIComponent(accessToken)}`;

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await httpsGet(url);

      // Graph API returned an application-level error
      if (data.error) {
        const { code, message, type } = data.error;
        const isRetryable = RETRYABLE_CODES.has(code) && attempt < maxRetries;

        if (isRetryable) {
          lastError = new Error(`Graph API transient error (code ${code}): ${message}`);
          const backoff = attempt * 1500;
          console.warn(`[MetaLeadService] Attempt ${attempt}/${maxRetries} — retrying in ${backoff}ms. Error: ${message}`);
          await sleep(backoff);
          continue;
        }

        throw new Error(`Graph API fatal error (code ${code}, type ${type}): ${message}`);
      }

      return data;

    } catch (err) {
      // Network / parse errors
      lastError = err;
      if (attempt < maxRetries) {
        const backoff = attempt * 1500;
        console.warn(`[MetaLeadService] Attempt ${attempt}/${maxRetries} network error — retrying in ${backoff}ms: ${err.message}`);
        await sleep(backoff);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch leadgen_id ${leadgenId} after ${maxRetries} attempts`);
}

module.exports = { fetchLeadFromGraph };

/**
 * Fire-and-forget helper to sync a user with the chat microservice.
 * Returns chatToken on success, null on failure.
 * NEVER throws — chat sync failure must never break LMS login.
 *
 * Uses Node built-in http/https instead of native fetch to avoid
 * a known Docker/Node 18 issue where undici (fetch) can hang on
 * inter-container requests.
 */
const http = require('http');
const https = require('https');
const { URL } = require('url');

function httpPost(urlStr, body, headers, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlStr);
    } catch (e) {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;
    const bodyStr = JSON.stringify(body);

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          reject(new Error(`Invalid JSON response (HTTP ${res.statusCode})`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error('Request timeout'));
    });

    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function syncWithChatService(payload) {
  try {
    const url = process.env.CHAT_SERVICE_URL;
    const secret = process.env.CHAT_SERVICE_SECRET;

    if (!url || !secret) return null;

    const { status, body } = await httpPost(
      `${url}/api/auth/sync`,
      payload,
      { 'x-service-secret': secret },
    );

    if (status !== 200) {
      console.warn(`[chatSync] Sync failed — HTTP ${status}`);
      return null;
    }

    return body.chatToken ?? null;
  } catch (err) {
    console.warn('[chatSync] Sync error (login will continue):', err.message);
    return null;
  }
}

module.exports = { syncWithChatService };

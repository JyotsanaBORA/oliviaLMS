'use strict';
/**
 * Meta Lead Ads Webhook — domestic LMS router.
 *
 * Routes:
 *   GET  /domestic-api/webhook/meta  — Meta one-time verification challenge
 *   POST /domestic-api/webhook/meta  — Meta lead notification events
 *
 * How to register your webhook in Meta Business Suite:
 *   Callback URL:   https://<your-domain>/domestic-api/webhook/meta
 *   Verify Token:   value of DOM_META_VERIFY_TOKEN in .env
 *   Subscriptions:  leadgen
 */

const express                       = require('express');
const { verify, receive }           = require('../controllers/domMetaWebhookController');
const { validateMetaSignature }     = require('../middleware/metaSignature');

const router = express.Router();

// Meta verification handshake — GET, no signature needed
router.get('/', verify);

// Lead notification — validate HMAC signature first, then process
router.post('/', validateMetaSignature, receive);

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, query } = require('express-validator');
const crypto = require('crypto');
const GtiEvent = require('../models/GtiEvent');
const GtiOutboundLog = require('../models/GtiOutboundLog');
const GtiIntegrationLog = require('../models/GtiIntegrationLog');
const GtiWebhookConfirmation = require('../models/GtiWebhookConfirmation');
const handleValidationErrors = require('../middleware/validation');
const { protect, authorize } = require('../middleware/auth');
const { GTI_CONSTANTS } = require('../config/constants');
const { GTI_ORG_NAME } = require('../utils/gtiEventService');
const { normalizePayloadShape } = require('../utils/gtiPayloadUtils');

const router = express.Router();

const integrationLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false
});

const sanitizeHeaders = (headers = {}) => {
  const clone = { ...headers };
  if (clone['x-gti-export-key']) {
    clone['x-gti-export-key'] = '***redacted***';
  }
  return clone;
};

const getRequestIp = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = forwarded ? forwarded.split(',')[0].trim() : (req.ip || req.connection?.remoteAddress || 'unknown');
  return ip.replace('::ffff:', '');
};

const parseWhitelist = () => {
  const whitelist = (process.env.GTI_IP_WHITELIST || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  return whitelist;
};

const validateIntegrationKey = async (req, res, next) => {
  const expectedKey = process.env.GTI_EXPORT_KEY;
  const providedKey = req.headers['x-gti-export-key'];
  const ip = getRequestIp(req);
  const whitelist = parseWhitelist();

  if (!expectedKey) {
    await recordIntegrationLog(req, 503, false, 'GTI export key not configured');
    return res.status(503).json({
      success: false,
      message: 'GTI integration is not configured'
    });
  }

  if (!providedKey || providedKey !== expectedKey) {
    await recordIntegrationLog(req, 401, false, 'Invalid integration key');
    return res.status(401).json({
      success: false,
      message: 'Unauthorized'
    });
  }

  if (whitelist.length > 0 && !whitelist.includes(ip)) {
    await recordIntegrationLog(req, 403, false, `IP ${ip} not allowed`);
    return res.status(403).json({
      success: false,
      message: 'IP not allowed'
    });
  }

  req.integrationKeyHash = crypto.createHash('sha256').update(providedKey).digest('hex');
  next();
};

async function recordIntegrationLog(req, statusCode, success, message, extra = {}) {
  try {
    await GtiIntegrationLog.record({
      route: req.originalUrl || req.url,
      method: req.method,
      statusCode,
      ip: getRequestIp(req),
      userAgent: req.headers['user-agent'] || 'unknown',
      headers: sanitizeHeaders(req.headers),
      query: req.query,
      body: req.body,
      success,
      message,
      ...extra
    });
  } catch (error) {
    console.error('Failed to record GTI integration log:', error.message);
  }
}

router.get(
  '/export',
  integrationLimiter,
  validateIntegrationKey,
  [
    query('cursor')
      .optional()
      .isInt({ min: 0 })
      .withMessage('cursor must be a positive integer'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: GTI_CONSTANTS.EXPORT.MAX_LIMIT })
      .withMessage(`limit must be between 1 and ${GTI_CONSTANTS.EXPORT.MAX_LIMIT}`)
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const limit = Math.min(
        parseInt(req.query.limit, 10) || GTI_CONSTANTS.EXPORT.DEFAULT_LIMIT,
        GTI_CONSTANTS.EXPORT.MAX_LIMIT
      );
      const cursor = parseInt(req.query.cursor || '0', 10);
      const cursorDate = cursor ? new Date(cursor) : null;

      const queryFilter = {
        organizationNameSnapshot: GTI_ORG_NAME
      };

      if (cursorDate) {
        queryFilter.eventTimestamp = { $gt: cursorDate };
      }

      const events = await GtiEvent.find(queryFilter)
        .sort({ eventTimestamp: 1 })
        .limit(limit);

      const payload = events.map((eventDoc) => normalizePayloadShape(eventDoc.payload));

      const nextCursor = events.length
        ? events[events.length - 1].eventTimestamp.getTime()
        : cursor;

      const responseBody = {
        success: true,
        count: payload.length,
        events: payload,
        nextCursor,
        cursorType: 'eventTimestamp'
      };

      await recordIntegrationLog(req, 200, true, 'Export success', { responseSample: { count: payload.length } });
      res.json(responseBody);
    } catch (error) {
      console.error('GTI export error:', error);
      await recordIntegrationLog(req, 500, false, error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to export GTI events'
      });
    }
  }
);

router.post(
  '/receive',
  integrationLimiter,
  validateIntegrationKey,
  [
    body('idempotencyKey')
      .notEmpty()
      .withMessage('idempotencyKey is required'),
    body('status')
      .optional()
      .isIn(['confirmed', 'received', 'duplicate'])
      .withMessage('status must be confirmed, received, or duplicate'),
    body('note')
      .optional()
      .isLength({ max: 500 })
      .withMessage('note cannot exceed 500 characters')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { idempotencyKey, status = 'confirmed', note } = req.body;
      const event = await GtiEvent.findOne({ idempotencyKey });

      if (!event) {
        await recordIntegrationLog(req, 404, false, 'Event not found');
        return res.status(404).json({
          success: false,
          message: 'Event not found'
        });
      }

      if (status === 'confirmed') {
        event.pushStatus = 'confirmed';
      } else if (status === 'duplicate') {
        event.pushStatus = 'skipped';
      } else {
        event.pushStatus = 'sent';
      }
      event.nextAttemptAfter = null;
      await event.save();

      await GtiWebhookConfirmation.create({
        idempotencyKey,
        payload: req.body,
        headers: sanitizeHeaders(req.headers),
        integrationKeyHash: req.integrationKeyHash,
        note
      });

      await recordIntegrationLog(req, 200, true, 'Event acknowledged', { idempotencyKey, status });
      res.json({
        success: true,
        message: 'Acknowledged'
      });
    } catch (error) {
      console.error('GTI receive error:', error);
      await recordIntegrationLog(req, 500, false, error.message);
      res.status(500).json({
        success: false,
        message: 'Failed to record acknowledgment'
      });
    }
  }
);


router.get(
  '/debug/events',
  protect,
  authorize('superadmin'),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be between 1 and 200')
  ],
  handleValidationErrors,
  async (req, res) => {
    const limit = parseInt(req.query.limit || '25', 10);
    const events = await GtiEvent.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: {
        count: events.length,
        events
      }
    });
  }
);

router.get(
  '/debug/outbound',
  protect,
  authorize('superadmin'),
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: 200 })
      .withMessage('limit must be between 1 and 200')
  ],
  handleValidationErrors,
  async (req, res) => {
    const limit = parseInt(req.query.limit || '50', 10);
    const outboundLogs = await GtiOutboundLog.find()
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: {
        count: outboundLogs.length,
        logs: outboundLogs
      }
    });
  }
);

module.exports = router;

const express = require('express');
const rateLimit = require('express-rate-limit');
const { handleIncomingGtiCall } = require('../controllers/gtiController');

const router = express.Router();

const incomingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 6000,
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/incoming', incomingLimiter, handleIncomingGtiCall);

module.exports = router;

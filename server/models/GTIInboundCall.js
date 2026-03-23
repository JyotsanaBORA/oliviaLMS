const mongoose = require('mongoose');

const parseTtlDays = () => {
  const raw = process.env.GTI_TTL_DAYS;
  const value = parseInt(raw, 10);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }
  return 30;
};

const ttlSeconds = parseTtlDays() * 24 * 60 * 60;

const gtiInboundCallSchema = new mongoose.Schema({
  primaryPhone: {
    type: String,
    required: true,
    index: true,
  },
  callUuid: {
    type: String,
    required: true,
    index: true,
  },
  receivedAt: {
    type: Date,
    default: Date.now,
  },
  lastSentAt: {
    type: Date,
  },
  sendCount: {
    type: Number,
    default: 0,
  },
  consumed: {
    type: Boolean,
    default: false,
  },
}, {
  versionKey: false,
  timestamps: false,
});

gtiInboundCallSchema.index({ receivedAt: 1 }, { expireAfterSeconds: ttlSeconds });

gtiInboundCallSchema.statics.touchArrival = function(primaryPhone, callUuid) {
  const now = new Date();
  return this.findOneAndUpdate(
    { primaryPhone },
    {
      $set: {
        primaryPhone,
        callUuid,
        receivedAt: now,
        consumed: false,
      },
      $setOnInsert: {
        sendCount: 0,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
};

module.exports = mongoose.model('GTIInboundCall', gtiInboundCallSchema);

const https = require('https');
const { URL, URLSearchParams } = require('url');

const Lead = require('../models/Lead');
const GTIInboundCall = require('../models/GTIInboundCall');
const PostbackLog = require('../models/PostbackLog');
const { normalizeToE164 } = require('./gtiPhoneUtils');

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5000, 15000, 60000];
const REQUEST_TIMEOUT_MS = 5000;

const jobQueue = [];
let processing = false;

const enqueueJob = (job, delay = 0) => {
  if (delay > 0) {
    setTimeout(() => {
      jobQueue.push(job);
      scheduleProcessing();
    }, delay);
    return;
  }

  jobQueue.push(job);
  scheduleProcessing();
};

const scheduleProcessing = () => {
  if (processing) {
    return;
  }

  processing = true;
  setImmediate(async () => {
    try {
      while (jobQueue.length > 0) {
        const job = jobQueue.shift();
        await executeJob(job);
      }
    } catch (error) {
      console.error('GTI postback queue processing error:', error);
    } finally {
      processing = false;
    }
  });
};

const executeJob = async (job) => {
  const baseUrl = (process.env.GTI_POSTBACK_URL || '').trim();
  const authHeader = (process.env.GTI_AUTH_HEADER || '').trim();

  if (!baseUrl || !authHeader) {
    const reason = 'GTI_POSTBACK_URL or GTI_AUTH_HEADER is not configured';
    await persistAttempt(job, {
      success: false,
      status: null,
      body: { message: reason },
      errorMessage: reason,
    });
    return;
  }

  const targetUrl = buildTargetUrl(baseUrl, job.callUuid, job.payload);

  try {
    const response = await sendRequestWithQuery(targetUrl, {
      Authorization: authHeader,
    }, REQUEST_TIMEOUT_MS);

    const success = response.statusCode >= 200 && response.statusCode < 300;
    const parsedBody = parseResponseBody(response.body);

    await persistAttempt(job, {
      success,
      status: response.statusCode,
      body: parsedBody,
      errorMessage: success ? null : `Unexpected status code ${response.statusCode}`,
    });

    if (success) {
      await GTIInboundCall.updateOne(
        { primaryPhone: job.primaryPhone, callUuid: job.callUuid },
        {
          $set: {
            lastSentAt: new Date(),
            consumed: true,
          },
          $inc: {
            sendCount: 1,
          },
        }
      ).exec();
      return;
    }

    if (job.attempt < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[job.attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      enqueueJob({ ...job, attempt: job.attempt + 1 }, delay);
    }
  } catch (error) {
    await persistAttempt(job, {
      success: false,
      status: null,
      body: { message: error.message },
      errorMessage: error.message,
    });

    if (job.attempt < MAX_ATTEMPTS) {
      const delay = RETRY_DELAYS_MS[job.attempt - 1] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
      enqueueJob({ ...job, attempt: job.attempt + 1 }, delay);
    }
  }
};

const buildTargetUrl = (baseUrl, callUuid, payload) => {
  const sanitizedBase = (baseUrl || '').trim();
  if (!sanitizedBase) {
    throw new Error('GTI_POSTBACK_URL is empty');
  }

  let urlWithoutParams = sanitizedBase;
  if (urlWithoutParams.includes('[call_uuid]')) {
    urlWithoutParams = urlWithoutParams.replace('[call_uuid]', encodeURIComponent(callUuid));
  } else {
    const trimmed = urlWithoutParams.endsWith('/')
      ? urlWithoutParams.slice(0, -1)
      : urlWithoutParams;
    urlWithoutParams = `${trimmed}/${encodeURIComponent(callUuid)}`;
  }

  const params = new URLSearchParams();
  Object.entries(payload || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') {
      return;
    }
    params.append(key, value);
  });

  const queryString = params.toString();
  return queryString ? `${urlWithoutParams}?${queryString}` : urlWithoutParams;
};

const sendRequestWithQuery = (urlString, headers, timeoutMs) => {
  return new Promise((resolve, reject) => {
    let parsedUrl;
    try {
      parsedUrl = new URL(urlString);
    } catch (error) {
      reject(new Error(`Invalid GTI postback URL: ${urlString}`));
      return;
    }

    const options = {
      method: 'GET',
      headers,
      timeout: timeoutMs,
    };

    const request = https.request(parsedUrl, options, (response) => {
      let responseBody = '';
      response.on('data', (chunk) => {
        responseBody += chunk;
      });
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: responseBody,
        });
      });
    });

    request.on('error', (error) => {
      reject(error);
    });

    request.on('timeout', () => {
      request.destroy(new Error('GTI postback request timed out'));
    });

    request.end();
  });
};

const parseResponseBody = (raw) => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    return raw;
  }
};

const persistAttempt = async (job, result) => {
  const sentAt = new Date();
  const logDocument = {
    lead: job.leadId,
    callUuid: job.callUuid,
    primaryPhone: job.primaryPhone,
    eventType: job.eventType,
    payload: job.payload,
    responseStatus: result.status,
    responseBody: result.body,
    sentAt,
    trigger: job.trigger,
    error: !result.success,
    errorMessage: result.errorMessage || null,
    attempt: job.attempt,
  };

  try {
    await PostbackLog.create(logDocument);
  } catch (error) {
    console.error('Failed to persist GTI postback log:', error);
  }

  const historyEntry = {
    eventType: job.eventType,
    payload: job.payload,
    responseStatus: result.status,
    responseBody: result.body,
    sentAt,
    success: result.success,
    attempt: job.attempt,
    errorMessage: result.errorMessage || null,
  };

  const leadUpdate = {
    $set: {
      gtiCallUuid: job.callUuid,
      gtiPrimaryPhone: job.primaryPhone,
    },
    $push: {
      gtiPostbackHistory: historyEntry,
    },
  };

  if (result.success) {
    leadUpdate.$set.gtiLastPostback = sentAt;
  }

  try {
    await Lead.findByIdAndUpdate(job.leadId, leadUpdate).exec();
  } catch (error) {
    console.error('Failed to update lead GTI history:', error.message);
  }
};

const recordSkippedPostback = async (leadId, eventType, reason, trigger, payload = {}) => {
  const sentAt = new Date();

  try {
    await PostbackLog.create({
      lead: leadId,
      callUuid: null,
      primaryPhone: null,
      eventType,
      payload,
      responseStatus: null,
      responseBody: { message: reason },
      sentAt,
      trigger,
      error: true,
      errorMessage: reason,
      attempt: 0,
    });
  } catch (error) {
    console.error('Failed to persist skipped GTI postback log:', error.message);
  }

  try {
    await Lead.findByIdAndUpdate(leadId, {
      $push: {
        gtiPostbackHistory: {
          eventType,
          payload,
          responseStatus: null,
          responseBody: { message: reason },
          sentAt,
          success: false,
          attempt: 0,
          errorMessage: reason,
        },
      },
    }).exec();
  } catch (error) {
    console.error('Failed to update lead GTI history for skipped postback:', error.message);
  }
};

const toIsoString = (value) => {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const buildDisposePayload = (lead) => ({
  full_name: lead.name || '',
  redd_credit_score: lead.creditScore ?? null,
  redd_debt_amount: lead.totalDebtAmount ?? null,
  redd_disposition: lead.disposition1 || null,
  redd_lead_progress_status: null,
  requested_loan_amount: null,
  event_type: 'dispose',
  event_timestamp: new Date().toISOString(),
});

const buildProgressPayload = (lead) => {
  const payload = {
    full_name: lead.name || '',
    redd_credit_score: lead.creditScore ?? null,
    redd_debt_amount: lead.totalDebtAmount ?? null,
    redd_disposition: null,
    redd_lead_progress_status: lead.leadProgressStatus || null,
    requested_loan_amount: lead.requestedLoanAmount ?? null,
    event_type: 'progress',
    event_timestamp: new Date().toISOString(),
  };

  applyProgressRules(payload);
  return payload;
};

const applyProgressRules = (payload) => {
  const status = (payload.redd_lead_progress_status || '').toString().trim().toUpperCase();

  if (!status) {
    payload.requested_loan_amount = null;
    return;
  }

  if (status === 'CALLBACK' || status === 'CALLBACK NEEDED') {
    payload.requested_loan_amount = null;
    return;
  }

  if (status === 'SALE' || status === 'IMMEDIATE ENROLLMENT' || status === 'SALE LONG PLAY') {
    payload.requested_loan_amount = null;
    return;
  }

  if (!(status === 'REQUEST FOR LOAN' || status === 'RFL')) {
    payload.requested_loan_amount = null;
  }
};

const syncLeadWithInboundCall = async (leadDoc) => {
  if (!leadDoc) {
    return null;
  }

  const candidatePhone = normalizeToE164(leadDoc.gtiPrimaryPhone || leadDoc.phone || '');
  if (!candidatePhone) {
    return null;
  }

  const inbound = await GTIInboundCall.findOne({ primaryPhone: candidatePhone })
    .sort({ receivedAt: -1 })
    .lean();

  if (!inbound) {
    return null;
  }

  const updates = {};
  if (leadDoc.gtiPrimaryPhone !== candidatePhone) {
    updates.gtiPrimaryPhone = candidatePhone;
  }
  if (leadDoc.gtiCallUuid !== inbound.callUuid) {
    updates.gtiCallUuid = inbound.callUuid;
  }

  if (Object.keys(updates).length > 0) {
    try {
      await Lead.findByIdAndUpdate(leadDoc._id, { $set: updates }).exec();
      if (typeof leadDoc.set === 'function') {
        Object.entries(updates).forEach(([key, value]) => {
          leadDoc.set(key, value);
        });
      } else {
        Object.assign(leadDoc, updates);
      }
    } catch (error) {
      console.error('Failed to sync lead with GTI inbound call:', error.message);
    }
  }

  if (!inbound.consumed) {
    await GTIInboundCall.updateOne({ _id: inbound._id }, { $set: { consumed: true } }).exec();
  }

  return inbound;
};

const sendGTIPostback = async ({ lead, eventType, trigger = '', inboundCall = null }) => {
  if (!lead || !eventType) {
    return;
  }

  const eventTypeUpper = eventType.toLowerCase();
  if (!['dispose', 'progress'].includes(eventTypeUpper)) {
    console.warn(`GTI postback skipped due to unsupported event type: ${eventType}`);
    return;
  }

  const sourceLead = lead.toObject ? lead : lead;
  const inbound = inboundCall || await syncLeadWithInboundCall(sourceLead);

  if (!inbound) {
    await recordSkippedPostback(
      sourceLead._id,
      eventTypeUpper,
      'No GTI inbound call record found for lead',
      trigger,
      { note: 'postback skipped due to missing call_uuid' }
    );
    return;
  }

  const normalizedPhone = normalizeToE164(sourceLead.gtiPrimaryPhone || sourceLead.phone || '');
  if (!normalizedPhone) {
    await recordSkippedPostback(
      sourceLead._id,
      eventTypeUpper,
      'Unable to normalize lead phone number for GTI postback',
      trigger,
      { note: 'postback skipped due to phone normalization failure' }
    );
    return;
  }

  const leadSnapshot = sourceLead.toObject
    ? sourceLead.toObject({ depopulate: true })
    : { ...sourceLead };

  const payload = eventTypeUpper === 'dispose'
    ? buildDisposePayload(leadSnapshot)
    : buildProgressPayload(leadSnapshot);

  const job = {
    leadId: leadSnapshot._id,
    eventType: eventTypeUpper,
    callUuid: inbound.callUuid,
    primaryPhone: normalizedPhone,
    payload,
    attempt: 1,
    trigger,
  };

  enqueueJob(job);
};

module.exports = {
  sendGTIPostback,
  syncLeadWithInboundCall,
};

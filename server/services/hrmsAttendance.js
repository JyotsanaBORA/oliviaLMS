/**
 * HRMS Attendance Webhook Service
 * Fire-and-forget: LMS never blocks or crashes if HRMS is unavailable.
 * Debounce: ignores duplicate events within 30 seconds per user+event.
 */

const DEBOUNCE_MS = 30 * 1000; // 30 seconds
const _lastSent = new Map(); // key: "email:eventType" → timestamp (ms)

const sendAttendanceEvent = (email, eventType) => {
  if (!process.env.HRMS_WEBHOOK_URL || !process.env.HRMS_WEBHOOK_SECRET) return;

  const key = `${email}:${eventType}`;
  const now = Date.now();
  if (now - (_lastSent.get(key) || 0) < DEBOUNCE_MS) return; // debounced
  _lastSent.set(key, now);

  const payload = { email, eventType, timestamp: new Date().toISOString() };
  console.log(`[HRMS] → Sending ${eventType} event for ${email} to ${process.env.HRMS_WEBHOOK_URL}`);

  try {
    fetch(process.env.HRMS_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-lms-secret': process.env.HRMS_WEBHOOK_SECRET,
      },
      body: JSON.stringify(payload),
    })
      .then((res) => {
        console.log(`[HRMS] ← Response: HTTP ${res.status} for ${eventType}/${email}`);
      })
      .catch((err) => {
        console.error(`[HRMS] ✗ Network error for ${eventType}/${email}:`, err.message);
      });
  } catch (err) {
    console.error('[HRMS] Webhook error:', err.message);
  }
};

const notifyCheckIn  = (email) => sendAttendanceEvent(email, 'login');
const notifyCheckOut = (email) => sendAttendanceEvent(email, 'logout');

module.exports = { notifyCheckIn, notifyCheckOut };

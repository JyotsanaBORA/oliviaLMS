/**
 * Native Date/Time formatting utilities for Domestic LMS (Asia/Kolkata timezone)
 * Zero external dependencies — pure standard Intl.DateTimeFormat & Date API.
 */

const KOLKATA_TZ = 'Asia/Kolkata';

/**
 * Format a date safely into en-IN localized string
 * @param {string|Date|number|null} val
 * @param {Intl.DateTimeFormatOptions} [opts]
 * @param {string} [fallback='Never']
 */
export const formatDate = (val, opts = {}, fallback = 'Never') => {
  if (!val) return fallback;
  const d = new Date(val);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString('en-IN', {
    timeZone: KOLKATA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...opts,
  });
};

/**
 * Format a date and time safely into en-IN localized string
 * @param {string|Date|number|null} val
 * @param {Intl.DateTimeFormatOptions} [opts]
 * @param {string} [fallback='Never']
 */
export const formatDateTime = (val, opts = {}, fallback = 'Never') => {
  if (!val) return fallback;
  const d = new Date(val);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleString('en-IN', {
    timeZone: KOLKATA_TZ,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...opts,
  });
};

/**
 * Format time only in en-IN / Asia/Kolkata
 * @param {string|Date|number|null} val
 * @param {Intl.DateTimeFormatOptions} [opts]
 * @param {string} [fallback='--:--']
 */
export const formatTime = (val, opts = {}, fallback = '--:--') => {
  if (!val) return fallback;
  const d = new Date(val);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleTimeString('en-IN', {
    timeZone: KOLKATA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    ...opts,
  });
};

/**
 * Returns today's date string in YYYY-MM-DD format (Kolkata timezone)
 */
export const getTodayKolkataStr = () => {
  const d = new Date();
  return d.toLocaleDateString('en-CA', { timeZone: KOLKATA_TZ }); // en-CA gives YYYY-MM-DD
};

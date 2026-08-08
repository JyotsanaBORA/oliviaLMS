const moment = require('moment-timezone');

// Eastern Time zone constant
const EASTERN_TIMEZONE = 'America/New_York';

/**
 * Get current date and time in Eastern Time
 * @returns {Date} Current EST/EDT date
 */
const getEasternNow = () => {
  return moment.tz(EASTERN_TIMEZONE).toDate();
};

/**
 * Convert any date to Eastern Time
 * @param {Date|string} date - Date to convert
 * @returns {Date} Date in Eastern Time
 */
const toEasternTime = (date) => {
  return moment.tz(date, EASTERN_TIMEZONE).toDate();
};

/**
 * Get start of day in Eastern Time (12:00 AM EST/EDT)
 * @param {Date|string} date - Base date (optional, defaults to today)
 * @returns {Date} Start of day in Eastern Time
 */
const getEasternStartOfDay = (date = new Date()) => {
  // If date is a string (e.g., "2025-10-08"), parse it in Eastern timezone
  // to avoid local timezone interpretation issues
  if (typeof date === 'string') {
    return moment.tz(date, EASTERN_TIMEZONE).startOf('day').toDate();
  }
  return moment.tz(date, EASTERN_TIMEZONE).startOf('day').toDate();
};

/**
 * Get end of day in Eastern Time (11:59:59.999 PM EST/EDT)
 * @param {Date|string} date - Base date (optional, defaults to today)
 * @returns {Date} End of day in Eastern Time
 */
const getEasternEndOfDay = (date = new Date()) => {
  // If date is a string (e.g., "2025-10-15"), parse it in Eastern timezone
  // to avoid local timezone interpretation issues
  if (typeof date === 'string') {
    return moment.tz(date, EASTERN_TIMEZONE).endOf('day').toDate();
  }
  return moment.tz(date, EASTERN_TIMEZONE).endOf('day').toDate();
};

/**
 * Get start of week in Eastern Time (Monday 12:00 AM EST/EDT)
 * @param {Date} date - Base date (optional, defaults to this week)
 * @returns {Date} Start of week in Eastern Time
 */
const getEasternStartOfWeek = (date = new Date()) => {
  return moment.tz(date, EASTERN_TIMEZONE).startOf('isoWeek').toDate();
};

/**
 * Get start of month in Eastern Time (1st day 12:00 AM EST/EDT)
 * @param {Date} date - Base date (optional, defaults to this month)
 * @returns {Date} Start of month in Eastern Time
 */
const getEasternStartOfMonth = (date = new Date()) => {
  return moment.tz(date, EASTERN_TIMEZONE).startOf('month').toDate();
};

/**
 * Format date to Eastern Time string
 * @param {Date} date - Date to format
 * @param {string} format - Moment.js format string (optional)
 * @returns {string} Formatted date string in Eastern Time
 */
const formatEasternTime = (date, format = 'YYYY-MM-DD HH:mm:ss z') => {
  return moment.tz(date, EASTERN_TIMEZONE).format(format);
};

/**
 * Get Eastern Time for dashboard reset (midnight EST/EDT)
 * @returns {Date} Next midnight in Eastern Time
 */
const getNextEasternMidnight = () => {
  return moment.tz(EASTERN_TIMEZONE).add(1, 'day').startOf('day').toDate();
};

/**
 * Check if a date is today in Eastern Time
 * @param {Date} date - Date to check
 * @returns {boolean} True if date is today in Eastern Time
 */
const isEasternToday = (date) => {
  const easternNow = moment.tz(EASTERN_TIMEZONE);
  const easternDate = moment.tz(date, EASTERN_TIMEZONE);
  return easternNow.isSame(easternDate, 'day');
};

/**
 * Get time range for dashboard stats in Eastern Time
 * @returns {Object} Object with today, thisWeek, thisMonth start dates
 */
const getEasternTimeRanges = () => {
  const now = moment.tz(EASTERN_TIMEZONE);
  
  return {
    today: now.clone().startOf('day').toDate(),
    thisWeek: now.clone().startOf('isoWeek').toDate(),
    thisMonth: now.clone().startOf('month').toDate(),
    todayEnd: now.clone().endOf('day').toDate()
  };
};

/**
 * Create Eastern Time date from components
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @param {number} day - Day of month
 * @param {number} hour - Hour (0-23, optional)
 * @param {number} minute - Minute (0-59, optional)
 * @param {number} second - Second (0-59, optional)
 * @returns {Date} Date in Eastern Time
 */
const createEasternDate = (year, month, day, hour = 0, minute = 0, second = 0) => {
  return moment.tz([year, month, day, hour, minute, second], EASTERN_TIMEZONE).toDate();
};

module.exports = {
  EASTERN_TIMEZONE,
  getEasternNow,
  toEasternTime,
  getEasternStartOfDay,
  getEasternEndOfDay,
  getEasternStartOfWeek,
  getEasternStartOfMonth,
  formatEasternTime,
  getNextEasternMidnight,
  isEasternToday,
  getEasternTimeRanges,
  createEasternDate
};
    
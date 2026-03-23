import moment from 'moment-timezone';

// Eastern Time timezone
export const EASTERN_TIMEZONE = 'America/New_York';

/**
 * Get current time in Eastern timezone
 * @returns {moment.Moment} Current Eastern time
 */
export const getEasternNow = () => {
  return moment.tz(EASTERN_TIMEZONE);
};

/**
 * Convert any date to Eastern timezone
 * @param {string|Date|moment.Moment} date - Date to convert
 * @returns {moment.Moment} Date in Eastern timezone
 */
export const toEasternTime = (date) => {
  return moment.tz(date, EASTERN_TIMEZONE);
};

/**
 * Get start of day in Eastern timezone
 * @param {string|Date|moment.Moment} date - Date (optional, defaults to today)
 * @returns {moment.Moment} Start of day in Eastern timezone
 */
export const getEasternStartOfDay = (date = null) => {
  const easternDate = date ? moment.tz(date, EASTERN_TIMEZONE) : moment.tz(EASTERN_TIMEZONE);
  return easternDate.startOf('day');
};

/**
 * Get end of day in Eastern timezone
 * @param {string|Date|moment.Moment} date - Date (optional, defaults to today)
 * @returns {moment.Moment} End of day in Eastern timezone
 */
export const getEasternEndOfDay = (date = null) => {
  const easternDate = date ? moment.tz(date, EASTERN_TIMEZONE) : moment.tz(EASTERN_TIMEZONE);
  return easternDate.endOf('day');
};

/**
 * Get Eastern time ranges for different periods
 * @returns {Object} Time ranges in Eastern timezone
 */
export const getEasternTimeRanges = () => {
  const now = moment.tz(EASTERN_TIMEZONE);
  const startOfToday = now.clone().startOf('day');
  const endOfToday = now.clone().endOf('day');
  
  return {
    today: {
      start: startOfToday,
      end: endOfToday
    },
    yesterday: {
      start: startOfToday.clone().subtract(1, 'day'),
      end: endOfToday.clone().subtract(1, 'day')
    },
    thisWeek: {
      start: startOfToday.clone().startOf('week'),
      end: endOfToday.clone().endOf('week')
    },
    thisMonth: {
      start: startOfToday.clone().startOf('month'),
      end: endOfToday.clone().endOf('month')
    },
    last30Days: {
      start: startOfToday.clone().subtract(30, 'days'),
      end: endOfToday
    },
    last7Days: {
      start: startOfToday.clone().subtract(7, 'days'),
      end: endOfToday
    }
  };
};

/**
 * Format date in Eastern timezone for display
 * @param {string|Date|moment.Moment} date - Date to format
 * @param {string} format - Moment.js format string
 * @returns {string} Formatted date string
 */
export const formatEasternTime = (date, format = 'YYYY-MM-DD HH:mm:ss') => {
  if (!date) return '';
  return moment.tz(date, EASTERN_TIMEZONE).format(format);
};

/**
 * Format date in Eastern timezone for display with timezone indicator
 * @param {string|Date|moment.Moment} date - Date to format
 * @param {string|Object} format - Moment.js format string or options object
 * @returns {string} Formatted date string with timezone
 */
export const formatEasternTimeForDisplay = (date, format = 'MMM DD, YYYY h:mm A') => {
  if (!date) return '';
  const easternMoment = moment.tz(date, EASTERN_TIMEZONE);
  
  // Handle options object or string format
  let formatString = format;
  let includeTime = true;
  let includeTimezone = true;
  
  if (typeof format === 'object' && format !== null) {
    includeTime = format.includeTime !== false;
    includeTimezone = format.includeTimezone !== false;
    formatString = includeTime ? 'MMM DD, YYYY h:mm A' : 'MMM DD, YYYY';
  }
  
  const formattedDate = easternMoment.format(formatString);
  
  if (includeTimezone) {
    const timezone = easternMoment.format('z'); // EST or EDT
    return `${formattedDate} ${timezone}`;
  } else {
    return formattedDate;
  }
};

/**
 * Get current timezone abbreviation (EST or EDT)
 * @returns {string} Current Eastern timezone abbreviation
 */
export const getCurrentEasternTimezone = () => {
  return moment.tz(EASTERN_TIMEZONE).format('z');
};

/**
 * Get relative time in Eastern timezone
 * @param {string|Date|moment.Moment} date - Date to compare
 * @returns {string} Relative time string (e.g., "2 hours ago")
 */
export const getEasternRelativeTime = (date) => {
  if (!date) return '';
  return moment.tz(date, EASTERN_TIMEZONE).fromNow();
};

/**
 * Check if a date is today in Eastern timezone
 * @param {string|Date|moment.Moment} date - Date to check
 * @returns {boolean} True if date is today in Eastern Time
 */
export const isEasternToday = (date) => {
  if (!date) return false;
  const easternNow = moment.tz(EASTERN_TIMEZONE);
  const easternDate = moment.tz(date, EASTERN_TIMEZONE);
  return easternDate.isSame(easternNow, 'day');
};

/**
 * Convert date to Eastern timezone date input value (YYYY-MM-DD)
 * @param {string|Date|moment.Moment} date - Date to convert
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const toEasternDateInputValue = (date) => {
  if (!date) return '';
  return moment.tz(date, EASTERN_TIMEZONE).format('YYYY-MM-DD');
};

/**
 * Convert date to Eastern timezone datetime input value (YYYY-MM-DDTHH:mm)
 * @param {string|Date|moment.Moment} date - Date to convert
 * @returns {string} Datetime string in YYYY-MM-DDTHH:mm format
 */
export const toEasternDateTimeInputValue = (date) => {
  if (!date) return '';
  return moment.tz(date, EASTERN_TIMEZONE).format('YYYY-MM-DDTHH:mm');
};

/**
 * Parse date range filter and return Eastern timezone dates
 * @param {string} filter - Date filter ('today', 'yesterday', 'thisWeek', etc.)
 * @returns {Object} Start and end dates in Eastern timezone
 */
export const parseEasternDateFilter = (filter) => {
  const ranges = getEasternTimeRanges();
  return ranges[filter] || ranges.today;
};

/**
 * Check if date is within business hours in Eastern timezone
 * @param {string|Date|moment.Moment} date - Date to check
 * @param {number} startHour - Business start hour (default: 9)
 * @param {number} endHour - Business end hour (default: 17)
 * @returns {boolean} True if within business hours
 */
export const isEasternBusinessHours = (date, startHour = 9, endHour = 17) => {
  if (!date) return false;
  const easternDate = moment.tz(date, EASTERN_TIMEZONE);
  const hour = easternDate.hour();
  const dayOfWeek = easternDate.day(); // 0 = Sunday, 6 = Saturday
  
  // Check if it's a weekday (Monday = 1, Friday = 5)
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isBusinessHour = hour >= startHour && hour < endHour;
  
  return isWeekday && isBusinessHour;
};

export const formatDateAsDDMMYYYY = (date) => {
  if (!date) return '';
  const parsed = moment.utc(date);
  return parsed.isValid() ? parsed.format('DD/MM/YYYY') : '';
};

export const isValidDDMMYYYY = (value) => {
  if (!value) return false;
  return moment.utc(value, 'DD/MM/YYYY', true).isValid();
};

export const parseDDMMYYYYToISO = (value) => {
  if (!value) return null;
  const parsed = moment.utc(value, 'DD/MM/YYYY', true);
  return parsed.isValid() ? parsed.toISOString() : null;
};

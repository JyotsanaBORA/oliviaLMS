const stripToDigits = (value = '') => {
  if (!value) {
    return '';
  }
  return String(value).replace(/\D/g, '');
};

const normalizeToE164 = (value = '') => {
  const digits = stripToDigits(value);
  if (!digits) {
    return '';
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  return '';
};

const buildPhoneVariants = (rawNumber = '') => {
  const variants = new Set();
  const trimmed = (rawNumber || '').trim();
  if (trimmed) {
    variants.add(trimmed);
  }

  const digits = stripToDigits(trimmed);
  if (digits) {
    variants.add(digits);

    if (digits.length === 10) {
      variants.add(`+1${digits}`);
      variants.add(`1${digits}`);
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      variants.add(`+${digits}`);
    }
  }

  return Array.from(variants);
};

module.exports = {
  stripToDigits,
  normalizeToE164,
  buildPhoneVariants,
};

/**
 * Universal Meta Lead Ads field parser.
 *
 * Meta Instant Forms can have any combination of standard and fully custom fields.
 * This parser produces TWO outputs from a single field_data array:
 *
 *  parsedFields — flat object { metaFieldName: value } for EVERY field Meta sent.
 *                 Stored as-is in DB so zero data is ever lost regardless of form config.
 *
 *  schemaFields — fields mapped to our WebsiteLead schema columns so the lead
 *                 renders correctly in the CRM (name, email, phone, address…).
 *
 * Custom / unrecognised fields are appended verbatim to `message` so admins
 * always see all answers, even from forms we've never seen before.
 */

// ─── Standard Meta field name → our schema column ───────────────────────────
const FIELD_MAP = {
  // Name
  full_name:              'name',
  name:                   'name',
  first_name:             'firstName',
  firstname:              'firstName',
  last_name:              'lastName',
  lastname:               'lastName',
  surname:                'lastName',

  // Contact
  email:                  'email',
  email_address:          'email',
  work_email:             'email',
  business_email:         'email',

  phone_number:           'phone',
  phone:                  'phone',
  mobile_number:          'phone',
  mobile:                 'phone',
  contact_number:         'phone',
  cell_phone:             'phone',
  telephone:              'phone',

  // Address
  street_address:         'streetAddress',
  address:                'streetAddress',
  street:                 'streetAddress',
  city:                   'city',
  town:                   'city',
  state:                  'state',
  province:               'state',
  region:                 'state',
  zip_code:               'zipCode',
  zip:                    'zipCode',
  postal_code:            'zipCode',
  postcode:               'zipCode',

  // Financial — debt relief specific
  total_debt:             'totalDebtAmount',
  debt_amount:            'totalDebtAmount',
  total_debt_amount:      'totalDebtAmount',
  how_much_debt:          'totalDebtAmount',
  amount_of_debt:         'totalDebtAmount',
  debt_amount_owed:       'totalDebtAmount',
  outstanding_debt:       'totalDebtAmount',

  // Free text / message
  message:                'message',
  comment:                'message',
  comments:               'message',
  notes:                  'message',
  description:            'message',
  how_can_we_help:        'message',
  how_can_we_help_you:    'message',
  question:               'message',
  inquiry:                'message',
  your_message:           'message',
};

/**
 * Parse Meta field_data array into structured outputs.
 *
 * @param {Array} fieldData - field_data from Graph API response
 * @returns {{ parsedFields: Object, schemaFields: Object }}
 */
function parseMetaFieldData(fieldData) {
  const parsedFields  = {}; // every field verbatim
  const schemaFields  = {}; // mapped to our DB columns
  const customExtras  = []; // unrecognised custom questions

  if (!Array.isArray(fieldData) || !fieldData.length) {
    return { parsedFields, schemaFields };
  }

  for (const item of fieldData) {
    const rawKey = (item.name || '').trim();
    const value  = Array.isArray(item.values)
      ? String(item.values[0] ?? '').trim()
      : String(item.values  ?? '').trim();

    if (!rawKey || value === '') continue;

    // ── 1. Store EVERY field exactly as Meta sent it ─────────────────────
    parsedFields[rawKey] = value;

    // ── 2. Normalise key and attempt schema mapping ───────────────────────
    const normKey   = rawKey.toLowerCase().replace(/[\s\-]+/g, '_');
    const schemaKey = FIELD_MAP[normKey];

    if (schemaKey) {
      switch (schemaKey) {
        case 'name': {
          if (!schemaFields.name) {
            const parts            = value.split(/\s+/);
            schemaFields.name      = value.substring(0, 100);
            // Only set first/last from full_name if not already set by dedicated fields
            if (!schemaFields.firstName) schemaFields.firstName = (parts[0] || '').substring(0, 50);
            if (!schemaFields.lastName)  schemaFields.lastName  = parts.slice(1).join(' ').substring(0, 50);
          }
          break;
        }
        case 'firstName':
          if (!schemaFields.firstName) schemaFields.firstName = value.substring(0, 50);
          break;
        case 'lastName':
          if (!schemaFields.lastName) schemaFields.lastName = value.substring(0, 50);
          break;
        case 'email':
          if (!schemaFields.email) schemaFields.email = value.toLowerCase().substring(0, 100);
          break;
        case 'phone':
          if (!schemaFields.phone) schemaFields.phone = value.replace(/[\s\-\(\)\.]/g, '').substring(0, 20);
          break;
        case 'streetAddress':
          if (!schemaFields.streetAddress) schemaFields.streetAddress = value.substring(0, 200);
          break;
        case 'city':
          if (!schemaFields.city) schemaFields.city = value.substring(0, 100);
          break;
        case 'state':
          if (!schemaFields.state) schemaFields.state = value.substring(0, 50);
          break;
        case 'zipCode':
          if (!schemaFields.zipCode) schemaFields.zipCode = value.substring(0, 20);
          break;
        case 'totalDebtAmount': {
          const n = Number(value.replace(/[^0-9.]/g, ''));
          if (!isNaN(n) && n >= 0 && !schemaFields.totalDebtAmount) {
            schemaFields.totalDebtAmount = n;
          }
          break;
        }
        case 'message':
          if (!schemaFields.message) schemaFields.message = value.substring(0, 2000);
          break;
        default:
          break;
      }
    } else {
      // Unrecognised custom question — preserve verbatim
      customExtras.push(`${rawKey}: ${value}`);
    }
  }

  // ── Build full name from parts if we only got first + last ───────────────
  if (!schemaFields.name && (schemaFields.firstName || schemaFields.lastName)) {
    schemaFields.name = [schemaFields.firstName, schemaFields.lastName]
      .filter(Boolean)
      .join(' ')
      .substring(0, 100);
  }

  // ── Append all unrecognised custom fields to message ─────────────────────
  // (never lose any data — admins see everything)
  if (customExtras.length) {
    const separator = schemaFields.message ? '\n\n--- Additional Fields ---\n' : '';
    const prefix    = schemaFields.message ? schemaFields.message + separator : '';
    schemaFields.message = (prefix + customExtras.join('\n')).substring(0, 2000);
  }

  return { parsedFields, schemaFields };
}

module.exports = { parseMetaFieldData };

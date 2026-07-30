'use strict';
/**
 * Universal Meta Lead field parser for the domestic LMS.
 *
 * Meta Instant Forms can send ANY combination of standard and custom fields.
 * This parser produces two outputs:
 *
 *  parsedFields — flat { metaFieldName: value } for EVERY field Meta sent.
 *                 Stored verbatim so zero data is ever lost.
 *
 *  schemaFields — values mapped to DomWebsiteLead schema columns so leads
 *                 render correctly in the CRM.
 *
 * Unknown / custom fields are appended to schemaFields.notes so admins
 * always see all answers even from forms never seen before.
 */

// ── Meta field name → DomWebsiteLead column ───────────────────────────────
const FIELD_MAP = {
  // ── Name ────────────────────────────────────────────────────────────────
  full_name:                    'name',
  name:                         'name',
  your_name:                    'name',
  applicant_name:               'name',
  customer_name:                'name',
  first_name:                   'firstName',
  firstname:                    'firstName',
  last_name:                    'lastName',
  lastname:                     'lastName',
  surname:                      'lastName',

  // ── Mobile / Phone ───────────────────────────────────────────────────────
  mobile:                       'mobile',
  mobile_number:                'mobile',
  phone:                        'mobile',
  phone_number:                 'mobile',
  contact_number:               'mobile',
  cell_phone:                   'mobile',
  telephone:                    'mobile',
  whatsapp_number:              'mobile',
  mobile_no:                    'mobile',

  // ── Email ────────────────────────────────────────────────────────────────
  email:                        'email',
  email_address:                'email',
  work_email:                   'email',
  personal_email:               'email',

  // ── City / Location ──────────────────────────────────────────────────────
  city:                         'city',
  location:                     'city',
  district:                     'city',
  town:                         'city',
  current_city:                 'city',
  resident_city:                'city',

  // ── Monthly Income ───────────────────────────────────────────────────────
  monthly_income:               'monthlyIncome',
  monthly_salary:               'monthlyIncome',
  income:                       'monthlyIncome',
  salary:                       'monthlyIncome',
  annual_income:                'monthlyIncome',
  net_monthly_income:           'monthlyIncome',
  net_salary:                   'monthlyIncome',
  take_home_salary:             'monthlyIncome',
  ctc:                          'monthlyIncome',
  annual_ctc:                   'monthlyIncome',

  // ── Employment ───────────────────────────────────────────────────────────
  employment_type:              'employment',
  employment_status:            'employment',
  employment:                   'employment',
  job_type:                     'employment',
  occupation:                   'employment',
  profession:                   'employment',
  work_type:                    'employment',
  working_as:                   'employment',
  current_employment:           'employment',
  salaried_or_self_employed:    'employment',

  // ── Product / Loan type ──────────────────────────────────────────────────
  product_type:                 'productType',
  loan_type:                    'productType',
  product:                      'productType',
  service:                      'productType',
  loan_required:                'productType',
  type_of_loan:                 'productType',
  interested_in:                'productType',
  looking_for:                  'productType',
  loan_category:                'productType',
  requirement:                  'productType',

  // ── PAN ──────────────────────────────────────────────────────────────────
  pan:                          'pan',
  pan_number:                   'pan',
  pan_card:                     'pan',
  pan_card_number:              'pan',
  permanent_account_number:     'pan',

  // ── UTM / source tracking ────────────────────────────────────────────────
  utm_source:                   'utmSource',
  utm_medium:                   'utmMedium',
  utm_campaign:                 'utmCampaign',
  source_page:                  'sourcePage',
};

/**
 * Parse Meta field_data array into structured outputs.
 *
 * @param {Array} fieldData - field_data from Graph API response
 * @returns {{ parsedFields: Object, schemaFields: Object }}
 */
function parseDomMetaFieldData(fieldData) {
  const parsedFields = {};   // every field verbatim
  const schemaFields = {};   // mapped to DomWebsiteLead columns
  const customExtras = [];   // unrecognised fields → appended to notes

  if (!Array.isArray(fieldData) || !fieldData.length) {
    return { parsedFields, schemaFields };
  }

  for (const item of fieldData) {
    const rawKey = (item.name  || '').trim();
    const value  = Array.isArray(item.values)
      ? String(item.values[0] ?? '').trim()
      : String(item.values ?? '').trim();

    if (!rawKey || value === '') continue;

    // Store EVERY field exactly as Meta sent it
    parsedFields[rawKey] = value;

    const normKey   = rawKey.toLowerCase().replace(/[\s\-]+/g, '_');
    const schemaKey = FIELD_MAP[normKey];

    if (schemaKey) {
      switch (schemaKey) {
        case 'name': {
          if (!schemaFields.name) {
            const parts = value.split(/\s+/);
            schemaFields.name      = value.substring(0, 100);
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
        case 'mobile':
          if (!schemaFields.mobile) {
            schemaFields.mobile = value.replace(/[\s\-\(\)\.]/g, '').substring(0, 20);
          }
          break;
        case 'email':
          if (!schemaFields.email) schemaFields.email = value.toLowerCase().substring(0, 100);
          break;
        case 'city':
          if (!schemaFields.city) schemaFields.city = value.substring(0, 100);
          break;
        case 'monthlyIncome':
          if (!schemaFields.monthlyIncome) schemaFields.monthlyIncome = value.substring(0, 50);
          break;
        case 'employment':
          if (!schemaFields.employment) schemaFields.employment = value.substring(0, 50);
          break;
        case 'productType':
          if (!schemaFields.productType) schemaFields.productType = value.substring(0, 100);
          break;
        case 'pan':
          if (!schemaFields.pan) schemaFields.pan = value.toUpperCase().substring(0, 10);
          break;
        case 'utmSource':
          if (!schemaFields.utmSource) schemaFields.utmSource = value.substring(0, 100);
          break;
        case 'utmMedium':
          if (!schemaFields.utmMedium) schemaFields.utmMedium = value.substring(0, 100);
          break;
        case 'utmCampaign':
          if (!schemaFields.utmCampaign) schemaFields.utmCampaign = value.substring(0, 100);
          break;
        case 'sourcePage':
          if (!schemaFields.sourcePage) schemaFields.sourcePage = value.substring(0, 300);
          break;
        default:
          break;
      }
    } else {
      // Unknown custom field — keep it visible
      customExtras.push(`${rawKey}: ${value}`);
    }
  }

  // If first_name + last_name were sent but no full_name, synthesise name
  if (!schemaFields.name && (schemaFields.firstName || schemaFields.lastName)) {
    schemaFields.name = `${schemaFields.firstName || ''} ${schemaFields.lastName || ''}`.trim();
  }

  // Append any custom / unrecognised fields to a notes string
  if (customExtras.length) {
    schemaFields.customNotes = customExtras.join('\n');
  }

  return { parsedFields, schemaFields };
}

module.exports = { parseDomMetaFieldData };

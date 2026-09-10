const Lead = require('../models/Lead');

/**
 * Generate variations of a phone number for reliable matching:
 * e.g., 10 digits, +1XXXXXXXXXX, 1XXXXXXXXXX, etc.
 */
function normalizePhoneVariations(phone) {
  if (!phone) return [];
  const rawStr = String(phone).trim();
  const digits = rawStr.replace(/\D/g, '');
  
  const variations = new Set();
  if (rawStr) variations.add(rawStr);
  
  if (digits) {
    variations.add(digits);
    if (digits.length === 10) {
      variations.add('+1' + digits);
      variations.add('1' + digits);
    } else if (digits.length === 11 && digits.startsWith('1')) {
      const ten = digits.substring(1);
      variations.add(ten);
      variations.add('+1' + ten);
    }
  }
  return Array.from(variations);
}

/**
 * Check if a lead is an inbound stub lead that can be enriched:
 * e.g. Has a generic name like "Inbound Caller", "Unknown", or is missing critical info like email/address/debt,
 * and was created via an inbound call / telephony source.
 */
function isInboundStubLead(lead) {
  if (!lead) return false;
  
  const name = (lead.name || '').trim().toLowerCase();
  const isGenericName = !name || name === 'inbound caller' || name === 'unknown' || name === 'inbound lead' || name === 'lead';
  const hasInboundSource = lead.source === 'Inbound Call' || !!lead.vicidialDid || (lead.sourceId && String(lead.sourceId).toLowerCase().includes('inbound'));
  const isMissingKeyData = !lead.email || !lead.address || !lead.totalDebtAmount;

  // If it has inbound markers and is missing full details, or has a generic placeholder name
  return isGenericName || (hasInboundSource && isMissingKeyData);
}

/**
 * Find an existing lead for the given phone number that can be enriched,
 * scoped by organization (or cross-org if Reddington/SuperAdmin context).
 */
async function findLeadForEnrichment(phone, orgId) {
  const variations = normalizePhoneVariations(phone);
  if (variations.length === 0) return null;

  const query = {
    phone: { $in: variations },
    isDeleted: { $ne: true }
  };

  if (orgId) {
    query.organization = orgId;
  }

  // Find the most recent matching lead
  const existingLead = await Lead.findOne(query).sort({ createdAt: -1 });
  return existingLead;
}

/**
 * Enriches an existing lead with new payload data non-destructively.
 * Overwrites placeholder values and fills in blank fields while preserving
 * telephony identifiers (vicidialDid, vicidialCampaignName, gtiCallUuid, leadId).
 */
function enrichLeadWithPayload(existingLead, payload) {
  if (!existingLead || !payload) return existingLead;

  // Name enrichment
  const currentName = (existingLead.name || '').trim().toLowerCase();
  const isCurrentGenericName = !currentName || currentName === 'inbound caller' || currentName === 'unknown' || currentName === 'inbound lead' || currentName === 'lead';
  if (payload.name && (isCurrentGenericName || !existingLead.name)) {
    existingLead.name = payload.name;
  }

  // Contact info
  if (payload.email && !existingLead.email) {
    existingLead.email = payload.email;
  }
  if (payload.alternatePhone && !existingLead.alternatePhone) {
    existingLead.alternatePhone = payload.alternatePhone;
  }

  // Address
  if (payload.address && !existingLead.address) existingLead.address = payload.address;
  if (payload.city && !existingLead.city) existingLead.city = payload.city;
  if (payload.state && !existingLead.state) existingLead.state = payload.state;
  if (payload.zipcode && !existingLead.zipcode) existingLead.zipcode = payload.zipcode;

  // Financial fields
  if (payload.totalDebtAmount !== undefined && payload.totalDebtAmount !== null && !isNaN(payload.totalDebtAmount)) {
    if (!existingLead.totalDebtAmount || existingLead.totalDebtAmount === 0) {
      existingLead.totalDebtAmount = Number(payload.totalDebtAmount);
    }
  }
  if (payload.debtCategory && !existingLead.debtCategory) {
    existingLead.debtCategory = payload.debtCategory;
  }
  if (Array.isArray(payload.debtTypes) && payload.debtTypes.length > 0) {
    if (!existingLead.debtTypes || existingLead.debtTypes.length === 0) {
      existingLead.debtTypes = payload.debtTypes;
    }
  }
  if (payload.numberOfCreditors !== undefined && !existingLead.numberOfCreditors) {
    existingLead.numberOfCreditors = payload.numberOfCreditors;
  }
  if (payload.monthlyDebtPayment !== undefined && !existingLead.monthlyDebtPayment) {
    existingLead.monthlyDebtPayment = payload.monthlyDebtPayment;
  }
  if (payload.creditScore && !existingLead.creditScore) {
    existingLead.creditScore = payload.creditScore;
  }
  if (payload.creditScoreRange && !existingLead.creditScoreRange) {
    existingLead.creditScoreRange = payload.creditScoreRange;
  }
  if (payload.requestedLoanAmount && !existingLead.requestedLoanAmount) {
    existingLead.requestedLoanAmount = payload.requestedLoanAmount;
  }

  // Telephony & Source: preserve existing DID if already present; otherwise set if provided
  if (payload.vicidialDid && !existingLead.vicidialDid) {
    existingLead.vicidialDid = payload.vicidialDid;
  }
  if (payload.vicidialCampaignName && !existingLead.vicidialCampaignName) {
    existingLead.vicidialCampaignName = payload.vicidialCampaignName;
  }
  if (payload.gtiCallUuid && !existingLead.gtiCallUuid) {
    existingLead.gtiCallUuid = payload.gtiCallUuid;
  }
  if (payload.sourceId && (!existingLead.sourceId || existingLead.sourceId === 'InboundCall')) {
    existingLead.sourceId = payload.sourceId;
  }

  // Notes: append rather than overwrite
  if (payload.notes) {
    if (existingLead.notes && existingLead.notes.trim() !== '') {
      if (!existingLead.notes.includes(payload.notes.trim())) {
        existingLead.notes = `${existingLead.notes}\n\n[Live Transfer Details]: ${payload.notes.trim()}`;
      }
    } else {
      existingLead.notes = payload.notes.trim();
    }
  }

  // Ensure duplicate flags are cleared since this is an enriched primary record
  existingLead.isDuplicate = false;
  existingLead.duplicateOf = undefined;

  return existingLead;
}

module.exports = {
  normalizePhoneVariations,
  isInboundStubLead,
  findLeadForEnrichment,
  enrichLeadWithPayload
};

const Lead = require('../models/Lead');
const GTIInboundCall = require('../models/GTIInboundCall');
const Organization = require('../models/Organization');
const { normalizeToE164, buildPhoneVariants } = require('../utils/gtiPhoneUtils');

// GTI organization name check
const GTI_ORG_CANONICAL_NAME = (process.env.GTI_ORG_NAME || 'GTI').trim().toUpperCase();
const normalizeOrgName = (name = '') => name.trim().toUpperCase();
const isGtiOrganizationName = (name) => !!name && normalizeOrgName(name) === GTI_ORG_CANONICAL_NAME;

const handleIncomingGtiCall = async (req, res) => {
  try {
    const { 
      primary_number: primaryNumber, 
      call_uuid: callUuid,
      did,
      DID
    } = req.body || {};

    if (!primaryNumber) {
      return res.status(400).json({ message: 'primary_number is required' });
    }

    if (!callUuid) {
      return res.status(400).json({ message: 'call_uuid is required' });
    }

    const normalizedPhone = normalizeToE164(primaryNumber);
    if (!normalizedPhone) {
      return res.status(400).json({ message: 'primary_number is invalid' });
    }

    // Extract DID (can be either 'did' or 'DID' field)
    const didNumber = (did || DID || '').toString().trim();

    console.log(`[GTI Incoming] Phone: ${primaryNumber}, DID: '${didNumber}', DID Length: ${didNumber.length}`);

    // Build phone variants for lookup
    const variantSet = new Set([
      ...buildPhoneVariants(primaryNumber),
      ...buildPhoneVariants(normalizedPhone),
      normalizedPhone
    ]);
    const variantList = Array.from(variantSet).filter(Boolean);

    // Check if this phone belongs to an existing lead and what organization it's in
    const existingLead = await Lead.findOne({
      phone: { $in: variantList }
    }).populate('organization', 'name');

    // Determine if this is a GTI organization lead
    const isGtiOrgLead = existingLead && 
                         existingLead.organization && 
                         isGtiOrganizationName(existingLead.organization.name);

    console.log(`[GTI Incoming] Existing Lead: ${!!existingLead}, Is GTI Org: ${isGtiOrgLead}`);

    // GTI organization restriction: MUST have DID (inbound calls only)
    if (isGtiOrgLead && (!didNumber || didNumber.length === 0)) {
      console.log(`❌ GTI organization call REJECTED - no/empty DID: ${primaryNumber}, DID: '${didNumber}'`);
      return res.status(403).json({ 
        message: 'GTI organization only accepts inbound calls with DID',
        status: 'rejected',
        reason: 'Missing or empty DID field'
      });
    }

    // For new leads (no existing record), we check if any organization with GTI name exists
    // If yes and no DID, reject the call preemptively
    if (!existingLead) {
      const gtiOrg = await Organization.findOne({ 
        name: { $regex: new RegExp(`^${GTI_ORG_CANONICAL_NAME}$`, 'i') }
      });
      
      console.log(`[GTI Incoming] GTI Org Found: ${!!gtiOrg}`);
      
      if (gtiOrg && (!didNumber || didNumber.length === 0)) {
        console.log(`❌ Potential GTI organization call REJECTED - no/empty DID: ${primaryNumber}, DID: '${didNumber}'`);
        return res.status(403).json({ 
          message: 'GTI organization only accepts inbound calls with DID',
          status: 'rejected',
          reason: 'Missing or empty DID field'
        });
      }
    }

    // Record the inbound call
    await GTIInboundCall.touchArrival(normalizedPhone, callUuid, didNumber || null);

    const leadCount = await Lead.countDocuments({
      phone: { $in: variantList }
    });

    const status = leadCount === 0 ? 'new lead' : 'duplicate';

    console.log(`✅ GTI incoming call accepted: ${primaryNumber}, DID: ${didNumber || 'N/A'}, Status: ${status}`);

    return res.status(200).json({ status });
  } catch (error) {
    console.error('GTI incoming webhook error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  handleIncomingGtiCall,
};

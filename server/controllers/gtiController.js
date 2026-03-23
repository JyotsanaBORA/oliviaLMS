const Lead = require('../models/Lead');
const GTIInboundCall = require('../models/GTIInboundCall');
const { normalizeToE164, buildPhoneVariants } = require('../utils/gtiPhoneUtils');

const handleIncomingGtiCall = async (req, res) => {
  try {
    const { primary_number: primaryNumber, call_uuid: callUuid } = req.body || {};

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

    await GTIInboundCall.touchArrival(normalizedPhone, callUuid);

    const variantSet = new Set([
      ...buildPhoneVariants(primaryNumber),
      ...buildPhoneVariants(normalizedPhone),
      normalizedPhone
    ]);
    const variantList = Array.from(variantSet).filter(Boolean);

    const leadCount = await Lead.countDocuments({
      phone: { $in: variantList }
    });

    const status = leadCount === 0 ? 'new lead' : 'duplicate';

    return res.status(200).json({ status });
  } catch (error) {
    console.error('GTI incoming webhook error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  handleIncomingGtiCall,
};

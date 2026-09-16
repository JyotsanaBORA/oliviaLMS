const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  const VicidialCall = require('../../models/VicidialCall');

  const calls = await VicidialCall.find({}).sort({ createdAt: -1 }).limit(5).lean();
  console.log('=== LAST 5 VICIDIAL CALLS RAW DUMP ===');
  console.log(JSON.stringify(calls, null, 2));

  // Also check if any VicidialCall has phone or did matching 9162092006 or 2006
  const anyMatch = await VicidialCall.find({
    $or: [
      { rawPayload: { $regex: '9162092006' } },
      { vicidialDid: { $regex: '9162092006' } },
      { callerPhone: { $regex: '9162092006' } },
      { phone_number: { $regex: '9162092006' } }
    ]
  }).lean();
  console.log(`\n=== VICIDIAL CALLS MATCHING '9162092006' in ANY field: ${anyMatch.length} ===`);
  console.log(JSON.stringify(anyMatch, null, 2));

  await mongoose.disconnect();
}

run().catch(console.error);

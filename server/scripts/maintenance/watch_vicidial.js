const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('📡 Connected to MongoDB - Watching for incoming ViciDial calls in real time...\n');
  console.log('Press Ctrl+C to exit.\n' + '='.repeat(80));

  const VicidialCall = require('../../models/VicidialCall');

  // 1. Show the last 5 calls received
  const lastCalls = await VicidialCall.find({}).sort({ createdAt: -1 }).limit(5).lean();
  console.log(`\n📋 [LAST 5 RECEIVED VICIDIAL CALLS IN DATABASE]:\n`);
  if (lastCalls.length === 0) {
    console.log('No calls recorded yet in VicidialCall collection.\n');
  } else {
    lastCalls.reverse().forEach((call, index) => {
      printCall(call, index + 1);
    });
  }

  console.log('='.repeat(80));
  console.log('👀 LIVE WATCHER ACTIVE: Waiting for new calls from ViciDial...\n');

  let lastCheckedTime = new Date();

  // 2. Poll every 2 seconds for new incoming calls
  setInterval(async () => {
    try {
      const newCalls = await VicidialCall.find({
        createdAt: { $gt: lastCheckedTime }
      }).sort({ createdAt: 1 }).lean();

      if (newCalls.length > 0) {
        newCalls.forEach(call => {
          console.log('\n🔔 [NEW INCOMING VICIDIAL CALL DETECTED!]');
          printCall(call);
        });
        lastCheckedTime = new Date(newCalls[newCalls.length - 1].createdAt);
      }
    } catch (err) {
      console.error('Error polling vicidial calls:', err.message);
    }
  }, 2000);
}

function printCall(call, num = '') {
  const time = call.createdAt ? new Date(call.createdAt).toLocaleString() : 'N/A';
  console.log(`--------------------------------------------------------------------------------`);
  console.log(`📞 Call ${num ? '#' + num : ''} | Time: ${time}`);
  console.log(`   Agent ID:    ${call.vicidialAgentId || call.agentId || 'N/A'}`);
  console.log(`   Phone:       ${call.phoneNumber || call.callerPhone || 'N/A'}`);
  console.log(`   Caller Name: ${call.callerName || call.firstName || 'N/A'}`);
  console.log(`   Campaign:    ${call.campaignName || 'N/A'}`);
  console.log(`   DID Sent:    "${call.vicidialDid || ''}" (Length: ${(call.vicidialDid || '').length})`);
  console.log(`   Call Type:   ${call.callType || 'N/A'}`);
  console.log(`   Raw Payload Received From ViciDial:`);
  console.log(JSON.stringify(call.rawPayload || call, null, 4));
}

main().catch(console.error);

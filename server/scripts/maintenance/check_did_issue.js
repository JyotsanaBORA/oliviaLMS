const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('CONNECTED_TO_DB');

  const targetDid = '19162092006';
  const targetCleanDid = '9162092006';

  const Organization = require('../../models/Organization');
  const User = require('../../models/User');
  const Lead = require('../../models/Lead');
  const InboundData = require('../../models/InboundData');
  const VicidialCall = require('../../models/VicidialCall');

  console.log('\n--- 3b. VICIDIAL CALLS IN VicidialCall COLLECTION ---');
  const vicCalls = await VicidialCall.find({
    $or: [
      { vicidialDid: targetDid },
      { vicidialDid: targetCleanDid },
      { callerPhone: { $regex: targetCleanDid } }
    ]
  }).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Matching VicidialCall Count:', vicCalls.length);
  vicCalls.forEach(v => console.log(`VicidialCall: DID=${v.vicidialDid}, Phone=${v.callerPhone}, Agent=${v.agentId}, Time=${v.callTime || v.createdAt}, Org=${v.organization}`));

  console.log('\n--- 3c. MOST RECENT 5 VICIDIAL CALLS (ANY DID) ---');
  const recentVic = await VicidialCall.find({}).sort({ createdAt: -1 }).limit(5).lean();
  recentVic.forEach(v => console.log(`Recent VicidialCall: DID=${v.vicidialDid}, Phone=${v.callerPhone}, Agent=${v.agentId}, Time=${v.callTime || v.createdAt}, Org=${v.organization}`));

  console.log('\n--- 1. ORGANIZATIONS WITH DID ---');
  const orgs = await Organization.find({
    $or: [
      { inboundDids: { $in: [targetDid, targetCleanDid] } },
      { liveTransferDid: targetDid },
      { liveTransferDid: targetCleanDid },
      { inboundCallsDid: targetDid },
      { inboundCallsDid: targetCleanDid }
    ]
  }).lean();
  console.log('Matching Orgs Count:', orgs.length);
  orgs.forEach(o => console.log(`Org: "${o.name}" (ID: ${o._id}, Active: ${o.isActive})`));

  if (orgs.length === 0) {
    console.log('⚠️ DID IS NOT ATTACHED TO ANY ORGANIZATION IN THE DATABASE!');
    console.log('\n--- ALL REGISTERED ORGANIZATIONS AND THEIR DIDS ---');
    const all = await Organization.find({}).select('name inboundDids liveTransferDid inboundCallsDid isActive').lean();
    all.forEach(o => console.log(`- Org: "${o.name}" | DIDs: [${(o.inboundDids || []).join(', ')}] | LiveTransfer: ${o.liveTransferDid} | InboundCalls: ${o.inboundCallsDid} | Active: ${o.isActive}`));
  }

  console.log('\n--- 2. USERS WITH DID ---');
  const users = await User.find({
    assignedDids: { $in: [targetDid, targetCleanDid] }
  }).populate('organization', 'name').lean();
  console.log('Matching Users Count:', users.length);
  users.forEach(u => console.log(`User: ${u.name} (${u.email}, Role: ${u.role}, Org: ${u.organization?.name})`));

  console.log('\n--- 3. INBOUND CALLS IN InboundData COLLECTION ---');
  const calls = await InboundData.find({
    $or: [
      { did: targetDid },
      { did: targetCleanDid },
      { phoneNumber: { $regex: targetCleanDid } }
    ]
  }).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Matching InboundData Count:', calls.length);
  calls.forEach(c => console.log(`Call: DID=${c.did}, Phone=${c.phoneNumber}, Status=${c.callStatus}, Time=${c.receivedAt || c.createdAt}, Org=${c.organization}`));

  console.log('\n--- 4. LEADS IN Lead COLLECTION ---');
  const leads = await Lead.find({
    $or: [
      { vicidialDid: targetDid },
      { vicidialDid: targetCleanDid },
      { phone: { $regex: targetCleanDid } }
    ]
  }).sort({ createdAt: -1 }).limit(10).lean();
  console.log('Matching Leads Count:', leads.length);
  leads.forEach(l => console.log(`Lead: Name=${l.name}, DID=${l.vicidialDid}, Phone=${l.phone}, Created=${l.createdAt}, Org=${l.organization}`));

  console.log('\n--- 5. MOST RECENT 5 INBOUND CALLS IN LMS (ANY DID) ---');
  const recent = await InboundData.find({}).sort({ createdAt: -1 }).limit(5).lean();
  recent.forEach(r => console.log(`Recent Call: DID=${r.did}, Phone=${r.phoneNumber}, Time=${r.receivedAt || r.createdAt}, Org=${r.organization}`));

  await mongoose.disconnect();
  console.log('\nDONE');
}

run().catch(console.error);

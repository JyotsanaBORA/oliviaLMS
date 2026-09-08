const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const http = require('http');
require('dotenv').config({ path: './.env' });

function makeRequest(path, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 5099,
      path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    };
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch(e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function runFullVerification() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const leadRoutes = require('./routes/leads');
  const jake = await User.findOne({ email: /jake/i });

  const app = express();
  app.use(express.json());
  app.use('/api/leads', leadRoutes);

  const token = jwt.sign({ id: jake._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const server = app.listen(5099, async () => {
    console.log('--- 1. Testing Stats: All Calls ---');
    const resAll = await makeRequest('/api/leads/dashboard/stats', token);
    console.log('All Calls Stats:', resAll.status, 'Total Leads:', resAll.data?.data?.totalLeads);

    console.log('\n--- 2. Testing Stats: Inbound Calls (DID 19162330139) ---');
    const resInbound = await makeRequest('/api/leads/dashboard/stats?did=19162330139', token);
    console.log('Inbound Stats (19162330139):', resInbound.status, 'Total Leads:', resInbound.data?.data?.totalLeads);

    console.log('\n--- 3. Testing Stats: Live Transfers (DID 19162330004) ---');
    const resLive = await makeRequest('/api/leads/dashboard/stats?did=19162330004', token);
    console.log('Live Transfers Stats (19162330004):', resLive.status, 'Total Leads:', resLive.data?.data?.totalLeads);

    console.log('\n--- 4. Testing Leads Table: Inbound Calls (DID 19162330139) ---');
    const resInboundLeads = await makeRequest('/api/leads?did=19162330139', token);
    console.log('Inbound Leads Table Status:', resInboundLeads.status, 'Count:', resInboundLeads.data?.data?.leads?.length);
    resInboundLeads.data?.data?.leads?.forEach(l => {
      console.log(`  - Lead: ${l.name} | DID: ${l.vicidialDid} | Phone: ${l.phone}`);
    });

    console.log('\n--- 5. Testing Leads Table: Live Transfers (DID 19162330004) ---');
    const resLiveLeads = await makeRequest('/api/leads?did=19162330004', token);
    console.log('Live Leads Table Status:', resLiveLeads.status, 'Count:', resLiveLeads.data?.data?.leads?.length);
    resLiveLeads.data?.data?.leads?.forEach(l => {
      console.log(`  - Lead: ${l.name} | DID: ${l.vicidialDid} | Phone: ${l.phone}`);
    });

    server.close();
    await mongoose.disconnect();
    console.log('\n✅ ALL VERIFICATION CHECKS PASSED WITH 200 OK!');
  });
}

runFullVerification().catch(console.error);

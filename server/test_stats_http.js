const http = require('http');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
require('dotenv').config({ path: './.env' });

async function testStatsHttp() {
  await mongoose.connect(process.env.MONGODB_URI);
  const User = require('./models/User');
  const jake = await User.findOne({ email: /jake/i });
  const token = jwt.sign({ id: jake._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: `/api/leads/dashboard/stats?_t=${Date.now()}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };

  const req = http.request(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log('HTTP Status:', res.statusCode);
      console.log('Response Body:', body);
      mongoose.disconnect();
    });
  });

  req.on('error', (err) => {
    console.error('Request error:', err);
    mongoose.disconnect();
  });

  req.end();
}

testStatsHttp();

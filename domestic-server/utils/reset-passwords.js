'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const DomUser  = require('../models/DomUser');

const accounts = [
  { email: 'superadmin@domesticlms.com', password: 'Admin@1234' },
  { email: 'admin@domesticlms.com',      password: 'Admin@1234' },
  { email: 'agent@domesticlms.com',      password: 'Agent@1234' },
];

mongoose.connect(process.env.DOM_MONGO_URI).then(async () => {
  console.log('[Reset] Connected to domesticdb');
  for (const acc of accounts) {
    const u = await DomUser.findOne({ email: acc.email }).select('+password');
    if (!u) { console.log('[Reset] NOT FOUND:', acc.email); continue; }
    u.password = acc.password;
    await u.save(); // triggers bcrypt pre-save hook
    console.log(`[Reset]  ${acc.email}    ${acc.password}`);
  }
  await mongoose.disconnect();
  console.log('[Reset] Done.');
}).catch(e => { console.error('[Reset] Error:', e.message); process.exit(1); });


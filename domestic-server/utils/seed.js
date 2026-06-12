'use strict';
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const DomUser  = require('../models/DomUser');

const MONGO_URI = process.env.DOM_MONGO_URI;
if (!MONGO_URI) {
  console.error('DOM_MONGO_URI not set in .env');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('[Seed] Connected to domesticdb');

  const accounts = [
    { name: 'Super Admin',  email: 'superadmin@domesticlms.com', password: 'SuperAdmin@1234', role: 'dom_superadmin' },
    { name: 'Admin User',   email: 'admin@domesticlms.com',      password: 'Admin@1234',      role: 'dom_admin'      },
    { name: 'Agent User',   email: 'agent@domesticlms.com',      password: 'Agent@1234',      role: 'domagent'       },
  ];

  for (const acc of accounts) {
    const existing = await DomUser.findOne({ email: acc.email }).lean();
    if (existing) {
      console.log(`[Seed] Already exists: ${acc.email} (${acc.role})`);
      continue;
    }
    await DomUser.create({ ...acc, isActive: true });
    console.log(`[Seed] Created ${acc.role}: ${acc.email} / ${acc.password}`);
  }

  await mongoose.disconnect();
  console.log('[Seed] Done.');
}

seed().catch((err) => {
  console.error('[Seed] Error:', err.message);
  process.exit(1);
});

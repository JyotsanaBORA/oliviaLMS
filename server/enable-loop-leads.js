/**
 * enable-loop-leads.js
 * ---------------------
 * One-time script: set showLoopLeads = true on the organisation
 * that peter@olivia.com belongs to.
 *
 * Usage (from the server/ directory):
 *   node enable-loop-leads.js
 */

'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./models/User');
const Organization = require('./models/Organization');

(async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('ERROR: MONGO_URI / MONGODB_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri);
  console.log('Connected to MongoDB.');

  const user = await User.findOne({ email: 'peter@olivia.com' }).lean();
  if (!user) {
    console.error('User peter@olivia.com not found.');
    await mongoose.disconnect();
    process.exit(1);
  }

  if (!user.organization) {
    console.error('User peter@olivia.com has no organisation assigned.');
    await mongoose.disconnect();
    process.exit(1);
  }

  const result = await Organization.findByIdAndUpdate(
    user.organization,
    { $set: { showLoopLeads: true } },
    { new: true }
  ).lean();

  if (!result) {
    console.error('Organisation not found for id:', user.organization);
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`✅  showLoopLeads enabled for org: "${result.name}" (${result._id})`);
  await mongoose.disconnect();
  process.exit(0);
})();

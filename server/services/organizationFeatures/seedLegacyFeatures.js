/**
 * Script to permanently seed/migrate legacy organization permissions into MongoDB documents.
 * Safe, idempotent, and non-destructive.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const Organization = require('../../models/Organization');
const { resolveOrgFeatures } = require('./featureService');

async function seedLegacyOrgFeatures() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI is not defined in server/.env');
    }

    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB successfully.');

    const organizations = await Organization.find({}).lean();
    console.log(`Found ${organizations.length} total organizations in database.`);

    let updatedCount = 0;

    for (const org of organizations) {
      const resolved = resolveOrgFeatures(org);
      const existingFeatures = org.features || {};

      // Check if features already exist and match resolved
      const needsUpdate = Object.keys(resolved).some(
        key => existingFeatures[key] === undefined
      );

      if (needsUpdate || !org.features) {
        const mergedFeatures = {
          ...resolved,
          ...existingFeatures, // preserve any explicitly set booleans
        };

        await Organization.updateOne(
          { _id: org._id },
          { $set: { features: mergedFeatures } }
        );

        console.log(`Updated features for: "${org.name}" (_id: ${org._id}) ->`, mergedFeatures);
        updatedCount++;
      } else {
        console.log(`Org "${org.name}" already has explicit features stored.`);
      }
    }

    console.log(`\nMigration complete. Successfully seeded features for ${updatedCount} organizations.`);
    await mongoose.disconnect();
    return { success: true, updatedCount };
  } catch (error) {
    console.error('Error seeding organization features:', error);
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    throw error;
  }
}

if (require.main === module) {
  seedLegacyOrgFeatures()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedLegacyOrgFeatures;

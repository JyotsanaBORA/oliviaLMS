const mongoose = require('mongoose');
const User = require('./models/User');
const Organization = require('./models/Organization');
require('dotenv').config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/lms';

async function setupForImport() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Check for existing users
    const users = await User.find({}).limit(5);
    console.log(`📊 Found ${await User.countDocuments({})} user(s) in database`);
    if (users.length > 0) {
      console.log('Sample users:');
      users.forEach(user => {
        console.log(`   - ${user.name || user.username} (${user.email}) - Role: ${user.role}`);
      });
    }
    console.log('');

    // Check existing organizations
    const orgs = await Organization.find({});
    console.log(`📊 Found ${orgs.length} organization(s) in database:`);
    orgs.forEach(org => {
      console.log(`   - ${org.name} (Prefix: ${org.orgPrefix}, ID: ${org._id})`);
    });
    console.log('');

    // If we have users and organizations, we're ready to import
    if (users.length > 0 && orgs.length > 0) {
      console.log('✅ Database is ready for CSV import!');
      console.log('   Run: node import-final-format-csv.js');
    } else if (users.length > 0 && orgs.length === 0) {
      // Create organization using first user
      const firstUser = users[0];
      console.log(`Creating REDDINGTON GLOBAL CONSULTANCY organization using user: ${firstUser.name || firstUser.username}...\n`);
      
      const reddington = new Organization({
        name: 'REDDINGTON GLOBAL CONSULTANCY',
        orgPrefix: 'RED',
        contactEmail: 'admin@reddington.com',
        contactPhone: '1234567890',
        isActive: true,
        createdBy: firstUser._id
      });
      
      await reddington.save();
      console.log(`✅ Created organization: ${reddington.name}`);
      console.log(`   - Prefix: ${reddington.orgPrefix}`);
      console.log(`   - ID: ${reddington._id}\n`);
      console.log('✅ Database is now ready for CSV import!');
      console.log('   Run: node import-final-format-csv.js');
    } else {
      console.log('⚠️  No users found in database.');
      console.log('   Please create users first before importing leads.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

if (require.main === module) {
  setupForImport()
    .then(() => {
      console.log('\n🎉 Setup completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Setup failed:', error);
      process.exit(1);
    });
}

module.exports = setupForImport;

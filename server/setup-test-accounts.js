// Script to create test accounts for load testing
// Run this before running load tests to ensure test accounts exist

const mongoose = require('mongoose');
const User = require('./models/User');
const Organization = require('./models/Organization');
require('dotenv').config();

// Test accounts configuration
const TEST_ACCOUNTS = [
  {
    name: 'Test Admin',
    email: 'testadmin@testorg.com',
    password: 'TestAdmin123!',
    role: 'admin'
  },
  {
    name: 'Test Agent 1',
    email: 'testagent1@testorg.com',
    password: 'TestAgent123!',
    role: 'agent1'
  },
  {
    name: 'Test Agent 2', 
    email: 'testagent2@testorg.com',
    password: 'TestAgent123!',
    role: 'agent2'
  },
  {
    name: 'Test Super Admin',
    email: 'testsuperadmin@test.com',
    password: 'TestSuper123!',
    role: 'superadmin'
  }
];

async function createTestAccounts() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected');

    // Create superadmin first (doesn't need organization)
    console.log('👑 Creating superadmin account...');
    const superadminData = TEST_ACCOUNTS.find(acc => acc.role === 'superadmin');
    
    let superadmin = await User.findOne({ email: superadminData.email });
    if (!superadmin) {
      superadmin = await User.create({
        ...superadminData,
        isActive: true,
        emailVerified: true
      });
      console.log('✅ Superadmin created');
    } else {
      console.log('ℹ️  Superadmin already exists');
    }

    // Create test organization using superadmin
    console.log('🏢 Creating test organization...');
    let testOrg = await Organization.findOne({ name: 'Test Organization' });
    
    if (!testOrg) {
      testOrg = await Organization.create({
        name: 'Test Organization',
        description: 'Organization for load testing',
        isActive: true,
        createdBy: superadmin._id,
        settings: {
          maxAgents: 100,
          maxLeadsPerDay: 10000
        }
      });
      console.log('✅ Test organization created');
    } else {
      console.log('ℹ️  Test organization already exists');
    }

    console.log('👥 Creating other test accounts...');
    
    for (const accountData of TEST_ACCOUNTS) {
      // Skip superadmin as we already created it
      if (accountData.role === 'superadmin') continue;
      
      const existingUser = await User.findOne({ email: accountData.email });
      
      if (existingUser) {
        console.log(`ℹ️  Account ${accountData.email} already exists`);
        continue;
      }

      const userData = {
        ...accountData,
        isActive: true,
        emailVerified: true
      };

      // Assign organization for admin and agents
      if (['admin', 'agent1', 'agent2'].includes(accountData.role)) {
        userData.organization = testOrg._id;
      }

      const user = await User.create(userData);
      console.log(`✅ Created ${accountData.role}: ${accountData.email}`);
    }

    console.log('🎉 Test account setup complete!');
    console.log('');
    console.log('📋 Test Accounts Created:');
    console.log('=========================');
    
    for (const account of TEST_ACCOUNTS) {
      console.log(`${account.role.toUpperCase()}: ${account.email} / ${account.password}`);
    }
    
    console.log('');
    console.log('⚠️  IMPORTANT SECURITY NOTES:');
    console.log('- These are TEST ACCOUNTS ONLY');
    console.log('- Never use these credentials in production');
    console.log('- Delete these accounts after testing');
    console.log('- Use a separate test database');

  } catch (error) {
    console.error('❌ Error creating test accounts:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Database disconnected');
    process.exit(0);
  }
}

// Run the setup
if (require.main === module) {
  createTestAccounts();
}

module.exports = { createTestAccounts, TEST_ACCOUNTS };
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Organization = require('../../models/Organization');

async function listOrganizations() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    const organizations = await Organization.find({});
    console.log(`\n📊 Found ${organizations.length} organizations:\n`);
    
    organizations.forEach(org => {
      console.log(`Organization: ${org.name}`);
      console.log(`  _id: ${org._id}`);
      console.log(`  Description: ${org.description}`);
      console.log(`  Email: ${org.email}`);
      console.log(`  Website: ${org.website}`);
      console.log(`  Created: ${org.createdAt}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  }
}

listOrganizations();

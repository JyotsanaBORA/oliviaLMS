const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const User = require('./models/User');
const Organization = require('./models/Organization');
const Lead = require('./models/Lead');

const exportDatabase = async () => {
  try {
    // Connect to current database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to source database');

    // Create export directory
    const exportDir = path.join(__dirname, 'database-export');
    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const exportPath = path.join(exportDir, `export-${timestamp}`);
    fs.mkdirSync(exportPath);

    console.log(`📁 Export directory: ${exportPath}`);

    // Export Users
    console.log('\n📤 Exporting Users...');
    const users = await User.find({}).select('+password'); // Include password for full backup
    console.log(`Found ${users.length} users`);
    
    // Save users with metadata
    const usersData = {
      collection: 'users',
      exportDate: new Date(),
      count: users.length,
      data: users
    };
    fs.writeFileSync(
      path.join(exportPath, 'users.json'), 
      JSON.stringify(usersData, null, 2)
    );
    console.log(`✅ Exported ${users.length} users`);

    // Export Organizations
    console.log('\n📤 Exporting Organizations...');
    const organizations = await Organization.find({});
    console.log(`Found ${organizations.length} organizations`);
    
    const organizationsData = {
      collection: 'organizations',
      exportDate: new Date(),
      count: organizations.length,
      data: organizations
    };
    fs.writeFileSync(
      path.join(exportPath, 'organizations.json'), 
      JSON.stringify(organizationsData, null, 2)
    );
    console.log(`✅ Exported ${organizations.length} organizations`);

    // Export Leads
    console.log('\n📤 Exporting Leads...');
    const leads = await Lead.find({});
    console.log(`Found ${leads.length} leads`);
    
    const leadsData = {
      collection: 'leads',
      exportDate: new Date(),
      count: leads.length,
      data: leads
    };
    fs.writeFileSync(
      path.join(exportPath, 'leads.json'), 
      JSON.stringify(leadsData, null, 2)
    );
    console.log(`✅ Exported ${leads.length} leads`);

    // Create export summary
    const summary = {
      exportDate: new Date(),
      sourceDatabase: process.env.MONGODB_URI.split('@')[1], // Hide credentials
      collections: {
        users: users.length,
        organizations: organizations.length,
        leads: leads.length
      },
      totalRecords: users.length + organizations.length + leads.length,
      files: [
        'users.json',
        'organizations.json', 
        'leads.json'
      ]
    };

    fs.writeFileSync(
      path.join(exportPath, 'export-summary.json'), 
      JSON.stringify(summary, null, 2)
    );

    console.log('\n🎉 Database export completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📍 Export location: ${exportPath}`);
    console.log(`📊 Total records exported: ${summary.totalRecords}`);
    console.log(`👥 Users: ${users.length}`);
    console.log(`🏢 Organizations: ${organizations.length}`);
    console.log(`📋 Leads: ${leads.length}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Create import instructions
    const instructions = `
DATABASE EXPORT COMPLETED
=========================

Export Date: ${new Date().toISOString()}
Export Path: ${exportPath}

Files Created:
- users.json (${users.length} records)
- organizations.json (${organizations.length} records) 
- leads.json (${leads.length} records)
- export-summary.json (metadata)

TO IMPORT TO NEW DATABASE:
1. Update your .env file with new database URI
2. Run: node import-database.js ${path.basename(exportPath)}

IMPORTANT NOTES:
- All passwords are included in the export
- ObjectIds will be preserved to maintain relationships
- Ensure new database is empty before importing
- Keep this export secure as it contains sensitive data
`;

    fs.writeFileSync(
      path.join(exportPath, 'README.txt'), 
      instructions
    );

    console.log('\n📝 Import instructions saved to README.txt');

  } catch (error) {
    console.error('❌ Export failed:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

// Run export
console.log('🚀 Starting database export...');
exportDatabase();

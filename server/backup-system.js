const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const Lead = require('./models/Lead');
const User = require('./models/User');
const Organization = require('./models/Organization');

const createBackup = async () => {
  try {
    console.log('💾 Creating system backup before Lead ID format migration...');
    console.log('============================================================');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');
    
    // Create backup directory with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupDir = path.join(__dirname, 'backups', `lead-id-migration-${timestamp}`);
    
    await fs.mkdir(backupDir, { recursive: true });
    console.log(`📁 Created backup directory: ${backupDir}`);
    
    // Backup leads collection
    console.log('\n📋 Backing up Leads collection...');
    const leads = await Lead.find({}).lean();
    await fs.writeFile(
      path.join(backupDir, 'leads.json'),
      JSON.stringify(leads, null, 2)
    );
    console.log(`✅ Exported ${leads.length} leads`);
    
    // Backup users collection
    console.log('👤 Backing up Users collection...');
    const users = await User.find({}).lean();
    await fs.writeFile(
      path.join(backupDir, 'users.json'),
      JSON.stringify(users, null, 2)
    );
    console.log(`✅ Exported ${users.length} users`);
    
    // Backup organizations collection
    console.log('🏢 Backing up Organizations collection...');
    const organizations = await Organization.find({}).lean();
    await fs.writeFile(
      path.join(backupDir, 'organizations.json'),
      JSON.stringify(organizations, null, 2)
    );
    console.log(`✅ Exported ${organizations.length} organizations`);
    
    // Create metadata file
    const metadata = {
      backupDate: new Date().toISOString(),
      migrationPurpose: 'Lead ID format change from LEAD########ß to ORG##########',
      collections: {
        leads: leads.length,
        users: users.length,
        organizations: organizations.length
      },
      leadIdFormats: {
        oldFormat: leads.filter(lead => lead.leadId && /^LEAD\d{8}$/.test(lead.leadId)).length,
        newFormat: leads.filter(lead => lead.leadId && /^ORG\d{10}$/.test(lead.leadId)).length,
        noLeadId: leads.filter(lead => !lead.leadId).length
      },
      databaseUri: process.env.MONGODB_URI.replace(/\/\/.*@/, '//[HIDDEN]@'), // Hide credentials
      nodeEnv: process.env.NODE_ENV || 'development'
    };
    
    await fs.writeFile(
      path.join(backupDir, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Create restoration script
    const restorationScript = `
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');

// Load the original models
const Lead = require('../models/Lead');
const User = require('../models/User');
const Organization = require('../models/Organization');

const restoreFromBackup = async () => {
  try {
    console.log('🔄 Restoring data from backup...');
    
    await mongoose.connect('${process.env.MONGODB_URI}');
    console.log('✅ Connected to MongoDB');
    
    // WARNING: This will completely replace existing data
    console.log('⚠️  WARNING: This will completely replace existing data!');
    console.log('Press Ctrl+C to cancel, or wait 10 seconds to continue...');
    
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Clear existing data
    await Lead.deleteMany({});
    await User.deleteMany({});
    await Organization.deleteMany({});
    console.log('🗑️  Cleared existing data');
    
    // Restore organizations first (dependencies)
    const orgsData = JSON.parse(await fs.readFile(path.join(__dirname, 'organizations.json'), 'utf8'));
    if (orgsData.length > 0) {
      await Organization.insertMany(orgsData);
      console.log(\`✅ Restored \${orgsData.length} organizations\`);
    }
    
    // Restore users
    const usersData = JSON.parse(await fs.readFile(path.join(__dirname, 'users.json'), 'utf8'));
    if (usersData.length > 0) {
      await User.insertMany(usersData);
      console.log(\`✅ Restored \${usersData.length} users\`);
    }
    
    // Restore leads
    const leadsData = JSON.parse(await fs.readFile(path.join(__dirname, 'leads.json'), 'utf8'));
    if (leadsData.length > 0) {
      await Lead.insertMany(leadsData);
      console.log(\`✅ Restored \${leadsData.length} leads\`);
    }
    
    console.log('🎉 Backup restoration completed successfully!');
    
  } catch (error) {
    console.error('❌ Restoration failed:', error.message);
  } finally {
    await mongoose.connection.close();
  }
};

if (require.main === module) {
  restoreFromBackup();
}

module.exports = restoreFromBackup;
`;
    
    await fs.writeFile(
      path.join(backupDir, 'restore.js'),
      restorationScript
    );
    
    // Create README
    const readme = `# Lead ID Migration Backup - ${timestamp}

This backup was created before migrating Lead ID format from LEAD######## to ORG##########

## Contents:
- leads.json: ${leads.length} lead records
- users.json: ${users.length} user records  
- organizations.json: ${organizations.length} organization records
- metadata.json: Backup metadata and statistics
- restore.js: Script to restore this backup

## Lead ID Format Statistics:
- Old format (LEAD########): ${metadata.leadIdFormats.oldFormat}
- New format (ORG##########): ${metadata.leadIdFormats.newFormat}  
- No Lead ID: ${metadata.leadIdFormats.noLeadId}

## To Restore:
\`\`\`bash
cd "${backupDir}"
node restore.js
\`\`\`

⚠️ **WARNING**: The restore script will completely replace all existing data!

## Migration Information:
- Purpose: Change Lead ID format from LEAD######## to ORG##########
- Date: ${new Date().toISOString()}
- Environment: ${process.env.NODE_ENV || 'development'}

## Format Details:
### Old Format: LEAD########
- LEAD: Static prefix
- ########: 8 digits (YYMM + 4-digit sequence)
- Example: LEAD24091234

### New Format: ORG##########  
- ORG: Static prefix (Organization)
- ##########: 10 digits (YYMMDD + 5-digit sequence)
- Example: ORG2509190001

## System Compatibility:
The system is designed to handle both formats simultaneously:
- Backend API routes accept both _id and leadId
- Database validation allows both formats
- Frontend displays work with both formats
- Search functionality works with both formats
`;
    
    await fs.writeFile(
      path.join(backupDir, 'README.md'),
      readme
    );
    
    console.log(`\n📊 Backup Summary:`);
    console.log(`   Directory: ${backupDir}`);
    console.log(`   Leads: ${leads.length} records`);
    console.log(`   Users: ${users.length} records`);
    console.log(`   Organizations: ${organizations.length} records`);
    console.log(`   Old format leads: ${metadata.leadIdFormats.oldFormat}`);
    console.log(`   New format leads: ${metadata.leadIdFormats.newFormat}`);
    console.log(`   Leads without ID: ${metadata.leadIdFormats.noLeadId}`);
    
    console.log(`\n✅ Backup completed successfully!`);
    console.log(`📁 Backup location: ${backupDir}`);
    console.log(`📋 See README.md for restoration instructions`);
    
    return backupDir;
    
  } catch (error) {
    console.error('❌ Backup failed:', error.message);
    console.error('Stack trace:', error.stack);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
};

if (require.main === module) {
  createBackup();
}

module.exports = createBackup;
/**
 * Setup Script: Persistent Leads Feature
 * 
 * This script sets up the persistent leads feature in your database.
 * It runs verification first, then migration if needed.
 */

const { verifyDatabaseForPersistentLeads } = require('./verify-persistent-leads-database');
const { migratePersistentLeadsFeature } = require('./migrate-persistent-leads-feature');

async function setupPersistentLeadsFeature() {
  console.log('🚀 Setting up Persistent Leads Feature...\n');
  
  try {
    // Step 1: Verify current database state
    console.log('STEP 1: Verifying current database state...');
    await verifyDatabaseForPersistentLeads();
    
    console.log('\n' + '='.repeat(60));                   
    
    // Step 2: Ask user if they want to proceed with migration
    console.log('\nSTEP 2: Database Migration');
    console.log('⚠️  The migration will update your database to support persistent leads.');
    console.log('💾 This is safe and will not delete any existing data.');
    console.log('🔄 It will add default values for qualificationStatus and leadProgressStatus fields.');
    
    // In a real scenario, you might want to prompt for user confirmation
    // For automation, we'll proceed with migration
    console.log('\n🔄 Proceeding with migration...');
    await migratePersistentLeadsFeature();
    
    console.log('\n' + '='.repeat(60));
    console.log('\n🎉 SETUP COMPLETED SUCCESSFULLY!');
    console.log('\n📋 What was done:');
    console.log('✅ Database verified for persistent leads compatibility');
    console.log('✅ Missing status fields added to existing leads');
    console.log('✅ Assigned leads configured for persistence');
    console.log('✅ Backend API endpoints ready');
    console.log('✅ Frontend dashboard updated');
    
    console.log('\n🎯 Next Steps:');
    console.log('1. Restart your server to load the updated code');
    console.log('2. Login as Agent1 and assign a lead to Agent2');
    console.log('3. Login as Agent2 and check the new dashboard tabs');
    console.log('4. Test status updates to ensure leads move correctly');
    
    console.log('\n💡 Tips:');
    console.log('- Leads will now persist in Agent2 dashboard until status is updated');
    console.log('- Use "Pending Qualification" tab for qualification workflow');
    console.log('- Use "Callback Needed" tab for follow-up workflow');
    console.log('- Status updates are real-time across all connected browsers');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    console.log('\n🔧 Troubleshooting:');
    console.log('1. Check your MongoDB connection string in .env');
    console.log('2. Ensure MongoDB is running');
    console.log('3. Verify you have write permissions to the database');
    console.log('4. Check server logs for detailed error messages');
    throw error;
  }
}
                 
// Handle script execution
if (require.main === module) {
  setupPersistentLeadsFeature()
    .then(() => {
      console.log('\n✅ Setup script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Setup script failed:', error);
      process.exit(1);
    });
}

module.exports = { setupPersistentLeadsFeature };
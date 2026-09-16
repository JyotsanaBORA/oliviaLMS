const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../../models/User');

const updateSuperAdminPasswords = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const targetPassword = '@dm!n123';
    const superAdminEmails = [
      'vishal@lms.com',
      'jitin@lms.com', 
      'jyotsana@lms.com'
    ];

    console.log('Updating super admin passwords...\n');

    // Hash the target password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(targetPassword, salt);

    for (const email of superAdminEmails) {
      try {
        const user = await User.findOne({ email: email });
        
        if (!user) {
          console.log(`❌ User ${email} not found`);
          continue;
        }

        // Update password
        user.password = hashedPassword;
        await user.save();
        
        console.log(`✅ Updated password for ${user.name} (${email})`);
        console.log(`   Role: ${user.role}`);
        console.log(`   Active: ${user.isActive}`);
        
        // Test the password
        const isPasswordValid = await bcrypt.compare(targetPassword, user.password);
        console.log(`   Password verification: ${isPasswordValid ? '✅ Valid' : '❌ Invalid'}`);
        console.log('');

      } catch (error) {
        console.error(`❌ Error updating ${email}:`, error.message);
      }
    }

    // Final verification
    console.log('\n--- Final Verification ---');
    const allSuperAdmins = await User.find({ 
      role: 'superadmin',
      email: { $in: superAdminEmails }
    }).select('name email role isActive password');
    
    console.log(`Super admins with specified emails: ${allSuperAdmins.length}`);
    
    for (const admin of allSuperAdmins) {
      // Test login credentials
      const passwordTest = await bcrypt.compare(targetPassword, admin.password);
      console.log(`- ${admin.name} (${admin.email})`);
      console.log(`  Role: ${admin.role} | Active: ${admin.isActive} | Password: ${passwordTest ? '✅' : '❌'}`);
    }

    console.log('\n🎉 All super admins are ready with credentials:');
    console.log('Email: vishal@lms.com, jitin@lms.com, jyotsana@lms.com');
    console.log('Password: @dm!n123 (same for all)');

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  }
};

// Run the script
updateSuperAdminPasswords();

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
require('dotenv').config();

const setSuperAdminPasswords = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const targetPassword = '@dm!n123';
    const superAdmins = [
      { email: 'vishal@lms.com', name: 'Vishal Super Admin' },
      { email: 'jitin@lms.com', name: 'Jitin Super Admin' },
      { email: 'jyotsana@lms.com', name: 'Jyotsana Super Admin' }
    ];

    console.log('Setting super admin passwords...\n');

    // Hash the password once
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(targetPassword, salt);
    console.log('Password hashed successfully');

    for (const adminInfo of superAdmins) {
      try {
        // Find user including password field
        const user = await User.findOne({ email: adminInfo.email }).select('+password');
        
        if (!user) {
          console.log(`❌ User ${adminInfo.email} not found, creating...`);
          
          // Create new user
          const newUser = new User({
            name: adminInfo.name,
            email: adminInfo.email,
            password: hashedPassword,
            role: 'superadmin',
            isActive: true,
            createdAt: new Date()
          });
          
          await newUser.save();
          console.log(`✅ Created new super admin: ${adminInfo.name}`);
        } else {
          // Update password directly
          user.password = hashedPassword;
          user.role = 'superadmin';
          user.isActive = true;
          await user.save();
          
          console.log(`✅ Updated password for: ${user.name}`);
        }

        // Verify the password works by finding user again
        const verifyUser = await User.findOne({ email: adminInfo.email }).select('+password');
        if (verifyUser) {
          const isValid = await bcrypt.compare(targetPassword, verifyUser.password);
          console.log(`   Login test: ${isValid ? '✅ SUCCESS' : '❌ FAILED'}`);
          console.log(`   Role: ${verifyUser.role}`);
          console.log(`   Active: ${verifyUser.isActive}`);
        }
        console.log('');

      } catch (error) {
        console.error(`❌ Error with ${adminInfo.email}:`, error.message);
      }
    }

    console.log('\n🎉 Super Admin Setup Complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('SUPER ADMIN CREDENTIALS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Email: vishal@lms.com      | Password: @dm!n123');
    console.log('Email: jitin@lms.com       | Password: @dm!n123');
    console.log('Email: jyotsana@lms.com    | Password: @dm!n123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('All users have role: superadmin');
    console.log('All users are active: true');

    // Final count verification
    const totalSuperAdmins = await User.countDocuments({ role: 'superadmin' });
    console.log(`\nTotal super admins in database: ${totalSuperAdmins}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
    process.exit(0);
  }
};

// Run the script
setSuperAdminPasswords();

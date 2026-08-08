// LMS: reset passwords for test users and find normal agent
const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  // Reset superadmin
  const sa = await User.findOne({ email: 'vishal@lms.com' }).select('+password');
  if (sa) { sa.password = 'Test@1234'; await sa.save(); console.log('SA reset:', sa.email); }

  // Reset main org admin (ricardo)
  const ra = await User.findOne({ email: 'ricardo.cantopher@immergix.com' }).select('+password');
  if (ra) { ra.password = 'Test@1234'; await ra.save(); console.log('Main admin reset:', ra.email, 'org:', ra.organization); }

  // Find a normal agent that is active
  const agent = await User.findOne({ role: { $in: ['agent1', 'agent2'] }, isActive: true }).select('name email role organization');
  if (agent) {
    agent.password = 'Test@1234';
    await User.findByIdAndUpdate(agent._id, {});
    const a2 = await User.findById(agent._id).select('+password');
    a2.password = 'Test@1234';
    await a2.save();
    console.log('Agent reset:', a2.email, 'role:', a2.role);
  }

  // Find normal admin (non-main-org)
  const na = await User.findOne({ role: 'admin', email: { $ne: 'ricardo.cantopher@immergix.com' }, isActive: true }).select('name email role organization');
  if (na) {
    const n2 = await User.findById(na._id).select('+password');
    n2.password = 'Test@1234';
    await n2.save();
    console.log('Normal admin reset:', n2.email);
  }

  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });

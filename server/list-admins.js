const m = require('mongoose');
m.connect(process.env.MONGODB_URI).then(async () => {
  const s = new m.Schema({ name: String, email: String, role: String, isActive: Boolean }, { collection: 'users' });
  const U = m.model('U', s);
  const r = await U.find({ role: { $in: ['superadmin', 'admin'] } }).select('name email role isActive').lean();
  r.forEach(u => console.log(`${u.role.padEnd(12)} ${String(u.isActive).padEnd(6)} ${u.email.padEnd(45)} ${u.name}`));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });

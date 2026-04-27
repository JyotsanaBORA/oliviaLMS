const mongoose = require('mongoose');
const Org = require('./models/Organization');
require('dotenv').config();
mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const org = await Org.findById('68b9c76d2c29dac1220cb81c').lean();
  console.log('Ricardo org:', JSON.stringify({ _id: org._id, name: org.name }, null, 2));
  process.exit(0);
}).catch(e => { console.error(e.message); process.exit(1); });

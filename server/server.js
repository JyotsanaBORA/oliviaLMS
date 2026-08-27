// =========================
// Imports & Initial Setup
// =========================
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const morgan = require('morgan');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
require('dotenv').config();

const { formatEasternTime, getEasternNow, getEasternStartOfDay } = require('./utils/timeFilters');
const cron = require('node-cron');
const SocketOptimizer = require('./utils/socketOptimizer');
const { pubClient, subClient, isRedisReady } = require('./utils/redisClient');
const { createAdapter } = require('@socket.io/redis-adapter');

// Routes
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const organizationRoutes = require('./routes/organizations');
const gtiIncomingRoutes = require('./routes/gtiIncoming');
const adminUploadRoutes = require('./routes/adminUploads');
const vicidialRoutes = require('./routes/vicidial');
const notesRoutes = require('./routes/notes');
const webhookRoutes     = require('./routes/webhook');
const metaWebhookRoutes = require('./routes/metaWebhook');
const loopWebhookRoutes = require('./routes/loopWebhook');
const loopLeadsRoutes   = require('./routes/loopLeads');
const websiteLeadsRoutes = require('./routes/websiteLeads');
const benWebhookRoutes   = require('./routes/benWebhook');
const benWebsiteLeadsRoutes = require('./routes/benWebsiteLeads');
const affiliateRoutes = require('./routes/affiliate');
const dataVendorRoutes = require('./routes/dataVendorUploads');
const aiWebhookRoutes = require('./routes/aiRoutes/aiWebhook');

const app = express();
const server = http.createServer(app);
const dev = process.env.NODE_ENV !== 'production';

// =========================
// PROXY TRUST SETTINGS
// =========================
// Correct setting for Nginx reverse proxy
app.set('trust proxy', 1);  
// REMOVE app.enable('trust proxy') because it breaks express-rate-limit

// =========================
// CORS Setup
// =========================
const getCorsOrigins = () => {
  const base = [
    'https://olivialms.cloud',
    'https://www.olivialms.cloud',
    'http://olivialms.cloud',
    'http://www.olivialms.cloud',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost:3004',
    'http://127.0.0.1:3004',
    'http://localhost:5000',
    'http://127.0.0.1:5000',
  ];

  if (process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN.split(',').forEach(o => {
      if (o.trim()) base.push(o.trim());
    });
  }

  return [...new Set(base)];
};

const corsOrigins = getCorsOrigins();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key']
}));

// =========================
// Security Middlewares
// =========================
app.use(compression()); // gzip all responses — reduces payload size 60–80%
app.use(helmet());
app.use(mongoSanitize());
app.use(express.json({
  limit: '30mb',
  // Capture raw body for Meta webhook HMAC signature verification
  verify: (req, _res, buf) => {
    if (req.path.startsWith('/api/webhook/meta')) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '30mb' }));
app.use(express.text({ limit: '10mb', type: ['text/plain', 'text/*'] }));
app.use(morgan('combined'));

// =========================
// Rate Limiting FIXED
// =========================
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: dev ? 1000 : 5000,
  message: 'Too many requests, try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: false   // FIX THE CRASH
});

app.use('/api', limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: dev ? 50 : 200,
  message: 'Too many login attempts.',
  standardHeaders: true,
  legacyHeaders: false,
  trustProxy: false
});
app.use('/api/auth', authLimiter);

// =========================
// Socket.io Setup
// =========================
const io = socketIo(server, {
  cors: {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// =========================
// Redis Adapter (multi-process / multi-server)
// Wired immediately after io is created so the adapter is active before
// any socket connects.  Falls back gracefully when Redis is not available.
// =========================
(async () => {
  // Wait up to 3 s for Redis to be ready, then give up and continue without it.
  let waited = 0;
  while (!isRedisReady() && waited < 3000) {
    await new Promise(r => setTimeout(r, 100));
    waited += 100;
  }
  if (isRedisReady()) {
    try {
      io.adapter(createAdapter(pubClient, subClient));
      console.log('[Socket.IO] Redis adapter active — multi-process broadcasting enabled');
    } catch (err) {
      console.warn('[Socket.IO] Could not attach Redis adapter, using in-memory adapter:', err.message);
    }
  } else {
    console.warn('[Socket.IO] Redis not ready — using in-memory adapter (single-process mode)');
  }
})();

const socketOptimizer = new SocketOptimizer(io);

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const { userId, userRole, organizationId } = socket.handshake.auth || {};

  if (userId && userRole) {
    socketOptimizer.registerUser(socket, userId, userRole, organizationId);

    // Join named rooms — used for cross-process targeting via Redis adapter
    socket.join(`user_${userId}`);
    socket.join(`role_${userRole}`);
    if (organizationId) socket.join(`org_${organizationId}`);
  }

  socket.on('disconnect', () => {
    if (userId && userRole) {
      socketOptimizer.unregisterUser(socket, userId, userRole);
    }
  });
});

// =========================
// Attach Socket to Requests
// =========================
app.use((req, res, next) => {
  req.io = io;
  req.socketOptimizer = socketOptimizer;
  next();
});

// =========================
// API ROUTES
// =========================
app.use('/api/auth', authRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/gti', gtiIncomingRoutes);
app.use('/api/admin-uploads', adminUploadRoutes);
app.use('/api/vicidial', vicidialRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/webhook', benWebhookRoutes);
app.use('/api/webhook/meta', metaWebhookRoutes);
app.use('/api/webhook/loop', loopWebhookRoutes);
app.use('/api/loop-leads',  loopLeadsRoutes);
app.use('/api/website-leads', websiteLeadsRoutes);
app.use('/api/ben-website-leads', benWebsiteLeadsRoutes);
app.use('/api/affiliate', affiliateRoutes);
app.use('/api/data-vendor-uploads', dataVendorRoutes);
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/webhook', aiWebhookRoutes);

// =========================
// HEALTH CHECK
// =========================
app.get('/api/health', (req, res) => {
  return res.status(200).json({
    status: 'OK',
    time: formatEasternTime(getEasternNow()),
    uptime: process.uptime()
  });
});

// =========================
// STATIC FILES (Production)
// =========================
if (!dev) {
  app.use(express.static(path.join(__dirname, '../client/build')));

  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
    }
  });
}

// =========================
// MONGODB CONNECTION
// =========================
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB ERROR:', err.message);
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
};

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${process.env.NODE_ENV} on port ${PORT}`);
  });

  // ── Nightly cleanup: dismiss all stale pending/active VicidialCall records
  // from previous days so they don't carry over to the next day's queue.
  // Runs at midnight Eastern Time (00:00) every day.
  const VicidialCall = require('./models/VicidialCall');
  cron.schedule('0 0 * * *', async () => {
    try {
      const todayStart = getEasternStartOfDay();
      const result = await VicidialCall.updateMany(
        {
          queueStatus: { $in: ['pending', 'active'] },
          receivedAt: { $lt: todayStart },
        },
        { $set: { queueStatus: 'dismissed' } }
      );
      if (result.modifiedCount > 0) {
        console.log(`[Daily Reset] Dismissed ${result.modifiedCount} stale VicidialCall record(s) from previous days.`);
      }
    } catch (err) {
      console.error('[Daily Reset] Error dismissing stale VicidialCalls:', err.message);
    }
  }, { timezone: 'America/New_York' });
});

// Graceful Shutdown
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

module.exports = { app, io };

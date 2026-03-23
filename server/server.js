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

const { formatEasternTime, getEasternNow } = require('./utils/timeFilters');
const SocketOptimizer = require('./utils/socketOptimizer');

// Routes
const authRoutes = require('./routes/auth');
const leadRoutes = require('./routes/leads');
const organizationRoutes = require('./routes/organizations');
const gtiIncomingRoutes = require('./routes/gtiIncoming');
const adminUploadRoutes = require('./routes/adminUploads');
const vicidialRoutes = require('./routes/vicidial');

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
  if (dev) {
    return ['http://localhost:3000', 'http://127.0.0.1:3000'];
  }

  const base = [
    'https://olivialms.cloud',
    'https://www.olivialms.cloud',
    'http://olivialms.cloud',
    'http://www.olivialms.cloud'
  ];

  if (process.env.CORS_ORIGIN) {
    base.push(process.env.CORS_ORIGIN);
  }

  return base;
};

const corsOrigins = getCorsOrigins();

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// =========================
// Security Middlewares
// =========================
app.use(compression()); // gzip all responses — reduces payload size 60–80%
app.use(helmet());
app.use(mongoSanitize());
app.use(express.json({ limit: '30mb' }));
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

const socketOptimizer = new SocketOptimizer(io);

// Socket.io Connection
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  const { userId, userRole, organizationId } = socket.handshake.auth || {};

  if (userId && userRole) {
    socketOptimizer.registerUser(socket, userId, userRole, organizationId);

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
});

// Graceful Shutdown
process.on('SIGINT', () => process.exit());
process.on('SIGTERM', () => process.exit());

module.exports = { app, io };

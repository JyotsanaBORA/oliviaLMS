'use strict';
// ── Force IST (Indian Standard Time = UTC+5:30) for all date operations ────
process.env.TZ = 'Asia/Kolkata';

const path      = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express   = require('express');
const http      = require('http');
const cors      = require('cors');
const helmet    = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const fs        = require('fs');
const mongoose  = require('mongoose');

// ── App setup ──────────────────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// Trust the first proxy (needed for express-rate-limit behind dev proxy / nginx)
app.set('trust proxy', 1);

// ── Socket.io ──────────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3002',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout:  60000,
  pingInterval: 25000,
});

// Attach io to app so routes can emit events
app.set('io', io);

// Socket.io connection handling
io.on('connection', (socket) => {
  // Client sends their role after login; join the domagents room if applicable
  socket.on('join_room', (role) => {
    if (['domagent', 'dom_admin', 'dom_superadmin'].includes(role)) {
      socket.join('domagents');
      console.log(`[Socket] Client joined room: domagents (role=${role})`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Client disconnected: ${socket.id}`);
  });
});

// ── Security middleware ────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow serving uploaded files
}));

app.use(cors({
  origin: (origin, callback) => {
    // Always allow the configured origins plus the Olivia client (port 3000) which proxies domestic-api
    const base = (process.env.CORS_ORIGIN || 'http://localhost:3004').split(',').map(s => s.trim());
    const allowed = [...new Set([...base, 'http://localhost:3000', 'http://localhost:3004'])];
    if (!origin || allowed.includes(origin)) return callback(null, true);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limiting — global
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
}));

// Stricter limit for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many login attempts, please try again later.' },
});

// Stricter limit for intake route (called by website)
const intakeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Intake rate limit exceeded.' },
});

// ── Body parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(mongoSanitize()); // prevent NoSQL injection

// ── Uploads directory ──────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, process.env.UPLOAD_PATH || 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Serve uploaded files — static with CORP header already set by helmet
app.use('/domestic-api/files', express.static(uploadsDir, {
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'private, max-age=3600');
  },
}));

// Explicit fallback: if express.static couldn't find the file, return a clear 404
app.get('/domestic-api/files/:leadId/:filename', (req, res) => {
  const { leadId, filename } = req.params;
  // Safety: prevent path traversal
  if (filename.includes('..') || leadId.includes('..')) {
    return res.status(400).json({ success: false, message: 'Invalid path.' });
  }
  const filePath = path.join(uploadsDir, leadId, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found. It may have been deleted or the server was restarted.' });
  }
  res.sendFile(filePath);
});

// ── Routes ────────────────────────────────────────────────────────────────
const authRoutes          = require('./routes/auth');
const intakeRoutes        = require('./routes/intake');
const websiteLeadRoutes   = require('./routes/websiteLeads');
const leadRoutes          = require('./routes/leads');
const notificationRoutes  = require('./routes/notifications');
const uploadRoutes        = require('./routes/uploads');
const adminRoutes         = require('./routes/admin');
const importLeadsRoutes   = require('./routes/importLeads');

app.use('/domestic-api/auth',           authLimiter, authRoutes);
app.use('/domestic-api/intake',         intakeLimiter, intakeRoutes);
app.use('/domestic-api/website-leads',  websiteLeadRoutes);
app.use('/domestic-api/leads',          leadRoutes);
app.use('/domestic-api/notifications',  notificationRoutes);
app.use('/domestic-api/uploads',        uploadRoutes);
app.use('/domestic-api/admin',          adminRoutes);
app.use('/domestic-api/import-leads',   importLeadsRoutes);

// Health check
app.get('/domestic-api/health', (req, res) => {
  res.json({ success: true, service: 'domestic-lms', timestamp: new Date().toISOString() });
});

// ── Serve React build in production ───────────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, '../domestic-client/build');
  app.use('/domestic', express.static(buildPath));
  app.get('/domestic', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
  app.get('/domestic/*', (req, res) => res.sendFile(path.join(buildPath, 'index.html')));
}

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

// Global error handler
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[Error]', err.message);
  const status = err.status || 500;
  res.status(status).json({ success: false, message: err.message || 'Internal server error.' });
});

// ── MongoDB connection ─────────────────────────────────────────────────────
const MONGO_URI = process.env.DOM_MONGO_URI;
if (!MONGO_URI) {
  console.error('FATAL: DOM_MONGO_URI is not set in .env');
  process.exit(1);
}

const PORT = parseInt(process.env.PORT, 10) || 5001;

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('[DB] Connected to domesticdb');
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Domestic LMS running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
})
.catch((err) => {
  console.error('[DB] Connection failed:', err.message);
  process.exit(1);
});

module.exports = { app, io };

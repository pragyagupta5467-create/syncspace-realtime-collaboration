import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config/index.js';
import { connectDB, isDBConnected } from './config/db.js';
import apiRoutes from './routes/apiRoutes.js';
import authRoutes from './routes/authRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import aiRoutes from './routes/aiRoutes.js';
import { setupSocketHandlers } from './sockets/socketHandler.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();
const httpServer = http.createServer(app);

// Connect to MongoDB
connectDB();

// Allowed Origins Configuration
const allowedOrigins = [
  config.clientUrl,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, server-to-server)
    if (!origin || allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Blocked by CORS security policy'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Initialize Socket.IO with CORS settings
const io = new Server(httpServer, {
  cors: {
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin) || config.nodeEnv === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 30000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e5, // 100 KB payload ceiling
});

// Attach Socket Handlers
setupSocketHandlers(io);

// Security & Content-Type Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middlewares
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// Health Check Endpoint (Lightweight & Unauthenticated)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'SyncSpace Real-Time Collaboration Backend',
    database: isDBConnected() ? 'connected' : 'standby',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Authentication Routes
app.use('/api/auth', authRoutes);

// Notification Routes
app.use('/api/notifications', notificationRoutes);

// AI Workspace Assistant Routes
app.use('/api/ai', aiRoutes);

// Base API Routes
app.use('/api', apiRoutes);

// Root Route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to SyncSpace API - Real-Time Multiplayer Collaborative Workspace Engine',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/auth',
      notifications: '/api/notifications',
      ai: '/api/ai',
      apiHealth: '/api/health',
      rooms: '/api/rooms',
    },
  });
});

// Error handling
app.use(notFound);
app.use(errorHandler);

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
  console.log(`🚀 SyncSpace Real-Time Server running on port ${PORT} [${config.nodeEnv}]`);
});

// Graceful Shutdown Handler
const handleGracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  try {
    // Stop accepting new socket connections and close active sockets
    io.close(() => {
      console.log('🔌 Socket.IO connections closed cleanly.');
    });

    // Close HTTP server
    httpServer.close(() => {
      console.log('🌐 HTTP Server closed.');
    });

    // Close MongoDB connection if connected
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('🍃 MongoDB connection closed.');
    }

    console.log('✅ SyncSpace shutdown complete.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during graceful shutdown:', err.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => handleGracefulShutdown('SIGINT'));

export { app, httpServer, io };

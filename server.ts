import 'dotenv/config';
import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { db } from './src/server/db';
import { seedInitialDataIfEmpty } from './src/server/services/seedService';
import { slaService } from './src/server/services/slaService';
import { getQuotaStatus } from './src/server/services/aiService';
import { notificationWorker } from './src/server/services/notificationWorker';
import { getEmailConfig } from './src/server/services/emailService';
import { getSmsConfig } from './src/server/services/smsService';

import authRoutes from './src/server/routes/authRoutes';
import complaintRoutes from './src/server/routes/complaintRoutes';
import aiRoutes from './src/server/routes/aiRoutes';
import notificationRoutes from './src/server/routes/notificationRoutes';
import announcementRoutes from './src/server/routes/announcementRoutes';
import analyticsRoutes from './src/server/routes/analyticsRoutes';
import adminRoutes from './src/server/routes/adminRoutes';

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Dynamic CORS Origin Whitelist Parsing
const defaultOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://localhost:5174',
];
const envCors = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  : defaultOrigins;

export function isAllowedCorsOrigin(origin: string | undefined): boolean {
  // Allow non-browser requests (mobile apps, curl, server-to-server)
  if (!origin) return true;

  // Wildcard or explicit whitelist match
  if (envCors.includes('*') || envCors.includes(origin)) {
    return true;
  }

  // Local development hostnames
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  // AI Studio / Cloud Run dev & preview environments (*.run.app, *.googleusercontent.com)
  if (/^https:\/\/([a-z0-9-]+\.)*(run\.app|googleusercontent\.com)$/.test(origin)) {
    return true;
  }

  // Official REC Bijnor domains (*.recb.ac.in, *.recbijnor.ac.in)
  if (/^https:\/\/([a-z0-9-]+\.)*(recb\.ac\.in|recbijnor\.ac\.in)$/.test(origin)) {
    return true;
  }

  return false;
}

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (isAllowedCorsOrigin(origin)) {
      return callback(null, true);
    }
    // Return null, false to safely deny CORS headers without throwing an unhandled 500 error in Express
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Health & Diagnostic Check Endpoint
app.get('/api/health', async (req: Request, res: Response) => {
  const dbHealth = await db.getHealthStatus();
  const quota = getQuotaStatus();
  const emailCfg = getEmailConfig();
  const smsCfg = getSmsConfig();

  const isHealthy = dbHealth.connected;
  const httpStatus = isHealthy ? 200 : 503;

  res.status(httpStatus).json({
    status: isHealthy ? 'healthy' : 'degraded',
    system: 'REC Bijnor Campus Care Management Engine',
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      type: 'MongoDB (Mongoose)',
      connected: dbHealth.connected,
      status: dbHealth.status,
      readyState: dbHealth.readyState,
      configured: dbHealth.uriConfigured,
      pingLatencyMs: dbHealth.pingLatencyMs,
      host: dbHealth.host,
      databaseName: dbHealth.databaseName,
      error: dbHealth.error,
    },
    notifications: {
      emailConfigured: emailCfg.isConfigured,
      smsConfigured: smsCfg.isConfigured,
      smsProvider: smsCfg.provider,
      workerActive: isHealthy && process.env.NOTIFICATION_QUEUE_ENABLED !== 'false',
      queueType: 'MongoDB Durable Event Queue',
    },
    aiEngine: {
      configured: Boolean(process.env.GEMINI_API_KEY),
      model: 'gemini-3.8-flash',
      fallback: 'Rule-Based Deterministic Engine (Active)',
      quotaCooldown: quota.isExceeded ? quota : null,
    },
    timestamp: new Date().toISOString(),
  });
});

// Dedicated DB Health Endpoint
app.get('/api/health/db', async (req: Request, res: Response) => {
  const dbHealth = await db.getHealthStatus();
  res.status(dbHealth.connected ? 200 : 503).json(dbHealth);
});

// Database guard middleware for endpoints requiring persistence
const requireDatabase = (req: Request, res: Response, next: NextFunction) => {
  if (!db.isConnected) {
    res.status(503).json({
      error: 'Database service unavailable',
      message: `MongoDB is not connected: ${db.connectionError || 'Connection failed'}. Please configure MONGODB_URI.`,
      details: db.connectionError,
    });
    return;
  }
  next();
};

// API Routes
app.use('/api/ai', aiRoutes); // Available even when DB is offline (ai triage / chatbot)
app.use('/api/auth', requireDatabase, authRoutes);
app.use('/api/complaints', requireDatabase, complaintRoutes);
app.use(
  '/api/notifications',
  (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/status') return next();
    return requireDatabase(req, res, next);
  },
  notificationRoutes
);
app.use('/api/announcements', requireDatabase, announcementRoutes);
app.use('/api/analytics', requireDatabase, analyticsRoutes);
app.use('/api/admin', requireDatabase, adminRoutes);

// Centralized error handling
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[API Error]:', err.message || err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error occurred.',
  });
});

async function startServer() {
  console.log('[Server Startup] Initiating robust MongoDB connection check...');

  const isProduction = process.env.NODE_ENV === 'production';
  const strictStartup = process.env.STRICT_DB_STARTUP === 'true';

  // 1. Perform robust connection check with retries and ping verification
  const connResult = await db.connectAndVerify({
    maxRetries: isProduction ? 5 : 2,
    retryDelayMs: 2000,
    timeoutMs: 5000,
  });

  if (!connResult.success) {
    console.error(`[Server Startup] MongoDB connection check failed: ${connResult.error}`);

    if (strictStartup) {
      console.error('[Server Startup] STRICT_DB_STARTUP is enabled. Halting Express application startup.');
      process.exit(1);
    }

    console.warn('[Server Startup] Application entering Diagnostic / Degraded Mode.');
    console.warn('[Server Startup] Persistent business routes locked with 503 until MongoDB is available.');
  } else {
    console.log(`[Server Startup] MongoDB connection verified (${connResult.latencyMs}ms). Initializing services...`);

    // 2. Seed Baseline Data if connected
    try {
      await seedInitialDataIfEmpty();
    } catch (seedErr: any) {
      console.warn('[Seed Service] Seed warning:', seedErr.message);
    }

    // 3. Start Background SLA Escalation Monitor
    slaService.startWorker(60000);

    // 4. Start Background Notification Delivery Queue Worker (Durable MongoDB Queue)
    const queueEnabled = process.env.NOTIFICATION_QUEUE_ENABLED !== 'false';
    if (queueEnabled) {
      notificationWorker.startWorker(30000);
    }
  }

  // Background reconnect poll if URI was configured but initial connect failed
  if (!db.isConnected && process.env.MONGODB_URI) {
    const reconnectTimer = setInterval(async () => {
      console.log('[DB Reconnect] Checking MongoDB availability...');
      const retry = await db.connectAndVerify({ maxRetries: 1, timeoutMs: 3000 });
      if (retry.success) {
        clearInterval(reconnectTimer);
        console.log('[DB Reconnect] Reconnected to MongoDB! Activating application services...');
        try {
          await seedInitialDataIfEmpty();
        } catch (e: any) {
          console.warn('[Seed Service] Seed warning:', e.message);
        }
        slaService.startWorker(60000);
        if (process.env.NOTIFICATION_QUEUE_ENABLED !== 'false') {
          notificationWorker.startWorker(30000);
        }
      }
    }, 15000);
  }

  // 5. Vite Frontend Integration with WebSocket server attached to httpServer
  if (!isProduction) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: {
          server: httpServer,
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const emailCfg = getEmailConfig();
  const smsCfg = getSmsConfig();

  const server = httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  REC Bijnor Campus Care Portal active on :${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  MongoDB: ${db.isConnected ? 'Connected' : 'Disconnected (' + (db.connectionError || 'No URI') + ')'}`);
    console.log(`  Email (SMTP): ${emailCfg.isConfigured ? 'Configured (' + emailCfg.host + ')' : 'Unconfigured (dry-run/skipped mode)'}`);
    console.log(`  SMS Gateway: ${smsCfg.isConfigured ? 'Configured (' + smsCfg.provider + ')' : 'Unconfigured (dry-run/skipped mode)'}`);
    console.log(`  Vite HMR: Attached to HTTP server on port ${PORT}`);
    console.log(`====================================================`);
  });

  // Graceful shutdown handling
  const shutdown = async (signal: string) => {
    console.log(`\n[Process] Received ${signal}. Initiating graceful shutdown...`);
    try {
      slaService.stopWorker();
      notificationWorker.stopWorker();
      server.close(async () => {
        console.log('[Process] HTTP server closed.');
        await db.disconnect();
        console.log('[Process] MongoDB connection closed.');
        process.exit(0);
      });
    } catch (shutdownErr: any) {
      console.error('[Process] Error during shutdown:', shutdownErr.message);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err);
  process.exit(1);
});

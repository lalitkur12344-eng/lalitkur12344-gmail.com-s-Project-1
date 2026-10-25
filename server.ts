import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
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

dotenv.config();

const app = express();
const httpServer = http.createServer(app);
const PORT = Number(process.env.PORT) || 3000;

// Security & Parsing Middleware
app.use(
  cors({
    origin: '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Health & Diagnostic Check Endpoint
app.get('/api/health', (req: Request, res: Response) => {
  const quota = getQuotaStatus();
  const emailCfg = getEmailConfig();
  const smsCfg = getSmsConfig();

  res.json({
    status: db.isConnected ? 'healthy' : 'degraded',
    system: 'REC Bijnor Campus Care Management Engine',
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      type: 'MongoDB (Mongoose)',
      connected: db.isConnected,
      configured: db.mongoUriConfigured,
      error: db.connectionError,
    },
    notifications: {
      emailConfigured: emailCfg.isConfigured,
      smsConfigured: smsCfg.isConfigured,
      smsProvider: smsCfg.provider,
      workerActive: true,
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
  // 1. Initialize MongoDB connection
  await db.init();

  // 2. Seed Baseline Data if connected
  if (db.isConnected) {
    try {
      await seedInitialDataIfEmpty();
    } catch (seedErr: any) {
      console.warn('[Seed Service] Seed warning:', seedErr.message);
    }
  } else {
    console.warn('[Seed Service] Skipping database seeding because MongoDB is not connected.');
  }

  // 3. Start Background SLA Escalation Monitor
  slaService.startWorker(60000);

  // 4. Start Background Notification Delivery Queue Worker (Durable MongoDB Queue)
  notificationWorker.startWorker(30000);

  // 5. Vite Frontend Integration with WebSocket server attached to httpServer
  const isProduction = process.env.NODE_ENV === 'production';

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

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`  REC Bijnor Campus Care Portal active on :${PORT}`);
    console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`  MongoDB: ${db.isConnected ? 'Connected' : 'Disconnected (' + (db.connectionError || 'No URI') + ')'}`);
    console.log(`  Email (SMTP): ${emailCfg.isConfigured ? 'Configured (' + emailCfg.host + ')' : 'Unconfigured (dry-run/skipped mode)'}`);
    console.log(`  SMS Gateway: ${smsCfg.isConfigured ? 'Configured (' + smsCfg.provider + ')' : 'Unconfigured (dry-run/skipped mode)'}`);
    console.log(`  Vite HMR: Attached to HTTP server on port ${PORT}`);
    console.log(`====================================================`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup failure:', err);
  process.exit(1);
});

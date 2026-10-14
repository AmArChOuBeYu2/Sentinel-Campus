import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import authRoutes from './routes/auth';
import enrollmentRoutes from './routes/enrollment';
import attendanceRoutes from './routes/attendance';
import classesRoutes from './routes/classes';
import adminRoutes from './routes/admin';
import { db } from './db';
import { otpService } from './services/otpService';

// Validate OTP & Resend configuration at startup
const configValidation = otpService.validateConfig();
if (!configValidation.valid) {
  console.warn(`[Config] OTP Configuration Warning: ${configValidation.warning}`);
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5000;

// Security & Middleware
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'ngrok-skip-browser-warning'],
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logger
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/health') {
      console.log(`[API] ${req.method} ${req.path} -> ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Initialize Database & Supabase adapter
db.initSupabase()
  .then((status) => {
    console.log(
      `[Database] Driver: ${status.driver.toUpperCase()} | Supabase Connected: ${status.connected} | Tables: ${status.tablesFound}`
    );
  })
  .catch((err) => {
    console.error('[Database] Startup error:', err.message);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  });

// Health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    app: 'Sentinel Campus',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    campus: db.getCampusConfig().campusName,
    uptimeSeconds: Math.round(process.uptime()),
    database: {
      driver: db.getStorageDriver(),
      isProduction: process.env.NODE_ENV === 'production',
    },
  });
});

// Mount Routes
app.use('/api/auth', authRoutes);
app.get('/api/me', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const tokenOrId = authHeader.replace('Bearer ', '').trim();
    if (tokenOrId) {
      const user =
        db.getUserById(tokenOrId) ||
        db.getUserByIdentifier(tokenOrId) ||
        db.getUserByEmailOrPhone(tokenOrId);
      if (user && user.isActive) {
        const enrollment = db.getEnrollmentByUserId(user.id);
        return res.json({
          success: true,
          user: {
            ...user,
            isEnrolled: !!enrollment,
          },
          enrollment: enrollment
            ? {
                id: enrollment.id,
                enrolledAt: enrollment.enrolledAt,
                consentGiven: enrollment.consentGiven,
              }
            : null,
        });
      }
    }
  }
  return res.status(401).json({ success: false, error: 'Unauthorized' });
});
app.use('/api/enrollment', enrollmentRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/classes', classesRoutes);
app.use('/api/admin', adminRoutes);

// Notices endpoint
app.get('/api/notices', (req: Request, res: Response) => {
  const role = req.query.role as any;
  const list = db.getNotices(role);
  res.json({ success: true, notices: list });
});
app.post('/api/notices', (req: Request, res: Response) => {
  const { title, description, category, targetRoles } = req.body;
  if (!title || !description) {
    return res.status(400).json({ success: false, error: 'Title and description required' });
  }
  const notice = db.createNotice({
    title,
    description,
    category: category || 'GENERAL',
    targetRoles: targetRoles || ['student', 'teacher', 'staff'],
    publishedAt: new Date().toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) + ' at ' + new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  }, 'usr_adm_0001');
  res.status(201).json({ success: true, notice });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`,
  });
});

// Central Error Handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[SERVER_ERROR]', err);
  res.status(500).json({
    success: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred.' : err.message,
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n======================================================`);
  console.log(`🛡️  Sentinel Campus Server running on http://0.0.0.0:${PORT}`);
  console.log(`   Health Check: http://localhost:${PORT}/health`);
  console.log(`   Campus Config: ${db.getCampusConfig().campusName}`);
  console.log(`   Default Geofence: ${db.getCampusConfig().latitude}°N, ${db.getCampusConfig().longitude}°E (Radius: ${db.getCampusConfig().radiusMeters}m)`);
  console.log(`======================================================\n`);
});

export default app;

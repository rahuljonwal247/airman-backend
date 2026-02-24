import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { correlationIdMiddleware } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import { notFoundHandler } from './middleware/notFoundHandler';
import { authRateLimiter, apiRateLimiter } from './middleware/rateLimiter';
import authRoutes from './modules/auth/auth.routes';
import userRoutes from './modules/users/user.routes';
import courseRoutes from './modules/learning/course.routes';
import moduleRoutes from './modules/learning/module.routes';
import lessonRoutes from './modules/learning/lesson.routes';
import quizRoutes from './modules/learning/quiz.routes';
import bookingRoutes from './modules/scheduling/booking.routes';
import availabilityRoutes from './modules/scheduling/availability.routes';
import auditRoutes from './modules/audit/audit.routes';
import tenantRoutes from './modules/tenants/tenant.routes';

const app = express();

// ─── Security Middleware ────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
}));

// ─── Request Middleware ─────────────────────────────────────────────────────
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan('combined'));
app.use(correlationIdMiddleware);
app.use(apiRateLimiter);

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/courses', moduleRoutes);
app.use('/api/courses', lessonRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/audit', auditRoutes);

// ─── Error Handling ─────────────────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;

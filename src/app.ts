import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/auth';
import { specialtyRouter } from './routes/specialties';
import { doctorRouter } from './routes/doctors';
import { appointmentRouter } from './routes/appointments';
import { vapiRouter } from './routes/vapi';

export function createApp() {
  const app = express();

  // Security
  app.use(helmet());
  app.use(cors({ origin: config.cors.origin }));
  app.use(express.json({ limit: '10kb' }));



  // Rate limiting
  app.use(
    '/api/',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 min
      max: 500,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'Too many requests, please try again later.' },
      skip: (req) => req.path.startsWith('/api/vapi'),
    })
  );

  // Logging — custom format includes POST/PUT/PATCH body for debugging
  if (config.nodeEnv !== 'test') {
    morgan.token('req-body', (req) => {
      if (['POST', 'PUT', 'PATCH'].includes(req.method) && (req as any).body) {
        try {
          return JSON.stringify((req as any).body).substring(0, 500);
        } catch {
          return '[unable to stringify]';
        }
      }
      return '';
    });
    app.use(morgan(':method :url :status :res[content-length] :req-body'));
  }

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/specialties', specialtyRouter);
  app.use('/api/doctors', doctorRouter);
  app.use('/api/appointments', appointmentRouter);

  // VAPI voice tools (server-tool webhook)
  // Note: not protected by rate-limit so the AI assistant can call it freely mid-conversation.
  app.use('/api/vapi', vapiRouter);

  // Error handling
  app.use(errorHandler);

  return app;
}

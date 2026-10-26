import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, LIMITS } from './config.js';
import { AppError } from './errors.js';
import { createPaymentMiddleware } from './payments/server.js';
import { apiRouter } from './routes/api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(): express.Application {
  const app = express();

  // 1. Security headers (relaxed CSP to permit dashboard console inline scripts/styles)
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    }),
  );

  // 2. CORS
  app.use(
    cors({
      origin: '*', // Allow developer console and programmatic buyers
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Payment', 'x-payment'],
      exposedHeaders: ['X-Payment-Status', 'X-Payment-Network', 'X-Payment-Notice'],
    }),
  );

  // 3. Rate limiting
  const limiter = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max: config.RATE_LIMIT_MAX_REQUESTS,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please slow down.',
      },
    },
  });
  app.use(limiter);

  // 4. Body parsers
  app.use(express.json({ limit: LIMITS.MAX_REQUEST_BODY_BYTES }));
  app.use(
    express.text({
      type: ['text/csv', 'text/plain'],
      limit: LIMITS.MAX_REQUEST_BODY_BYTES,
    }),
  );

  // 5. Payment enforcement middleware (only on paid endpoints)
  const paymentMw = createPaymentMiddleware();
  app.use('/api/v1/profile', paymentMw);

  // 6. API routes
  app.use(apiRouter);

  // 7. Developer Console static UI
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // Fallback for root to public index.html
  app.get('/', (req: Request, res: Response) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  // 8. 404 handler for unknown routes
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.path} not found.`,
      },
    });
  });

  // 9. Centralized Error Handler
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
        },
      });
    }

    // Express JSON syntax error
    if (err instanceof SyntaxError && 'status' in err && (err as { status: number }).status === 400) {
      return res.status(400).json({
        error: {
          code: 'MALFORMED_JSON',
          message: 'The request body contained invalid JSON syntax.',
        },
      });
    }

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[TablePulse] Unhandled Error [${req.method} ${req.path}]:`, err);

    return res.status(500).json({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred.',
        details: process.env.NODE_ENV !== 'production' ? errorMsg : undefined,
      },
    });
  });

  return app;
}

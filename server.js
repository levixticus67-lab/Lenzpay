import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { getEnv } from './lib/env.js';
import { prisma } from './lib/prisma.js';
import { HttpError } from './lib/http.js';
import { paymentsRouter } from './routes/payments.js';
import { adminRouter } from './routes/admin.js';
import { merchantsRouter } from './routes/merchants.js';
import { requireAdmin, requireAllowedAdminOrigin } from './middleware/auth.js';

const env = getEnv();
const app = express();

if (env.TRUST_PROXY === 'true') app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  credentials: true,
  origin(origin, callback) {
    if (!origin || env.corsOrigins.includes(origin)) return callback(null, true);
    return callback(null, false);
  },
}));
app.use(express.json({ limit: '64kb', type: ['application/json', 'application/*+json'] }));
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  next();
});

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/v1/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/admin/merchants', requireAllowedAdminOrigin, requireAdmin, merchantsRouter);

app.use((_req, _res, next) => next(new HttpError(404, 'NOT_FOUND', 'Endpoint not found')));
app.use((error, req, res, _next) => {
  const status = Number.isInteger(error.status) ? error.status : 500;
  if (status >= 500) {
    // Never log request bodies, headers, credentials, phone numbers, or provider response bodies.
    console.error(JSON.stringify({
      level: 'error',
      requestId: req.requestId,
      code: error.code ?? 'INTERNAL_ERROR',
      name: error.name ?? 'Error',
    }));
  }
  if (res.headersSent) return;
  return res.status(status).json({
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: status >= 500 ? 'An unexpected error occurred' : error.message,
      requestId: req.requestId,
    },
  });
});

const server = app.listen(env.PORT, async () => {
  try {
    await prisma.$connect();
    console.log(`Lenzpay API listening on port ${env.PORT}`);
  } catch (error) {
    console.error(JSON.stringify({ level: 'error', code: 'DATABASE_CONNECTION_FAILED', name: error.name }));
    server.close(() => process.exit(1));
  }
});

async function shutdown(signal) {
  console.log(`Received ${signal}; shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  ADMIN_EMAIL: z.string().email('ADMIN_EMAIL must be a valid email'),
  ADMIN_PASSWORD_HASH: z.string().regex(/^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/i, 'Generate ADMIN_PASSWORD_HASH with npm run admin:hash'),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  CLIENT_SECRET_PEPPER: z.string().min(32, 'CLIENT_SECRET_PEPPER must be at least 32 characters'),
  DEVELOPER_COMMISSION_RATE: z.coerce.number().min(0).max(0.5).default(0.025),
  AGENCY_COMMISSION_WALLET_MSISDN: z.string().regex(/^\+?\d{9,15}$/, 'Set a valid agency commission wallet phone number'),
  MIN_PAYMENT_AMOUNT: z.coerce.number().positive().default(100),
  MAX_PAYMENT_AMOUNT: z.coerce.number().positive().default(10000000),
  RECONCILIATION_INTERVAL_SECONDS: z.coerce.number().int().min(30).max(3600).default(60),
  RECONCILIATION_BATCH_SIZE: z.coerce.number().int().min(1).max(50).default(20),
  PAYMENT_WEBHOOK_BASE_URL: z.string().default(''),
  MTN_SUBSCRIPTION_KEY: z.string().trim().optional(),
  MTN_API_USER: z.string().trim().optional(),
  MTN_API_KEY: z.string().trim().optional(),
  MTN_TARGET_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  AIRTEL_CLIENT_ID: z.string().trim().optional(),
  AIRTEL_CLIENT_SECRET: z.string().trim().optional(),
  AIRTEL_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
});

let cached;

export function getEnv() {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues.map(({ path, message }) => `${path.join('.')}: ${message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  const configuredCors = parsed.data.CORS_ORIGINS ||
    (parsed.data.NODE_ENV === 'production' ? '' : 'http://localhost:5173');
  const corsOrigins = configuredCors.split(',').map((item) => item.trim()).filter(Boolean);
  if (parsed.data.NODE_ENV === 'production' && corsOrigins.length === 0) {
    throw new Error('CORS_ORIGINS must include the deployed dashboard origin in production');
  }
  if (parsed.data.MIN_PAYMENT_AMOUNT >= parsed.data.MAX_PAYMENT_AMOUNT) {
    throw new Error('MIN_PAYMENT_AMOUNT must be lower than MAX_PAYMENT_AMOUNT');
  }
  cached = { ...parsed.data, corsOrigins };
  return cached;
}

import {
  createHmac,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';

const scrypt = promisify(nodeScrypt);
const SESSION_COOKIE = 'lenzpay_admin';

function safeEqual(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashClientSecret(secret) {
  return createHmac('sha256', getEnv().CLIENT_SECRET_PEPPER).update(secret).digest('hex');
}

export async function verifyAdminPassword(password) {
  const [algorithm, salt, expected] = getEnv().ADMIN_PASSWORD_HASH.split('$');
  if (algorithm !== 'scrypt' || !salt || !expected) return false;
  const actual = await scrypt(password, Buffer.from(salt, 'hex'), 64);
  return safeEqual(Buffer.from(actual).toString('hex'), expected.toLowerCase());
}

function signSession(payload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getEnv().SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function readCookie(req, name) {
  const header = req.headers.cookie ?? '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return null;
}

function getSession(req) {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  const [encoded, receivedSignature] = token.split('.');
  if (!encoded || !receivedSignature) return null;
  const expectedSignature = createHmac('sha256', getEnv().SESSION_SECRET).update(encoded).digest('base64url');
  if (!safeEqual(receivedSignature, expectedSignature)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    if (payload.email !== getEnv().ADMIN_EMAIL) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createAdminSession(email) {
  const now = Date.now();
  return signSession({ email, iat: now, exp: now + 8 * 60 * 60 * 1000 });
}

export function setAdminCookie(res, token) {
  const env = getEnv();
  const cookiePolicy = env.NODE_ENV === 'production'
    ? '; SameSite=None; Secure'
    : '; SameSite=Strict';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/admin; HttpOnly; Max-Age=28800${cookiePolicy}`,
  );
}

export function clearAdminCookie(res) {
  const cookiePolicy = getEnv().NODE_ENV === 'production'
    ? '; SameSite=None; Secure'
    : '; SameSite=Strict';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=; Path=/api/admin; HttpOnly; Max-Age=0${cookiePolicy}`,
  );
}

export function requireAdmin(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Admin sign-in required' } });
  req.admin = { email: session.email };
  return next();
}

export function requireAllowedAdminOrigin(req, res, next) {
  const origin = req.get('origin');
  if (origin && !getEnv().corsOrigins.includes(origin)) {
    return res.status(403).json({ error: { code: 'ORIGIN_FORBIDDEN', message: 'Origin is not allowed' } });
  }
  return next();
}

export async function authenticateClient(req, res, next) {
  try {
    const clientId = req.get('x-client-id');
    const clientSecret = req.get('x-client-secret');
    if (!clientId || !clientSecret || clientId.length > 100 || clientSecret.length > 200) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Valid client credentials are required' } });
    }

    const credential = await prisma.apiCredential.findUnique({
      where: { clientId },
      include: { merchant: true },
    });
    if (!credential || !credential.liveStatus || credential.revokedAt || credential.merchant.status !== 'ACTIVE') {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Valid client credentials are required' } });
    }
    if (!safeEqual(hashClientSecret(clientSecret), credential.clientSecretHash)) {
      return res.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Valid client credentials are required' } });
    }

    req.apiClient = { credentialId: credential.id, merchant: credential.merchant };
    return next();
  } catch (error) {
    return next(error);
  }
}

export { SESSION_COOKIE };

import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { normalizeUgandanPhone } from '../lib/money.js';
import { hashClientSecret } from '../middleware/auth.js';

export const merchantsRouter = Router();

const createMerchantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254),
  agencyCommissionRate: z.coerce.number().min(0).max(0.5).optional(),
  defaultPayoutPhone: z.string().min(8).max(32),
  defaultPayoutProvider: z.enum(['MTN', 'AIRTEL']),
}).strict();

function newCredentials() {
  return {
    clientId: `app_live_${randomBytes(18).toString('hex')}`,
    clientSecret: `secret_live_${randomBytes(32).toString('hex')}`,
  };
}

function publicMerchant(merchant) {
  const credential = merchant.credentials?.[0];
  return {
    id: merchant.id,
    name: merchant.name,
    email: merchant.email,
    agencyCommissionRate: merchant.agencyCommissionRate.toString(),
    defaultPayoutPhone: merchant.defaultPayoutPhone,
    defaultPayoutProvider: merchant.defaultPayoutProvider,
    status: merchant.status,
    clientId: credential?.clientId ?? null,
    credentialActive: Boolean(credential?.liveStatus && !credential?.revokedAt),
    transactionCount: merchant._count?.transactions ?? 0,
    createdAt: merchant.createdAt,
  };
}

merchantsRouter.get('/', asyncHandler(async (_req, res) => {
  const merchants = await prisma.merchant.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      credentials: {
        where: { revokedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { clientId: true, liveStatus: true, revokedAt: true },
      },
      _count: { select: { transactions: true } },
    },
  });
  res.json({ merchants: merchants.map(publicMerchant) });
}));

merchantsRouter.post('/', asyncHandler(async (req, res) => {
  const parsed = createMerchantSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, 'INVALID_MERCHANT', 'Provide a valid name, email, payout phone, and payout provider');
  }

  let payoutPhone;
  try {
    payoutPhone = normalizeUgandanPhone(parsed.data.defaultPayoutPhone);
  } catch (error) {
    throw new HttpError(400, 'INVALID_PAYOUT_PHONE', error.message);
  }

  const { clientId, clientSecret } = newCredentials();
  const merchant = await prisma.merchant.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      agencyCommissionRate: parsed.data.agencyCommissionRate ?? getEnv().DEVELOPER_COMMISSION_RATE,
      defaultPayoutPhone: payoutPhone,
      defaultPayoutProvider: parsed.data.defaultPayoutProvider,
      credentials: {
        create: {
          clientId,
          clientSecretHash: hashClientSecret(clientSecret),
          liveStatus: true,
        },
      },
    },
    include: {
      credentials: {
        select: { clientId: true, liveStatus: true, revokedAt: true },
      },
      _count: { select: { transactions: true } },
    },
  });

  res.status(201).json({
    merchant: publicMerchant(merchant),
    credentials: {
      clientId,
      clientSecret,
      warning: 'The client secret is shown only once. Copy it to the client application secret store now.',
    },
  });
}));

merchantsRouter.patch('/:merchantId/status', asyncHandler(async (req, res) => {
  const parsed = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']) }).safeParse(req.body);
  if (!parsed.success) throw new HttpError(400, 'INVALID_STATUS', 'status must be ACTIVE or SUSPENDED');

  try {
    const merchant = await prisma.merchant.update({
      where: { id: req.params.merchantId },
      data: { status: parsed.data.status },
    });
    return res.json({ id: merchant.id, status: merchant.status });
  } catch (error) {
    if (error?.code === 'P2025') throw new HttpError(404, 'MERCHANT_NOT_FOUND', 'Merchant was not found');
    throw error;
  }
}));

merchantsRouter.post('/:merchantId/rotate-key', asyncHandler(async (req, res) => {
  const merchant = await prisma.merchant.findUnique({ where: { id: req.params.merchantId } });
  if (!merchant) throw new HttpError(404, 'MERCHANT_NOT_FOUND', 'Merchant was not found');

  const { clientId, clientSecret } = newCredentials();
  await prisma.$transaction(async (tx) => {
    await tx.apiCredential.updateMany({
      where: { merchantId: merchant.id, revokedAt: null },
      data: { liveStatus: false, revokedAt: new Date() },
    });
    await tx.apiCredential.create({
      data: {
        merchantId: merchant.id,
        clientId,
        clientSecretHash: hashClientSecret(clientSecret),
        liveStatus: true,
      },
    });
  });

  res.status(201).json({
    credentials: { clientId, clientSecret },
    warning: 'The old key was revoked immediately. The new client secret is shown only once.',
  });
}));

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import {
  clearAdminCookie,
  createAdminSession,
  requireAdmin,
  requireAllowedAdminOrigin,
  setAdminCookie,
  verifyAdminPassword,
} from '../middleware/auth.js';
import { adminLoginLimiter } from '../middleware/rateLimits.js';

export const adminRouter = Router();

adminRouter.post('/login', requireAllowedAdminOrigin, adminLoginLimiter, asyncHandler(async (req, res) => {
  const parsed = z.object({
    email: z.string().email().max(254),
    password: z.string().min(1).max(512),
  }).safeParse(req.body);
  if (
    !parsed.success ||
    parsed.data.email.toLowerCase() !== getEnv().ADMIN_EMAIL.toLowerCase() ||
    !(await verifyAdminPassword(parsed.data.password))
  ) {
    throw new HttpError(401, 'INVALID_LOGIN', 'Email or password is incorrect');
  }
  const canonicalEmail = getEnv().ADMIN_EMAIL;
  setAdminCookie(res, createAdminSession(canonicalEmail));
  res.json({ email: canonicalEmail });
}));

adminRouter.get('/session', requireAdmin, (_req, res) => {
  res.json({ email: _req.admin.email });
});

adminRouter.post('/logout', requireAllowedAdminOrigin, requireAdmin, (_req, res) => {
  clearAdminCookie(res);
  res.status(204).end();
});

adminRouter.use(requireAllowedAdminOrigin, requireAdmin);

adminRouter.get('/overview', asyncHandler(async (_req, res) => {
  const [volume, commissions, activeMerchants, transactions, openPayouts] = await Promise.all([
    prisma.paymentTransaction.aggregate({
      where: { status: 'SUCCESSFUL' },
      _sum: { totalAmount: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { kind: 'AGENCY_COMMISSION' },
      _sum: { amount: true },
    }),
    prisma.merchant.count({ where: { status: 'ACTIVE' } }),
    prisma.paymentTransaction.count(),
    prisma.payout.count({
      where: { status: { in: ['AWAITING_APPROVAL', 'SUBMITTING', 'PENDING', 'REVIEW_REQUIRED'] } },
    }),
  ]);
  res.json({
    totalVolume: volume._sum.totalAmount?.toString() ?? '0.00',
    totalCommissions: commissions._sum.amount?.toString() ?? '0.00',
    activeMerchants,
    transactionCount: transactions,
    openPayouts,
  });
}));

adminRouter.get('/transactions', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
  if (status && !['PENDING', 'SUCCESSFUL', 'FAILED'].includes(status)) {
    throw new HttpError(400, 'INVALID_FILTER', 'status must be PENDING, SUCCESSFUL, or FAILED');
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '50', 10) || 50, 1), 100);
  const transactions = await prisma.paymentTransaction.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { merchant: { select: { id: true, name: true } } },
  });
  res.json({
    transactions: transactions.map((transaction) => ({
      id: transaction.id,
      orderId: transaction.orderId,
      merchantId: transaction.merchantId,
      merchantName: transaction.merchant.name,
      totalAmount: transaction.totalAmount.toString(),
      commissionAmount: transaction.commissionAmount.toString(),
      merchantAmount: transaction.merchantAmount.toString(),
      provider: transaction.provider,
      status: transaction.status,
      createdAt: transaction.createdAt,
    })),
  });
}));

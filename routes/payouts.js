import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { HttpError, asyncHandler } from '../lib/http.js';
import { confirmManualPayout, payoutApiEnabled, resolveManualPayout, submitPayout } from '../services/payouts.js';

export const payoutsRouter = Router();

const statuses = ['AWAITING_APPROVAL', 'SUBMITTING', 'PENDING', 'SUCCESSFUL', 'FAILED', 'REVIEW_REQUIRED'];

function maskPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length < 5 ? '••••' : `${'•'.repeat(Math.min(8, digits.length - 4))}${digits.slice(-4)}`;
}

function csvCell(value) {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

payoutsRouter.get('/export.csv', asyncHandler(async (_req, res) => {
  const payouts = await prisma.payout.findMany({
    where: { status: 'AWAITING_APPROVAL' },
    include: {
      merchant: { select: { name: true } },
      transaction: { select: { orderId: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: 1000,
  });
  const columns = ['provider', 'reference', 'amount', 'currency', 'destination', 'merchant', 'orderId', 'ledgerKind'];
  const rows = payouts.map((payout) => [
    payout.provider,
    payout.providerReference,
    payout.amount.toString(),
    payout.currency,
    payout.destination,
    payout.merchant.name,
    payout.transaction.orderId,
    payout.kind,
  ]);
  res.setHeader('Cache-Control', 'no-store');
  res.type('text/csv').attachment('lenzpay-payout-instructions-internal.csv');
  res.send([columns, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n'));
}));

payoutsRouter.get('/', asyncHandler(async (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
  if (status && !statuses.includes(status)) {
    throw new HttpError(400, 'INVALID_FILTER', `status must be one of: ${statuses.join(', ')}`);
  }
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit ?? '100', 10) || 100, 1), 200);
  const payouts = await prisma.payout.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      merchant: { select: { name: true } },
      transaction: { select: { orderId: true } },
    },
  });
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    payouts: payouts.map((payout) => ({
      id: payout.id,
      orderId: payout.transaction.orderId,
      merchantName: payout.merchant.name,
      kind: payout.kind,
      provider: payout.provider,
      amount: payout.amount.toString(),
      currency: payout.currency,
      destinationMasked: maskPhone(payout.destination),
      providerReference: payout.providerReference,
      status: payout.status,
      manualConfirmationReference: payout.manualConfirmationReference,
      submittedAt: payout.submittedAt,
      lastStatusCheckAt: payout.lastStatusCheckAt,
      createdAt: payout.createdAt,
    })),
    disbursementApiEnabled: {
      MTN: payoutApiEnabled('MTN'),
      AIRTEL: payoutApiEnabled('AIRTEL'),
    },
  });
}));

payoutsRouter.post('/:payoutId/submit', asyncHandler(async (req, res) => {
  const parsed = z.string().uuid().safeParse(req.params.payoutId);
  if (!parsed.success) throw new HttpError(400, 'INVALID_PAYOUT_ID', 'A valid payout ID is required');
  const payout = await submitPayout(parsed.data, req.admin.email);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    payout: {
      id: payout.id,
      status: payout.status,
      provider: payout.provider,
      amount: payout.amount.toString(),
      providerReference: payout.providerReference,
    },
    submissionAttempted: true,
    note: 'Provider acceptance is not final settlement; status is verified by provider lookup.',
  });
}));

payoutsRouter.post('/:payoutId/resolve-manual', asyncHandler(async (req, res) => {
  const parsedId = z.string().uuid().safeParse(req.params.payoutId);
  const parsedBody = z.object({
    status: z.enum(['SUCCESSFUL', 'FAILED']),
    confirmationReference: z.string().trim().min(4).max(120),
  }).strict().safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    throw new HttpError(400, 'INVALID_MANUAL_RESOLUTION', 'Provide a final provider status and portal confirmation reference');
  }
  const payout = await resolveManualPayout(
    parsedId.data,
    req.admin.email,
    parsedBody.data.status,
    parsedBody.data.confirmationReference,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    payout: {
      id: payout.id,
      status: payout.status,
      provider: payout.provider,
      amount: payout.amount.toString(),
      manualConfirmationReference: payout.manualConfirmationReference,
    },
    note: 'Recorded from an operator review of the provider portal; this state was not independently verified by the provider API.',
  });
}));

payoutsRouter.post('/:payoutId/confirm-manual', asyncHandler(async (req, res) => {
  const parsedId = z.string().uuid().safeParse(req.params.payoutId);
  const parsedBody = z.object({
    confirmationReference: z.string().trim().min(4).max(120),
  }).strict().safeParse(req.body);
  if (!parsedId.success || !parsedBody.success) {
    throw new HttpError(400, 'INVALID_MANUAL_CONFIRMATION', 'Provide a valid payout ID and provider portal confirmation reference');
  }
  const payout = await confirmManualPayout(
    parsedId.data,
    req.admin.email,
    parsedBody.data.confirmationReference,
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    payout: {
      id: payout.id,
      status: payout.status,
      provider: payout.provider,
      amount: payout.amount.toString(),
      manualConfirmationReference: payout.manualConfirmationReference,
    },
    note: 'Recorded from an operator confirmation; this state was not independently verified by the provider API.',
  });
}));

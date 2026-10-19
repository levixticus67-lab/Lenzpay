import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import { HttpError, asyncHandler } from '../lib/http.js';
import { calculateSplit, normalizeUgandanPhone, parseAmount } from '../lib/money.js';
import { authenticateClient } from '../middleware/auth.js';
import { checkoutLimiter, webhookLimiter } from '../middleware/rateLimits.js';
import {
  assertProviderConfigured,
  collectPayment,
  lookupProviderStatus,
  ProviderConfigurationError,
} from '../services/providers.js';
import { postSplitLedger } from '../services/ledger.js';

export const paymentsRouter = Router();

const checkoutSchema = z.object({
  amount: z.union([z.number(), z.string()]),
  payerPhone: z.string().min(8).max(32),
  provider: z.enum(['MTN', 'AIRTEL']),
  orderId: z.string().trim().min(1).max(120),
}).strict();

function checkoutResult(transaction) {
  return {
    transactionId: transaction.id,
    orderId: transaction.orderId,
    status: transaction.status,
    amount: transaction.totalAmount.toString(),
    commissionAmount: transaction.commissionAmount.toString(),
    merchantAmount: transaction.merchantAmount.toString(),
    provider: transaction.provider,
    providerReference: transaction.telecomTransactionRef,
    createdAt: transaction.createdAt,
  };
}

function sameCheckout(existing, { amount, phone, provider }) {
  return existing.totalAmount.equals(amount) &&
    existing.payerPhone === phone &&
    existing.provider === provider;
}

async function respondWithExisting(res, existing, requested) {
  if (!sameCheckout(existing, requested)) {
    return res.status(409).json({
      error: {
        code: 'ORDER_ID_CONFLICT',
        message: 'This orderId was already used with different payment details',
      },
    });
  }
  return res.status(existing.status === 'PENDING' ? 202 : 200).json({
    ...checkoutResult(existing),
    idempotentReplay: true,
  });
}

paymentsRouter.post(
  '/checkout',
  checkoutLimiter,
  authenticateClient,
  asyncHandler(async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Provide amount, payerPhone, provider, and orderId in the documented format');
    }

    const { amount: amountInput, payerPhone, provider, orderId } = parsed.data;
    const env = getEnv();
    let amount;
    let phone;
    try {
      amount = parseAmount(amountInput, {
        min: env.MIN_PAYMENT_AMOUNT,
        max: env.MAX_PAYMENT_AMOUNT,
      });
      phone = normalizeUgandanPhone(payerPhone);
    } catch (error) {
      throw new HttpError(400, 'INVALID_PAYMENT_DETAILS', error.message);
    }

    const merchant = req.apiClient.merchant;
    if (!merchant.defaultPayoutPhone || !merchant.defaultPayoutProvider) {
      throw new HttpError(409, 'PAYOUT_DETAILS_REQUIRED', 'The merchant must set a default payout destination before accepting payments');
    }
    if (merchant.status !== 'ACTIVE') {
      throw new HttpError(403, 'MERCHANT_INACTIVE', 'This merchant is not active');
    }
    try {
      assertProviderConfigured(provider);
    } catch (error) {
      if (error instanceof ProviderConfigurationError) {
        throw new HttpError(503, 'PROVIDER_NOT_CONFIGURED', `${provider} collection is not configured on this payment service`);
      }
      throw error;
    }

    const split = calculateSplit(amount, merchant.agencyCommissionRate);
    const requested = { amount, phone, provider };
    const prior = await prisma.paymentTransaction.findUnique({
      where: { merchantId_orderId: { merchantId: merchant.id, orderId } },
    });
    if (prior) return respondWithExisting(res, prior, requested);

    const reference = randomUUID();
    let transaction;
    try {
      transaction = await prisma.paymentTransaction.create({
        data: {
          orderId,
          merchantId: merchant.id,
          totalAmount: split.total,
          commissionAmount: split.commission,
          merchantAmount: split.merchantNet,
          payerPhone: phone,
          provider,
          telecomTransactionRef: reference,
          payoutPhone: merchant.defaultPayoutPhone,
          payoutProvider: merchant.defaultPayoutProvider,
        },
      });
    } catch (error) {
      if (error?.code === 'P2002') {
        const concurrent = await prisma.paymentTransaction.findUnique({
          where: { merchantId_orderId: { merchantId: merchant.id, orderId } },
        });
        if (concurrent) return respondWithExisting(res, concurrent, requested);
      }
      throw error;
    }

    try {
      await collectPayment(provider, {
        amount: split.total,
        phone,
        reference,
        orderId,
      });
      return res.status(202).json(checkoutResult(transaction));
    } catch (error) {
      if (error.definitive) {
        transaction = await prisma.paymentTransaction.update({
          where: { id: transaction.id },
          data: { status: 'FAILED' },
        });
        return res.status(502).json({
          ...checkoutResult(transaction),
          error: {
            code: 'PROVIDER_REJECTED',
            message: 'The payment provider did not accept the collection request',
          },
        });
      }
      // A timeout or provider 5xx can happen after the collection was accepted.
      // Preserve PENDING to avoid retrying and accidentally charging twice.
      return res.status(202).json({
        ...checkoutResult(transaction),
        reconciliationRequired: true,
      });
    }
  }),
);

function providerReferenceFrom(body) {
  const candidates = [
    body?.referenceId,
    body?.reference_id,
    body?.transactionId,
    body?.transaction_id,
    body?.transaction?.id,
    body?.data?.transaction?.id,
    body?.reference,
  ];
  return candidates.find((value) => typeof value === 'string' && value.length > 0 && value.length <= 200);
}

function providerFrom(req) {
  const value = req.params.provider ?? req.body?.provider ?? req.get('x-payment-provider');
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase();
  return ['MTN', 'AIRTEL'].includes(normalized) ? normalized : null;
}

paymentsRouter.post(
  ['/webhook', '/webhook/:provider'],
  webhookLimiter,
  asyncHandler(async (req, res) => {
    const provider = providerFrom(req);
    const reference = providerReferenceFrom(req.body);
    if (!provider || !reference) {
      throw new HttpError(400, 'INVALID_WEBHOOK', 'A provider and known provider transaction reference are required');
    }

    const transaction = await prisma.paymentTransaction.findUnique({
      where: { telecomTransactionRef: reference },
    });
    if (!transaction || transaction.provider !== provider) {
      throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'No matching payment was found');
    }

    let verifiedStatus;
    try {
      // Provider callbacks are treated only as a lookup hint. The callback body
      // is never trusted to mark a payment successful.
      verifiedStatus = await lookupProviderStatus(provider, reference);
    } catch {
      return res.status(503).json({
        error: { code: 'STATUS_LOOKUP_UNAVAILABLE', message: 'Provider verification is temporarily unavailable; retry the callback' },
      });
    }

    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.paymentTransaction.findUnique({ where: { id: transaction.id } });
      if (!current) return 'NOT_FOUND';

      let finalOutcome = verifiedStatus;
      if (current.status === 'PENDING') {
        const changed = await tx.paymentTransaction.updateMany({
          where: { id: current.id, status: 'PENDING' },
          data: {
            lastStatusCheckAt: new Date(),
            ...(verifiedStatus === 'PENDING' ? {} : { status: verifiedStatus }),
          },
        });
        if (changed.count === 1 && verifiedStatus === 'SUCCESSFUL') {
          const updated = await tx.paymentTransaction.findUnique({ where: { id: current.id } });
          await postSplitLedger(tx, updated);
        } else if (changed.count === 0) {
          finalOutcome = 'TERMINAL_STATE_UNCHANGED';
        }
      } else if (current.status !== verifiedStatus) {
        finalOutcome = 'TERMINAL_STATE_UNCHANGED';
      }

      await tx.webhookEvent.create({
        data: {
          provider,
          providerReference: reference,
          transactionId: current.id,
          outcome: finalOutcome,
        },
      });
      return finalOutcome;
    });

    if (outcome === 'NOT_FOUND') {
      throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'No matching payment was found');
    }
    return res.status(verifiedStatus === 'PENDING' ? 202 : 200).json({
      received: true,
      verifiedStatus,
      outcome,
    });
  }),
);

paymentsRouter.get(
  '/:transactionId',
  checkoutLimiter,
  authenticateClient,
  asyncHandler(async (req, res) => {
    const transaction = await prisma.paymentTransaction.findFirst({
      where: {
        id: req.params.transactionId,
        merchantId: req.apiClient.merchant.id,
      },
    });
    if (!transaction) throw new HttpError(404, 'TRANSACTION_NOT_FOUND', 'Payment was not found for this merchant');
    res.json(checkoutResult(transaction));
  }),
);

import { prisma } from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import { HttpError } from '../lib/http.js';
import {
  assertDisbursementConfigured,
  lookupPayoutStatus,
  ProviderConfigurationError,
  submitProviderPayout,
} from './providers.js';

const inFlightStates = ['SUBMITTING', 'PENDING'];

function providerConfigError(error) {
  if (error instanceof ProviderConfigurationError) {
    throw new HttpError(
      409,
      'PAYOUT_API_NOT_READY',
      'This provider payout API is disabled or is missing account-approved configuration. Use the provider portal or finish provider onboarding first.',
    );
  }
  throw error;
}

async function appendEvent(tx, payoutId, actor, outcome) {
  await tx.payoutEvent.create({
    data: { payoutId, actor: actor ?? null, outcome },
  });
}

export async function submitPayout(payoutId, actor) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'Payout instruction was not found');
  if (payout.status !== 'AWAITING_APPROVAL') {
    throw new HttpError(409, 'PAYOUT_NOT_READY', 'Only payout instructions awaiting approval can be submitted');
  }

  try {
    assertDisbursementConfigured(payout.provider);
  } catch (error) {
    providerConfigError(error);
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const changed = await tx.payout.updateMany({
      where: { id: payoutId, status: 'AWAITING_APPROVAL' },
      data: {
        status: 'SUBMITTING',
        submittedBy: actor,
        submittedAt: new Date(),
        lastStatusCheckAt: new Date(),
      },
    });
    if (changed.count !== 1) return false;
    await appendEvent(tx, payoutId, actor, 'PROVIDER_SUBMISSION_STARTED');
    return true;
  });
  if (!claimed) {
    throw new HttpError(409, 'PAYOUT_ALREADY_CLAIMED', 'This payout was already submitted by another request');
  }

  try {
    await submitProviderPayout(payout.provider, {
      amount: payout.amount,
      destination: payout.destination,
      reference: payout.providerReference,
    });
  } catch (error) {
    const nextStatus = error.definitive ? 'FAILED' : 'PENDING';
    await prisma.$transaction(async (tx) => {
      const changed = await tx.payout.updateMany({
        where: { id: payoutId, status: 'SUBMITTING' },
        data: { status: nextStatus, lastStatusCheckAt: new Date() },
      });
      if (changed.count === 1) {
        await appendEvent(
          tx,
          payoutId,
          actor,
          error.definitive ? 'PROVIDER_REJECTED_PAYOUT' : 'SUBMISSION_RESULT_UNKNOWN_CHECK_STATUS',
        );
      }
    });
    return prisma.payout.findUnique({ where: { id: payoutId } });
  }

  await prisma.$transaction(async (tx) => {
    const changed = await tx.payout.updateMany({
      where: { id: payoutId, status: 'SUBMITTING' },
      data: { status: 'PENDING', lastStatusCheckAt: new Date() },
    });
    if (changed.count === 1) {
      await appendEvent(tx, payoutId, actor, 'PROVIDER_ACCEPTED_PAYOUT_FOR_PROCESSING');
    }
  });
  return prisma.payout.findUnique({ where: { id: payoutId } });
}

export async function confirmManualPayout(payoutId, actor, confirmationReference) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'Payout instruction was not found');
  if (payout.status !== 'AWAITING_APPROVAL') {
    throw new HttpError(409, 'PAYOUT_NOT_READY', 'Only payout instructions awaiting approval can be manually confirmed');
  }

  return prisma.$transaction(async (tx) => {
    const changed = await tx.payout.updateMany({
      where: { id: payoutId, status: 'AWAITING_APPROVAL' },
      data: {
        status: 'SUCCESSFUL',
        submittedBy: actor,
        submittedAt: new Date(),
        lastStatusCheckAt: new Date(),
        manualConfirmationReference: confirmationReference,
      },
    });
    if (changed.count !== 1) {
      throw new HttpError(409, 'PAYOUT_ALREADY_CLAIMED', 'This payout was already changed by another request');
    }
    await appendEvent(tx, payoutId, actor, 'MANUAL_PROVIDER_PORTAL_CONFIRMATION_RECORDED');
    return tx.payout.findUnique({ where: { id: payoutId } });
  });
}

export async function resolveManualPayout(payoutId, actor, status, confirmationReference) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new HttpError(404, 'PAYOUT_NOT_FOUND', 'Payout instruction was not found');
  if (!['SUBMITTING', 'PENDING', 'FAILED', 'REVIEW_REQUIRED'].includes(payout.status)) {
    throw new HttpError(409, 'PAYOUT_NOT_REVIEWABLE', 'This payout is not in a state that can be resolved from the provider portal');
  }

  return prisma.$transaction(async (tx) => {
    const changed = await tx.payout.updateMany({
      where: { id: payoutId, status: payout.status },
      data: {
        status,
        submittedBy: actor,
        manualConfirmationReference: confirmationReference,
        lastStatusCheckAt: new Date(),
      },
    });
    if (changed.count !== 1) {
      throw new HttpError(409, 'PAYOUT_ALREADY_CLAIMED', 'This payout was already changed by another request');
    }
    await appendEvent(tx, payoutId, actor, `MANUAL_PROVIDER_PORTAL_RESOLUTION_${status}`);
    return tx.payout.findUnique({ where: { id: payoutId } });
  });
}

export async function applyVerifiedPayoutStatus(payout, verifiedStatus, source = 'PROVIDER_LOOKUP') {
  return prisma.$transaction(async (tx) => {
    const current = await tx.payout.findUnique({ where: { id: payout.id } });
    if (!current) return 'NOT_FOUND';
    if (!inFlightStates.includes(current.status)) return 'TERMINAL_STATE_UNCHANGED';

    const changed = await tx.payout.updateMany({
      where: { id: current.id, status: { in: inFlightStates } },
      data: {
        lastStatusCheckAt: new Date(),
        ...(verifiedStatus === 'PENDING' ? {} : { status: verifiedStatus }),
      },
    });
    if (changed.count === 1 && verifiedStatus !== 'PENDING') {
      await appendEvent(tx, current.id, null, `${source}_${verifiedStatus}`);
      return verifiedStatus;
    }
    return 'PENDING';
  });
}

export async function reconcilePendingPayouts() {
  const env = getEnv();
  const cutoff = new Date(Date.now() - env.RECONCILIATION_INTERVAL_SECONDS * 1000);
  const payouts = await prisma.payout.findMany({
    where: {
      status: { in: inFlightStates },
      OR: [
        { lastStatusCheckAt: null },
        { lastStatusCheckAt: { lt: cutoff } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: env.RECONCILIATION_BATCH_SIZE,
  });

  for (const payout of payouts) {
    try {
      assertDisbursementConfigured(payout.provider, { requireEnabled: false });
      const status = await lookupPayoutStatus(payout.provider, payout.providerReference);
      await applyVerifiedPayoutStatus(payout, status, 'PAYOUT_RECONCILIATION');
    } catch (error) {
      try {
        if (error.status === 404) {
          await prisma.$transaction(async (tx) => {
            const changed = await tx.payout.updateMany({
              where: { id: payout.id, status: { in: inFlightStates } },
              data: { status: 'REVIEW_REQUIRED', lastStatusCheckAt: new Date() },
            });
            if (changed.count === 1) {
              await appendEvent(tx, payout.id, null, 'PROVIDER_REFERENCE_NOT_FOUND_MANUAL_REVIEW_REQUIRED');
            }
          });
        } else {
          await prisma.payout.updateMany({
            where: { id: payout.id, status: { in: inFlightStates } },
            data: { lastStatusCheckAt: new Date() },
          });
        }
      } catch {
        // A later reconciliation pass will retry if the database is unavailable.
      }
    }
  }
  return payouts.length;
}

export function payoutApiEnabled(provider) {
  const env = getEnv();
  const requested = provider === 'MTN'
    ? env.MTN_DISBURSEMENT_API_ENABLED === 'true'
    : env.AIRTEL_DISBURSEMENT_API_ENABLED === 'true';
  if (!requested) return false;
  try {
    assertDisbursementConfigured(provider);
    return true;
  } catch {
    return false;
  }
}

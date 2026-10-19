import { prisma } from '../lib/prisma.js';
import { getEnv } from '../lib/env.js';
import { assertProviderConfigured, lookupProviderStatus } from './providers.js';
import { postSplitLedger } from './ledger.js';

async function recordVerifiedStatus(payment, status) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.paymentTransaction.findUnique({ where: { id: payment.id } });
    if (!current) return { outcome: 'NOT_FOUND', status };

    let outcome = `${status}_UNCHANGED`;
    if (current.status === 'PENDING') {
      const changed = await tx.paymentTransaction.updateMany({
        where: { id: current.id, status: 'PENDING' },
        data: {
          lastStatusCheckAt: new Date(),
          ...(status === 'PENDING' ? {} : { status }),
        },
      });
      if (changed.count === 1) {
        outcome = status;
        if (status === 'SUCCESSFUL') {
          const updated = await tx.paymentTransaction.findUnique({ where: { id: current.id } });
          await postSplitLedger(tx, updated);
        }
      }
    }

    await tx.webhookEvent.create({
      data: {
        provider: payment.provider,
        providerReference: payment.telecomTransactionRef,
        transactionId: current.id,
        outcome: `RECONCILIATION_${outcome}`,
      },
    });
    return { outcome, status };
  });
}

async function recordLookupFailure(payment) {
  await prisma.$transaction(async (tx) => {
    const current = await tx.paymentTransaction.findUnique({ where: { id: payment.id } });
    if (!current || current.status !== 'PENDING') return;
    await tx.paymentTransaction.updateMany({
      where: { id: current.id, status: 'PENDING' },
      data: { lastStatusCheckAt: new Date() },
    });
    await tx.webhookEvent.create({
      data: {
        provider: payment.provider,
        providerReference: payment.telecomTransactionRef,
        transactionId: current.id,
        outcome: 'RECONCILIATION_LOOKUP_FAILED',
      },
    });
  });
}

export async function reconcilePendingPayments() {
  const env = getEnv();
  const cutoff = new Date(Date.now() - env.RECONCILIATION_INTERVAL_SECONDS * 1000);
  const pending = await prisma.paymentTransaction.findMany({
    where: {
      status: 'PENDING',
      createdAt: { lt: cutoff },
      OR: [
        { lastStatusCheckAt: null },
        { lastStatusCheckAt: { lt: cutoff } },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: env.RECONCILIATION_BATCH_SIZE,
    select: {
      id: true,
      provider: true,
      telecomTransactionRef: true,
    },
  });

  for (const payment of pending) {
    try {
      assertProviderConfigured(payment.provider);
      const status = await lookupProviderStatus(payment.provider, payment.telecomTransactionRef);
      await recordVerifiedStatus(payment, status);
    } catch {
      // Back off until the next interval; do not log provider errors or secrets.
      try {
        await recordLookupFailure(payment);
      } catch {
        // A later scheduled pass will retry if the database itself is unavailable.
      }
    }
  }
  return pending.length;
}

export function startReconciliationWorker() {
  const intervalMs = getEnv().RECONCILIATION_INTERVAL_SECONDS * 1000;
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await reconcilePendingPayments();
    } catch (error) {
      console.error(JSON.stringify({
        level: 'error',
        code: 'RECONCILIATION_FAILED',
        name: error.name ?? 'Error',
      }));
    } finally {
      running = false;
    }
  };
  const timer = setInterval(run, intervalMs);
  timer.unref();
  void run();
  return timer;
}

import { randomUUID } from 'node:crypto';
import { getEnv } from '../lib/env.js';

export async function postSplitLedger(tx, payment) {
  const env = getEnv();
  const entries = [
    {
      kind: 'AGENCY_COMMISSION',
      amount: payment.commissionAmount,
      destination: env.AGENCY_COMMISSION_WALLET_MSISDN,
      provider: env.AGENCY_COMMISSION_WALLET_PROVIDER,
    },
    {
      kind: 'MERCHANT_NET',
      amount: payment.merchantAmount,
      destination: payment.payoutPhone,
      provider: payment.payoutProvider,
    },
  ];

  for (const entry of entries) {
    const ledgerEntry = await tx.ledgerEntry.upsert({
      where: { transactionId_kind: { transactionId: payment.id, kind: entry.kind } },
      create: {
        transactionId: payment.id,
        merchantId: payment.merchantId,
        kind: entry.kind,
        amount: entry.amount,
        currency: 'UGX',
        destination: entry.destination,
      },
      update: {},
    });

    if (entry.amount.greaterThan(0)) {
      await tx.payout.upsert({
        where: { ledgerEntryId: ledgerEntry.id },
        create: {
          ledgerEntryId: ledgerEntry.id,
          transactionId: payment.id,
          merchantId: payment.merchantId,
          kind: entry.kind,
          provider: entry.provider,
          amount: entry.amount,
          currency: 'UGX',
          destination: entry.destination,
          providerReference: randomUUID(),
          events: {
            create: { outcome: 'PAYOUT_INTENT_CREATED' },
          },
        },
        update: {},
      });
    }
  }
}

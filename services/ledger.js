import { getEnv } from '../lib/env.js';

export async function postSplitLedger(tx, payment) {
  const env = getEnv();
  const entries = [
    {
      kind: 'AGENCY_COMMISSION',
      amount: payment.commissionAmount,
      destination: env.AGENCY_COMMISSION_WALLET_MSISDN,
    },
    {
      kind: 'MERCHANT_NET',
      amount: payment.merchantAmount,
      destination: payment.payoutPhone,
    },
  ];

  for (const entry of entries) {
    await tx.ledgerEntry.upsert({
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
  }
}

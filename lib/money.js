import { Prisma } from '@prisma/client';

export function parseAmount(value, { min = 0.01, max = 10000000 } = {}) {
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw new TypeError('amount must be a decimal number');
  }
  if (typeof value === 'string' && value.trim().length === 0) {
    throw new TypeError('amount must be a decimal number');
  }

  let amount;
  try {
    amount = new Prisma.Decimal(String(value));
  } catch {
    throw new TypeError('amount must be a valid decimal number');
  }
  if (!amount.isFinite() || amount.decimalPlaces() > 2) {
    throw new TypeError('amount must be finite and have no more than two decimal places');
  }
  if (amount.lessThan(min) || amount.greaterThan(max)) {
    throw new RangeError(`amount must be between ${min} and ${max}`);
  }
  return amount.toDecimalPlaces(2);
}

export function calculateSplit(amount, commissionRate) {
  const total = new Prisma.Decimal(amount);
  const rate = new Prisma.Decimal(commissionRate);
  const commission = total.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  return {
    total,
    commission,
    merchantNet: total.minus(commission).toDecimalPlaces(2),
  };
}

export function normalizeUgandanPhone(value) {
  if (typeof value !== 'string') throw new TypeError('payerPhone must be a phone number string');
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `256${digits.slice(1)}`;
  else if (digits.length === 9) digits = `256${digits}`;
  if (!/^256\d{9}$/.test(digits)) {
    throw new TypeError('Use a valid Ugandan mobile number, for example +256772123456');
  }
  return digits;
}

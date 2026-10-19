import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSplit, normalizeUgandanPhone, parseAmount } from '../lib/money.js';

test('calculates the default 2.5 percent commission to two decimal places', () => {
  const amount = parseAmount('10000.00');
  const split = calculateSplit(amount, '0.025');
  assert.equal(split.total.toFixed(2), '10000.00');
  assert.equal(split.commission.toFixed(2), '250.00');
  assert.equal(split.merchantNet.toFixed(2), '9750.00');
  assert.equal(split.commission.plus(split.merchantNet).toFixed(2), split.total.toFixed(2));
});

test('rounds commission half up and keeps the split balanced', () => {
  const split = calculateSplit(parseAmount('0.20'), '0.025');
  assert.equal(split.commission.toFixed(2), '0.01');
  assert.equal(split.merchantNet.toFixed(2), '0.19');
});

test('rejects amounts with more than two decimal places', () => {
  assert.throws(() => parseAmount('12.345'), /two decimal places/);
});

test('normalizes common Ugandan mobile number formats', () => {
  assert.equal(normalizeUgandanPhone('0772 123 456'), '256772123456');
  assert.equal(normalizeUgandanPhone('+256772123456'), '256772123456');
});

test('rejects non-Ugandan and malformed phone numbers', () => {
  assert.throws(() => normalizeUgandanPhone('+254712345678'), /valid Ugandan mobile number/);
});

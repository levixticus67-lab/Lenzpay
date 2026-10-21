import { getEnv } from '../lib/env.js';
import { collectWithMtn, getMtnPayout, getMtnTransaction, submitMtnPayout } from './momo.js';
import { collectWithAirtel, getAirtelPayout, getAirtelTransaction, submitAirtelPayout } from './airtel.js';

export class ProviderConfigurationError extends Error {
  constructor(provider) {
    super(`${provider} collection credentials are not configured`);
    this.name = 'ProviderConfigurationError';
  }
}

export function assertProviderConfigured(provider) {
  const env = getEnv();
  const configured = provider === 'MTN'
    ? Boolean(env.MTN_SUBSCRIPTION_KEY && env.MTN_API_USER && env.MTN_API_KEY)
    : Boolean(env.AIRTEL_CLIENT_ID && env.AIRTEL_CLIENT_SECRET);
  if (!configured) throw new ProviderConfigurationError(provider);
}

export function assertDisbursementConfigured(provider, { requireEnabled = true } = {}) {
  const env = getEnv();
  const enabled = provider === 'MTN'
    ? env.MTN_DISBURSEMENT_API_ENABLED === 'true'
    : env.AIRTEL_DISBURSEMENT_API_ENABLED === 'true';
  const configured = provider === 'MTN'
    ? Boolean(env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY && env.MTN_API_USER && env.MTN_API_KEY)
    : Boolean(
        env.AIRTEL_CLIENT_ID &&
        env.AIRTEL_CLIENT_SECRET &&
        env.AIRTEL_DISBURSEMENT_PIN &&
        env.AIRTEL_DISBURSEMENT_RSA_PUBLIC_KEY &&
        env.AIRTEL_DISBURSEMENT_API_VERSION &&
        env.AIRTEL_PIN_ENCRYPTION_MODE &&
        (env.AIRTEL_DISBURSEMENT_API_VERSION !== 'v3' || env.AIRTEL_DISBURSEMENT_WALLET_TYPE),
      );
  if (!configured || (requireEnabled && !enabled)) {
    throw new ProviderConfigurationError(`${provider} disbursement`);
  }
}

export function isDisbursementEnabled(provider) {
  try {
    assertDisbursementConfigured(provider);
    return true;
  } catch {
    return false;
  }
}

export async function collectPayment(provider, payload) {
  if (provider === 'MTN') return collectWithMtn(payload);
  return collectWithAirtel(payload);
}

export async function submitProviderPayout(provider, payload) {
  assertDisbursementConfigured(provider);
  if (provider === 'MTN') return submitMtnPayout(payload);
  return submitAirtelPayout(payload);
}

export async function lookupPayoutStatus(provider, reference) {
  assertDisbursementConfigured(provider, { requireEnabled: false });
  if (provider === 'MTN') {
    const result = await getMtnPayout(reference);
    const status = String(result.status ?? '').toUpperCase();
    if (status === 'SUCCESSFUL') return 'SUCCESSFUL';
    if (['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED'].includes(status)) return 'FAILED';
    return 'PENDING';
  }

  const result = await getAirtelPayout(reference);
  const status = String(
    result?.data?.transaction?.status ??
    result?.transaction?.status ??
    result?.status?.transaction?.status ??
    '',
  ).toUpperCase();
  if (['TS', 'SUCCESS', 'SUCCESSFUL'].includes(status)) return 'SUCCESSFUL';
  if (['TF', 'FAILED', 'FAILURE', 'REJECTED', 'EXPIRED'].includes(status)) return 'FAILED';

  const code = String(result?.status?.response_code ?? '');
  if (code === 'DP00900001001') return 'SUCCESSFUL';
  if (['DP00900001000', 'DP00900001006', 'DP00900001014'].includes(code)) return 'PENDING';
  if (code.startsWith('DP009')) return 'FAILED';
  return 'PENDING';
}

export async function lookupProviderStatus(provider, reference) {
  if (provider === 'MTN') {
    const result = await getMtnTransaction(reference);
    const status = String(result.status ?? '').toUpperCase();
    if (status === 'SUCCESSFUL') return 'SUCCESSFUL';
    if (['FAILED', 'REJECTED', 'TIMEOUT', 'EXPIRED'].includes(status)) return 'FAILED';
    return 'PENDING';
  }

  const result = await getAirtelTransaction(reference);
  const status = String(
    result?.data?.transaction?.status ??
    result?.transaction?.status ??
    result?.status?.transaction?.status ??
    '',
  ).toUpperCase();
  if (['TS', 'SUCCESS', 'SUCCESSFUL'].includes(status)) return 'SUCCESSFUL';
  if (['TF', 'FAILED', 'FAILURE', 'REJECTED', 'EXPIRED'].includes(status)) return 'FAILED';
  return 'PENDING';
}

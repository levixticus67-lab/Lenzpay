import { getEnv } from '../lib/env.js';
import { collectWithMtn, getMtnTransaction } from './momo.js';
import { collectWithAirtel, getAirtelTransaction } from './airtel.js';

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

export async function collectPayment(provider, payload) {
  if (provider === 'MTN') return collectWithMtn(payload);
  return collectWithAirtel(payload);
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

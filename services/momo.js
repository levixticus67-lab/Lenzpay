import { getEnv } from '../lib/env.js';

class ProviderError extends Error {
  constructor(stage, status = 502) {
    super(`MTN provider request failed during ${stage}`);
    this.name = 'ProviderError';
    this.stage = stage;
    this.status = status;
    this.definitive = status >= 400 && status < 500 && ![408, 425, 429].includes(status);
  }
}

const tokenCache = new Map();

function mtnBaseUrl() {
  return getEnv().MTN_TARGET_ENV === 'production'
    ? 'https://proxy.momoapi.mtn.com'
    : 'https://sandbox.momodeveloper.mtn.com';
}

async function requestJson(url, options, stage) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new ProviderError(stage, 502);
  }
  if (!response.ok) throw new ProviderError(stage, response.status);
  try {
    return response.status === 204 ? {} : await response.json();
  } catch {
    return {};
  }
}

async function getAccessToken(product = 'collection') {
  const cached = tokenCache.get(product);
  if (cached?.accessToken && cached.expiresAt > Date.now() + 30_000) {
    return cached.accessToken;
  }
  const env = getEnv();
  const subscriptionKey = product === 'disbursement'
    ? env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY
    : env.MTN_SUBSCRIPTION_KEY;
  const basic = Buffer.from(`${env.MTN_API_USER}:${env.MTN_API_KEY}`).toString('base64');
  const token = await requestJson(
    `${mtnBaseUrl()}/${product}/token/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    },
    'authentication',
  );
  if (!token.access_token) throw new ProviderError('authentication', 502);
  tokenCache.set(product, {
    accessToken: token.access_token,
    expiresAt: Date.now() + Math.max(1, Number(token.expires_in) || 300) * 1000,
  });
  return token.access_token;
}

export async function collectWithMtn({ amount, phone, reference, orderId }) {
  const env = getEnv();
  const token = await getAccessToken('collection');
  const callbackBase = env.PAYMENT_WEBHOOK_BASE_URL.replace(/\/+$/, '');
  const callbackUrl = callbackBase
    ? `${callbackBase}/api/v1/payments/webhook/mtn`
    : undefined;
  const body = {
    amount: amount.toFixed(2),
    currency: 'UGX',
    externalId: reference,
    payer: { partyIdType: 'MSISDN', partyId: phone },
    payerMessage: `Payment for order ${orderId}`.slice(0, 140),
    payeeNote: 'Lenzpay checkout',
  };
  if (callbackUrl) body.callbackUrl = callbackUrl;

  await requestJson(
    `${mtnBaseUrl()}/collection/v1_0/requesttopay`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': reference,
        'X-Target-Environment': env.MTN_TARGET_ENV,
        'Ocp-Apim-Subscription-Key': env.MTN_SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
        ...(callbackUrl ? { 'X-Callback-Url': callbackUrl } : {}),
      },
      body: JSON.stringify(body),
    },
    'collection',
  );
}

export async function getMtnTransaction(reference) {
  const env = getEnv();
  const token = await getAccessToken('collection');
  return requestJson(
    `${mtnBaseUrl()}/collection/v1_0/requesttopay/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': env.MTN_TARGET_ENV,
        'Ocp-Apim-Subscription-Key': env.MTN_SUBSCRIPTION_KEY,
      },
    },
    'status_lookup',
  );
}

export async function submitMtnPayout({ amount, destination, reference }) {
  const env = getEnv();
  const token = await getAccessToken('disbursement');
  const callbackBase = env.PAYMENT_WEBHOOK_BASE_URL.replace(/\/+$/, '');
  const callbackUrl = callbackBase
    ? `${callbackBase}/api/v1/payments/payout-webhook/mtn`
    : undefined;
  const body = {
    amount: amount.toFixed(2),
    currency: 'UGX',
    externalId: reference,
    payee: { partyIdType: 'MSISDN', partyId: destination },
    payerMessage: 'Lenzpay payout',
    payeeNote: 'Merchant or agency split payout',
  };

  await requestJson(
    `${mtnBaseUrl()}/disbursement/v1_0/transfer`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Reference-Id': reference,
        'X-Target-Environment': env.MTN_TARGET_ENV,
        'Ocp-Apim-Subscription-Key': env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY,
        'Content-Type': 'application/json',
        ...(callbackUrl ? { 'X-Callback-Url': callbackUrl } : {}),
      },
      body: JSON.stringify(body),
    },
    'disbursement',
  );
}

export async function getMtnPayout(reference) {
  const env = getEnv();
  const token = await getAccessToken('disbursement');
  return requestJson(
    `${mtnBaseUrl()}/disbursement/v1_0/transfer/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Target-Environment': env.MTN_TARGET_ENV,
        'Ocp-Apim-Subscription-Key': env.MTN_DISBURSEMENT_SUBSCRIPTION_KEY,
      },
    },
    'disbursement_status_lookup',
  );
}

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

async function getAccessToken() {
  const env = getEnv();
  const basic = Buffer.from(`${env.MTN_API_USER}:${env.MTN_API_KEY}`).toString('base64');
  const token = await requestJson(
    `${mtnBaseUrl()}/collection/token/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Ocp-Apim-Subscription-Key': env.MTN_SUBSCRIPTION_KEY,
      },
    },
    'authentication',
  );
  if (!token.access_token) throw new ProviderError('authentication', 502);
  return token.access_token;
}

export async function collectWithMtn({ amount, phone, reference, orderId }) {
  const env = getEnv();
  const token = await getAccessToken();
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
  const token = await getAccessToken();
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

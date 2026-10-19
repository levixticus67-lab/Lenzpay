import { getEnv } from '../lib/env.js';

class ProviderError extends Error {
  constructor(stage, status = 502) {
    super(`Airtel provider request failed during ${stage}`);
    this.name = 'ProviderError';
    this.stage = stage;
    this.status = status;
    this.definitive = status >= 400 && status < 500 && ![408, 425, 429].includes(status);
  }
}

let tokenCache = { accessToken: null, expiresAt: 0 };

function airtelBaseUrl() {
  return getEnv().AIRTEL_ENV === 'production'
    ? 'https://openapi.airtel.africa'
    : 'https://openapiuat.airtel.africa';
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
  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 30_000) {
    return tokenCache.accessToken;
  }
  const env = getEnv();
  const result = await requestJson(
    `${airtelBaseUrl()}/auth/oauth2/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: '*/*' },
      body: JSON.stringify({
        client_id: env.AIRTEL_CLIENT_ID,
        client_secret: env.AIRTEL_CLIENT_SECRET,
        grant_type: 'client_credentials',
      }),
    },
    'authentication',
  );
  if (!result.access_token) throw new ProviderError('authentication', 502);
  tokenCache = {
    accessToken: result.access_token,
    expiresAt: Date.now() + Math.max(1, Number(result.expires_in) || 300) * 1000,
  };
  return result.access_token;
}

export async function collectWithAirtel({ amount, phone, reference }) {
  const token = await getAccessToken();
  const body = {
    reference,
    subscriber: { country: 'UG', currency: 'UGX', msisdn: phone },
    transaction: {
      amount: Number(amount.toFixed(2)),
      country: 'UG',
      currency: 'UGX',
      id: reference,
    },
  };

  await requestJson(
    `${airtelBaseUrl()}/merchant/v1/payments/`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: '*/*',
        'X-Country': 'UG',
        'X-Currency': 'UGX',
      },
      body: JSON.stringify(body),
    },
    'collection',
  );
}

export async function getAirtelTransaction(reference) {
  const token = await getAccessToken();
  return requestJson(
    `${airtelBaseUrl()}/standard/v1/payments/${encodeURIComponent(reference)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
        'X-Country': 'UG',
        'X-Currency': 'UGX',
      },
    },
    'status_lookup',
  );
}

import { getEnv } from '../lib/env.js';
import { constants, publicEncrypt } from 'node:crypto';

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

function normalizePublicKey(value) {
  const trimmed = value.trim().replace(/\\n/g, '\n');
  if (trimmed.includes('BEGIN PUBLIC KEY')) return trimmed;
  const body = trimmed.replace(/\s+/g, '');
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

function encryptAirtelPin() {
  const env = getEnv();
  try {
    const key = normalizePublicKey(env.AIRTEL_DISBURSEMENT_RSA_PUBLIC_KEY);
    const options = env.AIRTEL_PIN_ENCRYPTION_MODE === 'pkcs1'
      ? { key, padding: constants.RSA_PKCS1_PADDING }
      : { key, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' };
    return publicEncrypt(options, Buffer.from(env.AIRTEL_DISBURSEMENT_PIN, 'utf8')).toString('base64');
  } catch {
    const error = new ProviderError('pin_encryption', 400);
    error.definitive = true;
    throw error;
  }
}

export async function submitAirtelPayout({ amount, destination, reference }) {
  const env = getEnv();
  const token = await getAccessToken();
  const version = env.AIRTEL_DISBURSEMENT_API_VERSION;
  const pin = encryptAirtelPin();
  const body = version === 'v2'
    ? {
        payee: { currency: 'UGX', msisdn: destination },
        reference,
        pin,
        transaction: { amount: Number(amount.toFixed(2)), id: reference, type: 'B2C' },
      }
    : {
        payee: { msisdn: destination, wallet_type: env.AIRTEL_DISBURSEMENT_WALLET_TYPE },
        reference,
        pin,
        transaction: { amount: Number(amount.toFixed(2)), id: reference, type: 'B2C' },
      };
  const url = version === 'v2'
    ? `${airtelBaseUrl()}/standard/v2/disbursements/`
    : `${airtelBaseUrl()}/standard/v3/disbursements`;
  const result = await requestJson(
    url,
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
    'disbursement',
  );
  const code = result?.status?.response_code;
  if (
    result?.status?.success === true ||
    ['DP00900001000', 'DP00900001001', 'DP00900001006', 'DP00900001014'].includes(code)
  ) {
    return;
  }
  const error = new ProviderError('disbursement', 502);
  error.definitive = Boolean(code && !['DP00900001000', 'DP00900001006', 'DP00900001014'].includes(code));
  throw error;
}

export async function getAirtelPayout(reference) {
  const env = getEnv();
  const token = await getAccessToken();
  const version = env.AIRTEL_DISBURSEMENT_API_VERSION;
  const url = new URL(
    version === 'v2'
      ? `${airtelBaseUrl()}/standard/v2/disbursements/${encodeURIComponent(reference)}`
      : `${airtelBaseUrl()}/standard/v3/disbursements/${encodeURIComponent(reference)}`,
  );
  if (version === 'v2') url.searchParams.set('transactionType', 'B2C');
  return requestJson(
    url.toString(),
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: '*/*',
        'X-Country': 'UG',
        'X-Currency': 'UGX',
      },
    },
    'disbursement_status_lookup',
  );
}

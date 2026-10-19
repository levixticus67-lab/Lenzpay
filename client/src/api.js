const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.error?.message || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return payload;
}

export function formatUgx(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-UG', {
    style: 'currency',
    currency: 'UGX',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-UG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

/**
 * frontend/src/api/analytics.js
 *
 * API client for FocusFlow Analytics & Weekly Reviews.
 */

const API_BASE_URL = '/api/v1/analytics';

export async function fetchAnalyticsSummary(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.scope) searchParams.set('scope', params.scope);
  if (params.teamId) searchParams.set('teamId', params.teamId);
  if (params.from) searchParams.set('from', params.from);
  if (params.to) searchParams.set('to', params.to);

  const query = searchParams.toString();
  const endpoint = query ? `${API_BASE_URL}/summary?${query}` : `${API_BASE_URL}/summary`;

  const res = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const defaultMsg = res.status === 429
      ? 'Rate limit reached. Please wait a moment before trying again.'
      : `Request failed with status ${res.status}`;
    const error = new Error(data?.error?.message || defaultMsg);
    error.status = res.status;
    throw error;
  }

  return data?.data?.summary;
}

export async function fetchWeeklyReview(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.timezone) searchParams.set('timezone', params.timezone);

  const query = searchParams.toString();
  const endpoint = query ? `${API_BASE_URL}/weekly-review?${query}` : `${API_BASE_URL}/weekly-review`;

  const res = await fetch(endpoint, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const defaultMsg = res.status === 429
      ? 'Rate limit reached. Please wait a moment before trying again.'
      : `Request failed with status ${res.status}`;
    const error = new Error(data?.error?.message || defaultMsg);
    error.status = res.status;
    throw error;
  }

  return data?.data?.review;
}

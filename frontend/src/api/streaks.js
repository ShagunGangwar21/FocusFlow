/**
 * frontend/src/api/streaks.js
 *
 * API client for FocusFlow Streaks.
 */

const API_BASE_URL = '/api/v1/streaks';

export async function fetchStreakSummary() {
  const res = await fetch(`${API_BASE_URL}/summary`, {
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

  return data?.data?.streak || {
    currentStreakDays: 0,
    longestStreakDays: 0,
    isActiveToday: false,
    lastActiveDate: null,
  };
}

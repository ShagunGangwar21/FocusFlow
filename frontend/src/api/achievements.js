/**
 * frontend/src/api/achievements.js
 *
 * API client for FocusFlow Achievements.
 */

const API_BASE_URL = '/api/v1/achievements';

export async function fetchAchievements() {
  const res = await fetch(API_BASE_URL, {
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

  return {
    achievements: data?.data?.achievements || [],
    unlockedCount: data?.meta?.unlockedCount || 0,
    total: data?.meta?.total || 0,
  };
}

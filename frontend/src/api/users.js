/**
 * frontend/src/api/users.js
 *
 * API client for FocusFlow User Profile, Preferences, Password, and Data Export.
 */

import { getCookie, getCsrfToken } from './auth';

const API_BASE_URL = '/api/v1/users';

async function userRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    let csrf = getCookie('XSRF-TOKEN');
    if (!csrf) {
      csrf = await getCsrfToken().catch(() => null);
    }
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    method,
    headers,
    credentials: 'include',
  });

  const contentType = res.headers.get('content-type');
  const isJson = contentType && contentType.includes('application/json');
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const errorMsg = data?.error?.message || `Request failed with status ${res.status}`;
    const err = new Error(errorMsg);
    err.status = res.status;
    err.code = data?.error?.code;
    err.details = data?.error?.details;
    throw err;
  }

  return data;
}

/**
 * Fetch current user settings & preferences.
 */
export async function fetchUserSettings() {
  const res = await userRequest('/me', { method: 'GET' });
  return res.data;
}

/**
 * Update basic user profile (name, timezone).
 */
export async function updateUserProfile(payload) {
  const res = await userRequest('/me', {
    method: 'PATCH',
    body: payload,
  });
  return res.data.user;
}

/**
 * Update user preferences (theme, workingHours, recoveryBuffer, notifications).
 */
export async function updateUserPreferences(payload) {
  const res = await userRequest('/me/preferences', {
    method: 'PATCH',
    body: payload,
  });
  return res.data.preferences;
}

/**
 * Change account password.
 */
export async function changePassword(currentPasswordOrPayload, newPassword) {
  const payload = typeof currentPasswordOrPayload === 'object' && currentPasswordOrPayload !== null
    ? currentPasswordOrPayload
    : { currentPassword: currentPasswordOrPayload, newPassword };

  const res = await userRequest('/me/change-password', {
    method: 'POST',
    body: payload,
  });
  return res.data;
}

/**
 * Export user data payload.
 */
export async function exportUserData() {
  const res = await userRequest('/me/export', { method: 'GET' });
  return res;
}

/**
 * Delete account.
 */
export async function deleteUserAccount(passwordOrPayload = {}) {
  const payload = typeof passwordOrPayload === 'string'
    ? { password: passwordOrPayload }
    : passwordOrPayload;

  const res = await userRequest('/me', {
    method: 'DELETE',
    body: payload,
  });
  return res.data;
}

/**
 * Fetch current user notifications.
 */
export async function fetchUserNotifications() {
  const res = await userRequest('/me/notifications', { method: 'GET' });
  return res.data?.notifications || [];
}

/**
 * frontend/src/api/timer.js
 *
 * API client for FocusFlow Server-Authoritative Focus Timer & Session History.
 * Communicates with backend endpoints (/api/v1/sessions/* and /api/v1/tasks/:taskId/sessions)
 * with credentials: 'include' and double-submit CSRF protection.
 */

import { getCookie, getCsrfToken } from './auth';

const API_BASE = '/api/v1';

async function timerRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    let csrf = getCookie('XSRF-TOKEN');
    if (!csrf) {
      csrf = await getCsrfToken();
    }
    if (csrf) {
      headers['X-CSRF-Token'] = csrf;
    }
    if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    method,
    headers,
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
    error.code = data?.error?.code || (res.status === 429 ? 'TOO_MANY_REQUESTS' : undefined);
    error.details = data?.error?.details;
    error.retryAfter = res.headers.get('Retry-After') || data?.error?.details?.retryAfter;
    throw error;
  }

  return data;
}

/**
 * Fetch current user's active or paused session.
 * Returns { session: ... | null }
 */
export async function fetchActiveSession() {
  const res = await timerRequest('/sessions/active');
  return res.data?.session || null;
}

/**
 * Start a new focus session for a task.
 */
export async function startTaskSession(taskId) {
  const res = await timerRequest(`/tasks/${taskId}/sessions`, {
    method: 'POST',
    body: {},
  });
  return res.data?.session;
}

/**
 * Pause active session.
 */
export async function pauseSession(sessionId) {
  const res = await timerRequest(`/sessions/${sessionId}/pause`, {
    method: 'POST',
    body: {},
  });
  return res.data?.session;
}

/**
 * Resume paused session.
 */
export async function resumeSession(sessionId) {
  const res = await timerRequest(`/sessions/${sessionId}/resume`, {
    method: 'POST',
    body: {},
  });
  return res.data?.session;
}

/**
 * Finish a session (with optional task completion).
 */
export async function finishSession(sessionId, { markTaskComplete = false } = {}) {
  const res = await timerRequest(`/sessions/${sessionId}/finish`, {
    method: 'POST',
    body: { markTaskComplete },
  });
  return res.data;
}

/**
 * Discard an active session.
 */
export async function discardSession(sessionId) {
  const res = await timerRequest(`/sessions/${sessionId}/discard`, {
    method: 'POST',
    body: {},
  });
  return res.data?.session;
}

/**
 * Fetch paginated session history for the user.
 */
export async function fetchSessionHistory(params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);
  if (params.status && params.status !== 'ALL') query.append('status', params.status);
  if (params.taskId) query.append('taskId', params.taskId);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await timerRequest(`/sessions${qs}`);
  return {
    sessions: res.data?.sessions || [],
    pagination: res.meta?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
  };
}

/**
 * Fetch focus sessions and total duration for a specific task.
 */
export async function fetchTaskSessions(taskId, params = {}) {
  const query = new URLSearchParams();
  if (params.page) query.append('page', params.page);
  if (params.limit) query.append('limit', params.limit);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await timerRequest(`/tasks/${taskId}/sessions${qs}`);
  return {
    task: res.data?.task,
    sessions: res.data?.sessions || [],
    totalDurationSeconds: res.data?.totalDurationSeconds || 0,
    pagination: res.meta?.pagination,
  };
}

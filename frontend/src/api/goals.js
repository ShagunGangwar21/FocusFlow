/**
 * frontend/src/api/goals.js
 *
 * API client for FocusFlow Goals.
 * Connects to /api/v1/goals with credentials: 'include' and CSRF double-submit token.
 */

import { getCookie, getCsrfToken } from './auth';

const API_BASE_URL = '/api/v1/goals';

async function goalRequest(endpoint, options = {}) {
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
    const defaultMsg = res.status === 429
      ? 'Rate limit reached. Please wait a moment before trying again.'
      : `Request failed with status ${res.status}`;
    const error = new Error(data?.error?.message || defaultMsg);
    error.status = res.status;
    error.code = data?.error?.code || (res.status === 429 ? 'TOO_MANY_REQUESTS' : undefined);
    error.details = data?.error?.details;
    throw error;
  }

  return data;
}

export async function fetchGoals(params = {}) {
  const searchParams = new URLSearchParams();
  if (params.period) searchParams.set('period', params.period);
  if (params.type) searchParams.set('type', params.type);
  if (params.teamId) searchParams.set('teamId', params.teamId);

  const query = searchParams.toString();
  const endpoint = query ? `?${query}` : '';
  const response = await goalRequest(endpoint);
  return response?.data?.goals || [];
}

export async function fetchGoalById(id) {
  const response = await goalRequest(`/${id}`);
  return response?.data?.goal;
}

export async function createGoal(goalData) {
  const response = await goalRequest('', {
    method: 'POST',
    body: goalData,
  });
  return response?.data?.goal;
}

export async function updateGoal(id, updates) {
  const response = await goalRequest(`/${id}`, {
    method: 'PATCH',
    body: updates,
  });
  return response?.data?.goal;
}

export async function deleteGoal(id) {
  const response = await goalRequest(`/${id}`, {
    method: 'DELETE',
  });
  return response?.data;
}

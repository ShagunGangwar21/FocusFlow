/**
 * frontend/src/api/calendar.js
 *
 * API client for FocusFlow Calendar.
 * Communicates with /api/v1/calendar using credentials: 'include'.
 */

import { getCookie, getCsrfToken } from './auth';

const API_BASE = '/api/v1/calendar';

async function calendarRequest(endpoint = '', options = {}) {
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
    const error = new Error(data?.error?.message || `Calendar request failed with status ${res.status}`);
    error.status = res.status;
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }

  return data;
}

/**
 * Fetch calendar data for a specified date range.
 * @param {{ from: string, to: string, scope?: string, teamId?: string }} params
 */
export async function fetchCalendar(params) {
  const query = new URLSearchParams();
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);
  if (params.scope) query.append('scope', params.scope);
  if (params.teamId) query.append('teamId', params.teamId);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await calendarRequest(qs);
  return res.data;
}

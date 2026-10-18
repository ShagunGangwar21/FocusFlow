/**
 * frontend/src/api/scheduling.js
 *
 * API client for FocusFlow Scheduling & Conflict Recovery.
 * Communicates with /api/v1/scheduling using credentials: 'include'.
 */

import { getCookie, getCsrfToken } from './auth';

const API_BASE = '/api/v1/scheduling';

async function schedulingRequest(endpoint = '', options = {}) {
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
      : `Scheduling request failed with status ${res.status}`;
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
 * Fetch detected schedule conflicts.
 */
export async function fetchConflicts(params = {}) {
  const query = new URLSearchParams();
  if (params.from) query.append('from', params.from);
  if (params.to) query.append('to', params.to);
  if (params.scope) query.append('scope', params.scope);
  if (params.teamId) query.append('teamId', params.teamId);

  const qs = query.toString() ? `?${query.toString()}` : '';
  const res = await schedulingRequest(`/conflicts${qs}`);
  return res.data;
}

/**
 * Diagnostic schedule analysis for a specific date.
 */
export async function analyzeSchedule({ date, timezone = 'UTC', scope = 'PERSONAL', teamId = null }) {
  const res = await schedulingRequest('/analyze', {
    method: 'POST',
    body: { date, timezone, scope, teamId },
  });
  return res.data;
}

/**
 * Request creation of a deterministic schedule recovery proposal.
 */
export async function createScheduleProposal(payload) {
  const res = await schedulingRequest('/proposals', {
    method: 'POST',
    body: payload,
  });
  return res.data?.proposal;
}

/**
 * Fetch an existing proposal by ID.
 */
export async function fetchProposal(proposalId) {
  const res = await schedulingRequest(`/proposals/${proposalId}`);
  return res.data?.proposal;
}

/**
 * Atomically accept a schedule proposal with optimistic concurrency.
 */
export async function acceptScheduleProposal(proposalId, { taskVersions, acceptedFixedTaskIds = [] }) {
  const res = await schedulingRequest(`/proposals/${proposalId}/accept`, {
    method: 'POST',
    body: { taskVersions, acceptedFixedTaskIds },
  });
  return res.data;
}

/**
 * Reject a schedule proposal.
 */
export async function rejectScheduleProposal(proposalId) {
  const res = await schedulingRequest(`/proposals/${proposalId}/reject`, {
    method: 'POST',
    body: {},
  });
  return res.data?.proposal;
}

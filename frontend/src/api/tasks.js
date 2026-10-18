/**
 * frontend/src/api/tasks.js
 *
 * API client for FocusFlow Task Management.
 * Communicates with backend endpoints (/api/v1/tasks/*) using credentials: 'include'
 * and double-submit CSRF protection headers for mutating requests.
 */

import { getCookie, getCsrfToken } from './auth';

const API_BASE_URL = '/api/v1/tasks';

/**
 * Internal request wrapper for task endpoints.
 */
async function taskRequest(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  // Mutating requests require X-CSRF-Token header matching XSRF-TOKEN cookie
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
    const error = new Error(data?.error?.message || `Request failed with status ${res.status}`);
    error.status = res.status;
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }

  return data;
}

/**
 * Fetches tasks with optional query filters (scope, priority, scheduleType, status, search, pagination).
 * @param {object} [params]
 * @returns {Promise<{ tasks: Array, pagination: object }>}
 */
export async function fetchTasks(params = {}) {
  const query = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  });

  const queryString = query.toString();
  const endpoint = queryString ? `?${queryString}` : '';
  const res = await taskRequest(endpoint, { method: 'GET' });

  return {
    tasks: res.data.tasks || [],
    pagination: res.meta?.pagination || { page: 1, limit: 20, total: 0, totalPages: 1 },
  };
}

/**
 * Fetches a single task by ID.
 * @param {string} taskId
 * @returns {Promise<object>}
 */
export async function fetchTaskById(taskId) {
  const res = await taskRequest(`/${taskId}`, { method: 'GET' });
  return res.data.task;
}

/**
 * Creates a new personal task.
 * @param {object} taskData
 * @returns {Promise<object>} Created task
 */
export async function createTask(taskData) {
  const res = await taskRequest('', {
    method: 'POST',
    body: taskData,
  });
  return res.data.task;
}

/**
 * Updates an existing task with optimistic concurrency.
 * @param {string} taskId
 * @param {object} updateData
 * @returns {Promise<object>} Updated task
 */
export async function updateTask(taskId, updateData) {
  const res = await taskRequest(`/${taskId}`, {
    method: 'PATCH',
    body: updateData,
  });
  return res.data.task;
}

/**
 * Marks a task as COMPLETED.
 * @param {string} taskId
 * @param {object} [data]
 * @returns {Promise<object>}
 */
export async function completeTask(taskId, data = {}) {
  const res = await taskRequest(`/${taskId}/complete`, {
    method: 'POST',
    body: data,
  });
  return res.data.task;
}

/**
 * Reopens a completed task back to PENDING.
 * @param {string} taskId
 * @returns {Promise<object>}
 */
export async function reopenTask(taskId) {
  const res = await taskRequest(`/${taskId}/reopen`, {
    method: 'POST',
    body: {},
  });
  return res.data.task;
}

/**
 * Deletes a task by ID.
 * @param {string} taskId
 * @returns {Promise<{ id: string, deleted: boolean }>}
 */
export async function deleteTask(taskId) {
  const res = await taskRequest(`/${taskId}`, {
    method: 'DELETE',
  });
  return res.data;
}

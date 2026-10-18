/**
 * frontend/src/api/auth.js
 *
 * API client for FocusFlow Authentication & Session management.
 * Communicates with backend endpoints (/api/v1/auth/*) using credentials: 'include'
 * and double-submit CSRF protection headers.
 */

const API_BASE_URL = '/api/v1/auth';

let cachedCsrfToken = null;

/**
 * Extracts a cookie value by name from document.cookie.
 * @param {string} name
 * @returns {string|null}
 */
export function getCookie(name) {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Bootstraps or retrieves the CSRF token.
 * Calls GET /api/v1/auth/csrf-token and caches the token.
 * @returns {Promise<string>}
 */
export async function getCsrfToken() {
  // First check if cookie already has a valid XSRF-TOKEN
  const cookieToken = getCookie('XSRF-TOKEN');
  if (cookieToken) {
    cachedCsrfToken = cookieToken;
    return cookieToken;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/csrf-token`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch CSRF token (status ${res.status})`);
    }

    const json = await res.json();
    cachedCsrfToken = json?.data?.csrfToken || getCookie('XSRF-TOKEN');
    return cachedCsrfToken;
  } catch (err) {
    console.error('[Auth API] Failed to bootstrap CSRF token:', err);
    throw err;
  }
}

/**
 * Helper to make API requests with standard headers, credentials, and CSRF token on mutating requests.
 * @param {string} endpoint
 * @param {object} [options]
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    Accept: 'application/json',
    ...(options.headers || {}),
  };

  // Mutating requests require X-CSRF-Token header matching the XSRF-TOKEN cookie
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
    credentials: 'include', // Essential for HttpOnly session cookie handling
  });

  // Keep cached CSRF token synchronized with cookie
  const newCookieToken = getCookie('XSRF-TOKEN');
  cachedCsrfToken = newCookieToken || null;

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
 * Checks current session by calling GET /api/v1/auth/me.
 * @returns {Promise<object>} User profile and preferences
 */
export async function fetchCurrentUser() {
  const res = await request('/me', { method: 'GET' });
  return res.data.user;
}

/**
 * Logs in with email and password.
 * @param {{ email: string, password: string }} credentials
 * @returns {Promise<object>} User profile
 */
export async function loginUser(credentials) {
  const res = await request('/login', {
    method: 'POST',
    body: credentials,
  });
  return res.data.user;
}

/**
 * Registers a new user.
 * @param {{ name: string, email: string, password: string, timezone?: string }} payload
 * @returns {Promise<object>} Created user profile
 */
export async function registerUser(payload) {
  const res = await request('/register', {
    method: 'POST',
    body: payload,
  });
  return res.data.user;
}

/**
 * Logs out current user and clears session cookies.
 * @returns {Promise<object>}
 */
export async function logoutUser() {
  try {
    return await request('/logout', {
      method: 'POST',
    });
  } finally {
    cachedCsrfToken = null;
  }
}

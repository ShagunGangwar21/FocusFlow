/**
 * frontend/src/api/teams.js
 *
 * API client for FocusFlow Teams, Invitations, Members, and Shared Projects.
 * Communicates with backend endpoints (/api/v1/teams/*, /api/v1/invitations/*, /api/v1/projects/*)
 * using credentials: 'include' and double-submit CSRF protection headers for mutating requests.
 */

import { getCookie, getCsrfToken } from './auth';

async function apiRequest(url, options = {}) {
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

  const res = await fetch(url, {
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

// ----------------------------------------------------
// TEAMS
// ----------------------------------------------------

export async function fetchTeams() {
  const res = await apiRequest('/api/v1/teams');
  return res.data;
}

export async function createTeam(teamData) {
  const res = await apiRequest('/api/v1/teams', {
    method: 'POST',
    body: teamData,
  });
  return res.data;
}

export async function fetchTeamById(teamId) {
  const res = await apiRequest(`/api/v1/teams/${teamId}`);
  return res.data;
}

export async function updateTeam(teamId, data) {
  const res = await apiRequest(`/api/v1/teams/${teamId}`, {
    method: 'PATCH',
    body: data,
  });
  return res.data;
}

export async function deleteTeam(teamId) {
  const res = await apiRequest(`/api/v1/teams/${teamId}`, {
    method: 'DELETE',
  });
  return res.data;
}

// ----------------------------------------------------
// MEMBERS & ROLES
// ----------------------------------------------------

export async function updateMemberRole(teamId, userId, role) {
  const res = await apiRequest(`/api/v1/teams/${teamId}/members/${userId}`, {
    method: 'PATCH',
    body: { role },
  });
  return res.data;
}

export async function removeMember(teamId, userId) {
  const res = await apiRequest(`/api/v1/teams/${teamId}/members/${userId}`, {
    method: 'DELETE',
  });
  return res.data;
}

// ----------------------------------------------------
// INVITATIONS
// ----------------------------------------------------

export async function inviteMember(teamId, { email, role }) {
  const res = await apiRequest(`/api/v1/teams/${teamId}/invitations`, {
    method: 'POST',
    body: { email, role },
  });
  return res.data;
}

export async function revokeInvitation(teamId, invitationId) {
  const res = await apiRequest(`/api/v1/teams/${teamId}/invitations/${invitationId}`, {
    method: 'DELETE',
  });
  return res.data;
}

export async function previewInvitation(token) {
  const res = await apiRequest(`/api/v1/invitations/${token}`);
  return res.data;
}

export async function acceptInvitation(token) {
  const res = await apiRequest(`/api/v1/invitations/${token}/accept`, {
    method: 'POST',
  });
  return res.data;
}

// ----------------------------------------------------
// PROJECTS
// ----------------------------------------------------

export async function fetchProjects(teamId) {
  const res = await apiRequest(`/api/v1/teams/${teamId}/projects`);
  return res.data;
}

export async function createProject(teamId, projectData) {
  const res = await apiRequest(`/api/v1/teams/${teamId}/projects`, {
    method: 'POST',
    body: projectData,
  });
  return res.data;
}

export async function fetchProjectById(projectId) {
  const res = await apiRequest(`/api/v1/projects/${projectId}`);
  return res.data;
}

export async function updateProject(projectId, data) {
  const res = await apiRequest(`/api/v1/projects/${projectId}`, {
    method: 'PATCH',
    body: data,
  });
  return res.data;
}

export async function deleteProject(projectId) {
  const res = await apiRequest(`/api/v1/projects/${projectId}`, {
    method: 'DELETE',
  });
  return res.data;
}

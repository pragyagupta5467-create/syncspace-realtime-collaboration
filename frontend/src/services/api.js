/**
 * SyncSpace API Client Service
 * REST communication for Authentication, Room management, and MongoDB health checks.
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const AUTH_TOKEN_KEY = 'syncspace_auth_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  } catch (e) {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch (e) {
    console.warn('Failed to store auth token', e);
  }
}

export function removeAuthToken() {
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch (e) {}
}

function getAuthHeaders() {
  const token = getAuthToken();
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Register a new user account
 */
export async function registerApi(name, email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data?.error?.message || data?.error || 'Registration failed';
    throw new Error(errorMsg);
  }
  return data;
}

/**
 * Log in an existing user
 */
export async function loginApi(email, password) {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data?.error?.message || data?.error || 'Invalid email or password';
    throw new Error(errorMsg);
  }
  return data;
}

/**
 * Get current authenticated user profile
 */
export async function getMeApi() {
  const res = await fetch(`${API_BASE_URL}/auth/me`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Authentication session expired');
  }
  return data.user;
}

/**
 * Logout from server
 */
export async function logoutApi() {
  try {
    await fetch(`${API_BASE_URL}/auth/logout`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } catch (e) {}
  removeAuthToken();
}

/**
 * Get rooms created by the logged-in user
 */
export async function getUserRoomsApi() {
  const res = await fetch(`${API_BASE_URL}/user/rooms`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Failed to load user workspaces');
  }
  return data.rooms || [];
}

/**
 * Backend health check
 */
export async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE_URL}/health`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (error) {
    return { status: 'offline', error: error.message };
  }
}

/**
 * Create a new room in MongoDB
 */
export async function createRoomApi(roomId, user) {
  const res = await fetch(`${API_BASE_URL}/rooms`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roomId, user }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to create room in database');
  }
  return data.room;
}

/**
 * Verify a room exists in MongoDB
 */
export async function verifyRoomApi(roomId) {
  const res = await fetch(`${API_BASE_URL}/rooms/${encodeURIComponent(roomId)}`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || `Room "${roomId}" not found`);
  }
  return data.room;
}

/**
 * Fetch persisted tasks from MongoDB for a room
 */
export async function getRoomTasksApi(roomId) {
  const res = await fetch(`${API_BASE_URL}/rooms/${encodeURIComponent(roomId)}/tasks`);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error || 'Failed to load room tasks');
  }
  return data.tasks || [];
}

/**
 * Fetch real notifications for the authenticated user
 */
export async function getNotificationsApi(limit = 50) {
  const res = await fetch(`${API_BASE_URL}/notifications?limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Failed to fetch notifications');
  }
  return {
    notifications: data.notifications || [],
    unreadCount: data.unreadCount || 0,
  };
}

/**
 * Mark a single notification as read
 */
export async function markNotificationAsReadApi(notificationId) {
  const res = await fetch(`${API_BASE_URL}/notifications/${encodeURIComponent(notificationId)}/read`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Failed to mark notification as read');
  }
  return data;
}

/**
 * Mark all user notifications as read
 */
export async function markAllNotificationsAsReadApi() {
  const res = await fetch(`${API_BASE_URL}/notifications/read-all`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Failed to mark all notifications as read');
  }
  return data;
}

/**
 * Ask SyncSpace AI a contextual question about the workspace
 */
export async function askWorkspaceAIApi(roomId, question) {
  const res = await fetch(`${API_BASE_URL}/ai/workspace`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roomId, question }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'AI request failed');
  }
  return data;
}

/**
 * Generate an AI workspace session summary
 */
export async function getWorkspaceSummaryApi(roomId) {
  const res = await fetch(`${API_BASE_URL}/ai/summary`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ roomId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'AI summary generation failed');
  }
  return data;
}



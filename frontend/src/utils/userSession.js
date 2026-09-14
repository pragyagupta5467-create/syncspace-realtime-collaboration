/**
 * User Identity & Session Persistence Utility
 * Generates and stores temporary user identities and visited room history in localStorage.
 */

const STORAGE_KEY = 'syncspace_user_session';
const RECENT_ROOMS_KEY = 'syncspace_recent_rooms';

const PALETTE = [
  '#6366f1', // Indigo
  '#f43f5e', // Rose
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#a855f7', // Purple
  '#ec4899', // Pink
  '#3b82f6', // Blue
];

/**
 * Generate a random short UUID-like string
 */
function generateId(length = 8) {
  return Math.random().toString(36).substring(2, 2 + length);
}

/**
 * Get or initialize persistent temporary user session
 */
export function getUserSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.userId && parsed.displayName) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to parse saved user session from localStorage', e);
  }

  // Create new session
  const randomColor = PALETTE[Math.floor(Math.random() * PALETTE.length)];
  const randomNum = Math.floor(1000 + Math.random() * 9000);
  const newSession = {
    userId: `user_${generateId(8)}`,
    displayName: `Collaborator_${randomNum}`,
    userColor: randomColor,
    createdAt: new Date().toISOString(),
  };

  saveUserSession(newSession);
  return newSession;
}

/**
 * Persist user session to localStorage
 */
export function saveUserSession(session) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save user session to localStorage', e);
  }
}

/**
 * Generates a clean readable Room ID (e.g. "SYNC-7K9P" or "AB12CD")
 */
export function generateRoomId() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `SYNC-${code}`;
}

/**
 * Validates a Room ID
 */
export function isValidRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') return false;
  const clean = roomId.trim();
  return clean.length >= 2 && clean.length <= 50 && /^[A-Za-z0-9_-]+$/.test(clean);
}

/**
 * Get list of real rooms visited/created by the current user
 */
export function getRecentRooms() {
  try {
    const raw = localStorage.getItem(RECENT_ROOMS_KEY);
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (e) {
    console.warn('Failed to read recent rooms from localStorage', e);
  }
  return [];
}

/**
 * Record a room visit in recent rooms history
 */
export function addRecentRoom(roomData) {
  if (!roomData?.roomId) return;
  try {
    const existing = getRecentRooms();
    const cleanId = roomData.roomId.trim().toUpperCase();
    const filtered = existing.filter((r) => r.roomId !== cleanId);
    const updated = [
      {
        roomId: cleanId,
        lastVisited: new Date().toISOString(),
        role: roomData.role || 'Member',
      },
      ...filtered,
    ].slice(0, 10); // Keep latest 10
    localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.error('Failed to save recent room', e);
  }
}

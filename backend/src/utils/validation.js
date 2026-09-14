/**
 * SyncSpace Server-Side Input Validation & Sanitization Engine
 * Strong input validation for all Socket.IO payloads and REST endpoints.
 */

export const ERROR_CODES = {
  ROOM_NOT_FOUND: 'ROOM_NOT_FOUND',
  NOT_ROOM_MEMBER: 'NOT_ROOM_MEMBER',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  INVALID_ROOM_ID: 'INVALID_ROOM_ID',
  INVALID_USER: 'INVALID_USER',
  INVALID_TASK: 'INVALID_TASK',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  TASK_VERSION_CONFLICT: 'TASK_VERSION_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
};

/**
 * Creates standardized error payload
 * @param {string} code
 * @param {string} message
 * @param {object} [details]
 */
export function createErrorResponse(code, message, details = null) {
  return {
    success: false,
    error: {
      code: code || ERROR_CODES.SERVER_ERROR,
      message: message || 'An unexpected error occurred',
      ...(details ? { details } : {}),
    },
  };
}

/**
 * Validates and sanitizes Room ID
 * Format: 2-50 alphanumeric characters, hyphens, or underscores
 */
export function validateRoomId(roomId) {
  if (!roomId || typeof roomId !== 'string') {
    return { valid: false, error: 'Room ID is required and must be a string' };
  }
  const clean = roomId.trim().toUpperCase();
  if (clean.length < 2 || clean.length > 50) {
    return { valid: false, error: 'Room ID must be between 2 and 50 characters' };
  }
  if (!/^[A-Za-z0-9_-]+$/.test(clean)) {
    return { valid: false, error: 'Room ID can only contain letters, numbers, hyphens, and underscores' };
  }
  return { valid: true, value: clean };
}

/**
 * Validates and sanitizes user identity
 */
export function validateUser(user) {
  if (!user || typeof user !== 'object') {
    return { valid: false, error: 'User payload must be an object' };
  }

  const userId = typeof user.userId === 'string' && user.userId.trim().length > 0
    ? user.userId.trim().slice(0, 50)
    : `usr_${Math.random().toString(36).substring(2, 9)}`;

  const displayName = typeof user.displayName === 'string' && user.displayName.trim().length > 0
    ? user.displayName.trim().slice(0, 30)
    : 'Anonymous';

  const userColor = typeof user.userColor === 'string' && /^#[0-9A-Fa-f]{6}$/.test(user.userColor)
    ? user.userColor
    : '#6366f1';

  return {
    valid: true,
    value: { userId, displayName, userColor },
  };
}

/**
 * Validates and sanitizes task creation payload
 */
export function validateCreateTaskPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Task payload is required' };
  }

  const task = payload.task || payload;
  if (!task || typeof task !== 'object') {
    return { valid: false, error: 'Task data must be an object' };
  }

  if (!task.title || typeof task.title !== 'string' || task.title.trim().length === 0) {
    return { valid: false, error: 'Task title is required and cannot be empty' };
  }

  const cleanTitle = task.title.trim().slice(0, 140);
  const cleanDescription = typeof task.description === 'string'
    ? task.description.trim().slice(0, 800)
    : '';

  const allowedStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
  const status = allowedStatuses.includes(task.status) ? task.status : 'TODO';

  const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH'];
  const priority = allowedPriorities.includes(task.priority) ? task.priority : 'MEDIUM';

  const position = typeof task.position === 'number' && !isNaN(task.position) ? task.position : undefined;
  const taskId = typeof task.id === 'string' && task.id.trim().length > 0
    ? task.id.trim().slice(0, 60)
    : undefined;

  let assignedTo = null;
  if (task.assignedTo && typeof task.assignedTo === 'object' && task.assignedTo.userId) {
    assignedTo = {
      userId: String(task.assignedTo.userId).trim(),
      displayName: String(task.assignedTo.displayName || 'Collaborator').trim().slice(0, 50),
      userColor: String(task.assignedTo.userColor || '#6366f1').trim().slice(0, 20),
    };
  }

  return {
    valid: true,
    value: {
      id: taskId,
      title: cleanTitle,
      description: cleanDescription,
      status,
      priority,
      position,
      assignedTo,
    },
  };
}

/**
 * Validates task update payload
 */
export function validateUpdateTaskPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Update payload is required' };
  }

  const { taskId, updates, expectedVersion } = payload;
  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    return { valid: false, error: 'Task ID is required' };
  }

  if (!updates || typeof updates !== 'object') {
    return { valid: false, error: 'Updates object is required' };
  }

  const cleanUpdates = {};

  if (typeof updates.title === 'string') {
    if (updates.title.trim().length === 0) {
      return { valid: false, error: 'Task title cannot be empty' };
    }
    cleanUpdates.title = updates.title.trim().slice(0, 140);
  }

  if (typeof updates.description === 'string') {
    cleanUpdates.description = updates.description.trim().slice(0, 800);
  }

  if (updates.priority !== undefined) {
    if (!['LOW', 'MEDIUM', 'HIGH'].includes(updates.priority)) {
      return { valid: false, error: 'Invalid priority. Allowed values: LOW, MEDIUM, HIGH' };
    }
    cleanUpdates.priority = updates.priority;
  }

  if (updates.status !== undefined) {
    if (!['TODO', 'IN_PROGRESS', 'DONE'].includes(updates.status)) {
      return { valid: false, error: 'Invalid status. Allowed values: TODO, IN_PROGRESS, DONE' };
    }
    cleanUpdates.status = updates.status;
  }

  if (typeof updates.position === 'number' && !isNaN(updates.position)) {
    cleanUpdates.position = updates.position;
  }

  if (updates.assignedTo !== undefined) {
    if (updates.assignedTo === null) {
      cleanUpdates.assignedTo = null;
    } else if (typeof updates.assignedTo === 'object' && updates.assignedTo.userId) {
      cleanUpdates.assignedTo = {
        userId: String(updates.assignedTo.userId).trim(),
        displayName: String(updates.assignedTo.displayName || 'Collaborator').trim().slice(0, 50),
        userColor: String(updates.assignedTo.userColor || '#6366f1').trim().slice(0, 20),
      };
    }
  }

  if (Object.keys(cleanUpdates).length === 0) {
    return { valid: false, error: 'No valid update fields provided' };
  }

  const cleanExpectedVersion = typeof expectedVersion === 'number' && expectedVersion > 0
    ? expectedVersion
    : undefined;

  return {
    valid: true,
    value: {
      taskId: taskId.trim(),
      updates: cleanUpdates,
      expectedVersion: cleanExpectedVersion,
    },
  };
}

/**
 * Validates task move payload
 */
export function validateMoveTaskPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, error: 'Move payload is required' };
  }

  const { taskId, newStatus, newPosition, expectedVersion } = payload;
  if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
    return { valid: false, error: 'Task ID is required' };
  }

  if (!newStatus || !['TODO', 'IN_PROGRESS', 'DONE'].includes(newStatus)) {
    return { valid: false, error: 'Valid status (TODO, IN_PROGRESS, DONE) is required' };
  }

  const position = typeof newPosition === 'number' && !isNaN(newPosition) ? newPosition : undefined;
  const version = typeof expectedVersion === 'number' && expectedVersion > 0 ? expectedVersion : undefined;

  return {
    valid: true,
    value: {
      taskId: taskId.trim(),
      newStatus,
      newPosition: position,
      expectedVersion: version,
    },
  };
}

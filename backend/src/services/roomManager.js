/**
 * In-Memory Room, Presence & Shared Task State Manager
 * Maintains active rooms, connected sockets, and collaborative task state.
 */
class RoomManager {
  constructor() {
    // Map: roomId => { users: Map(socketId => userRecord), tasks: Map(taskId => taskRecord) }
    this.rooms = new Map();
    // Map: socketId => Set(roomId) for fast cleanup on disconnect
    this.socketToRooms = new Map();
  }

  /**
   * Helper to ensure a room structure exists
   */
  _ensureRoom(roomId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        users: new Map(),
        tasks: new Map(),
      });
    }
    return this.rooms.get(roomId);
  }

  /**
   * Adds a user to a specific room
   */
  addUser(roomId, socketId, userData) {
    const room = this._ensureRoom(roomId);

    const userRecord = {
      socketId,
      userId: userData.userId || socketId,
      displayName: userData.displayName || 'Anonymous',
      userColor: userData.userColor || '#6366f1',
      joinedAt: new Date().toISOString(),
    };

    room.users.set(socketId, userRecord);

    if (!this.socketToRooms.has(socketId)) {
      this.socketToRooms.set(socketId, new Set());
    }
    this.socketToRooms.get(socketId).add(roomId);

    return userRecord;
  }

  /**
   * Removes a user from a specific room
   */
  removeUser(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const userRecord = room.users.get(socketId);
    if (userRecord) {
      room.users.delete(socketId);
      // Clean up room if both users and tasks are empty (or keep tasks for rejoin)
      if (room.users.size === 0 && room.tasks.size === 0) {
        this.rooms.delete(roomId);
      }
    }

    const socketRooms = this.socketToRooms.get(socketId);
    if (socketRooms) {
      socketRooms.delete(roomId);
      if (socketRooms.size === 0) {
        this.socketToRooms.delete(socketId);
      }
    }

    return userRecord || null;
  }

  /**
   * Removes a socket from all rooms it belongs to
   */
  removeSocketFromAllRooms(socketId) {
    const socketRooms = this.socketToRooms.get(socketId);
    if (!socketRooms) return [];

    const removals = [];
    for (const roomId of Array.from(socketRooms)) {
      const removedUser = this.removeUser(roomId, socketId);
      if (removedUser) {
        removals.push({ roomId, user: removedUser });
      }
    }

    this.socketToRooms.delete(socketId);
    return removals;
  }

  /**
   * Retrieves all active users in a room
   */
  getRoomUsers(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.users.values()).map(user => ({
      userId: user.userId,
      displayName: user.displayName,
      userColor: user.userColor,
      joinedAt: user.joinedAt,
      socketId: user.socketId,
    }));
  }

  /**
   * Retrieves a specific user in a room by socketId
   */
  getUserInRoom(roomId, socketId) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return room.users.get(socketId) || null;
  }

  // ==========================================
  // SHARED TASK STATE MANAGEMENT
  // ==========================================

  /**
   * Creates a new collaborative task in the room
   */
  createTask(roomId, taskData, user) {
    const room = this._ensureRoom(roomId);
    const taskId = taskData.id || `task_${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date().toISOString();

    const allowedStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
    const status = allowedStatuses.includes(taskData.status) ? taskData.status : 'TODO';

    const allowedPriorities = ['LOW', 'MEDIUM', 'HIGH'];
    const priority = allowedPriorities.includes(taskData.priority) ? taskData.priority : 'MEDIUM';

    // Calculate position at end of column
    const existingColumnTasks = Array.from(room.tasks.values()).filter(t => t.status === status);
    const position = typeof taskData.position === 'number' ? taskData.position : existingColumnTasks.length;

    const userSummary = {
      userId: user.userId,
      displayName: user.displayName,
      userColor: user.userColor,
    };

    const task = {
      id: taskId,
      title: (taskData.title || 'Untitled Task').trim().slice(0, 120),
      description: (taskData.description || '').trim().slice(0, 500),
      status,
      priority,
      position,
      version: 1,
      createdBy: userSummary,
      updatedBy: userSummary,
      createdAt: now,
      updatedAt: now,
    };

    room.tasks.set(taskId, task);
    return task;
  }

  /**
   * Updates an existing task with granular field changes
   */
  updateTask(roomId, taskId, updates, user) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const task = room.tasks.get(taskId);
    if (!task) return null;

    const now = new Date().toISOString();
    const userSummary = {
      userId: user.userId,
      displayName: user.displayName,
      userColor: user.userColor,
    };

    if (typeof updates.title === 'string' && updates.title.trim().length > 0) {
      task.title = updates.title.trim().slice(0, 120);
    }
    if (typeof updates.description === 'string') {
      task.description = updates.description.trim().slice(0, 500);
    }
    if (['LOW', 'MEDIUM', 'HIGH'].includes(updates.priority)) {
      task.priority = updates.priority;
    }
    if (['TODO', 'IN_PROGRESS', 'DONE'].includes(updates.status)) {
      task.status = updates.status;
    }
    if (typeof updates.position === 'number') {
      task.position = updates.position;
    }

    task.version += 1;
    task.updatedBy = userSummary;
    task.updatedAt = now;

    return task;
  }

  /**
   * Moves a task to a new status / position
   */
  moveTask(roomId, taskId, newStatus, newPosition, user) {
    const room = this.rooms.get(roomId);
    if (!room) return null;

    const task = room.tasks.get(taskId);
    if (!task) return null;

    const allowedStatuses = ['TODO', 'IN_PROGRESS', 'DONE'];
    if (!allowedStatuses.includes(newStatus)) return null;

    const now = new Date().toISOString();
    task.status = newStatus;
    if (typeof newPosition === 'number') {
      task.position = newPosition;
    }
    task.version += 1;
    task.updatedBy = {
      userId: user.userId,
      displayName: user.displayName,
      userColor: user.userColor,
    };
    task.updatedAt = now;

    return task;
  }

  /**
   * Deletes a task from the room
   */
  deleteTask(roomId, taskId) {
    const room = this.rooms.get(roomId);
    if (!room) return false;
    return room.tasks.delete(taskId);
  }

  /**
   * Retrieves all tasks in a room sorted by position
   */
  getRoomTasks(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return [];
    return Array.from(room.tasks.values()).sort((a, b) => a.position - b.position);
  }

  getStats() {
    let totalTasks = 0;
    for (const room of this.rooms.values()) {
      totalTasks += room.tasks.size;
    }
    return {
      activeRooms: this.rooms.size,
      connectedSockets: this.socketToRooms.size,
      totalTasks,
    };
  }
}

export const roomManager = new RoomManager();

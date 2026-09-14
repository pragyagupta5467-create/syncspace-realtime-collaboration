import { Room } from '../models/Room.js';
import { Task } from '../models/Task.js';
import { Activity } from '../models/Activity.js';
import { Notification } from '../models/Notification.js';
import { isDBConnected } from '../config/db.js';

// In-memory fallback cache only if DB connection is initializing/offline
const memoryRooms = new Map();
const memoryTasks = new Map();
const memoryActivities = [];
const memoryNotifications = [];

/**
 * Format task document into clean frontend object
 */
export function sanitizeTask(doc) {
  if (!doc) return null;
  return {
    id: doc.taskId || doc.id,
    taskId: doc.taskId || doc.id,
    roomId: doc.roomId,
    title: doc.title,
    description: doc.description || '',
    status: doc.status || 'TODO',
    priority: doc.priority || 'MEDIUM',
    position: doc.position || 0,
    version: doc.version || 1,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    assignedTo: doc.assignedTo || null,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt,
  };
}

/**
 * Check if a room exists
 */
export async function findRoom(roomId) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId) return null;

  if (isDBConnected()) {
    try {
      const room = await Room.findOne({ roomId: cleanRoomId }).lean();
      return room;
    } catch (err) {
      console.error('[dbService.findRoom error]:', err.message);
    }
  }

  return memoryRooms.get(cleanRoomId) || null;
}

/**
 * Create a new room in MongoDB
 */
export async function createRoom(roomId, user) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId) throw new Error('Valid Room ID is required');

  const roomData = {
    roomId: cleanRoomId,
    name: cleanRoomId,
    createdBy: {
      userId: user?.userId || 'anonymous',
      displayName: user?.displayName || 'Anonymous',
      userColor: user?.userColor || '#6366f1',
    },
  };

  if (isDBConnected()) {
    try {
      const room = await Room.findOneAndUpdate(
        { roomId: cleanRoomId },
        { $setOnInsert: roomData },
        { upsert: true, new: true, lean: true }
      );
      return room;
    } catch (err) {
      console.error('[dbService.createRoom error]:', err.message);
      throw err;
    }
  }

  if (!memoryRooms.has(cleanRoomId)) {
    const doc = { ...roomData, createdAt: new Date(), updatedAt: new Date() };
    memoryRooms.set(cleanRoomId, doc);
  }
  return memoryRooms.get(cleanRoomId);
}

/**
 * Get rooms created by or associated with a specific user
 */
export async function getUserRooms(userId) {
  if (!userId) return [];

  if (isDBConnected()) {
    try {
      const rooms = await Room.find({ 'createdBy.userId': userId })
        .sort({ updatedAt: -1 })
        .limit(20)
        .lean();
      return rooms;
    } catch (err) {
      console.error('[dbService.getUserRooms error]:', err.message);
    }
  }

  return Array.from(memoryRooms.values()).filter((r) => r.createdBy?.userId === userId);
}


/**
 * Get all tasks for a room from MongoDB
 */
export async function getRoomTasks(roomId) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId) return [];

  if (isDBConnected()) {
    try {
      const docs = await Task.find({ roomId: cleanRoomId })
        .sort({ position: 1, createdAt: 1 })
        .lean();
      return docs.map(sanitizeTask);
    } catch (err) {
      console.error('[dbService.getRoomTasks error]:', err.message);
    }
  }

  const roomTasks = Array.from(memoryTasks.values())
    .filter((t) => t.roomId === cleanRoomId)
    .sort((a, b) => a.position - b.position);

  return roomTasks.map(sanitizeTask);
}

/**
 * Create and persist a new task in MongoDB
 */
export async function createTask(roomId, taskData, user) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId) throw new Error('Room ID is required');

  if (!taskData?.title || typeof taskData.title !== 'string' || taskData.title.trim().length === 0) {
    throw new Error('Task title cannot be empty');
  }

  const taskId = taskData.id || `task_${Math.random().toString(36).substring(2, 9)}`;
  const status = ['TODO', 'IN_PROGRESS', 'DONE'].includes(taskData.status) ? taskData.status : 'TODO';
  const priority = ['LOW', 'MEDIUM', 'HIGH'].includes(taskData.priority) ? taskData.priority : 'MEDIUM';

  const userRef = {
    userId: user?.userId || 'anonymous',
    displayName: user?.displayName || 'Anonymous',
    userColor: user?.userColor || '#6366f1',
  };

  const existingTasks = await getRoomTasks(cleanRoomId);
  const position = typeof taskData.position === 'number'
    ? taskData.position
    : existingTasks.filter((t) => t.status === status).length;

  const doc = {
    taskId,
    roomId: cleanRoomId,
    title: taskData.title.trim().slice(0, 140),
    description: (taskData.description || '').trim().slice(0, 800),
    status,
    priority,
    position,
    version: 1,
    createdBy: userRef,
    updatedBy: userRef,
    assignedTo: taskData.assignedTo || null,
  };

  if (isDBConnected()) {
    const created = await Task.create(doc);
    return sanitizeTask(created.toObject());
  }

  const cached = { ...doc, id: taskId, createdAt: new Date(), updatedAt: new Date() };
  memoryTasks.set(taskId, cached);
  return sanitizeTask(cached);
}

/**
 * Update a task with Optimistic Concurrency Control (OCC)
 * If expectedVersion is specified and does not match current version, returns conflict.
 * 
 * @param {string} roomId 
 * @param {string} taskId 
 * @param {object} updates 
 * @param {object} user 
 * @param {number} [expectedVersion] 
 * @returns {Promise<{ conflict: boolean, task?: object, currentTask?: object, expectedVersion?: number, currentVersion?: number, updatedBy?: object, updatedAt?: string }>}
 */
export async function updateTask(roomId, taskId, updates, user, expectedVersion) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId || !taskId) throw new Error('Room ID and Task ID are required');

  const userRef = {
    userId: user?.userId || 'anonymous',
    displayName: user?.displayName || 'Anonymous',
    userColor: user?.userColor || '#6366f1',
  };

  const updateFields = {
    updatedBy: userRef,
    updatedAt: new Date(),
  };

  if (typeof updates.title === 'string' && updates.title.trim().length > 0) {
    updateFields.title = updates.title.trim().slice(0, 140);
  }
  if (typeof updates.description === 'string') {
    updateFields.description = updates.description.trim().slice(0, 800);
  }
  if (['LOW', 'MEDIUM', 'HIGH'].includes(updates.priority)) {
    updateFields.priority = updates.priority;
  }
  if (['TODO', 'IN_PROGRESS', 'DONE'].includes(updates.status)) {
    updateFields.status = updates.status;
  }
  if (typeof updates.position === 'number') {
    updateFields.position = updates.position;
  }
  if (updates.assignedTo !== undefined) {
    updateFields.assignedTo = updates.assignedTo;
  }

  // --- DATABASE PATH ---
  if (isDBConnected()) {
    const currentDoc = await Task.findOne({ taskId, roomId: cleanRoomId }).lean();
    if (!currentDoc) {
      return { conflict: false, notFound: true, task: null };
    }

    // Check expectedVersion for Optimistic Concurrency Control
    if (typeof expectedVersion === 'number' && currentDoc.version !== expectedVersion) {
      return {
        conflict: true,
        currentTask: sanitizeTask(currentDoc),
        expectedVersion,
        currentVersion: currentDoc.version,
        updatedBy: currentDoc.updatedBy,
        updatedAt: currentDoc.updatedAt instanceof Date ? currentDoc.updatedAt.toISOString() : currentDoc.updatedAt,
      };
    }

    // Version matches -> execute update
    const updated = await Task.findOneAndUpdate(
      { taskId, roomId: cleanRoomId, version: currentDoc.version },
      {
        $set: updateFields,
        $inc: { version: 1 },
      },
      { new: true, lean: true }
    );

    if (!updated) {
      // Rare race condition during findOneAndUpdate: re-read and report conflict
      const reRead = await Task.findOne({ taskId, roomId: cleanRoomId }).lean();
      return {
        conflict: true,
        currentTask: sanitizeTask(reRead),
        expectedVersion,
        currentVersion: reRead?.version,
        updatedBy: reRead?.updatedBy,
        updatedAt: reRead?.updatedAt,
      };
    }

    return { conflict: false, task: sanitizeTask(updated) };
  }

  // --- FALLBACK IN-MEMORY PATH ---
  const existing = memoryTasks.get(taskId);
  if (!existing || existing.roomId !== cleanRoomId) {
    return { conflict: false, notFound: true, task: null };
  }

  if (typeof expectedVersion === 'number' && existing.version !== expectedVersion) {
    return {
      conflict: true,
      currentTask: sanitizeTask(existing),
      expectedVersion,
      currentVersion: existing.version,
      updatedBy: existing.updatedBy,
      updatedAt: existing.updatedAt instanceof Date ? existing.updatedAt.toISOString() : existing.updatedAt,
    };
  }

  const nextVersion = (existing.version || 1) + 1;
  const updatedDoc = {
    ...existing,
    ...updateFields,
    version: nextVersion,
  };
  memoryTasks.set(taskId, updatedDoc);
  return { conflict: false, task: sanitizeTask(updatedDoc) };
}

/**
 * Move a task status/position in MongoDB with optional expectedVersion
 */
export async function moveTask(roomId, taskId, newStatus, newPosition, user, expectedVersion) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId || !taskId) throw new Error('Room ID and Task ID are required');

  if (!['TODO', 'IN_PROGRESS', 'DONE'].includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }

  return updateTask(
    cleanRoomId,
    taskId,
    {
      status: newStatus,
      position: typeof newPosition === 'number' ? newPosition : undefined,
    },
    user,
    expectedVersion
  );
}

/**
 * Delete a task from MongoDB
 */
export async function deleteTask(roomId, taskId) {
  const cleanRoomId = roomId?.trim()?.toUpperCase();
  if (!cleanRoomId || !taskId) return false;

  if (isDBConnected()) {
    const res = await Task.findOneAndDelete({ taskId, roomId: cleanRoomId });
    return !!res;
  }

  const existing = memoryTasks.get(taskId);
  if (existing && existing.roomId === cleanRoomId) {
    return memoryTasks.delete(taskId);
  }
  return false;
}

/**
  * Format activity document into clean frontend object
  */
export function sanitizeActivity(doc) {
  if (!doc) return null;
  return {
    activityId: doc.activityId || doc.id || doc._id?.toString(),
    id: doc.activityId || doc.id || doc._id?.toString(),
    roomId: doc.roomId,
    userId: doc.userId,
    userName: doc.userName || doc.displayName || 'Anonymous',
    userColor: doc.userColor || '#6366f1',
    type: doc.type,
    taskId: doc.taskId || null,
    taskTitle: doc.taskTitle || null,
    metadata: doc.metadata || {},
    timestamp: doc.timestamp instanceof Date ? doc.timestamp.toISOString() : (doc.timestamp || new Date().toISOString()),
  };
}

/**
 * Record a real collaboration event in the database
 * Gracefully catches errors so activity recording never breaks core operations.
 * 
 * @param {string} roomId 
 * @param {object} activityData 
 * @returns {Promise<object|null>}
 */
export async function createActivity(roomId, activityData) {
  try {
    const cleanRoomId = roomId?.trim()?.toUpperCase();
    if (!cleanRoomId || !activityData?.type) return null;

    const activityId = activityData.activityId || `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const timestamp = activityData.timestamp ? new Date(activityData.timestamp) : new Date();

    const doc = {
      activityId,
      roomId: cleanRoomId,
      userId: activityData.userId || 'anonymous',
      userName: activityData.userName || activityData.displayName || 'Anonymous',
      userColor: activityData.userColor || '#6366f1',
      type: activityData.type,
      taskId: activityData.taskId || null,
      taskTitle: activityData.taskTitle || null,
      metadata: activityData.metadata || {},
      timestamp,
    };

    if (isDBConnected()) {
      const created = await Activity.create(doc);
      return sanitizeActivity(created.toObject());
    }

    memoryActivities.push(doc);
    if (memoryActivities.length > 500) memoryActivities.shift();
    return sanitizeActivity(doc);
  } catch (err) {
    console.error('[dbService.createActivity error]:', err.message);
    return null;
  }
}

/**
 * Get recent real activities for a room (sorted newest first, max 50 by default)
 * 
 * @param {string} roomId 
 * @param {number} [limit=50] 
 * @returns {Promise<Array>}
 */
export async function getRoomActivities(roomId, limit = 50) {
  try {
    const cleanRoomId = roomId?.trim()?.toUpperCase();
    if (!cleanRoomId) return [];

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);

    if (isDBConnected()) {
      const docs = await Activity.find({ roomId: cleanRoomId })
        .sort({ timestamp: -1 })
        .limit(safeLimit)
        .lean();
      return docs.map(sanitizeActivity);
    }

    return memoryActivities
      .filter((a) => a.roomId === cleanRoomId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, safeLimit)
      .map(sanitizeActivity);
  } catch (err) {
    console.error('[dbService.getRoomActivities error]:', err.message);
    return [];
  }
}

/**
 * Get chronological replay activities for a room (sorted oldest to newest ASC, max 500)
 * Excludes ephemeral cursor moves and loads authentic collaboration events only.
 * 
 * @param {string} roomId 
 * @param {number} [limit=500] 
 * @returns {Promise<Array>}
 */
export async function getReplayActivities(roomId, limit = 500) {
  try {
    const cleanRoomId = roomId?.trim()?.toUpperCase();
    if (!cleanRoomId) return [];

    const safeLimit = Math.min(Math.max(Number(limit) || 500, 1), 1000);

    if (isDBConnected()) {
      const docs = await Activity.find({ roomId: cleanRoomId })
        .sort({ timestamp: 1 })
        .limit(safeLimit)
        .lean();
      return docs.map(sanitizeActivity);
    }

    return memoryActivities
      .filter((a) => a.roomId === cleanRoomId)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .slice(0, safeLimit)
      .map(sanitizeActivity);
  } catch (err) {
    console.error('[dbService.getReplayActivities error]:', err.message);
    return [];
  }
}

// ==========================================
// NOTIFICATIONS SYSTEM DB METHODS
// ==========================================

export function sanitizeNotification(doc) {
  if (!doc) return null;
  return {
    notificationId: doc.notificationId || doc.id || doc._id?.toString(),
    id: doc.notificationId || doc.id || doc._id?.toString(),
    recipientId: doc.recipientId,
    actorId: doc.actorId,
    actorName: doc.actorName,
    roomId: doc.roomId,
    type: doc.type,
    message: doc.message,
    taskId: doc.taskId || null,
    taskTitle: doc.taskTitle || null,
    isRead: Boolean(doc.isRead),
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : (doc.createdAt || new Date().toISOString()),
  };
}

/**
 * Create a new notification for a specific user in MongoDB
 */
export async function createNotification(notificationData) {
  try {
    if (!notificationData?.recipientId || !notificationData?.message || !notificationData?.type) {
      return null;
    }

    const notificationId = notificationData.notificationId || `notif_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    const createdAt = notificationData.createdAt ? new Date(notificationData.createdAt) : new Date();

    const doc = {
      notificationId,
      recipientId: notificationData.recipientId,
      actorId: notificationData.actorId || 'system',
      actorName: notificationData.actorName || 'SyncSpace',
      roomId: notificationData.roomId || 'GLOBAL',
      type: notificationData.type,
      message: notificationData.message,
      taskId: notificationData.taskId || null,
      taskTitle: notificationData.taskTitle || null,
      isRead: false,
      createdAt,
    };

    if (isDBConnected()) {
      const created = await Notification.create(doc);
      return sanitizeNotification(created.toObject());
    }

    memoryNotifications.unshift(doc);
    if (memoryNotifications.length > 500) memoryNotifications.pop();
    return sanitizeNotification(doc);
  } catch (err) {
    console.error('[dbService.createNotification error]:', err.message);
    return null;
  }
}

/**
 * Get notifications for a user (newest first, limit ~30) along with unreadCount
 */
export async function getUserNotifications(userId, limit = 30) {
  try {
    if (!userId) return { notifications: [], unreadCount: 0 };

    const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);

    if (isDBConnected()) {
      const [docs, unreadCount] = await Promise.all([
        Notification.find({ recipientId: userId })
          .sort({ createdAt: -1 })
          .limit(safeLimit)
          .lean(),
        Notification.countDocuments({ recipientId: userId, isRead: false }),
      ]);

      return {
        notifications: docs.map(sanitizeNotification),
        unreadCount,
      };
    }

    const userNotifs = memoryNotifications
      .filter((n) => n.recipientId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const unreadCount = userNotifs.filter((n) => !n.isRead).length;

    return {
      notifications: userNotifs.slice(0, safeLimit).map(sanitizeNotification),
      unreadCount,
    };
  } catch (err) {
    console.error('[dbService.getUserNotifications error]:', err.message);
    return { notifications: [], unreadCount: 0 };
  }
}

/**
 * Mark a single notification as read for a specific user
 */
export async function markNotificationAsRead(notificationId, userId) {
  try {
    if (!notificationId || !userId) return false;

    if (isDBConnected()) {
      const res = await Notification.findOneAndUpdate(
        { notificationId, recipientId: userId },
        { $set: { isRead: true } },
        { new: true }
      );
      return !!res;
    }

    const found = memoryNotifications.find((n) => n.notificationId === notificationId && n.recipientId === userId);
    if (found) {
      found.isRead = true;
      return true;
    }
    return false;
  } catch (err) {
    console.error('[dbService.markNotificationAsRead error]:', err.message);
    return false;
  }
}

/**
 * Mark all notifications as read for a specific user
 */
export async function markAllNotificationsAsRead(userId) {
  try {
    if (!userId) return 0;

    if (isDBConnected()) {
      const res = await Notification.updateMany(
        { recipientId: userId, isRead: false },
        { $set: { isRead: true } }
      );
      return res.modifiedCount || 0;
    }

    let modified = 0;
    for (const n of memoryNotifications) {
      if (n.recipientId === userId && !n.isRead) {
        n.isRead = true;
        modified++;
      }
    }
    return modified;
  } catch (err) {
    console.error('[dbService.markAllNotificationsAsRead error]:', err.message);
    return 0;
  }
}


import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { roomManager } from '../services/roomManager.js';
import { callManager } from '../services/callManager.js';
import { 
  findRoom, 
  createRoom, 
  getRoomTasks, 
  createTask, 
  updateTask, 
  moveTask, 
  deleteTask,
  createActivity,
  getRoomActivities,
  createNotification
} from '../services/dbService.js';
import {
  validateRoomId,
  validateUser,
  validateCreateTaskPayload,
  validateUpdateTaskPayload,
  validateMoveTaskPayload,
  createErrorResponse,
  ERROR_CODES
} from '../utils/validation.js';
import { socketRateLimiter } from '../utils/rateLimiter.js';

/**
 * Socket.IO Events Handler for SyncSpace
 * Production-hardened with input validation, strict room-level access control,
 * rate limiting, OCC conflict detection, and ephemeral spotlight/cursor handling.
 * 
 * @param {import('socket.io').Server} io 
 */
export function setupSocketHandlers(io) {
  // Socket.IO authentication middleware
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwtSecret);
          if (decoded && decoded.userId) {
            socket.authenticatedUser = {
              userId: decoded.userId,
              displayName: decoded.name,
              email: decoded.email,
              userColor: decoded.userColor || '#6366f1',
            };
          }
        } catch (tokenErr) {
          console.warn('[Socket.IO Auth] Invalid or expired token on connection');
        }
      }
      next();
    } catch (err) {
      next();
    }
  });

  io.on('connection', (socket) => {
    console.log(`[Socket Connected] ID: ${socket.id} | Authenticated: ${!!socket.authenticatedUser} | Transport: ${socket.conn.transport.name}`);

    // Automatically join user-specific notification channel if socket is authenticated
    if (socket.authenticatedUser?.userId) {
      const userChannel = `user:${socket.authenticatedUser.userId}`;
      socket.join(userChannel);
      console.log(`[Socket Auth] Socket ${socket.id} joined private channel ${userChannel}`);
    }

    /**
     * CLIENT -> SERVER: subscribe-notifications
     * Allows client to subscribe to personal notification channel explicitly
     */
    socket.on('subscribe-notifications', (payload, callback) => {
      try {
        const userId = payload?.userId || socket.authenticatedUser?.userId;
        if (userId) {
          const userChannel = `user:${userId}`;
          socket.join(userChannel);
          if (callback) callback({ success: true, channel: userChannel });
        } else {
          if (callback) callback({ success: false, error: 'User ID missing' });
        }
      } catch (err) {
        if (callback) callback({ success: false, error: err.message });
      }
    });

    /**
     * CLIENT -> SERVER: join-room
     */
    socket.on('join-room', async (payload, callback) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'join-room', 10, 5000)) {
          const errRes = createErrorResponse(ERROR_CODES.RATE_LIMITED, 'Too many room join requests. Please wait.');
          if (callback) callback(errRes);
          return;
        }

        if (!payload || typeof payload !== 'object') {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_PAYLOAD, 'Invalid join-room payload');
          if (callback) callback(errRes);
          return;
        }

        const roomVal = validateRoomId(payload.roomId);
        if (!roomVal.valid) {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error);
          if (callback) callback(errRes);
          return;
        }
        const cleanRoomId = roomVal.value;

        // Use authenticated server-verified identity if available, otherwise validate client payload
        let cleanUser;
        if (socket.authenticatedUser) {
          cleanUser = {
            userId: socket.authenticatedUser.userId,
            displayName: socket.authenticatedUser.displayName,
            userColor: socket.authenticatedUser.userColor,
            email: socket.authenticatedUser.email,
          };
        } else {
          const userVal = validateUser(payload.user);
          if (!userVal.valid) {
            const errRes = createErrorResponse(ERROR_CODES.INVALID_USER, userVal.error);
            if (callback) callback(errRes);
            return;
          }
          cleanUser = userVal.value;
        }


        // Check if room exists in MongoDB (or autoCreate if enabled)
        let room = await findRoom(cleanRoomId);
        if (!room) {
          if (payload.autoCreate) {
            room = await createRoom(cleanRoomId, cleanUser);
          } else {
            const errRes = createErrorResponse(
              ERROR_CODES.ROOM_NOT_FOUND,
              `Room "${cleanRoomId}" does not exist in database. Please check the Room ID or create a new room.`
            );
            if (callback) callback(errRes);
            return;
          }
        }

        // Join Socket.IO room channel and personal user channel
        socket.join(cleanRoomId);
        socket.join(`user:${cleanUser.userId}`);

        // Register user in active presence registry
        const registeredUser = roomManager.addUser(cleanRoomId, socket.id, cleanUser);

        // Load real persisted tasks and recent activities from MongoDB
        const persistedTasks = await getRoomTasks(cleanRoomId);
        const persistedActivities = await getRoomActivities(cleanRoomId, 50);
        const roomUsers = roomManager.getRoomUsers(cleanRoomId);

        console.log(`[Room Join] User "${cleanUser.displayName}" joined "${cleanRoomId}". Real users: ${roomUsers.length}, DB tasks: ${persistedTasks.length}, DB activities: ${persistedActivities.length}`);

        // Broadcast to existing room members
        socket.to(cleanRoomId).emit('user-joined', {
          user: registeredUser,
        });

        // Broadcast updated presence list
        io.to(cleanRoomId).emit('room-users', {
          roomId: cleanRoomId,
          users: roomUsers,
        });

        // Send real-time notification to all other real room members
        const otherUsers = roomUsers.filter((u) => u.userId !== cleanUser.userId);
        for (const other of otherUsers) {
          createNotification({
            recipientId: other.userId,
            actorId: cleanUser.userId,
            actorName: cleanUser.displayName,
            roomId: cleanRoomId,
            type: 'USER_JOINED',
            message: `${cleanUser.displayName} joined the workspace`,
          }).then((notif) => {
            if (notif) {
              io.to(`user:${other.userId}`).emit('notification-created', notif);
            }
          }).catch((err) => console.error('[Notification error]:', err.message));
        }

        // Record and broadcast USER_JOINED activity
        const joinActivity = await createActivity(cleanRoomId, {
          userId: cleanUser.userId,
          userName: cleanUser.displayName,
          userColor: cleanUser.userColor,
          type: 'USER_JOINED',
          metadata: { usersCount: roomUsers.length },
        });

        if (joinActivity) {
          io.to(cleanRoomId).emit('activity-created', {
            roomId: cleanRoomId,
            activity: joinActivity,
          });
          persistedActivities.unshift(joinActivity);
        }

        // Send full real room state to joining socket
        socket.emit('room-joined', {
          roomId: cleanRoomId,
          user: registeredUser,
          users: roomUsers,
          tasks: persistedTasks,
          activities: persistedActivities,
        });

        socket.emit('room-state', {
          roomId: cleanRoomId,
          tasks: persistedTasks,
          activities: persistedActivities,
        });

        if (callback) {
          callback({
            success: true,
            roomId: cleanRoomId,
            user: registeredUser,
            users: roomUsers,
            tasks: persistedTasks,
            activities: persistedActivities,
          });
        }
      } catch (err) {
        console.error('[Socket join-room Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Error joining room'));
      }
    });

    /**
     * CLIENT -> SERVER: task-create
     */
    socket.on('task-create', async (payload, callback) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'task-mutation', 20, 5000)) {
          const errRes = createErrorResponse(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded for task modifications');
          if (callback) callback(errRes);
          return;
        }

        if (!payload || typeof payload !== 'object') {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_PAYLOAD, 'Invalid task-create payload');
          if (callback) callback(errRes);
          return;
        }

        const roomVal = validateRoomId(payload.roomId);
        if (!roomVal.valid || !socket.rooms.has(roomVal.value)) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'Unauthorized: You are not in this room');
          if (callback) callback(errRes);
          return;
        }
        const roomId = roomVal.value;

        const user = roomManager.getUserInRoom(roomId, socket.id);
        if (!user) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'User is not registered in this room');
          if (callback) callback(errRes);
          return;
        }

        const taskVal = validateCreateTaskPayload(payload.task || payload);
        if (!taskVal.valid) {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_TASK, taskVal.error);
          if (callback) callback(errRes);
          return;
        }

        // Persist to MongoDB
        const persistedTask = await createTask(roomId, taskVal.value, user);

        console.log(`[DB Task Created] "${persistedTask.title}" (${persistedTask.id}) by ${user.displayName} in ${roomId}`);

        // Broadcast task creation ONLY after successful database write
        io.to(roomId).emit('task-created', {
          roomId,
          task: persistedTask,
        });

        // Record and broadcast TASK_CREATED activity
        const taskActivity = await createActivity(roomId, {
          userId: user.userId,
          userName: user.displayName,
          userColor: user.userColor,
          type: 'TASK_CREATED',
          taskId: persistedTask.id,
          taskTitle: persistedTask.title,
          metadata: {
            priority: persistedTask.priority,
            status: persistedTask.status,
          },
        });

        if (taskActivity) {
          io.to(roomId).emit('activity-created', {
            roomId,
            activity: taskActivity,
          });
        }

        // Send TASK_ASSIGNED notification if assigned to another user
        if (persistedTask.assignedTo?.userId && persistedTask.assignedTo.userId !== user.userId) {
          createNotification({
            recipientId: persistedTask.assignedTo.userId,
            actorId: user.userId,
            actorName: user.displayName,
            roomId,
            type: 'TASK_ASSIGNED',
            message: `${user.displayName} assigned you a task: ${persistedTask.title}`,
            taskId: persistedTask.id,
            taskTitle: persistedTask.title,
          }).then((notif) => {
            if (notif) {
              io.to(`user:${persistedTask.assignedTo.userId}`).emit('notification-created', notif);
            }
          }).catch((err) => console.error('[Notification error]:', err.message));
        }

        if (callback) {
          callback({ success: true, task: persistedTask });
        }
      } catch (err) {
        console.error('[Socket task-create Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Database task creation failed'));
      }
    });

    /**
     * CLIENT -> SERVER: task-update (with OCC)
     */
    socket.on('task-update', async (payload, callback) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'task-mutation', 20, 5000)) {
          const errRes = createErrorResponse(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded for task updates');
          if (callback) callback(errRes);
          return;
        }

        if (!payload || typeof payload !== 'object') {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_PAYLOAD, 'Invalid task-update payload');
          if (callback) callback(errRes);
          return;
        }

        const roomVal = validateRoomId(payload.roomId);
        if (!roomVal.valid || !socket.rooms.has(roomVal.value)) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'Unauthorized: You are not in this room');
          if (callback) callback(errRes);
          return;
        }
        const roomId = roomVal.value;

        const user = roomManager.getUserInRoom(roomId, socket.id);
        if (!user) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'User not found in room');
          if (callback) callback(errRes);
          return;
        }

        const updateVal = validateUpdateTaskPayload(payload);
        if (!updateVal.valid) {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_TASK, updateVal.error);
          if (callback) callback(errRes);
          return;
        }

        const { taskId, updates, expectedVersion } = updateVal.value;

        // Execute update with OCC version check
        const result = await updateTask(roomId, taskId, updates, user, expectedVersion);

        if (result.notFound) {
          const errRes = createErrorResponse(ERROR_CODES.TASK_NOT_FOUND, 'Task not found in this room');
          if (callback) callback(errRes);
          return;
        }

        // OCC CONFLICT DETECTED
        if (result.conflict) {
          console.warn(`[OCC Conflict] Task ${taskId} in ${roomId}: expected v${result.expectedVersion}, but current is v${result.currentVersion} (updatedBy: ${result.updatedBy?.displayName})`);

          const conflictPayload = {
            taskId,
            code: 'VERSION_CONFLICT',
            attemptedChanges: updates,
            expectedVersion: result.expectedVersion,
            currentVersion: result.currentVersion,
            currentTask: result.currentTask,
            updatedBy: result.updatedBy,
            updatedAt: result.updatedAt,
          };

          // Record and broadcast TASK_CONFLICT activity
          const conflictActivity = await createActivity(roomId, {
            userId: user.userId,
            userName: user.displayName,
            userColor: user.userColor,
            type: 'TASK_CONFLICT',
            taskId,
            taskTitle: result.currentTask?.title || 'Untitled Task',
            metadata: {
              expectedVersion: result.expectedVersion,
              currentVersion: result.currentVersion,
              attemptedChanges: updates,
              conflictedWith: result.updatedBy?.displayName,
            },
          });

          if (conflictActivity) {
            io.to(roomId).emit('activity-created', {
              roomId,
              activity: conflictActivity,
            });
          }

          // Trigger TASK_CONFLICT notification for the affected user
          createNotification({
            recipientId: user.userId,
            actorId: result.updatedBy?.userId || 'system',
            actorName: result.updatedBy?.displayName || 'Collaborator',
            roomId,
            type: 'TASK_CONFLICT',
            message: `Conflict detected on task: ${result.currentTask?.title || 'Untitled Task'}`,
            taskId,
            taskTitle: result.currentTask?.title || 'Untitled Task',
          }).then((notif) => {
            if (notif) io.to(`user:${user.userId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));

          socket.emit('task-conflict', conflictPayload);

          if (callback) {
            callback({
              success: false,
              conflict: true,
              code: 'VERSION_CONFLICT',
              error: {
                code: ERROR_CODES.TASK_VERSION_CONFLICT,
                message: `Edit Conflict: This task was modified by ${result.updatedBy?.displayName || 'another collaborator'} while you were editing it.`,
              },
              ...conflictPayload,
            });
          }
          return;
        }

        console.log(`[DB Task Updated] ID ${taskId} (v${result.task.version}) by ${user.displayName} in ${roomId}`);

        // Broadcast authoritative update to all room members
        io.to(roomId).emit('task-updated', {
          roomId,
          task: result.task,
        });

        // Record and broadcast TASK_UPDATED activity
        const updateActivity = await createActivity(roomId, {
          userId: user.userId,
          userName: user.displayName,
          userColor: user.userColor,
          type: 'TASK_UPDATED',
          taskId: result.task.id,
          taskTitle: result.task.title,
          metadata: {
            updates,
            version: result.task.version,
          },
        });

        if (updateActivity) {
          io.to(roomId).emit('activity-created', {
            roomId,
            activity: updateActivity,
          });
        }

        // Trigger real notifications for assignment, update, or completion
        const wasAssigned = updates.assignedTo && updates.assignedTo.userId && updates.assignedTo.userId !== user.userId;
        const isDone = result.task.status === 'DONE';
        const notifiedUsers = new Set();

        if (wasAssigned) {
          createNotification({
            recipientId: updates.assignedTo.userId,
            actorId: user.userId,
            actorName: user.displayName,
            roomId,
            type: 'TASK_ASSIGNED',
            message: `${user.displayName} assigned you a task: ${result.task.title}`,
            taskId: result.task.id,
            taskTitle: result.task.title,
          }).then((notif) => {
            if (notif) io.to(`user:${updates.assignedTo.userId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));
          notifiedUsers.add(updates.assignedTo.userId);
        }

        const creatorId = result.task.createdBy?.userId;
        const assigneeId = result.task.assignedTo?.userId;

        if (creatorId && creatorId !== user.userId && !notifiedUsers.has(creatorId)) {
          const notifType = isDone ? 'TASK_COMPLETED' : 'TASK_UPDATED';
          const notifMsg = isDone 
            ? `${user.displayName} completed: ${result.task.title}`
            : `${user.displayName} updated task: ${result.task.title}`;
          createNotification({
            recipientId: creatorId,
            actorId: user.userId,
            actorName: user.displayName,
            roomId,
            type: notifType,
            message: notifMsg,
            taskId: result.task.id,
            taskTitle: result.task.title,
          }).then((notif) => {
            if (notif) io.to(`user:${creatorId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));
          notifiedUsers.add(creatorId);
        }

        if (assigneeId && assigneeId !== user.userId && !notifiedUsers.has(assigneeId)) {
          const notifType = isDone ? 'TASK_COMPLETED' : 'TASK_UPDATED';
          const notifMsg = isDone 
            ? `${user.displayName} completed: ${result.task.title}`
            : `${user.displayName} updated task: ${result.task.title}`;
          createNotification({
            recipientId: assigneeId,
            actorId: user.userId,
            actorName: user.displayName,
            roomId,
            type: notifType,
            message: notifMsg,
            taskId: result.task.id,
            taskTitle: result.task.title,
          }).then((notif) => {
            if (notif) io.to(`user:${assigneeId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));
        }

        if (callback) {
          callback({ success: true, task: result.task });
        }
      } catch (err) {
        console.error('[Socket task-update Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Database update failed'));
      }
    });

    /**
     * CLIENT -> SERVER: task-move (with OCC)
     */
    socket.on('task-move', async (payload, callback) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'task-mutation', 20, 5000)) {
          const errRes = createErrorResponse(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded for task moves');
          if (callback) callback(errRes);
          return;
        }

        if (!payload || typeof payload !== 'object') {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_PAYLOAD, 'Invalid task-move payload');
          if (callback) callback(errRes);
          return;
        }

        const roomVal = validateRoomId(payload.roomId);
        if (!roomVal.valid || !socket.rooms.has(roomVal.value)) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'Unauthorized: You are not in this room');
          if (callback) callback(errRes);
          return;
        }
        const roomId = roomVal.value;

        const user = roomManager.getUserInRoom(roomId, socket.id);
        if (!user) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'User not found in room');
          if (callback) callback(errRes);
          return;
        }

        const moveVal = validateMoveTaskPayload(payload);
        if (!moveVal.valid) {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_TASK, moveVal.error);
          if (callback) callback(errRes);
          return;
        }

        const { taskId, newStatus, newPosition, expectedVersion } = moveVal.value;
        const result = await moveTask(roomId, taskId, newStatus, newPosition, user, expectedVersion);

        if (result.notFound) {
          const errRes = createErrorResponse(ERROR_CODES.TASK_NOT_FOUND, 'Task not found in this room');
          if (callback) callback(errRes);
          return;
        }

        if (result.conflict) {
          const conflictPayload = {
            taskId,
            code: ERROR_CODES.TASK_VERSION_CONFLICT,
            attemptedChanges: { status: newStatus, position: newPosition },
            expectedVersion: result.expectedVersion,
            currentVersion: result.currentVersion,
            currentTask: result.currentTask,
            updatedBy: result.updatedBy,
            updatedAt: result.updatedAt,
          };

          const conflictActivity = await createActivity(roomId, {
            userId: user.userId,
            userName: user.displayName,
            userColor: user.userColor,
            type: 'TASK_CONFLICT',
            taskId,
            taskTitle: result.currentTask?.title || 'Untitled Task',
            metadata: {
              expectedVersion: result.expectedVersion,
              currentVersion: result.currentVersion,
              attemptedMove: { status: newStatus, position: newPosition },
            },
          });

          if (conflictActivity) {
            io.to(roomId).emit('activity-created', {
              roomId,
              activity: conflictActivity,
            });
          }

          // Trigger TASK_CONFLICT notification for the moving user
          createNotification({
            recipientId: user.userId,
            actorId: result.updatedBy?.userId || 'system',
            actorName: result.updatedBy?.displayName || 'Collaborator',
            roomId,
            type: 'TASK_CONFLICT',
            message: `Conflict detected on task move: ${result.currentTask?.title || 'Untitled Task'}`,
            taskId,
            taskTitle: result.currentTask?.title || 'Untitled Task',
          }).then((notif) => {
            if (notif) io.to(`user:${user.userId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));

          socket.emit('task-conflict', conflictPayload);

          if (callback) {
            callback({
              success: false,
              conflict: true,
              error: {
                code: ERROR_CODES.TASK_VERSION_CONFLICT,
                message: 'Conflict detected during task move',
              },
              ...conflictPayload,
            });
          }
          return;
        }

        console.log(`[DB Task Moved] ID ${taskId} -> ${newStatus} (v${result.task.version}) in ${roomId}`);

        io.to(roomId).emit('task-moved', {
          roomId,
          task: result.task,
        });

        // Record and broadcast single TASK_MOVED activity
        const moveActivity = await createActivity(roomId, {
          userId: user.userId,
          userName: user.displayName,
          userColor: user.userColor,
          type: 'TASK_MOVED',
          taskId: result.task.id,
          taskTitle: result.task.title,
          metadata: {
            newStatus,
            position: typeof newPosition === 'number' ? newPosition : undefined,
            version: result.task.version,
          },
        });

        if (moveActivity) {
          io.to(roomId).emit('activity-created', {
            roomId,
            activity: moveActivity,
          });
        }

        // Trigger real notifications if moved by collaborator or completed
        const isDone = newStatus === 'DONE';
        const creatorId = result.task.createdBy?.userId;
        const assigneeId = result.task.assignedTo?.userId;
        const notifiedMembers = new Set();

        if (creatorId && creatorId !== user.userId) {
          const notifType = isDone ? 'TASK_COMPLETED' : 'TASK_UPDATED';
          const notifMsg = isDone 
            ? `${user.displayName} completed: ${result.task.title}`
            : `${user.displayName} moved task to ${newStatus}: ${result.task.title}`;
          createNotification({
            recipientId: creatorId,
            actorId: user.userId,
            actorName: user.displayName,
            roomId,
            type: notifType,
            message: notifMsg,
            taskId: result.task.id,
            taskTitle: result.task.title,
          }).then((notif) => {
            if (notif) io.to(`user:${creatorId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));
          notifiedMembers.add(creatorId);
        }

        if (assigneeId && assigneeId !== user.userId && !notifiedMembers.has(assigneeId)) {
          const notifType = isDone ? 'TASK_COMPLETED' : 'TASK_UPDATED';
          const notifMsg = isDone 
            ? `${user.displayName} completed: ${result.task.title}`
            : `${user.displayName} moved task to ${newStatus}: ${result.task.title}`;
          createNotification({
            recipientId: assigneeId,
            actorId: user.userId,
            actorName: user.displayName,
            roomId,
            type: notifType,
            message: notifMsg,
            taskId: result.task.id,
            taskTitle: result.task.title,
          }).then((notif) => {
            if (notif) io.to(`user:${assigneeId}`).emit('notification-created', notif);
          }).catch((err) => console.error('[Notification error]:', err.message));
        }

        if (callback) {
          callback({ success: true, task: result.task });
        }
      } catch (err) {
        console.error('[Socket task-move Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Database move failed'));
      }
    });

    /**
     * CLIENT -> SERVER: task-delete
     */
    socket.on('task-delete', async (payload, callback) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'task-mutation', 20, 5000)) {
          const errRes = createErrorResponse(ERROR_CODES.RATE_LIMITED, 'Rate limit exceeded for task deletions');
          if (callback) callback(errRes);
          return;
        }

        if (!payload || typeof payload !== 'object') {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_PAYLOAD, 'Invalid task-delete payload');
          if (callback) callback(errRes);
          return;
        }

        const roomVal = validateRoomId(payload.roomId);
        if (!roomVal.valid || !socket.rooms.has(roomVal.value)) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'Unauthorized: You are not in this room');
          if (callback) callback(errRes);
          return;
        }
        const roomId = roomVal.value;

        const user = roomManager.getUserInRoom(roomId, socket.id);
        if (!user) {
          const errRes = createErrorResponse(ERROR_CODES.NOT_ROOM_MEMBER, 'User not found in room');
          if (callback) callback(errRes);
          return;
        }

        const { taskId } = payload;
        if (!taskId || typeof taskId !== 'string' || taskId.trim().length === 0) {
          const errRes = createErrorResponse(ERROR_CODES.INVALID_TASK, 'Task ID is required');
          if (callback) callback(errRes);
          return;
        }

        const deleted = await deleteTask(roomId, taskId.trim());
        if (!deleted) {
          const errRes = createErrorResponse(ERROR_CODES.TASK_NOT_FOUND, 'Task not found in database');
          if (callback) callback(errRes);
          return;
        }

        console.log(`[DB Task Deleted] ID ${taskId} from ${roomId}`);

        io.to(roomId).emit('task-deleted', {
          roomId,
          taskId: taskId.trim(),
        });

        // Record and broadcast TASK_DELETED activity
        const deleteActivity = await createActivity(roomId, {
          userId: user.userId,
          userName: user.displayName,
          userColor: user.userColor,
          type: 'TASK_DELETED',
          taskId: taskId.trim(),
        });

        if (deleteActivity) {
          io.to(roomId).emit('activity-created', {
            roomId,
            activity: deleteActivity,
          });
        }

        if (callback) callback({ success: true, taskId: taskId.trim() });
      } catch (err) {
        console.error('[Socket task-delete Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Database deletion failed'));
      }
    });

    /**
     * CLIENT -> SERVER: cursor-move (Ephemeral - rate limited at 60 events/sec)
     */
    socket.on('cursor-move', (data) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'cursor-move', 60, 1000)) {
          return; // Silently throttle excessive mouse flooding
        }

        if (!data || typeof data !== 'object') return;
        let roomId = data.roomId?.trim()?.toUpperCase();
        if (!roomId) {
          for (const r of socket.rooms) {
            if (r !== socket.id) {
              roomId = r;
              break;
            }
          }
        }
        if (!roomId || !socket.rooms.has(roomId)) return;

        const x = typeof data.x === 'number' ? Math.round(data.x * 10) / 10 : 0;
        const y = typeof data.y === 'number' ? Math.round(data.y * 10) / 10 : 0;
        const percentX = typeof data.percentX === 'number' ? Math.min(Math.max(data.percentX, 0), 1) : null;
        const percentY = typeof data.percentY === 'number' ? Math.min(Math.max(data.percentY, 0), 1) : null;

        const cursorPayload = {
          userId: data.userId || socket.id,
          displayName: data.displayName || 'Collaborator',
          userColor: data.userColor || '#6366f1',
          x,
          y,
          percentX,
          percentY,
          timestamp: Date.now(),
        };

        socket.to(roomId).volatile.emit('cursor-update', cursorPayload);
      } catch (err) {
        console.error('[Socket cursor-move Error]:', err.message);
      }
    });

    /**
     * CLIENT -> SERVER: cursor-leave
     */
    socket.on('cursor-leave', (data) => {
      try {
        let roomId = data?.roomId?.trim()?.toUpperCase();
        if (!roomId) {
          for (const r of socket.rooms) {
            if (r !== socket.id) {
              roomId = r;
              break;
            }
          }
        }
        if (!roomId || !socket.rooms.has(roomId)) return;

        socket.to(roomId).emit('cursor-inactive', {
          userId: data?.userId || socket.id,
        });
      } catch (err) {
        console.error('[Socket cursor-leave Error]:', err.message);
      }
    });

    /**
     * CLIENT -> SERVER: cursor-spotlight (Ephemeral real-time toggle)
     */
    socket.on('cursor-spotlight', (payload) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'spotlight', 10, 5000)) return;
        if (!payload || typeof payload !== 'object') return;

        let roomId = payload.roomId?.trim()?.toUpperCase();
        if (!roomId) {
          for (const r of socket.rooms) {
            if (r !== socket.id) {
              roomId = r;
              break;
            }
          }
        }
        if (!roomId || !socket.rooms.has(roomId)) return;

        const user = roomManager.getUserInRoom(roomId, socket.id);
        const userId = payload.userId || user?.userId || socket.id;
        const isSpotlight = Boolean(payload.active !== undefined ? payload.active : payload.isSpotlight);

        socket.to(roomId).emit('cursor-spotlight', {
          userId,
          isSpotlight,
          active: isSpotlight,
          roomId,
        });
      } catch (err) {
        console.error('[Socket cursor-spotlight Error]:', err.message);
      }
    });

    /**
     * ==========================================
     * WEBRTC AUDIO/VIDEO CALLING SIGNALING
     * ==========================================
     */

    /**
     * CLIENT -> SERVER: call-join
     */
    socket.on('call-join', (payload, callback) => {
      try {
        if (!socketRateLimiter.allow(socket.id, 'call-join', 10, 5000)) {
          if (callback) callback(createErrorResponse(ERROR_CODES.RATE_LIMITED, 'Too many call join requests.'));
          return;
        }

        const roomVal = validateRoomId(payload?.roomId);
        if (!roomVal.valid) {
          if (callback) callback(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
          return;
        }
        const roomId = roomVal.value;

        // Identity check: use authenticated user, or room member, or validated payload
        let user = socket.authenticatedUser || roomManager.getUserInRoom(roomId, socket.id);
        if (!user && payload?.user) {
          const userVal = validateUser(payload.user);
          if (userVal.valid) user = userVal.value;
        }

        if (!user) {
          user = {
            userId: socket.id,
            displayName: 'Collaborator',
            userColor: '#6366f1'
          };
        }

        const result = callManager.joinCall(roomId, socket.id, user, {
          isMuted: !!payload?.isMuted,
          isCameraOff: !!payload?.isCameraOff,
          isScreenSharing: !!payload?.isScreenSharing,
        });

        // Notify existing members in room call
        socket.to(roomId).emit('call-user-joined', {
          socketId: socket.id,
          user: result.self.user,
          isMuted: result.self.isMuted,
          isCameraOff: result.self.isCameraOff,
          isScreenSharing: result.self.isScreenSharing,
          joinedAt: result.self.joinedAt,
        });

        // Broadcast updated call status to entire room
        io.to(roomId).emit('call-status-changed', {
          roomId,
          active: true,
          participantCount: result.participantCount,
        });

        console.log(`[Call Join] User "${user.displayName}" (${socket.id}) joined call in room "${roomId}". Total participants: ${result.participantCount}`);

        if (callback) {
          callback({
            success: true,
            peers: result.existingParticipants,
            self: result.self,
            participantCount: result.participantCount,
          });
        }
      } catch (err) {
        console.error('[Socket call-join Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Failed to join call'));
      }
    });

    /**
     * CLIENT -> SERVER: call-signal (Relay WebRTC Offer/Answer/ICE Candidate)
     */
    socket.on('call-signal', (payload) => {
      try {
        if (!payload || !payload.to || !payload.signal) return;

        let user = socket.authenticatedUser;
        if (!user && payload.roomId) {
          user = roomManager.getUserInRoom(payload.roomId, socket.id);
        }
        if (!user) {
          user = {
            userId: socket.id,
            displayName: 'Collaborator',
            userColor: '#6366f1',
          };
        }

        // Direct relay to target peer
        io.to(payload.to).emit('call-signal', {
          from: socket.id,
          signal: payload.signal,
          user,
        });
      } catch (err) {
        console.error('[Socket call-signal Error]:', err.message);
      }
    });

    /**
     * CLIENT -> SERVER: call-state-update (Mute / Camera / Screen Share state sync)
     */
    socket.on('call-state-update', (payload) => {
      try {
        const roomVal = validateRoomId(payload?.roomId);
        if (!roomVal.valid) return;
        const roomId = roomVal.value;

        const updated = callManager.updateCallState(roomId, socket.id, {
          isMuted: payload?.isMuted,
          isCameraOff: payload?.isCameraOff,
          isScreenSharing: payload?.isScreenSharing,
        });

        if (updated) {
          socket.to(roomId).emit('call-state-updated', {
            socketId: socket.id,
            isMuted: updated.isMuted,
            isCameraOff: updated.isCameraOff,
            isScreenSharing: updated.isScreenSharing,
          });
        }
      } catch (err) {
        console.error('[Socket call-state-update Error]:', err.message);
      }
    });

    /**
     * CLIENT -> SERVER: call-leave
     */
    socket.on('call-leave', (payload, callback) => {
      try {
        const roomVal = validateRoomId(payload?.roomId);
        if (!roomVal.valid) {
          if (callback) callback(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
          return;
        }
        const roomId = roomVal.value;

        const result = callManager.leaveCall(roomId, socket.id);
        if (result) {
          console.log(`[Call Leave] Socket ${socket.id} left call in room "${roomId}". Remaining: ${result.participantCount}`);
          
          socket.to(roomId).emit('call-user-left', {
            socketId: socket.id,
            userId: result.removedParticipant?.user?.userId,
          });

          io.to(roomId).emit('call-status-changed', {
            roomId,
            active: result.participantCount > 0,
            participantCount: result.participantCount,
          });
        }

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('[Socket call-leave Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Error leaving call'));
      }
    });

    /**
     * CLIENT -> SERVER: call-status-query
     */
    socket.on('call-status-query', (payload, callback) => {
      try {
        const roomVal = validateRoomId(payload?.roomId);
        if (!roomVal.valid) {
          if (callback) callback(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
          return;
        }
        const status = callManager.getCallStatus(roomVal.value);
        if (callback) callback({ success: true, ...status });
      } catch (err) {
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Failed to query call status'));
      }
    });

    /**
     * CLIENT -> SERVER: leave-room
     */
    socket.on('leave-room', async (payload, callback) => {
      try {
        const roomId = payload?.roomId?.trim()?.toUpperCase();
        if (!roomId) return;

        // Clean up any call state for this socket
        const callLeaveRes = callManager.leaveCall(roomId, socket.id);
        if (callLeaveRes) {
          socket.to(roomId).emit('call-user-left', {
            socketId: socket.id,
            userId: callLeaveRes.removedParticipant?.user?.userId,
          });
          io.to(roomId).emit('call-status-changed', {
            roomId,
            active: callLeaveRes.participantCount > 0,
            participantCount: callLeaveRes.participantCount,
          });
        }

        const removedUser = roomManager.removeUser(roomId, socket.id);
        socket.leave(roomId);

        if (removedUser) {
          console.log(`[Room Leave] User "${removedUser.displayName}" left room "${roomId}"`);
          
          socket.to(roomId).emit('user-left', {
            userId: removedUser.userId,
            displayName: removedUser.displayName,
            socketId: socket.id,
          });

          socket.to(roomId).emit('cursor-inactive', {
            userId: removedUser.userId,
          });

          socket.to(roomId).emit('cursor-spotlight', {
            userId: removedUser.userId,
            active: false,
          });

          const remainingUsers = roomManager.getRoomUsers(roomId);
          io.to(roomId).emit('room-users', {
            roomId,
            users: remainingUsers,
          });

          // Record and broadcast USER_LEFT activity
          const leaveActivity = await createActivity(roomId, {
            userId: removedUser.userId,
            userName: removedUser.displayName,
            userColor: removedUser.userColor,
            type: 'USER_LEFT',
          });

          if (leaveActivity) {
            io.to(roomId).emit('activity-created', {
              roomId,
              activity: leaveActivity,
            });
          }
        }

        if (callback) callback({ success: true });
      } catch (err) {
        console.error('[Socket leave-room Error]:', err.message);
        if (callback) callback(createErrorResponse(ERROR_CODES.SERVER_ERROR, 'Error leaving room'));
      }
    });

    /**
     * Disconnect lifecycle
     */
    socket.on('disconnecting', async () => {
      // Clean up any active call session
      const callRemoval = callManager.removeSocket(socket.id);
      if (callRemoval) {
        io.to(callRemoval.roomId).emit('call-user-left', {
          socketId: socket.id,
          userId: callRemoval.removedParticipant?.user?.userId,
        });
        io.to(callRemoval.roomId).emit('call-status-changed', {
          roomId: callRemoval.roomId,
          active: callRemoval.participantCount > 0,
          participantCount: callRemoval.participantCount,
        });
      }

      const removals = roomManager.removeSocketFromAllRooms(socket.id);
      
      for (const { roomId, user } of removals) {
        console.log(`[Socket Disconnect] User "${user.displayName}" left room "${roomId}"`);
        
        socket.to(roomId).emit('user-left', {
          userId: user.userId,
          displayName: user.displayName,
          socketId: socket.id,
        });

        socket.to(roomId).emit('cursor-inactive', {
          userId: user.userId,
        });

        socket.to(roomId).emit('cursor-spotlight', {
          userId: user.userId,
          active: false,
        });

        const remainingUsers = roomManager.getRoomUsers(roomId);
        socket.to(roomId).emit('room-users', {
          roomId,
          users: remainingUsers,
        });

        // Record and broadcast USER_LEFT activity
        const leaveActivity = await createActivity(roomId, {
          userId: user.userId,
          userName: user.displayName,
          userColor: user.userColor,
          type: 'USER_LEFT',
        });

        if (leaveActivity) {
          io.to(roomId).emit('activity-created', {
            roomId,
            activity: leaveActivity,
          });
        }
      }
    });

    socket.on('disconnect', (reason) => {
      socketRateLimiter.removeSocket(socket.id);
      console.log(`[Socket Disconnected] ID: ${socket.id} | Reason: ${reason}`);
    });
  });
}

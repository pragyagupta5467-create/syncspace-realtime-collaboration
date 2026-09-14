import express from 'express';
import { findRoom, createRoom, getRoomTasks, getRoomActivities, getReplayActivities, getUserRooms } from '../services/dbService.js';
import { isDBConnected } from '../config/db.js';
import { validateRoomId, validateUser, createErrorResponse, ERROR_CODES } from '../utils/validation.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'SyncSpace Real-Time Collaboration Backend API',
    database: isDBConnected() ? 'connected' : 'standby',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/user/rooms
 * Retrieve rooms created by the authenticated user
 */
router.get('/user/rooms', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const rooms = await getUserRooms(userId);
    res.status(200).json({
      success: true,
      count: rooms.length,
      rooms,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/rooms
 * Create a new room in MongoDB
 */
router.post('/rooms', async (req, res, next) => {
  try {
    const { roomId, user } = req.body;
    const roomVal = validateRoomId(roomId);
    if (!roomVal.valid) {
      return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
    }

    const userVal = validateUser(user);
    const cleanRoomId = roomVal.value;
    const room = await createRoom(cleanRoomId, userVal.value);

    res.status(201).json({
      success: true,
      room,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/rooms/:roomId
 * Check if a room exists in MongoDB
 */
router.get('/rooms/:roomId', async (req, res, next) => {
  try {
    const roomVal = validateRoomId(req.params.roomId);
    if (!roomVal.valid) {
      return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
    }

    const cleanRoomId = roomVal.value;
    const room = await findRoom(cleanRoomId);

    if (!room) {
      return res.status(404).json(
        createErrorResponse(
          ERROR_CODES.ROOM_NOT_FOUND,
          `Room "${cleanRoomId}" does not exist. Please check the ID or create a new room.`
        )
      );
    }

    res.status(200).json({
      success: true,
      room,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/rooms/:roomId/tasks
 * Retrieve persisted tasks from MongoDB (strictly scoped by room)
 */
router.get('/rooms/:roomId/tasks', async (req, res, next) => {
  try {
    const roomVal = validateRoomId(req.params.roomId);
    if (!roomVal.valid) {
      return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
    }

    const cleanRoomId = roomVal.value;
    const room = await findRoom(cleanRoomId);

    if (!room) {
      return res.status(404).json(createErrorResponse(ERROR_CODES.ROOM_NOT_FOUND, `Room "${cleanRoomId}" not found`));
    }

    const tasks = await getRoomTasks(cleanRoomId);
    res.status(200).json({
      success: true,
      roomId: cleanRoomId,
      tasks,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/rooms/:roomId/activities
 * Retrieve persisted activity history from MongoDB (latest 50 by default)
 */
router.get('/rooms/:roomId/activities', async (req, res, next) => {
  try {
    const roomVal = validateRoomId(req.params.roomId);
    if (!roomVal.valid) {
      return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
    }

    const cleanRoomId = roomVal.value;
    const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 100) : 50;
    const activities = await getRoomActivities(cleanRoomId, limit);

    res.status(200).json({
      success: true,
      roomId: cleanRoomId,
      count: activities.length,
      activities,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/rooms/:roomId/replay
 * Retrieve chronological event history for session replay (oldest first, max 500)
 */
router.get('/rooms/:roomId/replay', async (req, res, next) => {
  try {
    const roomVal = validateRoomId(req.params.roomId);
    if (!roomVal.valid) {
      return res.status(400).json(createErrorResponse(ERROR_CODES.INVALID_ROOM_ID, roomVal.error));
    }

    const cleanRoomId = roomVal.value;
    const room = await findRoom(cleanRoomId);

    if (!room) {
      return res.status(404).json(
        createErrorResponse(ERROR_CODES.ROOM_NOT_FOUND, `Room "${cleanRoomId}" does not exist.`)
      );
    }

    const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 1), 1000) : 500;
    const events = await getReplayActivities(cleanRoomId, limit);

    res.status(200).json({
      success: true,
      roomId: cleanRoomId,
      totalEvents: events.length,
      startTime: events.length > 0 ? events[0].timestamp : null,
      endTime: events.length > 0 ? events[events.length - 1].timestamp : null,
      events,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

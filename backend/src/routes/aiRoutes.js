import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import { findRoom } from '../services/dbService.js';
import { askWorkspaceAI, generateWorkspaceSummary } from '../services/aiService.js';
import { validateRoomId } from '../utils/validation.js';

const router = express.Router();

// Memory-based user rate limiter for AI requests (15 requests / min)
const userAiRateLimits = new Map();

function checkAiRateLimit(userId) {
  const now = Date.now();
  const windowMs = 60000;
  const maxRequests = 15;

  let record = userAiRateLimits.get(userId);
  if (!record || now - record.resetTime > windowMs) {
    record = { count: 1, resetTime: now };
    userAiRateLimits.set(userId, record);
    return true;
  }

  if (record.count >= maxRequests) {
    return false;
  }

  record.count++;
  return true;
}

/**
 * POST /api/ai/workspace
 * Ask SyncSpace AI a question about the active workspace
 */
router.post('/workspace', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!checkAiRateLimit(userId)) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'AI request limit reached (max 15 requests/minute). Please wait a moment.',
        },
      });
    }

    const { roomId, question } = req.body;

    const roomVal = validateRoomId(roomId);
    if (!roomVal.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROOM_ID', message: roomVal.error },
      });
    }
    const cleanRoomId = roomVal.value;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_QUESTION', message: 'Question text is required' },
      });
    }

    // Verify room exists in MongoDB / memory
    const room = await findRoom(cleanRoomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROOM_NOT_FOUND', message: `Room "${cleanRoomId}" does not exist` },
      });
    }

    const result = await askWorkspaceAI(cleanRoomId, question, req.user);

    return res.status(200).json({
      success: true,
      answer: result.answer,
      provider: result.provider,
      model: result.model,
      roomId: cleanRoomId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/ai/summary
 * Generate an intelligent AI summary of the workspace state and recent activity
 */
router.post('/summary', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    if (!checkAiRateLimit(userId)) {
      return res.status(429).json({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'AI request limit reached. Please wait a moment.',
        },
      });
    }

    const { roomId } = req.body;

    const roomVal = validateRoomId(roomId);
    if (!roomVal.valid) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ROOM_ID', message: roomVal.error },
      });
    }
    const cleanRoomId = roomVal.value;

    const room = await findRoom(cleanRoomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: { code: 'ROOM_NOT_FOUND', message: `Room "${cleanRoomId}" does not exist` },
      });
    }

    const result = await generateWorkspaceSummary(cleanRoomId, req.user);

    return res.status(200).json({
      success: true,
      summary: result.summary,
      provider: result.provider,
      model: result.model,
      roomId: cleanRoomId,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

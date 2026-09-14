import express from 'express';
import { authenticate } from '../middleware/authMiddleware.js';
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from '../services/dbService.js';

const router = express.Router();

/**
 * GET /api/notifications
 * Fetch latest real notifications for the authenticated user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const limit = parseInt(req.query.limit, 10) || 50;

    const data = await getUserNotifications(userId, limit);

    return res.status(200).json({
      success: true,
      notifications: data.notifications,
      unreadCount: data.unreadCount,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark a specific notification as read for authenticated user
 */
router.patch('/:id/read', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const notificationId = req.params.id;

    if (!notificationId) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_ID', message: 'Notification ID is required' },
      });
    }

    const updated = await markNotificationAsRead(notificationId, userId);

    return res.status(200).json({
      success: true,
      updated,
      notificationId,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/notifications/read-all
 * Mark all unread notifications as read for authenticated user
 */
router.patch('/read-all', authenticate, async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;
    const modifiedCount = await markAllNotificationsAsRead(userId);

    return res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      modifiedCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

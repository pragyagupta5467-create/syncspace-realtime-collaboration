import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { User } from '../models/User.js';
import { isDBConnected } from '../config/db.js';
import { memoryUsersById } from '../routes/authRoutes.js';

/**
 * Authentication middleware for Express REST API routes
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication token is required. Please log in.',
        },
      });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Malformed authorization token',
        },
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, config.jwtSecret);
    } catch (err) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'TOKEN_INVALID',
          message: err.name === 'TokenExpiredError' ? 'Session expired. Please log in again.' : 'Invalid authentication token.',
        },
      });
    }

    if (!decoded || !decoded.userId) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token payload',
        },
      });
    }

    // Attempt to load user from MongoDB
    if (isDBConnected()) {
      try {
        const user = await User.findById(decoded.userId);
        if (user) {
          req.user = user.toAuthJSON();
          return next();
        }
      } catch (err) {
        console.warn('[authMiddleware] DB lookup warning:', err.message);
      }
    }

    // Memory cache lookup or fallback payload
    const memoryUser = memoryUsersById?.get(decoded.userId);
    if (memoryUser) {
      req.user = memoryUser.toAuthJSON();
      return next();
    }

    // Fallback directly to token payload
    req.user = {
      userId: decoded.userId,
      id: decoded.userId,
      name: decoded.name,
      email: decoded.email,
      userColor: decoded.userColor || '#6366f1',
    };

    next();
  } catch (err) {
    console.error('[authMiddleware error]:', err.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Internal authentication error',
      },
    });
  }
}

/**
 * Optional authentication middleware: if token present, decodes it, but does not block unauthenticated users
 */
export async function optionalAuthenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const decoded = jwt.verify(token, config.jwtSecret);
          if (decoded && decoded.userId) {
            req.user = {
              userId: decoded.userId,
              id: decoded.userId,
              name: decoded.name,
              email: decoded.email,
              userColor: decoded.userColor || '#6366f1',
            };
          }
        } catch (e) {
          // Ignore token errors for optional auth
        }
      }
    }
    next();
  } catch (err) {
    next();
  }
}

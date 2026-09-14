import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { config } from '../config/index.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { isDBConnected } from '../config/db.js';

const router = express.Router();

// Memory store for standby mode
export const memoryUsers = new Map(); // email -> userObj
export const memoryUsersById = new Map(); // userId -> userObj

// Helper to generate signed JWT token
export function generateToken(user) {
  const userId = user._id ? user._id.toString() : user.userId || user.id;
  return jwt.sign(
    {
      userId,
      id: userId,
      name: user.name,
      email: user.email,
      userColor: user.userColor || '#6366f1',
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * POST /api/auth/register
 * Register a new user account with hashed password
 */
router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_NAME', message: 'Full name must be at least 2 characters long' },
      });
    }

    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_EMAIL', message: 'Please provide a valid email address' },
      });
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters long' },
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if user already exists
    if (isDBConnected()) {
      const existing = await User.findOne({ email: cleanEmail });
      if (existing) {
        return res.status(400).json({
          success: false,
          error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists' },
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create new user in MongoDB
      const newUser = await User.create({
        name: cleanName,
        email: cleanEmail,
        passwordHash,
      });

      const token = generateToken(newUser);
      return res.status(201).json({
        success: true,
        message: 'Account created successfully',
        user: newUser.toAuthJSON(),
        token,
      });
    }

    // Standby in-memory fallback
    if (memoryUsers.has(cleanEmail)) {
      return res.status(400).json({
        success: false,
        error: { code: 'EMAIL_IN_USE', message: 'An account with this email already exists' },
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const fakeId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const userObj = {
      _id: fakeId,
      userId: fakeId,
      id: fakeId,
      name: cleanName,
      email: cleanEmail,
      passwordHash,
      userColor: '#6366f1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      toAuthJSON() {
        return {
          userId: this.userId,
          id: this.userId,
          name: this.name,
          email: this.email,
          userColor: this.userColor,
          createdAt: this.createdAt,
          updatedAt: this.updatedAt,
        };
      },
      async comparePassword(pwd) {
        return bcrypt.compare(pwd, this.passwordHash);
      },
    };

    memoryUsers.set(cleanEmail, userObj);
    memoryUsersById.set(fakeId, userObj);

    const token = generateToken(userObj);
    return res.status(201).json({
      success: true,
      message: 'Account created successfully',
      user: userObj.toAuthJSON(),
      token,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/auth/login
 * Verify user credentials and generate authentication token
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'Email and password are required' },
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    if (isDBConnected()) {
      const user = await User.findOne({ email: cleanEmail });
      if (!user) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
        });
      }

      const token = generateToken(user);
      return res.status(200).json({
        success: true,
        message: 'Logged in successfully',
        user: user.toAuthJSON(),
        token,
      });
    }

    // In-memory fallback
    const user = memoryUsers.get(cleanEmail);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    const token = generateToken(user);
    return res.status(200).json({
      success: true,
      message: 'Logged in successfully',
      user: user.toAuthJSON(),
      token,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Retrieve profile of authenticated user
 */
router.get('/me', authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    user: req.user,
  });
});

/**
 * POST /api/auth/logout
 * Stateless logout endpoint
 */
router.post('/logout', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default router;

/**
 * SyncSpace In-Memory Sliding Window Rate Limiter
 * Protects high-frequency Socket.IO events and REST endpoints against flood attacks.
 */

class SocketRateLimiter {
  constructor() {
    // Map: socketId => Map(eventName => Array of timestamps)
    this.limits = new Map();
    // Cleanup stale entries every 60 seconds
    setInterval(() => this.cleanup(), 60000).unref();
  }

  /**
   * Checks whether a socket event is within limits
   * @param {string} socketId
   * @param {string} eventName
   * @param {number} maxEvents
   * @param {number} windowMs
   * @returns {boolean} true if allowed, false if rate limited
   */
  allow(socketId, eventName, maxEvents = 60, windowMs = 1000) {
    const now = Date.now();

    if (!this.limits.has(socketId)) {
      this.limits.set(socketId, new Map());
    }

    const socketEvents = this.limits.get(socketId);
    if (!socketEvents.has(eventName)) {
      socketEvents.set(eventName, []);
    }

    const timestamps = socketEvents.get(eventName);
    // Remove expired timestamps
    while (timestamps.length > 0 && timestamps[0] <= now - windowMs) {
      timestamps.shift();
    }

    if (timestamps.length >= maxEvents) {
      return false; // Rate limit exceeded
    }

    timestamps.push(now);
    return true;
  }

  /**
   * Cleans up disconnected sockets
   * @param {string} socketId
   */
  removeSocket(socketId) {
    this.limits.delete(socketId);
  }

  /**
   * Periodic memory cleanup
   */
  cleanup() {
    const now = Date.now();
    for (const [socketId, events] of this.limits.entries()) {
      let activeEvents = 0;
      for (const [event, timestamps] of events.entries()) {
        while (timestamps.length > 0 && timestamps[0] <= now - 60000) {
          timestamps.shift();
        }
        if (timestamps.length > 0) activeEvents++;
      }
      if (activeEvents === 0) {
        this.limits.delete(socketId);
      }
    }
  }
}

export const socketRateLimiter = new SocketRateLimiter();

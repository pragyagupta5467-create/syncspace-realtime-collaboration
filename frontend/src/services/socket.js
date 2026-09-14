import { io } from 'socket.io-client';
import { getAuthToken } from './api';

/**
 * Socket.IO Singleton Client Service
 */
class SocketService {
  constructor() {
    this.socket = null;
    this.serverUrl = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
    this.listeners = new Map();
  }

  /**
   * Initializes and returns the active socket instance
   */
  connect() {
    const token = getAuthToken();

    if (!this.socket) {
      console.log(`[SocketService] Connecting to Socket.IO server at ${this.serverUrl}`);
      this.socket = io(this.serverUrl, {
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        timeout: 20000,
        transports: ['websocket', 'polling'],
        auth: {
          token,
        },
      });

      this.socket.on('connect', () => {
        console.log(`[SocketService] Connected. Socket ID: ${this.socket.id}`);
      });

      this.socket.on('disconnect', (reason) => {
        console.log(`[SocketService] Disconnected. Reason: ${reason}`);
      });

      this.socket.on('connect_error', (error) => {
        console.warn(`[SocketService] Connection error: ${error.message}`);
      });
    } else {
      // Update auth token if already connected
      if (token) {
        this.socket.auth = { token };
      }
    }

    if (this.socket.disconnected) {
      this.socket.connect();
    }

    return this.socket;
  }

  /**
   * Returns the current socket instance if initialized
   */
  getSocket() {
    if (!this.socket) {
      return this.connect();
    }
    return this.socket;
  }

  /**
   * Disconnects the socket and resets instance
   */
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

export const socketService = new SocketService();

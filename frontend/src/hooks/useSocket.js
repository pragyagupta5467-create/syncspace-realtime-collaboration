import { useState, useEffect } from 'react';
import { socketService } from '../services/socket';

export const CONNECTION_STATUS = {
  CONNECTED: 'CONNECTED',
  RECONNECTING: 'RECONNECTING',
  DISCONNECTED: 'DISCONNECTED',
};

/**
 * Custom hook providing access to Socket.IO and live connection lifecycle state
 */
export function useSocket() {
  const [status, setStatus] = useState(CONNECTION_STATUS.DISCONNECTED);
  const [socketId, setSocketId] = useState(null);

  useEffect(() => {
    const socket = socketService.getSocket();

    const handleConnect = () => {
      setStatus(CONNECTION_STATUS.CONNECTED);
      setSocketId(socket.id);
    };

    const handleDisconnect = (reason) => {
      setStatus(CONNECTION_STATUS.DISCONNECTED);
      setSocketId(null);
    };

    const handleConnectError = () => {
      setStatus(CONNECTION_STATUS.RECONNECTING);
    };

    const handleReconnectAttempt = () => {
      setStatus(CONNECTION_STATUS.RECONNECTING);
    };

    const handleReconnect = () => {
      setStatus(CONNECTION_STATUS.CONNECTED);
      setSocketId(socket.id);
    };

    // Attach listeners
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.io.on('reconnect_attempt', handleReconnectAttempt);
    socket.io.on('reconnect', handleReconnect);

    // Initial state check
    if (socket.connected) {
      setStatus(CONNECTION_STATUS.CONNECTED);
      setSocketId(socket.id);
    } else {
      setStatus(CONNECTION_STATUS.RECONNECTING);
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.io.off('reconnect_attempt', handleReconnectAttempt);
      socket.io.off('reconnect', handleReconnect);
    };
  }, []);

  return {
    socket: socketService.getSocket(),
    connectionStatus: status,
    isConnected: status === CONNECTION_STATUS.CONNECTED,
    socketId,
  };
}

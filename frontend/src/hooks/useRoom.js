import { useState, useEffect, useCallback, useRef } from 'react';
import { useSocket, CONNECTION_STATUS } from './useSocket';

/**
 * Custom hook to manage Room membership, presence list, and initial room state
 * 
 * @param {string} roomId 
 * @param {object} user { userId, displayName, userColor }
 */
export function useRoom(roomId, user) {
  const { socket, connectionStatus, isConnected } = useSocket();
  const [users, setUsers] = useState([]);
  const [initialTasks, setInitialTasks] = useState([]);
  const [initialActivities, setInitialActivities] = useState([]);
  const [isJoined, setIsJoined] = useState(false);
  const [error, setError] = useState(null);
  const [recentEvents, setRecentEvents] = useState([]);

  const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';
  const joinedRef = useRef(false);

  // Helper to add to local notifications
  const pushEvent = useCallback((event) => {
    setRecentEvents((prev) => [
      { id: `${Date.now()}_${Math.random()}`, timestamp: new Date(), ...event },
      ...prev.slice(0, 19), // Keep latest 20
    ]);
  }, []);

  // Join Room effect
  useEffect(() => {
    if (!socket || !isConnected || !cleanRoomId || !user) {
      return;
    }

    setError(null);

    console.log(`[useRoom] Requesting to join room ${cleanRoomId} as ${user.displayName}...`);

    // Emit join-room with ack and autoCreate: true
    socket.emit(
      'join-room',
      {
        roomId: cleanRoomId,
        user: {
          userId: user.userId,
          displayName: user.displayName,
          userColor: user.userColor,
        },
        autoCreate: true,
      },
      (response) => {
        if (response?.success) {
          setIsJoined(true);
          joinedRef.current = true;
          setUsers(response.users || []);
          if (Array.isArray(response.tasks)) {
            setInitialTasks(response.tasks);
          }
          if (Array.isArray(response.activities)) {
            setInitialActivities(response.activities);
          }
          pushEvent({
            type: 'SELF_JOINED',
            message: `You joined room ${cleanRoomId}`,
          });
        } else {
          const errorMsg = typeof response?.error === 'object' && response?.error?.message
            ? response.error.message
            : (response?.error || 'Failed to join room');
          setError(errorMsg);
          setIsJoined(false);
          joinedRef.current = false;
        }
      }
    );

    // Listeners for room updates
    const handleRoomUsers = (data) => {
      if (data?.roomId === cleanRoomId && Array.isArray(data.users)) {
        setUsers(data.users);
      }
    };

    const handleRoomState = (data) => {
      if (data?.roomId === cleanRoomId && Array.isArray(data.tasks)) {
        setInitialTasks(data.tasks);
      }
    };

    const handleUserJoined = (data) => {
      const newUser = data?.user;
      if (newUser) {
        setUsers((prev) => {
          const exists = prev.some((u) => u.userId === newUser.userId);
          if (exists) {
            return prev.map((u) => (u.userId === newUser.userId ? newUser : u));
          }
          return [...prev, newUser];
        });
        pushEvent({
          type: 'USER_JOINED',
          user: newUser,
          message: `${newUser.displayName} joined the room`,
        });
      }
    };

    const handleUserLeft = (data) => {
      if (data?.userId) {
        setUsers((prev) => prev.filter((u) => u.userId !== data.userId));
        pushEvent({
          type: 'USER_LEFT',
          user: data,
          message: `${data.displayName || 'Collaborator'} left the room`,
        });
      }
    };

    socket.on('room-users', handleRoomUsers);
    socket.on('room-state', handleRoomState);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);

    return () => {
      console.log(`[useRoom] Leaving room ${cleanRoomId}...`);
      if (socket && joinedRef.current) {
        socket.emit('leave-room', { roomId: cleanRoomId });
        joinedRef.current = false;
      }
      socket.off('room-users', handleRoomUsers);
      socket.off('room-state', handleRoomState);
      socket.off('user-joined', handleUserJoined);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, isConnected, cleanRoomId, user?.userId, pushEvent]);

  // Explicit leave room function
  const leaveRoom = useCallback(() => {
    if (socket && cleanRoomId && joinedRef.current) {
      socket.emit('leave-room', { roomId: cleanRoomId });
      joinedRef.current = false;
      setIsJoined(false);
      setUsers([]);
    }
  }, [socket, cleanRoomId]);

  return {
    users,
    initialTasks,
    initialActivities,
    isJoined,
    connectionStatus,
    isConnected,
    error,
    recentEvents,
    leaveRoom,
  };
}

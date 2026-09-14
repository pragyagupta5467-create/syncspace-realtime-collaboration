import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * THROTTLE_INTERVAL_MS
 * Target: ~30 updates per second (33.3ms interval).
 * Balances smooth visual tracking with low network bandwidth and minimal server load.
 */
const THROTTLE_INTERVAL_MS = 33;

/**
 * STALE_CURSOR_TIMEOUT_MS
 * Safety threshold: Inactive cursors without updates are cleaned up after 10 seconds.
 */
const STALE_CURSOR_TIMEOUT_MS = 10000;

/**
 * Custom Hook: useMultiplayerCursors
 * Captures workspace-relative mouse movement, throttles outbound emissions,
 * manages cursor spotlight state, and maintains reactive state for remote cursors.
 */
export function useMultiplayerCursors({ containerRef, roomId, currentUser, socket, isConnected }) {
  const [remoteCursors, setRemoteCursors] = useState({});
  const [containerDimensions, setContainerDimensions] = useState({ width: 0, height: 0 });
  const [isSpotlightActive, setIsSpotlightActive] = useState(false);

  const lastEmitTimeRef = useRef(0);
  const trailingTimerRef = useRef(null);
  const pendingPayloadRef = useRef(null);

  const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';

  // Track container dimensions for cross-screen relative scaling
  useEffect(() => {
    if (!containerRef.current) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerDimensions({ width: rect.width, height: rect.height });
      }
    };

    updateDimensions();
    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(containerRef.current);

    return () => resizeObserver.disconnect();
  }, [containerRef]);

  // Outbound Cursor Emitter
  const emitCursorMove = useCallback((payload) => {
    if (!socket || !isConnected || !cleanRoomId || !currentUser) return;

    socket.emit('cursor-move', {
      roomId: cleanRoomId,
      userId: currentUser.userId,
      displayName: currentUser.displayName,
      userColor: currentUser.userColor,
      ...payload,
    });
    lastEmitTimeRef.current = performance.now();
  }, [socket, isConnected, cleanRoomId, currentUser]);

  // Throttled mouse move handler
  const handleMouseMove = useCallback((e) => {
    if (!containerRef.current || !socket || !isConnected) return;

    const rect = containerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Constrain to container bounds
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    const percentX = rect.width > 0 ? x / rect.width : 0;
    const percentY = rect.height > 0 ? y / rect.height : 0;

    const payload = {
      x: Math.round(x * 10) / 10,
      y: Math.round(y * 10) / 10,
      percentX,
      percentY,
    };

    const now = performance.now();
    const elapsed = now - lastEmitTimeRef.current;

    if (elapsed >= THROTTLE_INTERVAL_MS) {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
        trailingTimerRef.current = null;
      }
      emitCursorMove(payload);
    } else {
      pendingPayloadRef.current = payload;

      if (!trailingTimerRef.current) {
        const remaining = THROTTLE_INTERVAL_MS - elapsed;
        trailingTimerRef.current = setTimeout(() => {
          if (pendingPayloadRef.current) {
            emitCursorMove(pendingPayloadRef.current);
            pendingPayloadRef.current = null;
          }
          trailingTimerRef.current = null;
        }, remaining);
      }
    }
  }, [containerRef, socket, isConnected, emitCursorMove]);

  // Mouse leave handler
  const handleMouseLeave = useCallback(() => {
    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = null;
    }

    if (socket && isConnected && cleanRoomId && currentUser) {
      socket.emit('cursor-leave', {
        roomId: cleanRoomId,
        userId: currentUser.userId,
      });
    }
  }, [socket, isConnected, cleanRoomId, currentUser]);

  // Toggle Cursor Spotlight for Current User
  const toggleSpotlight = useCallback(() => {
    if (!socket || !isConnected || !cleanRoomId || !currentUser) return;

    setIsSpotlightActive((prev) => {
      const next = !prev;
      socket.emit('cursor-spotlight', {
        roomId: cleanRoomId,
        userId: currentUser.userId,
        active: next,
      });
      return next;
    });
  }, [socket, isConnected, cleanRoomId, currentUser]);

  // Inbound Socket Listeners
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleCursorUpdate = (data) => {
      if (!data || data.userId === currentUser?.userId) return;

      setRemoteCursors((prev) => ({
        ...prev,
        [data.userId]: {
          userId: data.userId,
          displayName: data.displayName || 'Collaborator',
          userColor: data.userColor || '#6366f1',
          x: data.x,
          y: data.y,
          percentX: data.percentX,
          percentY: data.percentY,
          isSpotlight: prev[data.userId]?.isSpotlight || false,
          lastSeen: Date.now(),
        },
      }));
    };

    const handleCursorSpotlight = (data) => {
      const { userId, active } = data || {};
      if (!userId || userId === currentUser?.userId) return;

      setRemoteCursors((prev) => {
        if (!prev[userId]) return prev;
        return {
          ...prev,
          [userId]: {
            ...prev[userId],
            isSpotlight: Boolean(active),
          },
        };
      });
    };

    const handleCursorInactive = ({ userId }) => {
      if (!userId) return;
      setRemoteCursors((prev) => {
        if (!prev[userId]) return prev;
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    };

    const handleUserLeft = ({ userId }) => {
      if (!userId) return;
      setRemoteCursors((prev) => {
        if (!prev[userId]) return prev;
        const copy = { ...prev };
        delete copy[userId];
        return copy;
      });
    };

    socket.on('cursor-update', handleCursorUpdate);
    socket.on('cursor-spotlight', handleCursorSpotlight);
    socket.on('cursor-inactive', handleCursorInactive);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('cursor-update', handleCursorUpdate);
      socket.off('cursor-spotlight', handleCursorSpotlight);
      socket.off('cursor-inactive', handleCursorInactive);
      socket.off('user-left', handleUserLeft);
    };
  }, [socket, isConnected, currentUser?.userId]);

  // Stale Cursor Sweep Timer
  useEffect(() => {
    const sweepInterval = setInterval(() => {
      const now = Date.now();
      setRemoteCursors((prev) => {
        let hasStale = false;
        const next = {};
        for (const [userId, cursor] of Object.entries(prev)) {
          if (now - cursor.lastSeen < STALE_CURSOR_TIMEOUT_MS) {
            next[userId] = cursor;
          } else {
            hasStale = true;
          }
        }
        return hasStale ? next : prev;
      });
    }, 3000);

    return () => clearInterval(sweepInterval);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (trailingTimerRef.current) {
        clearTimeout(trailingTimerRef.current);
      }
    };
  }, []);

  return {
    remoteCursors,
    containerDimensions,
    isSpotlightActive,
    toggleSpotlight,
    handleMouseMove,
    handleMouseLeave,
  };
}

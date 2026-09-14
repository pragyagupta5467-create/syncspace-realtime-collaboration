import { useState, useEffect, useCallback, useMemo } from 'react';

export const ACTIVITY_FILTERS = {
  ALL: 'ALL',
  TASKS: 'TASKS',
  USERS: 'USERS',
  CONFLICTS: 'CONFLICTS',
};

const TASK_EVENT_TYPES = ['TASK_CREATED', 'TASK_UPDATED', 'TASK_MOVED', 'TASK_DELETED'];
const USER_EVENT_TYPES = ['USER_JOINED', 'USER_LEFT'];
const CONFLICT_EVENT_TYPES = ['TASK_CONFLICT'];

/**
 * Format timestamp into human-readable relative time string
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return 'just now';
  const now = Date.now();
  const date = new Date(timestamp).getTime();
  const diffMs = Math.max(0, now - date);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 5) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

/**
 * Custom Hook: useActivityFeed
 * Subscribes to real-time activity events, manages deduplication,
 * provides category filtering, and tracks live relative timestamps.
 */
export function useActivityFeed({ roomId, socket, isConnected, initialActivities = [] }) {
  const [activities, setActivities] = useState([]);
  const [filter, setFilter] = useState(ACTIVITY_FILTERS.ALL);
  const [, setTicker] = useState(0);

  const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';

  // Periodic ticker to refresh relative timestamps every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Hydrate initial activities (e.g. from room-joined response or prop)
  useEffect(() => {
    if (Array.isArray(initialActivities) && initialActivities.length > 0) {
      setActivities((prev) => {
        const map = new Map();
        for (const act of prev) {
          if (act?.activityId) map.set(act.activityId, act);
        }
        for (const act of initialActivities) {
          if (act?.activityId) map.set(act.activityId, act);
        }
        return Array.from(map.values())
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, 100);
      });
    }
  }, [initialActivities]);

  // Fetch initial activity history from REST API
  useEffect(() => {
    if (!cleanRoomId) return;

    let isMounted = true;
    const fetchActivities = async () => {
      try {
        const apiBase = import.meta.env.VITE_API_URL || '/api';
        const res = await fetch(`${apiBase}/rooms/${encodeURIComponent(cleanRoomId)}/activities?limit=50`);
        if (res.ok) {
          const data = await res.json();
          if (isMounted && Array.isArray(data.activities)) {
            setActivities((prev) => {
              const map = new Map();
              for (const act of data.activities) {
                if (act?.activityId) map.set(act.activityId, act);
              }
              for (const act of prev) {
                if (act?.activityId) map.set(act.activityId, act);
              }
              return Array.from(map.values())
                .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                .slice(0, 100);
            });
          }
        }
      } catch (err) {
        // Quiet fallback if offline
      }
    };

    fetchActivities();
    return () => { isMounted = false; };
  }, [cleanRoomId]);

  // Real-time socket listener for new activities
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleActivityCreated = (data) => {
      const newActivity = data?.activity;
      if (!newActivity || !newActivity.activityId) return;

      setActivities((prev) => {
        if (prev.some((a) => a.activityId === newActivity.activityId)) {
          return prev;
        }
        return [newActivity, ...prev].slice(0, 100);
      });
    };

    const handleRoomState = (data) => {
      if (Array.isArray(data?.activities)) {
        setActivities((prev) => {
          const map = new Map();
          for (const act of data.activities) {
            if (act?.activityId) map.set(act.activityId, act);
          }
          for (const act of prev) {
            if (act?.activityId) map.set(act.activityId, act);
          }
          return Array.from(map.values())
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, 100);
        });
      }
    };

    socket.on('activity-created', handleActivityCreated);
    socket.on('room-state', handleRoomState);

    return () => {
      socket.off('activity-created', handleActivityCreated);
      socket.off('room-state', handleRoomState);
    };
  }, [socket, isConnected]);

  // Category counts
  const counts = useMemo(() => {
    const total = activities.length;
    let tasksCount = 0;
    let usersCount = 0;
    let conflictsCount = 0;

    for (const a of activities) {
      if (TASK_EVENT_TYPES.includes(a.type)) tasksCount++;
      else if (USER_EVENT_TYPES.includes(a.type)) usersCount++;
      else if (CONFLICT_EVENT_TYPES.includes(a.type)) conflictsCount++;
    }

    return {
      [ACTIVITY_FILTERS.ALL]: total,
      [ACTIVITY_FILTERS.TASKS]: tasksCount,
      [ACTIVITY_FILTERS.USERS]: usersCount,
      [ACTIVITY_FILTERS.CONFLICTS]: conflictsCount,
    };
  }, [activities]);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    if (filter === ACTIVITY_FILTERS.ALL) return activities;
    if (filter === ACTIVITY_FILTERS.TASKS) {
      return activities.filter((a) => TASK_EVENT_TYPES.includes(a.type));
    }
    if (filter === ACTIVITY_FILTERS.USERS) {
      return activities.filter((a) => USER_EVENT_TYPES.includes(a.type));
    }
    if (filter === ACTIVITY_FILTERS.CONFLICTS) {
      return activities.filter((a) => CONFLICT_EVENT_TYPES.includes(a.type));
    }
    return activities;
  }, [activities, filter]);

  return {
    activities: filteredActivities,
    rawCount: activities.length,
    filter,
    setFilter,
    counts,
  };
}

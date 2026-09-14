import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

/**
 * Pure deterministic reducer: reconstructs Kanban board state at a specific step in time
 * 
 * @param {Array} events - Chronological array of real activity records
 * @param {number} stepIndex - Target index (0 to events.length)
 * @returns {{ tasks: Array, conflictEvent: object|null }}
 */
export function reconstructStateAtStep(events = [], stepIndex = 0) {
  let tasks = [];
  let conflictEvent = null;

  const boundedStep = Math.max(0, Math.min(stepIndex, events.length));

  for (let i = 0; i < boundedStep; i++) {
    const ev = events[i];
    if (!ev) continue;

    switch (ev.type) {
      case 'TASK_CREATED': {
        const taskId = ev.taskId || `task_${i}`;
        const newTask = {
          id: taskId,
          taskId,
          title: ev.taskTitle || 'Untitled Task',
          description: ev.metadata?.description || '',
          priority: ev.metadata?.priority || 'MEDIUM',
          status: ev.metadata?.status || 'TODO',
          position: typeof ev.metadata?.position === 'number' ? ev.metadata.position : tasks.length,
          version: 1,
          createdBy: {
            displayName: ev.userName,
            userColor: ev.userColor || '#6366f1',
          },
          updatedBy: {
            displayName: ev.userName,
            userColor: ev.userColor || '#6366f1',
          },
          createdAt: ev.timestamp,
          updatedAt: ev.timestamp,
        };

        const exists = tasks.some((t) => t.id === taskId);
        if (exists) {
          tasks = tasks.map((t) => (t.id === taskId ? newTask : t));
        } else {
          tasks.push(newTask);
        }
        break;
      }

      case 'TASK_MOVED': {
        const taskId = ev.taskId;
        if (!taskId) break;
        const newStatus = ev.metadata?.newStatus || 'IN_PROGRESS';
        const newPosition = ev.metadata?.position;

        tasks = tasks.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              status: newStatus,
              position: typeof newPosition === 'number' ? newPosition : t.position,
              updatedBy: {
                displayName: ev.userName,
                userColor: ev.userColor || '#6366f1',
              },
              updatedAt: ev.timestamp,
            };
          }
          return t;
        });
        break;
      }

      case 'TASK_UPDATED': {
        const taskId = ev.taskId;
        if (!taskId) break;
        const updates = ev.metadata?.updates || {};

        tasks = tasks.map((t) => {
          if (t.id === taskId) {
            return {
              ...t,
              ...updates,
              title: ev.taskTitle || updates.title || t.title,
              updatedBy: {
                displayName: ev.userName,
                userColor: ev.userColor || '#6366f1',
              },
              updatedAt: ev.timestamp,
            };
          }
          return t;
        });
        break;
      }

      case 'TASK_DELETED': {
        const taskId = ev.taskId;
        if (taskId) {
          tasks = tasks.filter((t) => t.id !== taskId);
        }
        break;
      }

      case 'TASK_CONFLICT': {
        // Critical OCC Rule: Rejected stale mutations must NOT alter task state.
        // We only capture this as an informational event at the current step.
        if (i === boundedStep - 1) {
          conflictEvent = ev;
        }
        break;
      }

      default:
        // Lifecycle events like USER_JOINED / USER_LEFT do not mutate the task board
        break;
    }
  }

  return { tasks, conflictEvent };
}

/**
 * Custom Hook: useSessionReplay
 * Manages chronological event streaming, playback controls, scrubber seeking,
 * and deterministic state reconstruction.
 */
export function useSessionReplay(input) {
  // Support both useSessionReplay(roomId) and useSessionReplay({ roomId, isOpen })
  const roomId = typeof input === 'string' ? input : input?.roomId;
  const isOpen = typeof input === 'string' ? Boolean(input) : (input?.isOpen ?? true);

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1); // 0.5, 1, 2

  const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';
  const timerRef = useRef(null);

  // Fetch chronological session events on open
  useEffect(() => {
    if (!isOpen || !cleanRoomId) {
      setEvents([]);
      setCurrentStep(0);
      setIsPlaying(false);
      return;
    }

    let isMounted = true;
    const fetchReplayEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const apiBase = import.meta.env.VITE_API_URL || '/api';
        const res = await fetch(`${apiBase}/rooms/${encodeURIComponent(cleanRoomId)}/replay?limit=500`);
        if (!res.ok) {
          throw new Error(`Failed to load replay history (HTTP ${res.status})`);
        }
        const data = await res.json();
        if (isMounted) {
          const loadedEvents = Array.isArray(data.events) ? data.events : [];
          setEvents(loadedEvents);
          // Start at final step by default so users see complete session history immediately
          setCurrentStep(loadedEvents.length);
          setIsPlaying(false);
        }
      } catch (err) {
        if (isMounted) {
          console.error('[useSessionReplay error]:', err);
          setError(err.message || 'Unable to fetch session replay events');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchReplayEvents();
    return () => {
      isMounted = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isOpen, cleanRoomId]);

  // Autoplay loop
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalMs = Math.round(1400 / speed);
    timerRef.current = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= events.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, events.length]);

  // Deterministically reconstruct board state at current step
  const { tasks: reconstructedTasks, conflictEvent } = useMemo(() => {
    return reconstructStateAtStep(events, currentStep);
  }, [events, currentStep]);

  // Active event descriptor at current step
  const currentEvent = useMemo(() => {
    if (currentStep === 0 || events.length === 0) return null;
    return events[currentStep - 1] || null;
  }, [events, currentStep]);

  // Playback actions
  const play = useCallback(() => {
    if (events.length === 0) return;
    if (currentStep >= events.length) {
      setCurrentStep(0);
    }
    setIsPlaying(true);
  }, [events.length, currentStep]);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const restart = useCallback(() => {
    setIsPlaying(false);
    setCurrentStep(0);
  }, []);

  const jumpToStep = useCallback((step) => {
    const target = Math.max(0, Math.min(step, events.length));
    setCurrentStep(target);
  }, [events.length]);

  const stepForward = useCallback(() => {
    jumpToStep(currentStep + 1);
  }, [currentStep, jumpToStep]);

  const stepBackward = useCallback(() => {
    jumpToStep(currentStep - 1);
  }, [currentStep, jumpToStep]);

  return {
    events,
    totalEvents: events.length,
    totalSteps: events.length,
    currentStep,
    currentStepIndex: currentStep,
    isPlaying,
    speed,
    setSpeed,
    setSpeedMultiplier: setSpeed,
    loading,
    isLoading: loading,
    error,
    reconstructedTasks,
    currentEvent,
    conflictEvent,
    play,
    pause,
    restart,
    jumpToStep,
    seekToStep: jumpToStep,
    stepForward,
    stepBackward,
  };
}

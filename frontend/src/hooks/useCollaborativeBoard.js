import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom Hook: useCollaborativeBoard
 * Manages server-authoritative shared task state, Optimistic Concurrency Control (OCC),
 * real-time socket events, and interactive conflict resolution.
 */
export function useCollaborativeBoard({ roomId, socket, isConnected, currentUser, initialTasks = [] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [boardError, setBoardError] = useState(null);
  const [activeConflict, setActiveConflict] = useState(null);

  const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  // Sync initial tasks
  useEffect(() => {
    if (Array.isArray(initialTasks) && initialTasks.length > 0) {
      setTasks(initialTasks);
    }
  }, [initialTasks]);

  // Socket event listeners for granular state updates & conflicts
  useEffect(() => {
    if (!socket || !isConnected) return;

    const handleRoomState = (data) => {
      if (Array.isArray(data?.tasks)) {
        setTasks(data.tasks);
      }
    };

    const handleTaskCreated = (data) => {
      const newTask = data?.task;
      if (!newTask) return;
      setTasks((prev) => {
        const exists = prev.some((t) => t.id === newTask.id);
        if (exists) {
          return prev.map((t) => (t.id === newTask.id ? newTask : t));
        }
        return [...prev, newTask];
      });
    };

    const handleTaskUpdated = (data) => {
      const updatedTask = data?.task;
      if (!updatedTask) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === updatedTask.id ? updatedTask : t))
      );
    };

    const handleTaskMoved = (data) => {
      const movedTask = data?.task;
      if (!movedTask) return;
      setTasks((prev) =>
        prev.map((t) => (t.id === movedTask.id ? movedTask : t))
      );
    };

    const handleTaskDeleted = (data) => {
      const { taskId } = data || {};
      if (!taskId) return;
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    };

    const handleTaskConflict = (conflictData) => {
      console.warn('[Conflict Event Received]:', conflictData);
      setActiveConflict(conflictData);
      // Reconcile affected task back to authoritative currentTask
      if (conflictData?.currentTask) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === conflictData.taskId ? conflictData.currentTask : t
          )
        );
      }
    };

    socket.on('room-state', handleRoomState);
    socket.on('task-created', handleTaskCreated);
    socket.on('task-updated', handleTaskUpdated);
    socket.on('task-moved', handleTaskMoved);
    socket.on('task-deleted', handleTaskDeleted);
    socket.on('task-conflict', handleTaskConflict);

    return () => {
      socket.off('room-state', handleRoomState);
      socket.off('task-created', handleTaskCreated);
      socket.off('task-updated', handleTaskUpdated);
      socket.off('task-moved', handleTaskMoved);
      socket.off('task-deleted', handleTaskDeleted);
      socket.off('task-conflict', handleTaskConflict);
    };
  }, [socket, isConnected]);

  /**
   * Action: Create a new task
   */
  const createTask = useCallback(
    async ({ title, description, priority = 'MEDIUM', status = 'TODO' }) => {
      if (!socket || !isConnected || !cleanRoomId) {
        setBoardError('Cannot create task: Socket is disconnected');
        return false;
      }

      setBoardError(null);

      return new Promise((resolve) => {
        socket.emit(
          'task-create',
          {
            roomId: cleanRoomId,
            task: { title, description, priority, status },
          },
          (response) => {
            if (response?.success) {
              resolve(response.task);
            } else {
              setBoardError(response?.error || 'Failed to create task');
              resolve(null);
            }
          }
        );
      });
    },
    [socket, isConnected, cleanRoomId]
  );

  /**
   * Action: Update an existing task with expectedVersion for OCC
   */
  const updateTask = useCallback(
    async (taskId, updates, specificVersion) => {
      if (!socket || !isConnected || !cleanRoomId) {
        setBoardError('Cannot update task: Socket is disconnected');
        return false;
      }

      const existingTask = tasksRef.current.find((t) => t.id === taskId);
      const expectedVersion = typeof specificVersion === 'number'
        ? specificVersion
        : existingTask?.version || 1;

      // Optimistic local update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, ...updates, updatedAt: new Date().toISOString() }
            : t
        )
      );

      return new Promise((resolve) => {
        socket.emit(
          'task-update',
          {
            roomId: cleanRoomId,
            taskId,
            updates,
            expectedVersion,
          },
          (response) => {
            if (response?.success) {
              resolve(response.task);
            } else if (response?.conflict) {
              // Conflict detected
              setActiveConflict(response);
              if (response.currentTask) {
                setTasks((prev) =>
                  prev.map((t) => (t.id === taskId ? response.currentTask : t))
                );
              }
              resolve(null);
            } else {
              setBoardError(response?.error || 'Failed to update task');
              socket.emit('join-room', { roomId: cleanRoomId, user: currentUser });
              resolve(null);
            }
          }
        );
      });
    },
    [socket, isConnected, cleanRoomId, currentUser]
  );

  /**
   * Action: Move a task to a new status / position with OCC
   */
  const moveTask = useCallback(
    async (taskId, newStatus, newPosition) => {
      if (!socket || !isConnected || !cleanRoomId) return false;

      const existingTask = tasksRef.current.find((t) => t.id === taskId);
      const expectedVersion = existingTask?.version || 1;

      // Optimistic local update
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? { ...t, status: newStatus, position: newPosition ?? t.position }
            : t
        )
      );

      return new Promise((resolve) => {
        socket.emit(
          'task-move',
          {
            roomId: cleanRoomId,
            taskId,
            newStatus,
            newPosition,
            expectedVersion,
          },
          (response) => {
            if (response?.success) {
              resolve(response.task);
            } else if (response?.conflict) {
              setActiveConflict(response);
              if (response.currentTask) {
                setTasks((prev) =>
                  prev.map((t) => (t.id === taskId ? response.currentTask : t))
                );
              }
              resolve(null);
            } else {
              setBoardError(response?.error || 'Failed to move task');
              resolve(null);
            }
          }
        );
      });
    },
    [socket, isConnected, cleanRoomId]
  );

  /**
   * Action: Delete a task
   */
  const deleteTask = useCallback(
    async (taskId) => {
      if (!socket || !isConnected || !cleanRoomId) return false;

      setTasks((prev) => prev.filter((t) => t.id !== taskId));

      return new Promise((resolve) => {
        socket.emit(
          'task-delete',
          {
            roomId: cleanRoomId,
            taskId,
          },
          (response) => {
            if (response?.success) {
              resolve(true);
            } else {
              setBoardError(response?.error || 'Failed to delete task');
              resolve(false);
            }
          }
        );
      });
    },
    [socket, isConnected, cleanRoomId]
  );

  /**
   * Conflict Resolution: Keep Current Server Version
   */
  const resolveKeepCurrent = useCallback(() => {
    if (!activeConflict) return;
    if (activeConflict.currentTask) {
      setTasks((prev) =>
        prev.map((t) =>
          t.id === activeConflict.taskId ? activeConflict.currentTask : t
        )
      );
    }
    setActiveConflict(null);
  }, [activeConflict]);

  /**
   * Conflict Resolution: Retry My Changes Against Latest Version
   */
  const resolveRetryChanges = useCallback(async () => {
    if (!activeConflict) return;

    const { taskId, attemptedChanges, currentVersion } = activeConflict;
    setActiveConflict(null);

    // Reapply attempted changes against latest version
    await updateTask(taskId, attemptedChanges, currentVersion);
  }, [activeConflict, updateTask]);

  return {
    tasks,
    boardError,
    activeConflict,
    setBoardError,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
    resolveKeepCurrent,
    resolveRetryChanges,
  };
}

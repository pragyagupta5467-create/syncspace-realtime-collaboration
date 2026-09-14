import React, { useState } from 'react';
import { 
  Plus, 
  MoreVertical, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Edit3, 
  Trash2, 
  Sparkles, 
  Layers,
  AlertTriangle,
  RotateCcw,
  Check
} from 'lucide-react';
import { Modal } from './UI';

const COLUMNS = [
  { id: 'TODO', title: 'To Do', color: 'border-amber-500/30 text-amber-500' },
  { id: 'IN_PROGRESS', title: 'In Progress', color: 'border-indigo-500/30 text-indigo-500' },
  { id: 'DONE', title: 'Done', color: 'border-emerald-500/30 text-emerald-500' },
];

const PRIORITY_BADGES = {
  LOW: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  MEDIUM: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  HIGH: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
};

/**
 * Task Card Item
 */
function TaskCard({ task, onEdit, onDelete, onDragStart, isHighlighted }) {
  return (
    <div
      id={`task-card-${task.id}`}
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      className={`p-4 rounded-xl border transition-all cursor-grab active:cursor-grabbing select-none ${
        isHighlighted
          ? 'ring-2 ring-indigo-500 shadow-xl scale-[1.02] bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-500'
          : 'bg-white dark:bg-slate-900/90 border-slate-200 dark:border-slate-800/80 hover:border-slate-300 dark:hover:border-slate-700 shadow-sm hover:shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span
          className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${
            PRIORITY_BADGES[task.priority] || PRIORITY_BADGES.MEDIUM
          }`}
        >
          {task.priority}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(task)}
            className="p-1 rounded text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Edit Task"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Delete Task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 leading-snug">
        {task.title}
      </h4>

      {task.description && (
        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mb-3 leading-relaxed">
          {task.description}
        </p>
      )}

      {/* Card Footer: Creator Avatar & Version Badge */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/60 text-[11px] text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-1.5 truncate">
          <div
            className="h-4 w-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{ backgroundColor: task.updatedBy?.userColor || task.createdBy?.userColor || '#6366f1' }}
          >
            {(task.updatedBy?.displayName || task.createdBy?.displayName || 'U').charAt(0).toUpperCase()}
          </div>
          <span className="truncate">{task.updatedBy?.displayName || task.createdBy?.displayName || 'User'}</span>
        </div>
        <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
          v{task.version}
        </span>
      </div>
    </div>
  );
}

/**
 * Task Creation & Edit Modal
 */
function TaskModal({ isOpen, onClose, onSubmit, initialTask = null }) {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [description, setDescription] = useState(initialTask?.description || '');
  const [priority, setPriority] = useState(initialTask?.priority || 'MEDIUM');
  const [status, setStatus] = useState(initialTask?.status || 'TODO');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      priority,
      status,
      expectedVersion: initialTask?.version,
    });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initialTask ? 'Edit Task' : 'Create New Task'}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Task Title *
          </label>
          <input
            type="text"
            required
            maxLength={140}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Implement WebSocket Handshake"
            className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Description
          </label>
          <textarea
            rows={3}
            maxLength={800}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Add relevant notes or sub-tasks..."
            className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODO">To Do</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="DONE">Done</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all"
          >
            {initialTask ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * OCC Conflict Modal
 */
function ConflictModal({ conflict, onKeepCurrent, onRetry }) {
  if (!conflict) return null;

  return (
    <Modal isOpen={!!conflict} onClose={onKeepCurrent} title="Concurrent Edit Conflict Detected" maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <span>
            Another collaborator (<strong>{conflict.updatedBy?.displayName || 'Peer'}</strong>) updated this task to version{' '}
            <strong>v{conflict.currentVersion}</strong> while you were editing version <strong>v{conflict.expectedVersion}</strong>.
          </span>
        </div>

        {/* Side by side diff preview */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700">
            <span className="font-bold text-slate-500 dark:text-slate-400 block mb-1">Server Version (v{conflict.currentVersion})</span>
            <div className="font-semibold text-slate-900 dark:text-white mb-1">{conflict.currentTask?.title}</div>
            <div className="text-slate-600 dark:text-slate-400 text-[11px] mb-2">{conflict.currentTask?.description || 'No description'}</div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 font-mono font-bold">
              {conflict.currentTask?.priority}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
            <span className="font-bold text-indigo-600 dark:text-indigo-400 block mb-1">Your Changes</span>
            <div className="font-semibold text-slate-900 dark:text-white mb-1">
              {conflict.attemptedChanges?.title || conflict.currentTask?.title}
            </div>
            <div className="text-slate-600 dark:text-slate-400 text-[11px] mb-2">
              {conflict.attemptedChanges?.description !== undefined
                ? conflict.attemptedChanges.description
                : conflict.currentTask?.description}
            </div>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-200 dark:bg-indigo-800 font-mono font-bold text-indigo-800 dark:text-indigo-200">
              {conflict.attemptedChanges?.priority || conflict.currentTask?.priority}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onKeepCurrent}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center gap-1.5"
          >
            <Check className="h-3.5 w-3.5" />
            <span>Keep Server Version</span>
          </button>
          <button
            onClick={onRetry}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Retry My Changes</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Main Collaborative Task Board Component
 */
export default function TaskBoard({
  tasks = [],
  highlightedTaskId,
  onCreateTask,
  onUpdateTask,
  onMoveTask,
  onDeleteTask,
  activeConflict,
  onKeepCurrent,
  onRetryChanges,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [targetStatus, setTargetStatus] = useState('TODO');

  const handleOpenCreate = (status = 'TODO') => {
    setEditingTask(null);
    setTargetStatus(status);
    setModalOpen(true);
  };

  const handleOpenEdit = (task) => {
    setEditingTask(task);
    setModalOpen(true);
  };

  const handleModalSubmit = (taskData) => {
    if (editingTask) {
      onUpdateTask(editingTask.id, taskData, editingTask.version);
    } else {
      onCreateTask({ ...taskData, status: targetStatus });
    }
  };

  const handleDragStart = (e, task) => {
    e.dataTransfer.setData('text/plain', JSON.stringify({ id: task.id, status: task.status, version: task.version }));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, targetColStatus) => {
    e.preventDefault();
    try {
      const raw = e.dataTransfer.getData('text/plain');
      if (!raw) return;
      const { id, status, version } = JSON.parse(raw);
      if (status !== targetColStatus) {
        onMoveTask(id, targetColStatus, undefined, version);
      }
    } catch (err) {
      console.error('Failed to handle drop event', err);
    }
  };

  return (
    <div className="flex-1 overflow-x-auto p-4 md:p-6 select-none flex flex-col justify-between">
      {/* Board Header Actions */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-indigo-500" />
          <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Workspace Kanban ({tasks.length} {tasks.length === 1 ? 'task' : 'tasks'})
          </h2>
        </div>
        <button
          onClick={() => handleOpenCreate('TODO')}
          className="px-3 py-1.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Task</span>
        </button>
      </div>

      {/* Kanban Columns */}
      <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[400px]">
        {COLUMNS.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.id);

          return (
            <div
              key={col.id}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, col.id)}
              className="flex flex-col bg-slate-50/70 dark:bg-slate-900/50 rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-3 overflow-hidden shadow-inner"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/60 dark:border-slate-800/60 mb-3 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{col.title}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
                    {colTasks.length}
                  </span>
                </div>
                <button
                  onClick={() => handleOpenCreate(col.id)}
                  className="p-1 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                  title={`Add to ${col.title}`}
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Card List Area */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {colTasks.length === 0 ? (
                  <div className="h-32 border-2 border-dashed border-slate-200 dark:border-slate-800/80 rounded-xl flex items-center justify-center text-xs text-slate-400 dark:text-slate-500 italic">
                    No tasks in {col.title}
                  </div>
                ) : (
                  colTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onEdit={handleOpenEdit}
                      onDelete={onDeleteTask}
                      onDragStart={handleDragStart}
                      isHighlighted={highlightedTaskId === task.id}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modals */}
      <TaskModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialTask={editingTask}
      />

      <ConflictModal
        conflict={activeConflict}
        onKeepCurrent={onKeepCurrent}
        onRetry={onRetryChanges}
      />
    </div>
  );
}

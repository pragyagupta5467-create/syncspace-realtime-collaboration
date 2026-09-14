import React from 'react';
import { 
  Activity as ActivityIcon, 
  UserPlus, 
  UserMinus, 
  PlusCircle, 
  ArrowRight, 
  Edit3, 
  Trash2, 
  AlertTriangle,
  Clock
} from 'lucide-react';

const EVENT_CONFIG = {
  USER_JOINED: { icon: UserPlus, color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' },
  USER_LEFT: { icon: UserMinus, color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' },
  TASK_CREATED: { icon: PlusCircle, color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/20' },
  TASK_MOVED: { icon: ArrowRight, color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/20' },
  TASK_UPDATED: { icon: Edit3, color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' },
  TASK_DELETED: { icon: Trash2, color: 'text-rose-500 bg-rose-500/10 border-rose-500/20' },
  TASK_CONFLICT: { icon: AlertTriangle, color: 'text-rose-600 bg-rose-500/10 border-rose-500/30' },
};

function formatTimestamp(ts) {
  if (!ts) return 'Just now';
  const d = new Date(ts);
  const now = new Date();
  const diffSec = Math.floor((now - d) / 1000);
  if (diffSec < 10) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ActivityFeed({
  activities = [],
  filter = 'ALL',
  onFilterChange,
  counts = { ALL: 0, TASKS: 0, ROOM: 0, CONFLICTS: 0 },
  onSelectTask,
}) {
  return (
    <div className="flex flex-col h-full select-none">
      {/* Header & Filter Tabs */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-indigo-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Live Stream
            </h3>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 font-semibold">
            {counts.ALL} Events
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {['ALL', 'TASKS', 'ROOM', 'CONFLICTS'].map((tab) => (
            <button
              key={tab}
              onClick={() => onFilterChange && onFilterChange(tab)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all shrink-0 ${
                filter === tab
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab} ({counts[tab] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Activity Item List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {activities.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-xs text-slate-400 dark:text-slate-500 italic">
            <Clock className="h-6 w-6 mb-2 opacity-50" />
            <span>No activity recorded in this room yet.</span>
          </div>
        ) : (
          activities.map((act) => {
            const conf = EVENT_CONFIG[act.type] || EVENT_CONFIG.TASK_UPDATED;
            const Icon = conf.icon;

            return (
              <div
                key={act.activityId || act.id}
                onClick={() => act.taskId && onSelectTask && onSelectTask(act.taskId)}
                className={`p-3 rounded-xl border transition-all text-xs flex items-start gap-2.5 ${
                  act.taskId ? 'cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700' : ''
                } bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800/80 shadow-sm`}
              >
                {/* Event Icon Badge */}
                <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${conf.color}`}>
                  <Icon className="h-3.5 w-3.5" />
                </div>

                {/* Event Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-semibold text-slate-900 dark:text-slate-200 truncate">
                      {act.userName}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0">
                      {formatTimestamp(act.timestamp)}
                    </span>
                  </div>

                  <p className="text-slate-600 dark:text-slate-400 text-[11px] leading-relaxed">
                    {act.type === 'USER_JOINED' && 'joined the workspace'}
                    {act.type === 'USER_LEFT' && 'left the workspace'}
                    {act.type === 'TASK_CREATED' && (
                      <>
                        created <span className="font-medium text-slate-900 dark:text-slate-200">"{act.taskTitle}"</span>
                      </>
                    )}
                    {act.type === 'TASK_MOVED' && (
                      <>
                        moved <span className="font-medium text-slate-900 dark:text-slate-200">"{act.taskTitle}"</span> to{' '}
                        <span className="font-mono font-bold text-cyan-600 dark:text-cyan-400">
                          {act.metadata?.newStatus || 'next column'}
                        </span>
                      </>
                    )}
                    {act.type === 'TASK_UPDATED' && (
                      <>
                        updated <span className="font-medium text-slate-900 dark:text-slate-200">"{act.taskTitle}"</span>
                      </>
                    )}
                    {act.type === 'TASK_DELETED' && 'deleted a task card'}
                    {act.type === 'TASK_CONFLICT' && (
                      <span className="text-rose-600 dark:text-rose-400 font-semibold">
                        Version conflict on "{act.taskTitle}"
                      </span>
                    )}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

import React from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  SkipForward, 
  SkipBack, 
  Clock, 
  Film, 
  Sparkles,
  Layers,
  X
} from 'lucide-react';
import { useSessionReplay } from '../hooks/useSessionReplay';

const COLUMNS = [
  { id: 'TODO', title: 'To Do' },
  { id: 'IN_PROGRESS', title: 'In Progress' },
  { id: 'DONE', title: 'Done' },
];

/**
 * Consolidated Session Replay Modal & Engine
 */
export default function SessionReplayModal({ isOpen, onClose, roomId }) {
  const {
    events,
    currentStepIndex,
    currentEvent,
    reconstructedTasks,
    isPlaying,
    speed,
    isLoading,
    error,
    totalSteps,
    play,
    pause,
    restart,
    stepForward,
    stepBackward,
    jumpToStep,
    setSpeedMultiplier,
  } = useSessionReplay(isOpen ? roomId : null);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in select-none">
      <div className="w-full max-w-5xl h-[85vh] max-h-[850px] bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="h-16 px-6 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Film className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">Deterministic Session Replay</h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  Room: {roomId}
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Reconstruct historical board states step-by-step from persisted collaboration events.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <Sparkles className="h-8 w-8 text-indigo-500 animate-spin mb-2" />
              <span className="text-xs">Loading chronological collaboration events...</span>
            </div>
          ) : totalSteps === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 italic">
              <Clock className="h-10 w-10 mb-3 opacity-40 text-indigo-500" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No Collaboration History Available Yet</h3>
              <p className="text-xs max-w-sm text-center">
                This room is fresh. Once real users create tasks and collaborate, their history will appear here.
              </p>
            </div>
          ) : (
            <>
              {/* Historical Reconstructed Board */}
              <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 overflow-y-auto mb-4 p-2 bg-slate-50/50 dark:bg-slate-900/30 rounded-2xl border border-slate-200/60 dark:border-slate-800/60">
                {COLUMNS.map((col) => {
                  const colTasks = reconstructedTasks.filter((t) => t.status === col.id);

                  return (
                    <div
                      key={col.id}
                      className="flex flex-col bg-white dark:bg-slate-900/80 rounded-xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800 mb-2">
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{col.title}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 font-bold">
                          {colTasks.length}
                        </span>
                      </div>
                      <div className="flex-1 overflow-y-auto space-y-2">
                        {colTasks.length === 0 ? (
                          <div className="py-6 text-center text-[11px] text-slate-400 italic">Empty</div>
                        ) : (
                          colTasks.map((t) => (
                            <div
                              key={t.id}
                              className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-xs"
                            >
                              <div className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t.title}</div>
                              {t.description && (
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2 mb-2">
                                  {t.description}
                                </p>
                              )}
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                                {t.priority}
                              </span>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Scrubber Timeline Bar */}
              <div className="space-y-2 shrink-0 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono">
                  <span>Step {currentStepIndex + 1} of {totalSteps}</span>
                  {currentEvent && (
                    <span className="text-indigo-600 dark:text-indigo-400 font-semibold truncate max-w-md">
                      {currentEvent.userName}: {currentEvent.type.replace('_', ' ')}
                    </span>
                  )}
                </div>
                <input
                  type="range"
                  min="0"
                  max={totalSteps - 1}
                  value={currentStepIndex}
                  onChange={(e) => jumpToStep(parseInt(e.target.value, 10))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
              </div>

              {/* Playback Controls & Speed Multipliers */}
              <div className="flex items-center justify-between pt-3 shrink-0">
                {/* Playback Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={restart}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                    title="Restart"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button
                    onClick={stepBackward}
                    disabled={currentStepIndex <= 0}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 transition-colors"
                    title="Step Backward"
                  >
                    <SkipBack className="h-4 w-4" />
                  </button>
                  <button
                    onClick={isPlaying ? pause : play}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                  >
                    {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    <span className="text-xs">{isPlaying ? 'Pause' : 'Play'}</span>
                  </button>
                  <button
                    onClick={stepForward}
                    disabled={currentStepIndex >= totalSteps - 1}
                    className="p-2 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-700 dark:text-slate-300 transition-colors"
                    title="Step Forward"
                  >
                    <SkipForward className="h-4 w-4" />
                  </button>
                </div>

                {/* Speed Multipliers */}
                <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  {[0.5, 1, 2].map((s) => (
                    <button
                      key={s}
                      onClick={() => setSpeedMultiplier(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                        speed === s
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
                      }`}
                    >
                      {s}×
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

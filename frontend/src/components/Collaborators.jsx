import React from 'react';
import { Users, Sparkles, Eye, Check, UserPlus } from 'lucide-react';

/**
 * Consolidated Collaborators List with Presence, Follow Mode, and Spotlight
 */
export default function Collaborators({
  users = [],
  currentUserId,
  followedUserId,
  onToggleFollow,
  isSpotlightActive = false,
  onToggleSpotlight,
}) {
  return (
    <div className="flex flex-col select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
          <Users className="h-4 w-4 text-indigo-500" />
          <span>Collaborators ({users.length})</span>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          Live Presence
        </span>
      </div>

      {/* Collaborator Cards */}
      <div className="mt-3 space-y-2.5">
        {users.length === 0 ? (
          <div className="text-xs text-slate-400 dark:text-slate-500 py-3 italic text-center">
            Connecting to room presence...
          </div>
        ) : (
          <>
            {users.map((user) => {
              const isSelf = user.userId === currentUserId;
              const isFollowed = followedUserId === user.userId;

              return (
                <div
                  key={user.userId || user.socketId}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                    isSelf
                      ? 'bg-indigo-50/60 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-500/30 text-indigo-900 dark:text-indigo-100 shadow-sm'
                      : isFollowed
                      ? 'bg-white dark:bg-slate-900 border-indigo-500/60 shadow-md ring-1 ring-indigo-500/30'
                      : 'bg-white dark:bg-slate-900/60 border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-900 shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {/* User Color Avatar */}
                    <div
                      className="h-7 w-7 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm shrink-0 ring-2 ring-slate-100 dark:ring-slate-900"
                      style={{ backgroundColor: user.userColor || '#6366f1' }}
                    >
                      {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'U'}
                    </div>

                    {/* Name and You Tag */}
                    <div className="truncate">
                      <div className="text-xs font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{user.displayName}</span>
                        {isSelf && (
                          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-700 dark:text-indigo-200 border border-indigo-500/30 font-semibold">
                            You
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    {isSelf ? (
                      /* Spotlight Toggle */
                      <button
                        type="button"
                        onClick={onToggleSpotlight}
                        aria-label={isSpotlightActive ? 'Remove Spotlight' : 'Spotlight Me'}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isSpotlightActive
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30 font-bold'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        }`}
                        title={isSpotlightActive ? 'Deactivate Cursor Spotlight' : 'Broadcast Spotlight on your cursor'}
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>{isSpotlightActive ? 'Spotlighted' : 'Spotlight Me'}</span>
                      </button>
                    ) : (
                      /* Follow Button */
                      <button
                        type="button"
                        onClick={() => onToggleFollow && onToggleFollow(user.userId)}
                        aria-label={isFollowed ? `Stop Following ${user.displayName}` : `Follow ${user.displayName}`}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          isFollowed
                            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 font-bold'
                            : 'bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700'
                        }`}
                        title={isFollowed ? 'Stop following this collaborator' : "Follow this collaborator's live movements"}
                      >
                        {isFollowed ? (
                          <>
                            <Check className="h-3 w-3 text-indigo-200" />
                            <span>Following</span>
                          </>
                        ) : (
                          <>
                            <Eye className="h-3 w-3 text-indigo-500" />
                            <span>Follow</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {users.length === 1 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-2 mt-2">
                <UserPlus className="h-3.5 w-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <span>You're the only collaborator in this room. Share the Room ID to invite teammates.</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

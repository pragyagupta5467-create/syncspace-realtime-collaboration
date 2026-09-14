import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Layers, 
  Sparkles, 
  ArrowRight, 
  Users, 
  MousePointer, 
  ShieldCheck, 
  Clock, 
  LayoutDashboard,
  Film,
  LogIn,
  RefreshCw,
  AlertCircle,
  UserPlus
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getUserSession, generateRoomId, isValidRoomId, addRecentRoom } from '../utils/userSession';
import { ThemeToggle } from '../components/UI';
import { createRoomApi } from '../services/api';

export default function Landing() {
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();
  const [roomIdInput, setRoomIdInput] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const activeUser = user ? {
    userId: user.userId || user.id,
    displayName: user.name,
    userColor: user.userColor || '#6366f1',
  } : getUserSession();

  const handleCreateRoom = async () => {
    setIsCreating(true);
    setError('');
    const newRoomId = generateRoomId();

    try {
      await createRoomApi(newRoomId, activeUser);
      addRecentRoom({ roomId: newRoomId, role: 'Creator' });
      navigate(`/room/${newRoomId}`);
    } catch (err) {
      console.warn('API room creation fallback to direct join:', err.message);
      addRecentRoom({ roomId: newRoomId, role: 'Creator' });
      navigate(`/room/${newRoomId}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoomSubmit = (e) => {
    e.preventDefault();
    const clean = roomIdInput.trim().toUpperCase();
    if (!isValidRoomId(clean)) {
      setError('Please enter a valid Room ID (e.g. SYNC-7K9P)');
      return;
    }
    addRecentRoom({ roomId: clean, role: 'Member' });
    navigate(`/room/${clean}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col selection:bg-indigo-500 selection:text-white transition-colors duration-200">
      
      {/* Top Navigation */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 sticky top-0">
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-600/20">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-500 dark:from-indigo-400 dark:to-cyan-300">
            SyncSpace
          </span>
        </Link>

        <div className="flex items-center gap-2.5 sm:gap-3">
          <ThemeToggle />

          {isAuthenticated ? (
            <>
              <button
                onClick={() => navigate('/dashboard')}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors flex items-center gap-1.5"
              >
                <LayoutDashboard className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </button>

              <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hidden sm:flex">
                <div
                  className="h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                  style={{ backgroundColor: user?.userColor || '#6366f1' }}
                >
                  {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
                </div>
                <span className="text-xs font-semibold truncate max-w-[100px]">{user?.name}</span>
              </div>
            </>
          ) : (
            <>
              <Link
                to="/login"
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-900 transition-colors flex items-center gap-1.5"
              >
                <LogIn className="h-4 w-4" />
                <span>Login</span>
              </Link>

              <Link
                to="/signup"
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors flex items-center gap-1.5"
              >
                <UserPlus className="h-4 w-4 text-indigo-500" />
                <span className="hidden sm:inline">Create Account</span>
              </Link>
            </>
          )}

          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
          >
            {isCreating ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Launching...</span>
              </>
            ) : (
              <>
                <span>Launch Room</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center max-w-5xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Real-Time Multiplayer Collaborative Workspace</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-6 max-w-3xl leading-tight">
          Collaborate at the speed of thought with{' '}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500 dark:from-indigo-400 dark:to-cyan-300">
            instant multiplayer sync
          </span>
        </h1>

        <p className="text-base md:text-lg text-slate-600 dark:text-slate-400 max-w-2xl mb-10 leading-relaxed">
          Real-time collaborative Kanban task boards, ~30 FPS multiplayer cursor tracking, Optimistic Concurrency Control,
          persistent activity feeds, and deterministic session replay.
        </p>

        {/* Action Buttons & Room Join Form */}
        <div className="w-full max-w-md bg-white dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-xl mb-12">
          <button
            onClick={handleCreateRoom}
            disabled={isCreating}
            className="w-full py-3 rounded-2xl font-bold text-sm text-white bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2 mb-4"
          >
            {isCreating ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>Creating Real Room...</span>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                <span>Create New Room</span>
              </>
            )}
          </button>

          <div className="relative flex py-2 items-center">
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            <span className="flex-shrink mx-4 text-xs font-mono text-slate-400 uppercase">Or join with ID</span>
            <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
          </div>

          <form onSubmit={handleJoinRoomSubmit} className="mt-3 space-y-3">
            <div className="relative">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => {
                  setRoomIdInput(e.target.value.toUpperCase());
                  setError('');
                }}
                placeholder="Enter Room ID (e.g. SYNC-7K9P)"
                className="w-full px-4 py-2.5 rounded-xl text-sm font-mono uppercase bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-rose-500 text-left">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl font-semibold text-xs text-slate-800 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Join Existing Room</span>
            </button>
          </form>
        </div>

        {/* Feature Grid Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full text-left">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
            <MousePointer className="h-6 w-6 text-indigo-500 mb-3" />
            <h3 className="text-sm font-bold mb-1">Live Multiplayer Cursors</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Low-latency normalized cursor projection, radar rings, and ephemeral spotlights.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
            <ShieldCheck className="h-6 w-6 text-emerald-500 mb-3" />
            <h3 className="text-sm font-bold mb-1">Conflict-Free OCC Tasks</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Version-based optimistic concurrency control prevents lost updates with visual resolution diffs.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
            <Film className="h-6 w-6 text-cyan-500 mb-3" />
            <h3 className="text-sm font-bold mb-1">Deterministic Session Replay</h3>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Reconstruct workspace state milestone-by-milestone from persisted MongoDB collaboration streams.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="h-14 border-t border-slate-200 dark:border-slate-800/80 px-6 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-700 dark:text-slate-300">SyncSpace</span>
          <span>•</span>
          <span>Real-Time Multiplayer Workspace</span>
        </div>
        <div>
          {isAuthenticated ? (
            <span>Signed in as <span className="font-semibold text-indigo-600 dark:text-indigo-400">{user?.name}</span></span>
          ) : (
            <span>Guest Session Active</span>
          )}
        </div>
      </footer>

    </div>
  );
}

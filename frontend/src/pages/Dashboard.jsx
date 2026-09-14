import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Layers, 
  Plus, 
  LogIn, 
  Clock, 
  ArrowRight, 
  LayoutGrid, 
  Users, 
  Activity as ActivityIcon, 
  Sparkles, 
  Home,
  CheckCircle2,
  RefreshCw,
  LogOut,
  Mail,
  FolderPlus,
  Search,
  Sliders,
  Settings,
  Menu,
  X,
  Copy,
  Check,
  Compass,
  FileCheck2,
  Shield,
  Zap,
  ExternalLink
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { generateRoomId, isValidRoomId, getRecentRooms, addRecentRoom } from '../utils/userSession';
import { ThemeToggle, Modal, UserProfileMenu } from '../components/UI';
import { NotificationBell } from '../components/Notifications';
import { createRoomApi, getUserRoomsApi, getRoomTasksApi } from '../services/api';

/**
 * Animated Number Counter Hook
 * Smoothly animates from 0 to target real integer value
 */
function useAnimatedCounter(targetValue, duration = 800) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (typeof targetValue !== 'number' || isNaN(targetValue) || targetValue <= 0) {
      setCount(0);
      return;
    }

    let start = 0;
    const end = targetValue;
    const stepTime = 20;
    const totalSteps = Math.max(1, Math.floor(duration / stepTime));
    const stepIncrement = end / totalSteps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      start += stepIncrement;
      if (currentStep >= totalSteps || start >= end) {
        setCount(end);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, stepTime);

    return () => clearInterval(timer);
  }, [targetValue, duration]);

  return count;
}

/**
 * Format relative time string
 */
function formatVisitedTime(isoString) {
  if (!isoString) return 'Recently';
  const d = new Date(isoString);
  const now = new Date();
  const diffSec = Math.max(0, Math.floor((now - d) / 1000));
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  const diffDays = Math.floor(diffSec / 86400);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  // Navigation and view state
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' | 'workspaces' | 'activity' | 'settings'
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Real data state
  const [dbRooms, setDbRooms] = useState([]);
  const [recentRooms, setRecentRooms] = useState(() => getRecentRooms());
  const [roomTasksMap, setRoomTasksMap] = useState({});
  const [isLoadingRooms, setIsLoadingRooms] = useState(true);

  // Global Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchContainerRef = useRef(null);

  // Create & Join Modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [customRoomId, setCustomRoomId] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [joinModalOpen, setJoinModalOpen] = useState(false);
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinError, setJoinError] = useState('');

  // Copied room feedback
  const [copiedRoomId, setCopiedRoomId] = useState(null);

  // Fetch real rooms created by this user from MongoDB
  useEffect(() => {
    let isMounted = true;

    const fetchUserRooms = async () => {
      setIsLoadingRooms(true);
      try {
        const rooms = await getUserRoomsApi();
        if (isMounted) {
          setDbRooms(rooms || []);
        }
      } catch (err) {
        console.warn('[Dashboard] Could not load DB rooms, using recent cache:', err.message);
      } finally {
        if (isMounted) {
          setIsLoadingRooms(false);
        }
      }
    };

    if (user) {
      fetchUserRooms();
    }
    return () => { isMounted = false; };
  }, [user]);

  // Combine DB rooms with local visited rooms (avoiding duplicates)
  const allUserRooms = useMemo(() => {
    const map = new Map();
    for (const r of dbRooms) {
      if (r?.roomId) {
        const clean = r.roomId.toUpperCase();
        map.set(clean, {
          roomId: clean,
          role: 'Owner / Creator',
          lastVisited: r.updatedAt || r.createdAt,
        });
      }
    }
    for (const r of recentRooms) {
      if (r?.roomId) {
        const clean = r.roomId.toUpperCase();
        if (!map.has(clean)) {
          map.set(clean, {
            ...r,
            roomId: clean,
            role: r.role || 'Collaborator',
            lastVisited: r.lastVisited || new Date().toISOString(),
          });
        }
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.lastVisited) - new Date(a.lastVisited)
    );
  }, [dbRooms, recentRooms]);

  // Load real task counts for the first 5 rooms to show real aggregate statistics
  useEffect(() => {
    let isMounted = true;
    const loadSampleTasks = async () => {
      const topRooms = allUserRooms.slice(0, 6);
      const newMap = {};
      for (const r of topRooms) {
        try {
          const tasks = await getRoomTasksApi(r.roomId);
          if (isMounted) {
            newMap[r.roomId] = tasks || [];
          }
        } catch (e) {}
      }
      if (isMounted && Object.keys(newMap).length > 0) {
        setRoomTasksMap((prev) => ({ ...prev, ...newMap }));
      }
    };

    if (allUserRooms.length > 0) {
      loadSampleTasks();
    }
    return () => { isMounted = false; };
  }, [allUserRooms]);

  // Calculate real metrics
  const totalTasksCount = useMemo(() => {
    let count = 0;
    for (const taskList of Object.values(roomTasksMap)) {
      count += taskList.length;
    }
    return count;
  }, [roomTasksMap]);

  const completedTasksCount = useMemo(() => {
    let count = 0;
    for (const taskList of Object.values(roomTasksMap)) {
      count += taskList.filter((t) => t.status === 'DONE').length;
    }
    return count;
  }, [roomTasksMap]);

  // Animated counters for real metrics
  const animatedRoomsCount = useAnimatedCounter(allUserRooms.length);
  const animatedTasksCount = useAnimatedCounter(totalTasksCount);
  const animatedDoneCount = useAnimatedCounter(completedTasksCount);

  // Global Search filtering (Searches real rooms and real tasks)
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { rooms: [], tasks: [] };

    const matchingRooms = allUserRooms.filter((r) =>
      r.roomId.toLowerCase().includes(q)
    );

    const matchingTasks = [];
    for (const [roomId, taskList] of Object.entries(roomTasksMap)) {
      for (const t of taskList) {
        if (
          t.title?.toLowerCase().includes(q) ||
          t.description?.toLowerCase().includes(q)
        ) {
          matchingTasks.push({ ...t, roomId });
        }
      }
    }

    return {
      rooms: matchingRooms.slice(0, 5),
      tasks: matchingTasks.slice(0, 5),
    };
  }, [searchQuery, allUserRooms, roomTasksMap]);

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target)
      ) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Room Copy
  const handleCopyRoom = (roomId, e) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(roomId);
    setCopiedRoomId(roomId);
    setTimeout(() => setCopiedRoomId(null), 2000);
  };

  // Handle Create Room
  const handleCreateSubmit = async (e) => {
    if (e) e.preventDefault();
    setIsCreating(true);
    setCreateError('');

    const targetRoomId = customRoomId.trim()
      ? customRoomId.trim().toUpperCase()
      : generateRoomId();

    if (!isValidRoomId(targetRoomId)) {
      setCreateError('Invalid Room ID format. Use standard format like SYNC-7K9P.');
      setIsCreating(false);
      return;
    }

    try {
      const creatorPayload = {
        userId: user?.userId || user?.id,
        displayName: user?.name,
        userColor: user?.userColor || '#6366f1',
      };
      await createRoomApi(targetRoomId, creatorPayload);
      addRecentRoom({ roomId: targetRoomId, role: 'Creator' });
      setRecentRooms(getRecentRooms());
      setCreateModalOpen(false);
      navigate(`/room/${targetRoomId}`);
    } catch (err) {
      console.warn('API room creation fallback to direct join:', err.message);
      addRecentRoom({ roomId: targetRoomId, role: 'Creator' });
      setRecentRooms(getRecentRooms());
      setCreateModalOpen(false);
      navigate(`/room/${targetRoomId}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle Join Room
  const handleJoinSubmit = (e) => {
    e.preventDefault();
    const clean = joinRoomId.trim().toUpperCase();
    if (!isValidRoomId(clean)) {
      setJoinError('Please enter a valid Room ID (e.g. SYNC-7K9P)');
      return;
    }
    addRecentRoom({ roomId: clean, role: 'Member' });
    setRecentRooms(getRecentRooms());
    setJoinModalOpen(false);
    navigate(`/room/${clean}`);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const openCreateModal = () => {
    setCustomRoomId(generateRoomId());
    setCreateError('');
    setCreateModalOpen(true);
  };

  const openJoinModal = () => {
    setJoinRoomId('');
    setJoinError('');
    setJoinModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200 font-sans">
      {/* SaaS Dashboard Container */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar (Desktop) */}
        <aside className="hidden md:flex w-64 border-r border-slate-200 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md p-4 flex-col justify-between shrink-0 select-none">
          <div className="space-y-6">
            {/* Logo */}
            <Link
              to="/"
              className="flex items-center gap-2.5 px-2 py-1.5 hover:opacity-90 transition-opacity"
            >
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
                <Layers className="h-5 w-5" />
              </div>
              <span className="font-extrabold text-lg tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-cyan-500 dark:from-indigo-400 dark:to-cyan-300">
                SyncSpace
              </span>
            </Link>

            {/* Main Navigation Links */}
            <nav className="space-y-1">
              <button
                type="button"
                onClick={() => setActiveTab('dashboard')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'dashboard'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Home className="h-4 w-4" />
                <span>Dashboard</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('workspaces')}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'workspaces'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <LayoutGrid className="h-4 w-4" />
                  <span>My Workspaces</span>
                </div>
                {allUserRooms.length > 0 && (
                  <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full font-bold ${
                    activeTab === 'workspaces'
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                  }`}>
                    {allUserRooms.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('activity')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'activity'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <ActivityIcon className="h-4 w-4" />
                <span>Recent Activity</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === 'settings'
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </button>
            </nav>

            {/* Quick Workspace Shortcuts List */}
            {allUserRooms.length > 0 && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2">
                  Quick Access
                </span>
                <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                  {allUserRooms.slice(0, 5).map((r) => (
                    <button
                      key={r.roomId}
                      type="button"
                      onClick={() => navigate(`/room/${r.roomId}`)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all flex items-center justify-between group"
                    >
                      <span className="truncate">{r.roomId}</span>
                      <ArrowRight className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-500" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar Footer Action */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80">
            <button
              type="button"
              onClick={openCreateModal}
              className="w-full py-2.5 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Workspace</span>
            </button>
          </div>
        </aside>

        {/* Mobile Sidebar Overlay Drawer */}
        {mobileSidebarOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex">
            <div className="w-64 bg-white dark:bg-slate-900 h-full p-4 flex flex-col justify-between shadow-2xl animate-in slide-in-from-left duration-200">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                      <Layers className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-base text-slate-900 dark:text-white">
                      SyncSpace
                    </span>
                  </div>
                  <button
                    onClick={() => setMobileSidebarOpen(false)}
                    className="p-1 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <nav className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('dashboard');
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      activeTab === 'dashboard'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Home className="h-4 w-4" />
                    <span>Dashboard</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('workspaces');
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      activeTab === 'workspaces'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <LayoutGrid className="h-4 w-4" />
                    <span>My Workspaces</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('activity');
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      activeTab === 'activity'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <ActivityIcon className="h-4 w-4" />
                    <span>Recent Activity</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('settings');
                      setMobileSidebarOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold ${
                      activeTab === 'settings'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    <Settings className="h-4 w-4" />
                    <span>Settings</span>
                  </button>
                </nav>
              </div>

              <button
                type="button"
                onClick={() => {
                  setMobileSidebarOpen(false);
                  openCreateModal();
                }}
                className="w-full py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Workspace</span>
              </button>
            </div>
            <div className="flex-1" onClick={() => setMobileSidebarOpen(false)} />
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Header */}
          <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 shrink-0">
            <div className="flex items-center gap-3 flex-1 max-w-xl">
              <button
                type="button"
                onClick={() => setMobileSidebarOpen(true)}
                className="md:hidden p-2 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Menu className="h-5 w-5" />
              </button>

              {/* Global Real-Time Search Bar */}
              <div className="relative flex-1" ref={searchContainerRef}>
                <div className="relative flex items-center">
                  <Search className="h-4 w-4 text-slate-400 absolute left-3 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsSearchFocused(true);
                    }}
                    onFocus={() => setIsSearchFocused(true)}
                    placeholder="Search workspaces and tasks..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white placeholder-slate-400 transition-all"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                {/* Floating Search Results Dropdown */}
                {isSearchFocused && searchQuery.trim() && (
                  <div className="absolute left-0 right-0 mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl z-50 p-2 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150 max-h-80 overflow-y-auto">
                    {searchResults.rooms.length === 0 &&
                    searchResults.tasks.length === 0 ? (
                      <div className="py-6 text-center text-xs text-slate-400">
                        No matching workspaces or tasks found.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {searchResults.rooms.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2">
                              Workspaces
                            </span>
                            {searchResults.rooms.map((r) => (
                              <button
                                key={r.roomId}
                                type="button"
                                onClick={() => {
                                  setIsSearchFocused(false);
                                  navigate(`/room/${r.roomId}`);
                                }}
                                className="w-full text-left p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                              >
                                <div className="flex items-center gap-2">
                                  <LayoutGrid className="h-3.5 w-3.5 text-indigo-500" />
                                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                                    {r.roomId}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400">
                                  {r.role}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}

                        {searchResults.tasks.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block px-2">
                              Tasks
                            </span>
                            {searchResults.tasks.map((t) => (
                              <button
                                key={t.id || t.taskId}
                                type="button"
                                onClick={() => {
                                  setIsSearchFocused(false);
                                  navigate(`/room/${t.roomId}`);
                                }}
                                className="w-full text-left p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-slate-800 flex items-center justify-between text-xs transition-colors"
                              >
                                <div>
                                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                                    {t.title}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-400">
                                    Room: {t.roomId} • Status: {t.status}
                                  </div>
                                </div>
                                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 font-bold">
                                  {t.priority}
                                </span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Header Right Actions */}
            <div className="flex items-center gap-2.5">
              <ThemeToggle />
              <NotificationBell currentUser={user} />
              <UserProfileMenu user={user} onLogout={handleLogout} />
            </div>
          </header>

          {/* Main Workspace Body Scroll View */}
          <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8">
            {/* View 1: DASHBOARD OVERVIEW */}
            {activeTab === 'dashboard' && (
              <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300">
                {/* SaaS Welcome Hero Card */}
                <div className="p-6 md:p-8 rounded-3xl bg-gradient-to-r from-indigo-600/10 via-cyan-500/10 to-indigo-600/5 dark:from-indigo-950/40 dark:via-cyan-950/20 dark:to-slate-900/40 border border-indigo-200/60 dark:border-indigo-500/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 mb-2">
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Authenticated Account: {user?.email || 'User'}</span>
                    </div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                      Welcome back, {user?.name || 'Collaborator'} 👋
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 mt-1 max-w-xl leading-relaxed">
                      Collaborate. Sync. Build together in real-time. Manage Kanban task boards, coordinate multiplayer cursors, and replay session events.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="px-4 py-2.5 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      <span>Create Workspace</span>
                    </button>
                    <button
                      type="button"
                      onClick={openJoinModal}
                      className="px-4 py-2.5 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm transition-colors flex items-center gap-1.5"
                    >
                      <LogIn className="h-4 w-4" />
                      <span>Join Workspace</span>
                    </button>
                  </div>
                </div>

                {/* Real Animated Statistics Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
                      <span>Total Workspaces</span>
                      <LayoutGrid className="h-4 w-4 text-indigo-500" />
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono">
                      {animatedRoomsCount}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Active collaborative rooms linked to your account
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
                      <span>Tasks Tracked</span>
                      <FileCheck2 className="h-4 w-4 text-cyan-500" />
                    </div>
                    <div className="text-3xl font-extrabold text-slate-900 dark:text-white font-mono flex items-baseline gap-2">
                      <span>{animatedTasksCount}</span>
                      {totalTasksCount > 0 && (
                        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          ({animatedDoneCount} Done)
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Real Kanban tasks synchronized with MongoDB
                    </p>
                  </div>

                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-semibold mb-2">
                      <span>Multiplayer Engine</span>
                      <Zap className="h-4 w-4 text-amber-500" />
                    </div>
                    <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 mt-2">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>WebSocket & OCC Consensus</span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5">
                      ~30 FPS cursor streaming & optimistic concurrency
                    </p>
                  </div>
                </div>

                {/* Workspaces Grid Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Compass className="h-4 w-4 text-indigo-500" />
                        <span>Your Workspaces</span>
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Click any workspace card to enter live collaboration
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>New Workspace</span>
                    </button>
                  </div>

                  {isLoadingRooms ? (
                    /* Loading Skeleton Cards */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className="p-5 rounded-2xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 space-y-4 animate-shimmer"
                        >
                          <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2" />
                          <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded w-1/3" />
                          <div className="h-9 bg-slate-100 dark:bg-slate-800/80 rounded-xl" />
                        </div>
                      ))}
                    </div>
                  ) : allUserRooms.length === 0 ? (
                    /* Honest Empty State */
                    <div className="p-8 md:p-12 rounded-3xl bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 text-center flex flex-col items-center justify-center space-y-3">
                      <div className="h-14 w-14 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center border border-indigo-500/20">
                        <FolderPlus className="h-7 w-7" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        No workspaces yet
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm leading-relaxed">
                        Create your first collaborative workspace to start organizing tasks, coordinating real-time cursors, and synchronizing with your team.
                      </p>
                      <button
                        onClick={openCreateModal}
                        className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/20 mt-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>Create Workspace</span>
                      </button>
                    </div>
                  ) : (
                    /* Interactive Room Cards Grid */
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {allUserRooms.map((room) => {
                        const tasksInRoom = roomTasksMap[room.roomId] || [];
                        const isCopied = copiedRoomId === room.roomId;

                        return (
                          <div
                            key={room.roomId}
                            className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-500/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-200 flex flex-col justify-between space-y-4 group cursor-pointer"
                            onClick={() => navigate(`/room/${room.roomId}`)}
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-mono font-extrabold text-indigo-600 dark:text-indigo-400 tracking-wider">
                                    {room.roomId}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => handleCopyRoom(room.roomId, e)}
                                    className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                    title="Copy Room ID"
                                  >
                                    {isCopied ? (
                                      <Check className="h-3 w-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="h-3 w-3" />
                                    )}
                                  </button>
                                </div>

                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold shrink-0">
                                  {room.role || 'Member'}
                                </span>
                              </div>

                              <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5 font-mono">
                                <Clock className="h-3 w-3" />
                                <span>Active {formatVisitedTime(room.lastVisited)}</span>
                              </div>
                            </div>

                            {/* Task metrics snippet */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between text-xs">
                              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                                {tasksInRoom.length > 0
                                  ? `${tasksInRoom.length} task${tasksInRoom.length > 1 ? 's' : ''}`
                                  : 'Collaborative Workspace'}
                              </span>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/room/${room.roomId}`);
                                }}
                                className="px-3 py-1.5 rounded-xl text-xs font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 group-hover:bg-indigo-600 group-hover:text-white dark:group-hover:bg-indigo-600 transition-all flex items-center gap-1 shadow-sm"
                              >
                                <span>Open</span>
                                <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* View 2: MY WORKSPACES TAB */}
            {activeTab === 'workspaces' && (
              <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-300">
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800">
                  <div>
                    <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                      My Collaborative Workspaces
                    </h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      All workspaces created by or shared with {user?.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openCreateModal}
                    className="px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
                  >
                    <Plus className="h-4 w-4" />
                    <span>New Workspace</span>
                  </button>
                </div>

                {allUserRooms.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    No workspaces found. Create your first workspace to begin.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {allUserRooms.map((room) => (
                      <div
                        key={room.roomId}
                        onClick={() => navigate(`/room/${room.roomId}`)}
                        className="p-5 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col justify-between space-y-4 cursor-pointer"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
                              {room.roomId}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {room.role}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            Last visited {formatVisitedTime(room.lastVisited)}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="w-full py-2 rounded-xl text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-center gap-1"
                        >
                          <span>Enter Workspace</span>
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View 3: RECENT ACTIVITY TAB */}
            {activeTab === 'activity' && (
              <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300">
                <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    Workspace Collaboration History
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Real-time timeline of tasks, assignments, and collaborative events
                  </p>
                </div>

                {allUserRooms.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No activity records yet. Create a workspace to start logging collaborative history.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {allUserRooms.map((r) => (
                      <div
                        key={r.roomId}
                        onClick={() => navigate(`/room/${r.roomId}`)}
                        className="p-4 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 transition-all flex items-center justify-between cursor-pointer"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center font-bold">
                            <ActivityIcon className="h-4 w-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 dark:text-white">
                              Active Workspace: {r.roomId}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              Role: {r.role} • Visited {formatVisitedTime(r.lastVisited)}
                            </div>
                          </div>
                        </div>
                        <span className="text-xs text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-semibold">
                          <span>View Stream</span>
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* View 4: SETTINGS & ACCOUNT TAB */}
            {activeTab === 'settings' && (
              <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
                <div className="pb-4 border-b border-slate-200 dark:border-slate-800">
                  <h1 className="text-xl font-extrabold text-slate-900 dark:text-white">
                    Account & Preferences
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Manage your personal presence color, theme mode, and security profile
                  </p>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-4">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Profile Information
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Full Name</label>
                      <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {user?.name || 'User'}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-slate-400 block mb-1">Email Address</label>
                      <div className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-mono text-slate-800 dark:text-slate-200">
                        {user?.email || 'N/A'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                        Real-time Presence Color
                      </span>
                      <span className="text-[11px] text-slate-400 font-mono">
                        Authoritative cursor & spotlight identification
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className="h-5 w-5 rounded-full shadow-sm"
                        style={{ backgroundColor: user?.userColor || '#6366f1' }}
                      />
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                        {user?.userColor || '#6366f1'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Session Security
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Your session is authenticated via signed cryptographic JSON Web Tokens (JWT).
                  </p>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="py-2 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 text-xs font-semibold border border-rose-200 dark:border-rose-900/40 hover:bg-rose-100 transition-colors"
                  >
                    Sign Out Account
                  </button>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Interactive Create Room Modal */}
      <Modal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        title="Create Real-Time Workspace"
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Workspace Identifier *
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customRoomId}
                onChange={(e) => {
                  setCustomRoomId(e.target.value.toUpperCase());
                  setCreateError('');
                }}
                placeholder="e.g. SYNC-7K9P"
                className="flex-1 px-3 py-2.5 rounded-xl text-sm font-mono uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="button"
                onClick={() => setCustomRoomId(generateRoomId())}
                className="px-3 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors"
                title="Generate new ID"
              >
                Randomize
              </button>
            </div>
            {createError && <p className="text-xs text-rose-500 mt-1">{createError}</p>}
            <p className="text-[11px] text-slate-400 mt-1">
              This will create a persistent MongoDB room with Socket.IO channels.
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 disabled:opacity-60"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  <span>Create Workspace</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Interactive Join Room Modal */}
      <Modal
        isOpen={joinModalOpen}
        onClose={() => setJoinModalOpen(false)}
        title="Join Existing Workspace"
      >
        <form onSubmit={handleJoinSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Workspace Identifier *
            </label>
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => {
                setJoinRoomId(e.target.value.toUpperCase());
                setJoinError('');
              }}
              placeholder="e.g. SYNC-7K9P"
              className="w-full px-3 py-2.5 rounded-xl text-sm font-mono uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {joinError && <p className="text-xs text-rose-500 mt-1">{joinError}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setJoinModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Join Workspace</span>
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

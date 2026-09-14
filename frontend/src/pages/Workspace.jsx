import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Layers, 
  Copy, 
  Check, 
  LogOut, 
  Users, 
  Film, 
  Activity as ActivityIcon, 
  ArrowLeft,
  LayoutGrid,
  MousePointer,
  AlertTriangle,
  X,
  RefreshCw,
  AlertCircle,
  Bot,
  Video,
  PhoneCall
} from 'lucide-react';
import { getUserSession, isValidRoomId, addRecentRoom } from '../utils/userSession';
import { useRoom } from '../hooks/useRoom';
import { useSocket } from '../hooks/useSocket';
import { useMultiplayerCursors } from '../hooks/useMultiplayerCursors';
import { useCollaborativeBoard } from '../hooks/useCollaborativeBoard';
import { useActivityFeed } from '../hooks/useActivityFeed';
import { useWebRTC } from '../hooks/useWebRTC';
import { ThemeToggle, ConnectionBadge, UserProfileMenu } from '../components/UI';
import Collaborators from '../components/Collaborators';
import MultiplayerCursorsOverlay from '../components/Cursor';
import TaskBoard from '../components/TaskBoard';
import ActivityFeed from '../components/ActivityFeed';
import SessionReplayModal from '../components/Replay';
import AIAssistant from '../components/AIAssistant';
import VideoCall from '../components/VideoCall';
import { NotificationBell } from '../components/Notifications';
import { useAuth } from '../context/AuthContext';

export default function Workspace() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user: authUser } = useAuth();

  const currentUser = authUser
    ? {
        userId: authUser.userId || authUser.id,
        displayName: authUser.name,
        userColor: authUser.userColor || '#6366f1',
        email: authUser.email,
      }
    : getUserSession();

  const [copied, setCopied] = useState(false);
  const [showCollaboratorsDrawer, setShowCollaboratorsDrawer] = useState(false);
  const [showActivitySidebar, setShowActivitySidebar] = useState(true);
  const [rightSidebarTab, setRightSidebarTab] = useState('activity'); // 'activity' | 'ai'
  const [showMobileActivityDrawer, setShowMobileActivityDrawer] = useState(false);
  const [showMobileAiDrawer, setShowMobileAiDrawer] = useState(false);
  const [showReplayModal, setShowReplayModal] = useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState(null);
  const [followedUserId, setFollowedUserId] = useState(null);


  const canvasRef = useRef(null);
  const cleanRoomId = roomId ? roomId.trim().toUpperCase() : '';
  const isRoomValid = isValidRoomId(cleanRoomId);

  // Record room in recent visits
  useEffect(() => {
    if (isRoomValid) {
      addRecentRoom({ roomId: cleanRoomId, role: 'Collaborator' });
    }
  }, [cleanRoomId, isRoomValid]);

  // Initialize Room Hook
  const { 
    users, 
    initialTasks, 
    initialActivities, 
    connectionStatus, 
    isConnected, 
    isJoined,
    error: roomError,
    leaveRoom 
  } = useRoom(
    isRoomValid ? cleanRoomId : null,
    currentUser
  );

  const { socket } = useSocket();

  // Initialize WebRTC Video Calling Hook
  const {
    isInCall,
    isJoining: isJoiningCall,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isMinimized: isCallMinimized,
    setIsMinimized: setIsCallMinimized,
    peers: callPeers,
    localStream,
    callError,
    setCallError,
    activeCallStatus,
    startCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  } = useWebRTC({
    roomId: isRoomValid ? cleanRoomId : null,
    socket,
    isConnected,
    currentUser,
  });

  // Initialize Multiplayer Cursors Hook
  const { 
    remoteCursors, 
    containerDimensions, 
    handleMouseMove, 
    handleMouseLeave,
    isSpotlightActive,
    toggleSpotlight
  } = useMultiplayerCursors({
    containerRef: canvasRef,
    roomId: isRoomValid ? cleanRoomId : null,
    currentUser,
    socket,
    isConnected,
  });

  // Auto-disengage Follow mode if followed user leaves the room or disconnects
  useEffect(() => {
    if (followedUserId) {
      const isStillInRoom = users.some((u) => u.userId === followedUserId);
      if (!isStillInRoom) {
        setFollowedUserId(null);
      }
    }
  }, [users, followedUserId]);

  // Smooth scroll board/canvas when following a user's cursor
  useEffect(() => {
    if (!followedUserId || !canvasRef.current) return;
    const followedCursor = remoteCursors[followedUserId];
    if (followedCursor && containerDimensions.width > 0 && containerDimensions.height > 0) {
      const pixelX = (followedCursor.x / 100) * containerDimensions.width;
      const boardElement = canvasRef.current.querySelector('.overflow-x-auto');
      if (boardElement) {
        const targetScrollLeft = pixelX - boardElement.clientWidth / 2;
        boardElement.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      }
    }
  }, [followedUserId, remoteCursors, containerDimensions]);

  const handleToggleFollow = (targetUserId) => {
    if (targetUserId === currentUser.userId) return;
    setFollowedUserId((prev) => (prev === targetUserId ? null : targetUserId));
  };

  const followedUserObj = users.find((u) => u.userId === followedUserId);

  // Initialize Collaborative Task Board Hook
  const {
    tasks,
    activeConflict,
    resolveKeepCurrent,
    resolveRetryChanges,
    createTask,
    updateTask,
    moveTask,
    deleteTask,
  } = useCollaborativeBoard({
    roomId: isRoomValid ? cleanRoomId : null,
    socket,
    isConnected,
    currentUser,
    initialTasks,
  });

  // Initialize Real-Time Activity Feed Hook
  const {
    activities,
    filter: activityFilter,
    setFilter: setActivityFilter,
    counts: activityCounts,
  } = useActivityFeed({
    roomId: isRoomValid ? cleanRoomId : null,
    socket,
    isConnected,
    initialActivities,
  });

  const activeRemoteCursorCount = Object.keys(remoteCursors).length;

  const handleCopyRoomId = () => {
    if (!cleanRoomId) return;
    navigator.clipboard.writeText(cleanRoomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveRoom = () => {
    if (isInCall) {
      leaveCall();
    }
    leaveRoom();
    navigate('/dashboard');
  };

  const handleSelectTask = (taskId) => {
    if (!taskId) return;
    setHighlightedTaskId(taskId);
    setTimeout(() => setHighlightedTaskId(null), 3000);
    const el = document.getElementById(`task-card-${taskId}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // Invalid Room State
  if (!isRoomValid) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-xl space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Invalid Room Identifier</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The room identifier <span className="font-mono text-rose-500 font-semibold">{roomId || 'EMPTY'}</span> is malformed.
            </p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-2.5 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Return to Dashboard</span>
          </button>
        </div>
      </div>
    );
  }

  // Room Join Error State
  if (roomError) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-xl space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto border border-rose-500/20">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Unable to Join Workspace</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {roomError}
            </p>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={() => navigate('/dashboard')}
              className="flex-1 py-2.5 rounded-xl font-semibold text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Back to Dashboard
            </button>
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 rounded-xl font-semibold text-xs text-white bg-indigo-600 hover:bg-indigo-500 transition-all flex items-center justify-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Retry</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Initial Connection Loading State
  if (!isJoined) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white transition-colors duration-200">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <div className="h-12 w-12 rounded-2xl bg-indigo-600/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <RefreshCw className="h-6 w-6 animate-spin text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1">Connecting to Workspace...</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Room: <span className="font-bold text-indigo-600 dark:text-indigo-400">{cleanRoomId}</span>
            </p>
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Establishing real-time WebSocket session and synchronizing state...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col overflow-hidden transition-colors duration-200">
      
      {/* Top Header */}
      <header className="h-16 border-b border-slate-200 dark:border-slate-800/80 bg-white/80 dark:bg-slate-950/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between z-30 shrink-0 select-none">
        
        {/* Left: Brand & Room ID */}
        <div className="flex items-center gap-4">
          <div 
            onClick={() => navigate('/dashboard')} 
            className="flex items-center gap-2.5 cursor-pointer hover:opacity-90 transition-opacity"
          >
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-cyan-400 flex items-center justify-center shadow-md shadow-indigo-600/20">
              <Layers className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight text-slate-900 dark:text-white hidden sm:inline">
              SyncSpace
            </span>
          </div>

          <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          {/* Room ID Badge */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-inner">
            <span className="text-[11px] font-mono text-slate-500 uppercase hidden md:inline">
              Room:
            </span>
            <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-300 tracking-wider">
              {cleanRoomId}
            </span>
            <button
              onClick={handleCopyRoomId}
              className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ml-1"
              title="Copy Room ID"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Center: Live Connection Badge */}
        <div className="hidden md:flex items-center gap-3">
          <ConnectionBadge status={connectionStatus} />
        </div>

        {/* Right: Actions, Theme, Replay, Collaborators */}
        <div className="flex items-center gap-2.5">
          <ThemeToggle />
          <NotificationBell socket={socket} currentUser={currentUser} />

          {/* Audio/Video Live Call Header Button */}
          {isInCall ? (
            <button
              onClick={() => setIsCallMinimized(false)}
              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-500 text-white text-xs font-semibold shadow-md shadow-rose-600/20 ring-1 ring-rose-400 flex items-center gap-1.5 animate-pulse"
              title="In Active Call - Click to Expand"
            >
              <Video className="h-3.5 w-3.5" />
              <span>In Call · {1 + Object.keys(callPeers).length}</span>
            </button>
          ) : activeCallStatus.active ? (
            <button
              onClick={startCall}
              disabled={isJoiningCall}
              className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-300 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-500/20 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              title="Join Active Live Call"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
              </span>
              <span className="hidden sm:inline">Join Call</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-rose-500/20 font-bold">
                {activeCallStatus.participantCount}
              </span>
            </button>
          ) : (
            <button
              onClick={startCall}
              disabled={isJoiningCall}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              title="Start Video/Audio Call with Room Members"
            >
              <Video className="h-3.5 w-3.5 text-indigo-500" />
              <span className="hidden sm:inline">Start Call</span>
            </button>
          )}

          {/* Session Replay Trigger */}
          <button
            onClick={() => setShowReplayModal(true)}
            className="px-3 py-1.5 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
            title="Replay Collaboration History"
          >
            <Film className="h-3.5 w-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Replay</span>
          </button>

          {/* SyncSpace AI Assistant Button */}
          <button
            onClick={() => {
              if (showActivitySidebar && rightSidebarTab === 'ai') {
                setShowActivitySidebar(false);
              } else {
                setShowActivitySidebar(true);
                setRightSidebarTab('ai');
              }
              setShowMobileAiDrawer(true);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm ${
              showActivitySidebar && rightSidebarTab === 'ai'
                ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-md shadow-indigo-600/20 ring-1 ring-indigo-500'
                : 'bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-500/20'
            }`}
            title="Ask SyncSpace AI Assistant"
          >
            <Bot className="h-3.5 w-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Ask AI</span>
          </button>

          {/* Activity Toggle Button */}
          <button
            onClick={() => {
              if (showActivitySidebar && rightSidebarTab === 'activity') {
                setShowActivitySidebar(false);
              } else {
                setShowActivitySidebar(true);
                setRightSidebarTab('activity');
              }
              setShowMobileActivityDrawer(true);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
              showActivitySidebar && rightSidebarTab === 'activity'
                ? 'bg-indigo-600/10 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 font-semibold'
                : 'bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
            title="Toggle Activity Stream"
          >
            <ActivityIcon className="h-3.5 w-3.5 text-indigo-500" />
            <span className="hidden sm:inline">Activity</span>
            {activityCounts.ALL > 0 && (
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-bold">
                {activityCounts.ALL}
              </span>
            )}
          </button>

          {/* Mobile Collaborators Toggle */}
          <button
            onClick={() => setShowCollaboratorsDrawer(!showCollaboratorsDrawer)}
            className="lg:hidden px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-xs flex items-center gap-1.5"
          >
            <Users className="h-3.5 w-3.5 text-indigo-500" />
            <span>{users.length}</span>
          </button>

          {/* User Profile Menu Dropdown */}
          <UserProfileMenu
            user={authUser || { name: currentUser.displayName, email: currentUser.email, userColor: currentUser.userColor }}
            onLogout={handleLeaveRoom}
          />

          {/* Exit Workspace Button */}
          <button
            onClick={handleLeaveRoom}
            className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 text-xs font-medium transition-all flex items-center gap-1.5"
            title="Leave Workspace"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Exit</span>
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex overflow-hidden relative">
        
        {/* Left Sidebar: Collaborators (Desktop) */}
        <aside className="hidden lg:flex w-72 border-r border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/60 p-4 flex-col justify-between shrink-0 overflow-y-auto select-none">
          <Collaborators
            users={users}
            currentUserId={currentUser.userId}
            followedUserId={followedUserId}
            onToggleFollow={handleToggleFollow}
            isSpotlightActive={isSpotlightActive}
            onToggleSpotlight={toggleSpotlight}
          />

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800/80 space-y-3">
            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between text-slate-800 dark:text-slate-300 font-semibold mb-1">
                <span className="flex items-center gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5 text-indigo-500" />
                  <span>State Sync</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Durable
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Server-authoritative state consensus with versioning ensures collision-free updates.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-100/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
              <div className="flex items-center justify-between text-slate-800 dark:text-slate-300 font-semibold mb-1">
                <span className="flex items-center gap-1.5">
                  <MousePointer className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Cursors</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  ~30 FPS
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {activeRemoteCursorCount > 0
                  ? `Tracking ${activeRemoteCursorCount} remote cursor${activeRemoteCursorCount > 1 ? 's' : ''}.`
                  : 'Move pointer across canvas to stream real-time cursor positions.'}
              </p>
            </div>
          </div>
        </aside>

        {/* Mobile Collaborators Drawer */}
        {showCollaboratorsDrawer && (
          <div className="lg:hidden absolute top-0 left-0 right-0 z-20 bg-white/95 dark:bg-slate-900/95 border-b border-slate-200 dark:border-slate-800 p-4 backdrop-blur-md shadow-2xl">
            <Collaborators
              users={users}
              currentUserId={currentUser.userId}
              followedUserId={followedUserId}
              onToggleFollow={handleToggleFollow}
              isSpotlightActive={isSpotlightActive}
              onToggleSpotlight={toggleSpotlight}
            />
          </div>
        )}

        {/* Mobile Activity Drawer */}
        {showMobileActivityDrawer && (
          <div className="md:hidden absolute top-0 bottom-0 right-0 w-80 max-w-[85vw] z-30 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-slate-200">Activity Stream</span>
              <button
                onClick={() => setShowMobileActivityDrawer(false)}
                className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white px-2 py-1 rounded bg-slate-100 dark:bg-slate-900"
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ActivityFeed
                activities={activities}
                filter={activityFilter}
                onFilterChange={setActivityFilter}
                counts={activityCounts}
                onSelectTask={handleSelectTask}
              />
            </div>
          </div>
        )}

        {/* Mobile AI Assistant Drawer */}
        {showMobileAiDrawer && (
          <div className="md:hidden absolute top-0 bottom-0 right-0 w-84 max-w-[90vw] z-30 bg-white dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col">
            <AIAssistant
              roomId={cleanRoomId}
              currentUser={currentUser}
              onClose={() => setShowMobileAiDrawer(false)}
            />
          </div>
        )}

        {/* Center Canvas: Cursors + Kanban TaskBoard */}
        <main
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="flex-1 relative bg-slate-100/50 dark:bg-slate-950 bg-grid-pattern overflow-hidden flex flex-col cursor-default min-w-0"
        >
          {/* Floating Follow Mode Banner */}
          {followedUserObj && (
            <div className="absolute top-3 left-1/2 transform -translate-x-1/2 z-20 bg-white/95 dark:bg-slate-900/95 border border-indigo-500/50 backdrop-blur-md px-4 py-2 rounded-full shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500" />
                </span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Following <span className="font-bold" style={{ color: followedUserObj.userColor || '#818cf8' }}>{followedUserObj.displayName}</span>
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">• Live Viewport</span>
              </div>
              <button
                onClick={() => setFollowedUserId(null)}
                className="text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 rounded-full border border-slate-300 dark:border-slate-700 transition-colors flex items-center gap-1"
              >
                <span>Stop Following</span>
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Multiplayer Cursors Overlay */}
          <MultiplayerCursorsOverlay
            remoteCursors={remoteCursors}
            containerDimensions={containerDimensions}
          />

          {/* Collaborative Kanban Task Board */}
          <TaskBoard
            tasks={tasks}
            highlightedTaskId={highlightedTaskId}
            onCreateTask={createTask}
            onUpdateTask={updateTask}
            onMoveTask={moveTask}
            onDeleteTask={deleteTask}
            activeConflict={activeConflict}
            onKeepCurrent={resolveKeepCurrent}
            onRetryChanges={resolveRetryChanges}
          />

          {/* Bottom Live Activity Status Strip */}
          <div className="h-10 border-t border-slate-200 dark:border-slate-800/60 bg-white/70 dark:bg-slate-950/80 px-4 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-mono select-none z-10 shrink-0">
            <div className="flex items-center gap-2 truncate">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-slate-700 dark:text-slate-300 truncate">
                {activities.length > 0 
                  ? `${activities[0].userName}: ${activities[0].type.toLowerCase().replace('_', ' ')}` 
                  : `Synchronized with room ${cleanRoomId}`}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-3 shrink-0 text-[11px]">
              <span>Real-Time Stream</span>
              <span>•</span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">MongoDB Durable</span>
            </div>
          </div>

          {/* Session Replay Modal */}
          <SessionReplayModal
            isOpen={showReplayModal}
            onClose={() => setShowReplayModal(false)}
            roomId={cleanRoomId}
          />
        </main>

        {/* Right Sidebar: Activity Feed or AI Workspace Assistant (Desktop) */}
        {showActivitySidebar && (
          <aside className="hidden md:flex w-84 border-l border-slate-200 dark:border-slate-800/80 bg-white/50 dark:bg-slate-950/70 flex-col shrink-0 overflow-hidden z-20">
            {/* Sidebar Tab Header */}
            <div className="p-2 border-b border-slate-200 dark:border-slate-800/80 bg-slate-50/90 dark:bg-slate-900/60 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800/70 p-0.5 rounded-xl flex-1">
                <button
                  type="button"
                  onClick={() => setRightSidebarTab('activity')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    rightSidebarTab === 'activity'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ActivityIcon className="h-3.5 w-3.5 text-indigo-500" />
                  <span>Activity</span>
                  {activityCounts.ALL > 0 && (
                    <span className="text-[10px] font-mono px-1 py-0.2 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold">
                      {activityCounts.ALL}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setRightSidebarTab('ai')}
                  className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    rightSidebarTab === 'ai'
                      ? 'bg-gradient-to-r from-indigo-600 to-cyan-600 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Bot className="h-3.5 w-3.5" />
                  <span>SyncSpace AI</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowActivitySidebar(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors ml-1"
                title="Collapse Sidebar"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Sidebar Tab Body */}
            <div className="flex-1 overflow-hidden">
              {rightSidebarTab === 'ai' ? (
                <AIAssistant roomId={cleanRoomId} currentUser={currentUser} />
              ) : (
                <ActivityFeed
                  activities={activities}
                  filter={activityFilter}
                  onFilterChange={setActivityFilter}
                  counts={activityCounts}
                  onSelectTask={handleSelectTask}
                />
              )}
            </div>
          </aside>
        )}

      </div>

      {/* Real-time Multi-Person WebRTC Video Call Component */}
      <VideoCall
        roomId={cleanRoomId}
        currentUser={currentUser}
        isInCall={isInCall}
        isJoining={isJoiningCall}
        isMuted={isMuted}
        isCameraOff={isCameraOff}
        isScreenSharing={isScreenSharing}
        isMinimized={isCallMinimized}
        setIsMinimized={setIsCallMinimized}
        peers={callPeers}
        localStream={localStream}
        callError={callError}
        setCallError={setCallError}
        leaveCall={leaveCall}
        toggleMute={toggleMute}
        toggleCamera={toggleCamera}
        toggleScreenShare={toggleScreenShare}
      />

    </div>
  );
}

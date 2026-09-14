import React, { useEffect, useRef } from 'react';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Monitor, 
  PhoneOff, 
  Minimize2, 
  Maximize2, 
  Users, 
  AlertCircle,
  X,
  Radio,
  Sparkles
} from 'lucide-react';

/**
 * Individual Video Participant Tile
 */
function VideoTile({ 
  stream, 
  user, 
  isLocal, 
  isMuted, 
  isCameraOff, 
  isScreenSharing 
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const initials = (user?.displayName || 'User')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const userColor = user?.userColor || '#6366f1';

  return (
    <div className="relative group w-full h-full min-h-[180px] sm:min-h-[220px] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-xl flex items-center justify-center transition-all duration-200 hover:border-indigo-500/40">
      
      {/* Video Stream Element */}
      {stream && !isCameraOff ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal} // Mute local audio to prevent feedback loop
          className={`w-full h-full object-cover ${isLocal && !isScreenSharing ? 'scale-x-[-1]' : ''}`}
        />
      ) : (
        /* Camera Off - Real Avatar Fallback */
        <div className="flex flex-col items-center justify-center gap-3 p-4 select-none">
          <div 
            className="h-20 w-20 sm:h-24 sm:w-24 rounded-3xl flex items-center justify-center font-bold text-xl sm:text-2xl text-white shadow-2xl transition-transform transform group-hover:scale-105"
            style={{ 
              backgroundColor: userColor,
              boxShadow: `0 10px 25px -5px ${userColor}40`
            }}
          >
            {initials}
          </div>
          <div className="text-center">
            <span className="text-sm font-semibold text-slate-200">
              {user?.displayName || 'Collaborator'} {isLocal && '(You)'}
            </span>
            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
              Camera Off
            </p>
          </div>
        </div>
      )}

      {/* Overlay: Name Tag & Status Badges */}
      <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10">
        <div className="flex items-center gap-2 bg-slate-950/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/50 shadow-md">
          <div 
            className="h-2 w-2 rounded-full" 
            style={{ backgroundColor: userColor }}
          />
          <span className="text-xs font-semibold text-white truncate max-w-[120px] sm:max-w-[160px]">
            {user?.displayName || 'User'} {isLocal && '(You)'}
          </span>
          {isScreenSharing && (
            <span className="px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 text-[10px] font-mono border border-indigo-500/30 flex items-center gap-1">
              <Monitor className="h-2.5 w-2.5" />
              <span>Screen</span>
            </span>
          )}
        </div>

        {/* Audio Mute Indicator */}
        <div className={`p-1.5 rounded-xl backdrop-blur-md border shadow-md ${
          isMuted 
            ? 'bg-rose-500/80 border-rose-400 text-white' 
            : 'bg-slate-950/80 border-slate-700/50 text-emerald-400'
        }`}>
          {isMuted ? (
            <MicOff className="h-3.5 w-3.5" />
          ) : (
            <Mic className="h-3.5 w-3.5" />
          )}
        </div>
      </div>

      {/* Live Badge */}
      <div className="absolute top-3 left-3 z-10 pointer-events-none">
        <div className="flex items-center gap-1.5 bg-slate-950/70 backdrop-blur-md px-2 py-0.5 rounded-full border border-slate-700/40 text-[10px] font-mono text-emerald-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>LIVE</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Main VideoCall Component
 * Handles both Full View (modal overlay) and Minimized Floating View
 */
export default function VideoCall({
  roomId,
  currentUser,
  isInCall,
  isJoining,
  isMuted,
  isCameraOff,
  isScreenSharing,
  isMinimized,
  setIsMinimized,
  peers,
  localStream,
  callError,
  setCallError,
  leaveCall,
  toggleMute,
  toggleCamera,
  toggleScreenShare,
}) {
  if (!isInCall && !isJoining) return null;

  const peerList = Object.values(peers);
  const totalParticipants = 1 + peerList.length; // Local + remote

  // Dynamic grid column class based on participant count
  const getGridColsClass = () => {
    if (totalParticipants === 1) return 'grid-cols-1 max-w-xl mx-auto';
    if (totalParticipants === 2) return 'grid-cols-1 md:grid-cols-2';
    if (totalParticipants <= 4) return 'grid-cols-1 sm:grid-cols-2';
    if (totalParticipants <= 6) return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
    return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  };

  /* ========================================================================= */
  /* MINIMIZED FLOATING CARD MODE (Allows user to interact with workspace)     */
  /* ========================================================================= */
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-50 w-72 sm:w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-2xl shadow-2xl p-3 text-white transition-all duration-200 select-none animate-in fade-in slide-in-from-bottom-4">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
            </span>
            <span className="text-xs font-bold tracking-tight text-slate-200">
              Live Call
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
              {totalParticipants}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Expand Call"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={leaveCall}
              className="p-1.5 rounded-lg text-rose-400 hover:text-rose-200 hover:bg-rose-500/20 transition-colors"
              title="Leave Call"
            >
              <PhoneOff className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Compact Participant Avatars / Mini Strip */}
        <div className="flex items-center gap-2 py-1 overflow-x-auto pb-2">
          {/* Local User Mini Avatar */}
          <div className="relative group shrink-0">
            <div 
              className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs text-white border-2 border-slate-800"
              style={{ backgroundColor: currentUser?.userColor || '#6366f1' }}
              title={`${currentUser?.displayName} (You)`}
            >
              {(currentUser?.displayName || 'Me')[0].toUpperCase()}
            </div>
            {isMuted && (
              <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-white border border-slate-900">
                <MicOff className="h-2.5 w-2.5" />
              </span>
            )}
          </div>

          {/* Remote Peers Mini Avatars */}
          {peerList.map((peer) => (
            <div key={peer.socketId} className="relative group shrink-0">
              <div 
                className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs text-white border-2 border-slate-800"
                style={{ backgroundColor: peer.user?.userColor || '#6366f1' }}
                title={peer.user?.displayName || 'Peer'}
              >
                {(peer.user?.displayName || 'P')[0].toUpperCase()}
              </div>
              {peer.isMuted && (
                <span className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-rose-500 flex items-center justify-center text-white border border-slate-900">
                  <MicOff className="h-2.5 w-2.5" />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Mini Controls */}
        <div className="flex items-center justify-around pt-2 border-t border-slate-800/80">
          <button
            onClick={toggleMute}
            className={`p-2 rounded-xl transition-all ${
              isMuted ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>

          <button
            onClick={toggleCamera}
            className={`p-2 rounded-xl transition-all ${
              isCameraOff ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
          >
            {isCameraOff ? <VideoOff className="h-4 w-4" /> : <Video className="h-4 w-4" />}
          </button>

          <button
            onClick={toggleScreenShare}
            className={`p-2 rounded-xl transition-all ${
              isScreenSharing ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-300 hover:text-white'
            }`}
            title={isScreenSharing ? 'Stop Screen Share' : 'Share Screen'}
          >
            <Monitor className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  /* ========================================================================= */
  /* EXPANDED FULL VIEW MODE                                                   */
  /* ========================================================================= */
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex flex-col justify-between p-4 sm:p-6 animate-in fade-in duration-200 select-none overflow-hidden">
      
      {/* Top Header */}
      <div className="flex items-center justify-between shrink-0 bg-slate-900/90 backdrop-blur-xl border border-slate-800 px-4 sm:px-6 py-3 rounded-2xl shadow-xl max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-rose-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-rose-500/20">
            <Radio className="h-4 w-4 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-white tracking-tight">SyncSpace Call</h2>
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-mono font-semibold">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>ACTIVE</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Room: <span className="font-bold text-indigo-400">{roomId}</span> · {totalParticipants} {totalParticipants === 1 ? 'Participant' : 'Participants'}
            </p>
          </div>
        </div>

        {/* Top Right Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsMinimized(true)}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold transition-all flex items-center gap-1.5 border border-slate-700"
            title="Minimize call to floating widget and continue working"
          >
            <Minimize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Minimize</span>
          </button>

          <button
            onClick={leaveCall}
            className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-rose-600/20"
            title="Leave Call"
          >
            <PhoneOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Leave</span>
          </button>
        </div>
      </div>

      {/* Warning/Error Banner */}
      {callError && (
        <div className="max-w-2xl w-full mx-auto my-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
            <span>{callError}</span>
          </div>
          <button
            onClick={() => setCallError(null)}
            className="p-1 rounded-lg hover:bg-amber-500/20 text-amber-400 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Main Video Grid */}
      <div className="flex-1 w-full max-w-6xl mx-auto my-4 overflow-y-auto flex items-center justify-center">
        <div className={`grid gap-4 w-full h-full p-2 items-center justify-center ${getGridColsClass()}`}>
          
          {/* Local User Tile */}
          <VideoTile
            stream={localStream}
            user={currentUser}
            isLocal={true}
            isMuted={isMuted}
            isCameraOff={isCameraOff}
            isScreenSharing={isScreenSharing}
          />

          {/* Remote Peer Tiles */}
          {peerList.map((peer) => (
            <VideoTile
              key={peer.socketId}
              stream={peer.stream}
              user={peer.user}
              isLocal={false}
              isMuted={peer.isMuted}
              isCameraOff={peer.isCameraOff}
              isScreenSharing={peer.isScreenSharing}
            />
          ))}
        </div>
      </div>

      {/* Single-user notice if alone in call */}
      {totalParticipants === 1 && (
        <div className="text-center text-xs text-slate-400 mb-2">
          💡 You're the only one here. Other collaborators in room <span className="font-mono text-indigo-400 font-bold">{roomId}</span> can join with one click!
        </div>
      )}

      {/* Bottom Floating Control Bar */}
      <div className="shrink-0 max-w-md w-full mx-auto bg-slate-900/95 backdrop-blur-xl border border-slate-800 px-6 py-3.5 rounded-3xl shadow-2xl flex items-center justify-around">
        
        {/* Mic Toggle */}
        <button
          onClick={toggleMute}
          className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
            isMuted 
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30' 
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
          }`}
          title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
        >
          {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </button>

        {/* Camera Toggle */}
        <button
          onClick={toggleCamera}
          className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
            isCameraOff 
              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40 hover:bg-rose-500/30' 
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
          }`}
          title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
        >
          {isCameraOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
        </button>

        {/* Screen Share Toggle */}
        <button
          onClick={toggleScreenShare}
          className={`h-12 w-12 rounded-2xl flex items-center justify-center transition-all shadow-md ${
            isScreenSharing 
              ? 'bg-indigo-600 text-white shadow-indigo-600/30 ring-2 ring-indigo-400' 
              : 'bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700'
          }`}
          title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
        >
          <Monitor className="h-5 w-5" />
        </button>

        {/* Minimize Button */}
        <button
          onClick={() => setIsMinimized(true)}
          className="h-12 w-12 rounded-2xl bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white border border-slate-700 flex items-center justify-center transition-all shadow-md"
          title="Minimize Call to Floating Widget"
        >
          <Minimize2 className="h-5 w-5" />
        </button>

        {/* Leave Call Button */}
        <button
          onClick={leaveCall}
          className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-rose-600 to-red-500 hover:from-rose-500 hover:to-red-400 text-white flex items-center justify-center transition-all shadow-lg shadow-rose-600/30 transform hover:scale-105"
          title="Leave Call"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>

    </div>
  );
}

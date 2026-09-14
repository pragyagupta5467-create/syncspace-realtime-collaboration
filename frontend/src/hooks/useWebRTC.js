import { useState, useEffect, useRef, useCallback } from 'react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

/**
 * useWebRTC Hook
 * Handles multi-person full-mesh WebRTC audio/video calling with Socket.IO signaling.
 * Features:
 * - Real camera and microphone capture
 * - Audio-only fallback on video permission denial
 * - Screen sharing with getDisplayMedia & dynamic track replacement
 * - Peer connection lifecycle management with STUN ICE servers
 * - Ephemeral participant media state synchronization (mute/camera/screen)
 */
export function useWebRTC({ roomId, socket, isConnected, currentUser }) {
  const [isInCall, setIsInCall] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [peers, setPeers] = useState({}); // { [socketId]: { socketId, user, stream, isMuted, isCameraOff, isScreenSharing } }
  const [callError, setCallError] = useState(null);
  const [activeCallStatus, setActiveCallStatus] = useState({ active: false, participantCount: 0 });

  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map()); // socketId -> RTCPeerConnection
  const candidateQueuesRef = useRef(new Map()); // socketId -> RTCIceCandidate[]

  // Helper to query current room call status from server
  const queryCallStatus = useCallback(() => {
    if (!socket || !isConnected || !roomId) return;
    socket.emit('call-status-query', { roomId }, (res) => {
      if (res && res.success) {
        setActiveCallStatus({
          active: !!res.active,
          participantCount: res.participantCount || 0,
        });
      }
    });
  }, [socket, isConnected, roomId]);

  // Listen to call status changes broadcasted to the room
  useEffect(() => {
    if (!socket || !isConnected || !roomId) return;

    queryCallStatus();

    const handleCallStatusChanged = (data) => {
      if (data && data.roomId === roomId) {
        setActiveCallStatus({
          active: !!data.active,
          participantCount: data.participantCount || 0,
        });
      }
    };

    socket.on('call-status-changed', handleCallStatusChanged);
    return () => {
      socket.off('call-status-changed', handleCallStatusChanged);
    };
  }, [socket, isConnected, roomId, queryCallStatus]);

  // Clean up a single peer connection
  const closePeerConnection = useCallback((socketId) => {
    const pc = peerConnectionsRef.current.get(socketId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
      peerConnectionsRef.current.delete(socketId);
    }
    candidateQueuesRef.current.delete(socketId);
    setPeers((prev) => {
      const updated = { ...prev };
      delete updated[socketId];
      return updated;
    });
  }, []);

  // Full call cleanup
  const cleanupCall = useCallback(() => {
    // Close all peer connections
    peerConnectionsRef.current.forEach((pc, sId) => {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.close();
    });
    peerConnectionsRef.current.clear();
    candidateQueuesRef.current.clear();

    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    // Stop screen share tracks
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;
    }

    setPeers({});
    setIsInCall(false);
    setIsJoining(false);
    setIsScreenSharing(false);
  }, []);

  // Create an RTCPeerConnection for a remote peer
  const createPeerConnection = useCallback((targetSocketId, targetUser, isInitiator) => {
    if (peerConnectionsRef.current.has(targetSocketId)) {
      return peerConnectionsRef.current.get(targetSocketId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);
    peerConnectionsRef.current.set(targetSocketId, pc);
    candidateQueuesRef.current.set(targetSocketId, []);

    // Add local tracks to peer connection
    const currentStream = screenStreamRef.current || localStreamRef.current;
    if (currentStream) {
      currentStream.getTracks().forEach((track) => {
        pc.addTrack(track, currentStream);
      });
    }

    // ICE Candidate generation
    pc.onicecandidate = (event) => {
      if (event.candidate && socket && isConnected) {
        socket.emit('call-signal', {
          to: targetSocketId,
          roomId,
          signal: { candidate: event.candidate },
        });
      }
    };

    // Remote stream received
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (remoteStream) {
        setPeers((prev) => ({
          ...prev,
          [targetSocketId]: {
            ...(prev[targetSocketId] || {}),
            socketId: targetSocketId,
            user: targetUser || prev[targetSocketId]?.user || { userId: targetSocketId, displayName: 'Collaborator', userColor: '#6366f1' },
            stream: remoteStream,
            isMuted: prev[targetSocketId]?.isMuted || false,
            isCameraOff: prev[targetSocketId]?.isCameraOff || false,
            isScreenSharing: prev[targetSocketId]?.isScreenSharing || false,
          },
        }));
      }
    };

    // Connection state changes
    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        // Handle disconnect gracefully
      }
    };

    // If initiator, create and send Offer
    if (isInitiator) {
      pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit('call-signal', {
            to: targetSocketId,
            roomId,
            signal: pc.localDescription,
          });
        })
        .catch((err) => {
          console.error('[WebRTC] Error creating offer:', err);
        });
    }

    return pc;
  }, [socket, isConnected, roomId]);

  // Start or Join a Call
  const startCall = useCallback(async () => {
    if (isInCall || isJoining) return;
    setIsJoining(true);
    setCallError(null);

    let stream = null;
    let fallbackToAudioOnly = false;

    // 1. Request Camera & Mic
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 24 },
        },
        audio: true,
      });
    } catch (camErr) {
      console.warn('[WebRTC] Camera access failed or denied, trying audio only:', camErr);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: true,
        });
        fallbackToAudioOnly = true;
        setIsCameraOff(true);
        setCallError('Camera permission denied or unavailable. Joined with audio only.');
      } catch (micErr) {
        console.error('[WebRTC] Both camera and microphone access failed:', micErr);
        setIsJoining(false);
        setCallError('Microphone permission is required to join the call.');
        return;
      }
    }

    localStreamRef.current = stream;

    // Apply current mute / camera initial state
    if (isMuted) {
      stream.getAudioTracks().forEach((t) => { t.enabled = false; });
    }
    if (isCameraOff || fallbackToAudioOnly) {
      stream.getVideoTracks().forEach((t) => { t.enabled = false; });
    }

    // 2. Emit call-join to Socket.IO signaling server
    socket.emit(
      'call-join',
      {
        roomId,
        user: currentUser,
        isMuted,
        isCameraOff: isCameraOff || fallbackToAudioOnly,
        isScreenSharing: false,
      },
      async (response) => {
        setIsJoining(false);
        if (!response || !response.success) {
          setCallError(response?.error || 'Failed to join room call');
          cleanupCall();
          return;
        }

        setIsInCall(true);

        // 3. Connect with existing peers in the room call
        const existingPeers = response.peers || [];
        const initialPeersState = {};

        existingPeers.forEach((p) => {
          initialPeersState[p.socketId] = {
            socketId: p.socketId,
            user: p.user,
            stream: null,
            isMuted: !!p.isMuted,
            isCameraOff: !!p.isCameraOff,
            isScreenSharing: !!p.isScreenSharing,
          };
          // We are the newcomer, create offer to each existing peer
          createPeerConnection(p.socketId, p.user, true);
        });

        setPeers(initialPeersState);
      }
    );
  }, [isInCall, isJoining, isMuted, isCameraOff, socket, roomId, currentUser, cleanupCall, createPeerConnection]);

  // Leave Call
  const leaveCall = useCallback(() => {
    if (socket && isConnected && roomId) {
      socket.emit('call-leave', { roomId });
    }
    cleanupCall();
  }, [socket, isConnected, roomId, cleanupCall]);

  // Toggle Mute (Microphone)
  const toggleMute = useCallback(() => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
    }

    if (socket && isConnected && isInCall) {
      socket.emit('call-state-update', {
        roomId,
        isMuted: nextMuted,
        isCameraOff,
        isScreenSharing,
      });
    }
  }, [isMuted, isCameraOff, isScreenSharing, socket, isConnected, isInCall, roomId]);

  // Toggle Camera
  const toggleCamera = useCallback(async () => {
    const nextCameraOff = !isCameraOff;
    setIsCameraOff(nextCameraOff);

    if (localStreamRef.current) {
      const videoTracks = localStreamRef.current.getVideoTracks();
      if (videoTracks.length > 0) {
        videoTracks.forEach((t) => {
          t.enabled = !nextCameraOff;
        });
      } else if (!nextCameraOff) {
        // If we started audio-only and user now enables camera
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          localStreamRef.current.addTrack(newVideoTrack);
          // Add track to existing peer connections
          peerConnectionsRef.current.forEach((pc) => {
            pc.addTrack(newVideoTrack, localStreamRef.current);
          });
        } catch (err) {
          console.warn('[WebRTC] Unable to re-acquire video track:', err);
          setIsCameraOff(true);
        }
      }
    }

    if (socket && isConnected && isInCall) {
      socket.emit('call-state-update', {
        roomId,
        isMuted,
        isCameraOff: nextCameraOff,
        isScreenSharing,
      });
    }
  }, [isCameraOff, isMuted, isScreenSharing, socket, isConnected, isInCall, roomId]);

  // Toggle Screen Sharing
  const toggleScreenShare = useCallback(async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      setCallError('Screen sharing is not supported by your browser.');
      return;
    }

    if (!isScreenSharing) {
      try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' },
          audio: false,
        });

        screenStreamRef.current = displayStream;
        const screenTrack = displayStream.getVideoTracks()[0];

        // When user stops screen sharing via browser native UI bar
        screenTrack.onended = () => {
          stopScreenSharing();
        };

        // Replace video track in all active peer connections
        peerConnectionsRef.current.forEach((pc) => {
          const senders = pc.getSenders();
          const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
          if (videoSender) {
            videoSender.replaceTrack(screenTrack);
          } else {
            pc.addTrack(screenTrack, displayStream);
          }
        });

        setIsScreenSharing(true);

        if (socket && isConnected && isInCall) {
          socket.emit('call-state-update', {
            roomId,
            isMuted,
            isCameraOff,
            isScreenSharing: true,
          });
        }
      } catch (err) {
        if (err.name !== 'NotAllowedError') {
          console.error('[WebRTC] Screen sharing error:', err);
          setCallError('Could not start screen sharing.');
        }
      }
    } else {
      stopScreenSharing();
    }
  }, [isScreenSharing, isMuted, isCameraOff, socket, isConnected, isInCall, roomId]);

  const stopScreenSharing = useCallback(() => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
    }

    // Restore camera video track on all peer senders
    const cameraTrack = localStreamRef.current?.getVideoTracks()[0] || null;
    peerConnectionsRef.current.forEach((pc) => {
      const senders = pc.getSenders();
      const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
      if (videoSender && cameraTrack) {
        videoSender.replaceTrack(cameraTrack);
      }
    });

    setIsScreenSharing(false);

    if (socket && isConnected && isInCall) {
      socket.emit('call-state-update', {
        roomId,
        isMuted,
        isCameraOff,
        isScreenSharing: false,
      });
    }
  }, [socket, isConnected, isInCall, roomId, isMuted, isCameraOff]);

  // WebRTC Signaling Socket Events Handler
  useEffect(() => {
    if (!socket || !isConnected) return;

    // 1. When another user joins the call
    const handleUserJoined = (data) => {
      if (!data || !data.socketId) return;
      setPeers((prev) => ({
        ...prev,
        [data.socketId]: {
          socketId: data.socketId,
          user: data.user,
          stream: null,
          isMuted: !!data.isMuted,
          isCameraOff: !!data.isCameraOff,
          isScreenSharing: !!data.isScreenSharing,
        },
      }));
    };

    // 2. When a signaling message arrives (Offer, Answer, ICE Candidate)
    const handleSignal = async ({ from, signal, user }) => {
      if (!from || !signal) return;

      let pc = peerConnectionsRef.current.get(from);
      if (!pc) {
        pc = createPeerConnection(from, user, false);
      }

      try {
        if (signal.type === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          
          // Process any queued candidates for this peer
          const queue = candidateQueuesRef.current.get(from) || [];
          while (queue.length > 0) {
            const cand = queue.shift();
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          socket.emit('call-signal', {
            to: from,
            roomId,
            signal: pc.localDescription,
          });
        } else if (signal.type === 'answer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal));

          // Process any queued candidates
          const queue = candidateQueuesRef.current.get(from) || [];
          while (queue.length > 0) {
            const cand = queue.shift();
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
        } else if (signal.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
          } else {
            const queue = candidateQueuesRef.current.get(from) || [];
            queue.push(signal.candidate);
            candidateQueuesRef.current.set(from, queue);
          }
        }
      } catch (sigErr) {
        console.error('[WebRTC] Error handling signal from peer:', from, sigErr);
      }
    };

    // 3. When a remote peer updates their media status (Mute/Camera/Screen)
    const handleStateUpdated = (data) => {
      if (!data || !data.socketId) return;
      setPeers((prev) => {
        if (!prev[data.socketId]) return prev;
        return {
          ...prev,
          [data.socketId]: {
            ...prev[data.socketId],
            isMuted: data.isMuted !== undefined ? data.isMuted : prev[data.socketId].isMuted,
            isCameraOff: data.isCameraOff !== undefined ? data.isCameraOff : prev[data.socketId].isCameraOff,
            isScreenSharing: data.isScreenSharing !== undefined ? data.isScreenSharing : prev[data.socketId].isScreenSharing,
          },
        };
      });
    };

    // 4. When a peer leaves the call
    const handleUserLeft = (data) => {
      if (!data || !data.socketId) return;
      closePeerConnection(data.socketId);
    };

    socket.on('call-user-joined', handleUserJoined);
    socket.on('call-signal', handleSignal);
    socket.on('call-state-updated', handleStateUpdated);
    socket.on('call-user-left', handleUserLeft);

    return () => {
      socket.off('call-user-joined', handleUserJoined);
      socket.off('call-signal', handleSignal);
      socket.off('call-state-updated', handleStateUpdated);
      socket.off('call-user-left', handleUserLeft);
    };
  }, [socket, isConnected, roomId, createPeerConnection, closePeerConnection]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return {
    isInCall,
    isJoining,
    isMuted,
    isCameraOff,
    isScreenSharing,
    isMinimized,
    setIsMinimized,
    peers,
    localStream: localStreamRef.current,
    screenStream: screenStreamRef.current,
    callError,
    setCallError,
    activeCallStatus,
    startCall,
    leaveCall,
    toggleMute,
    toggleCamera,
    toggleScreenShare,
  };
}

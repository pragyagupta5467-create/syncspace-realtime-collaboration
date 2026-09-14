/**
 * In-Memory Call Manager for SyncSpace
 * Tracks active audio/video call sessions per room.
 * Ephemeral, lightweight, and strictly room-isolated (0 database writes).
 */

class CallManager {
  constructor() {
    // Map<roomId, Map<socketId, { socketId, user, isMuted, isCameraOff, isScreenSharing, joinedAt }>>
    this.roomCalls = new Map();
    // Map<socketId, roomId>
    this.socketToRoom = new Map();
  }

  /**
   * Join an active call in a room
   * @param {string} roomId 
   * @param {string} socketId 
   * @param {object} user - { userId, displayName, userColor }
   * @param {object} initialState - { isMuted, isCameraOff, isScreenSharing }
   * @returns {Array<object>} list of existing participants in the call
   */
  joinCall(roomId, socketId, user, initialState = {}) {
    if (!this.roomCalls.has(roomId)) {
      this.roomCalls.set(roomId, new Map());
    }

    const roomCall = this.roomCalls.get(roomId);
    
    // Existing participants to return to the new joiner (excluding self)
    const existingParticipants = [];
    for (const [sId, participant] of roomCall.entries()) {
      if (sId !== socketId) {
        existingParticipants.push({
          socketId: participant.socketId,
          user: participant.user,
          isMuted: participant.isMuted,
          isCameraOff: participant.isCameraOff,
          isScreenSharing: participant.isScreenSharing,
          joinedAt: participant.joinedAt,
        });
      }
    }

    // Add / update new joiner
    const participantInfo = {
      socketId,
      user: {
        userId: user.userId,
        displayName: user.displayName,
        userColor: user.userColor,
      },
      isMuted: !!initialState.isMuted,
      isCameraOff: !!initialState.isCameraOff,
      isScreenSharing: !!initialState.isScreenSharing,
      joinedAt: Date.now(),
    };

    roomCall.set(socketId, participantInfo);
    this.socketToRoom.set(socketId, roomId);

    return {
      existingParticipants,
      self: participantInfo,
      participantCount: roomCall.size,
    };
  }

  /**
   * Update participant media state (mute, camera, screen share)
   * @param {string} roomId 
   * @param {string} socketId 
   * @param {object} state - { isMuted, isCameraOff, isScreenSharing }
   */
  updateCallState(roomId, socketId, state = {}) {
    const roomCall = this.roomCalls.get(roomId);
    if (!roomCall || !roomCall.has(socketId)) return null;

    const participant = roomCall.get(socketId);
    if (typeof state.isMuted === 'boolean') participant.isMuted = state.isMuted;
    if (typeof state.isCameraOff === 'boolean') participant.isCameraOff = state.isCameraOff;
    if (typeof state.isScreenSharing === 'boolean') participant.isScreenSharing = state.isScreenSharing;

    return participant;
  }

  /**
   * Remove a socket from a room's call
   * @param {string} roomId 
   * @param {string} socketId 
   * @returns {object|null} { removedParticipant, participantCount }
   */
  leaveCall(roomId, socketId) {
    const roomCall = this.roomCalls.get(roomId);
    if (!roomCall || !roomCall.has(socketId)) return null;

    const removedParticipant = roomCall.get(socketId);
    roomCall.delete(socketId);
    this.socketToRoom.delete(socketId);

    const remainingCount = roomCall.size;
    if (remainingCount === 0) {
      this.roomCalls.delete(roomId);
    }

    return {
      removedParticipant,
      participantCount: remainingCount,
    };
  }

  /**
   * Remove socket from whatever call it is currently in (e.g. on disconnect)
   * @param {string} socketId 
   * @returns {object|null} { roomId, removedParticipant, participantCount }
   */
  removeSocket(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return null;

    const res = this.leaveCall(roomId, socketId);
    if (res) {
      return {
        roomId,
        ...res,
      };
    }
    return null;
  }

  /**
   * Check if a socket is in an active call
   */
  isSocketInCall(socketId) {
    return this.socketToRoom.has(socketId);
  }

  /**
   * Get all participants in a room's call
   */
  getCallParticipants(roomId) {
    const roomCall = this.roomCalls.get(roomId);
    if (!roomCall) return [];
    return Array.from(roomCall.values());
  }

  /**
   * Get call status for a room
   */
  getCallStatus(roomId) {
    const roomCall = this.roomCalls.get(roomId);
    const count = roomCall ? roomCall.size : 0;
    return {
      active: count > 0,
      participantCount: count,
    };
  }
}

export const callManager = new CallManager();

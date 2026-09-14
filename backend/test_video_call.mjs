import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://localhost:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createClientSocket(token = null) {
  return io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    auth: token ? { token } : undefined,
  });
}

async function runVideoCallTests() {
  console.log('=== SyncSpace WebRTC Video Calling & Signaling Test Suite ===\n');

  const ROOM_A = 'SYNC-CALL-TEST-A';
  const ROOM_B = 'SYNC-CALL-TEST-B';

  const socketA = createClientSocket();
  const socketB = createClientSocket();
  const socketC = createClientSocket();
  const socketD = createClientSocket(); // Isolated in Room B

  const userA = { userId: 'usr_call_a', displayName: 'Pragya (User A)', userColor: '#6366f1' };
  const userB = { userId: 'usr_call_b', displayName: 'Rahul (User B)', userColor: '#10b981' };
  const userC = { userId: 'usr_call_c', displayName: 'Aman (User C)', userColor: '#f59e0b' };
  const userD = { userId: 'usr_call_d', displayName: 'Isolated (User D)', userColor: '#ef4444' };

  try {
    // 1. Join Rooms
    console.log('[Test 1] Sockets joining rooms...');
    const rA = await new Promise((res) => socketA.emit('join-room', { roomId: ROOM_A, user: userA, autoCreate: true }, res));
    assert.strictEqual(rA.success, true, 'Socket A should join Room A');
    const rB = await new Promise((res) => socketB.emit('join-room', { roomId: ROOM_A, user: userB, autoCreate: true }, res));
    assert.strictEqual(rB.success, true, 'Socket B should join Room A');
    const rC = await new Promise((res) => socketC.emit('join-room', { roomId: ROOM_A, user: userC, autoCreate: true }, res));
    assert.strictEqual(rC.success, true, 'Socket C should join Room A');
    const rD = await new Promise((res) => socketD.emit('join-room', { roomId: ROOM_B, user: userD, autoCreate: true }, res));
    assert.strictEqual(rD.success, true, 'Socket D should join Room B');
    console.log('✔ All 4 sockets joined their respective rooms.');

    // 2. Initial Call Status Query
    console.log('\n[Test 2] Querying initial call status...');
    const initialStatusA = await new Promise((res) => socketA.emit('call-status-query', { roomId: ROOM_A }, res));
    assert.strictEqual(initialStatusA.success, true);
    assert.strictEqual(initialStatusA.active, false);
    assert.strictEqual(initialStatusA.participantCount, 0);
    console.log('✔ Initial call status is inactive (0 participants).');

    // 3. User A joins call in Room A
    console.log('\n[Test 3] User A starts/joins call in Room A...');
    let callStatusChangedRoomA = null;
    socketB.on('call-status-changed', (data) => {
      callStatusChangedRoomA = data;
    });

    let roomBSignalingReceived = false;
    socketD.on('call-user-joined', () => { roomBSignalingReceived = true; });
    socketD.on('call-signal', () => { roomBSignalingReceived = true; });
    socketD.on('call-status-changed', () => { roomBSignalingReceived = true; });

    const joinResA = await new Promise((res) => socketA.emit('call-join', {
      roomId: ROOM_A,
      user: userA,
      isMuted: false,
      isCameraOff: false,
    }, res));

    assert.strictEqual(joinResA.success, true);
    assert.strictEqual(joinResA.peers.length, 0, 'First caller should have 0 existing peers');
    assert.strictEqual(joinResA.participantCount, 1);
    await wait(100);
    assert.strictEqual(callStatusChangedRoomA?.active, true);
    assert.strictEqual(callStatusChangedRoomA?.participantCount, 1);
    assert.strictEqual(roomBSignalingReceived, false, 'Room B must NOT receive Room A status/signaling');
    console.log('✔ User A successfully started call, room broadcast updated to 1 participant.');

    // 4. User B joins call in Room A
    console.log('\n[Test 4] User B joins active call in Room A...');
    let userBJoinedReceivedByA = null;
    socketA.on('call-user-joined', (data) => {
      userBJoinedReceivedByA = data;
    });

    const joinResB = await new Promise((res) => socketB.emit('call-join', {
      roomId: ROOM_A,
      user: userB,
      isMuted: true,
      isCameraOff: false,
    }, res));

    assert.strictEqual(joinResB.success, true);
    assert.strictEqual(joinResB.peers.length, 1, 'User B should see 1 existing peer (User A)');
    assert.strictEqual(joinResB.peers[0].socketId, socketA.id);
    assert.strictEqual(joinResB.peers[0].user.displayName, userA.displayName);
    assert.strictEqual(joinResB.participantCount, 2);

    await wait(100);
    assert.ok(userBJoinedReceivedByA, 'User A should receive call-user-joined for User B');
    assert.strictEqual(userBJoinedReceivedByA.socketId, socketB.id);
    assert.strictEqual(userBJoinedReceivedByA.user.displayName, userB.displayName);
    assert.strictEqual(userBJoinedReceivedByA.isMuted, true);
    console.log('✔ User B joined call, received existing peer User A, User A notified of User B.');

    // 5. WebRTC Signaling Exchange (Offer / Answer / ICE Candidate)
    console.log('\n[Test 5] WebRTC signaling exchange (Offer/Answer/ICE) between User A and User B...');
    let signalReceivedByA = null;
    let signalReceivedByB = null;

    socketA.on('call-signal', (data) => {
      signalReceivedByA = data;
    });
    socketB.on('call-signal', (data) => {
      signalReceivedByB = data;
    });

    // B sends offer to A
    socketB.emit('call-signal', {
      to: socketA.id,
      roomId: ROOM_A,
      signal: { type: 'offer', sdp: 'v=0\r\no=alice 2890844526...' },
    });

    await wait(100);
    assert.ok(signalReceivedByA, 'User A should receive offer signal');
    assert.strictEqual(signalReceivedByA.from, socketB.id);
    assert.strictEqual(signalReceivedByA.signal.type, 'offer');

    // A sends answer back to B
    socketA.emit('call-signal', {
      to: socketB.id,
      roomId: ROOM_A,
      signal: { type: 'answer', sdp: 'v=0\r\no=bob 2890844527...' },
    });

    await wait(100);
    assert.ok(signalReceivedByB, 'User B should receive answer signal');
    assert.strictEqual(signalReceivedByB.from, socketA.id);
    assert.strictEqual(signalReceivedByB.signal.type, 'answer');

    // ICE Candidate relay
    signalReceivedByA = null;
    socketB.emit('call-signal', {
      to: socketA.id,
      roomId: ROOM_A,
      signal: { candidate: { candidate: 'candidate:1 1 UDP 2130706431...', sdpMid: '0', sdpMLineIndex: 0 } },
    });

    await wait(100);
    assert.ok(signalReceivedByA?.signal?.candidate, 'User A should receive ICE candidate');
    console.log('✔ WebRTC Offer/Answer/ICE candidate signaling verified.');

    // 6. Media State Synchronization (Mute / Camera / Screen Share)
    console.log('\n[Test 6] Media state synchronization (Mute/Camera/Screen Share)...');
    let stateUpdateReceivedByB = null;
    socketB.on('call-state-updated', (data) => {
      stateUpdateReceivedByB = data;
    });

    socketA.emit('call-state-update', {
      roomId: ROOM_A,
      isMuted: true,
      isCameraOff: true,
      isScreenSharing: true,
    });

    await wait(100);
    assert.ok(stateUpdateReceivedByB, 'User B should receive state update from User A');
    assert.strictEqual(stateUpdateReceivedByB.socketId, socketA.id);
    assert.strictEqual(stateUpdateReceivedByB.isMuted, true);
    assert.strictEqual(stateUpdateReceivedByB.isCameraOff, true);
    assert.strictEqual(stateUpdateReceivedByB.isScreenSharing, true);
    console.log('✔ Participant media state changes synchronized accurately.');

    // 7. Multi-User Call (User C joins Room A call)
    console.log('\n[Test 7] User C joins active call (3 participants total)...');
    let userCJoinedReceivedByA = null;
    let userCJoinedReceivedByB = null;

    socketA.on('call-user-joined', (data) => { if (data.socketId === socketC.id) userCJoinedReceivedByA = data; });
    socketB.on('call-user-joined', (data) => { if (data.socketId === socketC.id) userCJoinedReceivedByB = data; });

    const joinResC = await new Promise((res) => socketC.emit('call-join', {
      roomId: ROOM_A,
      user: userC,
      isMuted: false,
      isCameraOff: false,
    }, res));

    assert.strictEqual(joinResC.success, true);
    assert.strictEqual(joinResC.peers.length, 2, 'User C should see 2 existing peers (A and B)');
    assert.strictEqual(joinResC.participantCount, 3);

    await wait(100);
    assert.ok(userCJoinedReceivedByA, 'User A should receive User C joined event');
    assert.ok(userCJoinedReceivedByB, 'User B should receive User C joined event');
    console.log('✔ Multi-user mesh call correctly established for 3 participants.');

    // 8. Room Isolation Check
    console.log('\n[Test 8] Strict room isolation verification (Room B vs Room A)...');
    assert.strictEqual(roomBSignalingReceived, false, 'User D in Room B received 0 signaling events from Room A');
    
    // User D starts call in Room B
    const joinResD = await new Promise((res) => socketD.emit('call-join', {
      roomId: ROOM_B,
      user: userD,
    }, res));
    assert.strictEqual(joinResD.success, true);
    assert.strictEqual(joinResD.peers.length, 0, 'User D in Room B should not see Room A peers');
    console.log('✔ Room isolation strictly enforced.');

    // 9. Leave Call & Disconnect Cleanup
    console.log('\n[Test 9] User B leaves call explicitly & User C disconnects...');
    let userBLeftReceivedByA = null;
    socketA.on('call-user-left', (data) => {
      if (data.socketId === socketB.id) userBLeftReceivedByA = data;
    });

    const leaveResB = await new Promise((res) => socketB.emit('call-leave', { roomId: ROOM_A }, res));
    assert.strictEqual(leaveResB.success, true);

    await wait(100);
    assert.ok(userBLeftReceivedByA, 'User A should receive user-left for User B');

    // User C disconnects socket unexpectedly
    const socketCId = socketC.id;
    let userCLeftReceivedByA = null;
    socketA.on('call-user-left', (data) => {
      if (data.socketId === socketCId || data.userId === userC.userId) {
        userCLeftReceivedByA = data;
      }
    });

    socketC.disconnect();
    await wait(300);
    assert.ok(userCLeftReceivedByA, 'User A should receive user-left when User C disconnects');

    const finalStatusA = await new Promise((res) => socketA.emit('call-status-query', { roomId: ROOM_A }, res));
    assert.strictEqual(finalStatusA.participantCount, 1, 'Only User A remains in Room A call');

    // User A leaves call
    await new Promise((res) => socketA.emit('call-leave', { roomId: ROOM_A }, res));
    const emptyStatus = await new Promise((res) => socketA.emit('call-status-query', { roomId: ROOM_A }, res));
    assert.strictEqual(emptyStatus.active, false);
    assert.strictEqual(emptyStatus.participantCount, 0);

    console.log('✔ Explicit leave and unexpected socket disconnect cleanup verified.');

    console.log('\n🎉 ALL WEBRTC VIDEO CALLING TESTS PASSED PERFECTLY!\n');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    socketA.disconnect();
    socketB.disconnect();
    socketC.disconnect();
    socketD.disconnect();
  }
}

runVideoCallTests();

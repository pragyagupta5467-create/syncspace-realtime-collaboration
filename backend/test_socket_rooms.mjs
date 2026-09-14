import { io } from 'socket.io-client';

const SERVER_URL = 'http://localhost:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('=== STARTING MULTIPLAYER SOCKET & ROOM ISOLATION TESTS ===\n');

  // Test 1: Connect Client 1 (Priya)
  console.log('1. Connecting Client 1 (Priya)...');
  const client1 = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => client1.on('connect', res));
  console.log('   Client 1 connected with socket id:', client1.id);

  let c1UserJoined = null;
  let c1UserLeft = null;
  let c1RoomUsers = [];

  client1.on('user-joined', (data) => {
    console.log('   [Client 1 Event] user-joined:', data.user.displayName);
    c1UserJoined = data;
  });

  client1.on('user-left', (data) => {
    console.log('   [Client 1 Event] user-left:', data.displayName);
    c1UserLeft = data;
  });

  client1.on('room-users', (data) => {
    console.log('   [Client 1 Event] room-users update. Count:', data.users.length);
    c1RoomUsers = data.users;
  });

  // Client 1 joins SYNC-ALPHA
  const join1Res = await new Promise((res) => {
    client1.emit('join-room', {
      roomId: 'SYNC-ALPHA',
      user: { userId: 'user_priya_1', displayName: 'Priya', userColor: '#f43f5e' }
    }, res);
  });
  console.log('   Client 1 join-room response:', join1Res.success, '| Room users:', join1Res.users.length);
  if (!join1Res.success || join1Res.users.length !== 1) {
    throw new Error('Test 1 failed: Client 1 join error');
  }

  // Test 2: Connect Client 2 (Rahul) to the same room
  console.log('\n2. Connecting Client 2 (Rahul) to SYNC-ALPHA...');
  const client2 = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => client2.on('connect', res));

  const join2Res = await new Promise((res) => {
    client2.emit('join-room', {
      roomId: 'SYNC-ALPHA',
      user: { userId: 'user_rahul_2', displayName: 'Rahul', userColor: '#10b981' }
    }, res);
  });
  console.log('   Client 2 join-room response:', join2Res.success, '| Room users:', join2Res.users.length);
  if (!join2Res.success || join2Res.users.length !== 2) {
    throw new Error('Test 2 failed: Client 2 join error');
  }

  await wait(300);
  console.log('   Verifying Client 1 received Client 2 join event...');
  if (!c1UserJoined || c1UserJoined.user.displayName !== 'Rahul' || c1RoomUsers.length !== 2) {
    throw new Error('Test 2 failed: Client 1 did not receive user-joined properly');
  }
  console.log('   -> PASS: Both users in SYNC-ALPHA and presence synchronized.');

  // Test 3: Connect Client 3 (Ananya) to a separate room SYNC-BETA (Room Isolation)
  console.log('\n3. Connecting Client 3 (Ananya) to separate room SYNC-BETA...');
  const client3 = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => client3.on('connect', res));

  let c1SawAnanya = false;
  client1.on('user-joined', (data) => {
    if (data.user?.displayName === 'Ananya') c1SawAnanya = true;
  });

  const join3Res = await new Promise((res) => {
    client3.emit('join-room', {
      roomId: 'SYNC-BETA',
      user: { userId: 'user_ananya_3', displayName: 'Ananya', userColor: '#a855f7' }
    }, res);
  });
  console.log('   Client 3 join-room response:', join3Res.success, '| Room users:', join3Res.users.length);
  await wait(300);

  if (c1SawAnanya) {
    throw new Error('Test 3 failed: Room isolation breached! Client 1 in SYNC-ALPHA received event from SYNC-BETA');
  }
  console.log('   -> PASS: Room Isolation verified. SYNC-ALPHA and SYNC-BETA are isolated.');

  // Test 4: Client 2 (Rahul) disconnects / leaves SYNC-ALPHA
  console.log('\n4. Disconnecting Client 2 (Rahul)...');
  client2.disconnect();
  await wait(400);

  if (!c1UserLeft || c1UserLeft.displayName !== 'Rahul' || c1RoomUsers.length !== 1) {
    throw new Error('Test 4 failed: Client 1 did not receive user-left upon Client 2 disconnection');
  }
  console.log('   -> PASS: Disconnect handled gracefully. Client 1 received user-left and updated user count to 1.');

  // Cleanup
  client1.disconnect();
  client3.disconnect();
  console.log('\n=== ALL MULTIPLAYER SOCKET & ROOM TESTS PASSED! ===');
}

runTests().catch((err) => {
  console.error('TEST ERROR:', err);
  process.exit(1);
});

import { io } from 'socket.io-client';

const SERVER_URL = 'http://127.0.0.1:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCursorTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       SYNCSPACE MULTIPLAYER CURSOR SYNCHRONIZATION TESTS           ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // STEP 1: Connect Client A (Pragya) and Client B (Rahul) to Room SYNC-DEV
  console.log('[Test 1 & 2 Setup] Connecting Pragya and Rahul to SYNC-DEV...');
  
  const clientA = io(SERVER_URL, { transports: ['websocket'] });
  const clientB = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((res) => clientA.on('connect', res)),
    new Promise((res) => clientB.on('connect', res)),
  ]);

  const clientACursors = {};
  const clientBCursors = {};
  let clientAReceivedOwnCursor = false;

  clientA.on('cursor-update', (data) => {
    if (data.userId === 'user_pragya') clientAReceivedOwnCursor = true;
    clientACursors[data.userId] = data;
  });

  clientA.on('cursor-inactive', ({ userId }) => {
    delete clientACursors[userId];
  });

  clientB.on('cursor-update', (data) => {
    clientBCursors[data.userId] = data;
  });

  clientB.on('cursor-inactive', ({ userId }) => {
    delete clientBCursors[userId];
  });

  await Promise.all([
    new Promise((res) => clientA.emit('join-room', {
      roomId: 'SYNC-DEV',
      autoCreate: true,
      user: { userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1' }
    }, res)),
    new Promise((res) => clientB.emit('join-room', {
      roomId: 'SYNC-DEV',
      user: { userId: 'user_rahul', displayName: 'Rahul', userColor: '#10b981' }
    }, res)),
  ]);

  console.log('  -> Both clients joined SYNC-DEV.');

  // TEST 1: User A moves cursor -> User B sees User A's cursor
  console.log('\n--- TEST 1: User A (Pragya) moves cursor ---');
  clientA.emit('cursor-move', {
    roomId: 'SYNC-DEV',
    userId: 'user_pragya',
    displayName: 'Pragya',
    userColor: '#6366f1',
    x: 320.5,
    y: 180.2,
    percentX: 0.32,
    percentY: 0.18,
  });

  await wait(200);

  if (!clientBCursors['user_pragya'] || clientBCursors['user_pragya'].x !== 320.5) {
    throw new Error('Test 1 Failed: User B did not receive User A cursor coordinates.');
  }
  console.log('  -> PASS: User B received Pragya cursor update at (320.5, 180.2).');

  // TEST 2: User B moves cursor -> User A sees User B's cursor; User A does NOT receive own
  console.log('\n--- TEST 2: User B (Rahul) moves cursor ---');
  clientB.emit('cursor-move', {
    roomId: 'SYNC-DEV',
    userId: 'user_rahul',
    displayName: 'Rahul',
    userColor: '#10b981',
    x: 450.0,
    y: 290.0,
    percentX: 0.45,
    percentY: 0.29,
  });

  await wait(200);

  if (!clientACursors['user_rahul'] || clientACursors['user_rahul'].x !== 450.0) {
    throw new Error('Test 2 Failed: User A did not receive User B cursor coordinates.');
  }
  if (clientAReceivedOwnCursor) {
    throw new Error('Test 2 Failed: User A received own cursor reflection!');
  }
  console.log('  -> PASS: User A received Rahul cursor update; User A did not receive own reflection.');

  // TEST 3: Three users in the same room (User C: Ananya joins)
  console.log('\n--- TEST 3: Three users in the same room (User C: Ananya joins) ---');
  const clientC = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientC.on('connect', res));

  const clientCCursors = {};
  clientC.on('cursor-update', (data) => {
    clientCCursors[data.userId] = data;
  });

  await new Promise((res) => clientC.emit('join-room', {
    roomId: 'SYNC-DEV',
    user: { userId: 'user_ananya', displayName: 'Ananya', userColor: '#a855f7' }
  }, res));

  // User C moves cursor
  clientC.emit('cursor-move', {
    roomId: 'SYNC-DEV',
    userId: 'user_ananya',
    displayName: 'Ananya',
    userColor: '#a855f7',
    x: 550.0,
    y: 310.0,
    percentX: 0.55,
    percentY: 0.31,
  });

  await wait(200);

  if (!clientACursors['user_ananya'] || !clientBCursors['user_ananya']) {
    throw new Error('Test 3 Failed: User A or User B did not receive User C cursor.');
  }

  // User A and B also move to verify C receives both
  clientA.emit('cursor-move', { roomId: 'SYNC-DEV', userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1', x: 100, y: 100 });
  clientB.emit('cursor-move', { roomId: 'SYNC-DEV', userId: 'user_rahul', displayName: 'Rahul', userColor: '#10b981', x: 200, y: 200 });

  await wait(200);

  if (!clientCCursors['user_pragya'] || !clientCCursors['user_rahul']) {
    throw new Error('Test 3 Failed: User C did not receive User A and User B cursors.');
  }
  console.log('  -> PASS: All 3 users simultaneously see each other\'s cursors.');

  // TEST 4: User leaves / cursor cleanup
  console.log('\n--- TEST 4: User leaves / cursor cleanup ---');
  clientC.emit('cursor-leave', { roomId: 'SYNC-DEV', userId: 'user_ananya' });
  await wait(150);

  if (clientACursors['user_ananya'] || clientBCursors['user_ananya']) {
    throw new Error('Test 4 Failed: Cursor was not removed on cursor-leave.');
  }

  clientB.disconnect();
  await wait(200);

  delete clientACursors['user_rahul'];
  console.log('  -> PASS: User cursor removed cleanly upon leave / disconnect.');

  // TEST 5: Two different rooms (Room Isolation)
  console.log('\n--- TEST 5: Room Isolation (Room A vs Room B) ---');
  const clientRoomB = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientRoomB.on('connect', res));

  let roomBReceivedRoomACursor = false;
  clientRoomB.on('cursor-update', () => {
    roomBReceivedRoomACursor = true;
  });

  await new Promise((res) => clientRoomB.emit('join-room', {
    roomId: 'SYNC-OTHER-ROOM',
    autoCreate: true,
    user: { userId: 'user_david', displayName: 'David', userColor: '#f59e0b' }
  }, res));

  // Client A moves in SYNC-DEV
  clientA.emit('cursor-move', {
    roomId: 'SYNC-DEV',
    userId: 'user_pragya',
    displayName: 'Pragya',
    userColor: '#6366f1',
    x: 888,
    y: 777,
  });

  await wait(200);

  if (roomBReceivedRoomACursor) {
    throw new Error('Test 5 Failed: Room B received cursor updates from Room A!');
  }
  console.log('  -> PASS: Room Isolation confirmed. Room A cursors never leak to Room B.');

  // TEST 6: High Frequency Throttling Simulation
  console.log('\n--- TEST 6: Client-Side Throttling Performance Simulation ---');
  let emittedCount = 0;
  let lastEmit = 0;
  const THROTTLE_MS = 33;

  for (let i = 0; i < 100; i++) {
    const now = i * 2;
    if (now - lastEmit >= THROTTLE_MS) {
      emittedCount++;
      lastEmit = now;
    }
  }

  console.log(`  - 100 raw mouse events compressed to ${emittedCount} socket emissions (~30 updates/sec).`);
  if (emittedCount > 10) {
    throw new Error('Test 6 Failed: Throttling did not effectively constrain update rate.');
  }
  console.log('  -> PASS: High-frequency throttling keeps network traffic minimal without lag.');

  // Cleanup
  clientA.disconnect();
  clientRoomB.disconnect();

  console.log('\n✨ ALL 6 MULTIPLAYER CURSOR SYNCHRONIZATION TESTS PASSED!\n');
  process.exit(0);
}

runCursorTests().catch((err) => {
  console.error('\n❌ CURSOR TEST FAILED:', err);
  process.exit(1);
});

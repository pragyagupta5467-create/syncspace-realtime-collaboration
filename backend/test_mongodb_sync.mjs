import { io } from 'socket.io-client';

const SERVER_URL = 'http://127.0.0.1:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMongoSyncTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        SYNCSPACE MONGODB & REAL DATA PERSISTENCE TEST SUITE        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  const testRoomId = 'SYNC-MONGO-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const isolatedRoomId = 'SYNC-ISO-' + Math.random().toString(36).substring(2, 7).toUpperCase();

  // TEST 1: Create Room in MongoDB via POST /api/rooms
  console.log(`--- TEST 1: Create Room ${testRoomId} in MongoDB via POST /api/rooms ---`);
  const createRoomRes = await fetch(`${SERVER_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: testRoomId,
      user: { userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1' },
    }),
  });
  const createRoomData = await createRoomRes.json();
  if (!createRoomRes.ok || !createRoomData.success || createRoomData.room.roomId !== testRoomId) {
    throw new Error('Test 1 Failed: Room creation in MongoDB failed.');
  }
  console.log(`  -> PASS: Room ${testRoomId} created and persisted in database.`);

  // TEST 2: Join non-existent room -> must be rejected with error
  console.log('\n--- TEST 2: Attempt joining non-existent room SYNC-DOES-NOT-EXIST ---');
  const clientFake = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientFake.on('connect', res));

  const joinFakeRes = await new Promise((res) => {
    clientFake.emit('join-room', {
      roomId: 'SYNC-DOES-NOT-EXIST',
      user: { userId: 'user_fake', displayName: 'FakeUser' },
    }, res);
  });

  if (joinFakeRes.success) {
    throw new Error('Test 2 Failed: Non-existent room was accepted without error!');
  }
  console.log(`  -> PASS: Non-existent room rejected with error: "${joinFakeRes.error}".`);
  clientFake.disconnect();

  // TEST 3: Connect Device A (Pragya) and Device B (Rahul) to the fresh room
  console.log(`\n--- TEST 3: Real User Connection & Clean Empty State in ${testRoomId} ---`);
  const clientA = io(SERVER_URL, { transports: ['websocket'] });
  const clientB = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((res) => clientA.on('connect', res)),
    new Promise((res) => clientB.on('connect', res)),
  ]);

  let clientBReceivedTask = null;
  clientB.on('task-created', (d) => { clientBReceivedTask = d.task; });

  let clientAReceivedMove = null;
  clientA.on('task-moved', (d) => { clientAReceivedMove = d.task; });

  let clientBReceivedUpdate = null;
  clientB.on('task-updated', (d) => { clientBReceivedUpdate = d.task; });

  const joinA = await new Promise((res) => {
    clientA.emit('join-room', {
      roomId: testRoomId,
      user: { userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1' },
    }, res);
  });

  // Verify initial empty state (0 tasks, no fake tasks)
  console.log(`  - Newly created room initial task count: ${joinA.tasks.length}`);
  if (joinA.tasks.length !== 0) {
    throw new Error('Test 3 Failed: Room contains fake/seed tasks! Expected 0.');
  }
  console.log('  -> PASS: Verified honest empty state (0 tasks). No fake/seed tasks present.');

  const joinB = await new Promise((res) => {
    clientB.emit('join-room', {
      roomId: testRoomId,
      user: { userId: 'user_rahul', displayName: 'Rahul', userColor: '#10b981' },
    }, res);
  });

  // Device A creates a real task
  console.log('\n--- TEST 4: Device A creates task -> written to MongoDB -> Device B receives broadcast ---');
  const taskCreateRes = await new Promise((res) => {
    clientA.emit('task-create', {
      roomId: testRoomId,
      task: {
        title: 'Real Database Task 1',
        description: 'Verified with durable MongoDB persistence',
        priority: 'HIGH',
        status: 'TODO',
      },
    }, res);
  });

  await wait(200);

  if (!taskCreateRes.success || !clientBReceivedTask || clientBReceivedTask.id !== taskCreateRes.task.id) {
    throw new Error('Test 4 Failed: Task creation or broadcast failed.');
  }
  const createdTaskId = taskCreateRes.task.id;
  console.log(`  -> PASS: Task "${taskCreateRes.task.title}" (ID: ${createdTaskId}) persisted in DB and broadcasted to Device B.`);

  // TEST 5: Device B moves task -> updated in MongoDB -> Device A receives move
  console.log('\n--- TEST 5: Device B moves task (TODO -> IN_PROGRESS) ---');
  const taskMoveRes = await new Promise((res) => {
    clientB.emit('task-move', {
      roomId: testRoomId,
      taskId: createdTaskId,
      newStatus: 'IN_PROGRESS',
      newPosition: 0,
    }, res);
  });

  await wait(200);

  if (!taskMoveRes.success || !clientAReceivedMove || clientAReceivedMove.status !== 'IN_PROGRESS') {
    throw new Error('Test 5 Failed: Task move was not persisted or received.');
  }
  console.log(`  -> PASS: Task status updated to IN_PROGRESS (Version: v${taskMoveRes.task.version}, UpdatedBy: ${taskMoveRes.task.updatedBy.displayName}).`);

  // TEST 6: Version increment verification (v1 -> v2 -> v3)
  console.log('\n--- TEST 6: Version Increment Verification ---');
  const updateRes = await new Promise((res) => {
    clientA.emit('task-update', {
      roomId: testRoomId,
      taskId: createdTaskId,
      updates: { title: 'Real Database Task 1 (Edited)' },
    }, res);
  });

  await wait(200);

  if (updateRes.task.version < 3) {
    throw new Error(`Test 6 Failed: Version did not increment properly. Got v${updateRes.task.version}`);
  }
  console.log(`  -> PASS: Task version successfully incremented to v${updateRes.task.version}.`);

  // TEST 7: Persistence across complete client disconnection & re-query via REST
  console.log('\n--- TEST 7: Full Persistence across Disconnect & REST Query ---');
  clientA.disconnect();
  clientB.disconnect();
  await wait(200);

  const getTasksRes = await fetch(`${SERVER_URL}/api/rooms/${testRoomId}/tasks`);
  const getTasksData = await getTasksRes.json();

  if (!getTasksRes.ok || !Array.isArray(getTasksData.tasks) || getTasksData.tasks.length !== 1) {
    throw new Error('Test 7 Failed: Failed to retrieve persisted tasks from MongoDB.');
  }
  const persisted = getTasksData.tasks[0];
  if (persisted.title !== 'Real Database Task 1 (Edited)' || persisted.status !== 'IN_PROGRESS') {
    throw new Error('Test 7 Failed: Persisted data does not match latest update.');
  }
  console.log(`  -> PASS: MongoDB REST API returned persisted task: "${persisted.title}" [Status: ${persisted.status}, Version: v${persisted.version}].`);

  // TEST 8: Room Isolation
  console.log('\n--- TEST 8: Room Isolation in MongoDB ---');
  await fetch(`${SERVER_URL}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: isolatedRoomId,
      user: { userId: 'user_david', displayName: 'David' },
    }),
  });

  const isolatedTasksRes = await fetch(`${SERVER_URL}/api/rooms/${isolatedRoomId}/tasks`);
  const isolatedTasksData = await isolatedTasksRes.json();

  if (isolatedTasksData.tasks.length !== 0) {
    throw new Error('Test 8 Failed: Isolated room contains tasks from another room!');
  }
  console.log(`  -> PASS: Room ${isolatedRoomId} is completely isolated with 0 leaked tasks.`);

  // TEST 9: Failed persistence rejection handling
  console.log('\n--- TEST 9: Failed Persistence Graceful Error Handling ---');
  const clientTest = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientTest.on('connect', res));

  await new Promise((res) => {
    clientTest.emit('join-room', {
      roomId: testRoomId,
      user: { userId: 'user_test', displayName: 'Tester' },
    }, res);
  });

  const badTaskRes = await new Promise((res) => {
    clientTest.emit('task-create', {
      roomId: testRoomId,
      task: { title: '   ' },
    }, res);
  });

  if (badTaskRes.success) {
    throw new Error('Test 9 Failed: Invalid task creation with empty title was erroneously accepted.');
  }
  console.log(`  -> PASS: Invalid task rejected with clear error: "${badTaskRes.error}".`);
  clientTest.disconnect();

  console.log('\n✨ ALL 9 MONGODB & REAL DATA PERSISTENCE TESTS PASSED WITH 100% SUCCESS!\n');
}

runMongoSyncTests().catch((err) => {
  console.error('\n❌ TEST FAILED:', err);
  process.exit(1);
});

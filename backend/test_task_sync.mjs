import { io } from 'socket.io-client';

const SERVER_URL = 'http://127.0.0.1:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTaskSyncTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║   SYNCSPACE COLLABORATIVE TASK BOARD & STATE SYNCHRONIZATION TESTS ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // STEP 1: Connect Browser A (Pragya) and Browser B (Rahul) to room SYNC-TASKS-101
  console.log('[Setup] Connecting Browser A (Pragya) & Browser B (Rahul) to SYNC-TASKS-101...');

  const clientA = io(SERVER_URL, { transports: ['websocket'] });
  const clientB = io(SERVER_URL, { transports: ['websocket'] });

  await Promise.all([
    new Promise((res) => clientA.on('connect', res)),
    new Promise((res) => clientB.on('connect', res)),
  ]);

  let clientATasks = [];
  let clientBTasks = [];

  clientA.on('room-state', (d) => { clientATasks = d.tasks || []; });
  clientA.on('task-created', (d) => { clientATasks.push(d.task); });
  clientA.on('task-updated', (d) => {
    clientATasks = clientATasks.map((t) => (t.id === d.task.id ? d.task : t));
  });
  clientA.on('task-moved', (d) => {
    clientATasks = clientATasks.map((t) => (t.id === d.task.id ? d.task : t));
  });

  clientB.on('room-state', (d) => { clientBTasks = d.tasks || []; });
  clientB.on('task-created', (d) => { clientBTasks.push(d.task); });
  clientB.on('task-updated', (d) => {
    clientBTasks = clientBTasks.map((t) => (t.id === d.task.id ? d.task : t));
  });
  clientB.on('task-moved', (d) => {
    clientBTasks = clientBTasks.map((t) => (t.id === d.task.id ? d.task : t));
  });

  const joinA = await new Promise((res) => {
    clientA.emit('join-room', {
      roomId: 'SYNC-TASKS-101',
      autoCreate: true,
      user: { userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1' },
    }, res);
  });

  const joinB = await new Promise((res) => {
    clientB.emit('join-room', {
      roomId: 'SYNC-TASKS-101',
      user: { userId: 'user_rahul', displayName: 'Rahul', userColor: '#10b981' },
    }, res);
  });

  clientATasks = joinA.tasks || [];
  clientBTasks = joinB.tasks || [];

  console.log(`  -> Connected. Initial tasks in room: ${clientATasks.length}`);

  // TEST A: Create task in Browser A -> Browser B sees it instantly
  console.log('\n--- TEST A: Create task in Browser A (Pragya) ---');
  const createRes = await new Promise((res) => {
    clientA.emit('task-create', {
      roomId: 'SYNC-TASKS-101',
      task: {
        title: 'Build JWT Authentication Engine',
        description: 'Set up signed token validation and middleware handlers',
        priority: 'HIGH',
        status: 'TODO',
      },
    }, res);
  });

  await wait(200);

  const createdTaskId = createRes.task.id;
  const foundInB = clientBTasks.find((t) => t.id === createdTaskId);

  if (!foundInB || foundInB.title !== 'Build JWT Authentication Engine' || foundInB.priority !== 'HIGH') {
    throw new Error('Test A Failed: Browser B did not receive the created task.');
  }
  console.log(`  -> PASS: Browser B received task "${foundInB.title}" (ID: ${createdTaskId}) created by Pragya.`);

  // TEST B: Move task in Browser B (TODO -> IN_PROGRESS) -> Browser A sees the move
  console.log('\n--- TEST B: Move task in Browser B (Rahul) to IN_PROGRESS ---');
  await new Promise((res) => {
    clientB.emit('task-move', {
      roomId: 'SYNC-TASKS-101',
      taskId: createdTaskId,
      newStatus: 'IN_PROGRESS',
      newPosition: 0,
    }, res);
  });

  await wait(200);

  const foundInA = clientATasks.find((t) => t.id === createdTaskId);
  if (!foundInA || foundInA.status !== 'IN_PROGRESS' || foundInA.updatedBy.displayName !== 'Rahul') {
    throw new Error('Test B Failed: Browser A did not receive the task move update.');
  }
  console.log(`  -> PASS: Browser A sees task moved to IN_PROGRESS (updatedBy: ${foundInA.updatedBy.displayName}).`);

  // TEST C: Edit task in Browser A (Priority HIGH -> LOW, update description) -> Browser B receives update
  console.log('\n--- TEST C: Edit task in Browser A (Pragya) ---');
  await new Promise((res) => {
    clientA.emit('task-update', {
      roomId: 'SYNC-TASKS-101',
      taskId: createdTaskId,
      updates: {
        title: 'Build JWT Authentication Engine (Updated)',
        priority: 'LOW',
        description: 'Refined requirements for token refresh',
      },
    }, res);
  });

  await wait(200);

  const updatedInB = clientBTasks.find((t) => t.id === createdTaskId);
  if (!updatedInB || updatedInB.priority !== 'LOW' || updatedInB.version < 3) {
    throw new Error('Test C Failed: Browser B did not receive updated priority and version.');
  }
  console.log(`  -> PASS: Browser B received update: "${updatedInB.title}" [Priority: ${updatedInB.priority}, Version: v${updatedInB.version}].`);

  // TEST D: Two users edit different tasks simultaneously -> Both changes survive
  console.log('\n--- TEST D: Simultaneous edits on different tasks ---');
  const secondTaskRes = await new Promise((res) => {
    clientA.emit('task-create', {
      roomId: 'SYNC-TASKS-101',
      task: { title: 'Implement WebSocket Throttling', status: 'TODO', priority: 'MEDIUM' },
    }, res);
  });
  const secondTaskId = secondTaskRes.task.id;
  await wait(100);

  await Promise.all([
    new Promise((res) => clientA.emit('task-update', {
      roomId: 'SYNC-TASKS-101',
      taskId: createdTaskId,
      updates: { description: 'Concurrent edit from User A' },
    }, res)),
    new Promise((res) => clientB.emit('task-update', {
      roomId: 'SYNC-TASKS-101',
      taskId: secondTaskId,
      updates: { description: 'Concurrent edit from User B' },
    }, res)),
  ]);

  await wait(250);

  const t1 = clientATasks.find((t) => t.id === createdTaskId);
  const t2 = clientBTasks.find((t) => t.id === secondTaskId);

  if (t1.description !== 'Concurrent edit from User A' || t2.description !== 'Concurrent edit from User B') {
    throw new Error('Test D Failed: Concurrent granular updates clobbered each other.');
  }
  console.log('  -> PASS: Both concurrent task edits survived independently with granular state updates.');

  // TEST E: Join existing room with existing tasks -> New user receives full state
  console.log('\n--- TEST E: New User (Ananya) joins room with existing tasks ---');
  const clientC = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientC.on('connect', res));

  const joinC = await new Promise((res) => {
    clientC.emit('join-room', {
      roomId: 'SYNC-TASKS-101',
      user: { userId: 'user_ananya', displayName: 'Ananya', userColor: '#a855f7' },
    }, res);
  });

  if (!joinC.tasks || joinC.tasks.length < 2) {
    throw new Error('Test E Failed: Joining user did not receive room tasks.');
  }
  const hasTask1 = joinC.tasks.some((t) => t.id === createdTaskId);
  const hasTask2 = joinC.tasks.some((t) => t.id === secondTaskId);

  if (!hasTask1 || !hasTask2) {
    throw new Error('Test E Failed: Initial room state missing recent tasks.');
  }
  console.log(`  -> PASS: Ananya received all ${joinC.tasks.length} active tasks upon joining.`);

  // TEST F: Different rooms -> Tasks from Room A never appear in Room B
  console.log('\n--- TEST F: Room Isolation (Room A vs Room B) ---');
  const clientRoomB = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientRoomB.on('connect', res));

  let roomBTasks = [];
  clientRoomB.on('task-created', (d) => { roomBTasks.push(d.task); });

  await new Promise((res) => {
    clientRoomB.emit('join-room', {
      roomId: 'SYNC-TASKS-ISOLATED',
      autoCreate: true,
      user: { userId: 'user_other', displayName: 'OtherUser', userColor: '#06b6d4' },
    }, res);
  });

  await new Promise((res) => {
    clientA.emit('task-create', {
      roomId: 'SYNC-TASKS-101',
      task: { title: 'Secret Task in Room 101', status: 'TODO', priority: 'HIGH' },
    }, res);
  });

  await wait(200);

  const leaked = roomBTasks.some((t) => t.title === 'Secret Task in Room 101');
  if (leaked) {
    throw new Error('Test F Failed: Task from Room A leaked to Room B!');
  }
  console.log('  -> PASS: Room Isolation verified. Tasks are strictly isolated per room.');

  // TEST G: Disconnect and Reconnect -> User reconnects and receives current authoritative room state
  console.log('\n--- TEST G: Disconnect and Reconnect State Restoration ---');
  clientA.disconnect();
  await wait(200);

  await new Promise((res) => {
    clientB.emit('task-update', {
      roomId: 'SYNC-TASKS-101',
      taskId: createdTaskId,
      updates: { status: 'DONE', title: 'Build JWT Auth (Completed Offline)' },
    }, res);
  });

  const clientAReconnected = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => clientAReconnected.on('connect', res));

  const rejoinA = await new Promise((res) => {
    clientAReconnected.emit('join-room', {
      roomId: 'SYNC-TASKS-101',
      user: { userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1' },
    }, res);
  });

  const syncedTask = rejoinA.tasks.find((t) => t.id === createdTaskId);
  if (!syncedTask || syncedTask.status !== 'DONE' || syncedTask.title !== 'Build JWT Auth (Completed Offline)') {
    throw new Error('Test G Failed: Reconnecting client did not receive updated authoritative state.');
  }
  console.log(`  -> PASS: Reconnected client seamlessly restored authoritative state (Status: ${syncedTask.status}).`);

  // Cleanup
  clientAReconnected.disconnect();
  clientB.disconnect();
  clientRoomB.disconnect();

  console.log('\n✨ ALL 7 COLLABORATIVE TASK BOARD & STATE SYNCHRONIZATION TESTS PASSED!\n');
  process.exit(0);
}

runTaskSyncTests().catch((err) => {
  console.error('\n❌ TASK SYNC TEST FAILED:', err);
  process.exit(1);
});

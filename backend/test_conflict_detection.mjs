import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://127.0.0.1:5000';
const ROOM_ID = `SYNC-OCC-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

function createClient(name, color = '#6366f1') {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
  });

  const userId = `usr_${Math.random().toString(36).substring(2, 9)}`;
  const user = { userId, displayName: name, userColor: color };

  return { socket, user };
}

async function runTests() {
  console.log('🧪 Starting SyncSpace Real-Time Conflict Detection (OCC) Test Suite...');
  console.log(`📁 Test Room: ${ROOM_ID}\n`);

  const clientA = createClient('User A (Alice)', '#6366f1');
  const clientB = createClient('User B (Bob)', '#ec4899');
  const clientC = createClient('User C (Charlie)', '#10b981');

  try {
    // 1. Connect clients
    await Promise.all([
      new Promise((res) => clientA.socket.on('connect', res)),
      new Promise((res) => clientB.socket.on('connect', res)),
      new Promise((res) => clientC.socket.on('connect', res)),
    ]);
    console.log('✅ 1. Sockets connected: Alice, Bob, Charlie');

    // 2. Join room
    await Promise.all([
      new Promise((res) => clientA.socket.emit('join-room', { roomId: ROOM_ID, user: clientA.user, autoCreate: true }, res)),
      new Promise((res) => clientB.socket.emit('join-room', { roomId: ROOM_ID, user: clientB.user, autoCreate: true }, res)),
      new Promise((res) => clientC.socket.emit('join-room', { roomId: ROOM_ID, user: clientC.user, autoCreate: true }, res)),
    ]);
    console.log('✅ 2. All 3 users joined room successfully');

    // 3. Create two distinct tasks
    let task1, task2;
    await new Promise((res) => {
      clientA.socket.emit(
        'task-create',
        {
          roomId: ROOM_ID,
          task: { title: 'Task Alpha', description: 'Alpha description', priority: 'MEDIUM', status: 'TODO' },
        },
        (response) => {
          assert.strictEqual(response.success, true);
          assert.strictEqual(response.task.version, 1);
          task1 = response.task;
          res();
        }
      );
    });

    await new Promise((res) => {
      clientB.socket.emit(
        'task-create',
        {
          roomId: ROOM_ID,
          task: { title: 'Task Beta', description: 'Beta description', priority: 'LOW', status: 'TODO' },
        },
        (response) => {
          assert.strictEqual(response.success, true);
          assert.strictEqual(response.task.version, 1);
          task2 = response.task;
          res();
        }
      );
    });
    console.log('✅ 3. Created Task 1 (v1) and Task 2 (v1)');

    // 4. Test Simultaneous Edits to DIFFERENT tasks (should both succeed without conflict)
    const [resTask1, resTask2] = await Promise.all([
      new Promise((res) => {
        clientA.socket.emit(
          'task-update',
          {
            roomId: ROOM_ID,
            taskId: task1.id,
            updates: { priority: 'HIGH' },
            expectedVersion: 1,
          },
          res
        );
      }),
      new Promise((res) => {
        clientB.socket.emit(
          'task-update',
          {
            roomId: ROOM_ID,
            taskId: task2.id,
            updates: { priority: 'MEDIUM' },
            expectedVersion: 1,
          },
          res
        );
      }),
    ]);

    assert.strictEqual(resTask1.success, true, 'Task 1 edit succeeded');
    assert.strictEqual(resTask1.task.version, 2, 'Task 1 version incremented to 2');
    assert.strictEqual(resTask2.success, true, 'Task 2 edit succeeded');
    assert.strictEqual(resTask2.task.version, 2, 'Task 2 version incremented to 2');
    console.log('✅ 4. Simultaneous edits on DIFFERENT tasks both succeeded (granular isolation verified)');

    // 5. Test Sequential Edits to the SAME task
    const resSequential = await new Promise((res) => {
      clientA.socket.emit(
        'task-update',
        {
          roomId: ROOM_ID,
          taskId: task1.id,
          updates: { title: 'Task Alpha Updated' },
          expectedVersion: 2,
        },
        res
      );
    });
    assert.strictEqual(resSequential.success, true);
    assert.strictEqual(resSequential.task.version, 3);
    assert.strictEqual(resSequential.task.title, 'Task Alpha Updated');
    console.log('✅ 5. Sequential edit succeeded (Task 1 version is now v3)');

    // 6. Test Concurrent Stale Edits to the SAME task (Conflict Detection)
    // Both Alice and Bob start with Task 1 at v3.
    // Alice submits changes first (expectedVersion = 3) -> bumps to v4.
    // Bob concurrently submits changes with stale expectedVersion = 3 -> MUST FAIL with conflict!
    
    let bobConflictEvent = null;
    clientB.socket.once('task-conflict', (data) => {
      bobConflictEvent = data;
    });

    const aliceUpdatePromise = new Promise((res) => {
      clientA.socket.emit(
        'task-update',
        {
          roomId: ROOM_ID,
          taskId: task1.id,
          updates: { priority: 'LOW', title: 'Alice Priority LOW' },
          expectedVersion: 3,
        },
        res
      );
    });

    const aliceResult = await aliceUpdatePromise;
    assert.strictEqual(aliceResult.success, true);
    assert.strictEqual(aliceResult.task.version, 4);
    assert.strictEqual(aliceResult.task.priority, 'LOW');
    console.log('✅ 6a. Alice update succeeded (Task 1 is now v4, priority=LOW)');

    // Now Bob tries to update with stale expectedVersion = 3
    const bobResult = await new Promise((res) => {
      clientB.socket.emit(
        'task-update',
        {
          roomId: ROOM_ID,
          taskId: task1.id,
          updates: { priority: 'HIGH', title: 'Bob Priority HIGH' },
          expectedVersion: 3, // Stale! Current server is v4
        },
        res
      );
    });

    assert.strictEqual(bobResult.success, false, 'Bob stale update was rejected');
    assert.strictEqual(bobResult.conflict, true, 'Conflict flag is true');
    assert.strictEqual(bobResult.code, 'VERSION_CONFLICT', 'Error code is VERSION_CONFLICT');
    assert.strictEqual(bobResult.expectedVersion, 3, 'Recorded Bob expectedVersion 3');
    assert.strictEqual(bobResult.currentVersion, 4, 'Current server version is 4');
    assert.strictEqual(bobResult.currentTask.priority, 'LOW', 'Alice update was not overwritten');
    console.log('✅ 6b. Bob stale update safely rejected with VERSION_CONFLICT (Alice update protected)');

    // Check Bob socket event
    await new Promise((res) => setTimeout(res, 100));
    assert.ok(bobConflictEvent, 'Bob received task-conflict broadcast on his socket');
    assert.strictEqual(bobConflictEvent.currentVersion, 4);
    console.log('✅ 6c. Bob received realtime task-conflict event with latest server task');

    // 7. Test Safe Resolution Strategy: "Retry My Changes" against new version
    const retryResult = await new Promise((res) => {
      clientB.socket.emit(
        'task-update',
        {
          roomId: ROOM_ID,
          taskId: task1.id,
          updates: bobResult.attemptedChanges,
          expectedVersion: bobResult.currentVersion, // Retry with v4
        },
        res
      );
    });

    assert.strictEqual(retryResult.success, true);
    assert.strictEqual(retryResult.task.version, 5);
    assert.strictEqual(retryResult.task.priority, 'HIGH');
    console.log('✅ 7. "Retry My Changes" re-applied against v4 successfully -> Task 1 is now v5');

    // 8. Test Conflict on Task Move (Drag & Drop OCC)
    const moveConflictResult = await new Promise((res) => {
      clientA.socket.emit(
        'task-move',
        {
          roomId: ROOM_ID,
          taskId: task1.id,
          newStatus: 'DONE',
          expectedVersion: 1, // Stale version! Current is 5
        },
        res
      );
    });

    assert.strictEqual(moveConflictResult.conflict, true);
    assert.strictEqual(moveConflictResult.currentVersion, 5);
    console.log('✅ 8. Drag & Drop move OCC conflict detected when moving stale card');

    console.log('\n🎉 ALL 8 OCC CONFLICT DETECTION & RESOLUTION TESTS PASSED PERFECTLY!');
  } catch (err) {
    console.error('❌ Test failed:', err);
    process.exit(1);
  } finally {
    clientA.socket.disconnect();
    clientB.socket.disconnect();
    clientC.socket.disconnect();
  }
}

runTests();

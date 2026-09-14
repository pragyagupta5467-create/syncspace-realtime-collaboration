import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://127.0.0.1:5000';
const ROOM_A = `SYNC-REP-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
const ROOM_B = `SYNC-REP-ISO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

function wait(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function createClient(name, color = '#6366f1') {
  const socket = io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
  });

  const userId = `usr_${Math.random().toString(36).substring(2, 9)}`;
  const user = { userId, displayName: name, userColor: color };

  return { socket, user };
}

// Reducer function matching frontend implementation
function reconstructTasksAtStep(events, stepIndex) {
  let tasks = [];
  const boundedStep = Math.max(0, Math.min(stepIndex, events.length));

  for (let i = 0; i < boundedStep; i++) {
    const ev = events[i];
    if (!ev) continue;

    if (ev.type === 'TASK_CREATED') {
      tasks.push({
        id: ev.taskId,
        title: ev.taskTitle,
        priority: ev.metadata?.priority || 'MEDIUM',
        status: ev.metadata?.status || 'TODO',
        version: 1,
      });
    } else if (ev.type === 'TASK_MOVED') {
      tasks = tasks.map((t) => (t.id === ev.taskId ? { ...t, status: ev.metadata.newStatus } : t));
    } else if (ev.type === 'TASK_UPDATED') {
      tasks = tasks.map((t) => (t.id === ev.taskId ? { ...t, ...ev.metadata.updates } : t));
    } else if (ev.type === 'TASK_DELETED') {
      tasks = tasks.filter((t) => t.id !== ev.taskId);
    }
    // TASK_CONFLICT does NOT mutate tasks!
  }

  return tasks;
}

async function runSessionReplayTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        SYNCSPACE REAL SESSION REPLAY ENGINE TEST SUITE             ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📁 Test Room A: ${ROOM_A}`);
  console.log(`📁 Test Room B (Isolated): ${ROOM_B}\n`);

  const clientA = createClient('Pragya', '#6366f1');
  const clientB = createClient('Rahul', '#10b981');
  const clientRoomB = createClient('Ananya', '#ec4899');

  try {
    // 1. Connect sockets
    await Promise.all([
      new Promise((res) => clientA.socket.on('connect', res)),
      new Promise((res) => clientB.socket.on('connect', res)),
      new Promise((res) => clientRoomB.socket.on('connect', res)),
    ]);
    console.log('✅ 1. Sockets connected');

    // 2. Test 1: Replay on Fresh Empty Room
    // Create room first
    await new Promise((res) => {
      clientA.socket.emit('join-room', { roomId: ROOM_A, user: clientA.user, autoCreate: true }, res);
    });

    const emptyReplayRes = await fetch(`${SERVER_URL}/api/rooms/${ROOM_A}/replay`).then((r) => r.json());
    assert.strictEqual(emptyReplayRes.success, true);
    // There is only the initial USER_JOINED event
    const nonLifecycleEvents = emptyReplayRes.events.filter((e) => e.type !== 'USER_JOINED' && e.type !== 'USER_LEFT');
    assert.strictEqual(nonLifecycleEvents.length, 0, 'No task events on empty room');
    console.log('✅ 2. Empty Room Replay verified (0 fake/mock tasks in history)');

    // 3. Perform a realistic multi-step collaborative session
    await new Promise((res) => {
      clientB.socket.emit('join-room', { roomId: ROOM_A, user: clientB.user, autoCreate: true }, res);
    });
    await wait(50);

    // Action 1: Pragya creates Task Alpha
    let taskAlpha;
    await new Promise((res) => {
      clientA.socket.emit(
        'task-create',
        {
          roomId: ROOM_A,
          task: { title: 'Task Alpha (Auth API)', priority: 'HIGH', status: 'TODO' },
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          taskAlpha = resp.task;
          res();
        }
      );
    });
    await wait(50);

    // Action 2: Rahul creates Task Beta
    let taskBeta;
    await new Promise((res) => {
      clientB.socket.emit(
        'task-create',
        {
          roomId: ROOM_A,
          task: { title: 'Task Beta (Database Schema)', priority: 'LOW', status: 'TODO' },
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          taskBeta = resp.task;
          res();
        }
      );
    });
    await wait(50);

    // Action 3: Pragya moves Task Alpha -> IN_PROGRESS
    await new Promise((res) => {
      clientA.socket.emit(
        'task-move',
        {
          roomId: ROOM_A,
          taskId: taskAlpha.id,
          newStatus: 'IN_PROGRESS',
          expectedVersion: taskAlpha.version,
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          taskAlpha = resp.task;
          res();
        }
      );
    });
    await wait(50);

    // Action 4: Rahul updates Task Beta priority -> MEDIUM
    await new Promise((res) => {
      clientB.socket.emit(
        'task-update',
        {
          roomId: ROOM_A,
          taskId: taskBeta.id,
          updates: { priority: 'MEDIUM' },
          expectedVersion: taskBeta.version,
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          taskBeta = resp.task;
          res();
        }
      );
    });
    await wait(50);

    // Action 5: Rahul triggers a REAL version conflict on Task Alpha
    await new Promise((res) => {
      clientB.socket.emit(
        'task-update',
        {
          roomId: ROOM_A,
          taskId: taskAlpha.id,
          updates: { priority: 'LOW' },
          expectedVersion: 1, // Stale! Current version is 2
        },
        (resp) => {
          assert.strictEqual(resp.conflict, true);
          res();
        }
      );
    });
    await wait(50);

    // Action 6: Pragya moves Task Alpha -> DONE
    await new Promise((res) => {
      clientA.socket.emit(
        'task-move',
        {
          roomId: ROOM_A,
          taskId: taskAlpha.id,
          newStatus: 'DONE',
          expectedVersion: taskAlpha.version,
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          taskAlpha = resp.task;
          res();
        }
      );
    });
    await wait(100);

    console.log('✅ 3. Executed 6 real collaborative actions across Pragya & Rahul');

    // 4. Fetch Chronological Replay from API
    const replayData = await fetch(`${SERVER_URL}/api/rooms/${ROOM_A}/replay`).then((r) => r.json());
    assert.strictEqual(replayData.success, true);
    assert.strictEqual(replayData.roomId, ROOM_A);
    assert.ok(replayData.events.length >= 8, 'Replay returned all historical events');

    // Verify chronological order (Ascending)
    for (let i = 0; i < replayData.events.length - 1; i++) {
      const t1 = new Date(replayData.events[i].timestamp).getTime();
      const t2 = new Date(replayData.events[i + 1].timestamp).getTime();
      assert.ok(t1 <= t2, `Events are strictly chronological (Ascending order): index ${i}`);
    }
    console.log('✅ 4. GET /api/rooms/:roomId/replay returned chronological events (ASC timestamp order verified)');

    // 5. Verify Step-by-Step Deterministic State Reconstruction
    const taskEvents = replayData.events.filter((e) =>
      ['TASK_CREATED', 'TASK_MOVED', 'TASK_UPDATED', 'TASK_DELETED', 'TASK_CONFLICT'].includes(e.type)
    );

    // Step 0: Empty
    const state0 = reconstructTasksAtStep(taskEvents, 0);
    assert.strictEqual(state0.length, 0, 'Step 0 has 0 tasks');

    // Step 1: After Task Alpha Created
    const state1 = reconstructTasksAtStep(taskEvents, 1);
    assert.strictEqual(state1.length, 1);
    assert.strictEqual(state1[0].title, 'Task Alpha (Auth API)');
    assert.strictEqual(state1[0].status, 'TODO');
    assert.strictEqual(state1[0].priority, 'HIGH');

    // Step 2: After Task Beta Created
    const state2 = reconstructTasksAtStep(taskEvents, 2);
    assert.strictEqual(state2.length, 2);
    assert.strictEqual(state2[1].title, 'Task Beta (Database Schema)');
    assert.strictEqual(state2[1].status, 'TODO');

    // Step 3: After Task Alpha moved to IN_PROGRESS
    const state3 = reconstructTasksAtStep(taskEvents, 3);
    assert.strictEqual(state3.find((t) => t.id === taskAlpha.id).status, 'IN_PROGRESS');
    assert.strictEqual(state3.find((t) => t.id === taskBeta.id).status, 'TODO');

    // Step 4: After Task Beta priority updated to MEDIUM
    const state4 = reconstructTasksAtStep(taskEvents, 4);
    assert.strictEqual(state4.find((t) => t.id === taskBeta.id).priority, 'MEDIUM');

    // Step 5: After OCC conflict occurred -> Verify conflict did NOT mutate task state
    const state5 = reconstructTasksAtStep(taskEvents, 5);
    const alphaInStep5 = state5.find((t) => t.id === taskAlpha.id);
    assert.strictEqual(alphaInStep5.status, 'IN_PROGRESS', 'Conflict did NOT alter status');
    assert.strictEqual(alphaInStep5.priority, 'HIGH', 'Rejected stale edit did NOT overwrite priority');

    // Step 6: After Task Alpha moved to DONE
    const state6 = reconstructTasksAtStep(taskEvents, 6);
    assert.strictEqual(state6.find((t) => t.id === taskAlpha.id).status, 'DONE');
    assert.strictEqual(state6.find((t) => t.id === taskBeta.id).status, 'TODO');

    console.log('✅ 5. Deterministic Step-by-Step Historical State Reconstruction verified for all steps');

    // 6. Test Room Isolation
    await new Promise((res) => {
      clientRoomB.socket.emit('join-room', { roomId: ROOM_B, user: clientRoomB.user, autoCreate: true }, res);
    });
    await new Promise((res) => {
      clientRoomB.socket.emit(
        'task-create',
        {
          roomId: ROOM_B,
          task: { title: 'Room B Isolated Task', priority: 'LOW', status: 'TODO' },
        },
        res
      );
    });
    await wait(50);

    const replayB = await fetch(`${SERVER_URL}/api/rooms/${ROOM_B}/replay`).then((r) => r.json());
    const leakedFromA = replayB.events.some((e) => e.roomId === ROOM_A || e.taskTitle?.includes('Alpha'));
    assert.strictEqual(leakedFromA, false, 'Zero leakage from Room A into Room B replay');
    console.log('✅ 6. Room Isolation verified: Room B replay contains zero Room A events');

    console.log('\n✨ ALL 6 SESSION REPLAY TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ SESSION REPLAY TEST FAILED:', err);
    process.exit(1);
  } finally {
    clientA.socket.disconnect();
    clientB.socket.disconnect();
    clientRoomB.socket.disconnect();
  }
}

runSessionReplayTests();

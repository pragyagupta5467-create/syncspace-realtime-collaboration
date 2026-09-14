import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://127.0.0.1:5000';
const ROOM_A = `SYNC-ACT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
const ROOM_B = `SYNC-ISO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

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

async function runActivityFeedTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       SYNCSPACE REAL-TIME ACTIVITY FEED & PERSISTENCE TESTS        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  console.log(`📁 Test Room A: ${ROOM_A}`);
  console.log(`📁 Test Room B (Isolated): ${ROOM_B}\n`);

  const clientA = createClient('Pragya', '#6366f1');
  const clientB = createClient('Rahul', '#10b981');
  const clientRoomB = createClient('Ananya', '#ec4899');

  const clientAActivities = [];
  const clientBActivities = [];
  const clientRoomBActivities = [];

  try {
    // 1. Connect sockets
    await Promise.all([
      new Promise((res) => clientA.socket.on('connect', res)),
      new Promise((res) => clientB.socket.on('connect', res)),
      new Promise((res) => clientRoomB.socket.on('connect', res)),
    ]);
    console.log('✅ 1. Sockets connected');

    clientA.socket.on('activity-created', (d) => {
      clientAActivities.unshift(d.activity);
    });
    clientB.socket.on('activity-created', (d) => {
      clientBActivities.unshift(d.activity);
    });
    clientRoomB.socket.on('activity-created', (d) => {
      clientRoomBActivities.unshift(d.activity);
    });

    // 2. Test Empty State on Fresh Room
    const restEmpty = await fetch(`${SERVER_URL}/api/rooms/${ROOM_A}/activities`).then((r) => r.json());
    assert.strictEqual(restEmpty.activities.length, 0, 'New room has 0 activities (zero demo data)');
    console.log('✅ 2. Clean empty state verified for fresh room (0 mock activities)');

    // 3. Client A Joins Room A -> USER_JOINED activity created
    const joinA = await new Promise((res) => {
      clientA.socket.emit('join-room', { roomId: ROOM_A, user: clientA.user, autoCreate: true }, res);
    });
    assert.strictEqual(joinA.success, true);
    await wait(100);

    const initialJoinAct = clientAActivities.find((a) => a.type === 'USER_JOINED' && a.userId === clientA.user.userId);
    assert.ok(initialJoinAct, 'USER_JOINED activity recorded for Pragya');
    console.log(`✅ 3. USER_JOINED activity recorded: "${initialJoinAct.userName} joined the room"`);

    // 4. Client B Joins Room A -> Both clients receive USER_JOINED for Rahul
    const joinB = await new Promise((res) => {
      clientB.socket.emit('join-room', { roomId: ROOM_A, user: clientB.user, autoCreate: true }, res);
    });
    assert.strictEqual(joinB.success, true);
    await wait(100);

    const rahulJoinA = clientAActivities.find((a) => a.type === 'USER_JOINED' && a.userId === clientB.user.userId);
    const rahulJoinB = clientBActivities.find((a) => a.type === 'USER_JOINED' && a.userId === clientB.user.userId);
    assert.ok(rahulJoinA, 'Client A received Rahul USER_JOINED');
    assert.ok(rahulJoinB, 'Client B received Rahul USER_JOINED');
    console.log('✅ 4. Real-time USER_JOINED broadcasted to all room collaborators');

    // 5. Client A Creates Task -> TASK_CREATED activity
    let createdTask;
    await new Promise((res) => {
      clientA.socket.emit(
        'task-create',
        {
          roomId: ROOM_A,
          task: {
            title: 'Build Live Activity Engine',
            description: 'Stream structured collaboration events',
            priority: 'HIGH',
            status: 'TODO',
          },
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          createdTask = resp.task;
          res();
        }
      );
    });
    await wait(100);

    const taskCreatedAct = clientBActivities.find((a) => a.type === 'TASK_CREATED' && a.taskId === createdTask.id);
    assert.ok(taskCreatedAct, 'TASK_CREATED activity received by Client B');
    assert.strictEqual(taskCreatedAct.taskTitle, 'Build Live Activity Engine');
    assert.strictEqual(taskCreatedAct.userName, 'Pragya');
    console.log(`✅ 5. TASK_CREATED activity received: "${taskCreatedAct.userName} created '${taskCreatedAct.taskTitle}'"`);

    // 6. Client B Moves Task -> Single TASK_MOVED activity
    await new Promise((res) => {
      clientB.socket.emit(
        'task-move',
        {
          roomId: ROOM_A,
          taskId: createdTask.id,
          newStatus: 'IN_PROGRESS',
          newPosition: 0,
          expectedVersion: createdTask.version,
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          createdTask = resp.task;
          res();
        }
      );
    });
    await wait(100);

    const taskMovedAct = clientAActivities.find((a) => a.type === 'TASK_MOVED' && a.taskId === createdTask.id);
    assert.ok(taskMovedAct, 'TASK_MOVED activity received by Client A');
    assert.strictEqual(taskMovedAct.metadata.newStatus, 'IN_PROGRESS');
    assert.strictEqual(taskMovedAct.userName, 'Rahul');
    console.log(`✅ 6. TASK_MOVED activity received: "${taskMovedAct.userName} moved '${taskMovedAct.taskTitle}' -> IN_PROGRESS"`);

    // 7. Client A Updates Task -> TASK_UPDATED activity
    await new Promise((res) => {
      clientA.socket.emit(
        'task-update',
        {
          roomId: ROOM_A,
          taskId: createdTask.id,
          updates: { priority: 'LOW', title: 'Build Live Activity Engine (Enhanced)' },
          expectedVersion: createdTask.version,
        },
        (resp) => {
          assert.strictEqual(resp.success, true);
          createdTask = resp.task;
          res();
        }
      );
    });
    await wait(100);

    const taskUpdatedAct = clientBActivities.find((a) => a.type === 'TASK_UPDATED' && a.taskId === createdTask.id);
    assert.ok(taskUpdatedAct, 'TASK_UPDATED activity received');
    assert.strictEqual(taskUpdatedAct.taskTitle, 'Build Live Activity Engine (Enhanced)');
    console.log(`✅ 7. TASK_UPDATED activity received: "${taskUpdatedAct.userName} updated '${taskUpdatedAct.taskTitle}'"`);

    // 8. Stale OCC Conflict -> TASK_CONFLICT activity
    await new Promise((res) => {
      clientB.socket.emit(
        'task-update',
        {
          roomId: ROOM_A,
          taskId: createdTask.id,
          updates: { priority: 'HIGH' },
          expectedVersion: 1, // Stale! Current version is higher
        },
        (resp) => {
          assert.strictEqual(resp.conflict, true);
          res();
        }
      );
    });
    await wait(100);

    const conflictAct = clientAActivities.find((a) => a.type === 'TASK_CONFLICT' && a.taskId === createdTask.id);
    assert.ok(conflictAct, 'TASK_CONFLICT activity broadcasted to room');
    assert.strictEqual(conflictAct.userName, 'Rahul');
    assert.strictEqual(conflictAct.metadata.expectedVersion, 1);
    console.log(`✅ 8. Real TASK_CONFLICT activity recorded & broadcasted with OCC metadata`);

    // 9. Client B Leaves Room -> USER_LEFT activity
    await new Promise((res) => {
      clientB.socket.emit('leave-room', { roomId: ROOM_A }, res);
    });
    await wait(100);

    const userLeftAct = clientAActivities.find((a) => a.type === 'USER_LEFT' && a.userId === clientB.user.userId);
    assert.ok(userLeftAct, 'USER_LEFT activity received by Client A');
    console.log(`✅ 9. USER_LEFT activity received: "${userLeftAct.userName} left the room"`);

    // 10. Room Isolation: Client in Room B joins and performs actions
    await new Promise((res) => {
      clientRoomB.socket.emit('join-room', { roomId: ROOM_B, user: clientRoomB.user, autoCreate: true }, res);
    });
    await new Promise((res) => {
      clientRoomB.socket.emit(
        'task-create',
        {
          roomId: ROOM_B,
          task: { title: 'Isolated Task for Room B', priority: 'LOW', status: 'TODO' },
        },
        res
      );
    });
    await wait(100);

    // Verify Room A never received any Room B activities
    const leakedAct = clientAActivities.find((a) => a.roomId === ROOM_B || a.taskTitle === 'Isolated Task for Room B');
    assert.strictEqual(leakedAct, undefined, 'Zero activity leakage across rooms');
    console.log('✅ 10. Room Isolation verified (Room A activity feed contains zero Room B events)');

    // 11. REST Activity History & Pagination (Max 50)
    const restRes = await fetch(`${SERVER_URL}/api/rooms/${ROOM_A}/activities?limit=50`).then((r) => r.json());
    assert.strictEqual(restRes.success, true);
    assert.ok(restRes.activities.length >= 6, 'REST API returned persisted room activities');
    // Verify sorted newest first
    for (let i = 0; i < restRes.activities.length - 1; i++) {
      const t1 = new Date(restRes.activities[i].timestamp).getTime();
      const t2 = new Date(restRes.activities[i + 1].timestamp).getTime();
      assert.ok(t1 >= t2, 'Activities are sorted newest first');
    }
    console.log(`✅ 11. Persistent activity history fetched via REST API (${restRes.activities.length} events, newest-first verified)`);

    console.log('\n✨ ALL 11 REAL-TIME ACTIVITY FEED TESTS PASSED WITH 100% SUCCESS!\n');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ ACTIVITY FEED TEST FAILED:', err);
    process.exit(1);
  } finally {
    clientA.socket.disconnect();
    clientB.socket.disconnect();
    clientRoomB.socket.disconnect();
  }
}

runActivityFeedTests();

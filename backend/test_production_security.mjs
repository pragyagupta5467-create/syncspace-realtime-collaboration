import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://127.0.0.1:5000';
const ROOM_A = `SYNC-SEC-A-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
const ROOM_B = `SYNC-SEC-B-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

const createClient = () => {
  return io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runProductionSecurityTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        SYNCSPACE PRODUCTION SECURITY & HARDENING TEST SUITE        ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  console.log(`📁 Room A: ${ROOM_A}`);
  console.log(`📁 Room B (Isolated Target): ${ROOM_B}\n`);

  const clientA = createClient();
  const clientB = createClient();

  const userA = { userId: 'usr_sec_alice', displayName: 'Alice', userColor: '#6366f1' };
  const userB = { userId: 'usr_sec_bob', displayName: 'Bob', userColor: '#10b981' };

  try {
    // 1. Connect Sockets & Join Rooms
    await Promise.all([
      new Promise((res) => clientA.on('connect', res)),
      new Promise((res) => clientB.on('connect', res)),
    ]);
    console.log('✅ 1. Sockets connected');

    const joinA = await new Promise((res) => {
      clientA.emit('join-room', { roomId: ROOM_A, autoCreate: true, user: userA }, res);
    });
    assert.strictEqual(joinA.success, true);

    const joinB = await new Promise((res) => {
      clientB.emit('join-room', { roomId: ROOM_B, autoCreate: true, user: userB }, res);
    });
    assert.strictEqual(joinB.success, true);
    console.log('✅ 2. Alice joined Room A and Bob joined Room B');

    // TEST 1: Cross-Room Access Control (Alice tries to create a task in Room B)
    console.log('\n--- Test 1: Cross-Room Access Rejection ---');
    const crossCreate = await new Promise((res) => {
      clientA.emit('task-create', {
        roomId: ROOM_B,
        task: { title: 'Malicious Cross-Room Task', status: 'TODO', priority: 'HIGH' },
      }, res);
    });
    assert.strictEqual(crossCreate.success, false, 'Client A must be prevented from creating tasks in Room B');
    assert.strictEqual(crossCreate.error?.code, 'NOT_ROOM_MEMBER', 'Should return NOT_ROOM_MEMBER error code');
    console.log('✅ Test 1 Passed: Unauthorized cross-room task creation rejected (NOT_ROOM_MEMBER)');

    // Create a legitimate task in Room B by Bob
    const bobTaskRes = await new Promise((res) => {
      clientB.emit('task-create', {
        roomId: ROOM_B,
        task: { title: "Bob's Secure Task", status: 'TODO', priority: 'MEDIUM' },
      }, res);
    });
    assert.strictEqual(bobTaskRes.success, true);
    const bobTaskId = bobTaskRes.task.id;

    // Alice tries to edit Bob's task in Room B
    const crossUpdate = await new Promise((res) => {
      clientA.emit('task-update', {
        roomId: ROOM_B,
        taskId: bobTaskId,
        updates: { title: 'Hacked by Alice' },
        expectedVersion: 1,
      }, res);
    });
    assert.strictEqual(crossUpdate.success, false);
    assert.strictEqual(crossUpdate.error?.code, 'NOT_ROOM_MEMBER');
    console.log('✅ Test 1b Passed: Unauthorized cross-room task update rejected (NOT_ROOM_MEMBER)');

    // TEST 2: Server-Side Input Validation
    console.log('\n--- Test 2: Strong Input Validation ---');

    // 2a: Empty Title
    const emptyTitleRes = await new Promise((res) => {
      clientA.emit('task-create', {
        roomId: ROOM_A,
        task: { title: '   ', status: 'TODO' },
      }, res);
    });
    assert.strictEqual(emptyTitleRes.success, false);
    assert.strictEqual(emptyTitleRes.error?.code, 'INVALID_TASK');
    console.log('✅ Test 2a Passed: Empty task title rejected with INVALID_TASK');

    // 2b: Invalid Status
    const invalidStatusRes = await new Promise((res) => {
      clientA.emit('task-move', {
        roomId: ROOM_A,
        taskId: 'some_task',
        newStatus: 'NON_EXISTENT_STATUS',
      }, res);
    });
    assert.strictEqual(invalidStatusRes.success, false);
    assert.strictEqual(invalidStatusRes.error?.code, 'INVALID_TASK');
    console.log('✅ Test 2b Passed: Invalid status rejected with INVALID_TASK');

    // 2c: Invalid Room ID
    const invalidRoomRes = await new Promise((res) => {
      clientA.emit('join-room', {
        roomId: '<script>alert("xss")</script>',
        user: userA,
      }, res);
    });
    assert.strictEqual(invalidRoomRes.success, false);
    assert.strictEqual(invalidRoomRes.error?.code, 'INVALID_ROOM_ID');
    console.log('✅ Test 2c Passed: Malicious / invalid Room ID rejected with INVALID_ROOM_ID');

    // TEST 3: Stale OCC Version Conflict Formatting
    console.log('\n--- Test 3: Standardized OCC Version Conflict ---');
    const taskARes = await new Promise((res) => {
      clientA.emit('task-create', {
        roomId: ROOM_A,
        task: { title: 'Versioned Task', status: 'TODO', priority: 'LOW' },
      }, res);
    });
    const taskAId = taskARes.task.id;

    // First update (v1 -> v2)
    const updateV1 = await new Promise((res) => {
      clientA.emit('task-update', {
        roomId: ROOM_A,
        taskId: taskAId,
        updates: { priority: 'HIGH' },
        expectedVersion: 1,
      }, res);
    });
    assert.strictEqual(updateV1.success, true);
    assert.strictEqual(updateV1.task.version, 2);

    // Stale update attempting with old expectedVersion: 1
    const staleUpdate = await new Promise((res) => {
      clientA.emit('task-update', {
        roomId: ROOM_A,
        taskId: taskAId,
        updates: { priority: 'MEDIUM' },
        expectedVersion: 1,
      }, res);
    });
    assert.strictEqual(staleUpdate.success, false);
    assert.strictEqual(staleUpdate.conflict, true);
    assert.ok(
      staleUpdate.error?.code === 'TASK_VERSION_CONFLICT' || staleUpdate.code === 'VERSION_CONFLICT',
      'Must contain TASK_VERSION_CONFLICT error code'
    );
    console.log('✅ Test 3 Passed: Stale version update cleanly rejected with TASK_VERSION_CONFLICT');

    // TEST 4: Rate Limiter Protection
    console.log('\n--- Test 4: Rate Limiter Flood Protection ---');
    let rateLimitTriggered = false;
    for (let i = 0; i < 25; i++) {
      const res = await new Promise((resolve) => {
        clientA.emit('task-create', {
          roomId: ROOM_A,
          task: { title: `Rapid Task ${i}` },
        }, resolve);
      });
      if (res?.error?.code === 'RATE_LIMITED') {
        rateLimitTriggered = true;
        break;
      }
    }
    assert.strictEqual(rateLimitTriggered, true, 'Rapid mutation spam must trigger RATE_LIMITED error');
    console.log('✅ Test 4 Passed: Server-side rate limiter actively protected server from spam (RATE_LIMITED)');

    // TEST 5: Health Check Endpoint
    console.log('\n--- Test 5: Backend Health Check Endpoint ---');
    const healthRes = await fetch(`${SERVER_URL}/health`).then((r) => r.json());
    assert.strictEqual(healthRes.status, 'ok');
    assert.ok(healthRes.uptime >= 0);
    assert.ok(healthRes.database !== undefined);
    console.log(`✅ Test 5 Passed: GET /health returned status: ${healthRes.status} (Database: ${healthRes.database})`);

    // TEST 6: REST API Room Scoping
    console.log('\n--- Test 6: Scoped REST API Queries ---');
    const roomATasks = await fetch(`${SERVER_URL}/api/rooms/${ROOM_A}/tasks`).then((r) => r.json());
    const roomBTasks = await fetch(`${SERVER_URL}/api/rooms/${ROOM_B}/tasks`).then((r) => r.json());

    const hasBobInA = roomATasks.tasks.some((t) => t.id === bobTaskId);
    const hasAliceInB = roomBTasks.tasks.some((t) => t.id === taskAId);
    assert.strictEqual(hasBobInA, false, 'Room A must not contain Room B tasks');
    assert.strictEqual(hasAliceInB, false, 'Room B must not contain Room A tasks');
    console.log('✅ Test 6 Passed: Database queries are 100% scoped to the target room');

    console.log('\n🎉 ALL PRODUCTION SECURITY, VALIDATION & RATE LIMITING TESTS PASSED (6/6)!\n');

  } finally {
    clientA.disconnect();
    clientB.disconnect();
  }
}

runProductionSecurityTests().catch((err) => {
  console.error('Security Test Suite Failed:', err);
  process.exit(1);
});

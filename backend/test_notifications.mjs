import { io } from 'socket.io-client';

const API_BASE = 'http://127.0.0.1:5000/api';
const SOCKET_URL = 'http://127.0.0.1:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
}

async function runNotificationTests() {
  console.log('\n=============================================================');
  console.log('🔔 TESTING REAL-TIME NOTIFICATION SYSTEM (SYNCSPACE)');
  console.log('=============================================================\n');

  const stamp = Date.now();
  const aliceEmail = `alice_notif_${stamp}@syncspace.dev`;
  const bobEmail = `bob_notif_${stamp}@syncspace.dev`;
  const testRoomId = `SYNC-NOTIF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // 1. Register User Alice
  console.log('1. Registering Alice and Bob with real hashed accounts...');
  const aliceRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice Cooper',
      email: aliceEmail,
      password: 'Password123!',
    }),
  });
  const aliceData = await aliceRes.json();
  assert(aliceData.success && aliceData.token, 'Alice registered successfully');
  const alice = aliceData.user;
  const aliceToken = aliceData.token;

  // 2. Register User Bob
  const bobRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bob Marley',
      email: bobEmail,
      password: 'Password123!',
    }),
  });
  const bobData = await bobRes.json();
  assert(bobData.success && bobData.token, 'Bob registered successfully');
  const bob = bobData.user;
  const bobToken = bobData.token;

  // 3. Connect real authenticated Socket.IO clients
  console.log('\n2. Connecting authenticated WebSockets for Alice & Bob...');
  const aliceSocket = io(SOCKET_URL, {
    auth: { token: aliceToken },
    transports: ['websocket'],
  });

  const bobSocket = io(SOCKET_URL, {
    auth: { token: bobToken },
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    let connected = 0;
    const check = () => {
      connected++;
      if (connected === 2) resolve();
    };
    aliceSocket.on('connect', check);
    bobSocket.on('connect', check);
  });
  assert(aliceSocket.connected && bobSocket.connected, 'Both sockets connected with JWT auth');

  const aliceReceivedNotifs = [];
  const bobReceivedNotifs = [];

  aliceSocket.on('notification-created', (notif) => {
    aliceReceivedNotifs.push(notif);
    console.log(`  [Alice Socket Received Notification] -> Type: ${notif.type} | Message: "${notif.message}"`);
  });

  bobSocket.on('notification-created', (notif) => {
    bobReceivedNotifs.push(notif);
    console.log(`  [Bob Socket Received Notification] -> Type: ${notif.type} | Message: "${notif.message}"`);
  });

  // 4. Alice joins room first
  console.log(`\n3. Alice creates and joins workspace "${testRoomId}"...`);
  await new Promise((resolve) => {
    aliceSocket.emit('join-room', {
      roomId: testRoomId,
      autoCreate: true,
      user: {
        userId: alice.userId,
        displayName: alice.name,
        userColor: '#ec4899',
      },
    }, (res) => {
      assert(res.success, 'Alice joined room');
      resolve();
    });
  });

  // 5. Bob joins room -> Alice should receive USER_JOINED notification in real-time
  console.log(`\n4. Bob joins workspace "${testRoomId}" -> Alice should receive USER_JOINED notification...`);
  await new Promise((resolve) => {
    bobSocket.emit('join-room', {
      roomId: testRoomId,
      user: {
        userId: bob.userId,
        displayName: bob.name,
        userColor: '#3b82f6',
      },
    }, (res) => {
      assert(res.success, 'Bob joined room');
      resolve();
    });
  });

  await wait(500);

  const userJoinedNotif = aliceReceivedNotifs.find((n) => n.type === 'USER_JOINED');
  assert(userJoinedNotif, 'Alice received real-time USER_JOINED notification via WebSocket');
  assert(userJoinedNotif.recipientId === alice.userId, 'Notification recipient is Alice');
  assert(userJoinedNotif.actorId === bob.userId, 'Notification actor is Bob');
  assert(bobReceivedNotifs.length === 0, 'Bob did not receive join notification for himself (no self-spam)');

  // 6. Alice creates a task assigned to Bob -> Bob receives TASK_ASSIGNED notification
  console.log('\n5. Alice creates task assigned to Bob -> Bob should receive TASK_ASSIGNED notification...');
  let createdTask;
  await new Promise((resolve) => {
    aliceSocket.emit('task-create', {
      roomId: testRoomId,
      task: {
        title: 'Build Notification Center',
        description: 'Complete real-time notifications with Socket.IO & MongoDB',
        status: 'TODO',
        priority: 'HIGH',
        assignedTo: {
          userId: bob.userId,
          displayName: bob.name,
          userColor: '#3b82f6',
        },
      },
    }, (res) => {
      assert(res.success, 'Task created successfully in MongoDB');
      createdTask = res.task;
      resolve();
    });
  });

  await wait(500);

  const taskAssignedNotif = bobReceivedNotifs.find((n) => n.type === 'TASK_ASSIGNED');
  assert(taskAssignedNotif, 'Bob received real-time TASK_ASSIGNED notification');
  assert(taskAssignedNotif.recipientId === bob.userId, 'Notification correctly routed to Bob');
  assert(taskAssignedNotif.taskId === createdTask.id, 'Notification contains correct taskId');

  // 7. Bob moves task to DONE -> Alice (creator) receives TASK_COMPLETED notification
  console.log('\n6. Bob marks task as DONE -> Alice should receive TASK_COMPLETED notification...');
  await new Promise((resolve) => {
    bobSocket.emit('task-move', {
      roomId: testRoomId,
      taskId: createdTask.id,
      newStatus: 'DONE',
      newPosition: 0,
      expectedVersion: createdTask.version,
    }, (res) => {
      assert(res.success, 'Bob moved task to DONE');
      resolve();
    });
  });

  await wait(500);

  const taskDoneNotif = aliceReceivedNotifs.find((n) => n.type === 'TASK_COMPLETED');
  assert(taskDoneNotif, 'Alice received real-time TASK_COMPLETED notification');
  assert(taskDoneNotif.recipientId === alice.userId, 'Notification recipient is Alice');

  // 8. Test OCC Conflict Notification: Bob attempts stale update with old version
  console.log('\n7. Bob triggers OCC conflict -> Bob should receive TASK_CONFLICT notification...');
  await new Promise((resolve) => {
    bobSocket.emit('task-update', {
      roomId: testRoomId,
      taskId: createdTask.id,
      updates: { title: 'Conflicting Stale Edit' },
      expectedVersion: 1, // Stale version! (Task is now at v2)
    }, (res) => {
      assert(res.conflict === true, 'Server correctly detected OCC conflict');
      resolve();
    });
  });

  await wait(500);

  const conflictNotif = bobReceivedNotifs.find((n) => n.type === 'TASK_CONFLICT');
  assert(conflictNotif, 'Bob received real-time TASK_CONFLICT notification');
  assert(conflictNotif.recipientId === bob.userId, 'Conflict notification routed to user who experienced conflict');

  // 9. Verify REST API: GET /api/notifications
  console.log('\n8. Testing REST API GET /api/notifications for Alice & Bob...');
  const aliceFetchRes = await fetch(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const aliceNotifData = await aliceFetchRes.json();
  assert(aliceNotifData.success, 'Alice fetched notifications from REST API');
  assert(aliceNotifData.notifications.length >= 2, `Alice has ${aliceNotifData.notifications.length} notifications in MongoDB`);
  assert(aliceNotifData.unreadCount >= 2, `Alice unreadCount is ${aliceNotifData.unreadCount}`);

  // 10. Test REST API: PATCH /api/notifications/:id/read
  console.log('\n9. Testing REST API PATCH /api/notifications/:id/read...');
  const firstNotifId = aliceNotifData.notifications[0].id || aliceNotifData.notifications[0].notificationId;
  const markReadRes = await fetch(`${API_BASE}/notifications/${firstNotifId}/read`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const markReadData = await markReadRes.json();
  assert(markReadData.success && markReadData.updated, 'Single notification marked as read');

  // 11. Test REST API: PATCH /api/notifications/read-all
  console.log('\n10. Testing REST API PATCH /api/notifications/read-all...');
  const markAllRes = await fetch(`${API_BASE}/notifications/read-all`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const markAllData = await markAllRes.json();
  assert(markAllData.success, 'Mark all notifications as read succeeded');

  const aliceAfterAllRes = await fetch(`${API_BASE}/notifications`, {
    headers: { Authorization: `Bearer ${aliceToken}` },
  });
  const aliceAfterAllData = await aliceAfterAllRes.json();
  assert(aliceAfterAllData.unreadCount === 0, 'Alice unreadCount is now 0 after mark-all-read');

  // 12. Disconnect test sockets
  aliceSocket.disconnect();
  bobSocket.disconnect();

  console.log('\n=============================================================');
  console.log('🎉 ALL NOTIFICATION SYSTEM VERIFICATION TESTS PASSED (100%)');
  console.log('=============================================================\n');
}

runNotificationTests().catch((err) => {
  console.error('\n❌ Notification test suite failed:', err);
  process.exit(1);
});

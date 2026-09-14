import { io } from 'socket.io-client';

const BACKEND_URL = 'http://127.0.0.1:5000';

async function runMultiUserAuthCollaborationTest() {
  console.log('🧪 Starting Multi-User Real Authentication & Collaboration Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  const suffix = Math.random().toString(36).substring(2, 7);
  const user1 = {
    name: 'Pragya Real Account',
    email: `pragya_${suffix}@syncspace.dev`,
    password: 'Password123!',
  };
  const user2 = {
    name: 'Rahul Real Account',
    email: `rahul_${suffix}@syncspace.dev`,
    password: 'Password456!',
  };

  let token1 = null;
  let token2 = null;
  let profile1 = null;
  let profile2 = null;

  // 1. Sign up User 1
  console.log('--- TEST 1: Sign up User 1 (Pragya) ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user1),
    });
    const data = await res.json();
    assert(res.status === 201, `Status is 201 Created (got ${res.status})`);
    assert(data.token && typeof data.token === 'string', 'Received valid token for User 1');
    assert(data.user.name === user1.name, 'User 1 name matches');
    assert(data.user.email === user1.email, 'User 1 email matches');
    token1 = data.token;
    profile1 = data.user;
  } catch (err) {
    assert(false, `User 1 signup error: ${err.message}`);
  }

  // 2. Sign up User 2
  console.log('\n--- TEST 2: Sign up User 2 (Rahul) ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(user2),
    });
    const data = await res.json();
    assert(res.status === 201, `Status is 201 Created (got ${res.status})`);
    assert(data.token && typeof data.token === 'string', 'Received valid token for User 2');
    assert(data.user.name === user2.name, 'User 2 name matches');
    assert(data.user.email === user2.email, 'User 2 email matches');
    token2 = data.token;
    profile2 = data.user;
  } catch (err) {
    assert(false, `User 2 signup error: ${err.message}`);
  }

  // 3. Login User 1
  console.log('\n--- TEST 3: Login User 1 ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user1.email, password: user1.password }),
    });
    const data = await res.json();
    assert(res.status === 200, 'Login succeeded with 200 OK');
    assert(data.user.userId === profile1.userId, 'User ID matches signup');
    token1 = data.token;
  } catch (err) {
    assert(false, `User 1 login error: ${err.message}`);
  }

  // 4. Create Room with User 1 as Authenticated Creator
  const roomId = `SYNC-COLLAB-${suffix.toUpperCase()}`;
  console.log(`\n--- TEST 4: Create Real Room (${roomId}) by User 1 ---`);
  try {
    const res = await fetch(`${BACKEND_URL}/api/rooms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token1}`,
      },
      body: JSON.stringify({
        roomId,
        user: profile1,
      }),
    });
    const data = await res.json();
    assert(res.status === 201, 'Room created with 201 Created');
    assert(data.room?.roomId === roomId, `Room ID verified: ${roomId}`);
  } catch (err) {
    assert(false, `Room creation error: ${err.message}`);
  }

  // 5. Test GET /api/user/rooms for User 1
  console.log('\n--- TEST 5: Fetch User 1 Workspaces from API ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/user/rooms`, {
      headers: { Authorization: `Bearer ${token1}` },
    });
    const data = await res.json();
    assert(res.status === 200, 'GET /api/user/rooms returned 200 OK');
    assert(Array.isArray(data.rooms), 'Returned array of rooms');
    assert(data.rooms.some((r) => r.roomId === roomId), 'User 1 created room is in list');
  } catch (err) {
    assert(false, `User rooms API error: ${err.message}`);
  }

  // 6. Connect both authenticated sockets and test real-time collaboration
  console.log('\n--- TEST 6: Real-time Multi-User Socket Presence & Task Sync ---');
  try {
    const socket1 = io(BACKEND_URL, {
      auth: { token: token1 },
      transports: ['websocket'],
    });

    const socket2 = io(BACKEND_URL, {
      auth: { token: token2 },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      let socket1Joined = false;
      let socket2Joined = false;

      const finishCheck = () => {
        if (socket1Joined && socket2Joined) {
          socket1.disconnect();
          socket2.disconnect();
          resolve();
        }
      };

      socket1.on('connect', () => {
        socket1.emit('join-room', { roomId, autoCreate: true }, (res1) => {
          assert(res1.success === true, 'Socket 1 joined room successfully');
          assert(res1.user?.displayName === user1.name, 'Socket 1 verified as Pragya');
          assert(res1.user?.userId === profile1.userId, 'Socket 1 user ID bound to Pragya');
          socket1Joined = true;

          // User 1 creates task
          socket1.emit(
            'task-create',
            {
              roomId,
              task: { title: 'Implement JWT Socket Security', priority: 'HIGH' },
            },
            (taskRes) => {
              assert(taskRes.success === true, 'Task created by Socket 1');
              assert(taskRes.task?.createdBy?.displayName === user1.name, 'Task creator recorded as Pragya');
              finishCheck();
            }
          );
        });
      });

      socket2.on('connect', () => {
        socket2.emit('join-room', { roomId, autoCreate: true }, (res2) => {
          assert(res2.success === true, 'Socket 2 joined room successfully');
          assert(res2.user?.displayName === user2.name, 'Socket 2 verified as Rahul');
          assert(res2.user?.userId === profile2.userId, 'Socket 2 user ID bound to Rahul');
          socket2Joined = true;
          finishCheck();
        });
      });

      socket1.on('connect_error', reject);
      socket2.on('connect_error', reject);
    });
  } catch (err) {
    assert(false, `Multi-user socket test error: ${err.message}`);
  }

  // 7. Test Logout
  console.log('\n--- TEST 7: Logout API ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token1}` },
    });
    const data = await res.json();
    assert(res.status === 200, 'Logout returned 200 OK');
    assert(data.success === true, 'Logout success is true');
  } catch (err) {
    assert(false, `Logout test error: ${err.message}`);
  }

  console.log('\n========================================');
  console.log(`Results: ${passed} Passed | ${failed} Failed`);
  if (failed === 0) {
    console.log('🎉 ALL MULTI-USER AUTH & COLLABORATION TESTS PASSED 100%!');
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runMultiUserAuthCollaborationTest().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});

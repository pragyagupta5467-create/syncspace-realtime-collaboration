import { io } from 'socket.io-client';

const BACKEND_URL = 'http://127.0.0.1:5000';

async function runAuthTests() {
  console.log('🧪 Starting SyncSpace Authentication & User Security Test Suite...\n');

  let testPassed = 0;
  let testFailed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      testPassed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      testFailed++;
    }
  }

  const randomSuffix = Math.random().toString(36).substring(2, 8);
  const testUser = {
    name: 'Pragya Real User',
    email: `pragya_${randomSuffix}@syncspace.io`,
    password: 'SecurePassword123!',
  };

  let authToken = null;
  let authenticatedUser = null;

  // 1. Test Registration
  console.log('--- TEST 1: Register New Real User ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const data = await res.json();
    assert(res.status === 201, `Status is 201 Created (got ${res.status})`);
    assert(data.success === true, 'Response success is true');
    assert(data.token && typeof data.token === 'string', 'JWT token returned');
    assert(data.user && data.user.email === testUser.email, 'User email matches');
    assert(data.user.name === testUser.name, 'User name matches');
    assert(!data.user.passwordHash && !data.user.password, 'Password hash is NOT exposed in response');
    authToken = data.token;
    authenticatedUser = data.user;
  } catch (err) {
    assert(false, `Registration failed with error: ${err.message}`);
  }

  // 2. Test Duplicate Email Prevention
  console.log('\n--- TEST 2: Duplicate Email Rejection ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser),
    });
    const data = await res.json();
    assert(res.status === 400, `Duplicate registration rejected with 400 (got ${res.status})`);
    assert(data.success === false, 'Response success is false');
    assert(data.error?.code === 'EMAIL_IN_USE', `Error code is EMAIL_IN_USE (got ${data.error?.code})`);
  } catch (err) {
    assert(false, `Duplicate email test error: ${err.message}`);
  }

  // 3. Test Invalid Password Registration
  console.log('\n--- TEST 3: Short Password Rejection ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Bob', email: `bob_${randomSuffix}@test.com`, password: '123' }),
    });
    const data = await res.json();
    assert(res.status === 400, `Short password rejected with 400 (got ${res.status})`);
    assert(data.error?.code === 'INVALID_PASSWORD', `Error code is INVALID_PASSWORD`);
  } catch (err) {
    assert(false, `Short password test error: ${err.message}`);
  }

  // 4. Test Login with Wrong Password
  console.log('\n--- TEST 4: Login with Wrong Password Rejection ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: 'WrongPassword999!' }),
    });
    const data = await res.json();
    assert(res.status === 401, `Wrong password rejected with 401 Unauthorized (got ${res.status})`);
    assert(data.success === false, 'Response success is false');
    assert(data.error?.code === 'INVALID_CREDENTIALS', `Error code is INVALID_CREDENTIALS`);
  } catch (err) {
    assert(false, `Wrong password test error: ${err.message}`);
  }

  // 5. Test Login with Correct Password
  console.log('\n--- TEST 5: Login with Correct Password ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testUser.email, password: testUser.password }),
    });
    const data = await res.json();
    assert(res.status === 200, `Status is 200 OK (got ${res.status})`);
    assert(data.success === true, 'Response success is true');
    assert(data.token && typeof data.token === 'string', 'Valid JWT token returned');
    assert(data.user && data.user.userId === authenticatedUser.userId, 'User ID matches registered account');
    authToken = data.token;
  } catch (err) {
    assert(false, `Login test error: ${err.message}`);
  }

  // 6. Test GET /api/auth/me (Protected Route)
  console.log('\n--- TEST 6: GET /api/auth/me with Bearer Token ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const data = await res.json();
    assert(res.status === 200, `Status is 200 OK (got ${res.status})`);
    assert(data.user && data.user.email === testUser.email, `Profile email verified: ${data.user?.email}`);
    assert(data.user.name === testUser.name, `Profile name verified: ${data.user?.name}`);
  } catch (err) {
    assert(false, `Auth me test error: ${err.message}`);
  }

  // 7. Test GET /api/auth/me with Invalid Token
  console.log('\n--- TEST 7: GET /api/auth/me with Invalid Token ---');
  try {
    const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
      headers: { Authorization: 'Bearer invalid_garbage_token_xyz' },
    });
    const data = await res.json();
    assert(res.status === 401, `Invalid token rejected with 401 (got ${res.status})`);
    assert(data.success === false, 'Response success is false');
  } catch (err) {
    assert(false, `Invalid token test error: ${err.message}`);
  }

  // 8. Test Socket.IO Authentication Handshake
  console.log('\n--- TEST 8: Socket.IO Authenticated Handshake ---');
  try {
    const socket = io(BACKEND_URL, {
      auth: { token: authToken },
      transports: ['websocket'],
    });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
      socket.on('connect', () => {
        clearTimeout(timeout);
        assert(socket.connected, 'Socket connected with JWT auth token');

        // Join room and check if server associates authenticated user identity
        const testRoomId = `SYNC-AUTH-${randomSuffix.toUpperCase()}`;
        socket.emit(
          'join-room',
          {
            roomId: testRoomId,
            autoCreate: true,
          },
          (response) => {
            assert(response.success === true, `Room joined: ${testRoomId}`);
            assert(
              response.user && response.user.userId === authenticatedUser.userId,
              `Server bound authoritative user ID: ${response.user?.userId}`
            );
            assert(
              response.user.displayName === testUser.name,
              `Server bound authoritative name: ${response.user?.displayName}`
            );
            socket.disconnect();
            resolve();
          }
        );
      });
      socket.on('connect_error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  } catch (err) {
    assert(false, `Socket auth test error: ${err.message}`);
  }

  console.log(`\n========================================`);
  console.log(`Total Passed: ${testPassed} | Total Failed: ${testFailed}`);
  if (testFailed === 0) {
    console.log(`🎉 ALL AUTHENTICATION & SECURITY TESTS PASSED!`);
    process.exit(0);
  } else {
    console.error(`💥 SOME AUTH TESTS FAILED!`);
    process.exit(1);
  }
}

runAuthTests().catch((err) => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});

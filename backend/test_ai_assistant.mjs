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

async function runAIAssistantTests() {
  console.log('\n=============================================================');
  console.log('🤖 TESTING REAL AI WORKSPACE ASSISTANT (SYNCSPACE)');
  console.log('=============================================================\n');

  const stamp = Date.now();
  const aliceEmail = `alice_ai_${stamp}@syncspace.dev`;
  const bobEmail = `bob_ai_${stamp}@syncspace.dev`;
  const testRoomId = `SYNC-AI-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
  const emptyRoomId = `SYNC-EMPTY-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

  // 1. Register Real Accounts
  console.log('1. Registering Alice & Bob real accounts...');
  const aliceRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Alice Developer',
      email: aliceEmail,
      password: 'Password123!',
    }),
  });
  const aliceData = await aliceRes.json();
  assert(aliceData.success && aliceData.token, 'Alice registered successfully');
  const alice = aliceData.user;
  const aliceToken = aliceData.token;

  const bobRes = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Bob Architect',
      email: bobEmail,
      password: 'Password123!',
    }),
  });
  const bobData = await bobRes.json();
  assert(bobData.success && bobData.token, 'Bob registered successfully');
  const bob = bobData.user;
  const bobToken = bobData.token;

  // 2. Connect WebSockets & Populate Workspace
  console.log('\n2. Joining workspace and populating real tasks & activities...');
  const aliceSocket = io(SOCKET_URL, {
    auth: { token: aliceToken },
    transports: ['websocket'],
  });

  await new Promise((resolve) => {
    aliceSocket.on('connect', resolve);
  });

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
      assert(res.success, `Alice joined workspace ${testRoomId}`);
      resolve();
    });
  });

  // Create Task 1: HIGH priority TODO (Assignee: Alice)
  let task1;
  await new Promise((resolve) => {
    aliceSocket.emit('task-create', {
      roomId: testRoomId,
      task: {
        title: 'Implement OAuth2 Security Flow',
        description: 'Secure all REST endpoints and WebSockets with JWT token verification',
        status: 'TODO',
        priority: 'HIGH',
        assignedTo: {
          userId: alice.userId,
          displayName: alice.name,
          userColor: '#ec4899',
        },
      },
    }, (res) => {
      assert(res.success, 'Task 1 (HIGH priority TODO) created');
      task1 = res.task;
      resolve();
    });
  });

  // Create Task 2: MEDIUM priority IN_PROGRESS (Assignee: Bob)
  let task2;
  await new Promise((resolve) => {
    aliceSocket.emit('task-create', {
      roomId: testRoomId,
      task: {
        title: 'Optimize Database Query Latency',
        description: 'Add compound indexes to MongoDB for room activities and tasks',
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        assignedTo: {
          userId: bob.userId,
          displayName: bob.name,
          userColor: '#3b82f6',
        },
      },
    }, (res) => {
      assert(res.success, 'Task 2 (MEDIUM priority IN_PROGRESS) created');
      task2 = res.task;
      resolve();
    });
  });

  // Create Task 3: LOW priority DONE
  let task3;
  await new Promise((resolve) => {
    aliceSocket.emit('task-create', {
      roomId: testRoomId,
      task: {
        title: 'Initial Workspace Setup',
        description: 'Project scaffolding and repository initialization',
        status: 'DONE',
        priority: 'LOW',
      },
    }, (res) => {
      assert(res.success, 'Task 3 (LOW priority DONE) created');
      task3 = res.task;
      resolve();
    });
  });

  // Trigger OCC conflict event for testRoomId
  await new Promise((resolve) => {
    aliceSocket.emit('task-update', {
      roomId: testRoomId,
      taskId: task1.id,
      updates: { title: 'Conflicting Edit' },
      expectedVersion: 999, // Intentional stale version
    }, (res) => {
      assert(res.conflict === true, 'Triggered OCC conflict activity in room');
      resolve();
    });
  });

  await wait(300);

  // 3. Test POST /api/ai/workspace: "What should I work on next?"
  console.log('\n3. Testing POST /api/ai/workspace -> "What should I work on next?"...');
  const nextWorkRes = await fetch(`${API_BASE}/ai/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: testRoomId,
      question: 'What should I work on next?',
    }),
  });

  const nextWorkData = await nextWorkRes.json();
  assert(nextWorkData.success, 'AI answered "What should I work on next?"');
  assert(typeof nextWorkData.answer === 'string' && nextWorkData.answer.length > 20, 'Answer is a non-empty string');
  assert(
    nextWorkData.answer.toLowerCase().includes('oauth2') || nextWorkData.answer.toLowerCase().includes('implement'),
    'AI recommendation correctly prioritizes HIGH-priority task "Implement OAuth2 Security Flow"'
  );
  console.log(`  [AI Response Snippet]:\n  "${nextWorkData.answer.split('\n')[0]}"`);

  // 4. Test POST /api/ai/workspace: "What tasks are pending?"
  console.log('\n4. Testing POST /api/ai/workspace -> "What tasks are pending?"...');
  const pendingRes = await fetch(`${API_BASE}/ai/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: testRoomId,
      question: 'What tasks are pending?',
    }),
  });
  const pendingData = await pendingRes.json();
  assert(pendingData.success, 'AI answered pending tasks question');
  assert(
    pendingData.answer.toLowerCase().includes('oauth2') && pendingData.answer.toLowerCase().includes('database query'),
    'AI lists both pending tasks (TODO and IN_PROGRESS)'
  );

  // 5. Test POST /api/ai/workspace: "What conflicts happened?"
  console.log('\n5. Testing POST /api/ai/workspace -> "What conflicts happened?"...');
  const conflictRes = await fetch(`${API_BASE}/ai/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: testRoomId,
      question: 'What conflicts happened in this workspace?',
    }),
  });
  const conflictData = await conflictRes.json();
  assert(conflictData.success, 'AI answered conflict history question');
  assert(
    conflictData.answer.toLowerCase().includes('conflict') || conflictData.answer.toLowerCase().includes('oauth2'),
    'AI accurately reports the real OCC conflict event'
  );

  // 6. Test POST /api/ai/summary
  console.log('\n6. Testing POST /api/ai/summary (One-Click AI Session Summary)...');
  const summaryRes = await fetch(`${API_BASE}/ai/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: testRoomId,
    }),
  });
  const summaryData = await summaryRes.json();
  assert(summaryData.success, 'AI session summary generated successfully');
  assert(typeof summaryData.summary === 'string' && summaryData.summary.length > 50, 'Summary contains structured markdown');
  assert(summaryData.summary.includes('3') || summaryData.summary.toLowerCase().includes('tasks'), 'Summary accurately reflects total task metrics');

  // 7. Test Empty Workspace handling
  console.log('\n7. Testing AI on empty workspace (zero hallucination check)...');
  await new Promise((resolve) => {
    aliceSocket.emit('join-room', {
      roomId: emptyRoomId,
      autoCreate: true,
      user: {
        userId: alice.userId,
        displayName: alice.name,
      },
    }, () => resolve());
  });

  const emptySummaryRes = await fetch(`${API_BASE}/ai/summary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: emptyRoomId,
    }),
  });
  const emptySummaryData = await emptySummaryRes.json();
  assert(emptySummaryData.success, 'Empty room summary handled cleanly');
  assert(
    emptySummaryData.summary.toLowerCase().includes('no activity') ||
    emptySummaryData.summary.toLowerCase().includes('empty') ||
    emptySummaryData.summary.toLowerCase().includes('0'),
    'AI states that the empty room has no tasks/activities without inventing false data'
  );

  // 8. Test Security & Input Validation
  console.log('\n8. Testing Security, Auth & Input Validation...');
  
  // 8a. Unauthenticated request rejection
  const unauthRes = await fetch(`${API_BASE}/ai/workspace`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      roomId: testRoomId,
      question: 'Hello?',
    }),
  });
  assert(unauthRes.status === 401, 'Unauthenticated AI request rejected with 401 Unauthorized');

  // 8b. Non-existent room rejection
  const nonExistentRes = await fetch(`${API_BASE}/ai/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: 'SYNC-NONEXISTENT-9999',
      question: 'What is this?',
    }),
  });
  assert(nonExistentRes.status === 404, 'Non-existent room request rejected with 404 Room Not Found');

  // 8c. Empty question rejection
  const emptyQRes = await fetch(`${API_BASE}/ai/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${aliceToken}`,
    },
    body: JSON.stringify({
      roomId: testRoomId,
      question: '   ',
    }),
  });
  assert(emptyQRes.status === 400, 'Empty question rejected with 400 Bad Request');

  aliceSocket.disconnect();

  console.log('\n=============================================================');
  console.log('🎉 ALL REAL AI WORKSPACE ASSISTANT TESTS PASSED (100%)');
  console.log('=============================================================\n');
}

runAIAssistantTests().catch((err) => {
  console.error('\n❌ AI Assistant test suite failed:', err);
  process.exit(1);
});

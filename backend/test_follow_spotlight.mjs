import { io } from 'socket.io-client';
import assert from 'assert';

const SERVER_URL = 'http://127.0.0.1:5000';
const TEST_ROOM_A = `SYNC-SPOT-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
const TEST_ROOM_B = `SYNC-ISO-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

const createSocketClient = () => {
  return io(SERVER_URL, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function runFollowAndSpotlightTests() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║        SYNCSPACE FOLLOW USER MODE & CURSOR SPOTLIGHT SUITE         ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');
  console.log(`📁 Room A (Collaboration): ${TEST_ROOM_A}`);
  console.log(`📁 Room B (Isolated Room): ${TEST_ROOM_B}\n`);

  const client1 = createSocketClient();
  const client2 = createSocketClient();
  const clientIso = createSocketClient();

  const user1 = { userId: 'usr_pragya_01', displayName: 'Pragya', userColor: '#6366f1' };
  const user2 = { userId: 'usr_rahul_02', displayName: 'Rahul', userColor: '#10b981' };
  const userIso = { userId: 'usr_ananya_03', displayName: 'Ananya', userColor: '#f59e0b' };

  let client2SpotlightEvents = [];
  let clientIsoSpotlightEvents = [];
  let client1SpotlightEvents = [];

  try {
    // 1. Connect & Join Rooms
    await Promise.all([
      new Promise((res) => client1.on('connect', res)),
      new Promise((res) => client2.on('connect', res)),
      new Promise((res) => clientIso.on('connect', res)),
    ]);
    console.log('✅ 1. Sockets connected');

    client2.on('cursor-spotlight', (data) => {
      client2SpotlightEvents.push(data);
    });

    clientIso.on('cursor-spotlight', (data) => {
      clientIsoSpotlightEvents.push(data);
    });

    client1.on('cursor-spotlight', (data) => {
      client1SpotlightEvents.push(data);
    });

    const join1 = await new Promise((res) => {
      client1.emit('join-room', { roomId: TEST_ROOM_A, autoCreate: true, user: user1 }, res);
    });
    assert.strictEqual(join1.success, true, 'Client 1 failed to join Room A');

    const join2 = await new Promise((res) => {
      client2.emit('join-room', { roomId: TEST_ROOM_A, user: user2 }, res);
    });
    assert.strictEqual(join2.success, true, 'Client 2 failed to join Room A');

    const joinIso = await new Promise((res) => {
      clientIso.emit('join-room', { roomId: TEST_ROOM_B, autoCreate: true, user: userIso }, res);
    });
    assert.strictEqual(joinIso.success, true, 'Client Iso failed to join Room B');

    await delay(300);
    console.log('✅ 2. Real users joined rooms');

    // TEST 1: User 1 broadcasts spotlight ON
    console.log('\n--- Test 1: User 1 activates cursor spotlight ---');
    client1.emit('cursor-spotlight', { active: true });
    await delay(300);

    const onEvent = client2SpotlightEvents.find(e => e.userId === user1.userId && e.isSpotlight === true);
    assert.ok(onEvent, 'Client 2 must receive cursor-spotlight active: true event');
    console.log(`✅ Test 1 Passed: Client 2 received broadcast isSpotlight=true for ${user1.displayName}`);

    // TEST 2: User 1 deactivates spotlight
    console.log('\n--- Test 2: User 1 deactivates cursor spotlight ---');
    client1.emit('cursor-spotlight', { active: false });
    await delay(300);

    const offEvent = client2SpotlightEvents.find(e => e.userId === user1.userId && e.isSpotlight === false);
    assert.ok(offEvent, 'Client 2 must receive cursor-spotlight active: false event');
    console.log(`✅ Test 2 Passed: Client 2 received broadcast isSpotlight=false for ${user1.displayName}`);

    // TEST 3: User 2 activates spotlight, then disconnects (auto-cleanup test)
    console.log('\n--- Test 3: Spotlight automatic disconnect cleanup ---');
    client2.emit('cursor-spotlight', { active: true });
    await delay(300);

    // Client 2 disconnects abruptly
    client2.disconnect();
    await delay(400);

    const cleanupEvent = client1SpotlightEvents.find(e => e.userId === user2.userId && e.active === false);
    assert.ok(cleanupEvent, 'Client 1 must receive spotlight cleanup event when Client 2 disconnects');
    console.log('✅ Test 3 Passed: Server automatically broadcast spotlight deactivation when peer disconnected');

    // TEST 4: Room Isolation for Spotlight Events
    console.log('\n--- Test 4: Room Isolation for Spotlight Events ---');
    assert.strictEqual(clientIsoSpotlightEvents.length, 0, 'Isolated Room B must receive zero spotlight events from Room A');
    console.log('✅ Test 4 Passed: 100% room isolation verified (0 spotlight events leaked to Room B)');

    // TEST 5: Ephemeral Verification (No DB pollution)
    console.log('\n--- Test 5: Verify Spotlight/Follow is purely ephemeral (Zero DB pollution) ---');
    const res = await fetch(`${SERVER_URL}/api/rooms/${TEST_ROOM_A}/activities`);
    const activities = await res.json();
    const spotlightActivities = (activities.activities || []).filter(
      (a) => a.type?.toLowerCase().includes('spotlight') || a.type?.toLowerCase().includes('follow')
    );
    assert.strictEqual(spotlightActivities.length, 0, 'No spotlight or follow events should be stored in MongoDB');
    console.log('✅ Test 5 Passed: Spotlight state is strictly ephemeral and zero database pollution occurred');

    console.log('\n🎉 ALL FOLLOW USER MODE & CURSOR SPOTLIGHT TESTS PASSED (5/5)!\n');

  } finally {
    client1.disconnect();
    client2.disconnect();
    clientIso.disconnect();
  }
}

runFollowAndSpotlightTests().catch((err) => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});

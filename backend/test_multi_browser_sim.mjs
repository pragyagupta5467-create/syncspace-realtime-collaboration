import { io } from 'socket.io-client';

const SERVER_URL = 'http://127.0.0.1:5000';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runMultiBrowserSimulation() {
  console.log('╔════════════════════════════════════════════════════════════════════╗');
  console.log('║       SYNCSPACE MULTI-BROWSER CLIENT SIMULATION & VERIFICATION    ║');
  console.log('╚════════════════════════════════════════════════════════════════════╝\n');

  // STEP 1: Browser Tab 1 (Pragya) creates & joins Room SYNC-ALPHA
  console.log('[Tab 1: Pragya] Opening connection & creating Room SYNC-ALPHA...');
  const tab1 = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => tab1.on('connect', res));

  const tab1Events = [];
  tab1.on('user-joined', (e) => tab1Events.push({ type: 'user-joined', data: e }));
  tab1.on('user-left', (e) => tab1Events.push({ type: 'user-left', data: e }));
  let tab1UserList = [];
  tab1.on('room-users', (e) => { tab1UserList = e.users; });

  const join1 = await new Promise((res) => {
    tab1.emit('join-room', {
      roomId: 'SYNC-ALPHA',
      autoCreate: true,
      user: { userId: 'user_pragya', displayName: 'Pragya', userColor: '#6366f1' }
    }, res);
  });
  console.log('  -> Tab 1 joined. Total room users:', join1.users.length);

  // STEP 2: Browser Tab 2 (Rahul) joins the SAME Room SYNC-ALPHA
  console.log('\n[Tab 2: Rahul] Joining existing Room SYNC-ALPHA...');
  const tab2 = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => tab2.on('connect', res));

  let tab2UserList = [];
  tab2.on('room-users', (e) => { tab2UserList = e.users; });

  const join2 = await new Promise((res) => {
    tab2.emit('join-room', {
      roomId: 'SYNC-ALPHA',
      user: { userId: 'user_rahul', displayName: 'Rahul', userColor: '#10b981' }
    }, res);
  });
  console.log('  -> Tab 2 joined. Total room users in ack:', join2.users.length);

  await wait(300);

  console.log('\n[Presence Verification in Room SYNC-ALPHA]:');
  console.log('  - Tab 1 sees users:', tab1UserList.map(u => `${u.displayName} (${u.userColor})`).join(', '));
  console.log('  - Tab 2 sees users:', tab2UserList.map(u => `${u.displayName} (${u.userColor})`).join(', '));

  if (tab1UserList.length !== 2 || tab2UserList.length !== 2) {
    throw new Error('Presence synchronization failed: user counts do not match 2.');
  }

  // STEP 3: Browser Tab 3 (Ananya) creates & joins SEPARATE Room SYNC-BETA
  console.log('\n[Tab 3: Ananya] Joining separate Room SYNC-BETA...');
  const tab3 = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => tab3.on('connect', res));

  let tab3UserList = [];
  tab3.on('room-users', (e) => { tab3UserList = e.users; });

  const join3 = await new Promise((res) => {
    tab3.emit('join-room', {
      roomId: 'SYNC-BETA',
      autoCreate: true,
      user: { userId: 'user_ananya', displayName: 'Ananya', userColor: '#a855f7' }
    }, res);
  });
  console.log('  -> Tab 3 joined Room SYNC-BETA. Total room users:', join3.users.length);

  await wait(300);

  console.log('\n[Room Isolation Check]:');
  console.log('  - Room SYNC-ALPHA user count:', tab1UserList.length, '(expected: 2)');
  console.log('  - Room SYNC-BETA user count:', tab3UserList.length, '(expected: 1)');

  const leakDetected = tab1UserList.some(u => u.displayName === 'Ananya');
  if (leakDetected || tab1UserList.length !== 2) {
    throw new Error('Room Isolation Failed! User from SYNC-BETA was broadcasted to SYNC-ALPHA.');
  }
  console.log('  -> PASS: Complete room isolation confirmed. Zero event leakage.');

  // STEP 4: Browser Tab 2 (Rahul) closes tab / disconnects
  console.log('\n[Tab 2: Rahul] Closing browser tab...');
  tab2.disconnect();
  await wait(400);

  console.log('\n[Disconnect Cleanup Check]:');
  console.log('  - Tab 1 remaining users:', tab1UserList.map(u => u.displayName).join(', '));
  const leftEvent = tab1Events.find(e => e.type === 'user-left' && e.data.displayName === 'Rahul');
  if (!leftEvent || tab1UserList.length !== 1) {
    throw new Error('Disconnect cleanup failed: Tab 1 did not receive user-left update.');
  }
  console.log('  -> PASS: Tab 1 received real-time user-left notification for Rahul. Room user count is now 1.');

  // STEP 5: Reconnection Verification with same persisted userId
  console.log('\n[Tab 2: Rahul] Reconnecting with saved local session identity...');
  const tab2Reconnected = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((res) => tab2Reconnected.on('connect', res));

  await new Promise((res) => {
    tab2Reconnected.emit('join-room', {
      roomId: 'SYNC-ALPHA',
      user: { userId: 'user_rahul', displayName: 'Rahul', userColor: '#10b981' }
    }, res);
  });
  await wait(300);

  console.log('  - Tab 1 users after Rahul reconnected:', tab1UserList.map(u => u.displayName).join(', '));
  if (tab1UserList.length !== 2) {
    throw new Error('Reconnection failed: Room did not restore 2 users.');
  }
  console.log('  -> PASS: Session restored cleanly upon reconnection.');

  // Cleanup
  tab1.disconnect();
  tab2Reconnected.disconnect();
  tab3.disconnect();

  console.log('\n✨ ALL MULTI-BROWSER TESTS & SCENARIOS PASSED WITH 100% SUCCESS!\n');
}

runMultiBrowserSimulation().catch((err) => {
  console.error('\n❌ SIMULATION FAILED:', err);
  process.exit(1);
});

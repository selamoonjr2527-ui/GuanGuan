'use strict';

process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const {
  handlePublicSessionTrigger,
  projectLatestPublicSession,
} = require('../lib/publicSessionProjector.js');

const PROJECT_ID = 'demo-guanguan-security';
const testApp = initializeApp({ projectId: PROJECT_ID }, 'public-projection-emulator-test');
const db = getFirestore(testApp);
db.settings({ host: '127.0.0.1:8080', ssl: false });

const currentSessionRef = db.doc('clubs/guanguan/runtime/currentSession');
const publicSessionRef = db.doc('clubs/guanguan/runtime/publicSession');

const syntheticState = (nickname, phone) => ({
  sessionConfig: {
    sessionTitle: 'Synthetic Emulator Session',
    date: '2099-04-01',
    venueName: 'Synthetic Venue',
    startTime: '18:00',
    endTime: '22:00',
    courtNames: ['Synthetic Court'],
    hideSkillFromMembers: true,
    organizerPin: 'SYNTHETIC_ORGANIZER_SECRET',
    promptPayId: 'SYNTHETIC_PAYMENT_DESTINATION',
  },
  players: [{
    id: 'member-synthetic',
    nickname,
    phone,
    pin: 'SYNTHETIC_MEMBER_PIN',
    isCheckedIn: true,
    todayRoster: true,
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    paidAmount: 9999,
    paymentMethod: 'cash',
    checkInTimestamp: 4070908800000,
    lastMatchFinishTime: 4070908801000,
  }],
  activeMatches: [],
  matchHistory: [],
  confirmedPreMatch: null,
  confirmedPreMatch2: null,
  confirmedPreMatch3: null,
});

async function waitForProjection(revision, nickname) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const snapshot = await publicSessionRef.get();
    const data = snapshot.data();
    if (data?.sourceRevision === revision && data?.roster?.[0]?.nickname === nickname) {
      return data;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for public projection revision ${revision}`);
}

async function waitForProjectionDeletion() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const snapshot = await publicSessionRef.get();
    if (!snapshot.exists) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('Timed out waiting for public projection deletion');
}

before(async () => {
  assert.equal(PROJECT_ID, 'demo-guanguan-security');
  await Promise.all([currentSessionRef.delete(), publicSessionRef.delete()]);
});

after(async () => {
  await Promise.all([currentSessionRef.delete(), publicSessionRef.delete()]);
  await deleteApp(testApp);
});

test('Firestore trigger projects only the latest canonical revision idempotently', async () => {
  await currentSessionRef.set({
    schemaVersion: 2,
    revision: 1,
    updatedBy: 'SYNTHETIC_ORGANIZER_UID',
    state: syntheticState('Synthetic Member v1', 'SYNTHETIC_PHONE_V1'),
  });

  const first = await waitForProjection(1, 'Synthetic Member v1');
  const firstUpdateTime = (await publicSessionRef.get()).updateTime.toMillis();
  assert.equal(JSON.stringify(first).includes('SYNTHETIC_PHONE_V1'), false);
  assert.equal(JSON.stringify(first).includes('SYNTHETIC_MEMBER_PIN'), false);
  assert.equal(JSON.stringify(first).includes('SYNTHETIC_PAYMENT_DESTINATION'), false);
  assert.equal(JSON.stringify(first).includes('SYNTHETIC_ORGANIZER_SECRET'), false);

  const duplicateResult = await projectLatestPublicSession(db);
  assert.equal(duplicateResult, 'unchanged');
  assert.equal((await publicSessionRef.get()).updateTime.toMillis(), firstUpdateTime);

  await currentSessionRef.set({
    schemaVersion: 2,
    revision: 2,
    updatedBy: 'SYNTHETIC_ORGANIZER_UID',
    state: syntheticState('Synthetic Member v2', 'SYNTHETIC_PHONE_V2'),
  });
  await currentSessionRef.set({
    schemaVersion: 2,
    revision: 3,
    updatedBy: 'SYNTHETIC_ORGANIZER_UID',
    state: syntheticState('Synthetic Member latest', 'SYNTHETIC_PHONE_LATEST'),
  });

  // Simulate a delayed revision-2 trigger after revision 3 is already canonical.
  const staleEventResult = await handlePublicSessionTrigger({
    data: { after: { data: () => ({ revision: 2, state: syntheticState('Stale Member', 'SYNTHETIC_STALE_PHONE') }) } },
  });
  assert.ok(['updated', 'unchanged'].includes(staleEventResult));

  const latest = await waitForProjection(3, 'Synthetic Member latest');
  assert.equal(latest.sourceRevision, 3);
  assert.equal(latest.roster[0].nickname, 'Synthetic Member latest');
  assert.equal(JSON.stringify(latest).includes('Stale Member'), false);
  assert.equal(JSON.stringify(latest).includes('SYNTHETIC_PHONE_LATEST'), false);

  const latestUpdateTime = (await publicSessionRef.get()).updateTime.toMillis();
  assert.equal(await projectLatestPublicSession(db), 'unchanged');
  assert.equal((await publicSessionRef.get()).updateTime.toMillis(), latestUpdateTime);

  await currentSessionRef.delete();
  await waitForProjectionDeletion();

  await currentSessionRef.set({
    schemaVersion: 2,
    revision: 1,
    updatedBy: 'SYNTHETIC_ORGANIZER_UID',
    state: syntheticState('Synthetic Recreated Session Member', 'SYNTHETIC_RECREATED_PHONE'),
  });
  const recreated = await waitForProjection(1, 'Synthetic Recreated Session Member');
  assert.equal(recreated.session.sessionId, 'guanguan:2099-04-01');
  assert.equal(recreated.roster[0].nickname, 'Synthetic Recreated Session Member');
});
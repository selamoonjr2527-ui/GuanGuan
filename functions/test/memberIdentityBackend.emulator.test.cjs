'use strict';
// GuanGuan local Firestore Emulator integration checks for isolated prototype.
// NOT a production-ready authorization / endpoint security test.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.GCLOUD_PROJECT !== 'demo-guanguan-security') {
  throw new Error('Refusing to run outside explicitly pinned localhost demo Firestore Emulator');
}
const { MemberIdentityBackend } = require(path.resolve(__dirname, '../lib/memberIdentityBackend.js'));
const ORGANIZER_A = 'DWpEIuKxqRTBptDKqM4FIKjMPmf1';
const ORGANIZER_B = 'Ofkc1m00ikbEg84VifbePLk1k0l2';
const ROOT = 'clubs/guanguan';
const PEPPER = 'SYNTHETIC_ONLY_NOT_FOR_PRODUCTION_PEPPER_64_CHARS_LONG';
let app, db, issued, clock;
let backend;
const unique = () => `synthetic_${Math.random().toString(16).slice(2)}_${Date.now()}`;
const expectDenied = async promise => assert.rejects(promise, /Unable to authenticate|authenticate|complete this request/);
const tokens = { issue: async (uid, claims) => {
  issued.push({ uid, claims });
  return `SYNTHETIC_TOKEN_${uid}`;
}};

before(async () => {
  app = initializeApp({ projectId: 'demo-guanguan-security' }, `gg-identity-tests-${Date.now()}`);
  db = getFirestore(app);
  issued = [];
  clock = Date.parse('2099-04-01T00:00:00Z');
  backend = new MemberIdentityBackend({ db, tokens, pepper: PEPPER, clock: () => clock });
});
after(async () => { if (app) await deleteApp(app); });

async function enrolled(memberId, pin='482917') {
  const grant = await backend.createChallenge(ORGANIZER_A, memberId);
  const token = await backend.activate(grant.challengeId, grant.activationSecret, pin);
  return { grant, token };
}

test('only two allowlisted organizers can issue enrollment challenges', async () => {
  await expectDenied(backend.createChallenge('synthetic-unrelated-uid', unique()));
  for (const organizer of [ORGANIZER_A, ORGANIZER_B]) {
    const grant = await backend.createChallenge(organizer, unique());
    assert.match(grant.challengeId, /^[a-f0-9]{32}$/);
    assert.match(grant.activationSecret, /^[a-f0-9]{64}$/);
    const snap = await db.doc(`${ROOT}/memberEnrollmentChallenges/${grant.challengeId}`).get();
    assert.equal(snap.exists, true);
    assert.equal(JSON.stringify(snap.data()).includes(grant.activationSecret), false);
  }
});

test('activation creates owner mapping and rejects replay', async () => {
  const memberId = unique();
  const { grant, token } = await enrolled(memberId);
  assert.match(token, /^SYNTHETIC_TOKEN_/);
  const snap = await db.doc(`${ROOT}/memberPrivate/${memberId}`).get();
  assert.equal(snap.data()?.status, 'active');
  assert.equal(snap.data()?.memberId, memberId);
  assert.equal(snap.data()?.pinHash?.includes('482917'), false);
  assert.equal(issued.at(-1).claims.memberId, memberId);
  await expectDenied(backend.activate(grant.challengeId, grant.activationSecret, '482917'));
});

test('expired challenge and incorrect activation secret are denied', async () => {
  const grant = await backend.createChallenge(ORGANIZER_A, unique());
  await expectDenied(backend.activate(grant.challengeId, '0'.repeat(64), '482917'));
  const snap = await db.doc(`${ROOT}/memberEnrollmentChallenges/${grant.challengeId}`).get();
  assert.equal(snap.data()?.failures, 1);
  clock += 11 * 60_000;
  await expectDenied(backend.activate(grant.challengeId, grant.activationSecret, '482917'));
  clock -= 11 * 60_000;
});

test('login rejects wrong PIN five times, locks persistently, then recovers', async () => {
  const memberId = unique();
  await enrolled(memberId);
  for (let n=0; n<5; n++) await expectDenied(backend.login(memberId, '671839'));
  const ref = db.doc(`${ROOT}/memberAuthLimits/${memberId}`);
  const snap = await ref.get();
  assert.equal(snap.data()?.failedAttempts, 5);
  assert.ok(snap.data()?.lockedUntil > clock);
  // A newly constructed backend instance must observe stored lockout.
  const another = new MemberIdentityBackend({ db, tokens, pepper: PEPPER, clock: () => clock });
  await expectDenied(another.login(memberId, '482917'));
  clock += 16 * 60_000;
  const good = await another.login(memberId, '482917');
  assert.match(good, /^SYNTHETIC_TOKEN_/);
  assert.equal((await ref.get()).data()?.failedAttempts, 0);
  clock -= 16 * 60_000;
});

test('disabled identity is rejected for login and unauthorized disable fails', async () => {
  const memberId = unique();
  await enrolled(memberId);
  await expectDenied(backend.disable('synthetic-not-organizer', memberId));
  await backend.disable(ORGANIZER_B, memberId);
  await expectDenied(backend.login(memberId, '482917'));
});

test('concurrent activation must issue at most one successful credential', async () => {
  const memberId = unique();
  const grant = await backend.createChallenge(ORGANIZER_A, memberId);
  const attempts = await Promise.allSettled([
    backend.activate(grant.challengeId, grant.activationSecret, '482917'),
    backend.activate(grant.challengeId, grant.activationSecret, '482917')
  ]);
  assert.equal(attempts.filter(x => x.status === 'fulfilled').length, 1);
});

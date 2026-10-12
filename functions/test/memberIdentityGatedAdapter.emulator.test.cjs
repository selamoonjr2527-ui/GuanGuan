'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.GCLOUD_PROJECT !== 'demo-guanguan-security') {
  throw new Error('Use only demo-guanguan-security Firestore Emulator 127.0.0.1:8080');
}
const { MemberIdentitySecurityGate } = require(path.resolve(__dirname, '../lib/memberIdentitySecurityGate.js'));
const { createGatedMemberIdentityHandlers } = require(path.resolve(__dirname, '../lib/memberIdentityGatedAdapter.js'));
const uid = `testorg_${randomUUID().replace(/-/g, '')}`;
const rolePath = `clubs/guanguan/organizerRoles/${uid}`;
let app, db, handlers, calls, role;
const req = (auth, data = { memberId: 'testmember_123' }) => ({ auth, data });
const deny = async (promise, code) => assert.rejects(promise, e => e?.code === code);

before(async () => {
  app = initializeApp({ projectId: 'demo-guanguan-security' }, `gated-adapter-${uid}`);
  db = getFirestore(app);
  role = db.doc(rolePath);
  calls = { create: 0, disable: 0, activate: 0, login: 0 };
  const backend = {
    async createChallenge(uidValue, memberId) { calls.create++; return { uidValue, memberId }; },
    async disable(uidValue, memberId) { calls.disable++; return { uidValue, memberId }; },
    async activate() { calls.activate++; return 'mock-token'; },
    async login() { calls.login++; return 'mock-token'; },
  };
  handlers = createGatedMemberIdentityHandlers(backend, new MemberIdentitySecurityGate(db));
});
after(async () => {
  if (role) await role.delete();
  if (app) await deleteApp(app);
});

test('missing Firebase auth is rejected before backend invocation', async () => {
  await deny(handlers.createChallenge(req(null)), 'unauthenticated');
  await deny(handlers.disable(req(null)), 'unauthenticated');
  assert.deepEqual([calls.create, calls.disable], [0, 0]);
});
test('auth UID without server organizer role is denied', async () => {
  await deny(handlers.createChallenge(req({ uid })), 'permission-denied');
  await deny(handlers.disable(req({ uid })), 'permission-denied');
  assert.deepEqual([calls.create, calls.disable], [0, 0]);
});
test('inactive or forged organizer role cannot invoke backend', async () => {
  await role.set({ role: 'organizer', authUid: uid, active: false });
  await deny(handlers.createChallenge(req({ uid })), 'permission-denied');
  await role.set({ role: 'organizer', authUid: 'forged', active: true });
  await deny(handlers.disable(req({ uid })), 'permission-denied');
  assert.deepEqual([calls.create, calls.disable], [0, 0]);
});
test('active organizer role passes real Firestore gate to adapter', async () => {
  await role.set({ role: 'organizer', authUid: uid, active: true });
  const r = await handlers.createChallenge(req({ uid }));
  assert.deepEqual(r, { uidValue: uid, memberId: 'testmember_123' });
  assert.equal(calls.create, 1);
  assert.deepEqual(await handlers.disable(req({ uid })), { ok: true });
  assert.equal(calls.disable, 1);
});
test('role disabled after earlier successful operation takes effect immediately', async () => {
  await role.update({ active: false });
  await deny(handlers.createChallenge(req({ uid })), 'permission-denied');
  await deny(handlers.disable(req({ uid })), 'permission-denied');
  assert.deepEqual([calls.create, calls.disable], [1, 1]);
});
test('client-supplied organizerUid is never accepted', async () => {
  await role.update({ active: true });
  await deny(handlers.createChallenge(req({ uid }, { memberId: 'testmember_123', organizerUid: uid })), 'invalid-argument');
  assert.equal(calls.create, 1);
});

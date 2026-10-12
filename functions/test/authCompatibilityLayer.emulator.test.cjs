'use strict';
/** Firestore Emulator-only integration tests; do not run against a real project. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.GCLOUD_PROJECT !== 'demo-guanguan-security') {
  throw new Error('Local demo Firestore Emulator required; refusing to run');
}
const { AuthCompatibilityLayer } = require(path.resolve(__dirname, '../lib/authCompatibilityLayer.js'));
const root = 'clubs/guanguan';
const marker = randomUUID().replace(/-/g, '');
const organizerUid = `organizer_${marker}`;
const memberUid = `memberuid_${marker}`;
const memberId = `member_${marker}`;
const orgRefPath = `${root}/organizerRoles/${organizerUid}`;
const memberRefPath = `${root}/memberPrivate/${memberId}`;
let app, db, layer;
const organizerAuth = (provider = 'password') => ({ uid: organizerUid, token: { firebase: { sign_in_provider: provider } } });
const memberAuth = (version = 1, uid = memberUid) => ({
  uid, token: { role: 'member', memberId, credentialVersion: version, firebase: { sign_in_provider: 'custom' } },
});

before(async () => {
  app = initializeApp({ projectId: 'demo-guanguan-security' }, `compat-${marker}`);
  db = getFirestore(app);
  layer = new AuthCompatibilityLayer(db);
  await Promise.all([
    db.doc(orgRefPath).set({ authUid: organizerUid, role: 'organizer', active: true }),
    db.doc(memberRefPath).set({ authUid: memberUid, memberId, status: 'active', credentialVersion: 1 }),
  ]);
});
after(async () => {
  if (db) await Promise.all([db.doc(orgRefPath).delete(), db.doc(memberRefPath).delete()]);
  if (app) await deleteApp(app);
});

test('no Firebase identity resolves as unauthenticated', async () => {
  assert.deepEqual(await layer.resolve(null), { kind: 'unauthenticated' });
});
test('untrusted and malformed contexts never gain permissions', async () => {
  assert.deepEqual(await layer.resolve({ uid: 'stranger', token: { role: 'organizer' } }), { kind: 'denied' });
  assert.deepEqual(await layer.resolve({ uid: 'bad/uid', token: {} }), { kind: 'denied' });
});
test('active organizer requires trusted server role and password provider', async () => {
  assert.deepEqual(await layer.resolve(organizerAuth()), { kind: 'organizer', uid: organizerUid });
  assert.deepEqual(await layer.resolve(organizerAuth('anonymous')), { kind: 'denied' });
  assert.deepEqual(await layer.resolve(organizerAuth('custom')), { kind: 'denied' });
});
test('organizer role changes are enforced without caching', async () => {
  await db.doc(orgRefPath).update({ active: false });
  assert.deepEqual(await layer.resolve(organizerAuth()), { kind: 'denied' });
  await db.doc(orgRefPath).update({ active: true });
  assert.deepEqual(await layer.resolve(organizerAuth()), { kind: 'organizer', uid: organizerUid });
});
test('active member requires matching UID, claims and current credentialVersion', async () => {
  assert.deepEqual(await layer.resolve(memberAuth()), { kind: 'member', uid: memberUid, memberId });
  assert.deepEqual(await layer.resolve(memberAuth(2)), { kind: 'denied' });
  assert.deepEqual(await layer.resolve(memberAuth(1, 'someone_else')), { kind: 'denied' });
});
test('disabled identity and version rotation reject old member tokens', async () => {
  await db.doc(memberRefPath).update({ status: 'disabled', credentialVersion: 2 });
  assert.deepEqual(await layer.resolve(memberAuth(1)), { kind: 'denied' });
  assert.deepEqual(await layer.resolve(memberAuth(2)), { kind: 'denied' });
  await db.doc(memberRefPath).update({ status: 'active' });
  assert.deepEqual(await layer.resolve(memberAuth(1)), { kind: 'denied' });
  assert.deepEqual(await layer.resolve(memberAuth(2)), { kind: 'member', uid: memberUid, memberId });
});

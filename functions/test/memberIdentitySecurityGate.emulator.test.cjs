'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' ||
    process.env.GCLOUD_PROJECT !== 'demo-guanguan-security') {
  throw new Error('Refusing to run outside pinned demo Firestore Emulator at 127.0.0.1:8080');
}
const { MemberIdentitySecurityGate } = require(path.resolve(__dirname, '../lib/memberIdentitySecurityGate.js'));
const root = 'clubs/guanguan';
const marker = randomUUID().replace(/-/g, '');
const organizer = `testorg_${marker}`;
const memberId = `testmember_${marker}`;
const uid = `testuid_${marker}`;
let app, db, gate;
const deny = promise => assert.rejects(promise, /Access denied/);
const valid = () => ({ uid, role: 'member', memberId, credentialVersion: 1 });

before(async () => {
  app = initializeApp({ projectId: 'demo-guanguan-security' }, `security-gate-${marker}`);
  db = getFirestore(app);
  gate = new MemberIdentitySecurityGate(db);
  await db.doc(`${root}/memberPrivate/${memberId}`).set({ memberId, authUid: uid, status: 'active', credentialVersion: 1 });
});
after(async () => {
  if (db) {
    await Promise.all([
      db.doc(`${root}/memberPrivate/${memberId}`).delete(),
      db.doc(`${root}/organizerRoles/${organizer}`).delete(),
    ]);
  }
  if (app) await deleteApp(app);
});

test('missing organizer authorization is denied', async () => {
  await deny(gate.assertOrganizer(organizer));
  await deny(gate.assertOrganizer(undefined));
});
test('only active organizer with matching verified UID is allowed', async () => {
  const ref = db.doc(`${root}/organizerRoles/${organizer}`);
  await ref.set({ authUid: organizer, role: 'organizer', active: true });
  await gate.assertOrganizer(organizer);
  await ref.update({ active: false });
  await deny(gate.assertOrganizer(organizer));
  await ref.update({ active: true, authUid: 'someone_else' });
  await deny(gate.assertOrganizer(organizer));
});
test('valid identity and matching credentialVersion are accepted', async () => {
  assert.equal(await gate.assertMemberAccess(valid()), memberId);
});
test('forged role, member ID, UID, or version is denied', async () => {
  for (const alteration of [
    { role: 'organizer' }, { memberId: 'someone_else' }, { uid: 'someone_else' },
    { credentialVersion: 2 }, { credentialVersion: '1' },
  ]) await deny(gate.assertMemberAccess({ ...valid(), ...alteration }));
  await deny(gate.assertMemberAccess(null));
});
test('disable takes effect for next server authorization check', async () => {
  const ref = db.doc(`${root}/memberPrivate/${memberId}`);
  await ref.update({ status: 'disabled', credentialVersion: 2 });
  await deny(gate.assertMemberAccess(valid()));
});
test('old claims remain denied after re-enable with incremented version', async () => {
  const ref = db.doc(`${root}/memberPrivate/${memberId}`);
  await ref.update({ status: 'active' });
  await deny(gate.assertMemberAccess(valid()));
  assert.equal(await gate.assertMemberAccess({ ...valid(), credentialVersion: 2 }), memberId);
});

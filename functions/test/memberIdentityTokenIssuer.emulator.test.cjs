'use strict';
/** Local Firestore Emulator only. Firebase Auth signing is simulated by a spy. */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { initializeApp, deleteApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080' || process.env.GCLOUD_PROJECT !== 'demo-guanguan-security') {
  throw new Error('Only localhost demo Firestore Emulator is permitted');
}
const { createGatedFirebaseTokenIssuer } = require(path.resolve(__dirname, '../lib/memberIdentityTokenIssuer.js'));
const { MemberIdentitySecurityGate } = require(path.resolve(__dirname, '../lib/memberIdentitySecurityGate.js'));
const root = 'clubs/guanguan';
const marker = randomUUID().replace(/-/g, '');
const memberId = `tokenmember_${marker}`;
const uid = `tokenuid_${marker}`;
let app, db, issuer, gate, calls;
const claims = version => ({ role: 'member', memberId, credentialVersion: version });
const refPath = `${root}/memberPrivate/${memberId}`;
before(async () => {
  app = initializeApp({ projectId: 'demo-guanguan-security' }, `token-test-${marker}`);
  db = getFirestore(app);
  calls = [];
  const authSpy = { createCustomToken: async (signedUid, customClaims) => {
    calls.push({ signedUid, customClaims });
    return 'SYNTHETIC_SIGNED_TOKEN';
  } };
  issuer = createGatedFirebaseTokenIssuer(authSpy, db);
  gate = new MemberIdentitySecurityGate(db);
  await db.doc(refPath).set({ memberId, authUid: uid, status: 'active', credentialVersion: 1 });
});
after(async () => { if (db) await db.doc(refPath).delete(); if (app) await deleteApp(app); });
test('validated claims reach signer only for matching active identity', async () => {
  assert.equal(await issuer.issue(uid, claims(1)), 'SYNTHETIC_SIGNED_TOKEN');
  assert.deepEqual(calls.at(-1), { signedUid: uid, customClaims: claims(1) });
  const initial = calls.length;
  await assert.rejects(issuer.issue('other_uid', claims(1)), /Access denied/);
  await assert.rejects(issuer.issue(uid, claims(2)), /Access denied/);
  assert.equal(calls.length, initial);
});
test('disable and version bump block issuing stale credentials', async () => {
  await db.doc(refPath).update({ status: 'disabled', credentialVersion: 2 });
  const prev = calls.length;
  await assert.rejects(issuer.issue(uid, claims(1)), /Access denied/);
  await assert.rejects(issuer.issue(uid, claims(2)), /Access denied/);
  assert.equal(calls.length, prev);
  await db.doc(refPath).update({ status: 'active' });
  await assert.rejects(issuer.issue(uid, claims(1)), /Access denied/);
  assert.equal(await issuer.issue(uid, claims(2)), 'SYNTHETIC_SIGNED_TOKEN');
  await assert.rejects(gate.assertMemberAccess({ uid, ...claims(1) }), /Access denied/);
});

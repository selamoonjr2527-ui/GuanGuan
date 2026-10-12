'use strict';
/** Local-only Firebase Admin custom token -> Auth emulator ID token -> Firestore gate.
 * No production network, secrets, exports, or deployed functions.
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { randomUUID, generateKeyPairSync } = require('node:crypto');
const { initializeApp, deleteApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT = 'demo-guanguan-security';
const AUTH_HOST = '127.0.0.1:9099';
const FIRESTORE_HOST = '127.0.0.1:8080';
if (process.env.GCLOUD_PROJECT !== PROJECT ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== AUTH_HOST ||
    process.env.FIRESTORE_EMULATOR_HOST !== FIRESTORE_HOST ||
    process.env.GOOGLE_CLOUD_PROJECT && process.env.GOOGLE_CLOUD_PROJECT !== PROJECT) {
  throw new Error('SAFEGUARD: This test requires only the local demo Auth+Firestore emulators');
}

const { createGatedFirebaseTokenIssuer } = require(path.resolve(__dirname, '../lib/memberIdentityTokenIssuer.js'));
const { MemberIdentitySecurityGate } = require(path.resolve(__dirname, '../lib/memberIdentitySecurityGate.js'));
const suffix = randomUUID().replace(/-/g, '');
const memberId = `realauthmember_${suffix}`;
const uid = `realauthuid_${suffix}`;
const refPath = `clubs/guanguan/memberPrivate/${memberId}`;
const claims = version => ({ role: 'member', memberId, credentialVersion: version });
let app, db, auth, gate, issuer;
let customToken, idToken, decoded;

async function exchangeCustomToken(token) {
  const url = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=demo-key`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, returnSecureToken: true }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  assert.equal(response.ok, true, `Auth emulator token exchange failed: ${data?.error?.message || response.status}`);
  assert.equal(typeof data.idToken, 'string');
  return data.idToken;
}

before(async () => {
  // Ephemeral local RSA private key, never written to disk or sent to Google.
  // Firebase Auth emulator accepts a custom token signed by this disposable test account.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  app = initializeApp({
    projectId: PROJECT,
    credential: cert({
      projectId: PROJECT,
      clientEmail: `local-only-test@${PROJECT}.iam.gserviceaccount.com`,
      privateKey: privateKeyPem,
    }),
  }, `phase2c91-${suffix}`);
  db = getFirestore(app);
  auth = getAuth(app);
  gate = new MemberIdentitySecurityGate(db);
  issuer = createGatedFirebaseTokenIssuer(auth, db);
  await db.doc(refPath).set({ memberId, authUid: uid, status: 'active', credentialVersion: 1 });
});
after(async () => {
  if (db) await db.doc(refPath).delete();
  if (app) await deleteApp(app);
});

test('real Admin SDK custom token exchanges for real Auth emulator ID token', async () => {
  customToken = await issuer.issue(uid, claims(1));
  assert.equal(customToken.split('.').length, 3, 'Expected a signed custom JWT');
  idToken = await exchangeCustomToken(customToken);
  assert.notEqual(idToken, customToken, 'ID token and custom token must be different');
  decoded = await auth.verifyIdToken(idToken);
  assert.equal(decoded.uid, uid);
  assert.equal(decoded.role, 'member');
  assert.equal(decoded.memberId, memberId);
  assert.equal(decoded.credentialVersion, 1);
});

test('member gate accepts Auth-verified token claims, rejects forged UID', async () => {
  assert.equal(await gate.assertMemberAccess({
    uid: decoded.uid,
    role: decoded.role,
    memberId: decoded.memberId,
    credentialVersion: decoded.credentialVersion,
  }), memberId);
  await assert.rejects(gate.assertMemberAccess({
    uid: 'wrong_uid', role: decoded.role,
    memberId: decoded.memberId, credentialVersion: decoded.credentialVersion,
  }), /Access denied/);
});

test('disable blocks new issuance and gate rejects previously issued ID token claims', async () => {
  await db.doc(refPath).update({ status: 'disabled', credentialVersion: 2 });
  await assert.rejects(issuer.issue(uid, claims(1)), /Access denied/);
  await assert.rejects(issuer.issue(uid, claims(2)), /Access denied/);
  // A previously signed Firebase token can still verify cryptographically.
  const verifiedOldToken = await auth.verifyIdToken(idToken);
  assert.equal(verifiedOldToken.uid, uid);
  await assert.rejects(gate.assertMemberAccess({
    uid: verifiedOldToken.uid,
    role: verifiedOldToken.role,
    memberId: verifiedOldToken.memberId,
    credentialVersion: verifiedOldToken.credentialVersion,
  }), /Access denied/);
});

test('re-enable still rejects old version; new token receives version 2', async () => {
  await db.doc(refPath).update({ status: 'active' });
  await assert.rejects(issuer.issue(uid, claims(1)), /Access denied/);
  const newCustomToken = await issuer.issue(uid, claims(2));
  const newIdToken = await exchangeCustomToken(newCustomToken);
  const fresh = await auth.verifyIdToken(newIdToken);
  assert.equal(fresh.credentialVersion, 2);
  assert.equal(await gate.assertMemberAccess({
    uid: fresh.uid, role: fresh.role,
    memberId: fresh.memberId, credentialVersion: fresh.credentialVersion,
  }), memberId);
  await assert.rejects(gate.assertMemberAccess({
    uid: decoded.uid, role: decoded.role,
    memberId: decoded.memberId, credentialVersion: decoded.credentialVersion,
  }), /Access denied/);
});

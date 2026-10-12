import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IdentityDenied, validatePin, hashPin, verifyPin, issueEnrollmentChallenge,
  validateChallenge, nextFailure, assertNotLocked, digestActivation
} from '../src/memberIdentityCore.ts';
const PEPPER = 'SYNTHETIC-TEST-PEPPER-DO-NOT-USE-IN-PRODUCTION-123456';
test('PIN validation rejects weak or invalid codes', () => {
  for (const pin of ['123456', '000000', '111111', '12345', 'abcdef', '654321']) assert.throws(() => validatePin(pin), IdentityDenied);
  assert.doesNotThrow(() => validatePin('593802'));
});
test('scrypt hash is salted and verifies only the matching PIN', async () => {
  const h1 = await hashPin('593802', PEPPER), h2 = await hashPin('593802', PEPPER);
  assert.notEqual(h1.pinHash, h2.pinHash);
  const record = { memberId: 'synthetic-a', authUid: 'synthetic-uid-a', credentialVersion: 1, status: 'active', ...h1 };
  assert.equal(await verifyPin('593802', PEPPER, record), true);
  assert.equal(await verifyPin('593803', PEPPER, record), false);
});
test('activation challenge is random, expiring and not plaintext-stored', () => {
  const now = 1_800_000_000_000;
  const { challenge, token } = issueEnrollmentChallenge('synthetic-a', 'synthetic-organizer', now);
  assert.notEqual(challenge.digest, token.activationSecret);
  assert.equal(challenge.digest, digestActivation(token.activationSecret));
  assert.doesNotThrow(() => validateChallenge(challenge, token.activationSecret, now + 1000));
  assert.throws(() => validateChallenge(challenge, token.activationSecret, token.expiresAt), IdentityDenied);
  assert.throws(() => validateChallenge({ ...challenge, consumedAt: now }, token.activationSecret, now + 100), IdentityDenied);
  assert.throws(() => validateChallenge(challenge, 'f'.repeat(64), now + 100), IdentityDenied);
});
test('five failures lock for fifteen minutes and cooldown is persistent-record based', () => {
  const now = 1_800_000_000_000;
  let limit;
  for (let n = 0; n < 5; n++) limit = nextFailure(limit, now + n);
  assert.equal(limit.failedAttempts, 5);
  assert.throws(() => assertNotLocked(limit, now + 5), IdentityDenied);
  assert.throws(() => nextFailure(limit, now + 5), IdentityDenied);
  assert.doesNotThrow(() => assertNotLocked(limit, now + 15 * 60_000 + 5));
});

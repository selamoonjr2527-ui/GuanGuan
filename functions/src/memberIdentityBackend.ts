/** GuanGuan Phase 2C.2 prototype ONLY. Not exported from index.ts or deployed.
 * Requires a Firestore Emulator and a synthetic, injected pepper. Do not expose
 * these methods as unauthenticated HTTP endpoints without further abuse controls.
 */
import { randomBytes } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';
import {
  IdentityDenied, issueEnrollmentChallenge, validateChallenge, validatePin,
  hashPin, verifyPin, assertNotLocked, nextFailure,
  type Challenge, type MemberIdentity, type LoginLimit,
} from './memberIdentityCore.js';

const ROOT = 'clubs/guanguan';
const ORGANIZERS = new Set([
  'DWpEIuKxqRTBptDKqM4FIKjMPmf1',
  'Ofkc1m00ikbEg84VifbePLk1k0l2',
]);
const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const CHALLENGE_PATTERN = /^[a-f0-9]{32}$/i;
const SECRET_PATTERN = /^[a-f0-9]{64}$/i;
const GENERIC_ERROR = () => new IdentityDenied();

export interface TokenIssuer { issue(uid: string, claims: { role: 'member'; memberId: string }): Promise<string> }
export interface BackendDependencies { db: Firestore; tokens: TokenIssuer; pepper: string; clock?: () => number }

type EnrollmentChallenge = Challenge & { tokenDigest?: string };

export class MemberIdentityBackend {
  private readonly clock: () => number;
  constructor(private readonly deps: BackendDependencies) {
    if (Buffer.byteLength(deps.pepper || '', 'utf8') < 32) throw new Error('Missing server-only pepper');
    this.clock = deps.clock ?? Date.now;
  }

  /** Called only after verifying a real authenticated Firebase organizer UID. */
  async createChallenge(organizerUid: string, memberId: string) {
    if (!ORGANIZERS.has(organizerUid) || !MEMBER_ID_PATTERN.test(memberId)) throw GENERIC_ERROR();
    const { challenge, token } = issueEnrollmentChallenge(memberId, organizerUid, this.clock());
    const doc = this.deps.db.doc(`${ROOT}/memberEnrollmentChallenges/${challenge.id}`);
    const identityRef = this.deps.db.doc(`${ROOT}/memberPrivate/${memberId}`);
    await this.deps.db.runTransaction(async tx => {
      const existing = await tx.get(identityRef);
      if (existing.exists && existing.data()?.status === 'active') throw GENERIC_ERROR();
      tx.create(doc, challenge);
    });
    // Secret is returned once, never stored in plaintext.
    return token;
  }

  /** Claim a one-use challenge and set a new PIN. Returns a Firebase Custom Token. */
  async activate(challengeId: string, activationSecret: string, newPin: string) {
    if (!CHALLENGE_PATTERN.test(challengeId) || !SECRET_PATTERN.test(activationSecret)) throw GENERIC_ERROR();
    validatePin(newPin);
    const challengeRef = this.deps.db.doc(`${ROOT}/memberEnrollmentChallenges/${challengeId}`);
    // Prehash outside transaction; no secret leaves the server.
    const generated = await hashPin(newPin, this.deps.pepper);
    const uid = `gg_${randomBytes(20).toString('hex')}`;
    // Transaction callbacks may be retried; use only the committed return value.
    const activatedMemberId = await this.deps.db.runTransaction(async tx => {
      const snap = await tx.get(challengeRef);
      const challenge = snap.data() as EnrollmentChallenge | undefined;
      if (!challenge || !MEMBER_ID_PATTERN.test(challenge.memberId)) return null;
      const identityRef = this.deps.db.doc(`${ROOT}/memberPrivate/${challenge.memberId}`);
      const idSnap = await tx.get(identityRef);
      const now = this.clock();
      try { validateChallenge(challenge, activationSecret, now); }
      catch {
        if (challenge.consumedAt === undefined && now < challenge.expiresAt) {
          tx.update(challengeRef, { failures: Math.min(5, (challenge.failures || 0) + 1) });
        }
        return null;
      }
      if (idSnap.exists && idSnap.data()?.status === 'active') return null;
      const identity: MemberIdentity = {
        memberId: challenge.memberId, authUid: uid,
        credentialVersion: Number(idSnap.data()?.credentialVersion || 0) + 1,
        status: 'active', ...generated,
      };
      tx.set(identityRef, { ...identity, enrolledAt: now, updatedAt: now });
      tx.update(challengeRef, { consumedAt: now });
      return challenge.memberId;
    });
    if (!activatedMemberId) throw GENERIC_ERROR();
    return this.deps.tokens.issue(uid, { role: 'member', memberId: activatedMemberId });
  }

  /** Persist failure counters transactionally, including incorrect PIN attempts. */
  async login(memberId: string, pin: string) {
    if (!MEMBER_ID_PATTERN.test(memberId) || !/^\d{6}$/.test(pin)) throw GENERIC_ERROR();
    const identityRef = this.deps.db.doc(`${ROOT}/memberPrivate/${memberId}`);
    const limitRef = this.deps.db.doc(`${ROOT}/memberAuthLimits/${memberId}`);
    // The callback can be retried. Only trust the UID returned by the
    // transaction attempt that actually committed, never closure state.
    const committedUid = await this.deps.db.runTransaction(async tx => {
      const [idSnap, limitSnap] = await Promise.all([tx.get(identityRef), tx.get(limitRef)]);
      const identity = idSnap.data() as MemberIdentity | undefined;
      const limit = limitSnap.data() as LoginLimit | undefined;
      const now = this.clock();
      try { assertNotLocked(limit, now); } catch { return null; }
      const valid = Boolean(identity && identity.status === 'active' &&
        await verifyPin(pin, this.deps.pepper, identity));
      if (valid && identity) {
        tx.set(limitRef, { windowStart: now, failedAttempts: 0, lockedUntil: 0, updatedAt: now });
        return identity.authUid;
      }
      tx.set(limitRef, { ...nextFailure(limit, now), updatedAt: now });
      return null;
    });
    if (!committedUid) throw GENERIC_ERROR();
    return this.deps.tokens.issue(committedUid, { role: 'member', memberId });
  }

  async disable(organizerUid: string, memberId: string): Promise<void> {
    if (!ORGANIZERS.has(organizerUid) || !MEMBER_ID_PATTERN.test(memberId)) throw GENERIC_ERROR();
    const ref = this.deps.db.doc(`${ROOT}/memberPrivate/${memberId}`);
    await this.deps.db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw GENERIC_ERROR();
      tx.update(ref, { status: 'disabled', updatedAt: this.clock(), credentialVersion: Number(snap.data()?.credentialVersion || 0) + 1 });
    });
  }
}

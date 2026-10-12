/**
 * GuanGuan Phase 2C.11A — ISOLATED compatibility resolver.
 * Not exported from functions/src/index.ts and not wired to production UI.
 * Call only with a VERIFIED Firebase ID-token auth context. Never pass client JSON.
 * A successful resolution is NOT an authorization cache: re-check on every sensitive request.
 */
import type { Firestore } from 'firebase-admin/firestore';
import { MemberIdentitySecurityGate } from './memberIdentitySecurityGate.js';

export type VerifiedAuthContext = {
  uid: string;
  token: {
    role?: unknown;
    memberId?: unknown;
    credentialVersion?: unknown;
    firebase?: { sign_in_provider?: unknown };
  };
};

export type AccessDecision =
  | { kind: 'unauthenticated' }
  | { kind: 'denied' }
  | { kind: 'organizer'; uid: string }
  | { kind: 'member'; uid: string; memberId: string };

const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export class AuthCompatibilityLayer {
  private readonly gate: MemberIdentitySecurityGate;

  constructor(db: Firestore) {
    this.gate = new MemberIdentitySecurityGate(db);
  }

  /**
   * A UI mode or Quick PIN never elevates permissions. Re-check against Firestore each call.
   * This does NOT authenticate a caller — the outer callable must verify the ID token.
   */
  async resolve(auth: VerifiedAuthContext | null | undefined): Promise<AccessDecision> {
    if (!auth) return { kind: 'unauthenticated' };
    if (typeof auth.uid !== 'string' || !UID_PATTERN.test(auth.uid) || !auth.token || typeof auth.token !== 'object') {
      return { kind: 'denied' };
    }

    // Do not treat anonymous sessions as organizers even if a role was mistakenly provisioned.
    // The existing Organizer email/password login uses the 'password' provider.
    if (auth.token.firebase?.sign_in_provider === 'password') {
      try {
        await this.gate.assertOrganizer(auth.uid);
        return { kind: 'organizer', uid: auth.uid };
      } catch {
        // Fall through: a non-organizer may be a verified member.
      }
    }

    try {
      const memberId = await this.gate.assertMemberAccess({
        uid: auth.uid,
        role: auth.token.role,
        memberId: auth.token.memberId,
        credentialVersion: auth.token.credentialVersion,
      });
      return { kind: 'member', uid: auth.uid, memberId };
    } catch {
      return { kind: 'denied' };
    }
  }
}

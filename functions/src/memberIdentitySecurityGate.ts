/** Phase 2C.6: isolated server-side authorization gate; NOT exported or wired to endpoints.
 * Role documents MUST be provisioned by trusted Admin tooling and protected by Rules.
 * Call assertMemberAccess for EACH sensitive request; checking a custom token once is not revocation.
 */
import type { Firestore } from 'firebase-admin/firestore';

const ROOT = 'clubs/guanguan';
const ID = /^[A-Za-z0-9_-]{1,128}$/;
const DENIED = 'Access denied';

export type VerifiedMemberClaims = {
  uid: string;
  role?: unknown;
  memberId?: unknown;
  credentialVersion?: unknown;
};

export class MemberIdentitySecurityGate {
  constructor(private readonly db: Firestore) {}

  /** Auth UID must come from verified Firebase Auth context, NEVER request.data. */
  async assertOrganizer(authUid: string | null | undefined): Promise<void> {
    if (typeof authUid !== 'string' || !ID.test(authUid)) throw new Error(DENIED);
    const doc = await this.db.doc(`${ROOT}/organizerRoles/${authUid}`).get();
    const role = doc.data();
    if (!doc.exists || role?.role !== 'organizer' || role?.active !== true || role?.authUid !== authUid) {
      throw new Error(DENIED);
    }
  }

  /** Requires a verified ID token's UID+claims, not arbitrary client JSON. */
  async assertMemberAccess(auth: VerifiedMemberClaims | null | undefined): Promise<string> {
    if (!auth || typeof auth.uid !== 'string' || !ID.test(auth.uid) ||
        auth.role !== 'member' || typeof auth.memberId !== 'string' || !ID.test(auth.memberId) ||
        !Number.isSafeInteger(auth.credentialVersion) || Number(auth.credentialVersion) < 1) {
      throw new Error(DENIED);
    }
    const memberId = auth.memberId;
    const identityDoc = await this.db.doc(`${ROOT}/memberPrivate/${memberId}`).get();
    const identity = identityDoc.data();
    if (!identityDoc.exists || identity?.status !== 'active' || identity?.memberId !== memberId ||
        identity?.authUid !== auth.uid || identity?.credentialVersion !== auth.credentialVersion) {
      throw new Error(DENIED);
    }
    return memberId;
  }
}

/** Phase 2C.8: NON-EXPORTED token issuer. No endpoint or production wiring.
 * Always gate the committed UID and credentialVersion against Firestore before
 * minting. Issued Firebase tokens are NOT revoked by this check alone.
 */
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { MemberIdentitySecurityGate } from './memberIdentitySecurityGate.js';
import type { TokenIssuer } from './memberIdentityBackend.js';

export function createGatedFirebaseTokenIssuer(auth: Pick<Auth, 'createCustomToken'>, db: Firestore): TokenIssuer {
  const gate = new MemberIdentitySecurityGate(db);
  return {
    async issue(uid, claims) {
      if (!uid || claims.role !== 'member' || !Number.isSafeInteger(claims.credentialVersion) || claims.credentialVersion < 1) {
        throw new Error('Token issuance denied');
      }
      await gate.assertMemberAccess({ uid, ...claims });
      return auth.createCustomToken(uid, {
        role: 'member',
        memberId: claims.memberId,
        credentialVersion: claims.credentialVersion,
      });
    },
  };
}

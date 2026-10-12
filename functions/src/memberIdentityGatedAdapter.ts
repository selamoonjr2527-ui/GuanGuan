/** Phase 2C.7: NON-EXPORTED integration seam. Emulator tests only.
 * Never trust request.data organizer UID. This gates organizer operations
 * before invoking the legacy backend; it does NOT remove its static UID allowlist.
 * It does NOT implement member token verification, real token issuance,
 * eligibility proof, rate limits on challenge creation, or Firestore Rules.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { MemberIdentityBackend } from './memberIdentityBackend.js';
import { createMemberIdentityHandlers } from './memberIdentityCallableAdapter.js';
import type { MemberIdentitySecurityGate } from './memberIdentitySecurityGate.js';

type Request = { auth?: { uid: string } | null; data: unknown };
type BackendPort = Pick<MemberIdentityBackend, 'createChallenge' | 'activate' | 'login' | 'disable'>;
type OrganizerGatePort = Pick<MemberIdentitySecurityGate, 'assertOrganizer'>;

export function createGatedMemberIdentityHandlers(backend: BackendPort, gate: OrganizerGatePort) {
  const handlers = createMemberIdentityHandlers(backend);
  async function authenticatedOrganizer(request: Request): Promise<void> {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign in required');
    try {
      await gate.assertOrganizer(uid);
    } catch {
      // Never expose role document paths or details to callers.
      throw new HttpsError('permission-denied', 'Request denied');
    }
  }
  return {
    async createChallenge(request: Request) {
      await authenticatedOrganizer(request);
      return handlers.createChallenge(request);
    },
    async disable(request: Request) {
      await authenticatedOrganizer(request);
      return handlers.disable(request);
    },
    // Deliberately unchanged: these are NOT yet safe to export/deploy.
    activate: handlers.activate,
    login: handlers.login,
  };
}

/** Phase 2C.4 — non-exported callable handler adapter.
 * Intentionally NOT exported from src/index.ts and NOT connected to production.
 * A future endpoint must additionally configure App Check, abuse throttles, secrets,
 * authoritative enrollment eligibility and token revocation semantics.
 */
import { HttpsError } from 'firebase-functions/v2/https';
import type { MemberIdentityBackend } from './memberIdentityBackend.js';

type AuthContext = { uid: string } | null | undefined;
type CallableRequest = { auth?: AuthContext; data: unknown };
type Input = Record<string, unknown>;
const MAX_JSON_FIELDS = 4;

function payload(value: unknown, keys: readonly string[]): Input {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Invalid request');
  }
  const obj = value as Input;
  const ownKeys = Object.keys(obj);
  if (ownKeys.length > MAX_JSON_FIELDS || ownKeys.some(k => !keys.includes(k))) {
    throw new HttpsError('invalid-argument', 'Invalid request');
  }
  return obj;
}
function field(obj: Input, name: string, pattern: RegExp): string {
  const value = obj[name];
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new HttpsError('invalid-argument', 'Invalid request');
  }
  return value;
}
function safeError(err: unknown): never {
  if (err instanceof HttpsError) throw err;
  // Avoid leaking identity existence, lockout timing, Firestore paths, or PIN details.
  throw new HttpsError('permission-denied', 'Request denied');
}

/** Pure handler factory, suitable for isolated tests without deploying any functions. */
export function createMemberIdentityHandlers(backend: Pick<MemberIdentityBackend,
  'createChallenge' | 'activate' | 'login' | 'disable'>) {
  return {
    async createChallenge(request: CallableRequest) {
      // Never accept organizerUid from client input.
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required');
      const data = payload(request.data, ['memberId']);
      const memberId = field(data, 'memberId', /^[a-zA-Z0-9_-]{1,128}$/);
      try { return await backend.createChallenge(request.auth.uid, memberId); }
      catch (err) { return safeError(err); }
    },
    async activate(request: CallableRequest) {
      const data = payload(request.data, ['challengeId', 'activationSecret', 'pin']);
      const challengeId = field(data, 'challengeId', /^[a-f0-9]{32}$/i);
      const activationSecret = field(data, 'activationSecret', /^[a-f0-9]{64}$/i);
      const pin = field(data, 'pin', /^\d{6}$/);
      try { return { customToken: await backend.activate(challengeId, activationSecret, pin) }; }
      catch (err) { return safeError(err); }
    },
    async login(request: CallableRequest) {
      const data = payload(request.data, ['memberId', 'pin']);
      const memberId = field(data, 'memberId', /^[a-zA-Z0-9_-]{1,128}$/);
      const pin = field(data, 'pin', /^\d{6}$/);
      try { return { customToken: await backend.login(memberId, pin) }; }
      catch (err) { return safeError(err); }
    },
    async disable(request: CallableRequest) {
      if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in required');
      const data = payload(request.data, ['memberId']);
      const memberId = field(data, 'memberId', /^[a-zA-Z0-9_-]{1,128}$/);
      try { await backend.disable(request.auth.uid, memberId); return { ok: true }; }
      catch (err) { return safeError(err); }
    },
  };
}

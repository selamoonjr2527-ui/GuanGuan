/** GuanGuan Phase 2C isolated identity core. NOT exported from functions/src/index.ts.
 * All persistence and token issuance are supplied by a trusted backend adapter.
 */
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';


const scrypt = (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number }
): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scryptCallback(password, salt, keylen, options, (error, key) => {
      if (error) {
        reject(error);
      } else {
        resolve(key);
      }
    });
  });
export const ACTIVATION_LIFETIME_MS = 10 * 60_000;
export const WINDOW_MS = 15 * 60_000;
export const LOCK_MS = 15 * 60_000;
export const MAX_FAILURES = 5;

export type MemberIdentity = {
  memberId: string;
  authUid: string;
  pinSalt: string;
  pinHash: string;
  credentialVersion: number;
  status: 'active' | 'disabled';
};
export type Challenge = {
  id: string;
  memberId: string;
  digest: string;
  createdBy: string;
  expiresAt: number;
  consumedAt?: number;
  failures: number;
};
export type LoginLimit = { windowStart: number; failedAttempts: number; lockedUntil: number };
export type EnrollmentToken = { challengeId: string; activationSecret: string; expiresAt: number };
export class IdentityDenied extends Error {
  constructor() { super('Unable to authenticate or complete this request'); }
}

export function validatePin(pin: unknown): asserts pin is string {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin) ||
      /(\d)\1{5}/.test(pin) ||
      ['123456', '654321', '012345', '987654', '111111', '121212', '000000'].includes(pin)) {
    throw new IdentityDenied();
  }
}
export function digestActivation(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
export function safeHexEqual(a: string, b: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(a) || !/^[a-f0-9]{64}$/i.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
}
export async function hashPin(pin: string, pepper: string): Promise<{ pinSalt: string; pinHash: string }> {
  validatePin(pin);
  if (!pepper || Buffer.byteLength(pepper) < 32) throw new Error('Server PIN pepper not configured');
  const pinSalt = randomBytes(16).toString('hex');
  const pinHash = (await scrypt(pin + pepper, Buffer.from(pinSalt, 'hex'), 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  return { pinSalt, pinHash: pinHash.toString('hex') };
}
export async function verifyPin(pin: string, pepper: string, identity: MemberIdentity): Promise<boolean> {
  if (typeof pin !== 'string' || !/^\d{6}$/.test(pin)) return false;
  if (!pepper || Buffer.byteLength(pepper) < 32) throw new Error('Server PIN pepper not configured');
  if (!/^[a-f0-9]{32}$/i.test(identity.pinSalt) || !/^[a-f0-9]{128}$/i.test(identity.pinHash)) return false;
  const candidate = (await scrypt(pin + pepper, Buffer.from(identity.pinSalt, 'hex'), 64, { N: 16384, r: 8, p: 1 })) as Buffer;
  return timingSafeEqual(candidate, Buffer.from(identity.pinHash, 'hex'));
}
export function nextFailure(limit: LoginLimit | undefined, now: number): LoginLimit {
  if (limit && limit.lockedUntil > now) throw new IdentityDenied();
  const windowStart = limit && now - limit.windowStart < WINDOW_MS ? limit.windowStart : now;
  const failedAttempts = limit && windowStart === limit.windowStart ? limit.failedAttempts + 1 : 1;
  return { windowStart, failedAttempts, lockedUntil: failedAttempts >= MAX_FAILURES ? now + LOCK_MS : 0 };
}
export function assertNotLocked(limit: LoginLimit | undefined, now: number): void {
  if (limit && limit.lockedUntil > now) throw new IdentityDenied();
}
export function issueEnrollmentChallenge(memberId: string, organizerUid: string, now: number): { challenge: Challenge; token: EnrollmentToken } {
  if (!memberId || !/^[\w-]{1,128}$/.test(memberId)) throw new IdentityDenied();
  if (!organizerUid) throw new IdentityDenied();
  const challengeId = randomBytes(16).toString('hex');
  const activationSecret = randomBytes(32).toString('hex');
  const expiresAt = now + ACTIVATION_LIFETIME_MS;
  return {
    challenge: { id: challengeId, memberId, digest: digestActivation(activationSecret), createdBy: organizerUid, expiresAt, failures: 0 },
    token: { challengeId, activationSecret, expiresAt }
  };
}
export function validateChallenge(challenge: Challenge | undefined, candidate: string, now: number): void {
  if (!challenge || challenge.consumedAt !== undefined || now >= challenge.expiresAt ||
      challenge.failures >= MAX_FAILURES || !safeHexEqual(challenge.digest, digestActivation(candidate))) {
    throw new IdentityDenied();
  }
}


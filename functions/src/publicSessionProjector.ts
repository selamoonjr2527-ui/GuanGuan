import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { mapCanonicalStateToPublicSession } from './publicSessionProjection.js';

const CLUB_PATH = 'clubs/guanguan';
const CURRENT_SESSION_PATH = `${CLUB_PATH}/runtime/currentSession`;
const PUBLIC_SESSION_PATH = `${CLUB_PATH}/runtime/publicSession`;
const MAX_PUBLIC_DOCUMENT_BYTES = 950_000;

const adminApp = getApps().length > 0 ? getApp() : initializeApp();
const defaultDb = getFirestore(adminApp);

export type ProjectionResult = 'created' | 'updated' | 'unchanged' | 'stale' | 'deleted';

const normalizedRevision = (value: unknown): number => {
  const revision = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
};

const samePublicPayload = (
  existing: Record<string, unknown>,
  next: Record<string, unknown>
): boolean => {
  const { sourceRevision: _existingRevision, ...existingPayload } = existing;
  const { sourceRevision: _nextRevision, ...nextPayload } = next;
  return JSON.stringify(existingPayload) === JSON.stringify(nextPayload);
};

/**
 * Re-read the latest canonical document in a transaction. The trigger event is
 * deliberately not used as source data, so delayed or duplicate events cannot
 * publish an older snapshot over a newer projection.
 */
export async function projectLatestPublicSession(
  db: Firestore = defaultDb
): Promise<ProjectionResult> {
  const canonicalRef = db.doc(CURRENT_SESSION_PATH);
  const publicRef = db.doc(PUBLIC_SESSION_PATH);

  return db.runTransaction(async (transaction) => {
    const canonicalSnapshot = await transaction.get(canonicalRef);
    const publicSnapshot = await transaction.get(publicRef);

    if (!canonicalSnapshot.exists) {
      if (publicSnapshot.exists) {
        transaction.delete(publicRef);
        return 'deleted';
      }
      return 'unchanged';
    }

    const envelope = canonicalSnapshot.data() ?? {};
    const revision = normalizedRevision(envelope.revision);
    const next = mapCanonicalStateToPublicSession(envelope.state, revision);
    const existing = publicSnapshot.exists
      ? publicSnapshot.data() as Record<string, unknown>
      : undefined;

    if (existing) {
      const existingRevision = normalizedRevision(existing.sourceRevision);
      if (existingRevision > revision) return 'stale';
      if (samePublicPayload(existing, next as unknown as Record<string, unknown>)) {
        return 'unchanged';
      }
    }

    const serialized = JSON.stringify(next);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_PUBLIC_DOCUMENT_BYTES) {
      throw new Error(
        `Public session projection exceeds the safe document size (${Buffer.byteLength(serialized, 'utf8')} bytes)`
      );
    }

    transaction.set(publicRef, next);
    return publicSnapshot.exists ? 'updated' : 'created';
  });
}

/** The event payload is ignored; this entry point exists for deterministic stale-event tests. */
export async function handlePublicSessionTrigger(_event: unknown): Promise<ProjectionResult> {
  return projectLatestPublicSession();
}

export const syncPublicSessionProjection = onDocumentWritten(
  { document: CURRENT_SESSION_PATH, maxInstances: 10 },
  async (event) => {
    try {
      return await handlePublicSessionTrigger(event);
    } catch (error) {
      logger.error('Public session projection failed', error);
      throw error;
    }
  }
);
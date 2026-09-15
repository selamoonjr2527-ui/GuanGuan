import {
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { AppState } from './storage';

const CURRENT_SESSION_REF = doc(
  db,
  'clubs',
  'guanguan',
  'runtime',
  'currentSession'
);

const SCHEMA_VERSION = 2;

interface CurrentSessionEnvelope {
  schemaVersion: number;
  revision?: number;
  state: AppState;
  updatedBy?: string;
  updatedAt?: unknown;
}

export interface FirestoreMergedSaveResult {
  state: AppState;
  revision: number;
}

// Firestore rejects undefined object fields.
// JSON serialization also gives us a stable JSON-safe shape for comparisons.
function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function hasOwn(value: unknown, key: string): boolean {
  return Boolean(
    value &&
      typeof value === 'object' &&
      Object.prototype.hasOwnProperty.call(value, key)
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value)
  );
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  try {
    return JSON.stringify(sanitizeForFirestore(a)) ===
      JSON.stringify(sanitizeForFirestore(b));
  } catch {
    return false;
  }
}

function isIdObject(value: unknown): value is Record<string, unknown> & { id: string } {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      typeof (value as Record<string, unknown>).id === 'string' &&
      ((value as Record<string, unknown>).id as string).length > 0
  );
}

function isIdObjectArray(value: unknown): value is Array<Record<string, unknown> & { id: string }> {
  return Array.isArray(value) && value.every((item) => isIdObject(item));
}

/**
 * Apply ONLY the differences between base -> local onto remote.
 *
 * This is a three-way merge:
 *   base   = the Firestore state this browser last synced from
 *   local  = this browser's current edited state
 *   remote = the newest Firestore state inside the transaction
 *
 * Result:
 * - If another device changed a different player/field, that change is kept.
 * - If this device changed a field, this device's change is applied.
 * - If both devices changed the exact same scalar field, the later transaction
 *   wins for that field (normal last-writer behavior).
 * - Arrays of objects with `id` are merged item-by-item instead of replacing
 *   the entire array.
 */
export function mergeLocalChanges<T>(
  baseValue: T,
  localValue: T,
  remoteValue: T
): T {
  // No local change -> newest remote wins.
  if (deepEqual(baseValue, localValue)) {
    return remoteValue;
  }

  // Primitive / null / type mismatch -> local changed this value, so apply it.
  if (
    baseValue === null ||
    localValue === null ||
    remoteValue === null ||
    typeof baseValue !== 'object' ||
    typeof localValue !== 'object' ||
    typeof remoteValue !== 'object'
  ) {
    return localValue;
  }

  // Arrays with stable item IDs are merged record-by-record.
  if (
    isIdObjectArray(baseValue) &&
    isIdObjectArray(localValue) &&
    isIdObjectArray(remoteValue)
  ) {
    const baseMap = new Map(baseValue.map((item) => [item.id, item]));
    const localMap = new Map(localValue.map((item) => [item.id, item]));
    const remoteMap = new Map(remoteValue.map((item) => [item.id, item]));

    const resultMap = new Map(remoteMap);

    // Handle local deletes, adds, and edits.
    for (const [id, baseItem] of baseMap.entries()) {
      const localHas = localMap.has(id);
      const remoteHas = remoteMap.has(id);

      // Deleted locally since base -> delete from merged state.
      if (!localHas) {
        resultMap.delete(id);
        continue;
      }

      const localItem = localMap.get(id)!;

      if (!remoteHas) {
        // Remote deleted it. If local also changed it since base, local intent wins
        // and re-creates it. If local did not change it, keep the remote delete.
        if (!deepEqual(baseItem, localItem)) {
          resultMap.set(id, localItem);
        } else {
          resultMap.delete(id);
        }
        continue;
      }

      const remoteItem = remoteMap.get(id)!;
      resultMap.set(
        id,
        mergeLocalChanges(baseItem, localItem, remoteItem)
      );
    }

    // New items created locally after base.
    for (const [id, localItem] of localMap.entries()) {
      if (!baseMap.has(id)) {
        if (remoteMap.has(id)) {
          // Extremely rare same-ID creation on two clients; merge object fields.
          resultMap.set(
            id,
            mergeLocalChanges(
              {} as Record<string, unknown> & { id: string },
              localItem,
              remoteMap.get(id)!
            )
          );
        } else {
          resultMap.set(id, localItem);
        }
      }
    }

    // Preserve the local order for known items, then append remote-only additions.
    const ordered: Array<Record<string, unknown> & { id: string }> = [];
    const used = new Set<string>();

    for (const item of localValue) {
      const merged = resultMap.get(item.id);
      if (merged) {
        ordered.push(merged);
        used.add(item.id);
      }
    }

    for (const item of remoteValue) {
      if (!used.has(item.id)) {
        const merged = resultMap.get(item.id);
        if (merged) {
          ordered.push(merged);
          used.add(item.id);
        }
      }
    }

    return ordered as T;
  }

  // Non-ID arrays (e.g. teamA/teamB arrays) are treated as one field.
  // If this browser changed the array, its local array wins.
  if (
    Array.isArray(baseValue) ||
    Array.isArray(localValue) ||
    Array.isArray(remoteValue)
  ) {
    return localValue;
  }

  // Plain objects merge field-by-field recursively.
  if (
    isPlainObject(baseValue) &&
    isPlainObject(localValue) &&
    isPlainObject(remoteValue)
  ) {
    const baseObject = baseValue as Record<string, unknown>;
    const localObject = localValue as Record<string, unknown>;
    const remoteObject = remoteValue as Record<string, unknown>;
    const result: Record<string, unknown> = { ...remoteObject };

    const keys = new Set([
      ...Object.keys(baseObject),
      ...Object.keys(localObject),
    ]);

    for (const key of keys) {
      const baseHas = hasOwn(baseObject, key);
      const localHas = hasOwn(localObject, key);
      const remoteHas = hasOwn(remoteObject, key);

      // Local deleted a property that existed in base.
      if (baseHas && !localHas) {
        delete result[key];
        continue;
      }

      // Property is new locally.
      if (!baseHas && localHas) {
        result[key] = localObject[key];
        continue;
      }

      // Nothing local to apply.
      if (!localHas) {
        continue;
      }

      const baseChild = baseObject[key];
      const localChild = localObject[key];

      if (!remoteHas) {
        // If local changed the field since base, restore local.
        // Otherwise respect the remote deletion.
        if (!deepEqual(baseChild, localChild)) {
          result[key] = localChild;
        } else {
          delete result[key];
        }
        continue;
      }

      result[key] = mergeLocalChanges(
        baseChild,
        localChild,
        remoteObject[key]
      );
    }

    return result as T;
  }

  return localValue;
}

export function areFirestoreStatesEqual(
  a: AppState,
  b: AppState
): boolean {
  return deepEqual(a, b);
}

/**
 * Initial seed only. Existing behavior remains available for first install /
 * when currentSession does not exist yet.
 */
export async function saveCurrentSessionToFirestore(
  state: AppState,
  clientId: string
): Promise<void> {
  const safeState = sanitizeForFirestore(state);

  await setDoc(CURRENT_SESSION_REF, {
    schemaVersion: SCHEMA_VERSION,
    revision: 1,
    state: safeState,
    updatedBy: clientId,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Concurrency-safe save.
 *
 * Firestore automatically retries this transaction if another device changes
 * currentSession while we are writing. We then re-read the newest remote state
 * and apply only this browser's base->local delta over it.
 */
export async function saveCurrentSessionMergedToFirestore(
  localState: AppState,
  baseState: AppState,
  clientId: string
): Promise<FirestoreMergedSaveResult> {
  const safeLocal = sanitizeForFirestore(localState);
  const safeBase = sanitizeForFirestore(baseState);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(CURRENT_SESSION_REF);

    if (!snapshot.exists()) {
      transaction.set(CURRENT_SESSION_REF, {
        schemaVersion: SCHEMA_VERSION,
        revision: 1,
        state: safeLocal,
        updatedBy: clientId,
        updatedAt: serverTimestamp(),
      });

      return {
        state: safeLocal,
        revision: 1,
      };
    }

    const data = snapshot.data() as Partial<CurrentSessionEnvelope>;
    const remoteState = data.state
      ? sanitizeForFirestore(data.state)
      : safeBase;

    const mergedState = sanitizeForFirestore(
      mergeLocalChanges(safeBase, safeLocal, remoteState)
    );

    const nextRevision =
      Math.max(0, Number(data.revision || 0)) + 1;

    transaction.set(CURRENT_SESSION_REF, {
      schemaVersion: SCHEMA_VERSION,
      revision: nextRevision,
      state: mergedState,
      updatedBy: clientId,
      updatedAt: serverTimestamp(),
    });

    return {
      state: mergedState,
      revision: nextRevision,
    };
  });
}

export function subscribeToCurrentSessionFromFirestore(
  onState: (
    state: AppState,
    updatedBy?: string,
    revision?: number
  ) => void,
  onMissing: () => void | Promise<void>,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  let firstSnapshot = true;

  return onSnapshot(
    CURRENT_SESSION_REF,
    (snapshot) => {
      if (!snapshot.exists()) {
        if (firstSnapshot) {
          void onMissing();
        }

        firstSnapshot = false;
        return;
      }

      firstSnapshot = false;

      const data = snapshot.data() as Partial<CurrentSessionEnvelope>;

      if (!data.state) {
        console.warn(
          'Firestore currentSession exists but has no state field.'
        );
        return;
      }

      onState(
        data.state,
        data.updatedBy,
        Math.max(0, Number(data.revision || 0))
      );
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('Firestore subscription failed', error);
      }
    }
  );
}

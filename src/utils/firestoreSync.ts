import {
  doc,
  onSnapshot,
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

const SCHEMA_VERSION = 1;

interface CurrentSessionEnvelope {
  schemaVersion: number;
  state: AppState;
  updatedBy?: string;
  updatedAt?: unknown;
}

// Firestore rejects `undefined` values.
// JSON serialization removes undefined object fields and keeps the AppState JSON-safe.
function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export async function saveCurrentSessionToFirestore(
  state: AppState,
  clientId: string
): Promise<void> {
  const safeState = sanitizeForFirestore(state);

  await setDoc(CURRENT_SESSION_REF, {
    schemaVersion: SCHEMA_VERSION,
    state: safeState,
    updatedBy: clientId,
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToCurrentSessionFromFirestore(
  onState: (state: AppState, updatedBy?: string) => void,
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
        console.warn('Firestore currentSession exists but has no state field.');
        return;
      }

      onState(data.state, data.updatedBy);
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

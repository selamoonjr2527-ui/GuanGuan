import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  setDoc,
  writeBatch,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../firebase';
import type { DailySessionArchive, FundTransaction } from '../types';

const ARCHIVES_COLLECTION = collection(db, 'clubs', 'guanguan', 'archives');
const FUND_COLLECTION = collection(db, 'clubs', 'guanguan', 'fundTransactions');

function sanitizeForFirestore<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// -----------------------------
// Archives
// -----------------------------
export async function upsertSessionArchiveToFirestore(
  archive: DailySessionArchive
): Promise<void> {
  await setDoc(
    doc(db, 'clubs', 'guanguan', 'archives', archive.id),
    sanitizeForFirestore(archive)
  );
}

export async function deleteSessionArchiveFromFirestore(
  id: string
): Promise<void> {
  await deleteDoc(doc(db, 'clubs', 'guanguan', 'archives', id));
}

export function subscribeToSessionArchivesFromFirestore(
  onData: (archives: DailySessionArchive[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    ARCHIVES_COLLECTION,
    (snapshot) => {
      const archives = snapshot.docs
        .map((item) => item.data() as DailySessionArchive)
        .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));

      onData(archives);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('Archive Firestore subscription failed', error);
      }
    }
  );
}

export async function seedSessionArchivesToFirestore(
  archives: DailySessionArchive[]
): Promise<void> {
  if (archives.length === 0) return;

  // Archive counts for this app are expected to be small. Use one atomic batch.
  // Keep below Firestore's batch operation limit.
  if (archives.length > 450) {
    throw new Error('Too many archives for one seed batch.');
  }

  const batch = writeBatch(db);

  for (const archive of archives) {
    batch.set(
      doc(db, 'clubs', 'guanguan', 'archives', archive.id),
      sanitizeForFirestore(archive)
    );
  }

  await batch.commit();
}

// -----------------------------
// Fund transactions
// -----------------------------
export async function upsertFundTransactionToFirestore(
  transaction: FundTransaction
): Promise<void> {
  await setDoc(
    doc(db, 'clubs', 'guanguan', 'fundTransactions', transaction.id),
    sanitizeForFirestore(transaction)
  );
}

export async function deleteFundTransactionFromFirestore(
  id: string
): Promise<void> {
  await deleteDoc(doc(db, 'clubs', 'guanguan', 'fundTransactions', id));
}

export function subscribeToFundTransactionsFromFirestore(
  onData: (transactions: FundTransaction[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    FUND_COLLECTION,
    (snapshot) => {
      const transactions = snapshot.docs
        .map((item) => item.data() as FundTransaction)
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      onData(transactions);
    },
    (error) => {
      if (onError) {
        onError(error);
      } else {
        console.error('Fund Firestore subscription failed', error);
      }
    }
  );
}

export async function seedFundTransactionsToFirestore(
  transactions: FundTransaction[]
): Promise<void> {
  if (transactions.length === 0) return;

  if (transactions.length > 450) {
    throw new Error('Too many fund transactions for one seed batch.');
  }

  const batch = writeBatch(db);

  for (const transaction of transactions) {
    batch.set(
      doc(db, 'clubs', 'guanguan', 'fundTransactions', transaction.id),
      sanitizeForFirestore(transaction)
    );
  }

  await batch.commit();
}

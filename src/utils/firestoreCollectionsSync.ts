import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  getDocs,
  getDocsFromServer,
  query,
  where,
  runTransaction,
  setDoc,
  writeBatch,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../firebase';
import { getAuth } from 'firebase/auth';
import type { DailySessionArchive, FundTransaction, ArchiveFinanceVerification } from '../types';

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

/** Safe correction: checks date collision and refuses overwriting an archive
 * that changed since the editor was opened. No ledger data is modified. */
export async function correctSessionArchiveInFirestore(
  original: DailySessionArchive,
  updated: DailySessionArchive
): Promise<void> {
  if (!original.id || original.id !== updated.id) {
    throw new Error('Archive ID must remain unchanged');
  }
  if (original.archiveDate !== updated.archiveDate) {
    const conflicts = await getDocs(query(ARCHIVES_COLLECTION, where('archiveDate', '==', updated.archiveDate)));
    if (conflicts.docs.some(item => item.id !== updated.id)) {
      throw new Error('มี Archive วันที่นี้อยู่แล้ว กรุณาตรวจสอบรายการซ้ำ');
    }
  }
  const ref = doc(db, 'clubs', 'guanguan', 'archives', updated.id);
  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('ไม่พบ Archive บน Firestore');
    const remote = snapshot.data() as DailySessionArchive;
    if (remote.archiveDate !== original.archiveDate ||
        remote.totalExpense !== original.totalExpense ||
        remote.totalRevenue !== original.totalRevenue ||
        remote.venueCost !== original.venueCost ||
        remote.savedAt !== original.savedAt) {
      throw new Error('ข้อมูล Archive มีการเปลี่ยนแปลงจากเครื่องอื่น กรุณา Refresh ก่อนแก้');
    }
    transaction.set(ref, sanitizeForFirestore(updated));
  });
}

/** V3.1: online-only, idempotent archive creation for one calendar date.
 * Never resets app state; caller must await success before resetting.
 * Legacy archives are checked using server data to avoid accidental duplicates.
 */
export async function createClosedSessionArchiveSafely(
  archive: DailySessionArchive
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(archive.archiveDate) ||
      archive.id !== `archive-session-${archive.archiveDate}`) {
    throw new Error('วันที่หรือ Archive ID ไม่ถูกต้อง');
  }
  // Force server verification. Local cache must not authorize a close.
  const sameDate = await getDocsFromServer(query(
    ARCHIVES_COLLECTION, where('archiveDate', '==', archive.archiveDate)
  ));
  if (!sameDate.empty) {
    throw new Error('มี Archive ของวันที่นี้แล้ว ห้ามปิดรอบซ้ำ');
  }
  const ref = doc(db, 'clubs', 'guanguan', 'archives', archive.id);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) throw new Error('รอบนี้ถูกบันทึกแล้ว กรุณาตรวจ Archive');
    tx.set(ref, sanitizeForFirestore(archive));
  });
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

/**
 * Confirms only a revenue allocation. Does not change Archive totals,
 * payment records, Stock or Usage Ledger. Security rules MUST restrict
 * both documents to organizer/admin identities; UI mode is not authorization.
 */
export async function confirmArchiveFinanceToFirestore(
  archive: DailySessionArchive,
  input: { courtRatePerPlayer: number; courtRevenue: number; shuttleRevenue: number; otherRevenue: number; reason: string }
): Promise<void> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('ต้องเข้าสู่ระบบก่อนยืนยันยอด');
  if (!archive.id || !input.reason.trim()) throw new Error('ต้องระบุรอบและเหตุผลการยืนยัน');
  for (const value of [input.courtRatePerPlayer, input.courtRevenue, input.shuttleRevenue, input.otherRevenue]) {
    if (!Number.isFinite(value) || value < 0) throw new Error('ยอดต้องเป็นจำนวนตั้งแต่ 0 ขึ้นไป');
  }
  const rounded = (value: number) => Math.round(value * 100) / 100;
  if (Math.abs(rounded(input.courtRevenue + input.shuttleRevenue + input.otherRevenue) - rounded(archive.totalRevenue)) > 0.01) {
    throw new Error('ผลรวมรายรับแยกประเภทต้องเท่ากับรายรับ Archive');
  }
  if (Math.abs(rounded(archive.totalPlayers * input.courtRatePerPlayer) - rounded(input.courtRevenue)) > 0.01) {
    throw new Error('ค่าคอร์ทรับไม่ตรงกับจำนวนคน × อัตรา');
  }
  const archiveRef = doc(db, 'clubs', 'guanguan', 'archives', archive.id);
  const auditRef = doc(collection(db, 'clubs', 'guanguan', 'financeVerificationAudit'));
  await runTransaction(db, async transaction => {
    const currentSnapshot = await transaction.get(archiveRef);
    if (!currentSnapshot.exists()) throw new Error('ไม่พบรอบใน Firestore');
    const current = currentSnapshot.data() as DailySessionArchive;
    const snapshot = {
      archiveDate: current.archiveDate,
      totalPlayers: current.totalPlayers,
      totalShuttlecocks: current.totalShuttlecocks,
      totalRevenue: current.totalRevenue,
      totalExpense: current.totalExpense,
      venueCost: current.venueCost ?? NaN,
      shuttleCost: current.shuttleCost ?? NaN,
    };
    const expected = {
      archiveDate: archive.archiveDate,
      totalPlayers: archive.totalPlayers,
      totalShuttlecocks: archive.totalShuttlecocks,
      totalRevenue: archive.totalRevenue,
      totalExpense: archive.totalExpense,
      venueCost: archive.venueCost ?? NaN,
      shuttleCost: archive.shuttleCost ?? NaN,
    };
    if (JSON.stringify(snapshot) !== JSON.stringify(expected)) {
      throw new Error('ข้อมูลรอบนี้เปลี่ยนจากที่แสดง กรุณา Refresh ก่อนยืนยัน');
    }
    if (!Number.isFinite(snapshot.venueCost) || !Number.isFinite(snapshot.shuttleCost)) {
      throw new Error('รอบนี้ยังไม่มีข้อมูลต้นทุนคอร์ทหรือต้นทุนลูกที่ยืนยันได้');
    }
    const now = Date.now();
    const verification: ArchiveFinanceVerification = {
      schemaVersion: 1,
      courtRatePerPlayer: rounded(input.courtRatePerPlayer),
      courtRevenue: rounded(input.courtRevenue),
      shuttleRevenue: rounded(input.shuttleRevenue),
      otherRevenue: rounded(input.otherRevenue),
      confirmedByUid: uid,
      confirmedAt: now,
      reason: input.reason.trim(),
      snapshot: { ...snapshot, venueCost: snapshot.venueCost, shuttleCost: snapshot.shuttleCost },
    };
    transaction.update(archiveRef, { financeVerification: verification });
    transaction.set(auditRef, {
      archiveId: archive.id,
      archiveDate: current.archiveDate,
      before: current.financeVerification ?? null,
      after: verification,
      actorUid: uid,
      createdAt: now,
      action: 'confirm-revenue-allocation',
    });
  });
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

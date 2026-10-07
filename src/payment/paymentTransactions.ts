import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../firebase';
import type {
  CreatePendingPaymentInput,
  PaymentProvider,
  PaymentStatus,
  PaymentTransaction,
} from './paymentTypes';

const PAYMENT_COLLECTION = collection(
  db,
  'clubs',
  'guanguan',
  'paymentTransaction'
);

function sanitizeInvoicePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 24);
}

export function buildPaymentInvoiceId(
  sessionDate: string,
  playerId: string
): string {
  const safeDate = sessionDate.replace(/-/g, '');
  const safePlayer = sanitizeInvoicePart(playerId) || 'PLAYER';
  return `GG-${safeDate}-${safePlayer}`;
}

function timestampToMillis(value: any): number | undefined {
  return typeof value?.toMillis === 'function'
    ? value.toMillis()
    : undefined;
}

function normalizePaymentTransaction(
  id: string,
  data: any
): PaymentTransaction {
  return {
    id,
    playerId: String(data.playerId || ''),
    nickname: data.nickname ? String(data.nickname) : undefined,
    sessionDate: String(data.sessionDate || ''),
    amount: Number(data.amount || 0),
    currency: 'THB',
    status: (data.status || 'pending') as PaymentStatus,
    paymentMethod: data.paymentMethod || 'promptpay',
    provider: (data.provider || 'manual_promptpay') as PaymentProvider,
    transactionRef: data.transactionRef
      ? String(data.transactionRef)
      : undefined,
    createdAt: timestampToMillis(data.createdAt),
    updatedAt: timestampToMillis(data.updatedAt),
    reportedAt: timestampToMillis(data.reportedAt),
    paidAt: timestampToMillis(data.paidAt),
    verifiedAt: timestampToMillis(data.verifiedAt),
    rejectedAt: timestampToMillis(data.rejectedAt),
  };
}

export async function createPendingPaymentTransaction(
  input: CreatePendingPaymentInput
): Promise<string> {
  const amount = Math.max(0, Math.round(Number(input.amount || 0)));

  if (!input.playerId) {
    throw new Error('playerId is required');
  }

  if (!input.sessionDate) {
    throw new Error('sessionDate is required');
  }

  if (amount <= 0) {
    throw new Error('amount must be greater than 0');
  }

  const invoiceId = buildPaymentInvoiceId(
    input.sessionDate,
    input.playerId
  );

  const paymentRef = doc(
    db,
    'clubs',
    'guanguan',
    'paymentTransaction',
    invoiceId
  );

  const existingSnapshot = await getDoc(paymentRef);

  if (existingSnapshot.exists()) {
    return invoiceId;
  }

  await setDoc(paymentRef, {
    invoiceNo: invoiceId,
    playerId: input.playerId,
    nickname: input.nickname || '',
    sessionDate: input.sessionDate,
    amount,
    currency: 'THB',
    status: 'pending',
    paymentMethod: input.paymentMethod || 'promptpay',
    provider: 'manual_promptpay',
    transactionRef: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return invoiceId;
}

export async function requestPaymentVerification(
  invoiceId: string
): Promise<void> {
  const paymentRef = doc(
    db,
    'clubs',
    'guanguan',
    'paymentTransaction',
    invoiceId
  );

  const snapshot = await getDoc(paymentRef);

  if (!snapshot.exists()) {
    throw new Error('Payment transaction not found');
  }

  const data = snapshot.data() as any;

  if (data.status === 'paid' || data.status === 'pending_verify') {
    return;
  }

  await updateDoc(paymentRef, {
    status: 'pending_verify',
    reportedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function confirmPaymentReceived(
  invoiceId: string
): Promise<void> {
  const paymentRef = doc(
    db,
    'clubs',
    'guanguan',
    'paymentTransaction',
    invoiceId
  );

  await updateDoc(paymentRef, {
    status: 'paid',
    paidAt: serverTimestamp(),
    verifiedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function rejectPaymentVerification(
  invoiceId: string
): Promise<void> {
  const paymentRef = doc(
    db,
    'clubs',
    'guanguan',
    'paymentTransaction',
    invoiceId
  );

  await updateDoc(paymentRef, {
    status: 'pending',
    rejectedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function subscribeToPaymentTransactions(
  onData: (transactions: PaymentTransaction[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    PAYMENT_COLLECTION,
    (snapshot) => {
      const transactions = snapshot.docs
        .map((item) =>
          normalizePaymentTransaction(item.id, item.data())
        )
        .sort(
          (a, b) =>
            (b.reportedAt || b.createdAt || 0) -
            (a.reportedAt || a.createdAt || 0)
        );

      onData(transactions);
    },
    onError
  );
}

export function subscribeToPaymentTransaction(
  invoiceId: string,
  onData: (transaction: PaymentTransaction | null) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  const paymentRef = doc(
    db,
    'clubs',
    'guanguan',
    'paymentTransaction',
    invoiceId
  );

  return onSnapshot(
    paymentRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }

      onData(
        normalizePaymentTransaction(
          snapshot.id,
          snapshot.data()
        )
      );
    },
    onError
  );
}

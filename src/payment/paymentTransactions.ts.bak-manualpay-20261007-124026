import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type FirestoreError,
  type Unsubscribe,
} from 'firebase/firestore';

import { db } from '../firebase';
import type {
  CreatePendingPaymentInput,
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

/**
 * One payment document per member per session.
 *
 * Example:
 * GG-20261007-p123456
 *
 * This prevents duplicate Pending documents when the member opens
 * the PromptPay QR more than once.
 */
export function buildPaymentInvoiceId(
  sessionDate: string,
  playerId: string
): string {
  const safeDate = sessionDate.replace(/-/g, '');
  const safePlayer = sanitizeInvoicePart(playerId) || 'PLAYER';

  return `GG-${safeDate}-${safePlayer}`;
}

/**
 * Create/refresh only a PENDING payment request.
 *
 * IMPORTANT:
 * Browser/client never sets status = "paid".
 * A trusted backend/webhook will do that later.
 */
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
    const existing = existingSnapshot.data() as any;

    // Never downgrade a confirmed payment back to pending.
    if (existing.status === 'paid') {
      return invoiceId;
    }

    await setDoc(
      paymentRef,
      {
        invoiceNo: invoiceId,
        playerId: input.playerId,
        nickname: input.nickname || '',
        sessionDate: input.sessionDate,
        amount,
        currency: 'THB',

        status: 'pending',
        paymentMethod: input.paymentMethod || 'promptpay',
        provider: '2c2p',

        transactionRef: existing.transactionRef || '',
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

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
    provider: '2c2p',

    transactionRef: '',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  return invoiceId;
}

/**
 * Realtime listener for all payment transactions.
 */
export function subscribeToPaymentTransactions(
  onData: (transactions: PaymentTransaction[]) => void,
  onError?: (error: FirestoreError) => void
): Unsubscribe {
  return onSnapshot(
    PAYMENT_COLLECTION,
    (snapshot) => {
      const transactions = snapshot.docs
        .map((item) => {
          const data = item.data() as any;

          return {
            id: item.id,
            playerId: String(data.playerId || ''),
            nickname: data.nickname
              ? String(data.nickname)
              : undefined,
            sessionDate: String(data.sessionDate || ''),
            amount: Number(data.amount || 0),
            currency: 'THB' as const,
            status: data.status || 'pending',
            paymentMethod: data.paymentMethod || 'promptpay',
            provider: data.provider || '2c2p',
            transactionRef: data.transactionRef
              ? String(data.transactionRef)
              : undefined,
            createdAt:
              typeof data.createdAt?.toMillis === 'function'
                ? data.createdAt.toMillis()
                : undefined,
            paidAt:
              typeof data.paidAt?.toMillis === 'function'
                ? data.paidAt.toMillis()
                : undefined,
          } satisfies PaymentTransaction;
        })
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      onData(transactions);
    },
    onError
  );
}

/**
 * Realtime listener for one invoice.
 * This will be used later to switch Pending -> Paid automatically
 * after the payment gateway webhook confirms the transaction.
 */
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

      const data = snapshot.data() as any;

      onData({
        id: snapshot.id,
        playerId: String(data.playerId || ''),
        nickname: data.nickname
          ? String(data.nickname)
          : undefined,
        sessionDate: String(data.sessionDate || ''),
        amount: Number(data.amount || 0),
        currency: 'THB',
        status: data.status || 'pending',
        paymentMethod: data.paymentMethod || 'promptpay',
        provider: data.provider || '2c2p',
        transactionRef: data.transactionRef
          ? String(data.transactionRef)
          : undefined,
        createdAt:
          typeof data.createdAt?.toMillis === 'function'
            ? data.createdAt.toMillis()
            : undefined,
        paidAt:
          typeof data.paidAt?.toMillis === 'function'
            ? data.paidAt.toMillis()
            : undefined,
      });
    },
    onError
  );
}

param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

$billingFile = Join-Path $ProjectPath "src\components\BillingView.tsx"
$typesFile = Join-Path $ProjectPath "src\payment\paymentTypes.ts"
$paymentFile = Join-Path $ProjectPath "src\payment\paymentTransactions.ts"
$memberActionFile = Join-Path $ProjectPath "src\components\MemberPaymentAction.tsx"
$organizerPanelFile = Join-Path $ProjectPath "src\components\OrganizerPaymentVerificationPanel.tsx"
$rulesGuideFile = Join-Path $ProjectPath "firestore-payment-rules-phase4.txt"

foreach ($file in @($billingFile, $typesFile, $paymentFile)) {
    if (-not (Test-Path $file)) {
        throw "ไม่พบไฟล์: $file"
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

Copy-Item $billingFile "$billingFile.bak-manualpay-$stamp"
Copy-Item $typesFile "$typesFile.bak-manualpay-$stamp"
Copy-Item $paymentFile "$paymentFile.bak-manualpay-$stamp"

Write-Host "Backups created:" -ForegroundColor Cyan
Write-Host "  $billingFile.bak-manualpay-$stamp"
Write-Host "  $typesFile.bak-manualpay-$stamp"
Write-Host "  $paymentFile.bak-manualpay-$stamp"
Write-Host ""

$typesCode = @'
export type PaymentStatus =
  | 'pending'
  | 'pending_verify'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export type PaymentMethod =
  | 'promptpay'
  | 'transfer'
  | 'cash';

export type PaymentProvider =
  | 'manual_promptpay'
  | '2c2p';

export interface PaymentTransaction {
  id: string;
  playerId: string;
  nickname?: string;
  sessionDate: string;
  amount: number;
  currency: 'THB';
  status: PaymentStatus;
  paymentMethod: PaymentMethod;
  provider: PaymentProvider;
  transactionRef?: string;
  createdAt?: number;
  updatedAt?: number;
  reportedAt?: number;
  paidAt?: number;
  verifiedAt?: number;
  rejectedAt?: number;
}

export interface CreatePendingPaymentInput {
  playerId: string;
  nickname?: string;
  sessionDate: string;
  amount: number;
  paymentMethod?: PaymentMethod;
}
'@

Set-Content -Path $typesFile -Value $typesCode -Encoding UTF8

$paymentCode = @'
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
'@

Set-Content -Path $paymentFile -Value $paymentCode -Encoding UTF8

$memberActionCode = @'
import React, { useEffect, useMemo, useState } from 'react';

import type { Player } from '../types';
import {
  buildPaymentInvoiceId,
  requestPaymentVerification,
  subscribeToPaymentTransaction,
} from '../payment/paymentTransactions';
import type { PaymentTransaction } from '../payment/paymentTypes';

interface MemberPaymentActionProps {
  sessionDate: string;
  player: Player;
  amount: number;
}

export const MemberPaymentAction: React.FC<MemberPaymentActionProps> = ({
  sessionDate,
  player,
  amount,
}) => {
  const invoiceId = useMemo(
    () => buildPaymentInvoiceId(sessionDate, player.id),
    [sessionDate, player.id]
  );

  const [transaction, setTransaction] =
    useState<PaymentTransaction | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    return subscribeToPaymentTransaction(
      invoiceId,
      (value) => {
        setTransaction(value);
        setLoadError('');
      },
      (error) => {
        console.error(
          '[GuanGuan Payment] Member payment listener error',
          error
        );
        setLoadError('ไม่สามารถอ่านสถานะการชำระเงินได้');
      }
    );
  }, [invoiceId]);

  const handleReportTransferred = async () => {
    if (loading) return;

    setLoading(true);

    try {
      await requestPaymentVerification(invoiceId);
    } catch (error) {
      console.error(
        '[GuanGuan Payment] Failed to request verification',
        error
      );
      window.alert(
        'แจ้งชำระเงินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loadError) {
    return (
      <div className="flex-1 rounded-xl border border-rose-700/50 bg-rose-950/30 px-4 py-3 text-center text-xs font-bold text-rose-300">
        {loadError}
      </div>
    );
  }

  if (!transaction) {
    return (
      <div className="flex-1 rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-center text-xs text-slate-400">
        กำลังเตรียมรายการชำระเงิน...
      </div>
    );
  }

  if (transaction.status === 'paid') {
    return (
      <div className="flex-1 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-center">
        <div className="text-sm font-extrabold text-emerald-300">
          ✅ ผู้จัดยืนยันการชำระเงินแล้ว
        </div>
        <div className="mt-1 text-xs text-slate-300">
          {amount.toLocaleString()} บาท
        </div>
      </div>
    );
  }

  if (transaction.status === 'pending_verify') {
    return (
      <div className="flex-1 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center">
        <div className="text-sm font-extrabold text-amber-300">
          ⏳ แจ้งชำระแล้ว
        </div>
        <div className="mt-1 text-xs text-slate-300">
          รอผู้จัดตรวจสอบยอด {amount.toLocaleString()} บาท
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleReportTransferred}
      disabled={loading}
      className="flex-1 rounded-xl bg-amber-400 px-4 py-3 text-sm font-extrabold text-slate-950 transition hover:bg-amber-300 disabled:cursor-wait disabled:opacity-60"
    >
      {loading
        ? 'กำลังแจ้งผู้จัด...'
        : `โอนเงินแล้ว • แจ้งชำระ ${amount.toLocaleString()} บาท`}
    </button>
  );
};
'@

Set-Content -Path $memberActionFile -Value $memberActionCode -Encoding UTF8

$organizerPanelCode = @'
import React, { useEffect, useRef, useState } from 'react';

import type { Player } from '../types';
import {
  confirmPaymentReceived,
  rejectPaymentVerification,
  subscribeToPaymentTransactions,
} from '../payment/paymentTransactions';
import type { PaymentTransaction } from '../payment/paymentTypes';

interface OrganizerPaymentVerificationPanelProps {
  sessionDate: string;
  players: Player[];
  onMarkPlayerPaid: (playerId: string, amount: number) => void;
}

export const OrganizerPaymentVerificationPanel: React.FC<
  OrganizerPaymentVerificationPanelProps
> = ({
  sessionDate,
  players,
  onMarkPlayerPaid,
}) => {
  const [pendingItems, setPendingItems] = useState<PaymentTransaction[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [toastItem, setToastItem] = useState<PaymentTransaction | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const knownPendingIdsRef = useRef<Set<string>>(new Set());
  const firstSnapshotRef = useRef(true);
  const audioContextRef = useRef<AudioContext | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const playPaymentSound = async () => {
    try {
      const AudioContextCtor =
        window.AudioContext ||
        (window as any).webkitAudioContext;

      if (!AudioContextCtor) return;

      let context = audioContextRef.current;

      if (!context) {
        context = new AudioContextCtor();
        audioContextRef.current = context;
      }

      if (context.state === 'suspended') {
        await context.resume();
      }

      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(
        880,
        context.currentTime
      );
      oscillator.frequency.setValueAtTime(
        1175,
        context.currentTime + 0.12
      );

      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.22,
        context.currentTime + 0.02
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        context.currentTime + 0.32
      );

      oscillator.connect(gain);
      gain.connect(context.destination);

      oscillator.start();
      oscillator.stop(context.currentTime + 0.34);
    } catch (error) {
      console.warn(
        '[GuanGuan Payment] Notification sound blocked',
        error
      );
    }
  };

  const enableSound = async () => {
    setSoundEnabled(true);
    await playPaymentSound();
  };

  useEffect(() => {
    return subscribeToPaymentTransactions(
      (transactions) => {
        const currentPending = transactions.filter(
          (item) =>
            item.sessionDate === sessionDate &&
            item.status === 'pending_verify'
        );

        const currentIds = new Set(
          currentPending.map((item) => item.id)
        );

        if (firstSnapshotRef.current) {
          firstSnapshotRef.current = false;
          knownPendingIdsRef.current = currentIds;
          setPendingItems(currentPending);
          return;
        }

        const newest = currentPending.find(
          (item) =>
            !knownPendingIdsRef.current.has(item.id)
        );

        knownPendingIdsRef.current = currentIds;
        setPendingItems(currentPending);

        if (newest) {
          setToastItem(newest);

          if (soundEnabled) {
            void playPaymentSound();
          }

          if (toastTimerRef.current) {
            window.clearTimeout(toastTimerRef.current);
          }

          toastTimerRef.current = window.setTimeout(
            () => setToastItem(null),
            7000
          );
        }
      },
      (error) => {
        console.error(
          '[GuanGuan Payment] Organizer payment listener error',
          error
        );
      }
    );
  }, [sessionDate, soundEnabled]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const playerNickname = (item: PaymentTransaction) => {
    if (item.nickname) return item.nickname;

    return (
      players.find((player) => player.id === item.playerId)
        ?.nickname || item.playerId
    );
  };

  const handleConfirm = async (
    item: PaymentTransaction
  ) => {
    if (busyId) return;

    const confirmed = window.confirm(
      `ยืนยันว่าได้รับเงินจาก "${playerNickname(item)}" ` +
        `${item.amount.toLocaleString()} บาท แล้วใช่หรือไม่?`
    );

    if (!confirmed) return;

    setBusyId(item.id);

    try {
      await confirmPaymentReceived(item.id);
      onMarkPlayerPaid(item.playerId, item.amount);
    } catch (error) {
      console.error(
        '[GuanGuan Payment] Failed to confirm payment',
        error
      );
      window.alert(
        'ยืนยันการชำระเงินไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleNotFound = async (
    item: PaymentTransaction
  ) => {
    if (busyId) return;

    const confirmed = window.confirm(
      `ยังไม่พบยอด ${item.amount.toLocaleString()} บาท ` +
        `ของ "${playerNickname(item)}" ใช่หรือไม่?\n\n` +
        'ระบบจะเปลี่ยนกลับเป็น "รอชำระ" และสมาชิกสามารถแจ้งใหม่ได้'
    );

    if (!confirmed) return;

    setBusyId(item.id);

    try {
      await rejectPaymentVerification(item.id);
    } catch (error) {
      console.error(
        '[GuanGuan Payment] Failed to reject verification',
        error
      );
      window.alert(
        'อัปเดตสถานะไม่สำเร็จ กรุณาตรวจสอบ Firestore Rules'
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {toastItem && (
        <div className="fixed right-4 top-4 z-[200] w-[min(92vw,360px)] rounded-2xl border border-amber-400/50 bg-slate-950 p-4 shadow-2xl">
          <div className="text-xs font-bold uppercase tracking-wide text-amber-300">
            🔔 มีสมาชิกแจ้งชำระเงิน
          </div>
          <div className="mt-1 text-lg font-extrabold text-white">
            {playerNickname(toastItem)}
          </div>
          <div className="text-sm font-bold text-emerald-300">
            {toastItem.amount.toLocaleString()} บาท
          </div>
        </div>
      )}

      <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-950/15 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-extrabold text-white">
                🔔 รอตรวจสอบการชำระเงิน
              </h3>
              {pendingItems.length > 0 && (
                <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-rose-500 px-2 py-0.5 text-xs font-extrabold text-white">
                  {pendingItems.length}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              สมาชิกกด “แจ้งชำระแล้ว” รายการจะขึ้นที่นี่แบบ Realtime
            </p>
          </div>

          <button
            type="button"
            onClick={enableSound}
            className={`rounded-xl border px-3 py-2 text-xs font-bold transition ${
              soundEnabled
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                : 'border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
            }`}
          >
            {soundEnabled
              ? '🔔 เสียงแจ้งเตือน: เปิด'
              : '🔕 กดเพื่อเปิดเสียง'}
          </button>
        </div>

        {pendingItems.length === 0 ? (
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-4 text-center text-xs text-slate-500">
            ยังไม่มีรายการรอตรวจสอบ
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {pendingItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-950/70 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-extrabold text-white">
                      {playerNickname(item)}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      แจ้งชำระ{' '}
                      <span className="font-bold text-emerald-300">
                        {item.amount.toLocaleString()} บาท
                      </span>
                      {item.reportedAt
                        ? ` • ${new Date(item.reportedAt).toLocaleTimeString(
                            'th-TH',
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}`
                        : ''}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => handleConfirm(item)}
                      className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-extrabold text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                    >
                      ✓ ยืนยันรับเงิน
                    </button>

                    <button
                      type="button"
                      disabled={busyId === item.id}
                      onClick={() => handleNotFound(item)}
                      className="rounded-lg border border-rose-700/50 bg-rose-950/30 px-3 py-2 text-xs font-bold text-rose-300 transition hover:bg-rose-900/40 disabled:opacity-50"
                    >
                      ✕ ยังไม่พบยอด
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};
'@

Set-Content -Path $organizerPanelFile -Value $organizerPanelCode -Encoding UTF8

$billing = Get-Content $billingFile -Raw -Encoding UTF8

$paymentImport = "import { createPendingPaymentTransaction } from '../payment/paymentTransactions';"
$memberImport = "import { MemberPaymentAction } from './MemberPaymentAction';"
$panelImport = "import { OrganizerPaymentVerificationPanel } from './OrganizerPaymentVerificationPanel';"

if ($billing -notmatch [regex]::Escape($paymentImport)) {
    throw "ไม่พบ Phase 3 payment import ใน BillingView.tsx"
}

if ($billing -notmatch [regex]::Escape($memberImport)) {
    $billing = $billing.Replace(
        $paymentImport,
        "$paymentImport`r`n$memberImport`r`n$panelImport"
    )
}

$handlerAnchor = "const handleRequestTogglePayment = (player: Player, isMarkingPaid: boolean) => {"

if ($billing -notmatch "MEMBER_PAYMENT_REPORT_V40") {
    if ($billing -notmatch [regex]::Escape($handlerAnchor)) {
        throw "ไม่พบ handleRequestTogglePayment ใน BillingView.tsx"
    }

    $handlerReplacement = @'
const handleRequestTogglePayment = (player: Player, isMarkingPaid: boolean) => {
    // MEMBER_PAYMENT_REPORT_V40
    // Member can only open PromptPay and report that they transferred.
    // Only the organizer can confirm the payment as paid.
    if (!isOrganizerMode && isMarkingPaid) {
      void handleOpenPlayerQr(player);
      return;
    }
'@

    $billing = $billing.Replace(
        $handlerAnchor,
        $handlerReplacement
    )
}

$adjustmentsAnchor = "{isOrganizerMode && onApplyBillingAdjustment && onUndoBillingAdjustment && ("

if ($billing -notmatch "ORGANIZER_PAYMENT_VERIFY_PANEL_V40") {
    if ($billing -notmatch [regex]::Escape($adjustmentsAnchor)) {
        throw "ไม่พบจุด OrganizerBillingAdjustments ใน BillingView.tsx"
    }

    $panelJsx = @'
{/* ORGANIZER_PAYMENT_VERIFY_PANEL_V40 */}
      {isOrganizerMode && (
        <OrganizerPaymentVerificationPanel
          sessionDate={sessionConfig.date}
          players={players}
          onMarkPlayerPaid={(playerId, amount) =>
            onTogglePlayerPayment(playerId, true, amount)
          }
        />
      )}

      {isOrganizerMode && onApplyBillingAdjustment && onUndoBillingAdjustment && (
'@

    $billing = $billing.Replace(
        $adjustmentsAnchor,
        $panelJsx
    )
}

if ($billing -notmatch "MemberPaymentAction\s+sessionDate") {
    $memberOldPattern = '(?s)\) : selectedPlayerForQr && !selectedPlayerForQr\.paid && !selectedPlayerForQr\.isCheckedIn \? \(\s*<button.*?<span>โอนเงินแล้ว ยืนยันชำระ \(รหัส 4 หลัก\)</span>\s*</button>\s*\) : null}'

    $matches = [regex]::Matches($billing, $memberOldPattern)

    if ($matches.Count -ne 1) {
        throw "หา Member QR action แบบเดิมไม่เจอชัดเจน (พบ $($matches.Count) จุด)"
    }

    $memberNew = @'
) : selectedPlayerForQr && !selectedPlayerForQr.isCheckedIn ? (
                <MemberPaymentAction
                  sessionDate={sessionConfig.date}
                  player={selectedPlayerForQr}
                  amount={calculatePlayerCost(selectedPlayerForQr)}
                />
              ) : null}
'@

    $billing = [regex]::Replace(
        $billing,
        $memberOldPattern,
        $memberNew,
        1
    )
}

Set-Content -Path $billingFile -Value $billing -Encoding UTF8

$rulesGuide = @'
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isOrganizer() {
      return request.auth != null
        && request.auth.uid == 'DWpEIuKxqRTBptDKqM4FIKjMPmf1';
    }

    match /clubs/guanguan/runtime/currentSession {
      allow read, write: if request.auth != null;
    }

    match /clubs/guanguan/archives/{archiveId} {
      allow read, write: if request.auth != null;
    }

    match /clubs/guanguan/fundTransactions/{transactionId} {
      allow read, write: if request.auth != null;
    }

    match /clubs/guanguan/paymentTransaction/{paymentId} {
      allow get: if request.auth != null;
      allow list: if isOrganizer();

      allow create: if
        request.auth != null
        && request.resource.data.status == 'pending'
        && request.resource.data.paymentMethod == 'promptpay'
        && request.resource.data.provider == 'manual_promptpay'
        && request.resource.data.amount is number
        && request.resource.data.amount > 0
        && request.resource.data.playerId is string
        && request.resource.data.sessionDate is string;

      allow update: if
        isOrganizer()
        || (
          request.auth != null
          && resource.data.status == 'pending'
          && request.resource.data.status == 'pending_verify'
          && request.resource.data.playerId == resource.data.playerId
          && request.resource.data.sessionDate == resource.data.sessionDate
          && request.resource.data.amount == resource.data.amount
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
            'status',
            'reportedAt',
            'updatedAt'
          ])
        );

      allow delete: if false;
    }
  }
}
'@

Set-Content -Path $rulesGuideFile -Value $rulesGuide -Encoding UTF8

Write-Host ""
Write-Host "Phase 4 Manual PromptPay applied successfully." -ForegroundColor Green
Write-Host ""
Write-Host "Created/updated:" -ForegroundColor Yellow
Write-Host "  src\payment\paymentTypes.ts"
Write-Host "  src\payment\paymentTransactions.ts"
Write-Host "  src\components\MemberPaymentAction.tsx"
Write-Host "  src\components\OrganizerPaymentVerificationPanel.tsx"
Write-Host "  src\components\BillingView.tsx"
Write-Host "  firestore-payment-rules-phase4.txt"
Write-Host ""
Write-Host "IMPORTANT:" -ForegroundColor Magenta
Write-Host "  Copy firestore-payment-rules-phase4.txt into Firebase Console > Firestore > Rules"
Write-Host "  Then click Publish."
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  cd `"$ProjectPath`""
Write-Host "  npm run build"
Write-Host "  npm run dev"

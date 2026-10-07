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

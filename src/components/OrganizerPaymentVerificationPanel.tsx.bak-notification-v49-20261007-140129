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

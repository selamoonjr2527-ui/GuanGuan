import React, { useEffect, useRef, useState } from 'react';
import type { Player } from '../types';
import { subscribeToPaymentTransactions } from '../payment/paymentTransactions';
import type { PaymentTransaction } from '../payment/paymentTypes';

type AlertKind =
  | 'checkin'
  | 'checkout'
  | 'pause'
  | 'resume'
  | 'payment_reported'
  | 'payment_paid'
  | 'stop_after_match';

interface OrganizerGlobalAlertCenterProps {
  players: Player[];
  sessionDate: string;
  isOrganizerMode: boolean;
}

interface AlertItem {
  id: string;
  kind: AlertKind;
  title: string;
  message: string;
  nickname?: string;
  createdAt: number;
}

interface PlayerSnapshot {
  isCheckedIn: boolean;
  status?: string;
  paid: boolean;
  stopRequestedAt: number;
  stopAfterCurrentMatch: boolean;
}

const SOUND_KEY = 'guanguan_global_alert_sound_enabled_v52c';
const MAX_ALERTS = 8;

const getIcon = (kind: AlertKind): string => {
  switch (kind) {
    case 'checkin': return '✅';
    case 'checkout': return '🚪';
    case 'pause': return '☕';
    case 'resume': return '▶️';
    case 'payment_reported': return '💰';
    case 'payment_paid': return '✅💵';
    case 'stop_after_match': return '🏸';
    default: return '🔔';
  }
};

const getCardClass = (kind: AlertKind): string => {
  switch (kind) {
    case 'payment_reported':
      return 'border-amber-500/60 bg-amber-950/95';
    case 'payment_paid':
    case 'checkin':
      return 'border-emerald-500/60 bg-emerald-950/95';
    case 'checkout':
    case 'stop_after_match':
      return 'border-rose-500/60 bg-rose-950/95';
    case 'pause':
      return 'border-orange-500/60 bg-orange-950/95';
    case 'resume':
      return 'border-cyan-500/60 bg-cyan-950/95';
    default:
      return 'border-slate-600 bg-slate-950/95';
  }
};

export const OrganizerGlobalAlertCenter: React.FC<OrganizerGlobalAlertCenterProps> = ({
  players,
  sessionDate,
  isOrganizerMode,
}) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(SOUND_KEY) !== '0';
  });
  const [audioReady, setAudioReady] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const previousPlayersRef = useRef<Map<string, PlayerSnapshot>>(new Map());
  const playersInitializedRef = useRef(false);
  const paymentInitializedRef = useRef(false);
  const knownPendingPaymentIdsRef = useRef<Set<string>>(new Set());
  const recentEventRef = useRef<Map<string, number>>(new Map());

  const ensureAudioReady = async (): Promise<AudioContext | null> => {
    try {
      const AudioContextCtor =
        window.AudioContext || (window as any).webkitAudioContext;

      if (!AudioContextCtor) return null;

      let context = audioContextRef.current;
      if (!context) {
        context = new AudioContextCtor();
        audioContextRef.current = context;
      }

      if (context.state === 'suspended') {
        await context.resume();
      }

      if (context.state === 'running') {
        setAudioReady(true);
      }

      return context;
    } catch (error) {
      console.warn('[GuanGuan Alert] Audio unlock failed', error);
      return null;
    }
  };

  const playLoudAlert = async (kind: AlertKind) => {
    if (!soundEnabled) return;

    const context = await ensureAudioReady();
    if (!context || context.state !== 'running') return;

    try {
      const master = context.createGain();
      const compressor = context.createDynamicsCompressor();

      master.gain.setValueAtTime(1.0, context.currentTime);
      compressor.threshold.setValueAtTime(-20, context.currentTime);
      compressor.knee.setValueAtTime(16, context.currentTime);
      compressor.ratio.setValueAtTime(10, context.currentTime);
      compressor.attack.setValueAtTime(0.002, context.currentTime);
      compressor.release.setValueAtTime(0.2, context.currentTime);

      master.connect(compressor);
      compressor.connect(context.destination);

      const patterns: Record<AlertKind, number[]> = {
        checkin: [880, 1180, 1480],
        checkout: [980, 720, 520],
        pause: [760, 620, 760],
        resume: [620, 820, 1120],
        payment_reported: [1040, 1320, 1640, 1320, 1640],
        payment_paid: [900, 1200, 1560],
        stop_after_match: [940, 700, 500, 700],
      };

      const now = context.currentTime;
      patterns[kind].forEach((frequency, index) => {
        const start = now + index * 0.20;
        const duration = kind === 'payment_reported' ? 0.24 : 0.20;

        [0, 1].forEach((layer) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();

          oscillator.type = layer === 0 ? 'square' : 'sine';
          oscillator.frequency.setValueAtTime(
            frequency + (layer === 1 ? 10 : 0),
            start
          );

          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(
            layer === 0 ? 0.30 : 0.20,
            start + 0.015
          );
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

          oscillator.connect(gain);
          gain.connect(master);
          oscillator.start(start);
          oscillator.stop(start + duration + 0.03);
        });
      });

      if ('vibrate' in navigator) {
        navigator.vibrate(
          kind === 'payment_reported'
            ? [250, 80, 250, 80, 350]
            : [180, 70, 180]
        );
      }

      window.setTimeout(() => {
        try {
          master.disconnect();
          compressor.disconnect();
        } catch {}
      }, 1800);
    } catch (error) {
      console.warn('[GuanGuan Alert] Unable to play alert sound', error);
    }
  };

  const maybeShowSystemNotification = (title: string, message: string) => {
    try {
      if (
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted' &&
        document.visibilityState !== 'visible'
      ) {
        new Notification(title, {
          body: message,
          tag: `guanguan-${Date.now()}`,
        });
      }
    } catch {}
  };

  const pushAlert = (
    kind: AlertKind,
    title: string,
    message: string,
    nickname?: string,
    dedupeKey?: string
  ) => {
    const now = Date.now();
    const key = dedupeKey || `${kind}:${nickname || ''}:${message}`;
    const last = recentEventRef.current.get(key) || 0;

    if (now - last < 5000) return;

    recentEventRef.current.set(key, now);

    for (const [oldKey, oldTime] of recentEventRef.current.entries()) {
      if (now - oldTime > 60000) {
        recentEventRef.current.delete(oldKey);
      }
    }

    const item: AlertItem = {
      id: `${kind}-${now}-${Math.random().toString(36).slice(2, 7)}`,
      kind,
      title,
      message,
      nickname,
      createdAt: now,
    };

    setAlerts((prev) => [item, ...prev].slice(0, MAX_ALERTS));
    void playLoudAlert(kind);

    maybeShowSystemNotification(
      `${getIcon(kind)} ${title}`,
      nickname ? `${nickname} • ${message}` : message
    );
  };

  useEffect(() => {
    if (!isOrganizerMode || !soundEnabled || typeof window === 'undefined') return;

    const unlock = () => {
      void ensureAudioReady();
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('touchstart', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [isOrganizerMode, soundEnabled]);

  useEffect(() => {
    if (!isOrganizerMode) {
      playersInitializedRef.current = false;
      previousPlayersRef.current = new Map();
      return;
    }

    const current = new Map<string, PlayerSnapshot>();

    players.forEach((player: any) => {
      current.set(player.id, {
        isCheckedIn: Boolean(player.isCheckedIn),
        status: player.status,
        paid: Boolean(player.paid),
        stopRequestedAt: Number(player.stopRequestedAt || 0),
        stopAfterCurrentMatch: Boolean(player.stopAfterCurrentMatch),
      });
    });

    if (!playersInitializedRef.current) {
      previousPlayersRef.current = current;
      playersInitializedRef.current = true;
      return;
    }

    players.forEach((player: any) => {
      const prev = previousPlayersRef.current.get(player.id);
      if (!prev) return;

      const nowCheckedIn = Boolean(player.isCheckedIn);
      const nowPaid = Boolean(player.paid);
      const nowStatus = String(player.status || '');
      const stopRequestedAt = Number(player.stopRequestedAt || 0);

      if (!prev.isCheckedIn && nowCheckedIn) {
        pushAlert('checkin', 'สมาชิก Check-in', 'เข้ารายชื่อผู้เล่นแล้ว', player.nickname, `checkin:${player.id}`);
      }

      if (prev.isCheckedIn && !nowCheckedIn) {
        pushAlert('checkout', 'สมาชิก Check-out', 'เลิกเล่นและออกจากคิวแล้ว', player.nickname, `checkout:${player.id}`);
      }

      if (prev.status !== nowStatus && nowStatus === 'resting' && nowCheckedIn) {
        pushAlert('pause', 'สมาชิกกดพัก', 'พักชั่วคราวและออกจากคิวรอเล่น', player.nickname, `pause:${player.id}`);
      }

      if (prev.status === 'resting' && nowStatus === 'waiting' && nowCheckedIn) {
        pushAlert('resume', 'สมาชิกกลับมาเล่น', 'กลับเข้าสู่คิวรอเล่นแล้ว', player.nickname, `resume:${player.id}`);
      }

      if (!prev.paid && nowPaid) {
        pushAlert(
          'payment_paid',
          'ยืนยันรับเงินแล้ว',
          `${Number(player.paidAmount || 0).toLocaleString()} บาท`,
          player.nickname,
          `paid:${player.id}`
        );
      }

      if (
        stopRequestedAt > prev.stopRequestedAt &&
        Boolean(player.stopAfterCurrentMatch)
      ) {
        pushAlert(
          'stop_after_match',
          'สมาชิกขอเลิกหลัง Match',
          'ให้ Check-out หลัง Match ปัจจุบันจบ',
          player.nickname,
          `stop:${player.id}:${stopRequestedAt}`
        );
      }
    });

    previousPlayersRef.current = current;
  }, [players, isOrganizerMode]);

  useEffect(() => {
    if (!isOrganizerMode) {
      paymentInitializedRef.current = false;
      knownPendingPaymentIdsRef.current = new Set();
      return;
    }

    return subscribeToPaymentTransactions(
      (transactions: PaymentTransaction[]) => {
        const currentPending = transactions.filter(
          (item) =>
            item.sessionDate === sessionDate &&
            item.status === 'pending_verify'
        );

        const ids = new Set(currentPending.map((item) => item.id));

        if (!paymentInitializedRef.current) {
          knownPendingPaymentIdsRef.current = ids;
          paymentInitializedRef.current = true;
          return;
        }

        currentPending.forEach((item) => {
          if (knownPendingPaymentIdsRef.current.has(item.id)) return;

          const player = players.find((p) => p.id === item.playerId);

          pushAlert(
            'payment_reported',
            'รอตรวจชำระ',
            `สมาชิกแจ้งชำระ ${Number(item.amount || 0).toLocaleString()} บาท`,
            player?.nickname || item.playerId,
            `payment:${item.id}`
          );
        });

        knownPendingPaymentIdsRef.current = ids;
      },
      (error) => {
        console.error('[GuanGuan Alert] Global payment listener error', error);
      }
    );
  }, [isOrganizerMode, sessionDate, players]);

  if (!isOrganizerMode) return null;

  return (
    <>
      {/* ORGANIZER_GLOBAL_ALERT_CENTER_V52C */}
      {soundEnabled && !audioReady && (
        <button
          type="button"
          onClick={async () => {
            await ensureAudioReady();

            try {
              if (
                typeof Notification !== 'undefined' &&
                Notification.permission === 'default'
              ) {
                await Notification.requestPermission();
              }
            } catch {}
          }}
          className="fixed left-1/2 top-3 z-[120] -translate-x-1/2 rounded-xl border border-amber-400/60 bg-amber-950/95 px-4 py-2.5 text-xs font-black text-amber-200 shadow-2xl"
        >
          🔊 แตะ 1 ครั้งเพื่อเปิดเสียง Alert ของผู้จัด
        </button>
      )}

      <div className="fixed bottom-4 right-4 z-[115] flex w-[min(94vw,390px)] flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          {alerts.length > 0 && (
            <button
              type="button"
              onClick={() => setAlerts([])}
              className="rounded-lg border border-slate-700 bg-slate-900/95 px-2.5 py-2 text-[10px] font-bold text-slate-300 shadow-lg hover:bg-slate-800"
            >
              ล้าง Alert ({alerts.length})
            </button>
          )}

          <button
            type="button"
            onClick={async () => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              localStorage.setItem(SOUND_KEY, next ? '1' : '0');

              if (next) {
                await ensureAudioReady();
                void playLoudAlert('checkin');

                try {
                  if (
                    typeof Notification !== 'undefined' &&
                    Notification.permission === 'default'
                  ) {
                    await Notification.requestPermission();
                  }
                } catch {}
              }
            }}
            className={`rounded-xl border px-3 py-2 text-[11px] font-black shadow-lg transition ${
              soundEnabled
                ? 'border-emerald-500/50 bg-slate-900/95 text-emerald-300'
                : 'border-slate-700 bg-slate-900/95 text-slate-400'
            }`}
          >
            {soundEnabled
              ? audioReady
                ? '🔊 Alert: ON / ดัง'
                : '🔊 Alert: ON / รอ Unlock'
              : '🔇 Alert: OFF'}
          </button>
        </div>

        {alerts.map((alert) => (
          <div
            key={alert.id}
            className={`w-full rounded-2xl border p-4 shadow-2xl backdrop-blur ${getCardClass(alert.kind)}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-black text-white">
                  {getIcon(alert.kind)} {alert.title}
                </div>

                {alert.nickname && (
                  <div className="mt-1 truncate text-base font-black text-white">
                    {alert.nickname}
                  </div>
                )}

                <div className="mt-1 text-xs text-slate-200">
                  {alert.message}
                </div>

                <div className="mt-1.5 text-[10px] text-slate-400">
                  {new Date(alert.createdAt).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  setAlerts((prev) =>
                    prev.filter((item) => item.id !== alert.id)
                  )
                }
                className="shrink-0 rounded-lg bg-slate-950/50 px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:bg-slate-900"
              >
                รับทราบ
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
};


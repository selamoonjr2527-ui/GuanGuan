import React, { useEffect, useRef, useState } from 'react';
import type { Player } from '../types';

interface OrganizerMemberStopNotificationProps {
  players: Player[];
  isOrganizerMode: boolean;
}

interface StopAlert {
  key: string;
  nickname: string;
  message: string;
  requestedAt: number;
}

const STORAGE_KEY = 'guanguan_organizer_stop_alert_seen_v49';
const SOUND_KEY = 'guanguan_organizer_stop_sound_enabled';

const readSeen = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const markSeen = (key: string, value: number) => {
  try {
    const next = readSeen();
    next[key] = value;

    // Keep the storage small.
    const entries = Object.entries(next)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 150);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // LocalStorage is only a convenience layer.
  }
};

const playStopSound = async () => {
  try {
    const AudioContextCtor =
      window.AudioContext || (window as any).webkitAudioContext;

    if (!AudioContextCtor) return;

    const ctx = new AudioContextCtor();

    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    const beep = (start: number, frequency: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.24, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration + 0.03);
    };

    // Lower descending alert = different from payment notification.
    beep(now, 980, 0.18);
    beep(now + 0.24, 760, 0.18);
    beep(now + 0.48, 560, 0.30);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1200);
  } catch {
    // Browser may block sound before first user gesture.
  }
};

export const OrganizerMemberStopNotification: React.FC<
  OrganizerMemberStopNotificationProps
> = ({ players, isOrganizerMode }) => {
  const [alert, setAlert] = useState<StopAlert | null>(null);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem(SOUND_KEY) !== '0';
  });

  const initializedRef = useRef(false);
  const lastSeenRef = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!isOrganizerMode || typeof window === 'undefined') {
      initializedRef.current = false;
      return;
    }

    const stored = readSeen();
    lastSeenRef.current = stored;

    if (!initializedRef.current) {
      // First organizer snapshot = establish baseline only.
      // Do not alert for old stop requests when opening the page.
      players.forEach((player: any) => {
        const requestedAt = Number(player.stopRequestedAt || 0);
        if (requestedAt > 0) {
          const key = `${player.id}:${requestedAt}`;
          lastSeenRef.current[key] = requestedAt;
          markSeen(key, requestedAt);
        }
      });

      initializedRef.current = true;
      return;
    }

    const newest = players
      .map((player: any) => {
        const requestedAt = Number(player.stopRequestedAt || 0);
        if (!requestedAt) return null;

        const key = `${player.id}:${requestedAt}`;
        if (lastSeenRef.current[key]) return null;

        const stopAfterMatch = Boolean(player.stopAfterCurrentMatch);

        return {
          key,
          nickname: player.nickname || player.id,
          requestedAt,
          message: stopAfterMatch
            ? 'ขอเลิกเล่นหลังจบ Match ปัจจุบัน'
            : 'เลิกเล่น / ออกจากคิวแล้ว',
        } satisfies StopAlert;
      })
      .filter(Boolean)
      .sort((a: any, b: any) => b.requestedAt - a.requestedAt)[0] as
      | StopAlert
      | undefined;

    if (!newest) return;

    lastSeenRef.current[newest.key] = newest.requestedAt;
    markSeen(newest.key, newest.requestedAt);
    setAlert(newest);

    if (soundEnabled) {
      void playStopSound();
    }
  }, [players, isOrganizerMode, soundEnabled]);

  // Unlock WebAudio on first organizer gesture while sound is ON.
  useEffect(() => {
    if (!isOrganizerMode || !soundEnabled || typeof window === 'undefined') {
      return;
    }

    const unlock = () => {
      void playStopSound();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [isOrganizerMode, soundEnabled]);

  if (!isOrganizerMode) return null;

  return (
    <>
      {/* MEMBER_STOP_NOTIFICATION_V49 */}
      <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => {
            const next = !soundEnabled;
            setSoundEnabled(next);
            localStorage.setItem(SOUND_KEY, next ? '1' : '0');
            if (next) void playStopSound();
          }}
          className={`rounded-xl border px-3 py-2 text-[11px] font-bold shadow-lg transition ${
            soundEnabled
              ? 'border-emerald-500/40 bg-slate-900 text-emerald-300'
              : 'border-slate-700 bg-slate-900 text-slate-400'
          }`}
          title="เสียงแจ้งเตือนเมื่อสมาชิกกดเลิกเล่น"
        >
          {soundEnabled ? '🔔 Stop Alert: เปิด' : '🔕 Stop Alert: ปิด'}
        </button>

        {alert && (
          <div className="w-[min(92vw,360px)] rounded-2xl border border-rose-500/50 bg-slate-950/95 p-4 shadow-2xl backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-black text-rose-300">
                  🏸 สมาชิกแจ้งเลิกเล่น
                </div>
                <div className="mt-1 text-base font-black text-white">
                  {alert.nickname}
                </div>
                <div className="mt-1 text-xs text-slate-300">
                  {alert.message}
                </div>
                <div className="mt-1 text-[10px] text-slate-500">
                  {new Date(alert.requestedAt).toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setAlert(null)}
                className="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-700"
              >
                รับทราบ
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

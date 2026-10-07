const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.tsx');
const componentPath = path.join(root, 'src', 'components', 'MemberPlayNotification.tsx');

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

if (!fs.existsSync(appPath)) {
  fail('ไม่พบ src\\App.tsx');
}

let app = fs.readFileSync(appPath, 'utf8');

if (
  app.includes('MEMBER_PLAY_NOTIFICATION_V33') &&
  fs.existsSync(componentPath)
) {
  console.log('✅ V33 เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

const component = `import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, CheckCircle2, Volume2, X } from 'lucide-react';
import { ActiveMatch, ConfirmedPreMatch, Player } from '../types';

interface MemberPlayNotificationProps {
  currentMemberId?: string | null;
  players: Player[];
  activeMatches: ActiveMatch[];
  confirmedPreMatch?: ConfirmedPreMatch | null;
  confirmedPreMatch2?: ConfirmedPreMatch | null;
  isOrganizerMode?: boolean;
}

type AlertState =
  | {
      kind: 'prematch' | 'court';
      title: string;
      body: string;
      key: string;
    }
  | null;

const ENABLE_KEY = 'guanguan_member_notifications_enabled';

const seenKeyFor = (memberId: string) =>
  \`guanguan_member_alert_seen_\${memberId}\`;

const loadSeen = (memberId: string): string[] => {
  if (typeof window === 'undefined' || !memberId) return [];
  try {
    const raw = localStorage.getItem(seenKeyFor(memberId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const markSeen = (memberId: string, key: string) => {
  if (typeof window === 'undefined' || !memberId || !key) return;
  try {
    const next = Array.from(new Set([...loadSeen(memberId), key])).slice(-60);
    localStorage.setItem(seenKeyFor(memberId), JSON.stringify(next));
  } catch {
    // Ignore localStorage errors.
  }
};

const vibrate = () => {
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([250, 100, 250, 100, 500]);
    }
  } catch {
    // Ignore vibration errors.
  }
};

const playAlertSound = () => {
  try {
    const AudioContextClass =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    const beep = (start: number, frequency: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, start);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.28, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(start + duration + 0.03);
    };

    beep(now, 880, 0.16);
    beep(now + 0.22, 1040, 0.16);
    beep(now + 0.44, 1320, 0.30);

    window.setTimeout(() => {
      void ctx.close().catch(() => undefined);
    }, 1200);
  } catch {
    // Browsers may block audio until a user gesture. The in-app alert still works.
  }
};

const showBrowserNotification = async (
  title: string,
  body: string,
  tag: string
) => {
  try {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    const registration = await navigator.serviceWorker?.getRegistration();

    if (registration) {
      await registration.showNotification(title, {
        body,
        icon: '/icons/pwa-192x192.png',
        badge: '/icons/favicon-64x64.png',
        tag,
        renotify: true,
        requireInteraction: true,
        data: {
          url: window.location.href,
        },
      } as NotificationOptions);
      return;
    }

    new Notification(title, {
      body,
      icon: '/icons/pwa-192x192.png',
      tag,
      requireInteraction: true,
    } as NotificationOptions);
  } catch (error) {
    console.warn('Browser notification failed', error);
  }
};

export const MemberPlayNotification: React.FC<MemberPlayNotificationProps> = ({
  currentMemberId,
  players,
  activeMatches,
  confirmedPreMatch,
  confirmedPreMatch2,
  isOrganizerMode = false,
}) => {
  const [enabled, setEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(ENABLE_KEY) === '1';
  });
  const [alert, setAlert] = useState<AlertState>(null);
  const [permission, setPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  });

  const lastDetectedRef = useRef<string>('');

  const currentPlayer = useMemo(
    () => players.find((p) => p.id === currentMemberId),
    [players, currentMemberId]
  );

  const preMatchInfo = useMemo(() => {
    if (!currentMemberId) return null;

    const inSlot = (pm?: ConfirmedPreMatch | null) =>
      Boolean(
        pm &&
          [...(pm.teamA || []), ...(pm.teamB || [])].includes(currentMemberId)
      );

    if (inSlot(confirmedPreMatch)) {
      return { slot: 1 as const, match: confirmedPreMatch! };
    }

    if (inSlot(confirmedPreMatch2)) {
      return { slot: 2 as const, match: confirmedPreMatch2! };
    }

    return null;
  }, [currentMemberId, confirmedPreMatch, confirmedPreMatch2]);

  const activeMatch = useMemo(() => {
    if (!currentMemberId) return undefined;
    return activeMatches.find((m) =>
      [...(m.teamA || []), ...(m.teamB || [])].includes(currentMemberId)
    );
  }, [activeMatches, currentMemberId]);

  const fireAlert = async (
    kind: 'prematch' | 'court',
    key: string,
    title: string,
    body: string
  ) => {
    if (!currentMemberId || !enabled) return;

    const seen = loadSeen(currentMemberId);
    if (seen.includes(key)) return;

    markSeen(currentMemberId, key);
    setAlert({ kind, key, title, body });

    vibrate();
    playAlertSound();
    await showBrowserNotification(title, body, key);
  };

  useEffect(() => {
    if (!currentMemberId || !currentPlayer || isOrganizerMode || !enabled) return;

    // Highest priority: the member has actually been sent onto a court.
    if (activeMatch) {
      const key = \`court:\${activeMatch.id}:\${currentMemberId}\`;

      if (lastDetectedRef.current !== key) {
        lastDetectedRef.current = key;
        void fireAlert(
          'court',
          key,
          '🏸 ถึงคิวแล้ว! ลงสนามได้เลย',
          \`\${currentPlayer.nickname} → \${activeMatch.courtName || 'สนาม'} • เตรียมไม้แล้วลงสนามได้เลย\`
        );
      }
      return;
    }

    // Second priority: confirmed pre-match, so the member should warm up.
    if (preMatchInfo) {
      const confirmedAt = Number((preMatchInfo.match as any).confirmedAt || 0);
      const teamKey = [
        ...(preMatchInfo.match.teamA || []),
        ...(preMatchInfo.match.teamB || []),
      ].join('-');
      const key = \`prematch:\${preMatchInfo.slot}:\${confirmedAt || teamKey}:\${currentMemberId}\`;

      if (lastDetectedRef.current !== key) {
        lastDetectedRef.current = key;
        void fireAlert(
          'prematch',
          key,
          '🔔 เตรียมตัว! ใกล้ถึงคิวแล้ว',
          \`\${currentPlayer.nickname} อยู่ Pre-Match \${preMatchInfo.slot} • วอร์มร่างกาย เตรียมไม้ พร้อมลงสนาม\`
        );
      }
      return;
    }

    lastDetectedRef.current = '';
  }, [
    currentMemberId,
    currentPlayer,
    isOrganizerMode,
    enabled,
    activeMatch,
    preMatchInfo,
  ]);

  const enableNotifications = async () => {
    localStorage.setItem(ENABLE_KEY, '1');
    setEnabled(true);

    // User gesture here is useful for unlocking sound on mobile browsers.
    playAlertSound();
    vibrate();

    if (!('Notification' in window)) {
      setPermission('unsupported');
      setAlert({
        kind: 'prematch',
        key: 'enabled-local',
        title: '🔔 เปิดแจ้งเตือนในแอปแล้ว',
        body: 'เครื่องนี้จะใช้เสียง สั่น และ Popup ในแอป เมื่อใกล้ถึงคิว',
      });
      return;
    }

    try {
      const result = await Notification.requestPermission();
      setPermission(result);

      setAlert({
        kind: 'prematch',
        key: 'enabled',
        title:
          result === 'granted'
            ? '✅ เปิดแจ้งเตือนเรียบร้อย'
            : '🔔 เปิดแจ้งเตือนในแอปแล้ว',
        body:
          result === 'granted'
            ? 'เมื่อถึง Pre-Match หรือถูกส่งลงสนาม ระบบจะแจ้งเตือนให้ทันที'
            : 'Browser Notification ยังไม่ได้รับอนุญาต แต่เสียง/สั่น/Popup ในแอปยังทำงาน',
      });
    } catch {
      setAlert({
        kind: 'prematch',
        key: 'enabled-fallback',
        title: '🔔 เปิดแจ้งเตือนในแอปแล้ว',
        body: 'เสียง สั่น และ Popup ในแอปพร้อมใช้งาน',
      });
    }
  };

  if (isOrganizerMode || !currentMemberId || !currentPlayer) return null;

  return (
    <>
      {/* MEMBER_PLAY_NOTIFICATION_V33 */}
      {!enabled && (
        <button
          type="button"
          onClick={enableNotifications}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-2xl border border-amber-400/50 bg-amber-500 px-4 py-3 text-xs font-extrabold text-slate-950 shadow-2xl hover:bg-amber-400"
        >
          <BellRing className="w-4 h-4" />
          เปิดแจ้งเตือนคิวของฉัน
        </button>
      )}

      {enabled && permission !== 'granted' && (
        <button
          type="button"
          onClick={enableNotifications}
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-900/95 px-3 py-2 text-[11px] font-bold text-amber-300 shadow-xl"
          title="ระบบเสียง/สั่นในแอปเปิดอยู่ กดเพื่อขอ Browser Notification อีกครั้ง"
        >
          <Bell className="w-3.5 h-3.5" />
          แจ้งเตือนในแอปเปิดอยู่
        </button>
      )}

      {alert && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
          <div
            className={\`w-full max-w-sm rounded-3xl border p-5 shadow-2xl \${
              alert.kind === 'court'
                ? 'bg-emerald-950 border-emerald-500/70'
                : 'bg-amber-950 border-amber-500/70'
            }\`}
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={\`w-12 h-12 rounded-2xl flex items-center justify-center \${
                  alert.kind === 'court'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-amber-500/20 text-amber-300'
                }\`}
              >
                {alert.kind === 'court' ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : (
                  <BellRing className="w-7 h-7" />
                )}
              </div>

              <button
                type="button"
                onClick={() => setAlert(null)}
                className="rounded-xl bg-slate-900/70 p-2 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 text-xl font-black text-white">
              {alert.title}
            </div>
            <div className="mt-2 text-sm leading-relaxed text-slate-200">
              {alert.body}
            </div>

            <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-950/40 px-3 py-2 text-[11px] text-slate-300">
              <Volume2 className="w-4 h-4 text-cyan-300" />
              เสียง + สั่น + Browser Notification
            </div>

            <button
              type="button"
              onClick={() => setAlert(null)}
              className={\`mt-4 w-full rounded-xl py-3 text-sm font-extrabold text-slate-950 \${
                alert.kind === 'court'
                  ? 'bg-emerald-400 hover:bg-emerald-300'
                  : 'bg-amber-400 hover:bg-amber-300'
              }\`}
            >
              {alert.kind === 'court' ? '🏸 พร้อมลงสนาม!' : '👍 รับทราบ กำลังวอร์ม'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};
`;

if (!app.includes("from './components/MemberPlayNotification'")) {
  const importAnchor =
    /import\s+\{\s*MemberAccessBar\s*\}\s+from\s+'\.\/components\/MemberAccessBar';\s*\r?\n/;

  if (!importAnchor.test(app)) {
    fail(
      'App.tsx: หา import MemberAccessBar ไม่เจอ',
      'รัน: findstr /n /i "MemberAccessBar" src\\App.tsx'
    );
  }

  app = app.replace(
    importAnchor,
    (m) => m + "import { MemberPlayNotification } from './components/MemberPlayNotification';\n"
  );
}

if (!app.includes('<MemberPlayNotification')) {
  // Insert just before the Pre-Match view. This anchor has been stable across
  // the recent app versions and keeps the alert mounted for all tabs.
  const renderAnchor =
    /(\s*\{currentTab\s*===\s*'prematch'\s*&&\s*\()/m;

  if (!renderAnchor.test(app)) {
    fail(
      'App.tsx: หา currentTab === prematch ไม่เจอ',
      'รัน: findstr /n /i "currentTab prematch" src\\App.tsx'
    );
  }

  const render = `
        {/* MEMBER_PLAY_NOTIFICATION_V33 */}
        <MemberPlayNotification
          currentMemberId={currentMemberId}
          players={players}
          activeMatches={activeMatches}
          confirmedPreMatch={appState.confirmedPreMatch}
          confirmedPreMatch2={appState.confirmedPreMatch2}
          isOrganizerMode={isOrganizerMode}
        />

`;

  app = app.replace(renderAnchor, `${render}$1`);
}

const checks = [
  [
    'App imports MemberPlayNotification',
    app.includes("MemberPlayNotification")
  ],
  [
    'App mounts notification component',
    app.includes('<MemberPlayNotification')
  ],
  [
    'Component watches Pre-Match',
    component.includes('confirmedPreMatch2')
  ],
  [
    'Component watches Active Match',
    component.includes('activeMatches.find')
  ],
  [
    'Browser Notification included',
    component.includes('showNotification')
  ],
  [
    'Sound included',
    component.includes('AudioContext')
  ],
  [
    'Vibration included',
    component.includes('navigator.vibrate')
  ],
  [
    'Duplicate alert prevention included',
    component.includes('markSeen')
  ],
];

console.log('');
console.log('=== PRE-WRITE VERIFY V33 ===');
let ok = true;

for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

if (!ok) fail('Verify ไม่ผ่าน');

const appBak = appPath + '.bak-member-notification-v33';
if (!fs.existsSync(appBak)) {
  fs.copyFileSync(appPath, appBak);
  console.log('Backup:', appBak);
}

fs.writeFileSync(componentPath, component, 'utf8');
fs.writeFileSync(appPath, app, 'utf8');

console.log('');
console.log('✅ V33 สำเร็จ — Member Play Notification');
console.log('');
console.log('ความสามารถ:');
console.log('  • สมาชิกกดเปิดแจ้งเตือน 1 ครั้ง');
console.log('  • เข้า Pre-Match -> เตือนให้วอร์ม');
console.log('  • ถูกส่งลง Court -> เตือน "ถึงคิวแล้ว"');
console.log('  • Popup ใหญ่ในแอป');
console.log('  • Browser/PWA Notification');
console.log('  • เสียงแจ้งเตือน');
console.log('  • สั่นบนมือถือที่รองรับ');
console.log('  • ป้องกันแจ้งซ้ำ Match เดิม');
console.log('  • Organizer ไม่เห็น Popup ของสมาชิก');
console.log('');
console.log('หมายเหตุ: ถ้าปิด App/Browser แบบปิดสนิท การแจ้งเตือนจาก Firestore จะไม่ทำงาน');
console.log('กรณีนั้นต้องใช้ Firebase Cloud Messaging (Push) เพิ่มอีกชั้น');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');

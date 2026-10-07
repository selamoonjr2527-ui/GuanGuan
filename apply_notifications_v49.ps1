param(
    [string]$ProjectPath = "C:\Users\PH\GuanGuan_clean"
)

$ErrorActionPreference = "Stop"

function Read-Utf8([string]$Path) {
    return Get-Content -Path $Path -Raw -Encoding UTF8
}

function Write-Utf8([string]$Path, [string]$Text) {
    Set-Content -Path $Path -Value $Text -Encoding UTF8
}

$appPath = Join-Path $ProjectPath "src\App.tsx"
$paymentPanelPath = Join-Path $ProjectPath "src\components\OrganizerPaymentVerificationPanel.tsx"
$stopComponentPath = Join-Path $ProjectPath "src\components\OrganizerMemberStopNotification.tsx"

foreach ($p in @($appPath, $paymentPanelPath)) {
    if (-not (Test-Path $p)) {
        throw "ไม่พบไฟล์: $p"
    }
}

$app = Read-Utf8 $appPath
$payment = Read-Utf8 $paymentPanelPath

Write-Host "Validating v49 notification patch..." -ForegroundColor Cyan

# ============================================================
# PART A - Payment verification sound default ON
# ============================================================

if ($payment -notmatch "PAYMENT_SOUND_DEFAULT_ON_V49") {
    # 1) soundEnabled default true, persisted in localStorage
    $statePattern = 'const \[soundEnabled, setSoundEnabled\] = useState\(false\);'
    if (-not [regex]::IsMatch($payment, $statePattern)) {
        throw "ไม่พบ soundEnabled state รูปแบบเดิมใน OrganizerPaymentVerificationPanel.tsx"
    }

    $stateReplacement = @'
const [soundEnabled, setSoundEnabled] = useState<boolean>(() => {
    // PAYMENT_SOUND_DEFAULT_ON_V49
    // Default ON. User can turn it off on this browser if desired.
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('guanguan_payment_sound_enabled') !== '0';
  });
'@
    $payment = [regex]::Replace(
        $payment,
        $statePattern,
        [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $stateReplacement },
        1
    )

    # 2) Replace one-way enableSound with toggle + browser unlock helper
    $enablePattern = '(?s)  const enableSound = async \(\) => \{\s*setSoundEnabled\(true\);\s*await playPaymentSound\(\);\s*\};'
    if (-not [regex]::IsMatch($payment, $enablePattern)) {
        throw "ไม่พบ enableSound() รูปแบบเดิม"
    }

    $enableReplacement = @'
  const toggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);

    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'guanguan_payment_sound_enabled',
        next ? '1' : '0'
      );
    }

    // A click is a valid browser gesture, so this also unlocks WebAudio.
    if (next) {
      await playPaymentSound();
    }
  };

  // PAYMENT_SOUND_UNLOCK_V49
  // soundEnabled is ON by default, but some browsers block audio until
  // the first user gesture. The first click/touch/key press unlocks WebAudio.
  useEffect(() => {
    if (!soundEnabled || typeof window === 'undefined') return;

    const unlock = () => {
      void playPaymentSound();
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
  }, [soundEnabled]);
'@
    $payment = [regex]::Replace(
        $payment,
        $enablePattern,
        [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $enableReplacement },
        1
    )

    # 3) button click -> toggleSound
    if (-not $payment.Contains("onClick={enableSound}")) {
        throw "ไม่พบ onClick={enableSound}"
    }
    $payment = $payment.Replace("onClick={enableSound}", "onClick={toggleSound}")

    # 4) update OFF text
    $payment = $payment.Replace(
        ": '🔕 กดเพื่อเปิดเสียง'}",
        ": '🔕 เสียงแจ้งเตือน: ปิด'}"
    )
}

# ============================================================
# PART B - Add member stop notification component
# ============================================================

$stopComponent = @'
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
'@

# ============================================================
# PART C - App.tsx: stamp stopRequestedAt on member checkout
# ============================================================

if ($app -notmatch "MEMBER_CHECKOUT_ALERT_V49") {
    $start = $app.IndexOf("const handleCheckOutPlayer")
    if ($start -lt 0) {
        throw "ไม่พบ handleCheckOutPlayer ใน App.tsx"
    }

    $end = $app.IndexOf("// TODAY_ROSTER_HANDLER_V48B", $start)
    if ($end -lt 0) {
        $end = $app.IndexOf("const handleToggleCheckIn", $start)
    }
    if ($end -lt 0) {
        throw "ไม่พบจุดสิ้นสุด handleCheckOutPlayer"
    }

    $segment = $app.Substring($start, $end - $start)

    # Add stopRequestedAt for normal member checkout.
    $needle = "            status: ('left' as PlayerStatus),"
    $idx = $segment.IndexOf($needle)

    if ($idx -lt 0) {
        throw "ไม่พบ status:left ใน handleCheckOutPlayer"
    }

    $replacement = @'
            status: ('left' as PlayerStatus),
            // MEMBER_CHECKOUT_ALERT_V49
            // Only member self-checkout creates an organizer alert.
            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: !isOrganizerMode ? Date.now() : p.stopRequestedAt,
'@

    $segment = $segment.Remove($idx, $needle.Length).Insert($idx, $replacement)
    $app = $app.Remove($start, $end - $start).Insert($start, $segment)
}

# StopAfterCurrentMatch fallback when player is no longer in active match:
# currently stopRequestedAt: undefined -> Date.now() so organizer still gets alert.
if ($app -notmatch "STOP_FALLBACK_ALERT_V49") {
    $start = $app.IndexOf("const handleStopAfterCurrentMatch")
    $end = $app.IndexOf("const handleCheckOutPlayer", $start)

    if ($start -ge 0 -and $end -gt $start) {
        $segment = $app.Substring($start, $end - $start)

        $fallbackPattern = '(?s)(if \(!activeMatch\) \{.*?stopAfterCurrentMatchId:\s*undefined,\s*)stopRequestedAt:\s*undefined,'
        $m = [regex]::Match($segment, $fallbackPattern)

        if ($m.Success) {
            $replacement = $m.Groups[1].Value + "stopRequestedAt: Date.now(), // STOP_FALLBACK_ALERT_V49"
            $segment = $segment.Remove($m.Index, $m.Length).Insert($m.Index, $replacement)
            $app = $app.Remove($start, $end - $start).Insert($start, $segment)
        } else {
            Write-Host "[WARN] Stop fallback pattern not found; active-match stop alert still works." -ForegroundColor Yellow
        }
    }
}

# ============================================================
# PART D - App.tsx import + render component
# ============================================================

if ($app -notmatch "OrganizerMemberStopNotification") {
    # Insert import after MemberPlayNotification import if possible.
    $importPattern = "(?m)^import\s+\{\s*MemberPlayNotification\s*\}\s+from\s+['""]\.\/components\/MemberPlayNotification['""];\s*$"
    $m = [regex]::Match($app, $importPattern)

    if ($m.Success) {
        $insert = $m.Value + "`r`nimport { OrganizerMemberStopNotification } from './components/OrganizerMemberStopNotification';"
        $app = $app.Remove($m.Index, $m.Length).Insert($m.Index, $insert)
    } else {
        # Fallback: insert after last import line.
        $matches = [regex]::Matches($app, "(?m)^import .*?;\s*$")
        if ($matches.Count -eq 0) {
            throw "ไม่พบ import section ใน App.tsx"
        }

        $last = $matches[$matches.Count - 1]
        $app = $app.Insert(
            $last.Index + $last.Length,
            "`r`nimport { OrganizerMemberStopNotification } from './components/OrganizerMemberStopNotification';"
        )
    }
}

if ($app -notmatch "MEMBER_STOP_NOTIFICATION_RENDER_V49") {
    $anchor = "{/* MEMBER_PLAY_NOTIFICATION_V33 */}"
    $idx = $app.IndexOf($anchor)

    if ($idx -lt 0) {
        throw "ไม่พบ MEMBER_PLAY_NOTIFICATION_V33 anchor ใน App.tsx"
    }

    $render = @'
        {/* MEMBER_STOP_NOTIFICATION_RENDER_V49 */}
        <OrganizerMemberStopNotification
          players={players}
          isOrganizerMode={isOrganizerMode}
        />

'@

    $app = $app.Insert($idx, $render)
}

# ============================================================
# ALL VALIDATION PASSED -> backups + writes
# ============================================================

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"

$appBackup = "$appPath.bak-notification-v49-$stamp"
$paymentBackup = "$paymentPanelPath.bak-notification-v49-$stamp"

Copy-Item $appPath $appBackup
Copy-Item $paymentPanelPath $paymentBackup

Write-Utf8 $appPath $app
Write-Utf8 $paymentPanelPath $payment
Write-Utf8 $stopComponentPath $stopComponent

Write-Host ""
Write-Host "Backups:" -ForegroundColor Cyan
Write-Host "  $appBackup"
Write-Host "  $paymentBackup"
Write-Host ""
Write-Host "[OK] Notification v49 applied." -ForegroundColor Green
Write-Host ""
Write-Host "Payment:" -ForegroundColor Yellow
Write-Host "  - Payment verification sound defaults to ON"
Write-Host "  - Setting is remembered per browser"
Write-Host "  - Button can turn sound ON/OFF"
Write-Host ""
Write-Host "Member Stop:" -ForegroundColor Yellow
Write-Host "  - Member normal checkout -> organizer popup + sound"
Write-Host "  - Member Stop After Current Match -> organizer popup + sound"
Write-Host "  - Organizer checkout does not create a self-stop alert"
Write-Host "  - Stop sound defaults to ON"
Write-Host ""
Write-Host "No Firestore Rules / Functions changes are required." -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:" -ForegroundColor Cyan
Write-Host "  npm run build"
Write-Host "  npm run dev"

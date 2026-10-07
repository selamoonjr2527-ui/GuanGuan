const fs = require('fs');
const path = require('path');

const root = process.cwd();
const courtsPath = path.join(root, 'src', 'components', 'CourtsView.tsx');
const appPath = path.join(root, 'src', 'App.tsx');

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

for (const f of [courtsPath, appPath]) {
  if (!fs.existsSync(f)) fail('ไม่พบไฟล์: ' + f);
}

let courts = fs.readFileSync(courtsPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

if (
  courts.includes('CANCEL_ACTIVE_MATCH_NO_CHARGE_V30') &&
  app.includes('HANDLE_CANCEL_ACTIVE_MATCH_NO_CHARGE_V30')
) {
  console.log('✅ V30 เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

// ============================================================
// CourtsView.tsx
// ============================================================

// 1) Add prop to interface.
if (!courts.includes('onCancelMatch: (matchId: string) => void;')) {
  const propAnchor =
    /(\s*onFinishMatch:\s*\([\s\S]*?\)\s*=>\s*void;\s*\r?\n)/m;

  if (!propAnchor.test(courts)) {
    fail(
      'CourtsView.tsx: หา onFinishMatch prop ไม่เจอ',
      'รัน: powershell -NoProfile -Command "Get-Content src\\components\\CourtsView.tsx | Select-Object -Skip 8 -First 30"'
    );
  }

  courts = courts.replace(
    propAnchor,
    `$1  // CANCEL_ACTIVE_MATCH_NO_CHARGE_V30\n  onCancelMatch: (matchId: string) => void;\n`
  );
}

// 2) Add prop to component destructuring.
if (!/\bonCancelMatch,\s*\r?\n/.test(courts)) {
  const destructureAnchor = /(\s*onFinishMatch,\s*\r?\n)/m;

  if (!destructureAnchor.test(courts)) {
    fail('CourtsView.tsx: หา onFinishMatch ใน destructuring ไม่เจอ');
  }

  courts = courts.replace(
    destructureAnchor,
    `$1  onCancelMatch,\n`
  );
}

// 3) Add Cancel / Change Player button immediately before Finish Game button.
// The button itself is organizer-only, so member view never sees it.
if (!courts.includes('CANCEL_MATCH_BUTTON_V30')) {
  const finishComment =
    /(\s*\{\/\*\s*Finish Game Button \(Organizer Only\)\s*\*\/\})/m;

  if (!finishComment.test(courts)) {
    fail(
      'CourtsView.tsx: หา Finish Game Button ไม่เจอ',
      'รัน: powershell -NoProfile -Command "Get-Content src\\components\\CourtsView.tsx | Select-Object -Skip 515 -First 45"'
    );
  }

  const cancelButton = `
                    {/* CANCEL_MATCH_BUTTON_V30 */}
                    {isOrganizerMode && (
                      <button
                        type="button"
                        onClick={() => {
                          const confirmed = window.confirm(
                            'ยกเลิกแมตช์นี้เพื่อเปลี่ยนผู้เล่นใช่หรือไม่?\\n\\n' +
                            '• แมตช์นี้จะไม่ถูกบันทึก\\n' +
                            '• ไม่เพิ่มจำนวน Match / Game\\n' +
                            '• ไม่คิดค่าลูกของแมตช์นี้\\n' +
                            '• ผู้เล่นที่ยังเล่นต่อจะกลับ Waiting'
                          );
                          if (confirmed) {
                            onCancelMatch(activeMatch.id);
                          }
                        }}
                        className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-950/70 hover:bg-rose-900 text-rose-300 hover:text-white border border-rose-800 font-bold text-xs transition"
                        title="ยกเลิกแมตช์นี้โดยไม่คิดค่ารอบนี้ แล้วเปลี่ยนผู้เล่นใหม่"
                      >
                        ❌ ยกเลิก / เปลี่ยนผู้เล่น
                      </button>
                    )}
`;

  courts = courts.replace(finishComment, `${cancelButton}$1`);
}

// ============================================================
// App.tsx
// ============================================================

// 4) Add cancel handler before handleFinishMatch.
if (!app.includes('HANDLE_CANCEL_ACTIVE_MATCH_NO_CHARGE_V30')) {
  const finishHandlerAnchor =
    /\n\s*const handleFinishMatch = \(/m;

  if (!finishHandlerAnchor.test(app)) {
    fail(
      'App.tsx: หา handleFinishMatch ไม่เจอ',
      'รัน: findstr /n /i "handleFinishMatch" src\\App.tsx'
    );
  }

  const cancelHandler = `
  // HANDLE_CANCEL_ACTIVE_MATCH_NO_CHARGE_V30
  // Cancel an active court because the organizer needs to change players.
  // This is NOT a completed match:
  // - no MatchHistory
  // - no shuttle usage posting
  // - no session shuttle total increment
  // - no new match/game charge
  const handleCancelActiveMatch = (matchId: string) => {
    setAppState((prev) => {
      const targetMatch = prev.activeMatches.find((m) => m.id === matchId);
      if (!targetMatch) return prev;

      const matchPlayerIds = new Set([
        ...targetMatch.teamA,
        ...targetMatch.teamB,
      ]);

      const nextPlayers = prev.players.map((p) => {
        if (!matchPlayerIds.has(p.id)) return p;

        const stopWasPrecounted =
          Boolean((p as any).stopAfterCurrentMatch) &&
          (p as any).stopAfterCurrentMatchId === matchId;

        // V29/V29A may have pre-counted this active match when the member
        // pressed "Stop" while still playing. Since this match is CANCELLED,
        // roll that pending charge back exactly once.
        const nextMatches = stopWasPrecounted
          ? Math.max(0, (p.matchesPlayed || 0) - 1)
          : (p.matchesPlayed || 0);

        const nextGames = stopWasPrecounted
          ? Math.max(0, (p.gamesPlayed || 0) - 2)
          : (p.gamesPlayed || 0);

        if (stopWasPrecounted) {
          // The member already asked to stop playing, so keep that intent.
          return {
            ...p,
            matchesPlayed: nextMatches,
            gamesPlayed: nextGames,
            isCheckedIn: false,
            checkInTime: undefined,
            checkInTimestamp: undefined,
            status: 'left' as PlayerStatus,
            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
          } as any;
        }

        // Normal cancellation: player was not charged for this active match.
        // Return them to Waiting with the original queue/check-in data intact.
        return {
          ...p,
          status: p.isCheckedIn
            ? ('waiting' as PlayerStatus)
            : ('left' as PlayerStatus),
          stopAfterCurrentMatch: false,
          stopAfterCurrentMatchId: undefined,
          stopRequestedAt: undefined,
        } as any;
      });

      return {
        ...prev,
        activeMatches: prev.activeMatches.filter((m) => m.id !== matchId),
        players: nextPlayers,
      } as any;
    });
  };

`;

  app = app.replace(
    finishHandlerAnchor,
    `${cancelHandler}  const handleFinishMatch = (`
  );
}

// 5) Wire handler to CourtsView.
if (!/onCancelMatch=\{handleCancelActiveMatch\}/.test(app)) {
  const wireAnchor =
    /(\s*onFinishMatch=\{handleFinishMatch\}\s*\r?\n)/m;

  if (!wireAnchor.test(app)) {
    fail(
      'App.tsx: หา onFinishMatch={handleFinishMatch} ไม่เจอ',
      'รัน: powershell -NoProfile -Command "Get-Content src\\App.tsx | Select-Object -Skip 2625 -First 20"'
    );
  }

  app = app.replace(
    wireAnchor,
    `$1            onCancelMatch={handleCancelActiveMatch}\n`
  );
}

// ============================================================
// Verify before write
// ============================================================

const checks = [
  [
    'CourtsView has onCancelMatch prop',
    courts.includes('onCancelMatch: (matchId: string) => void;')
  ],
  [
    'CourtsView destructures onCancelMatch',
    /\bonCancelMatch,\s*\r?\n/.test(courts)
  ],
  [
    'Cancel button added',
    courts.includes('CANCEL_MATCH_BUTTON_V30') &&
      courts.includes('onCancelMatch(activeMatch.id)')
  ],
  [
    'App has cancel handler',
    app.includes('HANDLE_CANCEL_ACTIVE_MATCH_NO_CHARGE_V30')
  ],
  [
    'Cancel removes active match only',
    app.includes('activeMatches: prev.activeMatches.filter((m) => m.id !== matchId)')
  ],
  [
    'V29 pre-count rollback supported',
    app.includes("Math.max(0, (p.matchesPlayed || 0) - 1)") &&
      app.includes("Math.max(0, (p.gamesPlayed || 0) - 2)")
  ],
  [
    'No MatchHistory is created by cancel handler',
    !/HANDLE_CANCEL_ACTIVE_MATCH_NO_CHARGE_V30[\s\S]*?matchHistory:\s*\[/m.test(
      app.split('const handleFinishMatch')[0].slice(-6000)
    )
  ],
  [
    'CourtsView wired to cancel handler',
    app.includes('onCancelMatch={handleCancelActiveMatch}')
  ],
];

console.log('');
console.log('=== PRE-WRITE VERIFY V30 ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

if (!ok) fail('Verify ไม่ผ่าน');

// Backups
for (const f of [courtsPath, appPath]) {
  const bak = f + '.bak-cancel-match-v30';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(f, bak);
    console.log('Backup:', bak);
  }
}

fs.writeFileSync(courtsPath, courts, 'utf8');
fs.writeFileSync(appPath, app, 'utf8');

console.log('');
console.log('✅ V30 สำเร็จ — เพิ่มยกเลิกแมตช์ / เปลี่ยนผู้เล่นแบบไม่คิดค่ารอบนี้');
console.log('');
console.log('พฤติกรรม:');
console.log('  • Organizer หน้า Court มีปุ่ม ❌ ยกเลิก / เปลี่ยนผู้เล่น');
console.log('  • กดยกเลิก -> Active Match ถูกลบจาก Court');
console.log('  • ไม่สร้าง Match History');
console.log('  • ไม่เพิ่ม Match / Game');
console.log('  • ไม่เพิ่ม Shuttle Usage / Session Shuttle Total');
console.log('  • สมาชิกทั่วไปในแมตช์กลับ Waiting');
console.log('  • ถ้ามีสมาชิกกด Stop แบบ V29A ไว้ -> คืน Match ที่ pre-count แล้ว และคงสถานะ Left');
console.log('  • ค่า Court Fee รายวัน/ต่อคนเดิมยังอยู่ตามกติกาเดิม; ยกเลิกเฉพาะค่าแมตช์/ค่าลูกของรอบนี้');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');

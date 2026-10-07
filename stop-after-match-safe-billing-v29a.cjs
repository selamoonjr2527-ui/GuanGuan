const fs = require('fs');
const path = require('path');

const root = process.cwd();
const memberPath = path.join(root, 'src', 'components', 'MemberAccessBar.tsx');
const appPath = path.join(root, 'src', 'App.tsx');

function fail(msg, hint = '') {
  console.error('❌ ' + msg);
  if (hint) console.error(hint);
  console.error('ยังไม่ได้เขียนไฟล์');
  process.exit(1);
}

for (const f of [memberPath, appPath]) {
  if (!fs.existsSync(f)) fail('ไม่พบไฟล์: ' + f);
}

let member = fs.readFileSync(memberPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');

if (
  member.includes('MEMBER_STOP_AFTER_MATCH_V29') &&
  app.includes('HANDLE_STOP_AFTER_MATCH_V29')
) {
  console.log('✅ V29 เคยทำแล้ว ไม่ต้องรันซ้ำ');
  process.exit(0);
}

// ============================================================
// MemberAccessBar.tsx
// ============================================================

// 1) Add callback prop
if (!member.includes('onStopAfterCurrentMatch?:')) {
  const propAnchor =
    /(\s*onCheckOutMember:\s*\(playerId:\s*string\)\s*=>\s*void;\s*\r?\n)/;

  if (!propAnchor.test(member)) {
    fail(
      'MemberAccessBar.tsx: หา onCheckOutMember prop ไม่เจอ',
      'รัน: findstr /n /i "onCheckOutMember onUpdateMemberStatus" src\\components\\MemberAccessBar.tsx'
    );
  }

  member = member.replace(
    propAnchor,
    `$1  // MEMBER_STOP_AFTER_MATCH_V29\n  onStopAfterCurrentMatch?: (playerId: string) => void;\n`
  );
}

// 2) Add callback to destructuring
if (!/\bonStopAfterCurrentMatch,\s*\r?\n/.test(member)) {
  const destructureAnchor =
    /(\s*onCheckOutMember,\s*\r?\n)/;

  if (!destructureAnchor.test(member)) {
    fail(
      'MemberAccessBar.tsx: หา onCheckOutMember ใน destructuring ไม่เจอ'
    );
  }

  member = member.replace(
    destructureAnchor,
    `$1  onStopAfterCurrentMatch,\n`
  );
}

// 3) Change STOP click behavior.
// While playing: DO NOT checkout. Ask App to mark "stop after current match".
// Not playing: keep old checkout behavior.
const stopClickRe =
  /setPendingPaymentMemberId\(currentMember\.id\);\s*\r?\n\s*onCheckOutMember\(currentMember\.id\);/m;

if (!stopClickRe.test(member)) {
  fail(
    'MemberAccessBar.tsx: หา logic ปุ่มเลิกเล่นเดิมไม่เจอ',
    'รัน: powershell -NoProfile -Command "Get-Content src\\components\\MemberAccessBar.tsx | Select-Object -Skip 245 -First 30"'
  );
}

member = member.replace(
  stopClickRe,
  `// MEMBER_STOP_AFTER_MATCH_V29
                        if (isPlaying) {
                          // Still on court: keep the player visible in the active match.
                          // App will pre-count this match for billing and stop them after finish.
                          onStopAfterCurrentMatch?.(currentMember.id);
                          return;
                        }

                        setPendingPaymentMemberId(currentMember.id);
                        onCheckOutMember(currentMember.id);`
);

// ============================================================
// App.tsx
// ============================================================

// 4) Clear any stale pending-stop flag when checking in again.
if (!app.includes('CLEAR_STOP_AFTER_MATCH_ON_CHECKIN_V29')) {
  const checkinRe =
    /(status:\s*\('waiting'\s+as\s+PlayerStatus\),\s*\r?\n)(\s*\/\/ Fresh session check-in starts with court fee only\.)/m;

  if (!checkinRe.test(app)) {
    fail(
      'App.tsx: หา check-in status waiting block ไม่เจอ',
      'รัน: powershell -NoProfile -Command "Get-Content src\\App.tsx | Select-Object -Skip 825 -First 35"'
    );
  }

  app = app.replace(
    checkinRe,
    `$1            // CLEAR_STOP_AFTER_MATCH_ON_CHECKIN_V29
            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
$2`
  );
}

// 5) Add handler BEFORE handleCheckOutPlayer.
if (!app.includes('HANDLE_STOP_AFTER_MATCH_V29')) {
  const handlerAnchor = /\n\s*const handleCheckOutPlayer = \(playerId: string\) => \{/m;

  if (!handlerAnchor.test(app)) {
    fail(
      'App.tsx: หา handleCheckOutPlayer ไม่เจอ',
      'รัน: findstr /n /i "handleCheckOutPlayer" src\\App.tsx'
    );
  }

  const handler = `
  // HANDLE_STOP_AFTER_MATCH_V29
  // If a member presses "Stop" while already on court:
  // - keep the member in the active match / court display
  // - pre-count this active match for billing immediately
  // - remove them from any future Pre-Match
  // - when the organizer eventually finishes the match, do not double-count it
  const handleStopAfterCurrentMatch = (playerId: string) => {
    setAppState((prev) => {
      const activeMatch = prev.activeMatches.find((m) =>
        [...m.teamA, ...m.teamB].includes(playerId)
      );

      // Safety fallback: if the player is no longer in an active match,
      // behave like a normal checkout.
      if (!activeMatch) {
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  isCheckedIn: false,
                  checkInTime: undefined,
                  checkInTimestamp: undefined,
                  status: 'left' as PlayerStatus,
                  stopAfterCurrentMatch: false,
                  stopAfterCurrentMatchId: undefined,
                  stopRequestedAt: undefined,
                }
              : p
          ),
        } as any;
      }

      const nextPlayers = prev.players.map((p) => {
        if (p.id !== playerId) return p;

        const alreadyPrecounted =
          Boolean((p as any).stopAfterCurrentMatch) &&
          (p as any).stopAfterCurrentMatchId === activeMatch.id;

        if (alreadyPrecounted) return p;

        return {
          ...p,
          // IMPORTANT: remain checked-in + playing so the name stays on Court.
          stopAfterCurrentMatch: true,
          stopAfterCurrentMatchId: activeMatch.id,
          stopRequestedAt: Date.now(),

          // Pre-count the current active match NOW.
          // This protects billing even if the organizer forgets to press Finish Match.
          matchesPlayed: (p.matchesPlayed || 0) + 1,
          gamesPlayed: (p.gamesPlayed || 0) + 2,
        } as any;
      });

      const clearFuturePreMatch = (pm: ConfirmedPreMatch | null | undefined) =>
        pm && [...pm.teamA, ...pm.teamB].includes(playerId) ? null : pm;

      return {
        ...prev,
        players: nextPlayers,
        confirmedPreMatch: clearFuturePreMatch(prev.confirmedPreMatch),
        confirmedPreMatch2: clearFuturePreMatch(prev.confirmedPreMatch2),
      } as any;
    });
  };

`;

  app = app.replace(handlerAnchor, `${handler}  const handleCheckOutPlayer = (playerId: string) => {`);
}

// 6) Daily billing reconciliation must include a pending active match that was pre-counted.
if (!app.includes('PENDING_ACTIVE_MATCH_BILLING_V29')) {
  const completedRe =
    /const completedMatches = getCurrentSessionCompletedMatchCount\(\s*player,\s*statsMap,\s*prev\.matchHistory\s*\);\s*\r?\n\s*const completedGames = completedMatches \* 2;/m;

  if (!completedRe.test(app)) {
    fail(
      'App.tsx: หา daily match reconciliation ไม่เจอ',
      'รัน: findstr /n /i "getCurrentSessionCompletedMatchCount completedGames" src\\App.tsx'
    );
  }

  app = app.replace(
    completedRe,
    `const completedHistoryMatches = getCurrentSessionCompletedMatchCount(
          player,
          statsMap,
          prev.matchHistory
        );

        // PENDING_ACTIVE_MATCH_BILLING_V29
        // A member may have pressed Stop before the organizer finishes the court.
        // Count that active match as billable exactly once.
        const hasPendingActiveMatchCharge =
          Boolean((player as any).stopAfterCurrentMatch) &&
          Boolean((player as any).stopAfterCurrentMatchId) &&
          prev.activeMatches.some(
            (m) =>
              m.id === (player as any).stopAfterCurrentMatchId &&
              [...m.teamA, ...m.teamB].includes(player.id)
          );

        const completedMatches =
          completedHistoryMatches + (hasPendingActiveMatchCharge ? 1 : 0);
        const completedGames = completedMatches * 2;`
  );

  // Make reconciliation also run when active match list changes.
  const depRe = /\}, \[matchHistory\]\);/;
  if (depRe.test(app)) {
    app = app.replace(depRe, `}, [matchHistory, activeMatches]);`);
  }
}

// 7) Replace the finish-match player update block.
// If this player's current match was already pre-counted, keep counts unchanged.
// Then checkout this member after the organizer presses Finish.
if (!app.includes('FINALIZE_STOP_AFTER_MATCH_V29')) {
  const finishPlayersRe =
    /(shuttleUsageLedger:\s*nextUsages,\s*\r?\n\s*)players:\s*prev\.players\.map\(\(p\)\s*=>[\s\S]*?\r?\n\s*\),\s*\r?\n(\s*sessionConfig:\s*\{)/m;

  if (!finishPlayersRe.test(app)) {
    fail(
      'App.tsx: หา players update ใน handleFinishMatch ไม่เจอ',
      'รัน: powershell -NoProfile -Command "Get-Content src\\App.tsx | Select-Object -Skip 1795 -First 45"'
    );
  }

  app = app.replace(
    finishPlayersRe,
    `$1players: prev.players.map((p) => {
          if (!allPlayerIds.has(p.id)) return p;

          // FINALIZE_STOP_AFTER_MATCH_V29
          const stopAfterThisMatch =
            Boolean((p as any).stopAfterCurrentMatch) &&
            (
              !(p as any).stopAfterCurrentMatchId ||
              (p as any).stopAfterCurrentMatchId === matchId
            );

          const alreadyPrecounted =
            stopAfterThisMatch &&
            (p as any).stopAfterCurrentMatchId === matchId;

          return {
            ...p,
            // Avoid double charge: this member's match was counted when they pressed Stop.
            gamesPlayed: alreadyPrecounted
              ? (p.gamesPlayed || 0)
              : (p.gamesPlayed || 0) + 2,
            matchesPlayed: alreadyPrecounted
              ? (p.matchesPlayed || 0)
              : (p.matchesPlayed || 0) + 1,

            // Other players go back to Waiting.
            // The member who requested Stop checks out only NOW.
            isCheckedIn: stopAfterThisMatch ? false : p.isCheckedIn,
            checkInTime: stopAfterThisMatch ? undefined : p.checkInTime,
            checkInTimestamp: stopAfterThisMatch ? undefined : p.checkInTimestamp,
            status: stopAfterThisMatch
              ? ('left' as PlayerStatus)
              : ('waiting' as PlayerStatus),

            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
            lastMatchFinishTime: Date.now(),
          } as any;
        }),
$2`
  );
}

// 8) Wire handler into MemberAccessBar.
// Support both:
//   onCheckOutMember={handleCheckOutPlayer}
// and this repo's current wrapper form:
//   onCheckOutMember={(playerId) => {
//     handleCheckOutPlayer(playerId);
//   }}
if (!/onStopAfterCurrentMatch=\{handleStopAfterCurrentMatch\}/.test(app)) {
  const directWireAnchor =
    /(\s*onCheckOutMember=\{handleCheckOutPlayer\}\s*\r?\n)/m;

  const wrapperWireAnchor =
    /(\s*onCheckOutMember=\{\(playerId\)\s*=>\s*\{\s*\r?\n\s*handleCheckOutPlayer\(playerId\);\s*\r?\n\s*\}\}\s*\r?\n)/m;

  if (directWireAnchor.test(app)) {
    app = app.replace(
      directWireAnchor,
      `$1          onStopAfterCurrentMatch={handleStopAfterCurrentMatch}\n`
    );
  } else if (wrapperWireAnchor.test(app)) {
    app = app.replace(
      wrapperWireAnchor,
      `$1          onStopAfterCurrentMatch={handleStopAfterCurrentMatch}\n`
    );
  } else {
    fail(
      'App.tsx: หา onCheckOutMember block ไม่เจอ',
      'รัน: powershell -NoProfile -Command "Get-Content src\\App.tsx | Select-Object -Skip 2386 -First 18"'
    );
  }
}

// ============================================================
// Verify before writing
// ============================================================
const checks = [
  [
    'Member button uses stop-after-match callback while playing',
    member.includes('MEMBER_STOP_AFTER_MATCH_V29') &&
      member.includes('onStopAfterCurrentMatch?.(currentMember.id)')
  ],
  [
    'App has stop-after-match handler',
    app.includes('HANDLE_STOP_AFTER_MATCH_V29')
  ],
  [
    'Active match gets pre-counted for billing',
    app.includes('matchesPlayed: (p.matchesPlayed || 0) + 1') &&
      app.includes('stopAfterCurrentMatchId: activeMatch.id')
  ],
  [
    'Reconciliation keeps pending active match billable',
    app.includes('PENDING_ACTIVE_MATCH_BILLING_V29')
  ],
  [
    'Finish match avoids double counting and checks member out',
    app.includes('FINALIZE_STOP_AFTER_MATCH_V29') &&
      app.includes('alreadyPrecounted')
  ],
  [
    'MemberAccessBar is wired to App handler',
    app.includes('onStopAfterCurrentMatch={handleStopAfterCurrentMatch}')
  ],
];

console.log('');
console.log('=== PRE-WRITE VERIFY V29A ===');
let ok = true;
for (const [label, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${label}`);
  if (!pass) ok = false;
}

if (!ok) fail('Verify ไม่ผ่าน');

// Backups
for (const f of [memberPath, appPath]) {
  const bak = f + '.bak-stop-after-match-v29';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(f, bak);
    console.log('Backup:', bak);
  }
}

fs.writeFileSync(memberPath, member, 'utf8');
fs.writeFileSync(appPath, app, 'utf8');

console.log('');
console.log('✅ V29A สำเร็จ');
console.log('');
console.log('พฤติกรรมใหม่:');
console.log('  1) สมาชิกกำลังแข่ง -> กดเลิกเล่น');
console.log('  2) ชื่อยังอยู่บน Court / Active Match');
console.log('  3) Current Match ถูกนับเข้ายอด Billing ทันที 1 Match');
console.log('  4) ไม่ถูกส่งเข้า Pre-Match / คิวถัดไปอีก');
console.log('  5) ถ้าผู้จัดลืม Finish Match -> Match นี้ยังถูกคิดเงินแล้ว');
console.log('  6) เมื่อผู้จัดกด Finish ภายหลัง -> ไม่คิด Match ซ้ำ');
console.log('  7) หลัง Finish -> สมาชิก Checkout เป็น Left และไม่กลับ Waiting');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');

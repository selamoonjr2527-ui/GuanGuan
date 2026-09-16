const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.tsx');
const pmPath = path.join(root, 'src', 'components', 'PreMatchView.tsx');

for (const f of [appPath, pmPath]) {
  if (!fs.existsSync(f)) {
    console.error('❌ ไม่พบไฟล์:', f);
    process.exit(1);
  }
}

function backup(file, suffix) {
  const bak = file + suffix;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backup:', bak);
  }
}

backup(appPath, '.bak-pm-alert');
backup(pmPath, '.bak-pm-alert');

let app = fs.readFileSync(appPath, 'utf8');
let pm = fs.readFileSync(pmPath, 'utf8');

// ============================================================
// APP.TSX
// ============================================================

// 1) CHECK-OUT: do NOT immediately remove/cancel confirmed PM.
//    Keep PM until organizer acknowledges the request.
app = app.replace(
  /(\s*\/\/ Clear from pre-match if present\s*[\s\S]*?)(\s*return\s*\{\s*\.\.\.prev,\s*players:\s*updatedPlayers,\s*confirmedPreMatch:\s*nextPre1,\s*confirmedPreMatch2:\s*nextPre2,\s*\};)/,
  `
      // IMPORTANT: If this member is already in a CONFIRMED Pre-Match,
      // keep the PM for now. Organizer will receive an alert and decide.
      return {
        ...prev,
        players: updatedPlayers,
      };`
);

// 2) RESTING / LEFT status: also keep confirmed PM until organizer confirms removal.
app = app.replace(
  /(\s*\/\/ If a player is marked resting or left, clear them from confirmed pre-match if present\s*[\s\S]*?)(\s*return\s*\{\s*\.\.\.prev,\s*players:\s*updatedPlayers,\s*confirmedPreMatch:\s*nextPre1,\s*confirmedPreMatch2:\s*nextPre2,\s*\};)/,
  `
      // IMPORTANT: Resting/left member stays in CONFIRMED PM temporarily.
      // Organizer will get a cross-device alert and must acknowledge removal.
      return {
        ...prev,
        players: updatedPlayers,
      };`
);

// 3) Add explicit "remove only this member" handler.
//    We keep the other 3 players and put a unique VACANT placeholder in that position.
if (!app.includes('const handleRemovePlayerFromPreMatch =')) {
  const cancelRegex = /  const handleCancelPreMatch = \(slotNumber: 1 \| 2 = 1\) => \{[\s\S]*?\n  \};/;
  const m = app.match(cancelRegex);
  if (!m) {
    console.error('❌ หา handleCancelPreMatch ไม่เจอ');
    process.exit(2);
  }

  const addition = `${m[0]}

  const handleRemovePlayerFromPreMatch = (playerId: string, slotNumber: 1 | 2) => {
    setAppState((prev) => {
      const source = slotNumber === 1 ? prev.confirmedPreMatch : prev.confirmedPreMatch2;
      if (!source) return prev;

      const allIds = [...source.teamA, ...source.teamB];
      if (!allIds.includes(playerId)) return prev;

      // Unique placeholder keeps the remaining 3 names in the same PM
      // and makes the removed position visibly available for replacement.
      const vacantId = \`__PM_VACANT__\${playerId}__\${Date.now()}\`;

      const replacePlayer = (team: [string, string]): [string, string] =>
        team.map((id) => (id === playerId ? vacantId : id)) as [string, string];

      const updatedPreMatch: ConfirmedPreMatch = {
        ...source,
        teamA: replacePlayer(source.teamA),
        teamB: replacePlayer(source.teamB),
        pairingLabelThai: '⚠️ รอผู้เล่นแทน',
        explanationThai: 'มีสมาชิกขอพัก/กลับหลังจาก Confirm แล้ว ผู้จัดต้องเลือกผู้เล่นแทนก่อนลงคอร์ท',
        confirmedAt: Date.now(),
      };

      return {
        ...prev,
        confirmedPreMatch: slotNumber === 1 ? updatedPreMatch : prev.confirmedPreMatch,
        confirmedPreMatch2: slotNumber === 2 ? updatedPreMatch : prev.confirmedPreMatch2,
      };
    });
  };`;

  app = app.replace(m[0], addition);
}

// 4) Harden Confirm PM: a VACANT / Resting / Left / Not Check-in member cannot be confirmed.
const confirmStart = `  const handleConfirmPreMatch = (preMatch: ConfirmedPreMatch, slotNumber: 1 | 2 = 1) => {
    const preMatchPlayerIds = new Set([...preMatch.teamA, ...preMatch.teamB]);`;

if (app.includes(confirmStart) && !app.includes('PM_CONFIRM_READY_GUARD')) {
  app = app.replace(
    confirmStart,
    `${confirmStart}

    // PM_CONFIRM_READY_GUARD
    const selectedIds = [...preMatch.teamA, ...preMatch.teamB];
    const invalidSelection = selectedIds.some((id) => {
      if (!id || id.startsWith('__PM_VACANT__')) return true;
      const p = appState.players.find((x) => x.id === id);
      return !p || !p.isCheckedIn || p.status === 'resting' || p.status === 'left';
    });

    if (invalidSelection) {
      window.alert('ยัง Confirm Pre-Match ไม่ได้ เพราะมีช่องว่าง หรือมีสมาชิกที่พัก/กลับแล้ว กรุณาเลือกผู้เล่นแทนก่อน');
      return;
    }`
  );
}

// 5) Harden Start Confirmed PM: cannot start with vacancy / resting / left.
const startConfirmed = `  const handleStartConfirmedPreMatch = (courtId: string, preMatch: ConfirmedPreMatch, slotNumber: 1 | 2 = 1) => {`;

if (app.includes(startConfirmed) && !app.includes('PM_START_READY_GUARD')) {
  app = app.replace(
    startConfirmed,
    `${startConfirmed}
    // PM_START_READY_GUARD
    const readyIds = [...preMatch.teamA, ...preMatch.teamB];
    const invalidForStart = readyIds.some((id) => {
      if (!id || id.startsWith('__PM_VACANT__')) return true;
      const p = players.find((x) => x.id === id);
      return !p || !p.isCheckedIn || p.status === 'resting' || p.status === 'left';
    });

    if (invalidForStart) {
      window.alert('ยังเปิดสนามไม่ได้ เพราะ Pre-Match มีช่องว่าง หรือมีสมาชิกที่พัก/กลับแล้ว กรุณาเลือกผู้เล่นแทนก่อน');
      return;
    }
`
  );
}

// 6) Pass callback to PreMatchView.
const cancelProp = `            onCancelPreMatch={handleCancelPreMatch}`;
if (app.includes(cancelProp) && !app.includes('onRemovePlayerFromPreMatch={handleRemovePlayerFromPreMatch}')) {
  app = app.replace(
    cancelProp,
    `${cancelProp}
            onRemovePlayerFromPreMatch={handleRemovePlayerFromPreMatch}`
  );
}

fs.writeFileSync(appPath, app, 'utf8');

// ============================================================
// PREMATCHVIEW.TSX
// ============================================================

// 7) Add prop to interface.
const interfaceCancel = `  onCancelPreMatch?: (slot: 1 | 2) => void;`;
if (pm.includes(interfaceCancel) && !pm.includes('onRemovePlayerFromPreMatch?:')) {
  pm = pm.replace(
    interfaceCancel,
    `${interfaceCancel}
  onRemovePlayerFromPreMatch?: (playerId: string, slot: 1 | 2) => void;`
  );
}

// 8) Destructure callback.
const destructCancel = `  onCancelPreMatch,`;
if (pm.includes(destructCancel) && !pm.includes('  onRemovePlayerFromPreMatch,')) {
  pm = pm.replace(
    destructCancel,
    `${destructCancel}
  onRemovePlayerFromPreMatch,`
  );
}

// 9) IMPORTANT: confirmed PM must remain visible while waiting for organizer decision.
//    Restore safe PM logic to uniqueness/overlap checks only.
pm = pm.replace(
  /  const safeConfirmedPreMatch1 = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/,
`  const safeConfirmedPreMatch1 = useMemo(() => {
    if (!confirmedPreMatch) return null;
    const all = [...confirmedPreMatch.teamA, ...confirmedPreMatch.teamB];
    if (new Set(all).size !== 4) return null;
    return confirmedPreMatch;
  }, [confirmedPreMatch]);`
);

pm = pm.replace(
  /  const safeConfirmedPreMatch2 = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[[^\]]*\]\);/,
`  const safeConfirmedPreMatch2 = useMemo(() => {
    if (!confirmedPreMatch2) return null;
    const all = [...confirmedPreMatch2.teamA, ...confirmedPreMatch2.teamB];
    if (all.some((id) => confirmedPre1PlayerIds.has(id))) return null;
    if (new Set(all).size !== 4) return null;
    return confirmedPreMatch2;
  }, [confirmedPreMatch2, confirmedPre1PlayerIds]);`
);

// 10) Remove previous auto-cleanup effect from FINAL patch.
//     We now wait for organizer OK instead of auto-removing.
pm = pm.replace(
  /\n\s*\/\/ FINAL CLEANUP: remove invalid confirmed PM from shared state,[\s\S]*?\n\s*\}, \[players, confirmedPreMatch, confirmedPreMatch2\]\);\s*/g,
  '\n'
);

// 11) Add organizer alert effect after confirmedPre2PlayerIds.
if (!pm.includes('ORGANIZER_PM_MEMBER_CHANGE_ALERT')) {
  const idsBlockRegex = /  const confirmedPre2PlayerIds = useMemo\(\(\) => \{[\s\S]*?\n  \}, \[safeConfirmedPreMatch2\]\);/;
  const m = pm.match(idsBlockRegex);
  if (!m) {
    console.error('❌ หา confirmedPre2PlayerIds ไม่เจอ');
    process.exit(3);
  }

  const alertEffect = `${m[0]}

  // ORGANIZER_PM_MEMBER_CHANGE_ALERT
  // Member may request Rest / Check-out from another device.
  // Firestore sync updates players here, then only organizer receives this confirmation.
  const organizerPmAlertedRef = React.useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isOrganizerMode || !onRemovePlayerFromPreMatch) return;

    const inspectSlot = (pmData: ConfirmedPreMatch | null | undefined, slot: 1 | 2) => {
      if (!pmData) return;

      const ids = [...pmData.teamA, ...pmData.teamB]
        .filter((id) => id && !id.startsWith('__PM_VACANT__'));

      ids.forEach((playerId) => {
        const player = players.find((p) => p.id === playerId);
        if (!player) return;

        const isResting = player.status === 'resting';
        const isLeaving = !player.isCheckedIn || player.status === 'left';
        if (!isResting && !isLeaving) return;

        const actionText = isResting ? 'ขอพักเหนื่อย' : 'ขอกลับ / Check-out';
        const key = \`\${slot}:\${player.id}:\${actionText}\`;

        if (organizerPmAlertedRef.current.has(key)) return;
        organizerPmAlertedRef.current.add(key);

        const ok = window.confirm(
          \`🚨 แจ้งผู้จัดก๊วน\\n\\n\` +
          \`\${player.nickname} \${actionText}\\n\` +
          \`แต่มีชื่ออยู่ใน Pre-Match #\${slot} ที่ Confirm แล้ว\\n\\n\` +
          \`กด OK = เอา \${player.nickname} ออกจาก PM#\${slot} และเปิดช่องให้เลือกคนแทน\\n\` +
          \`กด Cancel = ยังไม่แก้ PM ตอนนี้\`
        );

        if (ok) {
          onRemovePlayerFromPreMatch(player.id, slot);
          setStagingSlot(slot);
          setIsEditingSlot(slot);
          setActionNotice(
            \`⚠️ เอา \${player.nickname} ออกจาก Pre-Match #\${slot} แล้ว • กรุณาเลือกผู้เล่นแทน\`
          );
          setTimeout(() => setActionNotice(null), 6000);
        } else {
          setActionNotice(
            \`⚠️ \${player.nickname} \${actionText} แต่ยังอยู่ใน Pre-Match #\${slot} • ยังเปิดสนามไม่ได้จนกว่าจะจัดคนใหม่\`
          );
          setTimeout(() => setActionNotice(null), 7000);
        }
      });
    };

    inspectSlot(confirmedPreMatch, 1);
    inspectSlot(confirmedPreMatch2, 2);
  }, [
    isOrganizerMode,
    players,
    confirmedPreMatch,
    confirmedPreMatch2,
    onRemovePlayerFromPreMatch,
  ]);`;

  pm = pm.replace(m[0], alertEffect);
}

// 12) Manual picker remains READY-only. If old broad filter somehow exists, tighten it.
pm = pm.replace(
  /const manualSelectablePlayers = useMemo\(\(\) => \{\s*return players\.filter\(\(p\) => p\.isCheckedIn && p\.status !== 'left'\);\s*\}, \[players\]\);/,
`const manualSelectablePlayers = useMemo(() => {
    return players.filter(
      (p) =>
        p.isCheckedIn &&
        p.status === 'waiting' &&
        !playingPlayerIds.has(p.id)
    );
  }, [players, playingPlayerIds]);`
);

fs.writeFileSync(pmPath, pm, 'utf8');

// ============================================================
// VERIFY
// ============================================================
const appFinal = fs.readFileSync(appPath, 'utf8');
const pmFinal = fs.readFileSync(pmPath, 'utf8');

const checks = [
  ['App remove-one handler', appFinal.includes('const handleRemovePlayerFromPreMatch =')],
  ['App prop wired', appFinal.includes('onRemovePlayerFromPreMatch={handleRemovePlayerFromPreMatch}')],
  ['Confirm guard', appFinal.includes('PM_CONFIRM_READY_GUARD')],
  ['Start guard', appFinal.includes('PM_START_READY_GUARD')],
  ['PM interface prop', pmFinal.includes('onRemovePlayerFromPreMatch?:')],
  ['Organizer alert effect', pmFinal.includes('ORGANIZER_PM_MEMBER_CHANGE_ALERT')],
  ['No FINAL auto cleanup', !pmFinal.includes('FINAL CLEANUP: remove invalid confirmed PM from shared state')],
  ['Manual picker ready-only', pmFinal.includes("p.status === 'waiting'")],
];

console.log('');
console.log('=== VERIFY ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

if (!ok) {
  console.error('\\n❌ Patch ไม่สมบูรณ์ กรุณาส่ง App.tsx และ PreMatchView.tsx ล่าสุดมาให้ตรวจ');
  process.exit(10);
}

console.log('');
console.log('✅ เพิ่มแจ้งเตือนผู้จัดสำหรับสมาชิกใน Confirmed PM ที่ขอพัก/กลับแล้ว');
console.log('✅ กด OK = เอาเฉพาะคนนั้นออก เหลืออีก 3 คน และเปิดช่องว่างให้เลือกคนแทน');
console.log('✅ ก่อนเลือกคนแทน จะ Confirm/Start Court ไม่ได้');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');

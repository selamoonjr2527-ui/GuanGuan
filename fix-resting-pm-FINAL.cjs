const fs = require('fs');
const path = require('path');

const pmPath = path.join(process.cwd(), 'src', 'components', 'PreMatchView.tsx');

if (!fs.existsSync(pmPath)) {
  console.error('❌ ไม่พบไฟล์:', pmPath);
  process.exit(1);
}

let text = fs.readFileSync(pmPath, 'utf8');
const backup = pmPath + '.bak-resting-final';
if (!fs.existsSync(backup)) {
  fs.copyFileSync(pmPath, backup);
  console.log('Backup:', backup);
}

let changed = 0;

// ------------------------------------------------------------
// 1) Add a single source-of-truth eligibility checker
// ------------------------------------------------------------
const playingBlockRegex = /const playingPlayerIds = useMemo\(\(\) => \{[\s\S]*?\}, \[activeMatches, players\]\);/;
const playingMatch = text.match(playingBlockRegex);

if (!playingMatch) {
  console.error('❌ หา playingPlayerIds ไม่เจอ');
  process.exit(2);
}

if (!text.includes('const isPmEligiblePlayer = (playerId: string) =>')) {
  const insert = `${playingMatch[0]}

  // FINAL RULE:
  // Resting / Left / Not Check-in must NEVER appear in PM.
  const isPmEligiblePlayer = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    return Boolean(
      player &&
      player.isCheckedIn &&
      player.status !== 'resting' &&
      player.status !== 'left'
    );
  };`;
  text = text.replace(playingMatch[0], insert);
  changed++;
}

// ------------------------------------------------------------
// 2) Harden confirmed PM1 rendering
// ------------------------------------------------------------
const pm1Regex = /const safeConfirmedPreMatch1 = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/;
const pm1New = `const safeConfirmedPreMatch1 = useMemo(() => {
    if (!confirmedPreMatch) return null;
    const all = [...confirmedPreMatch.teamA, ...confirmedPreMatch.teamB];
    if (new Set(all).size !== 4) return null;

    // Hide the whole PM card immediately if ANY player is resting/unavailable.
    if (all.some((id) => !isPmEligiblePlayer(id))) return null;

    return confirmedPreMatch;
  }, [confirmedPreMatch, players]);`;

if (pm1Regex.test(text)) {
  text = text.replace(pm1Regex, pm1New);
  changed++;
} else {
  console.error('❌ หา safeConfirmedPreMatch1 ไม่เจอ');
  process.exit(3);
}

// ------------------------------------------------------------
// 3) Harden confirmed PM2 rendering
// ------------------------------------------------------------
const pm2Regex = /const safeConfirmedPreMatch2 = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/;
const pm2New = `const safeConfirmedPreMatch2 = useMemo(() => {
    if (!confirmedPreMatch2) return null;
    const all = [...confirmedPreMatch2.teamA, ...confirmedPreMatch2.teamB];
    if (all.some((id) => confirmedPre1PlayerIds.has(id))) return null;
    if (new Set(all).size !== 4) return null;

    // Hide the whole PM card immediately if ANY player is resting/unavailable.
    if (all.some((id) => !isPmEligiblePlayer(id))) return null;

    return confirmedPreMatch2;
  }, [confirmedPreMatch2, confirmedPre1PlayerIds, players]);`;

if (pm2Regex.test(text)) {
  text = text.replace(pm2Regex, pm2New);
  changed++;
} else {
  console.error('❌ หา safeConfirmedPreMatch2 ไม่เจอ');
  process.exit(4);
}

// ------------------------------------------------------------
// 4) Manual PM dropdown: waiting only, no Resting, no Playing
// ------------------------------------------------------------
const manualRegex = /const manualSelectablePlayers = useMemo\(\(\) => \{[\s\S]*?\}, \[[^\]]*\]\);/;
const manualNew = `const manualSelectablePlayers = useMemo(() => {
    return players.filter(
      (p) =>
        p.isCheckedIn &&
        p.status === 'waiting' &&
        !playingPlayerIds.has(p.id)
    );
  }, [players, playingPlayerIds]);`;

if (manualRegex.test(text)) {
  text = text.replace(manualRegex, manualNew);
  changed++;
} else {
  console.error('❌ หา manualSelectablePlayers ไม่เจอ');
  process.exit(5);
}

// ------------------------------------------------------------
// 5) Extra filter directly at dropdown source (defense in depth)
// ------------------------------------------------------------
text = text.replace(
  /return \[\.\.\.manualSelectablePlayers\]\.sort\(\(a, b\) => \{/,
  `return manualSelectablePlayers
      .filter(
        (p) =>
          p.isCheckedIn &&
          p.status === 'waiting' &&
          !playingPlayerIds.has(p.id)
      )
      .sort((a, b) => {`
);

// ------------------------------------------------------------
// 6) If a confirmed PM becomes invalid, remove it from app state too
// ------------------------------------------------------------
if (!text.includes('FINAL CLEANUP: remove invalid confirmed PM from shared state')) {
  const afterConfirmedIds = `  const confirmedPre2PlayerIds = useMemo(() => {
    if (!safeConfirmedPreMatch2) return new Set<string>();
    return new Set([...safeConfirmedPreMatch2.teamA, ...safeConfirmedPreMatch2.teamB]);
  }, [safeConfirmedPreMatch2]);`;

  const cleanupBlock = `${afterConfirmedIds}

  // FINAL CLEANUP: remove invalid confirmed PM from shared state,
  // not just from the screen, so Firestore/LocalStorage cannot keep showing it.
  useEffect(() => {
    if (confirmedPreMatch) {
      const ids = [...confirmedPreMatch.teamA, ...confirmedPreMatch.teamB];
      if (ids.some((id) => !isPmEligiblePlayer(id))) {
        onCancelPreMatch?.(1);
      }
    }

    if (confirmedPreMatch2) {
      const ids = [...confirmedPreMatch2.teamA, ...confirmedPreMatch2.teamB];
      if (ids.some((id) => !isPmEligiblePlayer(id))) {
        onCancelPreMatch?.(2);
      }
    }
  }, [players, confirmedPreMatch, confirmedPreMatch2]);`;

  if (text.includes(afterConfirmedIds)) {
    text = text.replace(afterConfirmedIds, cleanupBlock);
    changed++;
  } else {
    console.warn('⚠️ ไม่พบ confirmedPre2PlayerIds block สำหรับ cleanup effect');
  }
}

fs.writeFileSync(pmPath, text, 'utf8');

// ------------------------------------------------------------
// Verification
// ------------------------------------------------------------
const finalText = fs.readFileSync(pmPath, 'utf8');
const checks = [
  ['Eligibility rule', finalText.includes("player.status !== 'resting'")],
  ['PM1 hard filter', finalText.includes('if (all.some((id) => !isPmEligiblePlayer(id))) return null;')],
  ['PM2 hard filter', (finalText.match(/!isPmEligiblePlayer\(id\)/g) || []).length >= 2],
  ['Manual picker waiting only', finalText.includes("p.status === 'waiting'")],
  ['State cleanup effect', finalText.includes('FINAL CLEANUP: remove invalid confirmed PM from shared state')],
];

console.log('');
console.log('=== VERIFY ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

console.log('');
console.log(`แก้ไข ${changed} จุด`);
if (!ok) {
  console.error('❌ Verification ไม่ผ่าน — กรุณาส่ง PreMatchView.tsx ล่าสุดมาให้ตรวจ');
  process.exit(10);
}

console.log('✅ Resting จะถูกซ่อนจาก PM ทั้ง Confirmed card และ Dropdown');
console.log('');
console.log('ทดสอบด้วย:');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');

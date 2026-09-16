const fs = require('fs');
const path = require('path');

const root = process.cwd();
const srcDir = path.join(root, 'src');
const prePath = path.join(srcDir, 'components', 'PreMatchView.tsx');
const checkPath = path.join(srcDir, 'components', 'CheckInView.tsx');
const billingPath = path.join(srcDir, 'components', 'BillingView.tsx');

for (const file of [prePath, checkPath, billingPath]) {
  if (!fs.existsSync(file)) {
    console.error('❌ ไม่พบไฟล์:', file);
    process.exit(1);
  }
}

function backup(file) {
  const bak = file + '.bak-match-terminology';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backup:', bak);
  }
}

[prePath, checkPath, billingPath].forEach(backup);

// ============================================================
// 0) Global terminology:
//    Thai "เกม" => "Set" everywhere in source.
//    Then queue/member/billing areas below are explicitly changed to Match.
// ============================================================
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

for (const file of walk(srcDir)) {
  let t = fs.readFileSync(file, 'utf8');
  if (t.includes('เกม')) {
    t = t.replace(/เกม/g, 'Set');
    fs.writeFileSync(file, t, 'utf8');
  }
}

// ============================================================
// 1) PRE-MATCH / WAITING QUEUE
//    Use Match count, not gamesPlayed/Set count.
// ============================================================
let pre = fs.readFileSync(prePath, 'utf8');

// Add helpers after getPlayer()
if (!pre.includes('const getPlayerMatchCount = (player: Player) =>')) {
  const getPlayerRegex =
    /  const getPlayer = \(id: string\): Player \| undefined => \{\s*return players\.find\(\(p\) => p\.id === id\);\s*\};/;

  const m = pre.match(getPlayerRegex);
  if (!m) {
    console.error('❌ หา getPlayer() ใน PreMatchView ไม่เจอ');
    process.exit(2);
  }

  const helper = `${m[0]}

  // Match is the primary unit for queue / rotation / billing.
  // gamesPlayed is kept only as the legacy Set counter.
  const getPlayerMatchCount = (player: Player): number => {
    const matches = Number(player.matchesPlayed ?? 0);
    const sets = Number(player.gamesPlayed ?? 0);

    if (Number.isFinite(matches) && (matches > 0 || sets === 0)) {
      return Math.max(0, matches);
    }

    // Backward compatibility for older saved data that did not have matchesPlayed.
    return Math.max(0, Math.floor(sets / 2));
  };

  const getPlayerEffectiveMatchCount = (player: Player): number => {
    return getPlayerMatchCount(player) + Math.max(0, Number(player.walkInPenaltyMatches ?? 0));
  };`;

  pre = pre.replace(m[0], helper);
}

// Queue sorting: fewer Matches first; existing comparator remains tie breaker.
pre = pre.replace(
  /return \[\.\.\.ready\]\.sort\(\(a, b\) => comparePlayerPriority\(a, b, currentTime\)\);/,
  `return [...ready].sort((a, b) => {
      const matchDiff = getPlayerEffectiveMatchCount(a) - getPlayerEffectiveMatchCount(b);
      if (matchDiff !== 0) return matchDiff;
      return comparePlayerPriority(a, b, currentTime);
    });`
);

// All visible player counts in PreMatchView become Match counts.
// Examples: p.gamesPlayed, stagedA1.gamesPlayed, player.gamesPlayed.
pre = pre.replace(
  /\{([A-Za-z_][A-Za-z0-9_]*)\.gamesPlayed\}\s*Set/g,
  '{getPlayerMatchCount($1)} Match'
);

// Waiting queue effective count.
pre = pre.replace(
  /\{getPlayerEffectiveGames\(player\)\}\s*Set/g,
  '{getPlayerEffectiveMatchCount(player)} Match'
);

// Queue header.
pre = pre.replace(/Setที่เล่นแล้ว/g, 'Match ที่เล่นแล้ว');
pre = pre.replace(/Sets Played/g, 'Matches Played');

// Walk-in penalty display: penalty is in Match units.
pre = pre.replace(
  /\(\+\{\(p\.walkInPenaltyMatches \?\? 1\) \* 2\} โทษ\)/g,
  '(+{p.walkInPenaltyMatches ?? 1} Match)'
);

// Remove unused imported helper if no longer referenced.
if (!pre.includes('getPlayerEffectiveGames(')) {
  pre = pre.replace(/,\s*getPlayerEffectiveGames\s*/g, ' ');
}

fs.writeFileSync(prePath, pre, 'utf8');

// ============================================================
// 2) MEMBER / CHECK-IN PAGE
//    Show Match count.
// ============================================================
let check = fs.readFileSync(checkPath, 'utf8');

check = check.replace(
  /\{player\.gamesPlayed\}<\/strong>\s*Set/g,
  `{(player.matchesPlayed ?? Math.floor((player.gamesPlayed || 0) / 2))}</strong> Match`
);

// A few versions may have the number outside strong formatting.
check = check.replace(
  /\{player\.gamesPlayed\}\s*Set/g,
  `{(player.matchesPlayed ?? Math.floor((player.gamesPlayed || 0) / 2))} Match`
);

check = check.replace(/จำนวน Set/g, 'จำนวน Match');
check = check.replace(/เล่นไปแล้ว:\s*/g, 'เล่นไปแล้ว: ');

fs.writeFileSync(checkPath, check, 'utf8');

// ============================================================
// 3) BILLING PAGE
//    IMPORTANT: Charge shuttle by Match, not Set.
// ============================================================
let bill = fs.readFileSync(billingPath, 'utf8');

// First convert existing usages BEFORE inserting helper,
// so helper fallback to gamesPlayed is not accidentally rewritten.
bill = bill.replace(/activeMember\.gamesPlayed/g, 'getPlayerMatchCount(activeMember)');
bill = bill.replace(/player\.gamesPlayed/g, 'getPlayerMatchCount(player)');
bill = bill.replace(/\bp\.gamesPlayed\b/g, 'getPlayerMatchCount(p)');

// Rename total counter from Games to Matches.
bill = bill.replace(/totalGamesPlayed/g, 'totalMatchesPlayed');

// Insert helper after eligiblePlayers.
if (!bill.includes('const getPlayerMatchCount = (player: Player): number =>')) {
  const eligibleRegex =
    /  const eligiblePlayers = checkedInPlayers\.length > 0 \? checkedInPlayers : players;/;

  const m = bill.match(eligibleRegex);
  if (!m) {
    console.error('❌ หา eligiblePlayers ใน BillingView ไม่เจอ');
    process.exit(3);
  }

  const helper = `${m[0]}

  // Billing source of truth = Match count.
  // gamesPlayed remains the legacy Set counter for backward compatibility only.
  const getPlayerMatchCount = (player: Player): number => {
    const matches = Number(player.matchesPlayed ?? 0);
    const sets = Number(player.gamesPlayed ?? 0);

    if (Number.isFinite(matches) && (matches > 0 || sets === 0)) {
      return Math.max(0, matches);
    }

    return Math.max(0, Math.floor(sets / 2));
  };`;

  bill = bill.replace(m[0], helper);
}

// Fix total aggregation if the original line still references direct property.
bill = bill.replace(
  /const totalMatchesPlayed = eligiblePlayers\.reduce\(\(acc, p\) => acc \+ [^,;]+,\s*0\);/,
  'const totalMatchesPlayed = eligiblePlayers.reduce((acc, p) => acc + getPlayerMatchCount(p), 0);'
);

// Billing/member-facing wording is Match, not Set.
bill = bill.replace(/จำนวนSet/g, 'จำนวน Match');
bill = bill.replace(/จำนวน Set/g, 'จำนวน Match');
bill = bill.replace(/\bSet\b/g, 'Match');
bill = bill.replace(/แมตช์/g, 'Match');

// Comments/headers.
bill = bill.replace(/Games Played/g, 'Matches Played');
bill = bill.replace(/total Sets/gi, 'total Matches');

fs.writeFileSync(billingPath, bill, 'utf8');

// ============================================================
// 4) Verification / report
// ============================================================
const preFinal = fs.readFileSync(prePath, 'utf8');
const checkFinal = fs.readFileSync(checkPath, 'utf8');
const billFinal = fs.readFileSync(billingPath, 'utf8');

const checks = [
  ['Queue has Match helper', preFinal.includes('getPlayerMatchCount')],
  ['Queue header uses Match', preFinal.includes('Match ที่เล่นแล้ว') || preFinal.includes('Match')),
  ['Queue no visible gamesPlayed Set pattern', !/\{[A-Za-z_][A-Za-z0-9_]*\.gamesPlayed\}\s*Set/.test(preFinal)],
  ['Member page uses matchesPlayed', checkFinal.includes('matchesPlayed')],
  ['Billing helper uses matchesPlayed', billFinal.includes('player.matchesPlayed')],
  ['Billing total uses Match count', billFinal.includes('totalMatchesPlayed')],
  ['Billing no direct player.gamesPlayed charge', !billFinal.includes('player.gamesPlayed * shuttlecockFeePerMatch')],
  ['Billing no direct p.gamesPlayed export/display', !billFinal.includes('p.gamesPlayed')],
];

console.log('');
console.log('=== VERIFY ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

console.log('');
console.log('Terminology rule:');
console.log('  • Match = หน่วยหลักสำหรับคิว / สมาชิก / คิดเงิน');
console.log('  • Set   = ฟิลด์เดิม gamesPlayed (เก็บไว้เพื่อ compatibility)');
console.log('  • 1 Match = matchesPlayed +1');
console.log('  • ค่าลูกต่อ Match ใช้ matchesPlayed × rate');
console.log('');

if (!ok) {
  console.error('❌ Patch บางจุดไม่ตรงกับเวอร์ชันไฟล์ปัจจุบัน กรุณาส่งไฟล์ล่าสุดมาให้ตรวจ');
  process.exit(10);
}

console.log('✅ แก้เรียบร้อย');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const prePath = path.join(root, 'src', 'components', 'PreMatchView.tsx');
const checkPath = path.join(root, 'src', 'components', 'CheckInView.tsx');

for (const f of [prePath, checkPath]) {
  if (!fs.existsSync(f)) {
    console.error('❌ ไม่พบไฟล์:', f);
    process.exit(1);
  }
}

function backup(file) {
  const bak = file + '.bak-force-match-label';
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backup:', bak);
  }
}

backup(prePath);
backup(checkPath);

// ============================================================
// CHECK-IN / MEMBER PAGE
// ============================================================
let check = fs.readFileSync(checkPath, 'utf8');

// Exact known line
check = check.replace(
  /เล่นไปแล้ว:\s*<strong className="text-white font-bold">\{player\.gamesPlayed\}<\/strong>\s*(เกม|Set|Game|Games)/g,
  `เล่นไปแล้ว: <strong className="text-white font-bold">{player.matchesPlayed ?? Math.floor((player.gamesPlayed || 0) / 2)}</strong> Match`
);

// Fallback variants
check = check.replace(
  /\{player\.gamesPlayed\}\s*(เกม|Set|Game|Games)/g,
  `{player.matchesPlayed ?? Math.floor((player.gamesPlayed || 0) / 2)} Match`
);

fs.writeFileSync(checkPath, check, 'utf8');

// ============================================================
// PRE-MATCH / QUEUE PAGE
// ============================================================
let pre = fs.readFileSync(prePath, 'utf8');

// Add Match helpers once.
if (!pre.includes('const getMatchCountForDisplay = (player: Player) =>')) {
  const getPlayerRegex =
    /  const getPlayer = \(id: string\): Player \| undefined => \{\s*return players\.find\(\(p\) => p\.id === id\);\s*\};/;

  const m = pre.match(getPlayerRegex);
  if (!m) {
    console.error('❌ หา getPlayer() ใน PreMatchView ไม่เจอ');
    process.exit(2);
  }

  const helper = `${m[0]}

  // Queue / member display uses MATCH as the primary unit.
  const getMatchCountForDisplay = (player: Player): number => {
    const matches = Number(player.matchesPlayed ?? 0);
    if (Number.isFinite(matches) && matches >= 0) return matches;
    return Math.max(0, Math.floor(Number(player.gamesPlayed || 0) / 2));
  };

  const getEffectiveMatchCountForDisplay = (player: Player): number => {
    return getMatchCountForDisplay(player) + Math.max(0, Number(player.walkInPenaltyMatches ?? 0));
  };`;

  pre = pre.replace(m[0], helper);
}

// Header in waiting queue
pre = pre.replace(/เกมที่เล่นแล้ว/g, 'Match ที่เล่นแล้ว');
pre = pre.replace(/Setที่เล่นแล้ว/g, 'Match ที่เล่นแล้ว');
pre = pre.replace(/Set ที่เล่นแล้ว/g, 'Match ที่เล่นแล้ว');

// Replace every visible "X.gamesPlayed เกม/Set" on PreMatch page with Match count.
pre = pre.replace(
  /\{([A-Za-z_][A-Za-z0-9_]*)\.gamesPlayed\}\s*(เกม|Set|Game|Games)/g,
  `{getMatchCountForDisplay($1)} Match`
);

// Known waiting queue direct expression.
pre = pre.replace(
  /\{player\.gamesPlayed\}\s*(เกม|Set|Game|Games)/g,
  `{getMatchCountForDisplay(player)} Match`
);

// Queue effective count: use Match + walk-in penalty, not game/set count.
pre = pre.replace(
  /\{getPlayerEffectiveGames\(player\)\}\s*(เกม|Set|Game|Games)/g,
  `{getEffectiveMatchCountForDisplay(player)} Match`
);

// If previous patch already changed label but left old function.
pre = pre.replace(
  /\{getPlayerEffectiveGames\(player\)\}\s*Match/g,
  `{getEffectiveMatchCountForDisplay(player)} Match`
);

// General label comments/text in queue.
pre = pre.replace(/Games Played/g, 'Matches Played');

fs.writeFileSync(prePath, pre, 'utf8');

// ============================================================
// VERIFY
// ============================================================
const checkFinal = fs.readFileSync(checkPath, 'utf8');
const preFinal = fs.readFileSync(prePath, 'utf8');

const checks = [
  ['Member: "เล่นไปแล้ว" uses Match', /เล่นไปแล้ว:[\s\S]{0,120}Match/.test(checkFinal)],
  ['Member: exact old line removed', !/เล่นไปแล้ว:[\s\S]{0,120}\{player\.gamesPlayed\}[\s]*(เกม|Set)/.test(checkFinal)],
  ['Queue: header uses Match', preFinal.includes('Match ที่เล่นแล้ว')],
  ['Queue: old header removed', !preFinal.includes('เกมที่เล่นแล้ว')],
  ['Queue: player.gamesPlayed + เกม removed', !/\{player\.gamesPlayed\}\s*เกม/.test(preFinal)],
  ['Queue: effective count uses Match helper', preFinal.includes('getEffectiveMatchCountForDisplay(player)')],
];

console.log('');
console.log('=== VERIFY ===');
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? '✅' : '❌'} ${name}`);
  if (!pass) ok = false;
}

if (!ok) {
  console.error('\n❌ ยังมีจุดไม่ตรง กรุณาส่ง CheckInView.tsx และ PreMatchView.tsx ล่าสุดมา');
  process.exit(10);
}

console.log('');
console.log('✅ หน้า Member: เล่นไปแล้ว = Match');
console.log('✅ หน้า Queue: จำนวนที่เล่น = Match');
console.log('✅ Queue calculation ใช้ Match count');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');
console.log('  npm.cmd run dev');

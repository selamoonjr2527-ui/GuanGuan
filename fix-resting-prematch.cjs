const fs = require('fs');
const path = require('path');

const target = path.join(process.cwd(), 'src', 'components', 'PreMatchView.tsx');

if (!fs.existsSync(target)) {
  console.error('ไม่พบไฟล์:', target);
  process.exit(1);
}

let text = fs.readFileSync(target, 'utf8');
const backup = target + '.bak-resting-fix';

if (!fs.existsSync(backup)) {
  fs.copyFileSync(target, backup);
  console.log('Backup:', backup);
}

let changed = 0;

// 1) PM manual picker: allow only genuinely ready players.
//    This removes Resting / Playing / Left / Not Check-in from every PM dropdown.
const oldPicker = `  // Organizer manual picker can see every checked-in player:
  // Waiting, Playing, Resting, PM1 and PM2.
  const manualSelectablePlayers = useMemo(() => {
    return players.filter((p) => p.isCheckedIn && p.status !== 'left');
  }, [players]);`;

const newPicker = `  // Organizer manual picker: only players who are truly ready can be selected.
  // STRICT: Resting / Playing / Left / Not Check-in must never appear in Pre-Match dropdowns.
  // Players already in PM1/PM2 remain selectable because their player status is still "waiting".
  const manualSelectablePlayers = useMemo(() => {
    return players.filter(
      (p) =>
        p.isCheckedIn &&
        p.status === 'waiting' &&
        !playingPlayerIds.has(p.id)
    );
  }, [players, playingPlayerIds]);`;

if (text.includes(oldPicker)) {
  text = text.replace(oldPicker, newPicker);
  changed++;
} else if (!text.includes('STRICT: Resting / Playing / Left / Not Check-in must never appear')) {
  console.error('ไม่พบ block manualSelectablePlayers ที่คาดไว้');
  process.exit(2);
}

// 2) Immediately clear stale local PM drafts if a player becomes unavailable/resting.
const marker = `  const manualSelectablePlayerIds = useMemo(() => {
    return new Set(manualSelectablePlayers.map((p) => p.id));
  }, [manualSelectablePlayers]);`;

const markerWithCleanup = `  const manualSelectablePlayerIds = useMemo(() => {
    return new Set(manualSelectablePlayers.map((p) => p.id));
  }, [manualSelectablePlayers]);

  // If somebody presses "พักเหนื่อย" while still in a local PM draft,
  // drop that draft immediately so the resting name cannot remain on screen
  // and cannot reappear automatically later.
  useEffect(() => {
    const draftIsAvailable = (
      draft: { teamA: [string, string]; teamB: [string, string]; notes?: string } | null
    ) => {
      if (!draft) return true;
      return [...draft.teamA, ...draft.teamB].every((id) =>
        manualSelectablePlayerIds.has(id)
      );
    };

    if (customDraft1 && !draftIsAvailable(customDraft1)) {
      setCustomDraft1(null);
    }
    if (customDraft2 && !draftIsAvailable(customDraft2)) {
      setCustomDraft2(null);
    }
  }, [manualSelectablePlayerIds, customDraft1, customDraft2]);`;

if (text.includes(marker) && !text.includes('drop that draft immediately so the resting name cannot remain')) {
  text = text.replace(marker, markerWithCleanup);
  changed++;
}

// 3) Defense-in-depth: even if the UI is stale for a moment,
//    selecting a resting/unavailable player is rejected and NEVER changes status to waiting.
const swapStart = `  ) => {
    if (!currentStagingLineup || !newPlayerId) return;

    const currentPlayerId =`;

const swapGuard = `  ) => {
    if (!currentStagingLineup || !newPlayerId) return;

    const nextPlayer = getPlayer(newPlayerId);
    const isUnavailable =
      !nextPlayer ||
      !nextPlayer.isCheckedIn ||
      nextPlayer.status !== 'waiting' ||
      playingPlayerIds.has(newPlayerId);

    if (isUnavailable) {
      const statusLabel =
        nextPlayer?.status === 'resting'
          ? 'กำลังพักเหนื่อย'
          : nextPlayer?.status === 'playing'
          ? 'กำลังเล่นอยู่'
          : !nextPlayer?.isCheckedIn
          ? 'ยังไม่ได้ Check-in'
          : 'ยังไม่พร้อมลงคิว';

      setActionNotice(
        \`⛔ เลือก \${nextPlayer?.nickname || 'ผู้เล่นนี้'} ไม่ได้ • \${statusLabel}\`
      );
      setTimeout(() => setActionNotice(null), 3500);
      return;
    }

    const currentPlayerId =`;

if (text.includes(swapStart) && !text.includes('const isUnavailable =')) {
  text = text.replace(swapStart, swapGuard);
  changed++;
}

// 4) Update stale comments / unreachable resting ranking.
text = text.replace(
  `  // Organizer picker includes Waiting + Playing + Resting + PM1 + PM2.`,
  `  // Organizer picker includes READY players only (waiting + checked-in + not on court).`
);
text = text.replace(
  `      if (p.status === 'waiting') return 3;
      if (p.status === 'resting') return 4;
      return 5;`,
  `      if (p.status === 'waiting') return 3;
      return 5;`
);

fs.writeFileSync(target, text, 'utf8');

console.log('');
console.log('✅ แก้ PreMatchView.tsx แล้ว');
console.log('   - คนพักเหนื่อยไม่อยู่ใน PM dropdown');
console.log('   - คนกำลังเล่น / Check-out / ยังไม่ Check-in ไม่อยู่ใน PM dropdown');
console.log('   - Draft ที่มีคนพักจะถูกล้างทันที');
console.log('   - เลือกคนพักจาก UI ค้างไม่ได้ และจะไม่เปลี่ยน status เป็น waiting');
console.log('');
console.log('ต่อไปให้รัน:');
console.log('  npm.cmd run build');

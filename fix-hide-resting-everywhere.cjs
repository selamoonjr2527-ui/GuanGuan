const fs = require('fs');
const path = require('path');

const root = process.cwd();
const appPath = path.join(root, 'src', 'App.tsx');
const pmPath = path.join(root, 'src', 'components', 'PreMatchView.tsx');

function mustExist(file) {
  if (!fs.existsSync(file)) {
    console.error('ไม่พบไฟล์:', file);
    process.exit(1);
  }
}

mustExist(appPath);
mustExist(pmPath);

function backup(file, suffix) {
  const bak = file + suffix;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(file, bak);
    console.log('Backup:', bak);
  }
}

backup(appPath, '.bak-hide-resting');
backup(pmPath, '.bak-hide-resting');

let app = fs.readFileSync(appPath, 'utf8');
let pm = fs.readFileSync(pmPath, 'utf8');

// ============================================================
// PREMATCH VIEW
// ============================================================

// 1) Manual picker: READY only.
const pickerOld = `  // Organizer manual picker can see every checked-in player:
  // Waiting, Playing, Resting, PM1 and PM2.
  const manualSelectablePlayers = useMemo(() => {
    return players.filter((p) => p.isCheckedIn && p.status !== 'left');
  }, [players]);`;

const pickerNew = `  // Organizer manual picker: READY players only.
  // Resting / Playing / Left / Not Check-in are hidden from PM selection.
  const manualSelectablePlayers = useMemo(() => {
    return players.filter(
      (p) =>
        p.isCheckedIn &&
        p.status === 'waiting' &&
        !playingPlayerIds.has(p.id)
    );
  }, [players, playingPlayerIds]);`;

if (pm.includes(pickerOld)) {
  pm = pm.replace(pickerOld, pickerNew);
} else if (!pm.includes('Resting / Playing / Left / Not Check-in are hidden from PM selection.')) {
  console.warn('⚠️ ไม่พบ manualSelectablePlayers รูปแบบเดิม อาจเคยแก้ไปแล้ว');
}

// 2) Clean stale local PM drafts immediately when a selected player becomes resting/unavailable.
const idsBlock = `  const manualSelectablePlayerIds = useMemo(() => {
    return new Set(manualSelectablePlayers.map((p) => p.id));
  }, [manualSelectablePlayers]);`;

const idsBlockNew = `  const manualSelectablePlayerIds = useMemo(() => {
    return new Set(manualSelectablePlayers.map((p) => p.id));
  }, [manualSelectablePlayers]);

  // Remove any local PM draft as soon as one of its players is no longer READY.
  useEffect(() => {
    const isDraftReady = (
      draft: { teamA: [string, string]; teamB: [string, string]; notes?: string } | null
    ) => {
      if (!draft) return true;
      return [...draft.teamA, ...draft.teamB].every((id) =>
        manualSelectablePlayerIds.has(id)
      );
    };

    if (customDraft1 && !isDraftReady(customDraft1)) {
      setCustomDraft1(null);
    }

    if (customDraft2 && !isDraftReady(customDraft2)) {
      setCustomDraft2(null);
    }
  }, [manualSelectablePlayerIds, customDraft1, customDraft2]);`;

if (pm.includes(idsBlock) && !pm.includes('Remove any local PM draft as soon as one of its players is no longer READY.')) {
  pm = pm.replace(idsBlock, idsBlockNew);
}

// 3) Defense-in-depth for stale dropdown UI.
const swapOld = `  ) => {
    if (!currentStagingLineup || !newPlayerId) return;

    const currentPlayerId =`;

const swapNew = `  ) => {
    if (!currentStagingLineup || !newPlayerId) return;

    const candidate = getPlayer(newPlayerId);
    const candidateReady =
      !!candidate &&
      candidate.isCheckedIn &&
      candidate.status === 'waiting' &&
      !playingPlayerIds.has(newPlayerId);

    if (!candidateReady) {
      const reason =
        candidate?.status === 'resting'
          ? 'กำลังพักเหนื่อย'
          : candidate?.status === 'playing'
          ? 'กำลังเล่นอยู่'
          : !candidate?.isCheckedIn
          ? 'ยังไม่ได้ Check-in'
          : 'ยังไม่พร้อมลงคิว';

      setActionNotice(
        \`⛔ \${candidate?.nickname || 'ผู้เล่นนี้'} เลือกไม่ได้ • \${reason}\`
      );
      setTimeout(() => setActionNotice(null), 3500);
      return;
    }

    const currentPlayerId =`;

if (pm.includes(swapOld) && !pm.includes('const candidateReady =')) {
  pm = pm.replace(swapOld, swapNew);
}

// 4) Remove stale wording/ranking for Resting from picker.
pm = pm.replace(
  `  // Organizer picker includes Waiting + Playing + Resting + PM1 + PM2.`,
  `  // Organizer picker contains READY players only.`
);
pm = pm.replace(
  `      if (p.status === 'waiting') return 3;
      if (p.status === 'resting') return 4;
      return 5;`,
  `      if (p.status === 'waiting') return 3;
      return 5;`
);

fs.writeFileSync(pmPath, pm, 'utf8');

// ============================================================
// APP
// ============================================================

// 5) CourtsView must not receive Resting / Left / Not Check-in as selectable people.
// Keep Playing players so current court display still resolves names correctly.
const courtsOld = `          <CourtsView
            sessionConfig={sessionConfig}
            players={players}`;

const courtsNew = `          <CourtsView
            sessionConfig={sessionConfig}
            players={players.filter(
              (p) =>
                p.isCheckedIn &&
                p.status !== 'resting' &&
                p.status !== 'left'
            )}`;

if (app.includes(courtsOld)) {
  app = app.replace(courtsOld, courtsNew);
} else if (!app.includes("p.status !== 'resting'")) {
  console.warn('⚠️ ไม่พบ CourtsView players={players} รูปแบบเดิม');
}

// 6) Block PM confirmation if a Resting/Left/Not Check-in player somehow remains in stale UI.
const confirmOld = `  const handleConfirmPreMatch = (preMatch: ConfirmedPreMatch, slotNumber: 1 | 2 = 1) => {
    const preMatchPlayerIds = new Set([...preMatch.teamA, ...preMatch.teamB]);
    setAppState((prev) => {`;

const confirmNew = `  const handleConfirmPreMatch = (preMatch: ConfirmedPreMatch, slotNumber: 1 | 2 = 1) => {
    const preMatchPlayerIds = new Set([...preMatch.teamA, ...preMatch.teamB]);

    const unavailablePlayers = appState.players.filter(
      (p) =>
        preMatchPlayerIds.has(p.id) &&
        (!p.isCheckedIn || p.status === 'resting' || p.status === 'left')
    );

    if (unavailablePlayers.length > 0) {
      window.alert(
        \`จัด Pre-Match ไม่ได้\\n\\n\${unavailablePlayers
          .map((p) => \`• \${p.nickname} — \${p.status === 'resting' ? 'พักเหนื่อย' : 'ไม่พร้อมเล่น'}\`)
          .join('\\n')}\\n\\nให้สมาชิกกด "หายเหนื่อยแล้ว" ก่อน\`
      );
      return;
    }

    setAppState((prev) => {`;

if (app.includes(confirmOld) && !app.includes('ให้สมาชิกกด "หายเหนื่อยแล้ว" ก่อน')) {
  app = app.replace(confirmOld, confirmNew);
}

// 7) Block direct court start too.
const startOld = `    const duplicatePlayers = [...allPlayerIds].filter((id) => playingIds.has(id));
    if (duplicatePlayers.length > 0) {
      console.warn(\`Cannot start match: player(s) already on court:\`, duplicatePlayers);
      return;
    }

    const newMatch: ActiveMatch = {`;

const startNew = `    const duplicatePlayers = [...allPlayerIds].filter((id) => playingIds.has(id));
    if (duplicatePlayers.length > 0) {
      console.warn(\`Cannot start match: player(s) already on court:\`, duplicatePlayers);
      return;
    }

    const unavailablePlayers = players.filter(
      (p) =>
        allPlayerIds.has(p.id) &&
        (!p.isCheckedIn || p.status === 'resting' || p.status === 'left')
    );

    if (unavailablePlayers.length > 0) {
      window.alert(
        \`ลงคอร์ทไม่ได้\\n\\n\${unavailablePlayers
          .map((p) => \`• \${p.nickname} — \${p.status === 'resting' ? 'พักเหนื่อย' : 'ไม่พร้อมเล่น'}\`)
          .join('\\n')}\\n\\nให้สมาชิกกด "หายเหนื่อยแล้ว" ก่อน\`
      );
      return;
    }

    const newMatch: ActiveMatch = {`;

if (app.includes(startOld) && !app.includes('ลงคอร์ทไม่ได้\\n\\n')) {
  app = app.replace(startOld, startNew);
}

fs.writeFileSync(appPath, app, 'utf8');

console.log('');
console.log('✅ ซ่อน Resting ครบแล้ว');
console.log('   • PM1 Auto Queue       : ซ่อน');
console.log('   • PM2 Auto Queue       : ซ่อน');
console.log('   • PM Manual Picker     : ซ่อน');
console.log('   • Court Picker         : ซ่อน');
console.log('   • Confirm Pre-Match    : Block');
console.log('   • Start Court          : Block');
console.log('   • Resting Status list  : ยังแสดง เพื่อให้รู้ว่าใครกำลังพัก');
console.log('');
console.log('คนพักจะกลับมาในรายการเลือกได้เมื่อกด "หายเหนื่อยแล้ว" เท่านั้น');
console.log('');
console.log('ทดสอบต่อด้วย: npm.cmd run build');

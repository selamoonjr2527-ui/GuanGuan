import { collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase'; // FORCE_ARCHIVE_PURGE_V66D
import React, { useMemo, useRef, useState } from 'react';
import type { DailySessionArchive, MatchHistoryItem, Player } from '../types';
import type { AppState } from '../utils/storage';
import {
  deleteSessionArchive,
  loadSessionArchives,
  saveSessionArchive,
  replaceSessionArchivesLocal,
} from '../utils/storage';
import {
  deleteSessionArchiveFromFirestore,
  upsertSessionArchiveToFirestore,
} from '../utils/firestoreCollectionsSync'; // ARCHIVE_DELETE_SYNC_V66A

interface DataStatsManagerV66Props {
  isOpen: boolean;
  onClose: () => void;
  currentState: AppState;
  onApplyState: (nextState: AppState) => void;
  onArchivesChanged: () => void;
}

type ImportKind =
  | 'v66-current'
  | 'v66-archive'
  | 'raw-archive'
  | 'historical-v1'
  | 'unknown';

interface ImportPreview {
  kind: ImportKind;
  data: any;
  fileName: string;
  sessionDate?: string;
  memberCount: number;
  matchCount: number;
  resolvedMembers: number;
  unresolvedNames: string[];
  duplicateNames: string[];
  notes: string[];
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const downloadJson = (fileName: string, payload: unknown) => {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const safeStamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const isSessionParticipant = (p?: Player | null) =>
  Boolean(
    p &&
      (p.isCheckedIn ||
        p.status === 'left' ||
        Boolean(p.checkInTime) ||
        Boolean(p.checkInTimestamp) ||
        Number(p.matchesPlayed || 0) > 0 ||
        Number(p.gamesPlayed || 0) > 0 ||
        Number(p.extraShuttlecocks || 0) > 0 ||
        Boolean(p.paid))
  );

const groupNewestArchiveByDate = (archives: DailySessionArchive[]) => {
  const byDate = new Map<string, DailySessionArchive>();
  for (const archive of archives) {
    const existing = byDate.get(archive.archiveDate);
    if (!existing || Number(archive.savedAt || 0) > Number(existing.savedAt || 0)) {
      byDate.set(archive.archiveDate, archive);
    }
  }
  return Array.from(byDate.values()).sort((a, b) =>
    a.archiveDate.localeCompare(b.archiveDate)
  );
};

const findCurrentPlayerByArchiveSnapshot = (
  currentPlayers: Player[],
  snapshot: Player
): Player | null => {
  const exact = currentPlayers.find((p) => p.id === snapshot.id);
  if (exact) return exact;
  const sameName = currentPlayers.filter(
    (p) => p.nickname.trim().toLowerCase() === snapshot.nickname.trim().toLowerCase()
  );
  return sameName.length === 1 ? sameName[0] : null;
};

const parseScore = (value: unknown): [number | undefined, number | undefined] => {
  const text = String(value ?? '').trim();
  const match = text.match(/^(\d+)\s*[-:]\s*(\d+)$/);
  if (!match) return [undefined, undefined];
  return [Number(match[1]), Number(match[2])];
};

const makeHistoricalArchive = (
  raw: any,
  currentState: AppState
): { archive: DailySessionArchive | null; unresolved: string[]; duplicate: string[] } => {
  const historicalPlayers = Array.isArray(raw?.players) ? raw.players : [];
  const currentPlayers = currentState.players || [];
  const normalizedMap = new Map<string, Player[]>();

  for (const p of currentPlayers) {
    const key = String(p.nickname || '').trim().toLowerCase();
    const list = normalizedMap.get(key) || [];
    list.push(p);
    normalizedMap.set(key, list);
  }

  const unresolved: string[] = [];
  const duplicate: string[] = [];
  const resolvedByName = new Map<string, Player>();

  for (const hp of historicalPlayers) {
    const nickname = String(hp?.nickname || '').trim();
    if (!nickname) continue;
    const matches = normalizedMap.get(nickname.toLowerCase()) || [];
    if (matches.length === 1) {
      resolvedByName.set(nickname.toLowerCase(), matches[0]);
    } else if (matches.length === 0) {
      unresolved.push(nickname);
    } else {
      duplicate.push(nickname);
    }
  }

  const rawMatches = Array.isArray(raw?.matches) ? raw.matches : [];
  for (const m of rawMatches) {
    const names = [
      ...(Array.isArray(m?.teamANames) ? m.teamANames : []),
      ...(Array.isArray(m?.teamBNames) ? m.teamBNames : []),
    ];
    for (const value of names) {
      const nickname = String(value || '').trim();
      if (!nickname) continue;
      const candidates = normalizedMap.get(nickname.toLowerCase()) || [];
      if (candidates.length === 1) {
        resolvedByName.set(nickname.toLowerCase(), candidates[0]);
      } else if (candidates.length === 0 && !unresolved.includes(nickname)) {
        unresolved.push(nickname);
      } else if (candidates.length > 1 && !duplicate.includes(nickname)) {
        duplicate.push(nickname);
      }
    }
  }

  if (unresolved.length > 0 || duplicate.length > 0) {
    return { archive: null, unresolved, duplicate };
  }

  const session = raw?.session || {};
  const sessionDate = String(session.sessionDate || raw?.sessionDate || '').trim();
  if (!sessionDate) {
    return { archive: null, unresolved: ['ไม่พบ Session Date'], duplicate };
  }

  // Preserve current Member Master profile fields, but reset daily/session values.
  const snapshotPlayers: Player[] = currentPlayers.map((p) => ({
    ...clone(p),
    isCheckedIn: false,
    todayRoster: false,
    checkInTime: undefined,
    checkInTimestamp: undefined,
    lastMatchFinishTime: undefined,
    status: 'waiting',
    gamesPlayed: 0,
    matchesPlayed: 0,
    extraShuttlecocks: 0,
    billingMatchAdjustment: 0,
    billingAmountAdjustment: 0,
    billingAdjustmentReason: undefined,
    billingAdjustmentLog: [],
    paid: false,
    paidAmount: undefined,
    paymentMethod: undefined,
    paymentTime: undefined,
  } as Player));

  for (const hp of historicalPlayers) {
    const nickname = String(hp?.nickname || '').trim();
    const target = resolvedByName.get(nickname.toLowerCase());
    if (!target) continue;
    const idx = snapshotPlayers.findIndex((p) => p.id === target.id);
    if (idx < 0) continue;

    const matches = Math.max(0, Number(hp?.matchesPlayed || 0));
    const games = Math.max(0, Number(hp?.gamesPlayed || matches * 2));
    snapshotPlayers[idx] = {
      ...snapshotPlayers[idx],
      status: 'left',
      isCheckedIn: false,
      todayRoster: true,
      matchesPlayed: matches,
      gamesPlayed: games,
      extraShuttlecocks: Math.max(0, Number(hp?.extraShuttlecocks || 0)),
      paid: Boolean(hp?.paid),
      paidAmount:
        typeof hp?.paidAmount === 'number' && Number.isFinite(hp.paidAmount)
          ? hp.paidAmount
          : undefined,

      // HISTORICAL_PRICING_V67
      // Preserve immutable historical billing values from the imported source.
      historicalSourceFinalCharge:
        typeof hp?.sourceFinalCharge === 'number' &&
        Number.isFinite(hp.sourceFinalCharge)
          ? hp.sourceFinalCharge
          : undefined,
      historicalPaidStatus: Boolean(hp?.paid),
    } as any;
  }

  const history: MatchHistoryItem[] = rawMatches.map((m: any, index: number) => {
    const teamANames = (Array.isArray(m?.teamANames) ? m.teamANames : []).map(String);
    const teamBNames = (Array.isArray(m?.teamBNames) ? m.teamBNames : []).map(String);
    const teamAIds = teamANames.map(
      (name: string) => resolvedByName.get(name.trim().toLowerCase())!.id
    );
    const teamBIds = teamBNames.map(
      (name: string) => resolvedByName.get(name.trim().toLowerCase())!.id
    );
    const [g1A, g1B] = parseScore(m?.game1);
    const [g2A, g2B] = parseScore(m?.game2);

    return {
      id: String(m?.id || `hist-import-${sessionDate}-${index + 1}`),
      courtName: String(m?.courtName || `Court ${index + 1}`),
      teamANames,
      teamBNames,
      teamASkillAvg:
        typeof m?.teamASkillAvg === 'number' ? m.teamASkillAvg : 0,
      teamBSkillAvg:
        typeof m?.teamBSkillAvg === 'number' ? m.teamBSkillAvg : 0,
      startTime: String(m?.recordedTime || '--:--'),
      durationMinutes: Math.max(0, Number(m?.durationMinutes || 0)),
      shuttlecocksCount: Math.max(0, Number(m?.shuttlecocksCount || 0)),
      scoreA: g1A,
      scoreB: g1B,
      game1ScoreA: g1A,
      game1ScoreB: g1B,
      game2ScoreA: g2A,
      game2ScoreB: g2B,
      participantIds: [...teamAIds, ...teamBIds],
      teamAPlayerIds: teamAIds,
      teamBPlayerIds: teamBIds,
      isRoundTrip: true,
    } as MatchHistoryItem;
  });

  const archive: DailySessionArchive = {
    id: `archive-import-${sessionDate}`,
    archiveDate: sessionDate,
    sessionTitle: String(session.sessionTitle || currentState.sessionConfig.sessionTitle || 'ก๊วนกวน 🏸'),
    venueName: String(session.venueName || currentState.sessionConfig.venueName || ''),
    savedAt: Date.now(),
    totalPlayers: Math.max(
      0,
      Number(session.memberCount || historicalPlayers.length || 0)
    ),
    totalMatches: Math.max(0, Number(session.physicalMatches || history.length || 0)),
    totalShuttlecocks: Math.max(
      0,
      Number(
        session.totalShuttlecocks ||
          history.reduce((sum, match) => sum + Number(match.shuttlecocksCount || 0), 0)
      )
    ),
    totalCourtFee: Math.max(0, Number(session.venueCost || 0)),
    totalRevenue: Math.max(0, Number(session.expectedRevenue || 0)),
    totalExpense: Math.max(0, Number(session.totalExpense || 0)),
    netProfit: Number(session.expectedNetProfit || 0),
    totalCollected: Math.max(0, Number(session.actualCollected || 0)),
    pendingAmount: Math.max(0, Number(session.pendingAmount || 0)),
    venueCost: Math.max(0, Number(session.venueCost || 0)),
    shuttleCost: Math.max(0, Number(session.actualShuttleCost || 0)),
    extraExpensesTotal: 0,
    playersSnapshot: snapshotPlayers,
    matchHistorySnapshot: history,
    notes: `Imported by GuanGuan v66 from historical export${
      raw?.sourceCorrection?.note ? ` • ${raw.sourceCorrection.note}` : ''
    }`,
  };

  // HISTORICAL_PRICING_V67
  // Store historical rates with the Archive so a future rate change
  // does not rewrite old member costs.
  (archive as any).historicalPricing = {
    memberCourtFee: Math.max(
      0,
      Number(session.memberCourtFee ?? currentState.sessionConfig.memberCourtFee ?? 110)
    ),
    shuttleFeePerMatchPerPerson: Math.max(
      0,
      Number(
        session.shuttleFeePerMatchPerPerson ??
          session.shuttlecockFeePerMatchPerPerson ??
          currentState.sessionConfig.shuttlecockFeePerMatchPerPerson ??
          25
      )
    ),
    extraShuttlecockPrice: Math.max(
      0,
      Number(
        session.extraShuttlecockPrice ??
          currentState.sessionConfig.extraShuttlecockPrice ??
          25
      )
    ),
    shuttlecockCostPerPiece: Math.max(
      0,
      Number(session.shuttlecockPricePerPiece ?? 0)
    ),
    source: 'historical-import-v1',
  };
  return { archive, unresolved, duplicate };
};

export const DataStatsManagerV66: React.FC<DataStatsManagerV66Props> = ({
  isOpen,
  onClose,
  currentState,
  onApplyState,
  onArchivesChanged,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [confirmWord, setConfirmWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const archives = useMemo(() => {
    if (!isOpen) return [];
    return loadSessionArchives().sort((a, b) =>
      b.archiveDate.localeCompare(a.archiveDate)
    );
  }, [isOpen, notice]);

  const duplicateDateCount = useMemo(() => {
    const counts = new Map<string, number>();
    archives.forEach((a) => counts.set(a.archiveDate, (counts.get(a.archiveDate) || 0) + 1));
    return Array.from(counts.values()).filter((count) => count > 1).length;
  }, [archives]);

  if (!isOpen) return null;

  const autoBackupCurrentState = (reason: string) => {
    downloadJson(
      `GuanGuan_AUTO_BACKUP_${currentState.sessionConfig.date}_${reason}_${safeStamp()}.json`,
      {
        format: 'guanguan-day-backup-v66',
        backupType: 'current-session',
        sessionDate: currentState.sessionConfig.date,
        exportedAt: Date.now(),
        reason,
        data: currentState,
      }
    );
  };

  const handleExportCurrent = () => {
    downloadJson(
      `GuanGuan_DayBackup_${currentState.sessionConfig.date}_${safeStamp()}.json`,
      {
        format: 'guanguan-day-backup-v66',
        backupType: 'current-session',
        sessionDate: currentState.sessionConfig.date,
        exportedAt: Date.now(),
        data: currentState,
      }
    );
  };

  const handleExportArchive = (archive: DailySessionArchive) => {
    downloadJson(
      `GuanGuan_ArchiveBackup_${archive.archiveDate}_${safeStamp()}.json`,
      {
        format: 'guanguan-day-backup-v66',
        backupType: 'archive',
        sessionDate: archive.archiveDate,
        exportedAt: Date.now(),
        data: archive,
      }
    );
  };

  const handleChooseImport = () => {
    setPreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const inspectImport = (raw: any, fileName: string): ImportPreview => {
    if (raw?.format === 'guanguan-day-backup-v66' && raw?.backupType === 'current-session') {
      const data = raw?.data || {};
      return {
        kind: 'v66-current',
        data,
        fileName,
        sessionDate: String(raw?.sessionDate || data?.sessionConfig?.date || ''),
        memberCount: Array.isArray(data?.players) ? data.players.length : 0,
        matchCount: Array.isArray(data?.matchHistory) ? data.matchHistory.length : 0,
        resolvedMembers: Array.isArray(data?.players) ? data.players.length : 0,
        unresolvedNames: [],
        duplicateNames: [],
        notes: [
          'Full Current Session Restore: จะเขียนทับ Current Session state ทั้งชุด',
          'ระบบจะดาวน์โหลด Auto Backup ก่อน Restore',
        ],
      };
    }

    if (raw?.format === 'guanguan-day-backup-v66' && raw?.backupType === 'archive') {
      const archive = raw?.data || {};
      return {
        kind: 'v66-archive',
        data: archive,
        fileName,
        sessionDate: String(raw?.sessionDate || archive?.archiveDate || ''),
        memberCount: Array.isArray(archive?.playersSnapshot)
          ? archive.playersSnapshot.filter(isSessionParticipant).length
          : 0,
        matchCount: Array.isArray(archive?.matchHistorySnapshot)
          ? archive.matchHistorySnapshot.length
          : 0,
        resolvedMembers: Array.isArray(archive?.playersSnapshot)
          ? archive.playersSnapshot.filter(isSessionParticipant).length
          : 0,
        unresolvedNames: [],
        duplicateNames: [],
        notes: ['Archive Restore: ถ้าวันเดียวกันมีอยู่แล้วจะ Replace วันนั้น'],
      };
    }

    if (
      raw?.archiveDate &&
      Array.isArray(raw?.playersSnapshot) &&
      Array.isArray(raw?.matchHistorySnapshot)
    ) {
      return {
        kind: 'raw-archive',
        data: raw,
        fileName,
        sessionDate: String(raw.archiveDate || ''),
        memberCount: raw.playersSnapshot.filter(isSessionParticipant).length,
        matchCount: raw.matchHistorySnapshot.length,
        resolvedMembers: raw.playersSnapshot.filter(isSessionParticipant).length,
        unresolvedNames: [],
        duplicateNames: [],
        notes: ['ตรวจพบ DailySessionArchive JSON รุ่นเดิม • จะ Import/Replace ตามวันที่'],
      };
    }

    if (raw?.format === 'guanguan-historical-import-v1') {
      const converted = makeHistoricalArchive(raw, currentState);
      return {
        kind: 'historical-v1',
        data: converted.archive || raw,
        fileName,
        sessionDate: String(raw?.session?.sessionDate || ''),
        memberCount: Array.isArray(raw?.players) ? raw.players.length : 0,
        matchCount: Array.isArray(raw?.matches) ? raw.matches.length : 0,
        resolvedMembers:
          (Array.isArray(raw?.players) ? raw.players.length : 0) -
          converted.unresolved.length -
          converted.duplicate.length,
        unresolvedNames: converted.unresolved,
        duplicateNames: converted.duplicate,
        notes: [
          'Historical Import v1: จับคู่ Nickname กับ Member Master ปัจจุบัน',
          ...(Array.isArray(raw?.warnings) ? raw.warnings.map(String) : []),
        ],
      };
    }

    return {
      kind: 'unknown',
      data: raw,
      fileName,
      memberCount: 0,
      matchCount: 0,
      resolvedMembers: 0,
      unresolvedNames: [],
      duplicateNames: [],
      notes: ['ไม่รู้จักรูปแบบไฟล์นี้'],
    };
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      setPreview(inspectImport(raw, file.name));
      setNotice('');
    } catch (error) {
      console.error(error);
      window.alert('อ่านไฟล์ Import ไม่ได้ • ต้องเป็น JSON ที่ถูกต้อง');
    }
  };

  const replaceArchiveByDate = async (archive: DailySessionArchive) => {
    const currentArchives = loadSessionArchives();
    const sameDate = currentArchives.filter(
      (item) => item.archiveDate === archive.archiveDate
    );

    if (sameDate.length > 0) {
      downloadJson(
        `GuanGuan_AUTO_ARCHIVE_BACKUP_${archive.archiveDate}_${safeStamp()}.json`,
        {
          format: 'guanguan-archive-date-backup-v66',
          sessionDate: archive.archiveDate,
          exportedAt: Date.now(),
          archives: sameDate,
        }
      );
      // ARCHIVE_DELETE_SYNC_V66A
      await Promise.all(
        sameDate.map((item) => deleteSessionArchiveFromFirestore(item.id))
      );
      sameDate.forEach((item) => deleteSessionArchive(item.id));
    }

    const normalized: DailySessionArchive = {
      ...clone(archive),
      // Always use a fresh ID when replacing a date. This avoids an async
      // delete/set race if the imported backup carries the same archive ID.
      id:
        sameDate.length > 0
          ? `archive-restore-${archive.archiveDate}-${Date.now()}`
          : archive.id || `archive-import-${archive.archiveDate}-${Date.now()}`,
      savedAt: Date.now(),
    };
    saveSessionArchive(normalized);
    await upsertSessionArchiveToFirestore(normalized);
    onArchivesChanged();
  };

  const handleConfirmImport = async () => {
    if (!preview || preview.kind === 'unknown') return;
    if (preview.unresolvedNames.length > 0 || preview.duplicateNames.length > 0) {
      window.alert('Import ยังไม่ได้ เพราะมีชื่อสมาชิกที่จับคู่ไม่ได้หรือชื่อซ้ำ');
      return;
    }

    setBusy(true);
    try {
      if (preview.kind === 'v66-current') {
        const state = preview.data as AppState;
        if (!state?.sessionConfig || !Array.isArray(state?.players)) {
          throw new Error('Current Session backup ไม่สมบูรณ์');
        }
        const confirmed = window.confirm(
          `Restore Current Session วันที่ ${state.sessionConfig.date} หรือไม่?\n\n` +
            `ระบบจะ Export Auto Backup ของข้อมูลปัจจุบันก่อน แล้วจึง Replace Current Session ทั้งชุด`
        );
        if (!confirmed) return;
        autoBackupCurrentState('BEFORE_CURRENT_RESTORE');
        onApplyState(clone(state));
        setNotice(`✅ Restore Current Session ${state.sessionConfig.date} แล้ว`);
      } else {
        const archive = preview.data as DailySessionArchive;
        if (!archive?.archiveDate || !Array.isArray(archive?.playersSnapshot)) {
          throw new Error('Archive Import ไม่สมบูรณ์');
        }
        const sameDateCount = loadSessionArchives().filter(
          (item) => item.archiveDate === archive.archiveDate
        ).length;
        const confirmed = window.confirm(
          `Import Archive วันที่ ${archive.archiveDate} หรือไม่?\n\n` +
            `${sameDateCount > 0 ? `พบ Archive เดิม ${sameDateCount} รายการ • จะ Backup แล้ว Replace` : 'ยังไม่มี Archive วันนี้ • จะเพิ่มใหม่'}\n` +
            `Match: ${archive.matchHistorySnapshot?.length || 0}`
        );
        if (!confirmed) return;
        await replaceArchiveByDate(archive);
        setNotice(`✅ Import/Replace Archive ${archive.archiveDate} แล้ว`);
      }
      setPreview(null);
    } catch (error) {
      console.error(error);
      window.alert(error instanceof Error ? error.message : 'Import ไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const handleResetLifetimeStats = () => {
    if (confirmWord.trim().toUpperCase() !== 'RESET') {
      window.alert('กรุณาพิมพ์ RESET เพื่อยืนยัน');
      return;
    }

    const confirmed = window.confirm(
      `Reset Lifetime Stats สมาชิกทั้งหมด ${currentState.players.length} คน?\n\n` +
        `Reset เฉพาะ Sessions / Matches / Games / processedHistoryIds / lastAttendanceDate\n` +
        `ไม่ลบ Member Master, PIN, Skill, Birthday, Promotion, Archive หรือ Payment History`
    );
    if (!confirmed) return;

    autoBackupCurrentState('BEFORE_RESET_STATS');

    const currentStats = ((currentState as any).memberLifetimeStats || {}) as Record<
      string,
      any
    >;
    const nextStats: Record<string, any> = {};

    for (const player of currentState.players) {
      const old = currentStats[player.id] || {};
      nextStats[player.id] = {
        ...old,
        playerId: old.playerId || player.id,
        nickname: old.nickname || player.nickname,
        totalSessions: 0,
        totalMatches: 0,
        totalGames: 0,
        processedHistoryIds: [],
        lastAttendanceDate: undefined,
        updatedAt: Date.now(),
      };
    }

    onApplyState({
      ...currentState,
      memberLifetimeStats: nextStats,
    } as AppState);
    setConfirmWord('');
    setNotice('✅ Reset Lifetime Stats แล้ว • Archive ยังอยู่ครบ');
  };

  const handleRebuildLifetimeStats = () => {
    const allArchives = loadSessionArchives();
    const sourceArchives = groupNewestArchiveByDate(allArchives);
    if (sourceArchives.length === 0) {
      window.alert('ยังไม่มี Archive สำหรับ Rebuild Stats');
      return;
    }

    const duplicateDates = allArchives.length - sourceArchives.length;
    const confirmed = window.confirm(
      `Rebuild Lifetime Stats จาก Archive หรือไม่?\n\n` +
        `Archive ทั้งหมด: ${allArchives.length}\n` +
        `วันที่ไม่ซ้ำที่ใช้คำนวณ: ${sourceArchives.length}\n` +
        `${duplicateDates > 0 ? `พบ Archive ซ้ำวัน ${duplicateDates} รายการ • จะใช้รายการ savedAt ล่าสุดของวันนั้น\n` : ''}` +
        `Current Session วันนี้จะไม่ถูกนำมารวม จนกว่าจะ Archive`
    );
    if (!confirmed) return;

    autoBackupCurrentState('BEFORE_REBUILD_STATS');

    const currentStats = ((currentState as any).memberLifetimeStats || {}) as Record<
      string,
      any
    >;
    const nextStats: Record<string, any> = {};

    for (const player of currentState.players) {
      const old = currentStats[player.id] || {};
      nextStats[player.id] = {
        ...old,
        playerId: old.playerId || player.id,
        nickname: old.nickname || player.nickname,
        totalSessions: 0,
        totalMatches: 0,
        totalGames: 0,
        processedHistoryIds: [],
        lastAttendanceDate: undefined,
        updatedAt: Date.now(),
      };
    }

    for (const archive of sourceArchives) {
      for (const snapshot of archive.playersSnapshot || []) {
        if (!isSessionParticipant(snapshot)) continue;
        const currentPlayer = findCurrentPlayerByArchiveSnapshot(
          currentState.players,
          snapshot
        );
        if (!currentPlayer) continue;

        const stat = nextStats[currentPlayer.id] || {
          playerId: currentPlayer.id,
          nickname: currentPlayer.nickname,
        };
        const matches = Math.max(0, Number(snapshot.matchesPlayed || 0));
        const games = Math.max(0, Number(snapshot.gamesPlayed || matches * 2));

        nextStats[currentPlayer.id] = {
          ...stat,
          totalSessions: Number(stat.totalSessions || 0) + 1,
          totalMatches: Number(stat.totalMatches || 0) + matches,
          totalGames: Number(stat.totalGames || 0) + games,
          lastAttendanceDate:
            !stat.lastAttendanceDate || archive.archiveDate > stat.lastAttendanceDate
              ? archive.archiveDate
              : stat.lastAttendanceDate,
          updatedAt: Date.now(),
        };
      }
    }

    onApplyState({
      ...currentState,
      memberLifetimeStats: nextStats,
    } as AppState);
    setNotice(
      `✅ Rebuild Lifetime Stats จาก ${sourceArchives.length} วันเรียบร้อยแล้ว`
    );
  };


  // ARCHIVE_PURGE_V66B
  const handleDeleteCurrentDateArchives = async () => {
    const targetDate = currentState.sessionConfig.date;
    const targets = loadSessionArchives().filter(
      (archive) => archive.archiveDate === targetDate
    );

    if (targets.length === 0) {
      window.alert(`ไม่พบ Archive วันที่ ${targetDate}`);
      return;
    }

    const confirmed = window.confirm(
      `ลบ Archive วันที่ ${targetDate} ทั้งหมด ${targets.length} รายการหรือไม่?\n\n` +
        `ระบบจะลบทั้ง Firestore และ LocalStorage\n` +
        `Current Session วันนี้จะไม่ถูกลบ`
    );

    if (!confirmed) return;

    downloadJson(
      buildFullBackup(),
      `GuanGuan_AutoBackup_BeforeArchivePurge_${safeDateFileName(targetDate)}_${Date.now()}.json`
    );

    try {
      for (const archive of targets) {
        await deleteSessionArchiveFromFirestore(archive.id);
        deleteSessionArchive(archive.id);
      }
      onArchivesChanged();
      setNotice(`✅ ลบ Archive วันที่ ${targetDate} จำนวน ${targets.length} รายการแล้ว`);
      window.alert(
        `✅ ลบ Archive วันที่ ${targetDate} จำนวน ${targets.length} รายการเรียบร้อยแล้ว\n\nCurrent Session วันนี้ยังอยู่ตามเดิม`
      );
    } catch (error) {
      console.error('Failed to purge archives by date', error);
      window.alert('ลบ Archive ไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  const handleDeleteAllArchives = async () => {
    const targets = loadSessionArchives();

    if (targets.length === 0) {
      window.alert('ไม่มี Archive ให้ลบ');
      return;
    }

    const typed = window.prompt(
      `⚠️ จะลบ Archive ทั้งหมด ${targets.length} รายการ\n` +
        `Current Session และ Member Master จะไม่ถูกลบ\n\n` +
        `พิมพ์ DELETE ALL เพื่อยืนยัน`
    );

    if (typed !== 'DELETE ALL') {
      window.alert('ยกเลิกการลบ Archive ทั้งหมด');
      return;
    }

    downloadJson(
      buildFullBackup(),
      `GuanGuan_AutoBackup_BeforeDeleteAllArchives_${Date.now()}.json`
    );

    try {
      for (const archive of targets) {
        await deleteSessionArchiveFromFirestore(archive.id);
        deleteSessionArchive(archive.id);
      }
      onArchivesChanged();
      setNotice(`✅ ลบ Archive ทั้งหมด ${targets.length} รายการแล้ว`);
      window.alert(
        `✅ ลบ Archive ทั้งหมด ${targets.length} รายการเรียบร้อยแล้ว\n\nCurrent Session และ Member Master ยังอยู่`
      );
    } catch (error) {
      console.error('Failed to delete all archives', error);
      window.alert('ลบ Archive ทั้งหมดไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  // FORCE_ARCHIVE_PURGE_V66D
  const handleForcePurgeArchiveDatabase = async () => {
    const typed = window.prompt(
      `🔥 FORCE PURGE ARCHIVE DATABASE\n\n` +
        `จะลบเอกสารทั้งหมดใน Firestore:\nclubs/guanguan/archives\n\n` +
        `และล้าง Archive LocalStorage ของเครื่องนี้\n` +
        `Current Session / Member Master / PIN / Skill จะไม่ถูกลบ\n\n` +
        `พิมพ์ PURGE ARCHIVE เพื่อยืนยัน`
    );

    if (typed !== 'PURGE ARCHIVE') {
      window.alert('ยกเลิก Force Purge');
      return;
    }

    autoBackupCurrentState('BEFORE_FORCE_ARCHIVE_PURGE');

    setBusy(true);
    try {
      const archiveCollection = collection(db, 'clubs', 'guanguan', 'archives');
      const snapshot = await getDocs(archiveCollection);

      // Firestore batch has a practical operation limit.
      // GuanGuan archive count is normally small, but chunk safely anyway.
      const docs = [...snapshot.docs];
      const chunkSize = 400;

      for (let index = 0; index < docs.length; index += chunkSize) {
        const batch = writeBatch(db);
        for (const item of docs.slice(index, index + chunkSize)) {
          batch.delete(item.ref);
        }
        await batch.commit();
      }

      // Hard-clear the local archive cache after remote deletion succeeds.
      replaceSessionArchivesLocal([]);
      onArchivesChanged();

      setNotice(
        `✅ Force Purge สำเร็จ • ลบ Firestore ${docs.length} document • Local Archive = 0`
      );

      window.alert(
        `✅ Force Purge Archive สำเร็จ\n\n` +
          `Firestore ลบ: ${docs.length} document\n` +
          `Local Archive: 0\n\n` +
          `Current Session และ Member Master ยังอยู่`
      );
    } catch (error) {
      console.error('FORCE_ARCHIVE_PURGE_V66D failed', error);
      const message =
        error instanceof Error ? error.message : String(error);
      window.alert(
        `❌ Force Purge ไม่สำเร็จ\n\n${message}\n\n` +
          `เปิด DevTools Console เพื่อตรวจ error เพิ่มเติม`
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-violet-800/60 bg-slate-950 shadow-2xl">
        {/* DATA_STATS_REPAIR_V66 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-5">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-violet-400">
              Organizer Data Tools
            </div>
            <h2 className="text-lg font-black text-white">🧰 Backup • Import • Stat Repair</h2>
            <div className="mt-0.5 text-[11px] text-slate-400">
              ใช้สำหรับ Backup รายวัน / Replace Archive / Reset และ Rebuild Lifetime Stats
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-700"
          >
            ✕ ปิด
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          {notice && (
            <div className="mb-4 rounded-xl border border-emerald-700/60 bg-emerald-950/40 px-3 py-2 text-xs font-bold text-emerald-300">
              {notice}
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-2xl border border-cyan-800/50 bg-cyan-950/15 p-4">
              <h3 className="text-sm font-black text-white">📦 1. Full Backup วันนี้</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Export Current Session ทั้งชุด: Session Config, Member state, Match History, Active Match,
                PM, Payment, Lifetime Stats และข้อมูลประกอบทั้งหมดใน appState
              </p>
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-xs text-slate-300">
                วันที่ปัจจุบัน: <strong className="text-cyan-300">{currentState.sessionConfig.date}</strong>
                <br />สมาชิก Master: {currentState.players.length} • Match History: {currentState.matchHistory.length}
              </div>
              <button
                type="button"
                onClick={handleExportCurrent}
                className="mt-3 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-400"
              >
                📦 Export Full Backup วันนี้
              </button>
            </section>

            <section className="rounded-2xl border border-amber-800/50 bg-amber-950/15 p-4">
              <h3 className="text-sm font-black text-white">📥 2. Import / Replace</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                รองรับ v66 Day Backup, Archive JSON รุ่นเดิม และ Historical Import JSON ที่เตรียมจาก CSV
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFile}
                className="hidden"
              />
              <button
                type="button"
                onClick={handleChooseImport}
                className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-400"
              >
                📂 เลือกไฟล์ JSON เพื่อ Preview
              </button>

              {preview && (
                <div className="mt-3 rounded-xl border border-slate-700 bg-slate-950/80 p-3 text-xs">
                  <div className="font-black text-white">Preview: {preview.fileName}</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-slate-300">
                    <div>Format: <strong>{preview.kind}</strong></div>
                    <div>วันที่: <strong>{preview.sessionDate || '-'}</strong></div>
                    <div>สมาชิก: <strong>{preview.memberCount}</strong></div>
                    <div>Match: <strong>{preview.matchCount}</strong></div>
                  </div>

                  {preview.kind === 'historical-v1' && (
                    <div className="mt-2 rounded-lg border border-cyan-900/60 bg-cyan-950/30 px-2 py-2 text-cyan-200">
                      จับคู่ Member สำเร็จ {preview.resolvedMembers}/{preview.memberCount}
                    </div>
                  )}

                  {preview.unresolvedNames.length > 0 && (
                    <div className="mt-2 rounded-lg border border-rose-800/60 bg-rose-950/30 px-2 py-2 text-rose-300">
                      ❌ หา Member ไม่เจอ: {preview.unresolvedNames.join(', ')}
                    </div>
                  )}

                  {preview.duplicateNames.length > 0 && (
                    <div className="mt-2 rounded-lg border border-rose-800/60 bg-rose-950/30 px-2 py-2 text-rose-300">
                      ❌ Nickname ซ้ำ: {preview.duplicateNames.join(', ')}
                    </div>
                  )}

                  {preview.notes.slice(0, 4).map((note, index) => (
                    <div key={`${note}-${index}`} className="mt-1 text-[10px] leading-relaxed text-slate-500">
                      • {note}
                    </div>
                  ))}

                  <button
                    type="button"
                    disabled={
                      busy ||
                      preview.kind === 'unknown' ||
                      preview.unresolvedNames.length > 0 ||
                      preview.duplicateNames.length > 0
                    }
                    onClick={handleConfirmImport}
                    className="mt-3 w-full rounded-lg bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ✅ Confirm Import / Replace
                  </button>
                </div>
              )}
            </section>

            {/* ARCHIVE_PURGE_V66B */}
            <section className="rounded-2xl border border-orange-800/50 bg-orange-950/15 p-4">
              <h3 className="text-sm font-black text-white">🗑️ 3. ล้าง Archive ที่เป็นข้อมูล Test</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                ลบทั้ง Firestore + LocalStorage พร้อมกัน โดยไม่ลบ Current Session หรือ Member Master
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void handleDeleteCurrentDateArchives()}
                  className="rounded-xl border border-orange-700/70 bg-orange-950/60 px-3 py-2.5 text-xs font-black text-orange-200 hover:bg-orange-900/70"
                >
                  🗑️ ลบ Archive วันที่ {currentState.sessionConfig.date}
                </button>

                <button
                  type="button"
                  onClick={() => void handleDeleteAllArchives()}
                  className="rounded-xl border border-rose-700/70 bg-rose-950/60 px-3 py-2.5 text-xs font-black text-rose-200 hover:bg-rose-900/70"
                >
                  ⚠️ ลบ Archive ทั้งหมด
                </button>
              </div>
              <div className="mt-2 text-[10px] text-orange-400/80">
                ก่อนลบ ระบบจะ Export Auto Backup ให้อัตโนมัติ
              </div>
            </section>

                        {/* FORCE_ARCHIVE_PURGE_V66D */}
            <section className="rounded-2xl border-2 border-red-600/70 bg-red-950/25 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black text-red-300">
                    🔥 Force Purge Archive Database
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    ใช้เมื่อกดลบแล้ว Archive กลับมาอีก • ระบบจะ Query Firestore โดยตรง
                    แล้วลบทุก document ใน clubs/guanguan/archives พร้อมล้าง Local Archive
                  </p>
                </div>
                <span className="rounded-full border border-red-700 bg-red-950 px-2.5 py-1 text-[10px] font-black text-red-300">
                  Test Cleanup
                </span>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => void handleForcePurgeArchiveDatabase()}
                className="mt-3 w-full rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white hover:bg-red-500 disabled:opacity-40"
              >
                🔥 Force Purge Firestore + Local Archive
              </button>

              <div className="mt-2 text-[10px] leading-relaxed text-red-300/80">
                ไม่ลบ Current Session • ไม่ลบ Member Master • ไม่ลบ PIN • ไม่ลบ Skill
              </div>
            </section>
<section className="rounded-2xl border border-violet-800/50 bg-violet-950/15 p-4">
              <h3 className="text-sm font-black text-white">♻️ 4. Rebuild Lifetime Stats</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                คำนวณ Sessions / Matches / Games ใหม่จาก Archive เท่านั้น โดย 1 วันใช้ Archive ที่ savedAt ล่าสุด
                เพื่อไม่ให้รายการซ้ำวันถูกนับสองรอบ
              </p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-xl bg-slate-950/80 p-2">
                  <div className="text-lg font-black text-violet-300">{archives.length}</div>
                  <div className="text-[9px] text-slate-500">Archive</div>
                </div>
                <div className="rounded-xl bg-slate-950/80 p-2">
                  <div className="text-lg font-black text-cyan-300">
                    {groupNewestArchiveByDate(archives).length}
                  </div>
                  <div className="text-[9px] text-slate-500">วันที่ใช้จริง</div>
                </div>
                <div className="rounded-xl bg-slate-950/80 p-2">
                  <div className="text-lg font-black text-amber-300">{duplicateDateCount}</div>
                  <div className="text-[9px] text-slate-500">วันซ้ำ</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleRebuildLifetimeStats}
                className="mt-3 w-full rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-400"
              >
                ♻️ Rebuild Stats จาก Archive
              </button>
            </section>

            <section className="rounded-2xl border border-rose-800/50 bg-rose-950/15 p-4">
              <h3 className="text-sm font-black text-white">🧹 5. Reset Lifetime Stats</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-400">
                Reset เฉพาะ Sessions / Matches / Games / Processed IDs เท่านั้น ไม่ลบ Member Master, PIN,
                Skill, Birthday, Promotion หรือ Archive
              </p>
              <input
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="พิมพ์ RESET"
                className="mt-3 w-full rounded-xl border border-rose-800 bg-slate-950 px-3 py-2 text-sm font-black uppercase text-white outline-none focus:border-rose-500"
              />
              <button
                type="button"
                onClick={handleResetLifetimeStats}
                className="mt-2 w-full rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-500"
              >
                🧹 Reset Lifetime Stats ทั้งหมด
              </button>
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-white">🗂 Archive Backup รายวัน</h3>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  Export Archive แต่ละวันไว้แก้ไข แล้ว Import กลับมา Replace วันเดิมได้
                </p>
              </div>
              <span className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-bold text-slate-400">
                {archives.length} รายการ
              </span>
            </div>

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
              {archives.map((archive) => (
                <div
                  key={archive.id}
                  className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-black text-white">{archive.archiveDate} • {archive.venueName}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {archive.totalPlayers} คน • {archive.totalMatches} Match • Saved {new Date(archive.savedAt).toLocaleString('th-TH')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleExportArchive(archive)}
                    className="shrink-0 rounded-lg border border-cyan-800 bg-cyan-950/40 px-3 py-1.5 text-[10px] font-black text-cyan-300 hover:bg-cyan-900/50"
                  >
                    📦 Export วันนี้
                  </button>
                </div>
              ))}

              {archives.length === 0 && (
                <div className="rounded-xl border border-dashed border-slate-700 py-6 text-center text-xs text-slate-500">
                  ยังไม่มี Daily Archive
                </div>
              )}
            </div>
          </section>

          <div className="mt-4 rounded-xl border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-[10px] leading-relaxed text-amber-200/80">
            ⚠️ ก่อน Reset / Rebuild / Restore Current Session ระบบจะดาวน์โหลด Auto Backup ให้ก่อนเสมอ •
            การ Import Archive วันที่ซ้ำจะ Backup Archive เดิม แล้ว Replace วันนั้น • หลัง Import ข้อมูลย้อนหลัง ให้กด Rebuild Stats
          </div>
        </div>
      </div>
    </div>
  );
};

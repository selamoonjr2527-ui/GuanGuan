import React, { useMemo, useState } from 'react';
import type { DailySessionArchive, MatchHistoryItem, Player } from '../types';
import { loadSessionArchives } from '../utils/storage';

interface MemberHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Player | null;
  currentSessionDate: string;
  currentVenueName: string;
  currentMatchHistory: MatchHistoryItem[];
  memberStats?: Record<string, any>;
}

interface SessionRow {
  id: string;
  date: string;
  venueName: string;
  isCurrent: boolean;
  playerSnapshot: Player;
  matches: MatchHistoryItem[];
}

const formatDateThai = (value: string) => {
  try {
    return new Date(`${value}T00:00:00`).toLocaleDateString('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return value;
  }
};

const playerHasSessionActivity = (player?: Player | null) =>
  Boolean(
    player &&
      (player.isCheckedIn ||
        player.status === 'left' ||
        (player.matchesPlayed || 0) > 0 ||
        (player.gamesPlayed || 0) > 0 ||
        (player.extraShuttlecocks || 0) > 0 ||
        player.paid)
  );

const matchBelongsToMember = (
  match: MatchHistoryItem,
  member: Player,
  archivePlayers?: Player[]
) => {
  const raw = match as any;

  const participantIds = Array.isArray(raw.participantIds)
    ? raw.participantIds.map(String)
    : [];

  if (participantIds.length > 0) {
    return participantIds.includes(member.id);
  }

  const teamIds = [
    ...(Array.isArray(raw.teamAPlayerIds) ? raw.teamAPlayerIds : []),
    ...(Array.isArray(raw.teamBPlayerIds) ? raw.teamBPlayerIds : []),
  ].map(String);

  if (teamIds.length > 0) {
    return teamIds.includes(member.id);
  }

  // Compatibility for old archives created before participant IDs were stored.
  // Fallback by nickname only when the nickname is unique in that archived roster.
  const sameNicknameCount = (archivePlayers || []).filter(
    (p) => p.nickname === member.nickname
  ).length;

  if (sameNicknameCount > 1) return false;

  return [...(match.teamANames || []), ...(match.teamBNames || [])].includes(
    member.nickname
  );
};

const paymentBadge = (player: Player) => {
  if (player.paid) {
    return {
      label: '✅ Paid',
      className: 'border-emerald-700/60 bg-emerald-950/55 text-emerald-300',
    };
  }

  return {
    label: '⏳ Pending',
    className: 'border-amber-700/60 bg-amber-950/55 text-amber-300',
  };
};

export const MemberHistoryModal: React.FC<MemberHistoryModalProps> = ({
  isOpen,
  onClose,
  member,
  currentSessionDate,
  currentVenueName,
  currentMatchHistory,
  memberStats,
}) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const archives = useMemo<DailySessionArchive[]>(() => {
    if (!isOpen) return [];
    return loadSessionArchives();
  }, [isOpen]);

  const archivedRows = useMemo<SessionRow[]>(() => {
    if (!member) return [];

    return archives
      .map((archive) => {
        const exact = archive.playersSnapshot?.find((p) => p.id === member.id);

        // Older data fallback: nickname only when unique.
        const sameName = (archive.playersSnapshot || []).filter(
          (p) => p.nickname === member.nickname
        );
        const archivedPlayer = exact || (sameName.length === 1 ? sameName[0] : null);

        if (!archivedPlayer || !playerHasSessionActivity(archivedPlayer)) {
          return null;
        }

        const matches = (archive.matchHistorySnapshot || []).filter((match) =>
          matchBelongsToMember(match, archivedPlayer, archive.playersSnapshot)
        );

        return {
          id: archive.id,
          date: archive.archiveDate,
          venueName: archive.venueName,
          isCurrent: false,
          playerSnapshot: archivedPlayer,
          matches,
        } satisfies SessionRow;
      })
      .filter((row): row is SessionRow => Boolean(row))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [archives, member]);

  const currentRow = useMemo<SessionRow | null>(() => {
    if (!member || !playerHasSessionActivity(member)) return null;

    const matches = currentMatchHistory.filter((match) =>
      matchBelongsToMember(match, member)
    );

    return {
      id: '__CURRENT_SESSION__',
      date: currentSessionDate,
      venueName: currentVenueName,
      isCurrent: true,
      playerSnapshot: member,
      matches,
    };
  }, [
    member,
    currentSessionDate,
    currentVenueName,
    currentMatchHistory,
  ]);

  if (!isOpen || !member) return null;

  const lifetime = (memberStats || {})[member.id] || {};
  const sessionCountFromHistory =
    archivedRows.length + (currentRow ? 1 : 0);

  const lifetimeSessions = Math.max(
    Number(lifetime.totalSessions || 0),
    sessionCountFromHistory
  );

  const lifetimeMatches = Math.max(
    Number(lifetime.totalMatches || 0),
    archivedRows.reduce(
      (sum, row) => sum + Number(row.playerSnapshot.matchesPlayed || 0),
      0
    ) + Number(currentRow?.playerSnapshot.matchesPlayed || 0)
  );

  const lifetimeGames = Math.max(
    Number(lifetime.totalGames || 0),
    archivedRows.reduce(
      (sum, row) => sum + Number(row.playerSnapshot.gamesPlayed || 0),
      0
    ) + Number(currentRow?.playerSnapshot.gamesPlayed || 0)
  );

  const rows = currentRow ? [currentRow, ...archivedRows] : archivedRows;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-sm sm:p-5">
      <div className="flex max-h-[94vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-cyan-800/60 bg-slate-950 shadow-2xl">
        {/* MEMBER_HISTORY_V65 */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-900 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-400">
              My Badminton History
            </div>
            <h2 className="truncate text-lg font-black text-white">
              👤 {member.nickname} • ประวัติของฉัน
            </h2>
            <div className="mt-0.5 text-[11px] text-slate-400">
              แสดงเฉพาะข้อมูลของสมาชิกที่ Login อยู่ • ไม่แสดงระดับมือ
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-black text-slate-200 hover:bg-slate-700"
          >
            ✕ ปิด
          </button>
        </div>

        <div className="overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-cyan-800/50 bg-cyan-950/25 p-3 text-center">
              <div className="text-[10px] font-bold text-cyan-400">เล่นทั้งหมด</div>
              <div className="mt-1 text-xl font-black text-white">
                {lifetimeSessions}
              </div>
              <div className="text-[10px] text-slate-500">Session</div>
            </div>
            <div className="rounded-2xl border border-emerald-800/50 bg-emerald-950/25 p-3 text-center">
              <div className="text-[10px] font-bold text-emerald-400">Match ทั้งหมด</div>
              <div className="mt-1 text-xl font-black text-white">
                {lifetimeMatches}
              </div>
              <div className="text-[10px] text-slate-500">Match</div>
            </div>
            <div className="rounded-2xl border border-violet-800/50 bg-violet-950/25 p-3 text-center">
              <div className="text-[10px] font-bold text-violet-400">Game ทั้งหมด</div>
              <div className="mt-1 text-xl font-black text-white">
                {lifetimeGames}
              </div>
              <div className="text-[10px] text-slate-500">Game</div>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-black text-white">📅 ประวัติการเล่น</h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                Session ที่จบแล้วอ่านจาก Daily Archive • Session วันนี้แสดงแบบ Live
              </p>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-[10px] font-bold text-slate-400">
              {rows.length} รายการ
            </div>
          </div>

          <div className="mt-3 space-y-3">
            {rows.map((row) => {
              const p = row.playerSnapshot;
              const badge = paymentBadge(p);
              const expanded = expandedId === row.id;
              const paidAmount =
                typeof p.paidAmount === 'number' && Number.isFinite(p.paidAmount)
                  ? p.paidAmount
                  : null;

              return (
                <div
                  key={row.id}
                  className={`overflow-hidden rounded-2xl border ${
                    row.isCurrent
                      ? 'border-cyan-600/60 bg-cyan-950/15'
                      : 'border-slate-800 bg-slate-900/70'
                  }`}
                >
                  <div className="p-3 sm:p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-black text-white">
                            {formatDateThai(row.date)}
                          </div>
                          {row.isCurrent && (
                            <span className="rounded-full border border-cyan-600/60 bg-cyan-950 px-2 py-0.5 text-[10px] font-black text-cyan-300">
                              ● LIVE
                            </span>
                          )}
                          <span
                            className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${badge.className}`}
                          >
                            {badge.label}
                          </span>
                        </div>
                        <div className="mt-1 truncate text-xs text-slate-400">
                          📍 {row.venueName || '-'}
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 text-center sm:min-w-[340px]">
                        <div className="rounded-xl bg-slate-950/80 px-2 py-2">
                          <div className="text-sm font-black text-cyan-300">
                            {p.matchesPlayed || 0}
                          </div>
                          <div className="text-[9px] text-slate-500">Match</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/80 px-2 py-2">
                          <div className="text-sm font-black text-violet-300">
                            {p.gamesPlayed || 0}
                          </div>
                          <div className="text-[9px] text-slate-500">Game</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/80 px-2 py-2">
                          <div className="text-sm font-black text-amber-300">
                            {p.extraShuttlecocks || 0}
                          </div>
                          <div className="text-[9px] text-slate-500">Extra</div>
                        </div>
                        <div className="rounded-xl bg-slate-950/80 px-2 py-2">
                          <div className="text-sm font-black text-emerald-300">
                            {paidAmount !== null
                              ? `${paidAmount.toLocaleString()}฿`
                              : '-'}
                          </div>
                          <div className="text-[9px] text-slate-500">Paid</div>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : row.id)}
                      className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-xs font-black text-slate-300 hover:border-cyan-700 hover:text-cyan-300"
                    >
                      {expanded
                        ? '▲ ซ่อนรายละเอียด Match'
                        : `▼ ดูรายละเอียด Match (${row.matches.length})`}
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-800 bg-slate-950/70 p-3 sm:p-4">
                      {row.matches.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-500">
                          ไม่พบรายละเอียด Match สำหรับ Session นี้
                          <div className="mt-1 text-[10px]">
                            Archive รุ่นเก่าบางรายการอาจยังไม่มี Player ID ใน Match History
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {row.matches.map((match, index) => (
                            <div
                              key={match.id}
                              className="rounded-xl border border-slate-800 bg-slate-900 p-3"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-xs font-black text-white">
                                  🏸 Match #{index + 1} • {match.courtName}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  {match.startTime || '-'} • {match.durationMinutes || 0} นาที
                                </div>
                              </div>

                              <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-xs">
                                <div className="rounded-lg border border-blue-900/50 bg-blue-950/25 px-2 py-2 text-center font-bold text-blue-300">
                                  {(match.teamANames || []).join(' + ')}
                                </div>
                                <div className="font-black text-slate-500">VS</div>
                                <div className="rounded-lg border border-rose-900/50 bg-rose-950/25 px-2 py-2 text-center font-bold text-rose-300">
                                  {(match.teamBNames || []).join(' + ')}
                                </div>
                              </div>

                              {(match.game1ScoreA !== undefined ||
                                match.game1ScoreB !== undefined ||
                                match.game2ScoreA !== undefined ||
                                match.game2ScoreB !== undefined) && (
                                <div className="mt-2 flex flex-wrap justify-center gap-2 text-[10px]">
                                  <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">
                                    Set 1:{' '}
                                    <strong>
                                      {match.game1ScoreA ?? '-'}-{match.game1ScoreB ?? '-'}
                                    </strong>
                                  </span>
                                  <span className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-slate-300">
                                    Set 2:{' '}
                                    <strong>
                                      {match.game2ScoreA ?? '-'}-{match.game2ScoreB ?? '-'}
                                    </strong>
                                  </span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {rows.length === 0 && (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 px-4 py-8 text-center">
                <div className="text-3xl">📭</div>
                <div className="mt-2 text-sm font-black text-slate-300">
                  ยังไม่มีประวัติการเล่น
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  ประวัติ Session ที่จบแล้วจะปรากฏหลังผู้จัด Archive / Reset Session
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 text-[10px] leading-relaxed text-slate-500">
            🔒 หน้านี้ตั้งใจแสดงเฉพาะข้อมูลของสมาชิกที่ Login อยู่ และไม่แสดง Skill Level
            • ยอดเงินย้อนหลังจะแสดงเฉพาะ <strong className="text-slate-400">paidAmount snapshot</strong>{' '}
            ที่ถูกบันทึกไว้ใน Session นั้น เพื่อไม่คำนวณย้อนหลังด้วย Rate ปัจจุบัน
          </div>
        </div>
      </div>
    </div>
  );
};

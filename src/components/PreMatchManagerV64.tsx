import React, { useMemo, useState } from 'react';
import { Check, Edit2, Play, X, Clock, Users, Sparkles } from 'lucide-react';
import { ActiveMatch, ConfirmedPreMatch, Player, SessionConfig, SKILL_LEVELS } from '../types';
import {
  comparePlayerPriority,
  findBalancedMatch,
  getPlayerWaitTimeMs,
  formatWaitMinutes,
} from '../utils/matchmaker';

type PreMatchSlot = 1 | 2 | 3;

interface PreMatchManagerV64Props {
  sessionConfig: SessionConfig;
  players: Player[];
  activeMatches: ActiveMatch[];
  confirmedPreMatches: Array<ConfirmedPreMatch | null>;
  onConfirmPreMatch: (preMatch: ConfirmedPreMatch, slot: PreMatchSlot) => void;
  onCancelPreMatch: (slot: PreMatchSlot) => void;
  onStartConfirmedPreMatch: (
    courtId: string,
    preMatch: ConfirmedPreMatch,
    slot: PreMatchSlot
  ) => void;
}

interface EditableLineup {
  teamA: [string, string];
  teamB: [string, string];
}

const SLOT_COLORS: Record<PreMatchSlot, string> = {
  1: 'border-emerald-500/50 bg-emerald-950/15',
  2: 'border-indigo-500/50 bg-indigo-950/15',
  3: 'border-violet-500/50 bg-violet-950/15',
};


const QUEUE_ACCENT: Record<PreMatchSlot, string> = {
  1: 'from-emerald-500/20 via-transparent to-transparent',
  2: 'from-indigo-500/20 via-transparent to-transparent',
  3: 'from-violet-500/20 via-transparent to-transparent',
};

const getWaitTone = (waitMs: number) => {
  const minutes = Math.max(0, waitMs / 60000);

  if (minutes >= 30) {
    return {
      card: 'border-rose-500/55 bg-rose-950/25',
      badge: 'border-rose-500/50 bg-rose-500/15 text-rose-300',
      dot: 'bg-rose-400',
      label: '30+ นาที',
    };
  }

  if (minutes >= 20) {
    return {
      card: 'border-amber-500/55 bg-amber-950/20',
      badge: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
      dot: 'bg-amber-400',
      label: '20–29 นาที',
    };
  }

  if (minutes >= 10) {
    return {
      card: 'border-cyan-500/45 bg-cyan-950/15',
      badge: 'border-cyan-500/45 bg-cyan-500/10 text-cyan-300',
      dot: 'bg-cyan-400',
      label: '10–19 นาที',
    };
  }

  return {
    card: 'border-emerald-500/30 bg-slate-950',
    badge: 'border-emerald-500/35 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
    label: '<10 นาที',
  };
};

const formatConfirmedTime = (timestamp?: number) => {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const PreMatchManagerV64: React.FC<PreMatchManagerV64Props> = ({
  sessionConfig,
  players,
  activeMatches,
  confirmedPreMatches,
  onConfirmPreMatch,
  onCancelPreMatch,
  onStartConfirmedPreMatch,
}) => {
  const [editingSlot, setEditingSlot] = useState<PreMatchSlot | null>(null);
  const [editingLineup, setEditingLineup] = useState<EditableLineup | null>(null);

  const playingIds = useMemo(
    () => new Set(activeMatches.flatMap((match) => [...match.teamA, ...match.teamB])),
    [activeMatches]
  );

  const normalizedConfirmed = useMemo(
    () =>
      ([1, 2, 3] as PreMatchSlot[]).map((slot) => {
        const pm = confirmedPreMatches[slot - 1] || null;
        return pm ? { ...pm, slotNumber: slot } : null;
      }),
    [confirmedPreMatches]
  );

  const confirmedQueue = useMemo(
    () =>
      normalizedConfirmed
        .filter((pm): pm is ConfirmedPreMatch => Boolean(pm))
        .sort((a, b) => {
          const timeA = Number(a.confirmedAt || 0);
          const timeB = Number(b.confirmedAt || 0);
          if (timeA !== timeB) return timeA - timeB;
          return String(a.id || '').localeCompare(String(b.id || ''));
        }),
    [normalizedConfirmed]
  );

  const reservedIds = useMemo(
    () =>
      new Set(
        confirmedQueue.flatMap((pm) => [...pm.teamA, ...pm.teamB])
      ),
    [confirmedQueue]
  );

  const waitingPlayers = useMemo(() => {
    const now = Date.now();
    return players
      .filter(
        (player) =>
          player.isCheckedIn &&
          player.status === 'waiting' &&
          !playingIds.has(player.id)
      )
      .sort((a, b) => comparePlayerPriority(a, b, now));
  }, [players, playingIds]);

  const autoDrafts = useMemo(() => {
    const result: Partial<Record<PreMatchSlot, EditableLineup>> = {};
    let pool = waitingPlayers.filter((player) => !reservedIds.has(player.id));

    ([1, 2, 3] as PreMatchSlot[]).forEach((slot) => {
      if (normalizedConfirmed[slot - 1]) return;
      if (pool.length < 4) return;

      const candidates = pool.slice(0, Math.min(8, pool.length));
      const balanced = findBalancedMatch(candidates, 'balanced');
      const chosen = balanced
        ? {
            teamA: [balanced.teamA[0].id, balanced.teamA[1].id] as [string, string],
            teamB: [balanced.teamB[0].id, balanced.teamB[1].id] as [string, string],
          }
        : {
            teamA: [pool[0].id, pool[1].id] as [string, string],
            teamB: [pool[2].id, pool[3].id] as [string, string],
          };

      result[slot] = chosen;
      const used = new Set([...chosen.teamA, ...chosen.teamB]);
      pool = pool.filter((player) => !used.has(player.id));
    });

    return result;
  }, [waitingPlayers, reservedIds, normalizedConfirmed]);

  const availableCourts = useMemo(
    () =>
      sessionConfig.courtNames
        .map((courtName, index) => ({
          courtId: `court-${index + 1}`,
          courtName,
        }))
        .filter(
          (court) =>
            !activeMatches.some((match) => match.courtId === court.courtId)
        ),
    [sessionConfig.courtNames, activeMatches]
  );

  const getPlayer = (id: string) => players.find((player) => player.id === id);

  const openEditor = (slot: PreMatchSlot) => {
    const confirmed = normalizedConfirmed[slot - 1];
    const auto = autoDrafts[slot];

    const source = confirmed
      ? {
          teamA: [...confirmed.teamA] as [string, string],
          teamB: [...confirmed.teamB] as [string, string],
        }
      : auto;

    if (!source) {
      window.alert('ยังมีผู้เล่น Waiting ไม่ครบ 4 คนสำหรับ PM นี้');
      return;
    }

    setEditingSlot(slot);
    setEditingLineup({
      teamA: [...source.teamA] as [string, string],
      teamB: [...source.teamB] as [string, string],
    });
  };

  const candidatePlayersForEditor = useMemo(() => {
    if (!editingSlot) return [];

    const currentIds = new Set(
      editingLineup
        ? [...editingLineup.teamA, ...editingLineup.teamB]
        : []
    );

    const reservedByOtherPm = new Set<string>();
    normalizedConfirmed.forEach((pm, index) => {
      if (!pm || index === editingSlot - 1) return;
      [...pm.teamA, ...pm.teamB].forEach((id) => reservedByOtherPm.add(id));
    });

    // Manual organizer edit may reserve a player who is currently playing.
    // They cannot be sent to court until their active match has finished.
    return players
      .filter(
        (player) =>
          player.isCheckedIn &&
          player.status !== 'resting' &&
          player.status !== 'left' &&
          (currentIds.has(player.id) || !reservedByOtherPm.has(player.id))
      )
      .sort((a, b) => {
        if (playingIds.has(a.id) !== playingIds.has(b.id)) {
          return playingIds.has(a.id) ? 1 : -1;
        }
        return comparePlayerPriority(a, b, Date.now());
      });
  }, [
    editingSlot,
    editingLineup,
    normalizedConfirmed,
    players,
    playingIds,
  ]);

  const setEditorPlayer = (
    team: 'A' | 'B',
    index: 0 | 1,
    playerId: string
  ) => {
    if (!editingLineup) return;

    const next: EditableLineup = {
      teamA: [...editingLineup.teamA] as [string, string],
      teamB: [...editingLineup.teamB] as [string, string],
    };

    if (team === 'A') next.teamA[index] = playerId;
    else next.teamB[index] = playerId;

    setEditingLineup(next);
  };

  const saveEditor = () => {
    if (!editingSlot || !editingLineup) return;

    const ids = [...editingLineup.teamA, ...editingLineup.teamB];
    if (ids.some((id) => !id) || new Set(ids).size !== 4) {
      window.alert('กรุณาเลือกผู้เล่นให้ครบ 4 คนและห้ามซ้ำกัน');
      return;
    }

    const existing = normalizedConfirmed[editingSlot - 1];

    onConfirmPreMatch(
      {
        id: existing?.id || `pre-${editingSlot}-${Date.now()}`,
        slotNumber: editingSlot,
        teamA: editingLineup.teamA,
        teamB: editingLineup.teamB,
        confirmedAt: existing?.confirmedAt || Date.now(),
        pairingLabelThai: existing?.pairingLabelThai || 'จัดคู่โดยผู้จัดก๊วน',
        explanationThai:
          existing?.explanationThai ||
          'ยืนยันจากหน้า Organizer Court Board v64',
        notes: existing?.notes || '',
      },
      editingSlot
    );

    setEditingSlot(null);
    setEditingLineup(null);
  };

  const confirmAutoDraft = (slot: PreMatchSlot) => {
    const draft = autoDrafts[slot];
    if (!draft) return;

    onConfirmPreMatch(
      {
        id: `pre-${slot}-${Date.now()}`,
        slotNumber: slot,
        teamA: draft.teamA,
        teamB: draft.teamB,
        confirmedAt: Date.now(),
        pairingLabelThai: 'จัดตาม Waiting Queue + สมดุลมือ',
        explanationThai: 'ระบบเสนอ 4 คนจากคิวรอและผู้จัดกดยืนยัน',
      },
      slot
    );
  };

  // ORGANIZER_PM_SKILL_V64C
  // This component is rendered only on Organizer > Courts.
  // Member Pre-Match view remains unchanged and continues to obey
  // hideSkillFromMembers, so skill levels are not exposed to members.
  const renderPlayerWithSkill = (id: string) => {
    const player = getPlayer(id);
    if (!player) return <span className="text-slate-500">—</span>;

    const skill = SKILL_LEVELS[player.skillLevel];

    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="font-black text-white">{player.nickname}</span>
        <span
          className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[9px] font-black ${
            skill?.bgColor || 'bg-slate-800'
          } ${skill?.color || 'text-slate-300'} ${
            skill?.borderColor || 'border-slate-700'
          }`}
          title={`ระดับมือ ${player.skillLevel}`}
        >
          มือ {player.skillLevel}
        </span>
      </span>
    );
  };

  const renderTeamWithSkill = (ids: [string, string]) => (
    <div className="flex flex-col gap-1.5">
      {ids.map((id) => (
        <div key={id}>{renderPlayerWithSkill(id)}</div>
      ))}
    </div>
  );

  const renderDraftNamesWithSkill = (ids: [string, string]) => (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {ids.map((id, index) => (
        <React.Fragment key={id}>
          {index > 0 && <span className="text-slate-600">+</span>}
          {renderPlayerWithSkill(id)}
        </React.Fragment>
      ))}
    </span>
  );
  // PREMATCH_COURT_VIEW_V71E
  // Keep team data unchanged:
  // Team A = [A, B], Team B = [C, D]
  // Display like the real court:
  // A  vs  C
  // B      D
  const renderCourtLineupWithSkill = (
    teamA: [string, string],
    teamB: [string, string],
    compact = false
  ) => (
    <div
      className={`grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] grid-rows-2 items-stretch ${
        compact ? 'gap-x-2 gap-y-1.5' : 'gap-x-2.5 gap-y-2'
      }`}
    >
      <div className={`rounded-xl border border-blue-700/35 bg-blue-950/25 ${compact ? 'px-2 py-1.5' : 'p-2.5'}`}>
        <div className="truncate">{renderPlayerWithSkill(teamA[0])}</div>
      </div>

      <div className="row-span-2 flex items-center justify-center px-0.5">
        <span className={`flex items-center justify-center rounded-full border border-slate-700 bg-slate-950 font-black text-slate-400 ${
          compact ? 'h-7 w-7 text-[8px]' : 'h-9 w-9 text-[9px]'
        }`}>
          VS
        </span>
      </div>

      <div className={`rounded-xl border border-rose-700/35 bg-rose-950/25 ${compact ? 'px-2 py-1.5' : 'p-2.5'}`}>
        <div className="truncate">{renderPlayerWithSkill(teamB[0])}</div>
      </div>

      <div className={`rounded-xl border border-blue-700/35 bg-blue-950/25 ${compact ? 'px-2 py-1.5' : 'p-2.5'}`}>
        <div className="truncate">{renderPlayerWithSkill(teamA[1])}</div>
      </div>

      <div className={`rounded-xl border border-rose-700/35 bg-rose-950/25 ${compact ? 'px-2 py-1.5' : 'p-2.5'}`}>
        <div className="truncate">{renderPlayerWithSkill(teamB[1])}</div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-violet-700/45 bg-slate-900 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              🏸 Pre-Match Queue
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              สูงสุด 3 คิว • เรียงตามเวลาที่ผู้จัดกด Confirm จริง
            </p>
          </div>
          <span className="rounded-full border border-violet-700/50 bg-violet-950/40 px-3 py-1 text-[10px] font-black text-violet-300">
            FIFO {confirmedQueue.length}/3
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {confirmedQueue.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/70 p-5 text-center text-xs text-slate-400">
            ยังไม่มี Pre-Match ที่ Confirm
          </div>
        )}

        {confirmedQueue.map((pm, queueIndex) => {
          const slot = (pm.slotNumber || 1) as PreMatchSlot;
          const isNext = queueIndex === 0;
          const hasInvalidPlayer = [...pm.teamA, ...pm.teamB].some((id) => {
            const player = getPlayer(id);
            return (
              !player ||
              !player.isCheckedIn ||
              player.status === 'resting' ||
              player.status === 'left' ||
              playingIds.has(id)
            );
          });

          return (
            <div
              key={pm.id}
              className={`relative overflow-hidden rounded-2xl border p-4 shadow-sm ${
                isNext
                  ? 'border-emerald-400/70 bg-emerald-950/20 ring-1 ring-emerald-400/30'
                  : SLOT_COLORS[slot]
              }`}
            >
              <div
                className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-r ${QUEUE_ACCENT[slot]}`}
              />

              <div className="relative flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-lg font-black ${
                      isNext
                        ? 'border-emerald-400/60 bg-emerald-500 text-slate-950'
                        : 'border-slate-700 bg-slate-950 text-white'
                    }`}
                  >
                    {queueIndex + 1}
                  </div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black text-white">
                        Queue #{queueIndex + 1}
                      </span>
                      <span className="rounded-lg border border-violet-600/40 bg-violet-500/10 px-2 py-0.5 text-[9px] font-black text-violet-300">
                        PM#{slot}
                      </span>
                      {isNext && (
                        <span className="rounded-full bg-emerald-500 px-2.5 py-0.5 text-[9px] font-black text-slate-950 shadow-sm">
                          🟢 NEXT
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                      <Clock className="h-3 w-3" />
                      <span>Confirm {formatConfirmedTime(pm.confirmedAt)}</span>
                      <span className="text-slate-600">•</span>
                      <span>{isNext ? 'พร้อมส่งลงคอร์ทถัดไป' : 'รอคิวก่อนหน้า'}</span>
                    </div>
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => openEditor(slot)}
                    className="rounded-xl border border-slate-700 bg-slate-950/80 p-2.5 text-slate-300 transition hover:border-cyan-600/60 hover:text-cyan-300"
                    title="แก้รายชื่อ โดยรักษาเวลา Confirm เดิม"
                  >
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelPreMatch(slot)}
                    className="rounded-xl border border-rose-800/70 bg-rose-950/40 p-2.5 text-rose-300 transition hover:bg-rose-900"
                    title="ยกเลิก PM"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* PREMATCH_COURT_VIEW_V71E: A-vs-C / B-vs-D */}
              <div className="mt-4">
                <div className="mb-1.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-1">
                  <span className="text-[9px] font-black tracking-wide text-blue-400">
                    TEAM A
                  </span>
                  <span className="w-9" />
                  <span className="text-right text-[9px] font-black tracking-wide text-rose-400">
                    TEAM B
                  </span>
                </div>
                {renderCourtLineupWithSkill(pm.teamA, pm.teamB)}
              </div>

              {hasInvalidPlayer && (
                <div className="mt-3 rounded-xl border border-amber-700/50 bg-amber-950/25 px-3 py-2 text-[10px] text-amber-300">
                  ⚠️ มีผู้เล่นที่ยังไม่พร้อมลงสนาม/กำลังเล่นอยู่
                </div>
              )}

              <div className="mt-3">
                {isNext ? (
                  availableCourts.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {availableCourts.map((court) => (
                        <button
                          key={court.courtId}
                          type="button"
                          disabled={hasInvalidPlayer}
                          onClick={() =>
                            onStartConfirmedPreMatch(court.courtId, pm, slot)
                          }
                          className="flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Play className="h-3.5 w-3.5 fill-current" />
                          ส่งลง {court.courtName}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center text-[10px] text-slate-400">
                      รอคอร์ทว่าง
                    </div>
                  )
                ) : (
                  <div className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-center text-[10px] text-slate-400">
                    รอ Queue #{queueIndex} ลงสนามก่อน
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-sm font-black text-white">เตรียม Pre-Match</div>
          <div className="text-[10px] text-slate-400">ว่าง {3 - confirmedQueue.length} ช่อง</div>
        </div>

        <div className="space-y-3">
          {([1, 2, 3] as PreMatchSlot[]).map((slot) => {
            if (normalizedConfirmed[slot - 1]) return null;
            const draft = autoDrafts[slot];

            return (
              <div key={slot} className="rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-white">PM#{slot}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {draft ? 'Draft จาก Waiting Queue' : 'รอผู้เล่นครบ 4 คน'}
                    </div>
                  </div>

                  {draft && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEditor(slot)}
                        className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-[10px] font-bold text-slate-300 hover:text-white"
                      >
                        แก้คู่
                      </button>
                      <button
                        type="button"
                        onClick={() => confirmAutoDraft(slot)}
                        className="flex items-center gap-1 rounded-lg bg-violet-500 px-2.5 py-1.5 text-[10px] font-black text-white hover:bg-violet-400"
                      >
                        <Check className="h-3 w-3" />
                        Confirm
                      </button>
                    </div>
                  )}
                </div>

                {draft && (
                  <div className="mt-2">
                    {/* PREMATCH_COURT_VIEW_V71E: Draft uses same orientation as court */}
                    {renderCourtLineupWithSkill(draft.teamA, draft.teamB, true)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editingSlot && editingLineup && (
        <div className="rounded-2xl border-2 border-amber-500/50 bg-slate-900 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-black text-white">แก้ Pre-Match #{editingSlot}</div>
              <div className="mt-0.5 text-[10px] text-amber-300">
                ถ้าเป็น PM ที่ Confirm แล้ว เวลา Confirm เดิมจะไม่เปลี่ยน
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingSlot(null);
                setEditingLineup(null);
              }}
              className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[9px] font-black">
            <span className="text-blue-400">TEAM A</span>
            <span className="text-slate-500">VS</span>
            <span className="text-right text-rose-400">TEAM B</span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-3">
            {([
              // PREMATCH_COURT_VIEW_V71E
              // Row 1 = A1 vs B1, Row 2 = A2 vs B2
              ['A', 0],
              ['B', 0],
              ['A', 1],
              ['B', 1],
            ] as Array<['A' | 'B', 0 | 1]>).map(([team, index]) => {
              const value =
                team === 'A'
                  ? editingLineup.teamA[index]
                  : editingLineup.teamB[index];

              return (
                <div key={`${team}-${index}`}>
                  <label className={`mb-1 block text-[10px] font-black ${team === 'A' ? 'text-blue-400' : 'text-rose-400'}`}>
                    Team {team} • คน {index + 1}
                  </label>
                  <select
                    value={value}
                    onChange={(event) =>
                      setEditorPlayer(team, index, event.target.value)
                    }
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-2.5 py-2 text-xs text-white"
                  >
                    <option value="">-- เลือก --</option>
                    {candidatePlayersForEditor.map((player) => (
                      <option key={player.id} value={player.id}>
                        {player.nickname} • มือ {player.skillLevel}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={saveEditor}
            className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-400"
          >
            <Check className="h-4 w-4" />
            บันทึก / Confirm PM#{editingSlot}
          </button>
        </div>
      )}
    </div>
  );
};

interface OrganizerWaitingQueueV64Props {
  players: Player[];
  activeMatches: ActiveMatch[];
  confirmedPreMatches: Array<ConfirmedPreMatch | null>;
}

export const OrganizerWaitingQueueV64: React.FC<
  OrganizerWaitingQueueV64Props
> = ({ players, activeMatches, confirmedPreMatches }) => {
  const now = Date.now();

  const playingIds = new Set(
    activeMatches.flatMap((match) => [...match.teamA, ...match.teamB])
  );

  const pmByPlayer = new Map<string, number>();
  confirmedPreMatches.forEach((pm, index) => {
    if (!pm) return;
    [...pm.teamA, ...pm.teamB].forEach((id) => {
      pmByPlayer.set(id, index + 1);
    });
  });

  const queue = players
    .filter(
      (player) =>
        player.isCheckedIn &&
        player.status === 'waiting' &&
        !playingIds.has(player.id)
    )
    .sort((a, b) => comparePlayerPriority(a, b, now));

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-5">
      <div className="mb-4 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-black text-white">
              ตารางคิวรอลงเล่นทั้งหมด ({queue.length} คน)
            </h3>
          </div>
          <span className="text-[10px] font-bold text-amber-300">
            เรียงตาม Waiting Priority
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[9px] font-bold">
          <span className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-emerald-300">● &lt;10 นาที</span>
          <span className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-2 py-1 text-cyan-300">● 10–19 นาที</span>
          <span className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-amber-300">● 20–29 นาที</span>
          <span className="rounded-lg border border-rose-500/45 bg-rose-500/10 px-2 py-1 text-rose-300">● 30+ นาที</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {queue.map((player, index) => {
          const pmSlot = pmByPlayer.get(player.id);
          const waitMs = getPlayerWaitTimeMs(player, now);
          const waitTone = getWaitTone(waitMs);

          return (
            <div
              key={player.id}
              className={`rounded-xl border p-2.5 transition ${waitTone.card}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-black text-white">
                  {index + 1}. {player.nickname}
                </span>
                {pmSlot && (
                  <span className="shrink-0 rounded bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-black text-violet-300">
                    PM{pmSlot}
                  </span>
                )}
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-0.5 text-[9px] font-black ${waitTone.badge}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${waitTone.dot}`} />
                  รอ {formatWaitMinutes(waitMs)}
                </span>
                <span className="text-[9px] font-bold text-slate-500">
                  {player.matchesPlayed || 0} Match
                </span>
              </div>
            </div>
          );
        })}

        {queue.length === 0 && (
          <div className="col-span-full py-6 text-center text-xs text-slate-500">
            ไม่มีผู้เล่นใน Waiting Queue
          </div>
        )}
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Check, Edit2, Play, X, Clock, Users, Sparkles } from 'lucide-react';
import { ActiveMatch, ConfirmedPreMatch, Player, SessionConfig, SKILL_LEVELS } from '../types';
import {
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

  // PM_DRAFT_CONFIRM_V6D
  draftPreMatches: Array<ConfirmedPreMatch | null>;

  onSavePreMatchDraft: (
    draft: ConfirmedPreMatch,
    slot: PreMatchSlot
  ) => void;

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
  1: 'border-slate-700/70 bg-slate-900',
  2: 'border-slate-700/70 bg-slate-900',
  3: 'border-slate-700/70 bg-slate-900',
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

// PM_WAIT_LONGEST_V4
const compareWaitingLongestFirst = (
  a: Player,
  b: Player,
  now: number
) => {
  const waitA = getPlayerWaitTimeMs(a, now);
  const waitB = getPlayerWaitTimeMs(b, now);

  // Main priority: longest Waiting Time first.
  if (waitA !== waitB) {
    return waitB - waitA;
  }

  // Tie breaker: earlier check-in first.
  const checkInA = Number(a.checkInTimestamp || 0);
  const checkInB = Number(b.checkInTimestamp || 0);

  if (checkInA !== checkInB) {
    return checkInA - checkInB;
  }

  return a.nickname.localeCompare(b.nickname, 'th');
};

export const PreMatchManagerV64: React.FC<PreMatchManagerV64Props> = ({
  sessionConfig,
  players,
  activeMatches,
  confirmedPreMatches,
  draftPreMatches,
  onSavePreMatchDraft,
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

  // PM_DRAFT_CONFIRM_V6D
  const normalizedDrafts = useMemo(
    () =>
      ([1, 2, 3] as PreMatchSlot[]).map((slot) => {
        const draft =
          draftPreMatches[
            slot - 1
          ] || null;

        return draft
          ? {
              ...draft,
              slotNumber: slot,
            }
          : null;
      }),
    [draftPreMatches]
  );

  const sameLineup = (
    first?: ConfirmedPreMatch | null,
    second?: ConfirmedPreMatch | null
  ) => {
    if (!first || !second) {
      return false;
    }

    return (
      first.teamA[0] === second.teamA[0] &&
      first.teamA[1] === second.teamA[1] &&
      first.teamB[0] === second.teamB[0] &&
      first.teamB[1] === second.teamB[1]
    );
  };

  const hasPendingDraft = (
    slot: PreMatchSlot
  ) => {
    const draft =
      normalizedDrafts[
        slot - 1
      ];

    if (!draft) {
      return false;
    }

    const confirmed =
      normalizedConfirmed[
        slot - 1
      ];

    return (
      !confirmed ||
      !sameLineup(
        draft,
        confirmed
      )
    );
  };

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
        [
          ...confirmedQueue.flatMap(
            (pm) => [
              ...pm.teamA,
              ...pm.teamB,
            ]
          ),

          ...normalizedDrafts
            .filter(
              (pm): pm is ConfirmedPreMatch =>
                Boolean(pm)
            )
            .flatMap(
              (pm) => [
                ...pm.teamA,
                ...pm.teamB,
              ]
            ),
        ].filter(
          (id) =>
            !id.startsWith(
              '__PM_VACANT__'
            )
        )
      ),
    [
      confirmedQueue,
      normalizedDrafts,
    ]
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
      .sort((a, b) => compareWaitingLongestFirst(a, b, now));
  }, [players, playingIds]);

  const autoDrafts = useMemo(() => {
    const result: Partial<Record<PreMatchSlot, EditableLineup>> = {};
    let pool = waitingPlayers.filter((player) => !reservedIds.has(player.id));

    ([1, 2, 3] as PreMatchSlot[]).forEach((slot) => {
      if (normalizedConfirmed[slot - 1]) return;
      if (normalizedDrafts[slot - 1]) return;
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
  }, [
    waitingPlayers,
    reservedIds,
    normalizedConfirmed,
    normalizedDrafts,
  ]);

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

  // GG_PREMATCH_VALIDATION_V58
  const getPlayerIssue = (id: string): string | null => {
    if (!id || id.startsWith('__PM_VACANT__')) return 'ยังไม่มีผู้เล่น';
    const p = getPlayer(id);
    if (!p) return 'ไม่พบสมาชิก';
    if (!p.isCheckedIn) return 'ยังไม่ได้ Check-in';
    if (p.status === 'left') return 'Check-out แล้ว';
    if (p.status === 'resting') return 'กำลังพัก';
    if (p.status === 'playing' || playingIds.has(id)) return 'กำลังเล่นอยู่';
    if (p.status !== 'waiting') return 'ยังไม่พร้อม';
    return null;
  };
  const getLineupIssues = (lineup: EditableLineup | null) => {
    if (!lineup) return ['ยังไม่มีรายชื่อ'];
    const ids = [...lineup.teamA, ...lineup.teamB];
    const issues = ids.map((id) => getPlayerIssue(id)).filter((v): v is string => Boolean(v));
    if (new Set(ids).size !== 4) issues.push('มีชื่อผู้เล่นซ้ำ');
    return issues;
  };

  const openEditor = (slot: PreMatchSlot) => {
    const savedDraft =
      normalizedDrafts[
        slot - 1
      ];

    const confirmed =
      normalizedConfirmed[
        slot - 1
      ];

    const auto =
      autoDrafts[slot];

    const source =
      savedDraft
        ? {
            teamA:
              [...savedDraft.teamA] as [string, string],
            teamB:
              [...savedDraft.teamB] as [string, string],
          }
        : confirmed
        ? {
            teamA:
              [...confirmed.teamA] as [string, string],
            teamB:
              [...confirmed.teamB] as [string, string],
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

    const reservedByOtherPm =
      new Set<string>();

    normalizedConfirmed.forEach(
      (pm, index) => {
        if (
          !pm ||
          index === editingSlot - 1
        ) {
          return;
        }

        [
          ...pm.teamA,
          ...pm.teamB,
        ].forEach((id) => {
          if (
            !id.startsWith(
              '__PM_VACANT__'
            )
          ) {
            reservedByOtherPm.add(id);
          }
        });
      }
    );

    normalizedDrafts.forEach(
      (pm, index) => {
        if (
          !pm ||
          index === editingSlot - 1
        ) {
          return;
        }

        [
          ...pm.teamA,
          ...pm.teamB,
        ].forEach((id) => {
          if (
            !id.startsWith(
              '__PM_VACANT__'
            )
          ) {
            reservedByOtherPm.add(id);
          }
        });
      }
    );

    // PM_PLAYING_BLOCK_V4
    // Organizer may select only members who are READY / Waiting.
    // Active-court players are blocked even if their status is stale.
    return players
      .filter(
        (player) =>
          player.isCheckedIn &&
          player.status === 'waiting' &&
          !playingIds.has(player.id) &&
          (currentIds.has(player.id) || !reservedByOtherPm.has(player.id))
      )
      .sort((a, b) =>
        compareWaitingLongestFirst(a, b, Date.now())
      );
  }, [
    editingSlot,
    editingLineup,
    normalizedConfirmed,
    normalizedDrafts,
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

    const existingConfirmed =
      normalizedConfirmed[
        editingSlot - 1
      ];

    const existingDraft =
      normalizedDrafts[
        editingSlot - 1
      ];

    // PM_DRAFT_CONFIRM_V6D
    // SAVE = Draft only. Never Confirm here.
    onSavePreMatchDraft(
      {
        id:
          existingDraft?.id ||
          existingConfirmed?.id ||
          `draft-pm-${editingSlot}-${Date.now()}`,
        slotNumber: editingSlot,
        teamA: editingLineup.teamA,
        teamB: editingLineup.teamB,

        // Preserve the old Confirm timestamp as a reference only.
        // New PM Draft remains 0 until explicit Confirm.
        confirmedAt:
          existingConfirmed?.confirmedAt ||
          0,

        pairingLabelThai:
          'Draft รอ Confirm',

        explanationThai:
          'บันทึกรายชื่อ Draft แล้ว ต้องกด Confirm PM แยกอีกครั้ง',

        notes:
          existingDraft?.notes ||
          existingConfirmed?.notes ||
          '',
      },
      editingSlot
    );

    // Keep editor open so organizer can edit/save again.
  };

  const saveSuggestedDraft = (
    slot: PreMatchSlot
  ) => {
    const draft =
      autoDrafts[slot];

    if (!draft) return;

    onSavePreMatchDraft(
      {
        id:
          `draft-pm-${slot}-${Date.now()}`,
        slotNumber: slot,
        teamA: draft.teamA,
        teamB: draft.teamB,
        confirmedAt: 0,
        pairingLabelThai:
          'Draft จาก Waiting Queue',
        explanationThai:
          'บันทึก Draft จากระบบแนะนำ รอผู้จัด Confirm PM',
        notes: '',
      },
      slot
    );
  };

  const confirmSavedDraft = (
    slot: PreMatchSlot
  ) => {
    const savedDraft =
      normalizedDrafts[
        slot - 1
      ];

    if (!savedDraft) {
      window.alert(
        'กรุณาบันทึก Draft ก่อน Confirm PM'
      );
      return;
    }

    const ids = [
      ...savedDraft.teamA,
      ...savedDraft.teamB,
    ];

    if (
      ids.some(
        (id) =>
          !id ||
          id.startsWith(
            '__PM_VACANT__'
          )
      ) ||
      new Set(ids).size !== 4
    ) {
      window.alert(
        'Draft ยังมีช่องว่าง กรุณาเลือกผู้เล่นให้ครบ 4 คนก่อน Confirm PM'
      );
      return;
    }

    const existingConfirmed =
      normalizedConfirmed[
        slot - 1
      ];

    const issues = getLineupIssues(savedDraft);
    if (issues.length > 0) {
      window.alert('ยังยืนยัน Pre-Match ไม่ได้\n' + [...new Set(issues)].join('\n') + '\nกรุณาแก้รายชื่อ หรือรอ Check-in');
      return;
    }

    onConfirmPreMatch(
      {
        ...savedDraft,

        id:
          existingConfirmed?.id ||
          savedDraft.id ||
          `pre-${slot}-${Date.now()}`,

        slotNumber: slot,

        confirmedAt:
          existingConfirmed?.confirmedAt ||
          Date.now(),

        pairingLabelThai:
          'ยืนยันโดยผู้จัดก๊วน',

        explanationThai:
          existingConfirmed
            ? 'Confirm การแก้ไข Draft โดยรักษาเวลา Confirm เดิม'
            : 'Confirm จาก Draft ที่บันทึกไว้',
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
    if (!player) return <span className="text-amber-300">ไม่พบสมาชิก</span>;
    const issue = getPlayerIssue(id);
    const skill = SKILL_LEVELS[player.skillLevel];

    return (
      <span className={`inline-flex min-w-0 flex-wrap items-center gap-1.5 ${issue ? 'rounded-md bg-amber-500/10 px-1.5 py-1 ring-1 ring-amber-500/30' : ''}`}>
        <span className={`font-black ${issue ? 'text-amber-200' : 'text-white'}`}>{player.nickname}</span>
        {issue && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-300">{issue}</span>}
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
    <div className="gg-v57-prematch space-y-3">
      <div className="gg-v57-queue-header rounded-2xl border border-slate-700/45 bg-slate-900 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white">
              คิว Pre-Match
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
                  ? 'border-teal-500/65 bg-slate-900 ring-1 ring-teal-500/20'
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
                  {hasPendingDraft(slot) && (
                    <button
                      type="button"
                      onClick={() =>
                        confirmSavedDraft(slot)
                      }
                      className="rounded-xl border border-amber-500/60 bg-amber-500/15 px-2.5 py-2 text-[9px] font-black text-amber-300 transition hover:bg-amber-500/25"
                      title="ยืนยันรายชื่อจาก Draft ที่บันทึกไว้"
                    >
                      Confirm แก้ไข
                    </button>
                  )}

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
                  มีผู้เล่นที่ยังไม่พร้อม: {[...new Set(getLineupIssues(pm))].join(' / ')}
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

            const savedDraft =
              normalizedDrafts[
                slot - 1
              ];

            const draft =
              savedDraft ||
              autoDrafts[slot];
            const draftIssues = draft ? getLineupIssues(draft) : [];
            const canConfirm = Boolean(savedDraft) && draftIssues.length === 0;

            return (
              <div key={slot} className={`rounded-xl border p-3 transition-colors ${draftIssues.length ? 'border-amber-700/50 bg-[#171d25]' : 'border-slate-700/70 bg-[#171e27]'}`}>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-white">PM#{slot}</div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      {savedDraft
                        ? 'Draft บันทึกแล้ว • รอ Confirm PM'
                        : draft
                        ? 'ระบบแนะนำ • ยังไม่ได้บันทึก Draft'
                        : 'รอผู้เล่น'}
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
                      {savedDraft ? (
                        <button
                          type="button"
                          onClick={() =>
                            confirmSavedDraft(slot)
                          }
                          disabled={!canConfirm}
                          title={!canConfirm ? 'ต้องให้ผู้เล่นทั้ง 4 คน Check-in และพร้อมเล่นก่อน' : 'ยืนยัน Pre-Match'}
                          className="flex items-center gap-1 rounded-lg bg-emerald-500 px-2.5 py-1.5 text-[10px] font-black text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                        >
                          <Check className="h-3 w-3" />
                          Confirm PM
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            saveSuggestedDraft(slot)
                          }
                          className="flex items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[10px] font-black text-slate-950 hover:bg-amber-400"
                        >
                          <Check className="h-3 w-3" />
                          บันทึก Draft
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {draftIssues.length > 0 && <div className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/20 px-2.5 py-2 text-[10px] text-amber-200">ต้องตรวจสอบ: {[...new Set(draftIssues)].join(' / ')}</div>}
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
                บันทึก Draft ได้หลายครั้ง • การบันทึกยังไม่ใช่ Confirm PM
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

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={saveEditor}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-amber-400"
            >
              <Check className="h-4 w-4" />
              บันทึก Draft PM#{editingSlot}
            </button>

            <button
              type="button"
              disabled={!normalizedDrafts[editingSlot - 1] || getLineupIssues(normalizedDrafts[editingSlot - 1]).length > 0 || getLineupIssues(editingLineup).length > 0}
              onClick={() =>
                confirmSavedDraft(
                  editingSlot
                )
              }
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
              title="ต้องบันทึก Draft ก่อน จึง Confirm PM ได้"
            >
              <Check className="h-4 w-4" />
              Confirm PM#{editingSlot}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface OrganizerWaitingQueueV64Props {
  players: Player[];
  activeMatches: ActiveMatch[];
  confirmedPreMatches: Array<ConfirmedPreMatch | null>;

  // PM_WAITING_TO_DRAFT_V6D
  draftPreMatches: Array<ConfirmedPreMatch | null>;

  onAssignWaitingPlayerToDraft?: (
    playerId: string,
    currentDraftSlot: PreMatchSlot | null,
    targetSlot: PreMatchSlot,
    targetPlayerId: string
  ) => boolean;

  // PM_SWAP_V4
  onSwapPreMatchPlayers?: (
    playerAId: string,
    slotA: PreMatchSlot,
    playerBId: string,
    slotB: PreMatchSlot
  ) => boolean;
}

export const OrganizerWaitingQueueV64: React.FC<
  OrganizerWaitingQueueV64Props
> = ({
  players,
  activeMatches,
  confirmedPreMatches,
  draftPreMatches,
  onAssignWaitingPlayerToDraft,
  onSwapPreMatchPlayers,
}) => {
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

  // PM_WAITING_TO_DRAFT_V6D
  const draftByPlayer =
    new Map<string, number>();

  draftPreMatches.forEach(
    (draft, index) => {
      if (!draft) return;

      [
        ...draft.teamA,
        ...draft.teamB,
      ].forEach((id) => {
        if (
          !id.startsWith(
            '__PM_VACANT__'
          )
        ) {
          draftByPlayer.set(
            id,
            index + 1
          );
        }
      });
    }
  );

  const queue = players
    .filter(
      (player) =>
        player.isCheckedIn &&
        player.status === 'waiting' &&
        !playingIds.has(player.id)
    )
    .sort((a, b) => compareWaitingLongestFirst(a, b, now));

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
            Waiting Time มากสุดอยู่บนสุด
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
          const pmSlot = pmByPlayer.get(player.id) as PreMatchSlot | undefined;
          const draftSlot = draftByPlayer.get(player.id) as PreMatchSlot | undefined;
          const waitMs = getPlayerWaitTimeMs(player, now);
          const waitTone = getWaitTone(waitMs);

          return (
            <div
              key={player.id}
              className={`rounded-xl border p-2.5 transition ${
                pmSlot || draftSlot
                  ? 'border-slate-700 bg-slate-950/80 opacity-60'
                  : waitTone.card
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`truncate text-xs font-black ${
                    pmSlot || draftSlot ? 'text-slate-400' : 'text-white'
                  }`}
                >
                  {index + 1}. {player.nickname}
                </span>
                {pmSlot && (
                  <span className="shrink-0 rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 text-[9px] font-black text-slate-400">
                    PM{pmSlot}
                  </span>
                )}

                {!pmSlot && draftSlot && (
                  <span className="shrink-0 rounded border border-amber-700/70 bg-amber-950/40 px-1.5 py-0.5 text-[9px] font-black text-amber-300">
                    Draft PM{draftSlot}
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

              {/* PM_WAITING_TO_DRAFT_SELECT_V6D */}
              {!pmSlot &&
                onAssignWaitingPlayerToDraft && (
                  <select
                    defaultValue=""
                    onChange={(event) => {
                      const raw =
                        event.currentTarget.value;

                      if (!raw) {
                        return;
                      }

                      const separator =
                        raw.indexOf(':');

                      const targetSlot =
                        Number(
                          raw.slice(
                            0,
                            separator
                          )
                        ) as PreMatchSlot;

                      const targetPlayerId =
                        raw.slice(
                          separator + 1
                        );

                      const targetBase =
                        draftPreMatches[
                          targetSlot - 1
                        ] ||
                        confirmedPreMatches[
                          targetSlot - 1
                        ];

                      let actionText =
                        `ย้าย ${player.nickname} เข้า Draft PM${targetSlot} ?`;

                      if (
                        targetPlayerId !==
                        '__START_NEW__'
                      ) {
                        const vacant =
                          targetPlayerId.startsWith(
                            '__PM_VACANT__'
                          );

                        const target =
                          vacant
                            ? null
                            : players.find(
                                (item) =>
                                  item.id ===
                                  targetPlayerId
                              );

                        actionText =
                          vacant
                            ? `ย้าย ${player.nickname} เข้า ช่องว่าง Draft PM${targetSlot} ?`
                            : `ย้าย ${player.nickname} เข้า Draft PM${targetSlot} แทน ${target?.nickname || 'ผู้เล่น'} ?`;
                      }

                      if (
                        !window.confirm(
                          actionText
                        )
                      ) {
                        event.currentTarget.value = '';
                        return;
                      }

                      const ok =
                        onAssignWaitingPlayerToDraft(
                          player.id,
                          draftSlot || null,
                          targetSlot,
                          targetPlayerId
                        );

                      if (!ok) {
                        window.alert(
                          'ย้ายเข้า Draft PM ไม่สำเร็จ กรุณาตรวจสอบสถานะผู้เล่น'
                        );
                      }

                      event.currentTarget.value = '';
                    }}
                    className="mt-2 w-full rounded-lg border border-amber-700/60 bg-slate-950 px-2 py-1.5 text-[9px] font-bold text-amber-300 outline-none focus:border-amber-500"
                  >
                    <option value="">
                      {draftSlot
                        ? `↔ ย้ายจาก Draft PM${draftSlot}`
                        : '+ เลือกเข้า Draft PM'}
                    </option>

                    {([1, 2, 3] as PreMatchSlot[]).map(
                      (targetSlot) => {
                        if (
                          targetSlot ===
                          draftSlot
                        ) {
                          return null;
                        }

                        const targetBase =
                          draftPreMatches[
                            targetSlot - 1
                          ] ||
                          confirmedPreMatches[
                            targetSlot - 1
                          ];

                        if (!targetBase) {
                          return (
                            <option
                              key={`start-${targetSlot}`}
                              value={`${targetSlot}:__START_NEW__`}
                            >
                              PM{targetSlot} • เริ่ม Draft ใหม่
                            </option>
                          );
                        }

                        const targetIds = [
                          ...targetBase.teamA,
                          ...targetBase.teamB,
                        ];

                        return (
                          <optgroup
                            key={`pm-${targetSlot}`}
                            label={`Draft PM${targetSlot}`}
                          >
                            {targetIds.map(
                              (targetId) => {
                                const vacant =
                                  targetId.startsWith(
                                    '__PM_VACANT__'
                                  );

                                const target =
                                  vacant
                                    ? null
                                    : players.find(
                                        (item) =>
                                          item.id ===
                                          targetId
                                      );

                                if (
                                  !vacant &&
                                  !target
                                ) {
                                  return null;
                                }

                                return (
                                  <option
                                    key={`${targetSlot}-${targetId}`}
                                    value={`${targetSlot}:${targetId}`}
                                  >
                                    {vacant
                                      ? `PM${targetSlot} • ช่องว่าง`
                                      : draftSlot
                                      ? `PM${targetSlot} ↔ ${target?.nickname}`
                                      : `PM${targetSlot} • แทน ${target?.nickname}`}
                                  </option>
                                );
                              }
                            )}
                          </optgroup>
                        );
                      }
                    )}
                  </select>
                )}

              {/* PM_SWAP_SELECT_V4 */}
              {pmSlot && onSwapPreMatchPlayers && (
                <select
                  defaultValue=""
                  onChange={(event) => {
                    const raw = event.currentTarget.value;

                    if (!raw) {
                      return;
                    }

                    const separatorIndex = raw.indexOf(':');
                    const targetSlot = Number(
                      raw.slice(0, separatorIndex)
                    ) as PreMatchSlot;
                    const targetPlayerId =
                      raw.slice(separatorIndex + 1);

                    const ok = onSwapPreMatchPlayers(
                      player.id,
                      pmSlot,
                      targetPlayerId,
                      targetSlot
                    );

                    if (!ok) {
                      window.alert(
                        'สลับ PM ไม่สำเร็จ กรุณาตรวจสอบสถานะผู้เล่น'
                      );
                    }

                    event.currentTarget.value = '';
                  }}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[9px] font-bold text-slate-300 outline-none focus:border-violet-500"
                  title="สลับผู้เล่นระหว่าง PM1 / PM2 / PM3"
                >
                  <option value="">
                    ↔ สลับไป PM อื่น
                  </option>

                  {confirmedPreMatches.flatMap(
                    (targetPm, targetIndex) => {
                      const targetSlot =
                        (targetIndex + 1) as PreMatchSlot;

                      if (
                        !targetPm ||
                        targetSlot === pmSlot
                      ) {
                        return [];
                      }

                      return [
                        ...targetPm.teamA,
                        ...targetPm.teamB,
                      ].map((targetId) => {
                        const targetPlayer =
                          players.find(
                            (item) =>
                              item.id === targetId
                          );

                        if (!targetPlayer) {
                          return null;
                        }

                        return (
                          <option
                            key={`${targetSlot}-${targetId}`}
                            value={`${targetSlot}:${targetId}`}
                          >
                            PM{targetSlot} ↔ {targetPlayer.nickname}
                          </option>
                        );
                      });
                    }
                  )}
                </select>
              )}
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

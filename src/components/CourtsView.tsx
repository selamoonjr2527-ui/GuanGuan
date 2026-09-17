import React, { useState, useEffect } from 'react';
import { 
  Play, Plus, CheckCircle, Clock, Flame, Users, 
  Sparkles, Shuffle, Shield, Trophy, ChevronRight, X, Minus
} from 'lucide-react';
import { Player, ActiveMatch, MatchHistoryItem, SessionConfig, SKILL_LEVELS, SkillLevel, ConfirmedPreMatch } from '../types';
import { findBalancedMatch, MatchmakingResult, getPlayerWaitTimeMs, formatWaitMinutes } from '../utils/matchmaker';

interface CourtsViewProps {
  sessionConfig: SessionConfig;
  players: Player[];
  activeMatches: ActiveMatch[];
  matchHistory: MatchHistoryItem[];
  isOrganizerMode?: boolean;
  hideSkillFromMembers?: boolean;
  confirmedPreMatch?: ConfirmedPreMatch | null;
  confirmedPreMatch2?: ConfirmedPreMatch | null;
  onStartMatch: (courtId: string, courtName: string, teamA: [string, string], teamB: [string, string]) => void;
  onFinishMatch: (
    matchId: string,
    shuttlecocksCount: number,
    scores?: {
      game1ScoreA?: number;
      game1ScoreB?: number;
      game2ScoreA?: number;
      game2ScoreB?: number;
    }
  ) => void;
  onUpdateMatchShuttlecocks: (matchId: string, delta: number) => void;
  onUpdateMatchScore: (
    matchId: string,
    scores: {
      game1ScoreA?: number;
      game1ScoreB?: number;
      game2ScoreA?: number;
      game2ScoreB?: number;
      scoreA?: number;
      scoreB?: number;
    }
  ) => void;
}

export const CourtsView: React.FC<CourtsViewProps> = ({
  sessionConfig,
  players,
  activeMatches,
  matchHistory,
  isOrganizerMode = false,
  hideSkillFromMembers = true,
  confirmedPreMatch,
  confirmedPreMatch2,
  onStartMatch,
  onFinishMatch,
  onUpdateMatchShuttlecocks,
  onUpdateMatchScore,
}) => {
  const showSkill = isOrganizerMode || !hideSkillFromMembers;
  // Timer tick for live match durations
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Matchmaker Modal state
  const [matchModalCourt, setMatchModalCourt] = useState<{ id: string; name: string } | null>(null);
  const [matchMode, setMatchMode] = useState<'balanced' | 'same_tier' | 'fair_queue'>('balanced');
  const [suggestedMatch, setSuggestedMatch] = useState<MatchmakingResult | null>(null);

  // Manual player picker selection (if user wants manual selection)
  const [manualMode, setManualMode] = useState(false);
  const [selectedTeamA, setSelectedTeamA] = useState<string[]>([]);
  const [selectedTeamB, setSelectedTeamB] = useState<string[]>([]);

  // Available players for matchmaking: Checked in AND not currently in an active match
  const playingPlayerIds = new Set(
    activeMatches.flatMap((m) => [...m.teamA, ...m.teamB])
  );

  const now = Date.now();
  const availablePlayers = players
    .filter((p) => p.isCheckedIn && !playingPlayerIds.has(p.id) && p.status !== 'left')
    .sort((a, b) => {
      // Waiting players get priority over resting players
      if (a.status === 'resting' && b.status !== 'resting') return 1;
      if (b.status === 'resting' && a.status !== 'resting') return -1;

      // Sort by waiting time descending (longest waiting player first)
      const waitA = getPlayerWaitTimeMs(a, now);
      const waitB = getPlayerWaitTimeMs(b, now);
      if (Math.abs(waitA - waitB) > 2 * 60 * 1000) {
        return waitB - waitA;
      }
      return a.gamesPlayed - b.gamesPlayed;
    });

  // Calculate suggested match whenever modal opens or mode changes
  useEffect(() => {
    if (matchModalCourt) {
      const result = findBalancedMatch(availablePlayers, matchMode);
      setSuggestedMatch(result);
      if (result) {
        setSelectedTeamA([result.teamA[0].id, result.teamA[1].id]);
        setSelectedTeamB([result.teamB[0].id, result.teamB[1].id]);
      } else {
        setSelectedTeamA([]);
        setSelectedTeamB([]);
      }
    }
  }, [matchModalCourt, matchMode, players]);

  const handleOpenMatchModal = (courtId: string, courtName: string) => {
    setMatchModalCourt({ id: courtId, name: courtName });
    setManualMode(false);
  };

  const handleConfirmStartMatch = () => {
    if (!matchModalCourt) return;
    if (selectedTeamA.length !== 2 || selectedTeamB.length !== 2) return;

    onStartMatch(
      matchModalCourt.id,
      matchModalCourt.name,
      [selectedTeamA[0], selectedTeamA[1]],
      [selectedTeamB[0], selectedTeamB[1]]
    );

    setMatchModalCourt(null);
  };

  const handleToggleManualPlayer = (playerId: string) => {
    if (selectedTeamA.includes(playerId)) {
      setSelectedTeamA(selectedTeamA.filter((id) => id !== playerId));
    } else if (selectedTeamB.includes(playerId)) {
      setSelectedTeamB(selectedTeamB.filter((id) => id !== playerId));
    } else if (selectedTeamA.length < 2) {
      setSelectedTeamA([...selectedTeamA, playerId]);
    } else if (selectedTeamB.length < 2) {
      setSelectedTeamB([...selectedTeamB, playerId]);
    }
  };

  const formatElapsedTime = (startTime: number) => {
    const elapsedSecs = Math.max(0, Math.floor((Date.now() - startTime) / 1000));
    const mins = Math.floor(elapsedSecs / 60);
    const secs = elapsedSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <span>จัดการคอร์ท & จัดคู่ลงแข่งขัน</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            มี {sessionConfig.courtCount} คอร์ท ({sessionConfig.courtNames.join(', ')}) • พร้อมลงสนาม {availablePlayers.length} คน • กำลังแข่ง {activeMatches.length * 4} คน
          </p>
        </div>

        {/* Quick Quick Queue status */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>คอร์ทว่าง: <strong className="text-emerald-400">{sessionConfig.courtCount - activeMatches.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Courts Visual Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {sessionConfig.courtNames.map((courtName, idx) => {
          const courtId = `court-${idx + 1}`;
          const activeMatch = activeMatches.find((m) => m.courtId === courtId || m.courtName === courtName);

          if (!activeMatch) {
            // Available Court
            return (
              <div
                key={courtId}
                className="bg-slate-900 border border-dashed border-slate-700/80 rounded-2xl p-6 flex flex-col items-center justify-center text-center relative overflow-hidden min-h-[360px] hover:border-emerald-500/50 transition group"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-2xl mb-3 group-hover:scale-110 transition">
                  🏸
                </div>
                <div className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 mb-1">
                  คอร์ทว่าง (Available)
                </div>
                <h3 className="text-xl font-bold text-white mb-1">{courtName}</h3>
                <p className="text-xs text-slate-400 max-w-xs mb-4">
                  พร้อมลงจัดคู่ใหม่ มีผู้เล่นรอคิวอยู่ {availablePlayers.length} คน
                </p>

                {isOrganizerMode ? (
                  <div className="flex flex-col gap-2 w-full max-w-xs">
                    {/* Quick Load Pre-Match 1 if exists */}
                    {confirmedPreMatch && (
                      <button
                        type="button"
                        onClick={() =>
                          onStartMatch(
                            courtId,
                            courtName,
                            confirmedPreMatch.teamA,
                            confirmedPreMatch.teamB
                          )
                        }
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>🚀 ส่ง Pre-Match 1 ลงคอร์ทนี้</span>
                      </button>
                    )}

                    {/* Quick Load Pre-Match 2 if exists */}
                    {confirmedPreMatch2 && (
                      <button
                        type="button"
                        onClick={() =>
                          onStartMatch(
                            courtId,
                            courtName,
                            confirmedPreMatch2.teamA,
                            confirmedPreMatch2.teamB
                          )
                        }
                        className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow transition"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>🚀 ส่ง Pre-Match 2 ลงคอร์ทนี้</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenMatchModal(courtId, courtName)}
                      disabled={availablePlayers.length < 4}
                      className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs sm:text-sm transition shadow-md"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>จัดคู่ลงคอร์ทนี้ ({availablePlayers.length >= 4 ? 'พร้อมจัดคู่' : 'รอครบ 4 คน'})</span>
                    </button>
                  </div>
                ) : (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-xs text-slate-400 max-w-xs">
                    <div className="flex items-center justify-center gap-1 text-amber-400 font-semibold mb-1">
                      <span>🔒 เฉพาะผู้จัดก๊วนเท่านั้น</span>
                    </div>
                    <span>การจัดคนลงคอร์ทต้องดำเนินการโดยผู้จัดก๊วน (Admin) เท่านั้น</span>
                  </div>
                )}
              </div>
            );
          }

          // Active Match on Court
          const teamAPlayers = activeMatch.teamA.map((id) => players.find((p) => p.id === id)).filter(Boolean) as Player[];
          const teamBPlayers = activeMatch.teamB.map((id) => players.find((p) => p.id === id)).filter(Boolean) as Player[];

          const teamAAvg = teamAPlayers.length > 0
            ? teamAPlayers.reduce((acc, p) => acc + p.skillScore, 0) / teamAPlayers.length
            : 0;
          const teamBAvg = teamBPlayers.length > 0
            ? teamBPlayers.reduce((acc, p) => acc + p.skillScore, 0) / teamBPlayers.length
            : 0;
          const skillDiff = Math.abs(teamAAvg - teamBAvg);

          return (
            <div
              key={courtId}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg flex flex-col justify-between"
            >
              {/* Court Header */}
              <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping" />
                  <span className="font-bold text-white text-sm">{courtName}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-950 text-amber-300 border border-amber-800 font-semibold">
                    กำลังแข่งขัน
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-mono font-bold text-white text-sm">
                      {formatElapsedTime(activeMatch.startTime)}
                    </span>
                  </span>
                </div>
              </div>

              {/* Badminton Court Visual Arena */}
              <div className="p-4 bg-gradient-to-b from-slate-950 to-slate-900">
                <div className="relative border-2 border-emerald-600/60 rounded-xl bg-emerald-950/40 p-3 overflow-hidden shadow-inner">
                  {/* Center Court Net Line */}
                  <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-white/40 -translate-x-1/2 z-0 border-l border-dashed border-white/60">
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[9px] px-1.5 py-0.5 rounded border border-slate-700 whitespace-nowrap">
                      NET
                    </div>
                  </div>

                  {/* Two Teams Grid */}
                  <div className="grid grid-cols-2 gap-4 relative z-10">
                    {/* Team A */}
                    <div className="space-y-2 pr-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-blue-400">ทีม A</span>
                        {showSkill && (
                          <span className="text-[10px] text-slate-400">
                            มือเฉลี่ย: <strong className="text-white">{teamAAvg.toFixed(1)}</strong>
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {teamAPlayers.map((p) => (
                          <div
                            key={p.id}
                            className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2 shadow-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.avatarColor} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                              >
                                {p.nickname.slice(0, 1)}
                              </div>
                              <span className="text-xs font-bold text-white truncate">
                                {p.nickname}
                              </span>
                            </div>
                            {showSkill && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${SKILL_LEVELS[p.skillLevel].bgColor} ${SKILL_LEVELS[p.skillLevel].color} ${SKILL_LEVELS[p.skillLevel].borderColor}`}
                              >
                                {p.skillLevel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Team B */}
                    <div className="space-y-2 pl-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-rose-400">ทีม B</span>
                        {showSkill && (
                          <span className="text-[10px] text-slate-400">
                            มือเฉลี่ย: <strong className="text-white">{teamBAvg.toFixed(1)}</strong>
                          </span>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        {teamBPlayers.map((p) => (
                          <div
                            key={p.id}
                            className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 flex items-center justify-between gap-2 shadow-sm"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <div
                                className={`w-7 h-7 rounded-lg bg-gradient-to-br ${p.avatarColor} text-white text-xs font-bold flex items-center justify-center shrink-0`}
                              >
                                {p.nickname.slice(0, 1)}
                              </div>
                              <span className="text-xs font-bold text-white truncate">
                                {p.nickname}
                              </span>
                            </div>
                            {showSkill && (
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded border shrink-0 ${SKILL_LEVELS[p.skillLevel].bgColor} ${SKILL_LEVELS[p.skillLevel].color} ${SKILL_LEVELS[p.skillLevel].borderColor}`}
                              >
                                {p.skillLevel}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Parity indicator badge */}
                  {showSkill && (
                    <div className="mt-3 pt-2 border-t border-white/10 flex items-center justify-center">
                      <span className="text-[10px] px-2 py-0.5 rounded bg-slate-900/80 text-slate-300 border border-slate-700">
                        ⚖️ ระดับความต่างของมือ: <strong>{skillDiff.toFixed(1)}</strong> (
                        {skillDiff <= 0.3 ? 'สูสีมาก 🔥' : skillDiff <= 0.8 ? 'สมดุลดี 👍' : 'มีต่อแต้ม 🎯'}
                        )
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Match Controls & Shuttlecock Counter */}
              <div className="p-4 bg-slate-950 border-t border-slate-800 space-y-3">
                {isOrganizerMode ? (
                  <>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      {/* Shuttlecock used */}
                      <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                        <span className="text-xs text-slate-400">ลูกขนไก่ที่ใช้:</span>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUpdateMatchShuttlecocks(activeMatch.id, -1)}
                            className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center text-xs"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-bold text-white text-xs w-5 text-center">
                            {activeMatch.shuttlecocksCount}
                          </span>
                          <button
                            type="button"
                            onClick={() => onUpdateMatchShuttlecocks(activeMatch.id, 1)}
                            className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 flex items-center justify-center text-xs"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                        <span>🏸 2 เซ็ต (รอบไป-กลับ)</span>
                      </div>
                    </div>

                    {/* 2 Sets Scoring Inputs */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-bold flex items-center gap-1">
                          <span>บันทึกผลคะแนน (2 เซ็ต):</span>
                        </span>
                        <span className="text-[10px] text-slate-400">
                          <span className="text-blue-400 font-bold">ทีม A</span> vs{' '}
                          <span className="text-rose-400 font-bold">ทีม B</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        {/* Set 1 */}
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                          <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                            <span>เซ็ตที่ 1</span>
                            <span className="text-[9px] text-slate-500">(แต้ม A - B)</span>
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="30"
                              placeholder="A"
                              value={activeMatch.game1ScoreA ?? ''}
                              onChange={(e) =>
                                onUpdateMatchScore(activeMatch.id, {
                                  game1ScoreA:
                                    e.target.value === '' ? undefined : parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-11 text-center py-1 rounded-lg bg-slate-900 border border-slate-700 text-blue-400 font-bold text-xs focus:border-blue-500"
                            />
                            <span className="text-slate-500 text-xs font-bold">-</span>
                            <input
                              type="number"
                              min="0"
                              max="30"
                              placeholder="B"
                              value={activeMatch.game1ScoreB ?? ''}
                              onChange={(e) =>
                                onUpdateMatchScore(activeMatch.id, {
                                  game1ScoreB:
                                    e.target.value === '' ? undefined : parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-11 text-center py-1 rounded-lg bg-slate-900 border border-slate-700 text-rose-400 font-bold text-xs focus:border-rose-500"
                            />
                          </div>
                        </div>

                        {/* Set 2 */}
                        <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                          <div className="text-[10px] text-slate-400 font-semibold mb-1 flex items-center justify-between">
                            <span>เซ็ตที่ 2</span>
                            <span className="text-[9px] text-slate-500">(แต้ม A - B)</span>
                          </div>
                          <div className="flex items-center justify-center gap-1.5">
                            <input
                              type="number"
                              min="0"
                              max="30"
                              placeholder="A"
                              value={activeMatch.game2ScoreA ?? ''}
                              onChange={(e) =>
                                onUpdateMatchScore(activeMatch.id, {
                                  game2ScoreA:
                                    e.target.value === '' ? undefined : parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-11 text-center py-1 rounded-lg bg-slate-900 border border-slate-700 text-blue-400 font-bold text-xs focus:border-blue-500"
                            />
                            <span className="text-slate-500 text-xs font-bold">-</span>
                            <input
                              type="number"
                              min="0"
                              max="30"
                              placeholder="B"
                              value={activeMatch.game2ScoreB ?? ''}
                              onChange={(e) =>
                                onUpdateMatchScore(activeMatch.id, {
                                  game2ScoreB:
                                    e.target.value === '' ? undefined : parseInt(e.target.value) || 0,
                                })
                              }
                              className="w-11 text-center py-1 rounded-lg bg-slate-900 border border-slate-700 text-rose-400 font-bold text-xs focus:border-rose-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Finish Game Button (Organizer Only) */}
                    <button
                      type="button"
                      onClick={() =>
                        onFinishMatch(activeMatch.id, activeMatch.shuttlecocksCount, {
                          game1ScoreA: activeMatch.game1ScoreA,
                          game1ScoreB: activeMatch.game1ScoreB,
                          game2ScoreA: activeMatch.game2ScoreA,
                          game2ScoreB: activeMatch.game2ScoreB,
                        })
                      }
                      className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs sm:text-sm transition flex items-center justify-center gap-2 shadow"
                    >
                      <CheckCircle className="w-4 h-4" />
                      <span>จบเกมนี้ (บันทึกผล 2 เซ็ต & ปล่อยคอร์ท)</span>
                    </button>
                  </>
                ) : (
                  /* Member View (Read-Only) */
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs bg-slate-900 px-3 py-2 rounded-xl border border-slate-800">
                      <span className="text-slate-400">ลูกขนไก่ที่ใช้: <strong className="text-white">{activeMatch.shuttlecocksCount} ลูก</strong></span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[11px]">
                          เซ็ต 1: <strong className="text-blue-400">{activeMatch.game1ScoreA ?? '-'}</strong> - <strong className="text-rose-400">{activeMatch.game1ScoreB ?? '-'}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 text-[11px]">
                          เซ็ต 2: <strong className="text-blue-400">{activeMatch.game2ScoreA ?? '-'}</strong> - <strong className="text-rose-400">{activeMatch.game2ScoreB ?? '-'}</strong>
                        </span>
                      </div>
                    </div>

                    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-2.5 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                      <span className="text-amber-400">🔒</span>
                      <span>ผู้เล่นไม่สามารถกดจบคอร์ทได้ (เฉพาะผู้จัดก๊วนเป็นผู้บันทึกคะแนนและกดจบคอร์ท)</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Waiting List & Queue */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">คิวผู้เล่นที่พร้อมลงสนาม ({availablePlayers.length} คน)</h3>
          </div>
          <span className="text-xs text-amber-400 font-medium">⚡ เรียงจากคนรอเล่นนานที่สุดก่อน (Waiting Time First)</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {availablePlayers.map((player) => {
            const waitMs = getPlayerWaitTimeMs(player, now);
            return (
              <div
                key={player.id}
                className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex items-center gap-2.5 hover:border-slate-700 transition"
              >
                <div
                  className={`w-8 h-8 rounded-lg bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                >
                  {player.nickname.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white truncate">{player.nickname}</div>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    {showSkill && (
                      <span
                        className={`text-[9px] font-bold px-1 rounded ${SKILL_LEVELS[player.skillLevel].bgColor} ${SKILL_LEVELS[player.skillLevel].color}`}
                      >
                        มือ {player.skillLevel}
                      </span>
                    )}
                    <span className="text-[10px] text-slate-400">{player.gamesPlayed} เกม</span>
                    <span className="text-[9px] text-amber-400/90 font-medium">รอ {formatWaitMinutes(waitMs)}</span>
                  </div>
                </div>
              </div>
            );
          })}

          {availablePlayers.length === 0 && (
            <div className="col-span-full py-6 text-center text-xs text-slate-500">
              ไม่มีผู้เล่นรอคิว (ทุกคนกำลังแข่งขัน หรือพักเหนื่อย)
            </div>
          )}
        </div>
      </div>

      {/* Recent Match History */}
      {matchHistory.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>ประวัติแมตช์ที่แข่งจบแล้ว ({matchHistory.length} แมตช์)</span>
            </h3>
          </div>

          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1 scroll-smooth">
            {/* SHOW_ALL_MATCH_HISTORY_V16 */
              matchHistory.map((hist) => (
              <div
                key={hist.id}
                className="bg-slate-950 border border-slate-800/80 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 text-slate-400">
                  <span className="font-semibold text-white">{hist.courtName}</span>
                  <span>•</span>
                  <span>เริ่ม {hist.startTime}</span>
                  <span>•</span>
                  <span>ใช้เวลา {hist.durationMinutes} นาที</span>
                  <span>•</span>
                  <span>ลูกขนไก่ {hist.shuttlecocksCount} ลูก</span>
                </div>

                <div className="flex items-center gap-2 font-medium text-slate-200">
                  <span className="text-blue-400 font-semibold">{hist.teamANames.join(' + ')}</span>
                  {hist.game1ScoreA !== undefined && hist.game1ScoreB !== undefined ? (
                    <div className="flex items-center gap-1.5 font-mono text-xs">
                      <span className="px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
                        S1: {hist.game1ScoreA}-{hist.game1ScoreB}
                      </span>
                      {hist.game2ScoreA !== undefined && hist.game2ScoreB !== undefined && (
                        <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800">
                          S2: {hist.game2ScoreA}-{hist.game2ScoreB}
                        </span>
                      )}
                    </div>
                  ) : hist.scoreA !== undefined && hist.scoreB !== undefined ? (
                    <span className="px-2 py-0.5 rounded bg-slate-800 font-bold text-white">
                      {hist.scoreA} - {hist.scoreB}
                    </span>
                  ) : (
                    <span className="text-slate-500">vs</span>
                  )}
                  <span className="text-rose-400 font-semibold">{hist.teamBNames.join(' + ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Matchmaking Modal */}
      {matchModalCourt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-5 sm:p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <span>จัดคู่ลง {matchModalCourt.name}</span>
                </h3>
                <p className="text-xs text-slate-400">เลือกระบบจับคู่อัจฉริยะ หรือเลือกผู้เล่น 4 คนด้วยตัวเอง</p>
              </div>
              <button
                type="button"
                onClick={() => setMatchModalCourt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-2 sm:grid-cols-4 rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium gap-1">
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setMatchMode('balanced');
                }}
                className={`py-2 px-2 rounded-lg transition text-center ${
                  !manualMode && matchMode === 'balanced'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⚖️ รอนานสุด + สมดุลมือ
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setMatchMode('same_tier');
                }}
                className={`py-2 px-2 rounded-lg transition text-center ${
                  !manualMode && matchMode === 'same_tier'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🎯 มือระดับเดียวกัน
              </button>
              <button
                type="button"
                onClick={() => {
                  setManualMode(false);
                  setMatchMode('fair_queue');
                }}
                className={`py-2 px-2 rounded-lg transition text-center ${
                  !manualMode && matchMode === 'fair_queue'
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ⏳ คิวรอนานสุด
              </button>
              <button
                type="button"
                onClick={() => setManualMode(true)}
                className={`py-2 px-2 rounded-lg transition text-center ${
                  manualMode
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                ✋ จัดเอง (Manual)
              </button>
            </div>

            {/* Confirmed Pre-Match Quick Load Banners (1 & 2) */}
            {confirmedPreMatch && (
              <div className="bg-blue-950/40 border border-blue-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-blue-400 block flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ใช้คิว Pre-Match 1 ที่ยืนยันไว้</span>
                  </span>
                  <span className="text-xs text-slate-300">
                    ทีม A: {confirmedPreMatch.teamA.map((id) => players.find((p) => p.id === id)?.nickname).join(' + ')} vs ทีม B: {confirmedPreMatch.teamB.map((id) => players.find((p) => p.id === id)?.nickname).join(' + ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(true);
                    setSelectedTeamA([confirmedPreMatch.teamA[0], confirmedPreMatch.teamA[1]]);
                    setSelectedTeamB([confirmedPreMatch.teamB[0], confirmedPreMatch.teamB[1]]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shrink-0 shadow transition"
                >
                  ใช้คิว Pre-Match 1
                </button>
              </div>
            )}

            {confirmedPreMatch2 && (
              <div className="bg-purple-950/40 border border-purple-500/40 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-purple-400 block flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>ใช้คิว Pre-Match 2 ที่ยืนยันไว้</span>
                  </span>
                  <span className="text-xs text-slate-300">
                    ทีม A: {confirmedPreMatch2.teamA.map((id) => players.find((p) => p.id === id)?.nickname).join(' + ')} vs ทีม B: {confirmedPreMatch2.teamB.map((id) => players.find((p) => p.id === id)?.nickname).join(' + ')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setManualMode(true);
                    setSelectedTeamA([confirmedPreMatch2.teamA[0], confirmedPreMatch2.teamA[1]]);
                    setSelectedTeamB([confirmedPreMatch2.teamB[0], confirmedPreMatch2.teamB[1]]);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shrink-0 shadow transition"
                >
                  ใช้คิว Pre-Match 2
                </button>
              </div>
            )}

            {/* Match Preview */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="text-xs text-slate-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="font-semibold text-slate-300">พรีวิวการประกบคู่:</span>
                {suggestedMatch && !manualMode && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 text-[11px] font-semibold">
                      {suggestedMatch.pairingLabelThai}
                    </span>
                    {showSkill && (
                      <span className="text-slate-400 text-[11px]">
                        แต้มต่าง: <strong className="text-emerald-400">{suggestedMatch.skillDiff}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              {suggestedMatch && !manualMode && suggestedMatch.explanationThai && (
                <div className="text-[11px] text-slate-400 bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-800/70">
                  💡 {suggestedMatch.explanationThai}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {/* Team A Slot */}
                <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-blue-400 flex items-center justify-between">
                    <span>ทีม A (น้ำเงิน)</span>
                    <span className="text-[10px] text-slate-400">{selectedTeamA.length}/2 คน</span>
                  </div>
                  <div className="space-y-1.5 min-h-[70px]">
                    {selectedTeamA.map((id) => {
                      const p = players.find((pl) => pl.id === id);
                      if (!p) return null;
                      const waitMs = getPlayerWaitTimeMs(p, now);
                      return (
                        <div
                          key={id}
                          className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs text-white"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-bold">{p.nickname}</span>
                            <span className="text-[10px] text-amber-400 ml-1.5">รอ {formatWaitMinutes(waitMs)}</span>
                          </div>
                          {showSkill && <span className="text-[10px] text-slate-400 shrink-0">มือ {p.skillLevel}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Team B Slot */}
                <div className="bg-slate-900 border border-rose-500/30 rounded-xl p-3 space-y-2">
                  <div className="text-xs font-bold text-rose-400 flex items-center justify-between">
                    <span>ทีม B (แดง)</span>
                    <span className="text-[10px] text-slate-400">{selectedTeamB.length}/2 คน</span>
                  </div>
                  <div className="space-y-1.5 min-h-[70px]">
                    {selectedTeamB.map((id) => {
                      const p = players.find((pl) => pl.id === id);
                      if (!p) return null;
                      const waitMs = getPlayerWaitTimeMs(p, now);
                      return (
                        <div
                          key={id}
                          className="bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-800 flex items-center justify-between text-xs text-white"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-bold">{p.nickname}</span>
                            <span className="text-[10px] text-amber-400 ml-1.5">รอ {formatWaitMinutes(waitMs)}</span>
                          </div>
                          {showSkill && <span className="text-[10px] text-slate-400 shrink-0">มือ {p.skillLevel}</span>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Manual Selection Grid (if manual or fine-tuning) */}
            <div className="space-y-2">
              <div className="text-xs text-slate-400 font-medium">
                {manualMode ? 'คลิกเลือกผู้เล่น 4 คนเพื่อจัดลงคอร์ท:' : 'หรือคลิกสลับผู้เล่นได้ตามต้องการ:'}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                {availablePlayers.map((player) => {
                  const isInTeamA = selectedTeamA.includes(player.id);
                  const isInTeamB = selectedTeamB.includes(player.id);

                  return (
                    <button
                      type="button"
                      key={player.id}
                      onClick={() => handleToggleManualPlayer(player.id)}
                      className={`text-left p-2 rounded-xl border text-xs transition flex items-center justify-between gap-1.5 ${
                        isInTeamA
                          ? 'border-blue-500 bg-blue-950/40 text-blue-300'
                          : isInTeamB
                          ? 'border-rose-500 bg-rose-950/40 text-rose-300'
                          : 'border-slate-800 bg-slate-950 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <span className="font-bold truncate">{player.nickname}</span>
                      <span className="text-[10px] opacity-80 shrink-0">
                        {isInTeamA ? 'ทีม A' : isInTeamB ? 'ทีม B' : `มือ ${player.skillLevel}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMatchModalCourt(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmStartMatch}
                disabled={selectedTeamA.length !== 2 || selectedTeamB.length !== 2}
                className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 font-bold text-xs sm:text-sm transition flex items-center gap-2 shadow"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>ยืนยันเริ่มแข่งขัน (4 คน)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

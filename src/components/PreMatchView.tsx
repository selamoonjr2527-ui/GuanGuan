import React, { useState, useEffect, useMemo } from 'react';
import { 
  Play, Clock, Users, Timer, Sparkles, CheckCircle2, 
  Coffee, AlertCircle, Search, Tv, Flame, ChevronRight,
  ShieldCheck, RefreshCw, Volume2, ArrowRight, Check, X,
  ArrowLeftRight, Edit2, Lock, ShieldAlert, Zap
} from 'lucide-react';
import { Player, ActiveMatch, SessionConfig, ConfirmedPreMatch, SKILL_LEVELS } from '../types';
import { 
  findBalancedMatch, getPlayerWaitTimeMs, formatWaitMinutes, 
  comparePlayerPriority, getPlayerEffectiveGames 
} from '../utils/matchmaker';

interface PreMatchViewProps {
  sessionConfig: SessionConfig;
  players: Player[];
  activeMatches: ActiveMatch[];
  isOrganizerMode?: boolean;
  currentMemberId?: string | null;
  confirmedPreMatch?: ConfirmedPreMatch | null;
  confirmedPreMatch2?: ConfirmedPreMatch | null;
  onConfirmPreMatch?: (preMatch: ConfirmedPreMatch, slot: 1 | 2) => void;
  onCancelPreMatch?: (slot: 1 | 2) => void;
  onStartConfirmedPreMatch?: (courtId: string, preMatch: ConfirmedPreMatch, slot: 1 | 2) => void;
  onSelectPlayerStatus?: (playerId: string, status: 'waiting' | 'resting') => void;
  onNavigateToCourts?: () => void;
  onUnlockOrganizer?: () => void;
  onToggleWalkInPenalty?: (playerId: string) => void;
  onToggleRegistrationType?: (playerId: string) => void;
  onPromptIdentifyMember?: () => void;
}

export const PreMatchView: React.FC<PreMatchViewProps> = ({
  sessionConfig,
  players,
  activeMatches,
  isOrganizerMode = false,
  currentMemberId,
  confirmedPreMatch,
  confirmedPreMatch2,
  onConfirmPreMatch,
  onCancelPreMatch,
  onStartConfirmedPreMatch,
  onSelectPlayerStatus,
  onNavigateToCourts,
  onUnlockOrganizer,
  onToggleWalkInPenalty,
  onToggleRegistrationType,
  onPromptIdentifyMember,
}) => {
  // Live ticking timer for realtime minute/second counters
  const [currentTime, setCurrentTime] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('');
  const [tvMode, setTvMode] = useState<boolean>(false);
  const [filterSearch, setFilterSearch] = useState<string>('');

  // Active staging slot for organizer (Pre-Match 1 or Pre-Match 2)
  const [stagingSlot, setStagingSlot] = useState<1 | 2>(1);
  const [isEditingSlot, setIsEditingSlot] = useState<1 | 2 | null>(null);

  // Manual custom draft overrides for Slot 1 and Slot 2 (if organizer customizes players)
  const [customDraft1, setCustomDraft1] = useState<{ teamA: [string, string]; teamB: [string, string]; notes?: string } | null>(null);
  const [customDraft2, setCustomDraft2] = useState<{ teamA: [string, string]; teamB: [string, string]; notes?: string } | null>(null);
  const [stagingNotes, setStagingNotes] = useState<string>('');

  const avgDuration = sessionConfig.avgMatchDurationMinutes || 18;

  // Active playing player IDs (on active courts or marked playing)
  const playingPlayerIds = useMemo(() => {
    const fromActive = activeMatches.flatMap((m) => [...m.teamA, ...m.teamB]);
    const markedPlaying = players.filter((p) => p.status === 'playing').map((p) => p.id);
    return new Set([...fromActive, ...markedPlaying]);
  }, [activeMatches, players]);

  // Sanitized confirmed pre-matches:
  // 1. MUST NOT contain anyone currently playing on court
  // 2. Pre-Match 2 MUST NOT contain anyone in Pre-Match 1
  const safeConfirmedPreMatch1 = useMemo(() => {
    if (!confirmedPreMatch) return null;
    const all = [...confirmedPreMatch.teamA, ...confirmedPreMatch.teamB];
    if (all.some((id) => playingPlayerIds.has(id))) return null;
    if (new Set(all).size !== 4) return null;
    return confirmedPreMatch;
  }, [confirmedPreMatch, playingPlayerIds]);

  const confirmedPre1PlayerIds = useMemo(() => {
    if (!safeConfirmedPreMatch1) return new Set<string>();
    return new Set([...safeConfirmedPreMatch1.teamA, ...safeConfirmedPreMatch1.teamB]);
  }, [safeConfirmedPreMatch1]);

  const safeConfirmedPreMatch2 = useMemo(() => {
    if (!confirmedPreMatch2) return null;
    const all = [...confirmedPreMatch2.teamA, ...confirmedPreMatch2.teamB];
    if (all.some((id) => playingPlayerIds.has(id))) return null;
    if (all.some((id) => confirmedPre1PlayerIds.has(id))) return null;
    if (new Set(all).size !== 4) return null;
    return confirmedPreMatch2;
  }, [confirmedPreMatch2, playingPlayerIds, confirmedPre1PlayerIds]);

  const confirmedPre2PlayerIds = useMemo(() => {
    if (!safeConfirmedPreMatch2) return new Set<string>();
    return new Set([...safeConfirmedPreMatch2.teamA, ...safeConfirmedPreMatch2.teamB]);
  }, [safeConfirmedPreMatch2]);

  // Priority sorted queue for players ready to play ('waiting')
  // STRICTLY EXCLUDES players currently on court or with status 'resting'/'left'
  const waitingQueue = useMemo(() => {
    const ready = players.filter(
      (p) => p.isCheckedIn && !playingPlayerIds.has(p.id) && p.status === 'waiting'
    );
    return [...ready].sort((a, b) => comparePlayerPriority(a, b, currentTime));
  }, [players, playingPlayerIds, currentTime]);

  // Resting players
  const restingPlayers = useMemo(() => {
    return players.filter(
      (p) => p.isCheckedIn && !playingPlayerIds.has(p.id) && p.status === 'resting'
    );
  }, [players, playingPlayerIds]);

  // Helper to get player by id
  const getPlayer = (id: string): Player | undefined => {
    return players.find((p) => p.id === id);
  };

  // --- SLOT 1 COMPUTATION ---
  // Candidate pool for Slot 1: excludes playing players and confirmed Slot 2 players
  const poolForSlot1 = useMemo(() => {
    return waitingQueue.filter((p) => !confirmedPre2PlayerIds.has(p.id));
  }, [waitingQueue, confirmedPre2PlayerIds]);

  // Slot 1 Lineup (Confirmed > Custom Draft > Auto Queue Suggestion)
  const slot1Lineup = useMemo(() => {
    if (safeConfirmedPreMatch1) {
      return {
        teamA: safeConfirmedPreMatch1.teamA,
        teamB: safeConfirmedPreMatch1.teamB,
        notes: safeConfirmedPreMatch1.notes || '',
        isConfirmed: true,
        pairingLabelThai: safeConfirmedPreMatch1.pairingLabelThai,
        explanationThai: safeConfirmedPreMatch1.explanationThai,
      };
    }

    if (customDraft1) {
      const allFour = [...customDraft1.teamA, ...customDraft1.teamB];
      const validPoolIds = new Set(poolForSlot1.map((p) => p.id));
      const isUnique = new Set(allFour).size === 4;
      const allInPool = allFour.every((id) => id && validPoolIds.has(id));
      if (isUnique && allInPool) {
        return {
          teamA: customDraft1.teamA,
          teamB: customDraft1.teamB,
          notes: customDraft1.notes || '',
          isConfirmed: false,
          pairingLabelThai: 'ผู้จัดปรับแต่งคู่เอง',
          explanationThai: 'คิวแนะนำตามการปรับแต่งของผู้จัดสำหรับ คอร์ท 1',
        };
      }
    }

    if (poolForSlot1.length >= 4) {
      const topCandidates = poolForSlot1.slice(0, Math.min(8, poolForSlot1.length));
      const suggestion = findBalancedMatch(topCandidates, 'balanced');
      if (suggestion) {
        return {
          teamA: [suggestion.teamA[0].id, suggestion.teamA[1].id] as [string, string],
          teamB: [suggestion.teamB[0].id, suggestion.teamB[1].id] as [string, string],
          notes: '',
          isConfirmed: false,
          pairingLabelThai: suggestion.pairingLabelThai,
          explanationThai: suggestion.explanationThai,
        };
      }
      return {
        teamA: [poolForSlot1[0].id, poolForSlot1[1].id] as [string, string],
        teamB: [poolForSlot1[2].id, poolForSlot1[3].id] as [string, string],
        notes: '',
        isConfirmed: false,
        pairingLabelThai: 'จัดตามลำดับเวลารอคอย (Fair Queue)',
        explanationThai: '4 ผู้เล่นที่รอคอยนานที่สุดสำหรับ คอร์ท 1',
      };
    }

    return null;
  }, [safeConfirmedPreMatch1, customDraft1, poolForSlot1]);

  // Player IDs currently reserved or proposed for Slot 1
  const slot1PlayerIds = useMemo(() => {
    if (!slot1Lineup) return new Set<string>();
    return new Set([...slot1Lineup.teamA, ...slot1Lineup.teamB]);
  }, [slot1Lineup]);

  // --- SLOT 2 COMPUTATION ---
  // Candidate pool for Slot 2:
  // MUST NOT CONTAIN ANYONE in Slot 1 (neither confirmed nor proposed)!
  // MUST NOT CONTAIN ANYONE on court!
  // This automatically selects the NEXT waiting players in sequence!
  const poolForSlot2 = useMemo(() => {
    return waitingQueue.filter((p) => !slot1PlayerIds.has(p.id));
  }, [waitingQueue, slot1PlayerIds]);

  // Slot 2 Lineup (Confirmed > Custom Draft > Auto Queue Suggestion from next in queue)
  const slot2Lineup = useMemo(() => {
    if (safeConfirmedPreMatch2) {
      return {
        teamA: safeConfirmedPreMatch2.teamA,
        teamB: safeConfirmedPreMatch2.teamB,
        notes: safeConfirmedPreMatch2.notes || '',
        isConfirmed: true,
        pairingLabelThai: safeConfirmedPreMatch2.pairingLabelThai,
        explanationThai: safeConfirmedPreMatch2.explanationThai,
      };
    }

    if (customDraft2) {
      const allFour = [...customDraft2.teamA, ...customDraft2.teamB];
      const validPoolIds = new Set(poolForSlot2.map((p) => p.id));
      const isUnique = new Set(allFour).size === 4;
      const allInPool = allFour.every((id) => id && validPoolIds.has(id));
      if (isUnique && allInPool) {
        return {
          teamA: customDraft2.teamA,
          teamB: customDraft2.teamB,
          notes: customDraft2.notes || '',
          isConfirmed: false,
          pairingLabelThai: 'ผู้จัดปรับแต่งคู่เอง',
          explanationThai: 'คิวแนะนำตามการปรับแต่งของผู้จัดสำหรับ คอร์ท 2',
        };
      }
    }

    if (poolForSlot2.length >= 4) {
      const topCandidates = poolForSlot2.slice(0, Math.min(8, poolForSlot2.length));
      const suggestion = findBalancedMatch(topCandidates, 'balanced');
      if (suggestion) {
        return {
          teamA: [suggestion.teamA[0].id, suggestion.teamA[1].id] as [string, string],
          teamB: [suggestion.teamB[0].id, suggestion.teamB[1].id] as [string, string],
          notes: '',
          isConfirmed: false,
          pairingLabelThai: suggestion.pairingLabelThai,
          explanationThai: suggestion.explanationThai,
        };
      }
      return {
        teamA: [poolForSlot2[0].id, poolForSlot2[1].id] as [string, string],
        teamB: [poolForSlot2[2].id, poolForSlot2[3].id] as [string, string],
        notes: '',
        isConfirmed: false,
        pairingLabelThai: 'จัดตามลำดับเวลารอคอย (ลำดับถัดไป)',
        explanationThai: '4 ผู้เล่นลำดับถัดไปในคิวสำหรับ คอร์ท 2',
      };
    }

    return null;
  }, [safeConfirmedPreMatch2, customDraft2, poolForSlot2]);

  const slot2PlayerIds = useMemo(() => {
    if (!slot2Lineup) return new Set<string>();
    return new Set([...slot2Lineup.teamA, ...slot2Lineup.teamB]);
  }, [slot2Lineup]);

  // Current active lineup being edited in staging
  const currentStagingLineup = stagingSlot === 1 ? slot1Lineup : slot2Lineup;

  // Staged player objects for staging view
  const stagedA1 = currentStagingLineup ? getPlayer(currentStagingLineup.teamA[0]) : undefined;
  const stagedA2 = currentStagingLineup ? getPlayer(currentStagingLineup.teamA[1]) : undefined;
  const stagedB1 = currentStagingLineup ? getPlayer(currentStagingLineup.teamB[0]) : undefined;
  const stagedB2 = currentStagingLineup ? getPlayer(currentStagingLineup.teamB[1]) : undefined;

  // Active match data with estimated remaining times
  const activeCourtsData = useMemo(() => {
    return sessionConfig.courtNames.map((name, index) => {
      const courtId = `court-${index + 1}`;
      const match = activeMatches.find((m) => m.courtId === courtId || m.courtName === name);
      if (!match) {
        return {
          courtId,
          courtName: name,
          isAvailable: true,
          match: null,
          elapsedMinutes: 0,
          elapsedSeconds: 0,
          remainingMinutes: 0,
          progressPercent: 0,
          phase: 'available' as const,
        };
      }

      const elapsedSec = Math.max(0, Math.floor((currentTime - match.startTime) / 1000));
      const elapsedMin = Math.floor(elapsedSec / 60);
      const remainingMin = Math.max(1, avgDuration - elapsedMin);
      const progress = Math.min(100, Math.round((elapsedMin / avgDuration) * 100));

      let phase: 'warmup' | 'playing' | 'ending' = 'playing';
      if (elapsedMin < 3) phase = 'warmup';
      else if (elapsedMin >= avgDuration - 2) phase = 'ending';

      return {
        courtId,
        courtName: name,
        isAvailable: false,
        match,
        elapsedMinutes: elapsedMin,
        elapsedSeconds: elapsedSec % 60,
        remainingMinutes: remainingMin,
        progressPercent: progress,
        phase,
      };
    });
  }, [sessionConfig.courtNames, activeMatches, currentTime, avgDuration]);

  // Find shortest remaining match
  const shortestCourt = useMemo(() => {
    const active = activeCourtsData.filter((c) => !c.isAvailable);
    if (active.length === 0) return null;
    return [...active].sort((a, b) => a.remainingMinutes - b.remainingMinutes)[0];
  }, [activeCourtsData]);

  // Available vacant courts ready for immediate match start
  const availableCourts = useMemo(() => {
    return activeCourtsData.filter((c) => c.isAvailable);
  }, [activeCourtsData]);

  // Handle swapping a player in a specific position of the active staging slot
  const handleSwapSlotPlayer = (
    team: 'A' | 'B',
    slotIndex: 0 | 1,
    newPlayerId: string
  ) => {
    if (!currentStagingLineup || !newPlayerId) return;

    const currentTeamA: [string, string] = [currentStagingLineup.teamA[0], currentStagingLineup.teamA[1]];
    const currentTeamB: [string, string] = [currentStagingLineup.teamB[0], currentStagingLineup.teamB[1]];

    if (team === 'A') {
      currentTeamA[slotIndex] = newPlayerId;
    } else {
      currentTeamB[slotIndex] = newPlayerId;
    }

    if (stagingSlot === 1) {
      setCustomDraft1({
        teamA: currentTeamA,
        teamB: currentTeamB,
        notes: stagingNotes,
      });
    } else {
      setCustomDraft2({
        teamA: currentTeamA,
        teamB: currentTeamB,
        notes: stagingNotes,
      });
    }
  };

  // Switch pairing: A2 <-> B1
  const handleSwitchPartners = () => {
    if (!currentStagingLineup) return;
    const newTeamA: [string, string] = [currentStagingLineup.teamA[0], currentStagingLineup.teamB[0]];
    const newTeamB: [string, string] = [currentStagingLineup.teamA[1], currentStagingLineup.teamB[1]];

    if (stagingSlot === 1) {
      setCustomDraft1({ teamA: newTeamA, teamB: newTeamB, notes: stagingNotes });
    } else {
      setCustomDraft2({ teamA: newTeamA, teamB: newTeamB, notes: stagingNotes });
    }
  };

  // Auto-balance among the 4 currently selected players
  const handleAutoBalanceStaged = () => {
    if (!currentStagingLineup) return;
    const playersFour = [stagedA1, stagedA2, stagedB1, stagedB2].filter(Boolean) as Player[];
    if (playersFour.length === 4) {
      const suggestion = findBalancedMatch(playersFour, 'balanced');
      if (suggestion) {
        const newTeamA: [string, string] = [suggestion.teamA[0].id, suggestion.teamA[1].id];
        const newTeamB: [string, string] = [suggestion.teamB[0].id, suggestion.teamB[1].id];
        if (stagingSlot === 1) {
          setCustomDraft1({ teamA: newTeamA, teamB: newTeamB, notes: stagingNotes });
        } else {
          setCustomDraft2({ teamA: newTeamA, teamB: newTeamB, notes: stagingNotes });
        }
      }
    }
  };

  // Reset staging slot to natural queue order
  const handleResetToAutoQueue = () => {
    if (stagingSlot === 1) {
      setCustomDraft1(null);
    } else {
      setCustomDraft2(null);
    }
  };

  // Get available players for a specific staging position (deduplicating other slot & current slot)
  const getAvailableCandidates = (team: 'A' | 'B', slotIndex: 0 | 1) => {
    if (!currentStagingLineup) return [];

    const currentSelectedId = team === 'A' ? currentStagingLineup.teamA[slotIndex] : currentStagingLineup.teamB[slotIndex];
    const currentFour = [
      currentStagingLineup.teamA[0],
      currentStagingLineup.teamA[1],
      currentStagingLineup.teamB[0],
      currentStagingLineup.teamB[1],
    ];
    const otherThreeInCurrent = new Set(currentFour.filter((id) => id !== currentSelectedId));

    // Players in the OTHER slot
    const otherSlotPlayerIds = stagingSlot === 1 ? slot2PlayerIds : slot1PlayerIds;

    return waitingQueue.filter((p) => {
      if (p.id === currentSelectedId) return true;
      if (otherThreeInCurrent.has(p.id)) return false;
      if (otherSlotPlayerIds.has(p.id)) return false;
      return true;
    });
  };

  // Quick confirm a pre-match directly from Card 1 or Card 2
  const handleQuickConfirm = (slot: 1 | 2) => {
    const targetLineup = slot === 1 ? slot1Lineup : slot2Lineup;
    if (!targetLineup) return;

    const courtName = sessionConfig.courtNames[slot - 1] || `คอร์ท ${slot}`;
    const a1 = getPlayer(targetLineup.teamA[0]);
    const a2 = getPlayer(targetLineup.teamA[1]);
    const b1 = getPlayer(targetLineup.teamB[0]);
    const b2 = getPlayer(targetLineup.teamB[1]);

    const avgA = a1 && a2 ? ((a1.skillScore || 3) + (a2.skillScore || 3)) / 2 : 3;
    const avgB = b1 && b2 ? ((b1.skillScore || 3) + (b2.skillScore || 3)) / 2 : 3;
    const diff = Math.abs(avgA - avgB);

    let pairingLabel = targetLineup.pairingLabelThai || 'จัดตามความเหมาะสมของผู้จัด';
    if (!targetLineup.pairingLabelThai) {
      if (diff <= 0.3) {
        pairingLabel = 'ระดับมือสมดุลใกล้เคียงกันมาก (สูสี)';
      } else {
        pairingLabel = 'ประกบคู่เก่งร่วมคนเริ่มต้นเพื่อความสมดุล';
      }
    }

    const preMatch: ConfirmedPreMatch = {
      id: `pre-${slot}-${Date.now()}`,
      slotNumber: slot,
      targetCourtName: courtName,
      teamA: targetLineup.teamA,
      teamB: targetLineup.teamB,
      pairingLabelThai: pairingLabel,
      explanationThai: targetLineup.explanationThai || `ผู้จัดก๊วนยืนยันคิวสำหรับ ${courtName} เรียบร้อยแล้ว`,
      confirmedAt: Date.now(),
      notes: targetLineup.notes || stagingNotes,
    };

    onConfirmPreMatch?.(preMatch, slot);

    const confirmedIds = new Set([...targetLineup.teamA, ...targetLineup.teamB]);

    // If slot 1 was confirmed and slot 2 not yet confirmed, auto-switch staging to slot 2
    if (slot === 1) {
      setCustomDraft1(null);
      // If customDraft2 had any overlapping player with newly confirmed slot 1, reset it
      setCustomDraft2((prev) => {
        if (!prev) return null;
        const hasOverlap = [...prev.teamA, ...prev.teamB].some((id) => confirmedIds.has(id));
        return hasOverlap ? null : prev;
      });
      if (!safeConfirmedPreMatch2) {
        setStagingSlot(2);
      }
    } else {
      setCustomDraft2(null);
      // If customDraft1 had any overlapping player with newly confirmed slot 2, reset it
      setCustomDraft1((prev) => {
        if (!prev) return null;
        const hasOverlap = [...prev.teamA, ...prev.teamB].some((id) => confirmedIds.has(id));
        return hasOverlap ? null : prev;
      });
      if (!safeConfirmedPreMatch1) {
        setStagingSlot(1);
      }
    }
  };

  // Organizer confirms pre-match from staging area
  const handleConfirmDraft = () => {
    handleQuickConfirm(stagingSlot);
    setIsEditingSlot(null);
    setStagingNotes('');
  };

  // Filtered queue for table
  const filteredQueue = useMemo(() => {
    return waitingQueue.filter((p) => {
      if (!filterSearch) return true;
      const q = filterSearch.toLowerCase();
      return p.nickname.toLowerCase().includes(q) || (p.fullName && p.fullName.toLowerCase().includes(q));
    });
  }, [waitingQueue, filterSearch]);

  return (
    <div className="space-y-6">
      {/* Top Banner with TV Mode Toggle & Court Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
              <span>สถานะคอร์ทสด & คิวรอบถัดไป (Live Courts & Next Up)</span>
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            สมาชิกสามารถดูเวลาแข่งขันของคอร์ท 1-2 และตรวจสอบคิวรอเล่นได้แบบเรียลไทม์
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onUnlockOrganizer && !isOrganizerMode && (
            <button
              type="button"
              onClick={onUnlockOrganizer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>ผู้จัดก๊วน (ใส่ PIN)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setTvMode(!tvMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
              tvMode
                ? 'bg-amber-500 text-slate-950 border-amber-400 font-bold'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
            }`}
          >
            <Tv className="w-3.5 h-3.5" />
            <span>{tvMode ? 'โหมดทีวี (เปิดอยู่)' : 'โหมดจอทีวีก๊วน'}</span>
          </button>
        </div>
      </div>

      {/* Notice Banner for Member Mode actions */}
      {actionNotice && (
        <div className="bg-amber-950/80 border border-amber-500/50 rounded-xl p-3.5 text-xs text-amber-200 flex items-center justify-between gap-2 shadow-md">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice(null)}
            className="text-amber-400 hover:text-white text-xs px-2 py-0.5 rounded bg-amber-900/60 transition"
          >
            ปิด
          </button>
        </div>
      )}

      {/* SECTION 1: ACTIVE COURTS (Courts 1 & 2 - Visible to all members & organizers) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {activeCourtsData.map((court, idx) => {
          const isCourtAvailable = court.isAvailable;
          const match = court.match;

          const teamAPlayers = match ? match.teamA.map(getPlayer).filter(Boolean) as Player[] : [];
          const teamBPlayers = match ? match.teamB.map(getPlayer).filter(Boolean) as Player[] : [];

          return (
            <div
              key={court.courtId}
              className={`rounded-2xl border p-4 sm:p-5 transition shadow-sm ${
                isCourtAvailable
                  ? 'bg-slate-900 border-emerald-500/40'
                  : 'bg-slate-900 border-slate-800'
              }`}
            >
              {/* Court Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 mb-3">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-3 h-3 rounded-full ${
                      isCourtAvailable ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                    }`}
                  />
                  <h3 className="font-extrabold text-white text-base">
                    {court.courtName}
                  </h3>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${
                      isCourtAvailable
                        ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                        : 'bg-amber-950 text-amber-300 border-amber-800'
                    }`}
                  >
                    {isCourtAvailable ? 'สนามว่าง พร้อมลงเล่น' : 'กำลังแข่งขัน'}
                  </span>
                </div>

                {!isCourtAvailable && (
                  <div className="text-right">
                    <span className="text-xs text-slate-400 block text-[10px]">แข่งขันไปแล้ว:</span>
                    <span className="text-xs font-mono font-bold text-amber-400">
                      {court.elapsedMinutes} นาที {court.elapsedSeconds} วิ
                    </span>
                  </div>
                )}
              </div>

              {/* Court Content */}
              {isCourtAvailable ? (
                <div className="text-center py-6 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">สนามว่างอยู่</h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      สามารถส่งคิว Pre-Match หรือผู้เล่นในคิวลงสนามได้ทันที
                    </p>
                  </div>

                  {isOrganizerMode && (
                    <button
                      type="button"
                      onClick={onNavigateToCourts}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-sm"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>เปิดสนาม / จัดคนลงเล่น</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Progress bar */}
                  <div>
                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                      <span>ความคืบหน้าเกม (~{avgDuration} นาที)</span>
                      <span className="text-emerald-400 font-semibold">
                        เหลืออีกประมาณ {court.remainingMinutes} นาที
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-all duration-1000"
                        style={{ width: `${court.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Players in match */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {/* Team A */}
                    <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800">
                      <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block mb-1">
                        ทีม A
                      </span>
                      <div className="space-y-1">
                        {teamAPlayers.map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5">
                            <div
                              className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.avatarColor} text-[10px] text-white font-bold flex items-center justify-center shrink-0`}
                            >
                              {p.nickname.slice(0, 1)}
                            </div>
                            <span className="text-xs font-bold text-white truncate">{p.nickname}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Team B */}
                    <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800">
                      <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block mb-1">
                        ทีม B
                      </span>
                      <div className="space-y-1">
                        {teamBPlayers.map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5">
                            <div
                              className={`w-5 h-5 rounded-md bg-gradient-to-br ${p.avatarColor} text-[10px] text-white font-bold flex items-center justify-center shrink-0`}
                            >
                              {p.nickname.slice(0, 1)}
                            </div>
                            <span className="text-xs font-bold text-white truncate">{p.nickname}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* SECTION 2: DUAL PRE-MATCH NEXT UP QUEUES (For 2 Courts)
          Requirement:
          - Members only see confirmed Pre-Match.
          - If not confirmed by organizer, show pending waiting box (no tentative names shown).
          - Supports 2 Pre-Matches simultaneously (Slot 1 for Court 1, Slot 2 for Court 2) to prepare ~8 players ahead.
          - Organizer has the staging panel to customize and confirm each slot.
      */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <h3 className="text-base sm:text-lg font-extrabold text-white">
              🏸 คิวเตรียมพร้อมล่วงหน้า 2 สนาม (Pre-Match 1 & 2)
            </h3>
            <span className="text-xs text-slate-400 hidden sm:inline">
              • รองรับ 2 คอร์ทพร้อมกัน สมาชิกรอเตรียมตัว ~8 คน
            </span>
          </div>

          <div className="flex items-center gap-2">
            {isOrganizerMode ? (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                🛠️ โหมดผู้จัด: สลับจัดคิว 1 หรือ 2 ได้ด้านล่าง
              </span>
            ) : (
              <span className="text-[11px] px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-medium flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>👀 สมาชิกทั่วไป (แสดงเฉพาะคิวที่ผู้จัดยืนยันแล้ว)</span>
              </span>
            )}
          </div>
        </div>

        {/* Dual Pre-Match Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* SLOT 1 CARD */}
          {!isOrganizerMode && (!slot1Lineup || !slot1Lineup.isConfirmed) ? (
            /* Member View when Pre-Match #1 is not confirmed yet */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm shrink-0">
                    1️⃣
                  </span>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>Pre-Match #1</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                        สำหรับ {sessionConfig.courtNames[0] || 'คอร์ท 1'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      คิวรอลงเล่นรอบถัดไปสำหรับ {sessionConfig.courtNames[0] || 'คอร์ท 1'}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-bold shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>รอผู้จัดยืนยันคิว</span>
                </span>
              </div>

              <div className="py-7 px-4 text-center space-y-3 bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-sm font-bold text-slate-200">
                    ผู้จัดกำลังจัดสรรคู่เล่นสำหรับคอร์ทนี้
                  </h5>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    ระบบจะเปิดเผยรายชื่อทันทีเมื่อผู้จัดกดยืนยัน (Confirmed) เรียบร้อยแล้ว เพื่อป้องกันความสับสนหากมีการสลับเปลี่ยนตัวผู้เล่น
                  </p>
                </div>
                <div className="pt-1">
                  <span className="text-[11px] text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 inline-block">
                    💡 สมาชิกสามารถตรวจสอบลำดับคิวและเวลารอเล่นได้ในตารางด้านล่าง
                  </span>
                </div>
              </div>

              {onUnlockOrganizer && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>คุณคือผู้จัดก๊วนหรือไม่?</span>
                  <button
                    type="button"
                    onClick={onUnlockOrganizer}
                    className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs"
                  >
                    ปลดล็อก PIN ผู้จัด
                  </button>
                </div>
              )}
            </div>
          ) : slot1Lineup ? (
            <div
              className={`rounded-2xl p-4 sm:p-5 shadow-lg space-y-3 relative overflow-hidden transition ${
                slot1Lineup.isConfirmed
                  ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/30 border-2 border-emerald-500/60'
                  : 'bg-slate-900 border-2 border-emerald-500/30'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      slot1Lineup.isConfirmed
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : 'bg-emerald-500/10 text-emerald-300'
                    }`}
                  >
                    1️⃣
                  </span>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>Pre-Match #1</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
                        สำหรับ {sessionConfig.courtNames[0] || 'คอร์ท 1'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-emerald-300/90 line-clamp-1">
                      {slot1Lineup.explanationThai || 'คิวรอลงเล่นรอบถัดไปสำหรับ คอร์ท 1'}
                    </p>
                  </div>
                </div>

                {slot1Lineup.isConfirmed ? (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500 text-slate-950 font-black uppercase shrink-0 shadow">
                    CONFIRMED
                  </span>
                ) : (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold shrink-0">
                    ⏳ คิวแนะนำถัดไป (แบบร่าง)
                  </span>
                )}
              </div>

              {/* Private notice for organizer when in draft mode */}
              {isOrganizerMode && !slot1Lineup.isConfirmed && (
                <div className="text-[11px] text-amber-300 flex items-center justify-between bg-amber-950/40 p-2 rounded-lg border border-amber-800/50">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>🔒 เฉพาะผู้จัดเห็น (สมาชิกยังไม่เห็นจนกว่าจะกดยืนยัน)</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700 font-semibold">
                    แบบร่าง Draft
                  </span>
                </div>
              )}

              {/* Lineup Team A vs Team B */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Team A */}
                <div className="bg-slate-950 border border-blue-900/40 rounded-xl p-2.5 space-y-2">
                  <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider block">
                    ทีม A
                  </span>
                  <div className="space-y-1.5">
                    {slot1Lineup.teamA.map((id) => {
                      const p = getPlayer(id);
                      if (!p) return null;
                      const isWalkIn = p.registrationType === 'walkin';
                      return (
                        <div key={p.id} className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}>
                            {p.nickname.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">{p.nickname}</span>
                              {isWalkIn && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                                  🚶 Walk-in
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel}
                              {isWalkIn && (p.walkInPenaltyMatches ?? 1) > 0 && (
                                <span className="text-amber-400 ml-1">(+{(p.walkInPenaltyMatches ?? 1) * 2} โทษ)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Team B */}
                <div className="bg-slate-950 border border-rose-900/40 rounded-xl p-2.5 space-y-2">
                  <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider block">
                    ทีม B
                  </span>
                  <div className="space-y-1.5">
                    {slot1Lineup.teamB.map((id) => {
                      const p = getPlayer(id);
                      if (!p) return null;
                      const isWalkIn = p.registrationType === 'walkin';
                      return (
                        <div key={p.id} className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}>
                            {p.nickname.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">{p.nickname}</span>
                              {isWalkIn && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                                  🚶 Walk-in
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel}
                              {isWalkIn && (p.walkInPenaltyMatches ?? 1) > 0 && (
                                <span className="text-amber-400 ml-1">(+{(p.walkInPenaltyMatches ?? 1) * 2} โทษ)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Status/Banner Notification */}
              {slot1Lineup.isConfirmed ? (
                <div className="text-[11px] flex flex-col gap-1 bg-emerald-950/40 p-2 rounded-lg border border-emerald-800/40">
                  <div className="text-emerald-300 flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <span>🔔</span>
                      <span>ยืนยันคิวแล้ว • เตรียมวอร์มร่างกาย</span>
                    </span>
                    {activeCourtsData[0]?.isAvailable ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                        คอร์ท 1 ว่างอยู่
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        คอร์ท 1 แข่งอยู่ (~{activeCourtsData[0]?.remainingMinutes} น.)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-amber-300 flex items-center gap-1.5 bg-amber-950/30 p-2 rounded-lg border border-amber-800/40">
                  <span>💡</span>
                  <span className="line-clamp-1">{slot1Lineup.pairingLabelThai || 'คิวคำนวณจากผู้เล่นที่รอนานที่สุดและสมดุลมือ'}</span>
                </div>
              )}

              {/* Action Controls */}
              {isOrganizerMode ? (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  {slot1Lineup.isConfirmed && safeConfirmedPreMatch1 ? (
                    <>
                      {activeCourtsData[0]?.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => onStartConfirmedPreMatch?.(activeCourtsData[0].courtId, safeConfirmedPreMatch1, 1)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-sm"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>🚀 สั่งลง {activeCourtsData[0].courtName} (ว่าง)</span>
                        </button>
                      ) : availableCourts.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onStartConfirmedPreMatch?.(availableCourts[0].courtId, safeConfirmedPreMatch1, 1)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition shadow-sm"
                          title={`${activeCourtsData[0]?.courtName || 'คอร์ท 1'} กำลังแข่งอยู่ สั่งลง ${availableCourts[0].courtName} ที่ว่างแทนทันที`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>🚀 ส่งลง {availableCourts[0].courtName} (ว่าง)</span>
                        </button>
                      ) : (
                        <div
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/90 text-slate-400 font-semibold text-xs border border-slate-700 cursor-not-allowed"
                          title="ทุกคอร์ทกำลังแข่งขันอยู่ ต้องรอบันทึกจบเกมก่อนส่งลงสนาม"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">⏳ คอร์ทเต็ม (รอจบเกม)</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setStagingSlot(1);
                          setIsEditingSlot(1);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1"
                        title="ปรับแต่งรายชื่อ"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                        <span className="hidden sm:inline">แก้ไข</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onCancelPreMatch?.(1)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs"
                        title="ยกเลิกคิวนี้"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleQuickConfirm(1)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs transition shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>✅ ยืนยันคิว Pre-Match #1 ทันที</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStagingSlot(1);
                          setIsEditingSlot(1);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>ปรับแต่ง</span>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 text-center py-1">
                  คิวนี้ยืนยันแล้ว เตรียมพร้อมลงสนามเมื่อเกมก่อนหน้าจบ
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
                    1️⃣
                  </span>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      Pre-Match #1 ({sessionConfig.courtNames[0] || 'คอร์ท 1'})
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      รอผู้เล่นในคิวพร้อมเล่น (ต้องการ 4 คน)
                    </p>
                  </div>
                </div>

                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                  {poolForSlot1.length}/4 คน
                </span>
              </div>

              <div className="py-6 text-center text-xs text-slate-400 space-y-2 bg-slate-950/40 rounded-xl p-4 border border-dashed border-slate-800">
                <Clock className="w-5 h-5 mx-auto text-slate-500" />
                <p>
                  กำลังรอผู้เล่นจากคอร์ทที่กำลังแข่งขันเล่นเสร็จ เพื่อเติมคิวสำหรับ {sessionConfig.courtNames[0] || 'คอร์ท 1'}
                </p>
              </div>
            </div>
          )}

          {/* SLOT 2 CARD */}
          {!isOrganizerMode && (!slot2Lineup || !slot2Lineup.isConfirmed) ? (
            /* Member View when Pre-Match #2 is not confirmed yet */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4 flex flex-col justify-between relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-sm shrink-0">
                    2️⃣
                  </span>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>Pre-Match #2</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-bold">
                        สำหรับ {sessionConfig.courtNames[1] || 'คอร์ท 2'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      คิว 4 คนลำดับถัดไปสำหรับ {sessionConfig.courtNames[1] || 'คอร์ท 2'}
                    </p>
                  </div>
                </div>

                <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-bold shrink-0 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>รอผู้จัดยืนยันคิว</span>
                </span>
              </div>

              <div className="py-7 px-4 text-center space-y-3 bg-slate-950/60 rounded-xl border border-dashed border-slate-800">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mx-auto shadow-inner">
                  <Lock className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h5 className="text-sm font-bold text-slate-200">
                    ผู้จัดกำลังจัดสรรคู่เล่นสำหรับคอร์ทนี้
                  </h5>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    ระบบจะเปิดเผยรายชื่อทันทีเมื่อผู้จัดกดยืนยัน (Confirmed) เรียบร้อยแล้ว เพื่อป้องกันความสับสนหากมีการสลับเปลี่ยนตัวผู้เล่น
                  </p>
                </div>
                <div className="pt-1">
                  <span className="text-[11px] text-slate-400 bg-slate-900 px-3 py-1 rounded-full border border-slate-800 inline-block">
                    💡 สมาชิกสามารถตรวจสอบลำดับคิวและเวลารอเล่นได้ในตารางด้านล่าง
                  </span>
                </div>
              </div>

              {onUnlockOrganizer && (
                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                  <span>คุณคือผู้จัดก๊วนหรือไม่?</span>
                  <button
                    type="button"
                    onClick={onUnlockOrganizer}
                    className="text-amber-400 hover:text-amber-300 font-semibold underline text-xs"
                  >
                    ปลดล็อก PIN ผู้จัด
                  </button>
                </div>
              )}
            </div>
          ) : slot2Lineup ? (
            <div
              className={`rounded-2xl p-4 sm:p-5 shadow-lg space-y-3 relative overflow-hidden transition ${
                slot2Lineup.isConfirmed
                  ? 'bg-gradient-to-r from-indigo-950/40 via-slate-900 to-purple-950/30 border-2 border-indigo-500/60'
                  : 'bg-slate-900 border-2 border-indigo-500/30'
              }`}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 ${
                      slot2Lineup.isConfirmed
                        ? 'bg-indigo-500/20 text-indigo-400'
                        : 'bg-indigo-500/10 text-indigo-300'
                    }`}
                  >
                    2️⃣
                  </span>
                  <div>
                    <h4 className="text-sm sm:text-base font-extrabold text-white flex items-center gap-2">
                      <span>Pre-Match #2</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 text-indigo-300 border border-indigo-800 font-bold">
                        สำหรับ {sessionConfig.courtNames[1] || 'คอร์ท 2'}
                      </span>
                    </h4>
                    <p className="text-[11px] text-indigo-300/90 line-clamp-1">
                      {slot2Lineup.explanationThai || 'คิว 4 คนลำดับถัดไป (ไม่ซ้ำกับคอร์ท 1)'}
                    </p>
                  </div>
                </div>

                {slot2Lineup.isConfirmed ? (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500 text-slate-950 font-black uppercase shrink-0 shadow">
                    CONFIRMED
                  </span>
                ) : (
                  <span className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold shrink-0">
                    ⏳ คิวแนะนำลำดับถัดไป (แบบร่าง)
                  </span>
                )}
              </div>

              {/* Private notice for organizer when in draft mode */}
              {isOrganizerMode && !slot2Lineup.isConfirmed && (
                <div className="text-[11px] text-indigo-300 flex items-center justify-between bg-indigo-950/40 p-2 rounded-lg border border-indigo-800/50">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Lock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span>🔒 เฉพาะผู้จัดเห็น (สมาชิกยังไม่เห็นจนกว่าจะกดยืนยัน)</span>
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-200 border border-indigo-700 font-semibold">
                    แบบร่าง Draft
                  </span>
                </div>
              )}

              {/* Lineup Team A vs Team B */}
              <div className="grid grid-cols-2 gap-2.5">
                {/* Team A */}
                <div className="bg-slate-950 border border-blue-900/40 rounded-xl p-2.5 space-y-2">
                  <span className="text-[10px] font-extrabold text-blue-400 uppercase tracking-wider block">
                    ทีม A
                  </span>
                  <div className="space-y-1.5">
                    {slot2Lineup.teamA.map((id) => {
                      const p = getPlayer(id);
                      if (!p) return null;
                      const isWalkIn = p.registrationType === 'walkin';
                      return (
                        <div key={p.id} className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}>
                            {p.nickname.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">{p.nickname}</span>
                              {isWalkIn && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                                  🚶 Walk-in
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel}
                              {isWalkIn && (p.walkInPenaltyMatches ?? 1) > 0 && (
                                <span className="text-amber-400 ml-1">(+{(p.walkInPenaltyMatches ?? 1) * 2} โทษ)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Team B */}
                <div className="bg-slate-950 border border-rose-900/40 rounded-xl p-2.5 space-y-2">
                  <span className="text-[10px] font-extrabold text-rose-400 uppercase tracking-wider block">
                    ทีม B
                  </span>
                  <div className="space-y-1.5">
                    {slot2Lineup.teamB.map((id) => {
                      const p = getPlayer(id);
                      if (!p) return null;
                      const isWalkIn = p.registrationType === 'walkin';
                      return (
                        <div key={p.id} className="flex items-center gap-2 bg-slate-900/90 p-1.5 rounded-lg border border-slate-800">
                          <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}>
                            {p.nickname.slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">{p.nickname}</span>
                              {isWalkIn && (
                                <span className="text-[9px] px-1 py-0.2 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">
                                  🚶 Walk-in
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel}
                              {isWalkIn && (p.walkInPenaltyMatches ?? 1) > 0 && (
                                <span className="text-amber-400 ml-1">(+{(p.walkInPenaltyMatches ?? 1) * 2} โทษ)</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Status/Banner Notification */}
              {slot2Lineup.isConfirmed ? (
                <div className="text-[11px] flex flex-col gap-1 bg-indigo-950/40 p-2 rounded-lg border border-indigo-800/40">
                  <div className="text-indigo-300 flex items-center justify-between">
                    <span className="font-semibold flex items-center gap-1.5">
                      <span>🔔</span>
                      <span>ยืนยันคิวแล้ว • เตรียมวอร์มร่างกาย</span>
                    </span>
                    {activeCourtsData[1]?.isAvailable ? (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                        คอร์ท 2 ว่างอยู่
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium">
                        คอร์ท 2 แข่งอยู่ (~{activeCourtsData[1]?.remainingMinutes || 15} น.)
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-[11px] text-indigo-300 flex items-center gap-1.5 bg-indigo-950/30 p-2 rounded-lg border border-indigo-800/40">
                  <span>✨</span>
                  <span className="line-clamp-1">{slot2Lineup.pairingLabelThai || '4 คนลำดับถัดไปตามเวลารอคอย (ไม่ซ้ำกับคอร์ท 1)'}</span>
                </div>
              )}

              {/* Action Controls */}
              {isOrganizerMode ? (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                  {slot2Lineup.isConfirmed && safeConfirmedPreMatch2 ? (
                    <>
                      {activeCourtsData[1]?.isAvailable ? (
                        <button
                          type="button"
                          onClick={() => onStartConfirmedPreMatch?.(activeCourtsData[1].courtId, safeConfirmedPreMatch2, 2)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-xs transition shadow-sm"
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>🚀 สั่งลง {activeCourtsData[1].courtName} (ว่าง)</span>
                        </button>
                      ) : availableCourts.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => onStartConfirmedPreMatch?.(availableCourts[0].courtId, safeConfirmedPreMatch2, 2)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-bold text-xs transition shadow-sm"
                          title={`${activeCourtsData[1]?.courtName || 'คอร์ท 2'} กำลังแข่งอยู่ สั่งลง ${availableCourts[0].courtName} ที่ว่างแทนทันที`}
                        >
                          <Play className="w-3.5 h-3.5 fill-current" />
                          <span>🚀 ส่งลง {availableCourts[0].courtName} (ว่าง)</span>
                        </button>
                      ) : (
                        <div
                          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-slate-800/90 text-slate-400 font-semibold text-xs border border-slate-700 cursor-not-allowed"
                          title="ทุกคอร์ทกำลังแข่งขันอยู่ ต้องรอบันทึกจบเกมก่อนส่งลงสนาม"
                        >
                          <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span className="truncate">⏳ คอร์ทเต็ม (รอจบเกม)</span>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setStagingSlot(2);
                          setIsEditingSlot(2);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1"
                        title="ปรับแต่งรายชื่อ"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-blue-400" />
                        <span className="hidden sm:inline">แก้ไข</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onCancelPreMatch?.(2)}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-400 border border-slate-700 text-xs"
                        title="ยกเลิกคิวนี้"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleQuickConfirm(2)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-slate-950 font-extrabold text-xs transition shadow-sm"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>✅ ยืนยันคิว Pre-Match #2 ทันที</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setStagingSlot(2);
                          setIsEditingSlot(2);
                        }}
                        className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs font-semibold flex items-center gap-1"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                        <span>ปรับแต่ง</span>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 text-center py-1">
                  คิวนี้ยืนยันแล้ว เตรียมพร้อมลงสนามเมื่อเกมก่อนหน้าจบ
                </div>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-3 flex flex-col justify-between">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2.5 gap-2">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-sm shrink-0">
                    2️⃣
                  </span>
                  <div>
                    <h4 className="text-sm sm:text-base font-bold text-white">
                      Pre-Match #2 ({sessionConfig.courtNames[1] || 'คอร์ท 2'})
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      รายชื่อผู้เล่นลำดับถัดไปในคิว (ไม่ซ้ำกับคอร์ท 1)
                    </p>
                  </div>
                </div>

                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium">
                  {poolForSlot2.length}/4 คน
                </span>
              </div>

              {isOrganizerMode && poolForSlot2.length > 0 ? (
                <div className="space-y-2.5 bg-slate-950/60 rounded-xl p-3 border border-slate-800">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-indigo-400 font-bold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      <span>รายชื่อผู้เล่นลำดับถัดไปในคิว ({poolForSlot2.length} คน)</span>
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      รอเพิ่มอีก {4 - poolForSlot2.length} คนให้ครบ 4
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {poolForSlot2.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                        <div className={`w-7 h-7 rounded-md bg-gradient-to-br ${p.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}>
                          {p.nickname.slice(0, 1)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-white truncate">{p.nickname}</div>
                          <div className="text-[10px] text-slate-400">เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel}</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                          คิวถัดไป
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400 space-y-2 bg-slate-950/40 rounded-xl p-4 border border-dashed border-slate-800">
                  <Clock className="w-5 h-5 mx-auto text-slate-500" />
                  <p>
                    ยังไม่มีผู้เล่นในคิวถัดไป (รอผู้เล่นจากคอร์ทที่กำลังแข่งเล่นเสร็จเพื่อเติมคิว)
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ORGANIZER STAGING & PAIRING PANEL */}
        {isOrganizerMode && (
          <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-2xl p-4 sm:p-6 shadow-xl space-y-4 animate-fade-in mt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 font-bold text-xs border border-indigo-500/30">
                    โหมดผู้จัดก๊วน (Staging)
                  </span>
                  <h3 className="text-base font-bold text-white">
                    จัดคิว & คอนเฟิร์มรายชื่อ Pre-Match #{stagingSlot}
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  กำลังจัดคิวสำหรับ <span className="text-amber-400 font-bold">{sessionConfig.courtNames[stagingSlot - 1] || `คอร์ท ${stagingSlot}`}</span> • คัดกรองอัตโนมัติไม่ให้ซ้ำกับอีกคอร์ทและคนกำลังแข่งขัน
                </p>
              </div>

              {/* Slot Switcher Tabs & Quick Tools */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setStagingSlot(1);
                      setIsEditingSlot(1);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      stagingSlot === 1
                        ? 'bg-emerald-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1️⃣ คอร์ท 1 {confirmedPreMatch ? '✅' : ''}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStagingSlot(2);
                      setIsEditingSlot(2);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                      stagingSlot === 2
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    2️⃣ คอร์ท 2 {confirmedPreMatch2 ? '✅' : ''}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSwitchPartners}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                  title="สลับคู่ A2 <-> B1"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                  <span>สลับคู่</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoBalanceStaged}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
                  title="คำนวณสมดุลมืออัตโนมัติ"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>สมดุลมือ</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetToAutoQueue}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-xs font-medium border border-slate-700 transition"
                  title="รีเซ็ตตามคิวเวลารอคอย"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>รีเซ็ตตามคิว</span>
                </button>
              </div>
            </div>

            {/* Interactive Player Slots with Swap Pickers */}
            {currentStagingLineup ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Team A Slots */}
                <div className="bg-slate-950 border border-blue-900/50 rounded-xl p-4 space-y-3">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider block">
                    ทีม A (2 คน)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Slot A1 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {stagedA1 ? (
                          <div
                            className={`w-7 h-7 rounded-md bg-gradient-to-br ${stagedA1.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                          >
                            {stagedA1.nickname.slice(0, 1)}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-slate-800 text-slate-500 flex items-center justify-center text-xs">
                            ?
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate">
                            {stagedA1 ? stagedA1.nickname : 'เลือกผู้เล่น'}
                          </span>
                          {stagedA1 && (
                            <span className="text-[10px] text-slate-400 block">
                              เล่น {stagedA1.gamesPlayed} เกม • มือ {stagedA1.skillLevel}
                            </span>
                          )}
                        </div>
                      </div>

                      <select
                        value={currentStagingLineup.teamA[0]}
                        onChange={(e) => handleSwapSlotPlayer('A', 0, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                      >
                        {getAvailableCandidates('A', 0).map((p) => (
                          <option key={p.id} value={p.id}>
                            คุณ {p.nickname} (เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Slot A2 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {stagedA2 ? (
                          <div
                            className={`w-7 h-7 rounded-md bg-gradient-to-br ${stagedA2.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                          >
                            {stagedA2.nickname.slice(0, 1)}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-slate-800 text-slate-500 flex items-center justify-center text-xs">
                            ?
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate">
                            {stagedA2 ? stagedA2.nickname : 'เลือกผู้เล่น'}
                          </span>
                          {stagedA2 && (
                            <span className="text-[10px] text-slate-400 block">
                              เล่น {stagedA2.gamesPlayed} เกม • มือ {stagedA2.skillLevel}
                            </span>
                          )}
                        </div>
                      </div>

                      <select
                        value={currentStagingLineup.teamA[1]}
                        onChange={(e) => handleSwapSlotPlayer('A', 1, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-blue-500"
                      >
                        {getAvailableCandidates('A', 1).map((p) => (
                          <option key={p.id} value={p.id}>
                            คุณ {p.nickname} (เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Team B Slots */}
                <div className="bg-slate-950 border border-rose-900/50 rounded-xl p-4 space-y-3">
                  <span className="text-xs font-bold text-rose-400 uppercase tracking-wider block">
                    ทีม B (2 คน)
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Slot B1 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {stagedB1 ? (
                          <div
                            className={`w-7 h-7 rounded-md bg-gradient-to-br ${stagedB1.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                          >
                            {stagedB1.nickname.slice(0, 1)}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-slate-800 text-slate-500 flex items-center justify-center text-xs">
                            ?
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate">
                            {stagedB1 ? stagedB1.nickname : 'เลือกผู้เล่น'}
                          </span>
                          {stagedB1 && (
                            <span className="text-[10px] text-slate-400 block">
                              เล่น {stagedB1.gamesPlayed} เกม • มือ {stagedB1.skillLevel}
                            </span>
                          )}
                        </div>
                      </div>

                      <select
                        value={currentStagingLineup.teamB[0]}
                        onChange={(e) => handleSwapSlotPlayer('B', 0, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                      >
                        {getAvailableCandidates('B', 0).map((p) => (
                          <option key={p.id} value={p.id}>
                            คุณ {p.nickname} (เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Slot B2 */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {stagedB2 ? (
                          <div
                            className={`w-7 h-7 rounded-md bg-gradient-to-br ${stagedB2.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                          >
                            {stagedB2.nickname.slice(0, 1)}
                          </div>
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-slate-800 text-slate-500 flex items-center justify-center text-xs">
                            ?
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-bold text-white block truncate">
                            {stagedB2 ? stagedB2.nickname : 'เลือกผู้เล่น'}
                          </span>
                          {stagedB2 && (
                            <span className="text-[10px] text-slate-400 block">
                              เล่น {stagedB2.gamesPlayed} เกม • มือ {stagedB2.skillLevel}
                            </span>
                          )}
                        </div>
                      </div>

                      <select
                        value={currentStagingLineup.teamB[1]}
                        onChange={(e) => handleSwapSlotPlayer('B', 1, e.target.value)}
                        className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-300 focus:outline-none focus:border-rose-500"
                      >
                        {getAvailableCandidates('B', 1).map((p) => (
                          <option key={p.id} value={p.id}>
                            คุณ {p.nickname} (เล่น {p.gamesPlayed} เกม • มือ {p.skillLevel})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400 bg-slate-950/50 rounded-xl border border-slate-800">
                มีผู้เล่นพร้อมเล่นไม่เพียงพอสำหรับ Pre-Match #{stagingSlot} (ต้องการ 4 คน)
              </div>
            )}

            {/* Confirm Button & Notes */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="หมายเหตุเพิ่มเติม (ถ้ามี) เช่น จัดตามคำขอสมาชิก / เน้นแมตช์กระชับมิตร..."
                  value={stagingNotes}
                  onChange={(e) => setStagingNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="button"
                onClick={handleConfirmDraft}
                disabled={!currentStagingLineup || !stagedA1 || !stagedA2 || !stagedB1 || !stagedB2}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-extrabold text-xs transition shadow-md shrink-0"
              >
                <Check className="w-4 h-4" />
                <span>✅ ยืนยันคิว Pre-Match #{stagingSlot} ให้สมาชิกเห็น</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: Spotlight Finder ("เช็คคิวของฉัน") & Full Waiting Queue Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>ตารางคิวรอลงเล่นทั้งหมด ({waitingQueue.length} คน)</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              จัดลำดับตามความยุติธรรม: รอมานานกว่า (Waiting Time) ได้ลงก่อน เพื่อให้ทุกคนได้เล่นอย่างทั่วถึง
            </p>
          </div>

          {/* Search box within queue */}
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="ค้นหาชื่อในคิว..."
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {waitingQueue.length === 0 ? (
          <div className="text-center py-8 text-slate-400 bg-slate-950 rounded-xl border border-dashed border-slate-800">
            <p className="text-sm">ไม่มีผู้เล่นรอคิวในขณะนี้ (ทุกคนกำลังแข่งขันหรือพักเหนื่อย)</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
                <tr>
                  <th className="px-3 py-2.5 w-14 text-center">อันดับ</th>
                  <th className="px-3 py-2.5">ผู้เล่น</th>
                  <th className="px-3 py-2.5 text-center">เกมที่เล่นแล้ว</th>
                  <th className="px-3 py-2.5">เวลารอพัก</th>
                  <th className="px-3 py-2.5 text-center">สถานะ</th>
                  <th className="px-3 py-2.5 text-right">ปรับสถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredQueue.map((player, idx) => {
                  const waitMs = getPlayerWaitTimeMs(player, currentTime);
                  const isLongWait = waitMs > 25 * 60 * 1000;
                  const isCurrentMember = currentMemberId === player.id;

                  return (
                    <tr
                      key={player.id}
                      className={`transition ${
                        isCurrentMember
                          ? 'bg-indigo-950/40 border-l-4 border-l-indigo-400 hover:bg-indigo-900/40'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Queue Rank */}
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-xs ${
                            idx === 0
                              ? 'bg-amber-500 text-slate-950'
                              : isCurrentMember
                              ? 'bg-indigo-500 text-white shadow-sm'
                              : idx < 4
                              ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                              : 'text-slate-400'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                      </td>

                      {/* Player Avatar & Name */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-lg bg-gradient-to-br ${player.avatarColor} text-white font-bold flex items-center justify-center text-xs shrink-0`}
                          >
                            {player.nickname.slice(0, 1)}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`font-bold text-xs ${isCurrentMember ? 'text-indigo-200' : 'text-white'}`}>
                                {player.nickname}
                              </span>
                              {isCurrentMember && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-indigo-500 text-white font-black inline-flex items-center gap-0.5 shadow-sm">
                                  <span>👉 ตัวคุณ</span>
                                </span>
                              )}
                              {safeConfirmedPreMatch1 && [...safeConfirmedPreMatch1.teamA, ...safeConfirmedPreMatch1.teamB].includes(player.id) && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-bold inline-flex items-center gap-1">
                                  <span>✅ คิว Pre-Match #1 (ยืนยันแล้ว)</span>
                                </span>
                              )}
                              {safeConfirmedPreMatch2 && [...safeConfirmedPreMatch2.teamA, ...safeConfirmedPreMatch2.teamB].includes(player.id) && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-300 border border-indigo-700 font-bold inline-flex items-center gap-1">
                                  <span>✅ คิว Pre-Match #2 (ยืนยันแล้ว)</span>
                                </span>
                              )}
                              {player.registrationType === 'walkin' ? (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-950/90 text-amber-300 border border-amber-800 font-bold inline-flex items-center gap-1">
                                  <span>🚶 Walk-in</span>
                                  <span className="text-amber-200 bg-amber-900/60 px-1 rounded">
                                    {(player.walkInPenaltyMatches ?? 1) > 0 ? `+${player.walkInPenaltyMatches ?? 1} รอบ` : 'ยกเว้น'}
                                  </span>
                                </span>
                              ) : (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/60 text-emerald-400 border border-emerald-900/60 font-semibold inline-flex items-center gap-1">
                                  <span>📋 จองล่วงหน้า</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              เช็คอิน: {player.checkInTime || '-'} น.
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Games Played */}
                      <td className="px-3 py-3 text-center">
                        <div className="font-bold text-slate-200">
                          {player.gamesPlayed} เกม
                        </div>
                        {player.registrationType === 'walkin' && (player.walkInPenaltyMatches ?? 1) > 0 ? (
                          <div className="text-[10px] text-amber-400 font-medium">
                            คิวคำนวณ: {getPlayerEffectiveGames(player)} เกม
                          </div>
                        ) : null}
                      </td>

                      {/* Wait Time */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <Clock className={`w-3.5 h-3.5 ${isLongWait ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
                          <span className={`font-semibold ${isLongWait ? 'text-amber-400' : 'text-slate-300'}`}>
                            {formatWaitMinutes(waitMs)}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-3 py-3 text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950 text-emerald-300 border border-emerald-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>พร้อมเล่น</span>
                        </span>
                      </td>

                      {/* Change Status Action */}
                      <td className="px-3 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isOrganizerMode && player.registrationType === 'walkin' && onToggleWalkInPenalty && (
                            <button
                              type="button"
                              onClick={() => onToggleWalkInPenalty(player.id)}
                              title={(player.walkInPenaltyMatches ?? 1) > 0 ? 'คลิกเพื่อยกเว้น Penalty สำหรับผู้เล่นนี้' : 'คลิกเพื่อใส่ Penalty +1 รอบ'}
                              className="px-2 py-1 rounded-lg bg-amber-950/60 hover:bg-amber-900/60 text-amber-300 border border-amber-800 text-[10px] font-medium transition"
                            >
                              {(player.walkInPenaltyMatches ?? 1) > 0 ? 'ยกเว้นโทษ' : '+โทษ 1 รอบ'}
                            </button>
                          )}
                          {isOrganizerMode ? (
                            <button
                              type="button"
                              onClick={() => onSelectPlayerStatus?.(player.id, 'resting')}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-[11px] transition"
                            >
                              <Coffee className="w-3 h-3 text-amber-400" />
                              <span>ขอพักเหนื่อย</span>
                            </button>
                          ) : isCurrentMember ? (
                            <button
                              type="button"
                              onClick={() => onSelectPlayerStatus?.(player.id, 'resting')}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold transition shadow-sm"
                              title="คลิกเพื่อขอพักเหนื่อยรอบนี้"
                            >
                              <Coffee className="w-3.5 h-3.5 text-amber-400" />
                              <span>ขอพักรอบนี้</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                if (!currentMemberId) {
                                  setActionNotice('กรุณาคลิกเลือกชื่อเล่นของคุณด้านบน หรือกด Walk-in เข้าก๊วนก่อนเปลี่ยนสถานะ');
                                  onPromptIdentifyMember?.();
                                } else {
                                  setActionNotice(`คุณเข้าใช้งานในชื่อของคุณ ไม่สามารถปรับสถานะของ ${player.nickname} ได้ (สิทธิ์นี้สำหรับผู้จัดก๊วนเท่านั้น)`);
                                }
                                setTimeout(() => setActionNotice(null), 4000);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900/80 text-slate-500 border border-slate-800 text-[11px] hover:border-slate-700 hover:text-slate-400 transition"
                              title="เฉพาะผู้จัดก๊วน หรือเจ้าของชื่อเท่านั้น"
                            >
                              <Coffee className="w-3 h-3" />
                              <span>ขอพัก</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resting Players List (if any) */}
      {restingPlayers.length > 0 && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Coffee className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-slate-300">
              ผู้เล่นที่กำลังนั่งพักเหนื่อย ({restingPlayers.length} คน)
            </h4>
          </div>

          <div className="flex flex-wrap gap-2">
            {restingPlayers.map((p) => {
              const isCurrentMember = p.id === currentMemberId;
              return (
                <div
                  key={p.id}
                  className={`rounded-xl px-3 py-1.5 flex items-center gap-2 text-xs transition ${
                    isCurrentMember
                      ? 'bg-indigo-950/70 border border-indigo-500/60 shadow-sm'
                      : 'bg-slate-950 border border-slate-800'
                  }`}
                >
                  <span className={`font-semibold ${isCurrentMember ? 'text-indigo-200' : 'text-slate-300'}`}>
                    {p.nickname} {isCurrentMember ? '(ตัวคุณ)' : ''}
                  </span>
                  {isOrganizerMode || isCurrentMember ? (
                    <button
                      type="button"
                      onClick={() => onSelectPlayerStatus?.(p.id, 'waiting')}
                      className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold bg-emerald-950/60 hover:bg-emerald-900/60 px-2 py-0.5 rounded transition"
                      title="คลิกเพื่อกลับเข้าคิวรอลงเล่น"
                    >
                      หายเหนื่อยแล้ว
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setActionNotice(`เฉพาะผู้จัดก๊วน หรือคุณ ${p.nickname} เองเท่านั้นที่สามารถเปลี่ยนสถานะได้`);
                        setTimeout(() => setActionNotice(null), 3500);
                      }}
                      className="text-[10px] text-slate-500 hover:text-slate-400"
                    >
                      (พักอยู่)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

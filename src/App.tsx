import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import { auth, ORGANIZER_UID } from './firebase';
import { Header } from './components/Header';
import { PreMatchView } from './components/PreMatchView';
import { CheckInView } from './components/CheckInView';
import { SkillAssessmentView } from './components/SkillAssessmentView';
import { CourtsView } from './components/CourtsView';
import { BillingView } from './components/BillingView';
import { PlayerModal } from './components/PlayerModal';
import { SessionSettingsModal } from './components/SessionSettingsModal';
import { SelfCheckInModal } from './components/SelfCheckInModal';
import { OrganizerPinModal } from './components/OrganizerPinModal';
import { DailyArchiveModal } from './components/DailyArchiveModal';
import { FinancialStatsView } from './components/FinancialStatsView';
import { MemberAccessBar } from './components/MemberAccessBar';
import { MemberGateModal } from './components/MemberGateModal';
import { 
  Player, SessionConfig, ActiveMatch, MatchHistoryItem, 
  SkillLevel, PlayerStatus, SKILL_LEVELS, TabType, ConfirmedPreMatch
} from './types';
import { 
  loadAppState,
  saveAppState,
  exportAppStateAsJSON,
  DEFAULT_SESSION_CONFIG,
  INITIAL_PLAYERS,
  INITIAL_ACTIVE_MATCHES,
  INITIAL_MATCH_HISTORY,
  loadSessionArchives,
  replaceSessionArchivesLocal,
  hasStoredSessionArchives,
  loadFundTransactions,
  replaceFundTransactionsLocal,
  hasStoredFundTransactions,
} from './utils/storage';
import {
  saveCurrentSessionToFirestore,
  subscribeToCurrentSessionFromFirestore,
} from './utils/firestoreSync';
import {
  seedFundTransactionsToFirestore,
  seedSessionArchivesToFirestore,
  subscribeToFundTransactionsFromFirestore,
  subscribeToSessionArchivesFromFirestore,
} from './utils/firestoreCollectionsSync';

export default function App() {
  const [appState, setAppState] = useState(() => loadAppState());

  // Firebase Authentication
  // Members use anonymous auth automatically.
  // Organizer mode is granted only after Firebase Auth confirms ORGANIZER_UID.
  const [authReady, setAuthReady] = useState(false);
  const [authUserUid, setAuthUserUid] = useState('');
  const anonymousSignInInProgressRef = useRef(false);

  // Firestore realtime sync status
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'saving' | 'synced' | 'error'>('connecting');
  const [archiveRevision, setArchiveRevision] = useState(0);
  const [fundRevision, setFundRevision] = useState(0);
  const firestoreReadyRef = useRef(false);
  const applyingRemoteStateRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const clientIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const [currentTab, setCurrentTab] = useState<TabType>('prematch');
  
  // Never trust ?mode=organizer by itself.
  // Organizer mode is enabled only after Firebase Auth confirms ORGANIZER_UID.
  const [isOrganizerMode, setIsOrganizerMode] = useState<boolean>(false);

  // Track the active user identity (member/walk-in)
  const [currentMemberId, setCurrentMemberId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('badminton_active_member_id') || '';
    }
    return '';
  });

  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const handleShareMemberLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}${window.location.pathname}?mode=member`;
      navigator.clipboard.writeText(url);
      setCopiedShareLink(true);
      setTimeout(() => setCopiedShareLink(false), 2500);
    }
  };

  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('mode') === 'organizer';
  });
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState<boolean>(false);

  // Modals
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [addPlayerDefaultType, setAddPlayerDefaultType] = useState<'registered' | 'walkin'>('registered');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSelfCheckInOpen, setIsSelfCheckInOpen] = useState(false);
  const [isMemberGateOpen, setIsMemberGateOpen] = useState<boolean>(() => {
    // If not in organizer mode and no active member identified, gate immediately
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isOrg = params.get('mode') === 'organizer';
      const savedMemberId = localStorage.getItem('badminton_active_member_id');
      if (!isOrg && !savedMemberId) {
        return true;
      }
    }
    return false;
  });
  const [selectedPlayerForAssessment, setSelectedPlayerForAssessment] = useState<Player | null>(null);

  // Keep Firebase Authentication ready before opening Firestore listeners.
  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setAuthReady(false);
        setAuthUserUid('');
        setIsOrganizerMode(false);

        if (!anonymousSignInInProgressRef.current) {
          anonymousSignInInProgressRef.current = true;

          try {
            await signInAnonymously(auth);
          } catch (error) {
            console.error('Anonymous Firebase login failed', error);
            anonymousSignInInProgressRef.current = false;
          }
        }

        return;
      }

      anonymousSignInInProgressRef.current = false;
      setAuthUserUid(user.uid);
      setAuthReady(true);

      const params =
        typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : null;
      const forceMemberMode = params?.get('mode') === 'member';

      setIsOrganizerMode(user.uid === ORGANIZER_UID && !forceMemberMode);
    });

    return () => unsubscribeAuth();
  }, []);

  const handleExitOrganizerMode = async () => {
    setIsOrganizerMode(false);

    if (currentTab === 'courts' || currentTab === 'finance') {
      setCurrentTab('prematch');
    }

    if (auth.currentUser?.uid === ORGANIZER_UID) {
      try {
        setAuthReady(false);
        await signOut(auth);
        // onAuthStateChanged() restores Anonymous auth automatically.
      } catch (error) {
        console.error('Organizer logout failed', error);
      }
    }
  };

  const handleToggleOrganizerMode = () => {
    if (isOrganizerMode) {
      void handleExitOrganizerMode();
    } else {
      setIsPinModalOpen(true);
    }
  };

  // Firestore realtime subscription.
  // - If Firestore already has a current session, use it as the shared source of truth.
  // - If the document does not exist yet, upload this browser's migrated LocalStorage state once.
  useEffect(() => {
    if (!authReady || !authUserUid) return;

    firestoreReadyRef.current = false;
    setSyncStatus('connecting');

    const unsubscribe = subscribeToCurrentSessionFromFirestore(
      (remoteState, updatedBy) => {
        firestoreReadyRef.current = true;

        // Ignore our own Firestore echo. Local state is already current.
        if (updatedBy === clientIdRef.current) {
          setSyncStatus('synced');
          return;
        }

        // A newer state arrived from another device.
        // Cancel any pending local push so stale local data does not immediately overwrite it.
        if (pushTimerRef.current !== null) {
          window.clearTimeout(pushTimerRef.current);
          pushTimerRef.current = null;
        }

        applyingRemoteStateRef.current = true;
        saveAppState(remoteState); // LocalStorage remains an offline/local backup.
        setAppState(remoteState);
        setSyncStatus('synced');
      },
      async () => {
        // First run: no shared Firestore state yet.
        firestoreReadyRef.current = true;
        setSyncStatus('saving');

        try {
          await saveCurrentSessionToFirestore(appState, clientIdRef.current);
          setSyncStatus('synced');
        } catch (error) {
          console.error('Failed to create initial Firestore session', error);
          setSyncStatus('error');
        }
      },
      (error) => {
        console.error('Firestore realtime sync error', error);
        setSyncStatus('error');
      }
    );

    return () => {
      unsubscribe();

      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [authReady, authUserUid]);

  // Realtime sync for Archive and Fund collections.
  // Existing components can keep using the LocalStorage-based helpers;
  // Firestore continuously refreshes those local caches.
  useEffect(() => {
    if (!authReady || !authUserUid) return;

    let archiveFirstSnapshot = true;
    let fundFirstSnapshot = true;

    const unsubscribeArchives = subscribeToSessionArchivesFromFirestore(
      (remoteArchives) => {
        if (archiveFirstSnapshot) {
          archiveFirstSnapshot = false;

          // One-time migration: if Firestore is empty but this browser already
          // has real LocalStorage archive data, upload it first.
          if (remoteArchives.length === 0 && hasStoredSessionArchives()) {
            const localArchives = loadSessionArchives();

            if (localArchives.length > 0) {
              void seedSessionArchivesToFirestore(localArchives).catch((error) => {
                console.error('Failed to migrate archives to Firestore', error);
              });
              return;
            }
          }
        }

        replaceSessionArchivesLocal(remoteArchives);
        setArchiveRevision((value) => value + 1);
      },
      (error) => {
        console.error('Archive realtime sync error', error);
      }
    );

    const unsubscribeFund = subscribeToFundTransactionsFromFirestore(
      (remoteTransactions) => {
        if (fundFirstSnapshot) {
          fundFirstSnapshot = false;

          if (remoteTransactions.length === 0 && hasStoredFundTransactions()) {
            const localTransactions = loadFundTransactions();

            if (localTransactions.length > 0) {
              void seedFundTransactionsToFirestore(localTransactions).catch((error) => {
                console.error('Failed to migrate fund transactions to Firestore', error);
              });
              return;
            }
          }
        }

        replaceFundTransactionsLocal(remoteTransactions);
        setFundRevision((value) => value + 1);
      },
      (error) => {
        console.error('Fund realtime sync error', error);
      }
    );

    return () => {
      unsubscribeArchives();
      unsubscribeFund();
    };
  }, [authReady, authUserUid]);

  // Keep LocalStorage as a backup and debounce writes to Firestore.
  useEffect(() => {
    saveAppState(appState);

    if (!authReady || !authUserUid) return;
    if (!firestoreReadyRef.current) return;

    // This state was just received from Firestore; do not write it straight back.
    if (applyingRemoteStateRef.current) {
      applyingRemoteStateRef.current = false;
      return;
    }

    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current);
    }

    setSyncStatus('saving');

    pushTimerRef.current = window.setTimeout(async () => {
      try {
        await saveCurrentSessionToFirestore(appState, clientIdRef.current);
        setSyncStatus('synced');
      } catch (error) {
        console.error('Failed to save state to Firestore', error);
        setSyncStatus('error');
      } finally {
        pushTimerRef.current = null;
      }
    }, 500);

    return () => {
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [appState, authReady, authUserUid]);

  const { sessionConfig, players, activeMatches, matchHistory } = appState;

  // Active playing player IDs & waiting count
  const playingPlayerIds = new Set(activeMatches.flatMap((m) => [...m.teamA, ...m.teamB]));
  const waitingCount = players.filter(
    (p) => p.isCheckedIn && !playingPlayerIds.has(p.id) && p.status === 'waiting'
  ).length;

  // --- Handlers: Check-in & Players ---
  const handleCheckInPlayer = (playerId: string, pin?: string) => {
    setAppState((prev) => {
      const updatedPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;
          return {
            ...p,
            isCheckedIn: true,
            checkInTime: timeStr,
            checkInTimestamp: Date.now(),
            status: ('waiting' as PlayerStatus),
            pin: pin || p.pin,
          };
        }
        return p;
      });
      return { ...prev, players: updatedPlayers };
    });
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
  };

  const handleCheckOutPlayer = (playerId: string) => {
    setAppState((prev) => {
      const updatedPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            isCheckedIn: false,
            checkInTime: undefined,
            checkInTimestamp: undefined,
            status: ('left' as PlayerStatus),
          };
        }
        return p;
      });

      // Clear from pre-match if present
      let nextPre1 = prev.confirmedPreMatch;
      let nextPre2 = prev.confirmedPreMatch2;
      if (nextPre1 && [...nextPre1.teamA, ...nextPre1.teamB].includes(playerId)) {
        nextPre1 = null;
      }
      if (nextPre2 && [...nextPre2.teamA, ...nextPre2.teamB].includes(playerId)) {
        nextPre2 = null;
      }

      return {
        ...prev,
        players: updatedPlayers,
        confirmedPreMatch: nextPre1,
        confirmedPreMatch2: nextPre2,
      };
    });
  };

  const handleToggleCheckIn = (playerId: string) => {
    const targetPlayer = appState.players.find((p) => p.id === playerId);
    if (targetPlayer && targetPlayer.isCheckedIn) {
      handleCheckOutPlayer(playerId);
    } else {
      handleCheckInPlayer(playerId);
    }
  };

  const handleUpdatePlayerStatus = (playerId: string, status: PlayerStatus) => {
    setAppState((prev) => {
      const updatedPlayers = prev.players.map((p) =>
        p.id === playerId ? { ...p, status } : p
      );

      // If a player is marked resting or left, clear them from confirmed pre-match if present
      let nextPre1 = prev.confirmedPreMatch;
      let nextPre2 = prev.confirmedPreMatch2;
      if (status === 'resting' || status === 'left') {
        if (nextPre1 && [...nextPre1.teamA, ...nextPre1.teamB].includes(playerId)) {
          nextPre1 = null;
        }
        if (nextPre2 && [...nextPre2.teamA, ...nextPre2.teamB].includes(playerId)) {
          nextPre2 = null;
        }
      }

      return {
        ...prev,
        players: updatedPlayers,
        confirmedPreMatch: nextPre1,
        confirmedPreMatch2: nextPre2,
      };
    });
  };

  const handleAddPlayer = (newPlayerData: Omit<Player, 'id' | 'status' | 'gamesPlayed' | 'paid'>) => {
    const newPlayer: Player = {
      ...newPlayerData,
      id: `p-${Date.now()}`,
      status: 'waiting',
      gamesPlayed: 0,
      paid: false,
    };

    setAppState((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
    }));

    if (newPlayer.isCheckedIn) {
      confetti({ particleCount: 40, spread: 50, origin: { y: 0.7 } });
    }
  };

  const handleQuickAddAndCheckIn = (
    name: string,
    skillLevel: SkillLevel = 'B',
    registrationType: 'registered' | 'walkin' = 'walkin',
    phone?: string,
    pin?: string
  ) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const newPlayer: Player = {
      id: `p-${Date.now()}`,
      nickname: name,
      phone: phone?.trim() || undefined,
      pin: pin?.trim() || undefined,
      gender: 'male',
      skillLevel,
      skillScore: SKILL_LEVELS[skillLevel]?.score || 3.0,
      registrationType,
      walkInPenaltyMatches: registrationType === 'walkin' ? 1 : 0,
      isCheckedIn: true,
      checkInTime: timeStr,
      checkInTimestamp: Date.now(),
      status: 'waiting',
      gamesPlayed: 0,
      paid: false,
      avatarColor: registrationType === 'walkin' ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600',
    };

    setAppState((prev) => ({
      ...prev,
      players: [...prev.players, newPlayer],
    }));

    // Automatically set as current active member session
    setCurrentMemberId(newPlayer.id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('badminton_active_member_id', newPlayer.id);
    }
  };

  const handleToggleWalkInPenalty = (playerId: string) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;
        const isWalkIn = p.registrationType === 'walkin';
        if (!isWalkIn) {
          return {
            ...p,
            registrationType: 'walkin',
            walkInPenaltyMatches: 1,
          };
        }
        const currentPenalty = p.walkInPenaltyMatches ?? 1;
        const newPenalty = currentPenalty > 0 ? 0 : 1;
        return {
          ...p,
          walkInPenaltyMatches: newPenalty,
        };
      }),
    }));
  };

  const handleToggleRegistrationType = (playerId: string) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;
        const newType = p.registrationType === 'walkin' ? 'registered' : 'walkin';
        return {
          ...p,
          registrationType: newType,
          walkInPenaltyMatches: newType === 'walkin' ? 1 : 0,
        };
      }),
    }));
  };

  const handleDeletePlayer = (playerId: string) => {
    if (!window.confirm('คุณแน่ใจหรือไม่ว่าต้องการลบผู้เล่นคนนี้ออกจากก๊วน?')) return;
    setAppState((prev) => ({
      ...prev,
      players: prev.players.filter((p) => p.id !== playerId),
    }));
  };

  const handleEditPlayer = (player: Player) => {
    setEditingPlayer(player);
    setIsAddPlayerOpen(true);
  };

  const handleUpdatePlayer = (updatedPlayer: Player) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => (p.id === updatedPlayer.id ? updatedPlayer : p)),
    }));
    setEditingPlayer(null);
  };

  const handleExportBackup = () => {
    exportAppStateAsJSON(appState);
  };

  const handleImportBackup = (importedData: any) => {
    if (importedData && importedData.sessionConfig && importedData.players) {
      setAppState(importedData);
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.6 } });
    }
  };

  // --- Handlers: Skill Assessment ---
  const handleOpenAssessmentForPlayer = (player: Player) => {
    setSelectedPlayerForAssessment(player);
    setCurrentTab('assessment');
  };

  const handleUpdatePlayerSkill = (playerId: string, skillLevel: SkillLevel, skillScore: number) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId ? { ...p, skillLevel, skillScore } : p
      ),
    }));
  };

  // --- Handlers: Courts & Matches ---
  const handleStartMatch = (
    courtId: string,
    courtName: string,
    teamA: [string, string],
    teamB: [string, string]
  ) => {
    // 1. Prevent stacking duplicate match on an already occupied court
    const isCourtBusy = activeMatches.some((m) => m.courtId === courtId);
    let actualCourtId = courtId;
    let actualCourtName = courtName;

    if (isCourtBusy) {
      // If the target court is busy, check if another court is available
      const freeCourtIdx = sessionConfig.courtNames.findIndex((_, idx) => {
        const id = `court-${idx + 1}`;
        return !activeMatches.some((m) => m.courtId === id);
      });

      if (freeCourtIdx !== -1) {
        actualCourtId = `court-${freeCourtIdx + 1}`;
        actualCourtName = sessionConfig.courtNames[freeCourtIdx] || `คอร์ท ${freeCourtIdx + 1}`;
      } else {
        console.warn(`Cannot start match: all courts are currently occupied.`);
        return;
      }
    }

    // 2. Prevent starting match if any player is already playing
    const playingIds = new Set(activeMatches.flatMap((m) => [...m.teamA, ...m.teamB]));
    const allPlayerIds = new Set([...teamA, ...teamB]);
    const duplicatePlayers = [...allPlayerIds].filter((id) => playingIds.has(id));
    if (duplicatePlayers.length > 0) {
      console.warn(`Cannot start match: player(s) already on court:`, duplicatePlayers);
      return;
    }

    const newMatch: ActiveMatch = {
      id: `match-${Date.now()}`,
      courtId: actualCourtId,
      courtName: actualCourtName,
      teamA,
      teamB,
      startTime: Date.now(),
      shuttlecocksCount: 1,
      status: 'playing',
    };

    setAppState((prev) => ({
      ...prev,
      // Strictly prevent multiple matches on the same court
      activeMatches: [...prev.activeMatches.filter((m) => m.courtId !== actualCourtId), newMatch],
      // If any player in confirmedPreMatch is now playing on court, clear it
      confirmedPreMatch:
        prev.confirmedPreMatch &&
        [...prev.confirmedPreMatch.teamA, ...prev.confirmedPreMatch.teamB].some((id) =>
          allPlayerIds.has(id)
        )
          ? null
          : prev.confirmedPreMatch,
      // If any player in confirmedPreMatch2 is now playing on court, clear it
      confirmedPreMatch2:
        prev.confirmedPreMatch2 &&
        [...prev.confirmedPreMatch2.teamA, ...prev.confirmedPreMatch2.teamB].some((id) =>
          allPlayerIds.has(id)
        )
          ? null
          : prev.confirmedPreMatch2,
      players: prev.players.map((p) =>
        allPlayerIds.has(p.id) ? { ...p, status: 'playing' as PlayerStatus } : p
      ),
    }));

    confetti({ particleCount: 30, spread: 45, origin: { y: 0.5 } });
  };

  const handleFinishMatch = (
    matchId: string,
    shuttlecocksCount: number,
    scoresOrScoreA?: {
      game1ScoreA?: number;
      game1ScoreB?: number;
      game2ScoreA?: number;
      game2ScoreB?: number;
    } | number,
    maybeScoreB?: number
  ) => {
    const targetMatch = activeMatches.find((m) => m.id === matchId);
    if (!targetMatch) return;

    const allPlayerIds = new Set([...targetMatch.teamA, ...targetMatch.teamB]);

    // Duration in minutes
    const durationMinutes = Math.max(
      1,
      Math.round((Date.now() - targetMatch.startTime) / 60000)
    );

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
      .getMinutes()
      .toString()
      .padStart(2, '0')}`;

    const teamAPlayers = targetMatch.teamA
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean) as Player[];
    const teamBPlayers = targetMatch.teamB
      .map((id) => players.find((p) => p.id === id))
      .filter(Boolean) as Player[];

    const teamASkillAvg = teamAPlayers.length
      ? teamAPlayers.reduce((acc, p) => acc + p.skillScore, 0) / teamAPlayers.length
      : 3.0;
    const teamBSkillAvg = teamBPlayers.length
      ? teamBPlayers.reduce((acc, p) => acc + p.skillScore, 0) / teamBPlayers.length
      : 3.0;

    let g1A: number | undefined;
    let g1B: number | undefined;
    let g2A: number | undefined;
    let g2B: number | undefined;

    if (typeof scoresOrScoreA === 'object' && scoresOrScoreA !== null) {
      g1A = scoresOrScoreA.game1ScoreA ?? targetMatch.game1ScoreA;
      g1B = scoresOrScoreA.game1ScoreB ?? targetMatch.game1ScoreB;
      g2A = scoresOrScoreA.game2ScoreA ?? targetMatch.game2ScoreA;
      g2B = scoresOrScoreA.game2ScoreB ?? targetMatch.game2ScoreB;
    } else if (typeof scoresOrScoreA === 'number') {
      g1A = scoresOrScoreA;
      g1B = maybeScoreB;
      g2A = targetMatch.game2ScoreA;
      g2B = targetMatch.game2ScoreB;
    } else {
      g1A = targetMatch.game1ScoreA;
      g1B = targetMatch.game1ScoreB;
      g2A = targetMatch.game2ScoreA;
      g2B = targetMatch.game2ScoreB;
    }

    const historyItem: MatchHistoryItem = {
      id: `hist-${Date.now()}`,
      courtName: targetMatch.courtName,
      teamANames: teamAPlayers.map((p) => p.nickname),
      teamBNames: teamBPlayers.map((p) => p.nickname),
      teamASkillAvg: Math.round(teamASkillAvg * 10) / 10,
      teamBSkillAvg: Math.round(teamBSkillAvg * 10) / 10,
      startTime: timeStr,
      durationMinutes,
      shuttlecocksCount,
      scoreA: g1A,
      scoreB: g1B,
      game1ScoreA: g1A,
      game1ScoreB: g1B,
      game2ScoreA: g2A,
      game2ScoreB: g2B,
      isRoundTrip: true,
    };

    setAppState((prev) => ({
      ...prev,
      activeMatches: prev.activeMatches.filter((m) => m.id !== matchId),
      matchHistory: [historyItem, ...prev.matchHistory],
      // Increment games played (1 round trip = 2 sets/games) and return players to 'waiting' with last match finish time
      players: prev.players.map((p) =>
        allPlayerIds.has(p.id)
          ? { 
              ...p, 
              gamesPlayed: p.gamesPlayed + 2, 
              matchesPlayed: (p.matchesPlayed || 0) + 1,
              status: 'waiting' as PlayerStatus,
              lastMatchFinishTime: Date.now(),
            }
          : p
      ),
      // Increment total shuttlecocks used
      sessionConfig: {
        ...prev.sessionConfig,
        shuttlecocksUsedTotal: prev.sessionConfig.shuttlecocksUsedTotal + shuttlecocksCount,
      },
    }));

    confetti({ particleCount: 50, spread: 70, origin: { y: 0.6 } });
  };

  const handleUpdateMatchShuttlecocks = (matchId: string, delta: number) => {
    setAppState((prev) => ({
      ...prev,
      activeMatches: prev.activeMatches.map((m) =>
        m.id === matchId
          ? { ...m, shuttlecocksCount: Math.max(0, m.shuttlecocksCount + delta) }
          : m
      ),
    }));
  };

  const handleUpdateMatchScore = (
    matchId: string,
    scoresOrScoreA: {
      game1ScoreA?: number;
      game1ScoreB?: number;
      game2ScoreA?: number;
      game2ScoreB?: number;
      scoreA?: number;
      scoreB?: number;
    } | number,
    maybeScoreB?: number
  ) => {
    setAppState((prev) => ({
      ...prev,
      activeMatches: prev.activeMatches.map((m) => {
        if (m.id !== matchId) return m;
        if (typeof scoresOrScoreA === 'object' && scoresOrScoreA !== null) {
          return {
            ...m,
            game1ScoreA: scoresOrScoreA.game1ScoreA !== undefined ? scoresOrScoreA.game1ScoreA : m.game1ScoreA,
            game1ScoreB: scoresOrScoreA.game1ScoreB !== undefined ? scoresOrScoreA.game1ScoreB : m.game1ScoreB,
            game2ScoreA: scoresOrScoreA.game2ScoreA !== undefined ? scoresOrScoreA.game2ScoreA : m.game2ScoreA,
            game2ScoreB: scoresOrScoreA.game2ScoreB !== undefined ? scoresOrScoreA.game2ScoreB : m.game2ScoreB,
            scoreA: scoresOrScoreA.game1ScoreA !== undefined ? scoresOrScoreA.game1ScoreA : (scoresOrScoreA.scoreA ?? m.scoreA),
            scoreB: scoresOrScoreA.game1ScoreB !== undefined ? scoresOrScoreA.game1ScoreB : (scoresOrScoreA.scoreB ?? m.scoreB),
          };
        } else {
          return {
            ...m,
            scoreA: scoresOrScoreA,
            scoreB: maybeScoreB,
            game1ScoreA: scoresOrScoreA,
            game1ScoreB: maybeScoreB,
          };
        }
      }),
    }));
  };

  // --- Handlers: Pre-Match Queue & Organizer Confirmation (Slot 1 & Slot 2) ---
  const handleConfirmPreMatch = (preMatch: ConfirmedPreMatch, slotNumber: 1 | 2 = 1) => {
    const preMatchPlayerIds = new Set([...preMatch.teamA, ...preMatch.teamB]);
    setAppState((prev) => {
      let nextPre1 = slotNumber === 1 ? preMatch : prev.confirmedPreMatch;
      let nextPre2 = slotNumber === 2 ? preMatch : prev.confirmedPreMatch2;

      // Ensure no overlap between preMatch 1 and preMatch 2
      if (slotNumber === 1 && nextPre2) {
        const hasOverlap = [...nextPre2.teamA, ...nextPre2.teamB].some((id) => preMatchPlayerIds.has(id));
        if (hasOverlap) nextPre2 = null;
      } else if (slotNumber === 2 && nextPre1) {
        const hasOverlap = [...nextPre1.teamA, ...nextPre1.teamB].some((id) => preMatchPlayerIds.has(id));
        if (hasOverlap) nextPre1 = null;
      }

      return {
        ...prev,
        confirmedPreMatch: nextPre1,
        confirmedPreMatch2: nextPre2,
      };
    });
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
  };

  const handleCancelPreMatch = (slotNumber: 1 | 2 = 1) => {
    setAppState((prev) => ({
      ...prev,
      confirmedPreMatch: slotNumber === 1 ? null : prev.confirmedPreMatch,
      confirmedPreMatch2: slotNumber === 2 ? null : prev.confirmedPreMatch2,
    }));
  };

  const handleStartConfirmedPreMatch = (courtId: string, preMatch: ConfirmedPreMatch, slotNumber: 1 | 2 = 1) => {
    // Check if target court is busy, redirect to free court if available
    const isTargetBusy = activeMatches.some((m) => m.courtId === courtId);
    let targetCourtId = courtId;
    let targetCourtName = '';

    if (isTargetBusy) {
      const freeIdx = sessionConfig.courtNames.findIndex((_, idx) => {
        const id = `court-${idx + 1}`;
        return !activeMatches.some((m) => m.courtId === id);
      });
      if (freeIdx === -1) {
        console.warn('Cannot start pre-match: all courts are currently busy.');
        return;
      }
      targetCourtId = `court-${freeIdx + 1}`;
      targetCourtName = sessionConfig.courtNames[freeIdx] || `คอร์ท ${freeIdx + 1}`;
    } else {
      const courtIndex = parseInt(courtId.replace('court-', '')) - 1;
      targetCourtName = sessionConfig.courtNames[courtIndex] || `คอร์ท ${courtIndex + 1}`;
    }

    handleStartMatch(targetCourtId, targetCourtName, preMatch.teamA, preMatch.teamB);
    setAppState((prev) => ({
      ...prev,
      confirmedPreMatch: slotNumber === 1 ? null : prev.confirmedPreMatch,
      confirmedPreMatch2: slotNumber === 2 ? null : prev.confirmedPreMatch2,
    }));
  };

  // --- Handlers: Billing & Payments ---
  const handleTogglePlayerPayment = (playerId: string, paid: boolean, amount?: number, newPin?: string) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              paid,
              paidAmount: paid ? amount : undefined,
              paymentTime: paid
                ? new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
                : undefined,
              pin: newPin && newPin.trim().length === 4 ? newPin.trim() : p.pin,
            }
          : p
      ),
    }));
  };

  const handleMarkAllCheckedInPaid = () => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.isCheckedIn ? { ...p, paid: true } : p
      ),
    }));
    confetti({ particleCount: 70, spread: 80, origin: { y: 0.6 } });
  };

  const handleUpdatePlayerExtraShuttlecocks = (playerId: string, delta: number) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;
        const current = p.extraShuttlecocks || 0;
        return {
          ...p,
          extraShuttlecocks: Math.max(0, current + delta),
        };
      }),
    }));
  };

  const handleUpdateSessionConfig = (newConfig: SessionConfig) => {
    setAppState((prev) => ({ ...prev, sessionConfig: newConfig }));
  };

  const handleResetSession = () => {
    setIsArchiveModalOpen(true);
  };

  const checkedInCount = players.filter((p) => p.isCheckedIn).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        sessionConfig={sessionConfig}
        totalPlayers={players.length}
        checkedInCount={checkedInCount}
        activeMatchesCount={activeMatches.length}
        waitingCount={waitingCount}
        isOrganizerMode={isOrganizerMode}
        onToggleOrganizerMode={handleToggleOrganizerMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetSession={handleResetSession}
        onShareMemberLink={handleShareMemberLink}
        copiedShareLink={copiedShareLink}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top Member / Organizer status & access toolbar */}
        <MemberAccessBar
          players={players}
          currentMemberId={currentMemberId}
          onSelectMember={(id) => {
            setCurrentMemberId(id);
            if (typeof window !== 'undefined') {
              localStorage.setItem('badminton_active_member_id', id);
            }
          }}
          onClearMember={() => {
            setCurrentMemberId('');
            if (typeof window !== 'undefined') {
              localStorage.removeItem('badminton_active_member_id');
            }
            setIsMemberGateOpen(true);
          }}
          onOpenWalkInModal={() => {
            setEditingPlayer(null);
            setAddPlayerDefaultType('walkin');
            setIsSelfCheckInOpen(true);
          }}
          onOpenMemberGate={() => setIsMemberGateOpen(true)}
          onCheckInMember={(player) => {
            handleCheckInPlayer(player.id);
          }}
          onUpdateMemberStatus={(playerId, status) => {
            handleUpdatePlayerStatus(playerId, status);
          }}
          onNavigateToTab={(tab) => {
            setCurrentTab(tab);
          }}
          isOrganizerMode={isOrganizerMode}
          onToggleOrganizerMode={handleToggleOrganizerMode}
          onShareMemberLink={handleShareMemberLink}
          copiedShareLink={copiedShareLink}
          waitingQueueIndex={
            currentMemberId
              ? players
                  .filter((p) => p.isCheckedIn && !playingPlayerIds.has(p.id) && p.status === 'waiting')
                  .findIndex((p) => p.id === currentMemberId)
              : undefined
          }
          currentPlayingCourt={
            currentMemberId
              ? activeMatches.find((m) => [...m.teamA, ...m.teamB].includes(currentMemberId))?.courtName
              : undefined
          }
        />

        {currentTab === 'prematch' && (
          <PreMatchView
            sessionConfig={sessionConfig}
            players={players}
            activeMatches={activeMatches}
            isOrganizerMode={isOrganizerMode}
            currentMemberId={currentMemberId}
            confirmedPreMatch={appState.confirmedPreMatch}
            confirmedPreMatch2={appState.confirmedPreMatch2}
            onConfirmPreMatch={handleConfirmPreMatch}
            onCancelPreMatch={handleCancelPreMatch}
            onStartConfirmedPreMatch={handleStartConfirmedPreMatch}
            onSelectPlayerStatus={(id, status) => handleUpdatePlayerStatus(id, status)}
            onNavigateToCourts={() => setCurrentTab('courts')}
            onUnlockOrganizer={() => setIsPinModalOpen(true)}
            onToggleWalkInPenalty={handleToggleWalkInPenalty}
            onToggleRegistrationType={handleToggleRegistrationType}
            onPromptIdentifyMember={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          />
        )}

        {currentTab === 'checkin' && (
          <CheckInView
            players={players}
            isOrganizerMode={isOrganizerMode}
            currentMemberId={currentMemberId}
            hideSkillFromMembers={sessionConfig.hideSkillFromMembers ?? true}
            organizerPin={sessionConfig.organizerPin || '1234'}
            onToggleCheckIn={handleToggleCheckIn}
            onCheckInPlayer={handleCheckInPlayer}
            onCheckOutPlayer={handleCheckOutPlayer}
            onUpdatePlayerStatus={handleUpdatePlayerStatus}
            onOpenAddPlayerModal={() => {
              setEditingPlayer(null);
              setAddPlayerDefaultType('registered');
              setIsAddPlayerOpen(true);
            }}
            onOpenAddWalkInModal={() => {
              setEditingPlayer(null);
              setAddPlayerDefaultType('walkin');
              setIsAddPlayerOpen(true);
            }}
            onOpenSelfCheckInModal={() => setIsSelfCheckInOpen(true)}
            onOpenAssessmentForPlayer={handleOpenAssessmentForPlayer}
            onEditPlayer={handleEditPlayer}
            onDeletePlayer={handleDeletePlayer}
            onToggleWalkInPenalty={handleToggleWalkInPenalty}
            onToggleRegistrationType={handleToggleRegistrationType}
            onPromptIdentifyMember={() => setIsMemberGateOpen(true)}
          />
        )}

        {currentTab === 'assessment' && (
          <SkillAssessmentView
            players={players}
            selectedPlayerForAssessment={selectedPlayerForAssessment}
            onUpdatePlayerSkill={handleUpdatePlayerSkill}
            isOrganizerMode={isOrganizerMode}
            hideSkillFromMembers={sessionConfig.hideSkillFromMembers ?? true}
            onUnlockOrganizer={() => setIsPinModalOpen(true)}
          />
        )}

        {currentTab === 'courts' && (
          <CourtsView
            sessionConfig={sessionConfig}
            players={players}
            activeMatches={activeMatches}
            matchHistory={matchHistory}
            isOrganizerMode={isOrganizerMode}
            hideSkillFromMembers={sessionConfig.hideSkillFromMembers ?? true}
            confirmedPreMatch={appState.confirmedPreMatch}
            confirmedPreMatch2={appState.confirmedPreMatch2}
            onStartMatch={handleStartMatch}
            onFinishMatch={handleFinishMatch}
            onUpdateMatchShuttlecocks={handleUpdateMatchShuttlecocks}
            onUpdateMatchScore={handleUpdateMatchScore}
          />
        )}

        {currentTab === 'billing' && (
          <BillingView
            sessionConfig={sessionConfig}
            players={players}
            isOrganizerMode={isOrganizerMode}
            organizerPin={sessionConfig.organizerPin || '1234'}
            onUnlockOrganizer={() => setIsPinModalOpen(true)}
            onNavigateToFinance={() => setCurrentTab('finance')}
            onUpdateSessionConfig={handleUpdateSessionConfig}
            onTogglePlayerPayment={handleTogglePlayerPayment}
            onMarkAllCheckedInPaid={handleMarkAllCheckedInPaid}
            onEditPlayer={handleEditPlayer}
            onUpdatePlayerExtraShuttlecocks={handleUpdatePlayerExtraShuttlecocks}
          />
        )}

        {currentTab === 'finance' && (
          <FinancialStatsView
            key={`finance-${fundRevision}`}
            sessionConfig={sessionConfig}
            players={players}
            isOrganizerMode={isOrganizerMode}
            onUnlockOrganizer={() => setIsPinModalOpen(true)}
            onNavigateToBilling={() => setCurrentTab('billing')}
            onOpenArchiveModal={() => setIsArchiveModalOpen(true)}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-900/60 text-slate-400 text-xs py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span>🏸 ก๊วนกวน - Badminton Club</span>
            <span>•</span>
            <span className="text-emerald-400">ระบบเช็คอิน • ประเมินมือ • จัดคู่ • คิดเงินพร้อมเพย์</span>
          </div>
          <div
            className={`text-[11px] ${
              syncStatus === 'synced'
                ? 'text-emerald-400'
                : syncStatus === 'error'
                ? 'text-rose-400'
                : 'text-amber-400'
            }`}
          >
            {syncStatus === 'synced' && '☁️ Firestore Sync แล้ว • LocalStorage Backup'}
            {syncStatus === 'saving' && '☁️ กำลังบันทึกขึ้น Firestore...'}
            {syncStatus === 'connecting' && '☁️ กำลังเชื่อมต่อ Firestore...'}
            {syncStatus === 'error' && '⚠️ Firestore Sync มีปัญหา • ใช้ LocalStorage Backup'}
            <span className="ml-2 text-slate-500">•</span>
            <span className={`ml-2 ${isOrganizerMode ? 'text-amber-300' : authReady ? 'text-cyan-300' : 'text-slate-500'}`}>
              {isOrganizerMode
                ? '🔐 Organizer Auth'
                : authReady
                ? '🔒 Member Anonymous Auth'
                : '🔑 กำลังตรวจสอบ Auth...'}
            </span>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <PlayerModal
        isOpen={isAddPlayerOpen}
        onClose={() => {
          setIsAddPlayerOpen(false);
          setEditingPlayer(null);
        }}
        onSavePlayer={handleAddPlayer}
        playerToEdit={editingPlayer}
        onUpdatePlayer={handleUpdatePlayer}
        defaultRegistrationType={addPlayerDefaultType}
        existingPlayers={players}
      />

      <SessionSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={sessionConfig}
        onSaveConfig={handleUpdateSessionConfig}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
      />

      <SelfCheckInModal
        isOpen={isSelfCheckInOpen}
        onClose={() => setIsSelfCheckInOpen(false)}
        players={players}
        organizerPin={sessionConfig.organizerPin || '1234'}
        onCheckInPlayer={handleCheckInPlayer}
        onQuickAddAndCheckIn={handleQuickAddAndCheckIn}
      />

      <OrganizerPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          setIsOrganizerMode(true);
          setIsPinModalOpen(false);
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
        }}
      />

      <DailyArchiveModal
        key={`archive-${archiveRevision}`}
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        currentState={appState}
        onResetSession={(newState) => {
          setAppState(newState);
          setIsArchiveModalOpen(false);
        }}
      />

      {/* Member Gate & Direct URL Access Restriction Gate */}
      <MemberGateModal
        isOpen={isMemberGateOpen && !isOrganizerMode}
        players={players}
        organizerPin={sessionConfig.organizerPin || '1234'}
        onSelectAndVerifyMember={(player, pinUsed) => {
          // If a new PIN was established, update player record
          if (pinUsed && !player.pin) {
            setAppState((prev) => ({
              ...prev,
              players: prev.players.map((p) =>
                p.id === player.id ? { ...p, pin: pinUsed } : p
              ),
            }));
          }
          setCurrentMemberId(player.id);
          if (typeof window !== 'undefined') {
            localStorage.setItem('badminton_active_member_id', player.id);
          }
          setIsMemberGateOpen(false);
          confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
        }}
        onQuickAddWalkIn={(name, skill, regType, phone, pin) => {
          handleQuickAddAndCheckIn(name, skill || 'B', regType || 'walkin', phone, pin);
          setIsMemberGateOpen(false);
        }}
        onOpenOrganizerLogin={() => {
          setIsMemberGateOpen(false);
          setIsPinModalOpen(true);
        }}
      />
    </div>
  );
}

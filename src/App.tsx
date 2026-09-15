import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  onAuthStateChanged,
  signInAnonymously,
  signOut,
} from 'firebase/auth';
import { auth, isOrganizerUid } from './firebase';
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
import { MemberCenterModal } from './components/MemberCenterModal';
import { MemberPinModal } from './components/MemberPinModal';
import {
  DeletedMemberRecord,
  MemberLifetimeStatsMap,
  ensureMemberStats,
  getDeletedMembers,
  getMemberStatsMap,
  getAvailableFreeGameRewards,
  isBirthdayCourtRewardAvailable,
  getSessionYear,
  getCurrentSessionCompletedMatchCount,
} from './utils/memberRecords';
import {
  PromotionRule,
  PromotionRedemption,
  getPromotionRules,
  getPromotionRedemptions,
  getPromotionAvailableCredits,
  calculatePromotionDiscount,
  calculatePlayerFinalCharge,
} from './utils/promotionRules';
import {
  ShuttlePurchase,
  ShuttleUsageRecord,
  ShuttleStockAdjustment,
  getShuttlePurchases,
  getShuttleUsageLedger,
  getShuttleStockAdjustments,
  getShuttleInventorySummary,
  getCurrentShuttleAverageCost,
  getSessionShuttleUsageSummary,
} from './utils/shuttleInventory';
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
  normalizeSkillLevel,
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

class SectionErrorBoundary extends React.Component<
  { children: React.ReactNode; title: string; onBack: () => void },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; title: string; onBack: () => void }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : 'Unknown rendering error',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error(`GuanGuan view crashed: ${this.props.title}`, error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-2xl mx-auto rounded-2xl border border-rose-800 bg-rose-950/40 p-5 sm:p-6 shadow-xl">
          <div className="text-lg font-extrabold text-rose-300">⚠️ หน้า {this.props.title} มีข้อมูลบางรายการที่อ่านไม่ได้</div>
          <p className="text-sm text-slate-300 mt-2">
            ระบบป้องกันไม่ให้ทั้งเว็บกลายเป็นหน้าขาวแล้ว สามารถกลับไปหน้า Pre-Match ได้ทันที
          </p>
          <div className="mt-3 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs text-slate-400 font-mono break-words">
            {this.state.message}
          </div>
          <button
            type="button"
            onClick={this.props.onBack}
            className="mt-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 text-sm font-bold transition"
          >
            ← กลับหน้า Pre-Match
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [appState, setAppState] = useState(() => loadAppState());

  // Firebase Authentication
  // Members use anonymous auth automatically.
  // Organizer mode is granted only after Firebase Auth confirms an allowed Organizer UID.
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

  const normalizeIncomingAppState = (incomingState: typeof appState) => {
    const normalizedPlayers = Array.isArray(incomingState?.players)
      ? incomingState.players.map((player, index) => {
          const normalizedSkill = normalizeSkillLevel(player?.skillLevel);

          const safeString = (value: unknown, fallback = ''): string => {
            if (typeof value === 'string') return value;
            if (value === null || value === undefined) return fallback;
            try {
              return String(value);
            } catch {
              return fallback;
            }
          };

          const nickname =
            safeString(player?.nickname).trim() ||
            safeString(player?.fullName).trim() ||
            `สมาชิก ${index + 1}`;

          const rawStatus = safeString(player?.status);
          const safeStatus: PlayerStatus =
            rawStatus === 'waiting' ||
            rawStatus === 'playing' ||
            rawStatus === 'resting' ||
            rawStatus === 'left'
              ? (rawStatus as PlayerStatus)
              : 'waiting';

          const rawRegistrationType = safeString(player?.registrationType);
          const safeRegistrationType: 'registered' | 'walkin' =
            rawRegistrationType === 'walkin' ? 'walkin' : 'registered';

          return {
            ...player,
            id: safeString(player?.id, `player-${index + 1}`),
            nickname,
            fullName: safeString(player?.fullName).trim() || undefined,
            phone: safeString(player?.phone).trim() || undefined,
            pin: safeString(player?.pin).trim() || undefined,
            avatarColor:
              safeString(player?.avatarColor).trim() ||
              'from-indigo-500 to-blue-600',
            registrationType: safeRegistrationType,
            status: safeStatus,
            isCheckedIn: Boolean(player?.isCheckedIn),
            skillLevel: normalizedSkill,
            skillScore:
              typeof player?.skillScore === 'number' && Number.isFinite(player.skillScore)
                ? player.skillScore
                : SKILL_LEVELS[normalizedSkill]?.score ?? SKILL_LEVELS.B.score,
            gamesPlayed:
              typeof player?.gamesPlayed === 'number' && Number.isFinite(player.gamesPlayed)
                ? player.gamesPlayed
                : 0,
            matchesPlayed:
              typeof player?.matchesPlayed === 'number' && Number.isFinite(player.matchesPlayed)
                ? player.matchesPlayed
                : 0,
          };
        })
      : [];

    return {
      ...incomingState,
      players: normalizedPlayers,
    };
  };

  const [currentTab, setCurrentTab] = useState<TabType>('prematch');
  
  // Never trust ?mode=organizer by itself.
  // Organizer mode is enabled only after Firebase Auth confirms an allowed Organizer UID.
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
  const [isMemberCenterOpen, setIsMemberCenterOpen] = useState<boolean>(false);

  // Modals
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [addPlayerDefaultType, setAddPlayerDefaultType] = useState<'registered' | 'walkin'>('registered');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemberPinModalOpen, setIsMemberPinModalOpen] = useState(false);
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

  // Member safety escape: close member overlays / Check-in page and return to Pre-Match.
  const handleCloseMemberScreen = () => {
    // The initial member gate is mandatory. Only a user who already has an
    // active member identity may cancel a "switch name" operation.
    if (currentMemberId) {
      setIsMemberGateOpen(false);
    }
    setIsSelfCheckInOpen(false);
    setIsAddPlayerOpen(false);
    setEditingPlayer(null);
    setCurrentTab('prematch');
  };

  useEffect(() => {
    const handleEscapeKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isOrganizerMode) return;

      // Do not allow ESC to bypass the first member-identification gate.
      if (isMemberGateOpen && !currentMemberId) return;

      handleCloseMemberScreen();
    };

    window.addEventListener('keydown', handleEscapeKey);
    return () => window.removeEventListener('keydown', handleEscapeKey);
  }, [isOrganizerMode, isMemberGateOpen, currentMemberId]);

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

      setIsOrganizerMode(isOrganizerUid(user.uid) && !forceMemberMode);
    });

    return () => unsubscribeAuth();
  }, []);

  const handleExitOrganizerMode = async () => {
    setIsOrganizerMode(false);

    if (currentTab === 'courts' || currentTab === 'finance') {
      setCurrentTab('prematch');
    }

    if (isOrganizerUid(auth.currentUser?.uid)) {
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

        // Firestore may still contain legacy skill values such as S / S- / S+.
        // Normalize before rendering any view so Member/Check-in pages cannot crash.
        const normalizedRemoteState = normalizeIncomingAppState(remoteState);
        saveAppState(normalizedRemoteState); // LocalStorage remains an offline/local backup.
        setAppState(normalizedRemoteState);
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
  const deletedMembers: DeletedMemberRecord[] = getDeletedMembers(appState as any);
  const memberStats: MemberLifetimeStatsMap = getMemberStatsMap(appState as any);
  const promotionRules: PromotionRule[] = getPromotionRules(appState as any);
  const promotionRedemptions: PromotionRedemption[] = getPromotionRedemptions(appState as any);
  const shuttlePurchases: ShuttlePurchase[] = getShuttlePurchases(appState as any);
  const shuttleUsageLedger: ShuttleUsageRecord[] = getShuttleUsageLedger(appState as any);
  const shuttleStockAdjustments: ShuttleStockAdjustment[] =
    getShuttleStockAdjustments(appState as any);
  const shuttleLowStockThreshold = Math.max(
    0,
    Number((appState as any).shuttleLowStockThreshold ?? 12)
  );
  const shuttleInventorySummary = getShuttleInventorySummary(
    shuttlePurchases,
    shuttleUsageLedger,
    sessionConfig.shuttlecockPrice,
    shuttleStockAdjustments
  );
  const isShuttleStockLow =
    shuttlePurchases.length > 0 &&
    shuttleInventorySummary.stockQuantity <= shuttleLowStockThreshold;
  const shuttleTargetStock = Math.max(
    0,
    Number((appState as any).shuttleTargetStock ?? 36)
  );
  const shuttleDefaultPiecesPerTube = Math.max(
    1,
    Number((appState as any).shuttleDefaultPiecesPerTube ?? 12)
  );

  // Daily billing source of truth:
  // gamesPlayed / matchesPlayed must reflect FINISHED matches in current matchHistory only.
  // This prevents a fresh Check-in from inheriting old Match counts from a previous day.
  useEffect(() => {
    setAppState((prev) => {
      const statsMap = getMemberStatsMap(prev as any);
      let changed = false;

      const nextPlayers = prev.players.map((player) => {
        const completedMatches = getCurrentSessionCompletedMatchCount(
          player,
          statsMap,
          prev.matchHistory
        );
        const completedGames = completedMatches * 2;

        if (
          (player.matchesPlayed || 0) === completedMatches &&
          (player.gamesPlayed || 0) === completedGames
        ) {
          return player;
        }

        changed = true;
        return {
          ...player,
          matchesPlayed: completedMatches,
          gamesPlayed: completedGames,
        };
      });

      return changed ? { ...prev, players: nextPlayers } : prev;
    });
  }, [matchHistory]);

  // Active playing player IDs & waiting count
  const playingPlayerIds = new Set(activeMatches.flatMap((m) => [...m.teamA, ...m.teamB]));
  const waitingCount = players.filter(
    (p) => p.isCheckedIn && !playingPlayerIds.has(p.id) && p.status === 'waiting'
  ).length;

  // --- Handlers: Check-in & Players ---
  const handleCheckInPlayer = (playerId: string, pin?: string) => {
    setAppState((prev) => {
      const statsMap: MemberLifetimeStatsMap = { ...getMemberStatsMap(prev as any) };
      const sessionDate = prev.sessionConfig.date;

      const updatedPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          const now = new Date();
          const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now
            .getMinutes()
            .toString()
            .padStart(2, '0')}`;

          const s = ensureMemberStats(statsMap, p, sessionDate);
          const isFirstCheckInThisSession = s.lastAttendanceDate !== sessionDate;

          statsMap[p.id] = {
            ...s,
            totalSessions: isFirstCheckInThisSession
              ? s.totalSessions + 1
              : s.totalSessions,
            lastAttendanceDate: sessionDate,
            updatedAt: Date.now(),
          };

          return {
            ...p,
            isCheckedIn: true,
            checkInTime: timeStr,
            checkInTimestamp: Date.now(),
            status: ('waiting' as PlayerStatus),
            // Fresh session check-in starts with court fee only.
            // Re-check-in on the same day keeps already completed matches.
            gamesPlayed: isFirstCheckInThisSession ? 0 : (p.gamesPlayed || 0),
            matchesPlayed: isFirstCheckInThisSession ? 0 : (p.matchesPlayed || 0),
            extraShuttlecocks: isFirstCheckInThisSession
              ? 0
              : (p.extraShuttlecocks || 0),
            paid: isFirstCheckInThisSession ? false : p.paid,
            paidAmount: isFirstCheckInThisSession ? undefined : p.paidAmount,
            paymentTime: isFirstCheckInThisSession ? undefined : p.paymentTime,
            pin: pin || p.pin,
          };
        }
        return p;
      });
      return { ...prev, players: updatedPlayers, memberLifetimeStats: statsMap } as any;
    });
    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });

    if (!isOrganizerMode && currentMemberId === playerId) {
      setIsSelfCheckInOpen(false);
      setIsMemberGateOpen(false);
      setCurrentTab('prematch');
    }
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

    if (!isOrganizerMode && currentMemberId === playerId) {
      setIsSelfCheckInOpen(false);
      setIsMemberGateOpen(false);
      setCurrentTab('prematch');
    }
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
      matchesPlayed: 0,
      paid: false,
    };

    setAppState((prev) => {
      const statsMap: MemberLifetimeStatsMap = { ...getMemberStatsMap(prev as any) };
      const s = ensureMemberStats(statsMap, newPlayer, prev.sessionConfig.date);
      statsMap[newPlayer.id] = {
        ...s,
        totalSessions: newPlayer.isCheckedIn ? Math.max(1, s.totalSessions) : 0,
        lastAttendanceDate: newPlayer.isCheckedIn ? prev.sessionConfig.date : s.lastAttendanceDate,
        updatedAt: Date.now(),
      };
      return { ...prev, players: [...prev.players, newPlayer], memberLifetimeStats: statsMap } as any;
    });

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
      matchesPlayed: 0,
      paid: false,
      avatarColor: registrationType === 'walkin' ? 'from-amber-500 to-orange-600' : 'from-emerald-500 to-teal-600',
    };

    setAppState((prev) => {
      const statsMap: MemberLifetimeStatsMap = { ...getMemberStatsMap(prev as any) };
      statsMap[newPlayer.id] = {
        ...ensureMemberStats(statsMap, newPlayer, prev.sessionConfig.date),
        totalSessions: 1,
        lastAttendanceDate: prev.sessionConfig.date,
        updatedAt: Date.now(),
      };
      return { ...prev, players: [...prev.players, newPlayer], memberLifetimeStats: statsMap } as any;
    });

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
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    if (activeMatches.some((m) => [...m.teamA, ...m.teamB].includes(playerId))) {
      window.alert(`ยังลบ ${target.nickname} ไม่ได้ เพราะกำลังเล่นอยู่ในสนาม`);
      return;
    }

    if (!window.confirm(`ย้าย "${target.nickname}" ไปถังขยะหรือไม่?\nข้อมูลและสถิติยัง Restore กลับได้`)) return;

    setAppState((prev) => {
      const player = prev.players.find((p) => p.id === playerId);
      if (!player) return prev;

      const trash = getDeletedMembers(prev as any);
      const record: DeletedMemberRecord = {
        id: `deleted-${playerId}-${Date.now()}`,
        playerId,
        player: { ...player },
        deletedAt: Date.now(),
        deletedBy: auth.currentUser?.uid || 'organizer',
        sessionDate: prev.sessionConfig.date,
      };

      const clearPre = (pm: ConfirmedPreMatch | null | undefined) =>
        pm && [...pm.teamA, ...pm.teamB].includes(playerId) ? null : pm;

      return {
        ...prev,
        players: prev.players.filter((p) => p.id !== playerId),
        confirmedPreMatch: clearPre(prev.confirmedPreMatch),
        confirmedPreMatch2: clearPre(prev.confirmedPreMatch2),
        deletedMembers: [record, ...trash.filter((x) => x.playerId !== playerId)],
      } as any;
    });

    if (currentMemberId === playerId) {
      setCurrentMemberId('');
      localStorage.removeItem('badminton_active_member_id');
    }
  };

  const handleRestoreDeletedMember = (deletedId: string) => {
    setAppState((prev) => {
      const trash = getDeletedMembers(prev as any);
      const record = trash.find((x) => x.id === deletedId);
      if (!record) return prev;
      if (prev.players.some((p) => p.id === record.playerId)) {
        window.alert('Member ID นี้มีอยู่ในรายชื่อแล้ว');
        return prev;
      }

      const sameDay = record.sessionDate === prev.sessionConfig.date;
      const restored: Player = sameDay
        ? { ...record.player }
        : {
            ...record.player,
            isCheckedIn: false,
            checkInTime: undefined,
            checkInTimestamp: undefined,
            lastMatchFinishTime: undefined,
            status: 'waiting' as PlayerStatus,
            gamesPlayed: 0,
            matchesPlayed: 0,
            extraShuttlecocks: 0,
            paid: false,
            paidAmount: undefined,
            paymentMethod: undefined,
            paymentTime: undefined,
          };

      return {
        ...prev,
        players: [...prev.players, restored],
        deletedMembers: trash.filter((x) => x.id !== deletedId),
      } as any;
    });
    confetti({ particleCount: 40, spread: 60, origin: { y: 0.6 } });
  };

  const handlePermanentDeleteMember = (deletedId: string) => {
    const record = deletedMembers.find((x) => x.id === deletedId);
    if (!record) return;
    if (!window.confirm(`ลบ "${record.player.nickname}" แบบถาวร รวม Lifetime Stats หรือไม่?`)) return;

    setAppState((prev) => {
      const stats = { ...getMemberStatsMap(prev as any) };
      delete stats[record.playerId];
      return {
        ...prev,
        deletedMembers: getDeletedMembers(prev as any).filter((x) => x.id !== deletedId),
        memberLifetimeStats: stats,
      } as any;
    });
  };

  const handleUpdateMemberBirthday = (playerId: string, birthday: string) => {
    setAppState((prev) => {
      const player = prev.players.find((p) => p.id === playerId);
      if (!player) return prev;
      const stats = { ...getMemberStatsMap(prev as any) };
      stats[playerId] = {
        ...ensureMemberStats(stats, player, prev.sessionConfig.date),
        birthday: birthday || undefined,
        updatedAt: Date.now(),
      };
      return { ...prev, memberLifetimeStats: stats } as any;
    });
  };

  const handleRedeemFreeGameReward = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const current = ensureMemberStats(memberStats, player, sessionConfig.date);
    if (getAvailableFreeGameRewards(current) <= 0) {
      window.alert('ยังไม่มีสิทธิ์ Free Game ที่พร้อมใช้');
      return;
    }
    if (!window.confirm(`ใช้สิทธิ์ Free Game 1 ครั้งให้ ${player.nickname} หรือไม่?`)) return;

    setAppState((prev) => {
      const p = prev.players.find((x) => x.id === playerId);
      if (!p) return prev;
      const stats = { ...getMemberStatsMap(prev as any) };
      const s = ensureMemberStats(stats, p, prev.sessionConfig.date);
      if (getAvailableFreeGameRewards(s) <= 0) return prev;
      stats[playerId] = { ...s, freeGameRewardsRedeemed: s.freeGameRewardsRedeemed + 1, updatedAt: Date.now() };
      return { ...prev, memberLifetimeStats: stats } as any;
    });
  };

  const handleRedeemBirthdayReward = (playerId: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    const current = ensureMemberStats(memberStats, player, sessionConfig.date);
    if (!isBirthdayCourtRewardAvailable(current, sessionConfig.date)) {
      window.alert('ยังไม่มีสิทธิ์ Birthday Promo ที่พร้อมใช้');
      return;
    }
    if (!window.confirm(`ใช้สิทธิ์ Birthday Promo ฟรีค่าคอร์ทให้ ${player.nickname} หรือไม่?`)) return;

    setAppState((prev) => {
      const p = prev.players.find((x) => x.id === playerId);
      if (!p) return prev;
      const stats = { ...getMemberStatsMap(prev as any) };
      const s = ensureMemberStats(stats, p, prev.sessionConfig.date);
      const year = getSessionYear(prev.sessionConfig.date);
      stats[playerId] = {
        ...s,
        birthdayCourtRewardsRedeemedYears: Array.from(new Set([...s.birthdayCourtRewardsRedeemedYears, year])),
        updatedAt: Date.now(),
      };
      return { ...prev, memberLifetimeStats: stats } as any;
    });
  };

  const handleSavePromotionRule = (rule: PromotionRule) => {
    setAppState((prev) => {
      const current = getPromotionRules(prev as any);
      const exists = current.some((x) => x.id === rule.id);

      const nextRule: PromotionRule = {
        ...rule,
        conditionValue: Math.max(1, Number(rule.conditionValue || 1)),
        rewardValue: Math.max(0, Number(rule.rewardValue || 0)),
        createdAt: rule.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      return {
        ...prev,
        promotionRules: exists
          ? current.map((x) => (x.id === rule.id ? nextRule : x))
          : [...current, nextRule],
      } as any;
    });
  };

  const handleDeletePromotionRule = (promotionId: string) => {
    if (!window.confirm('ลบโปรโมชั่นนี้หรือไม่? ประวัติการใช้สิทธิ์เดิมจะยังเก็บไว้')) {
      return;
    }

    setAppState((prev) => ({
      ...prev,
      promotionRules: getPromotionRules(prev as any).filter(
        (x) => x.id !== promotionId
      ),
    } as any));
  };

  const handleRedeemCustomPromotion = (
    playerId: string,
    promotionId: string
  ) => {
    const player = players.find((p) => p.id === playerId);
    const rule = promotionRules.find((x) => x.id === promotionId);

    if (!player || !rule) return;

    // Promotion is applied to the current session bill.
    // Payment itself still requires Checkout first.
    const available = getPromotionAvailableCredits(
      rule,
      player,
      memberStats,
      promotionRedemptions,
      sessionConfig.date
    );

    if (available <= 0) {
      window.alert('โปรโมชั่นนี้ยังไม่พร้อมใช้สำหรับสมาชิกคนนี้');
      return;
    }

    const discountAmount = calculatePromotionDiscount(
      rule,
      player,
      sessionConfig
    );

    if (
      !window.confirm(
        `ใช้โปรโมชั่น "${rule.name}" ให้ ${player.nickname} หรือไม่?\nส่วนลดรอบนี้: ${discountAmount.toFixed(0)} บาท`
      )
    ) {
      return;
    }

    const redemption: PromotionRedemption = {
      id: `redeem-${promotionId}-${playerId}-${Date.now()}`,
      promotionId,
      playerId,
      sessionDate: sessionConfig.date,
      redeemedAt: Date.now(),
      discountAmount,
      note: rule.name,
    };

    setAppState((prev) => ({
      ...prev,
      promotionRedemptions: [
        redemption,
        ...getPromotionRedemptions(prev as any),
      ],
    } as any));

    confetti({ particleCount: 45, spread: 65, origin: { y: 0.6 } });
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

  const handleAddShuttlePurchase = (purchase: ShuttlePurchase) => {
    setAppState((prev) => {
      const currentPurchases = getShuttlePurchases(prev as any);
      const usages = getShuttleUsageLedger(prev as any);
      const adjustments = getShuttleStockAdjustments(prev as any);

      const nextPurchases = [
        purchase,
        ...currentPurchases.filter((item) => item.id !== purchase.id),
      ];

      const sessionUsage = getSessionShuttleUsageSummary(
        usages,
        prev.sessionConfig.date,
        prev.sessionConfig.shuttlecocksUsedTotal,
        prev.sessionConfig.shuttlecockPrice
      );

      const inventory = getShuttleInventorySummary(
        nextPurchases,
        usages,
        prev.sessionConfig.shuttlecockPrice,
        adjustments
      );

      return {
        ...prev,
        shuttlePurchases: nextPurchases,
        sessionConfig: {
          ...prev.sessionConfig,
          // Before any shuttle is used today, show current weighted stock cost
          // as the reference cost. Once play starts, this field represents the
          // weighted average ACTUAL cost consumed in today's session.
          shuttlecockPrice:
            sessionUsage.quantity > 0
              ? sessionUsage.averageUnitCost
              : inventory.averageUnitCost || prev.sessionConfig.shuttlecockPrice,
        },
      } as any;
    });
  };

  const handleDeleteShuttlePurchase = (purchaseId: string): boolean => {
    const target = shuttlePurchases.find((item) => item.id === purchaseId);
    if (!target) return false;

    const remainingPurchases = shuttlePurchases.filter(
      (item) => item.id !== purchaseId
    );
    const hypotheticalInventory = getShuttleInventorySummary(
      remainingPurchases,
      shuttleUsageLedger,
      sessionConfig.shuttlecockPrice,
      shuttleStockAdjustments
    );

    if (hypotheticalInventory.stockQuantity < 0) {
      window.alert(
        `ลบรายการนี้ไม่ได้ เพราะจะทำให้ Stock ติดลบ\n\nStock หลังลบ: ${hypotheticalInventory.stockQuantity} ลูก`
      );
      return false;
    }

    if (
      !window.confirm(
        `ลบรายการ Stock "${target.brand || ''} ${target.model || ''}" จำนวน ${target.quantity} ลูก หรือไม่?`
      )
    ) {
      return false;
    }

    setAppState((prev) => {
      const nextPurchases = getShuttlePurchases(prev as any).filter(
        (item) => item.id !== purchaseId
      );
      const usages = getShuttleUsageLedger(prev as any);
      const inventory = getShuttleInventorySummary(
        nextPurchases,
        usages,
        prev.sessionConfig.shuttlecockPrice
      );
      const sessionUsage = getSessionShuttleUsageSummary(
        usages,
        prev.sessionConfig.date,
        prev.sessionConfig.shuttlecocksUsedTotal,
        prev.sessionConfig.shuttlecockPrice
      );

      return {
        ...prev,
        shuttlePurchases: nextPurchases,
        sessionConfig: {
          ...prev.sessionConfig,
          shuttlecockPrice:
            sessionUsage.quantity > 0
              ? sessionUsage.averageUnitCost
              : inventory.averageUnitCost || prev.sessionConfig.shuttlecockPrice,
        },
      } as any;
    });

    return true;
  };

  const handleSetShuttleLowStockThreshold = (value: number) => {
    const threshold = Math.max(0, Math.floor(Number(value || 0)));
    setAppState((prev) => ({
      ...prev,
      shuttleLowStockThreshold: threshold,
    } as any));
  };

  const handleSetShuttleReorderSettings = (
    targetStock: number,
    piecesPerTube: number
  ) => {
    const safeTarget = Math.max(0, Math.floor(Number(targetStock || 0)));
    const safePieces = Math.max(1, Math.floor(Number(piecesPerTube || 12)));

    setAppState((prev) => ({
      ...prev,
      shuttleTargetStock: safeTarget,
      shuttleDefaultPiecesPerTube: safePieces,
    } as any));
  };

  const handleStocktakeShuttles = (
    actualCount: number,
    reason: ShuttleStockAdjustment['reason'],
    note?: string
  ): boolean => {
    const actual = Math.max(0, Math.floor(Number(actualCount || 0)));
    const current = shuttleInventorySummary.stockQuantity;
    const delta = actual - current;

    if (delta === 0) {
      window.alert('จำนวน Stock จริงตรงกับในระบบแล้ว ไม่ต้องปรับยอด');
      return false;
    }

    const unitCost = Math.max(
      0,
      Number(
        shuttleInventorySummary.averageUnitCost ||
          sessionConfig.shuttlecockPrice ||
          0
      )
    );

    const adjustment: ShuttleStockAdjustment = {
      id: `stock-adjust-${Date.now()}`,
      date: sessionConfig.date,
      actualCount: actual,
      previousSystemCount: current,
      quantityDelta: delta,
      unitCost,
      valueDelta: delta * unitCost,
      reason,
      note: note?.trim() || undefined,
      createdAt: Date.now(),
    };

    setAppState((prev) => ({
      ...prev,
      shuttleStockAdjustments: [
        adjustment,
        ...getShuttleStockAdjustments(prev as any),
      ],
    } as any));

    return true;
  };

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

    setAppState((prev) => {
      const stats = { ...getMemberStatsMap(prev as any) };
      const purchases = getShuttlePurchases(prev as any);
      const existingUsages = getShuttleUsageLedger(prev as any);

      const usageUnitCost = getCurrentShuttleAverageCost(
        purchases,
        existingUsages,
        prev.sessionConfig.shuttlecockPrice,
        getShuttleStockAdjustments(prev as any)
      );

      const newUsage: ShuttleUsageRecord | null =
        shuttlecocksCount > 0
          ? {
              id: `usage-${historyItem.id}`,
              historyId: historyItem.id,
              sessionDate: prev.sessionConfig.date,
              courtName: targetMatch.courtName,
              quantity: shuttlecocksCount,
              unitCost: usageUnitCost,
              totalCost: shuttlecocksCount * usageUnitCost,
              memberCount: allPlayerIds.size,
              memberRatePerMatch:
                prev.sessionConfig.shuttlecockFeePerMatchPerPerson,
              baseMemberRevenue:
                allPlayerIds.size *
                Number(
                  prev.sessionConfig.shuttlecockFeePerMatchPerPerson || 0
                ),
              createdAt: Date.now(),
            }
          : null;

      const nextUsages = newUsage
        ? [
            newUsage,
            ...existingUsages.filter(
              (item) => item.historyId !== historyItem.id
            ),
          ]
        : existingUsages;

      const nextSessionUsedTotal =
        prev.sessionConfig.shuttlecocksUsedTotal + shuttlecocksCount;

      const sessionUsageCost = getSessionShuttleUsageSummary(
        nextUsages,
        prev.sessionConfig.date,
        nextSessionUsedTotal,
        usageUnitCost || prev.sessionConfig.shuttlecockPrice
      );

      prev.players.forEach((p) => {
        if (!allPlayerIds.has(p.id)) return;
        const s = ensureMemberStats(stats, p, prev.sessionConfig.date);
        if (s.processedHistoryIds.includes(historyItem.id)) return;
        stats[p.id] = {
          ...s,
          totalGames: s.totalGames + 2,
          totalMatches: s.totalMatches + 1,
          processedHistoryIds: [...s.processedHistoryIds, historyItem.id].slice(-500),
          updatedAt: Date.now(),
        };
      });

      return {
        ...prev,
        activeMatches: prev.activeMatches.filter((m) => m.id !== matchId),
        matchHistory: [historyItem, ...prev.matchHistory],
        memberLifetimeStats: stats,
        shuttleUsageLedger: nextUsages,
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
        sessionConfig: {
          ...prev.sessionConfig,
          shuttlecocksUsedTotal: nextSessionUsedTotal,
          // Keep compatibility with Archive/older Finance code:
          // price = weighted average ACTUAL cost of shuttles consumed today.
          shuttlecockPrice:
            sessionUsageCost.quantity > 0
              ? sessionUsageCost.averageUnitCost
              : prev.sessionConfig.shuttlecockPrice,
        },
      } as any;
    });

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
    // A currently-playing member may be RESERVED in Pre-Match,
    // but the Pre-Match cannot start until every selected player is off court.
    const selectedIds = new Set([...preMatch.teamA, ...preMatch.teamB]);
    const stillPlaying = activeMatches
      .flatMap((m) => [...m.teamA, ...m.teamB])
      .filter((id) => selectedIds.has(id));

    if (stillPlaying.length > 0) {
      console.warn(
        'Cannot start confirmed pre-match yet: selected player(s) are still playing.',
        stillPlaying
      );
      return;
    }

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
  const handleTogglePlayerPayment = (
    playerId: string,
    paid: boolean,
    amount?: number,
    newPin?: string
  ) => {
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    // Payment is allowed only AFTER checkout.
    if (paid && target.isCheckedIn) {
      window.alert(
        `กรุณา Check-out "${target.nickname}" ก่อนชำระเงิน\n\nระบบจะล็อกยอดหลัง Check-out เพื่อป้องกันยอดเปลี่ยนระหว่างเล่น`
      );
      return;
    }

    const finalCharge = calculatePlayerFinalCharge(
      target,
      sessionConfig,
      promotionRedemptions,
      sessionConfig.date
    );

    // If BillingView provides an amount (e.g. correction/partial flow), keep it.
    // Otherwise use our canonical match-based formula.
    const safeAmount =
      paid
        ? typeof amount === 'number' && Number.isFinite(amount)
          ? Math.max(0, amount)
          : finalCharge.finalTotal
        : undefined;

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              paid,
              paidAmount: safeAmount,
              paymentTime: paid
                ? new Date().toLocaleTimeString('th-TH', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : undefined,
              pin:
                newPin && newPin.trim().length === 4
                  ? newPin.trim()
                  : p.pin,
            }
          : p
      ),
    }));
  };

  const handleMarkAllCheckedInPaid = () => {
    // Legacy function name kept for BillingView compatibility.
    // New rule: only CHECKED-OUT members may be paid.
    const eligible = appState.players.filter(
      (p) => !p.isCheckedIn && !p.paid
    );

    if (eligible.length === 0) {
      window.alert('ยังไม่มีสมาชิกที่ Check-out และรอชำระเงิน');
      return;
    }

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.isCheckedIn || p.paid) return p;

        const finalCharge = calculatePlayerFinalCharge(
          p,
          prev.sessionConfig,
          getPromotionRedemptions(prev as any),
          prev.sessionConfig.date
        );

        return {
          ...p,
          paid: true,
          paidAmount: finalCharge.finalTotal,
          paymentTime: new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
      }),
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

  const handleChangeOwnMemberPin = (playerId: string, newPin: string) => {
    const safePin = newPin.trim();

    if (!/^\d{4}$/.test(safePin)) {
      window.alert('PIN ต้องเป็นตัวเลข 4 หลัก');
      return;
    }

    // Members may only change the PIN of the currently active member identity.
    if (isOrganizerMode || !currentMemberId || playerId !== currentMemberId) {
      window.alert('ไม่สามารถเปลี่ยน PIN ของสมาชิกคนอื่นได้');
      return;
    }

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              pin: safePin,
            }
          : p
      ),
    }));
  };

  const handleOrganizerResetMemberPin = (
    playerId: string,
    newPin: string
  ) => {
    if (!isOrganizerMode) {
      window.alert('เฉพาะ Organizer เท่านั้นที่ Reset PIN สมาชิกได้');
      return;
    }

    const safePin = newPin.trim();
    if (!/^\d{4}$/.test(safePin)) {
      window.alert('PIN ต้องเป็นตัวเลข 4 หลัก');
      return;
    }

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) =>
        p.id === playerId
          ? {
              ...p,
              pin: safePin,
            }
          : p
      ),
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
      {!isOrganizerMode &&
        (currentTab === 'checkin' || isSelfCheckInOpen) && (
          <button
            type="button"
            onClick={handleCloseMemberScreen}
            className="fixed top-3 right-3 z-[2147483647] inline-flex items-center gap-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border-2 border-rose-500/70 px-3.5 py-2.5 text-xs font-extrabold text-white shadow-2xl"
            title="ปิดหน้าต่างนี้และกลับไปหน้า Pre-Match"
          >
            <span className="text-rose-400 text-lg leading-none">✕</span>
            <span>ปิด / กลับหน้าคิว</span>
          </button>
        )}

      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        sessionConfig={sessionConfig}
        totalPlayers={players.length}
        checkedInCount={checkedInCount}
        activeMatchesCount={activeMatches.length}
        waitingCount={isOrganizerMode ? waitingCount : 0}
        isOrganizerMode={isOrganizerMode}
        onToggleOrganizerMode={handleToggleOrganizerMode}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onResetSession={handleResetSession}
        onShareMemberLink={handleShareMemberLink}
        copiedShareLink={copiedShareLink}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Organizer low-stock alert */}
        {isOrganizerMode && isShuttleStockLow && (
          <div className="mb-4 rounded-2xl border border-rose-700/60 bg-gradient-to-r from-rose-950/70 to-amber-950/40 p-4 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-xl shrink-0">
                🪶
              </div>
              <div>
                <div className="font-black text-rose-300 text-sm">
                  Shuttle Stock ใกล้หมด
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  เหลือ {shuttleInventorySummary.stockQuantity} ลูก • จุดเตือน {shuttleLowStockThreshold} ลูก
                  {shuttleInventorySummary.averageUnitCost > 0
                    ? ` • ต้นทุนเฉลี่ย ${shuttleInventorySummary.averageUnitCost.toFixed(2)}฿/ลูก`
                    : ''}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCurrentTab('finance')}
              className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black shrink-0"
            >
              ไป Finance / Shuttle Stock
            </button>
          </div>
        )}

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
            // "สลับชื่อ" must be cancelable.
            // Keep the current member active until a NEW member passes verification.
            // If the user closes the picker, the old member session remains unchanged.
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
            isOrganizerMode && currentMemberId
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

        {!isOrganizerMode && currentMemberId && (
          <div className="mb-4 flex justify-end">
            <button
              type="button"
              onClick={() => setIsMemberPinModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-950/45 hover:bg-cyan-900/55 border border-cyan-700/45 text-cyan-300 text-xs font-black transition"
              title="เปลี่ยน PIN ส่วนตัว"
            >
              <span>🔐</span>
              <span>เปลี่ยน PIN ของฉัน</span>
            </button>
          </div>
        )}

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
          <SectionErrorBoundary
            title="สมาชิก"
            onBack={() => setCurrentTab('prematch')}
          >
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
              onOpenMemberCenter={() => setIsMemberCenterOpen(true)}
            />
          </SectionErrorBoundary>
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
            promotionRedemptions={promotionRedemptions}
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
            promotionRedemptions={promotionRedemptions}
            shuttlePurchases={shuttlePurchases}
            shuttleUsageLedger={shuttleUsageLedger}
            onAddShuttlePurchase={handleAddShuttlePurchase}
            onDeleteShuttlePurchase={handleDeleteShuttlePurchase}
            shuttleLowStockThreshold={shuttleLowStockThreshold}
            onSetShuttleLowStockThreshold={handleSetShuttleLowStockThreshold}
            shuttleStockAdjustments={shuttleStockAdjustments}
            shuttleTargetStock={shuttleTargetStock}
            shuttleDefaultPiecesPerTube={shuttleDefaultPiecesPerTube}
            onSetShuttleReorderSettings={handleSetShuttleReorderSettings}
            onStocktakeShuttles={handleStocktakeShuttles}
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
      <MemberPinModal
        isOpen={isMemberPinModalOpen}
        player={
          currentMemberId
            ? players.find((p) => p.id === currentMemberId) || null
            : null
        }
        onClose={() => setIsMemberPinModalOpen(false)}
        onSavePin={handleChangeOwnMemberPin}
      />

      <MemberCenterModal
        isOpen={isMemberCenterOpen}
        onClose={() => setIsMemberCenterOpen(false)}
        players={players}
        deletedMembers={deletedMembers}
        memberStats={memberStats}
        sessionDate={sessionConfig.date}
        sessionConfig={sessionConfig}
        promotionRules={promotionRules}
        promotionRedemptions={promotionRedemptions}
        onRestoreMember={handleRestoreDeletedMember}
        onPermanentDeleteMember={handlePermanentDeleteMember}
        onUpdateBirthday={handleUpdateMemberBirthday}
        onSavePromotionRule={handleSavePromotionRule}
        onDeletePromotionRule={handleDeletePromotionRule}
        onRedeemPromotion={handleRedeemCustomPromotion}
        onResetMemberPin={handleOrganizerResetMemberPin}
      />

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
          setAppState((prev) => ({
            ...newState,
            // Enforce a clean daily session even if an older archive component
            // does not know about matchesPlayed yet.
            players: newState.players.map((player) => ({
              ...player,
              isCheckedIn: false,
              checkInTime: undefined,
              checkInTimestamp: undefined,
              lastMatchFinishTime: undefined,
              status: 'waiting' as PlayerStatus,
              gamesPlayed: 0,
              matchesPlayed: 0,
              extraShuttlecocks: 0,
              paid: false,
              paidAmount: undefined,
              paymentTime: undefined,
              paymentMethod: undefined,
            })),
            activeMatches: [],
            matchHistory: [],
            confirmedPreMatch: null,
            confirmedPreMatch2: null,
            memberLifetimeStats: getMemberStatsMap(prev as any),
            deletedMembers: getDeletedMembers(prev as any),
            promotionRules: getPromotionRules(prev as any),
            promotionRedemptions: getPromotionRedemptions(prev as any),
            shuttlePurchases: getShuttlePurchases(prev as any),
            shuttleUsageLedger: getShuttleUsageLedger(prev as any),
            shuttleLowStockThreshold: Math.max(
              0,
              Number((prev as any).shuttleLowStockThreshold ?? 12)
            ),
            shuttleStockAdjustments: getShuttleStockAdjustments(prev as any),
            shuttleTargetStock: Math.max(
              0,
              Number((prev as any).shuttleTargetStock ?? 36)
            ),
            shuttleDefaultPiecesPerTube: Math.max(
              1,
              Number((prev as any).shuttleDefaultPiecesPerTube ?? 12)
            ),
          } as any));
          setIsArchiveModalOpen(false);
        }}
      />

      {/* Member Gate & Direct URL Access Restriction Gate */}
      <SectionErrorBoundary
        key={`member-gate-${isMemberGateOpen}-${currentMemberId || 'initial'}`}
        title="สลับชื่อสมาชิก"
        onBack={() => {
          if (currentMemberId) {
            setIsMemberGateOpen(false);
            setCurrentTab('prematch');
          } else if (typeof window !== 'undefined') {
            window.location.reload();
          }
        }}
      >
      <MemberGateModal
        isOpen={isMemberGateOpen && !isOrganizerMode}
        players={players}
        organizerPin={sessionConfig.organizerPin || '1234'}
        onClose={
          currentMemberId
            ? () => setIsMemberGateOpen(false)
            : undefined
        }
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
      </SectionErrorBoundary>
    </div>
  );
}

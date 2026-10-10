import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import {
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';
import { auth, isOrganizerUid } from './firebase';
import { Header } from './components/Header';
import { PreMatchView } from './components/PreMatchView';
import { CheckInView } from './components/CheckInView';
import { SkillAssessmentView } from './components/SkillAssessmentView';
import { CourtsView } from './components/CourtsView';
import { SessionCourtsPanel } from './components/SessionCourtsPanel'; // DYNAMIC_SESSION_COURTS_V63A
import { PreMatchManagerV64, OrganizerWaitingQueueV64 } from './components/PreMatchManagerV64'; // PREMATCH_3_FIFO_V64
import { BillingView } from './components/BillingView';
import { PlayerModal } from './components/PlayerModal';
import { SessionSettingsModal } from './components/SessionSettingsModal';
import { SelfCheckInModal } from './components/SelfCheckInModal';
import { OrganizerPinModal } from './components/OrganizerPinModal';
import { DailyArchiveModal } from './components/DailyArchiveModal';
import { deleteSessionPaymentTransactions } from './payment/paymentTransactions'; // DISCARD_SESSION_NO_ARCHIVE_V72B
import { FinancialStatsView } from './components/FinancialStatsView';
import { ShuttleStockWorkspaceV78 } from './components/ShuttleStockWorkspaceV78'; // SHUTTLE_STOCK_REPORT_SEPARATION_V78
import { ShuttleLedgerHistoryV76 } from './components/ShuttleLedgerHistoryV76'; // DAILY_SHUTTLE_USAGE_SUMMARY_V76
import { MonthlyShuttleReportV76 } from './components/MonthlyShuttleReportV76'; // MONTHLY_SHUTTLE_REPORT_FIXED_V76
import { MemberAccessBar } from './components/MemberAccessBar';
import { MemberPlayNotification } from './components/MemberPlayNotification';

import { MemberGateModal } from './components/MemberGateModal';
import { MemberCenterModal } from './components/MemberCenterModal';
import { MemberHistoryModal } from './components/MemberHistoryModal'; // MEMBER_HISTORY_V65
import { MemberPinModal } from './components/MemberPinModal';
import { MemberCostExportToolV68D } from './components/MemberCostExportToolV68D'; // MEMBER_COST_EXPORT_TOOL_V68D
import { DataStatsManagerV66 } from './components/DataStatsManagerV66'; // DATA_STATS_REPAIR_V66


import { OrganizerGlobalAlertCenter } from './components/OrganizerGlobalAlertCenter'; // GLOBAL_ORGANIZER_ALERT_V52C
import { MatchHistoryExportView } from './components/MatchHistoryExportView'; // MATCH_HISTORY_EXPORT_V51
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
import { createNewDaySessionState } from './utils/storage'; // DISCARD_SESSION_NO_ARCHIVE_V72B
import {
  saveCurrentSessionToFirestore,
  saveCurrentSessionMergedToFirestore,
  subscribeToCurrentSessionFromFirestore,
  mergeLocalChanges,
  areFirestoreStatesEqual,
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

  // GUANGUAN_MEMBER_SESSION_V24B
  // Remove legacy persistent member identity from older versions.
  useEffect(() => {
    try {
      localStorage.removeItem('badminton_active_member_id');
    } catch {
      // Ignore storage access errors.
    }
  }, []);

  const [appState, setAppState] = useState(() => loadAppState());

  // Firebase Authentication
  // Members use anonymous auth automatically.
  // Organizer mode is granted only after Firebase Auth confirms an allowed Organizer UID.
  const [authReady, setAuthReady] = useState(false);
  const [authUserUid, setAuthUserUid] = useState('');
  const anonymousSignInInProgressRef = useRef(false);

  // Firestore realtime sync status
  const [syncStatus, setSyncStatus] = useState<'connecting' | 'saving' | 'synced' | 'error'>('connecting');

  // Network status for PWA / Tablet offline mode.
  // navigator.onLine is used only for UI + retry control; LocalStorage remains
  // the immediate backup source while the device has no Internet.
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine
  );

  const [archiveRevision, setArchiveRevision] = useState(0);
  const [fundRevision, setFundRevision] = useState(0);
  const firestoreReadyRef = useRef(false);
  const applyingRemoteStateRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);
  const appStateRef = useRef(appState);
  const lastSyncedStateRef = useRef<typeof appState | null>(null);
  const localDirtyRef = useRef(false);
  const localChangeSeqRef = useRef(0);
  const lastSyncedRevisionRef = useRef(0);
  const hasInitialRemoteSnapshotRef = useRef(false);
  const clientIdRef = useRef(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `client-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  appStateRef.current = appState;

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
  const [financeWorkspaceV77, setFinanceWorkspaceV77] = useState<'financial' | 'shuttle'>('financial'); // SHUTTLE_STOCK_SEPARATION_V77B
  const [cancelFinishedMatchId, setCancelFinishedMatchId] = useState('');

  const [showMatchHistoryExport, setShowMatchHistoryExport] = useState(false);
  const [showMemberCostExportV68D, setShowMemberCostExportV68D] = useState(false);
  
  // Never trust ?mode=organizer by itself.
  // Organizer mode is enabled only after Firebase Auth confirms an allowed Organizer UID.
  const [isOrganizerMode, setIsOrganizerMode] = useState<boolean>(false);

  // Track the active user identity (member/walk-in)
  // FORCE_MEMBER_LOGIN_EVERY_LOAD_V11A
  // Member identity is session-only. Refresh/reopen must verify again.
  const [currentMemberId, setCurrentMemberId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('badminton_active_member_id') || '';
    }
    return '';
  })

  // CLEAR_SAVED_MEMBER_ID_V11A
  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('badminton_active_member_id');
    }
  }, []);

  const [copiedShareLink, setCopiedShareLink] = useState(false);

  const handleShareMemberLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}${window.location.pathname}?mode=member&openExternalBrowser=1`;
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
  const [isDataStatsManagerOpen, setIsDataStatsManagerOpen] = useState<boolean>(false); // DATA_STATS_REPAIR_V66
  const [isMemberHistoryOpen, setIsMemberHistoryOpen] = useState<boolean>(false); // MEMBER_HISTORY_V65

  // Modals
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [addPlayerDefaultType, setAddPlayerDefaultType] = useState<'registered' | 'walkin'>('registered');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isMemberPinModalOpen, setIsMemberPinModalOpen] = useState(false);
  const [isSelfCheckInOpen, setIsSelfCheckInOpen] = useState(false);
  // MEMBER_AUTO_CHECKIN_PROMPT_V58
  const [isMemberCheckInPromptOpen, setIsMemberCheckInPromptOpen] = useState(false);
  const [isMemberGateOpen, setIsMemberGateOpen] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const isOrg = params.get('mode') === 'organizer';
      const savedMemberId = sessionStorage.getItem('badminton_active_member_id');
      return !isOrg && !savedMemberId;
    }
    return false;
  })
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

  // Track browser network state. When Internet returns, changing isOnline
  // re-runs the Firestore save effect below so any LocalStorage-only edits made
  // while offline are retried automatically.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      setSyncStatus((current) => (current === 'error' ? 'connecting' : current));
    };

    const handleOffline = () => {
      setIsOnline(false);
    };

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

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

      const organizerUiLocked =
        typeof window !== 'undefined' &&
        localStorage.getItem(
          'guanguan_organizer_ui_locked_v61'
        ) === '1';

      setIsOrganizerMode(
        isOrganizerUid(user.uid) &&
          !forceMemberMode &&
          !organizerUiLocked
      );
    });

    return () => unsubscribeAuth();
  }, []);

  // ORGANIZER_QUICK_PIN_APP_V61
  const handleExitOrganizerMode = async () => {
    setIsOrganizerMode(false);

    if (typeof window !== 'undefined') {
      localStorage.setItem(
        'guanguan_organizer_ui_locked_v61',
        '1'
      );
    }

    if (currentTab === 'courts' || currentTab === 'finance' || currentTab === 'tools') {
      setCurrentTab('prematch');
    }

    // IMPORTANT:
    // Do not sign out Firebase here.
    // Keeping the authorized Firebase session lets this trusted browser
    // re-enter Organizer mode with Quick PIN instead of Email every time.
  };
  const handleToggleOrganizerMode = () => {
    if (isOrganizerMode) {
      void handleExitOrganizerMode();
    } else {
      setIsPinModalOpen(true);
    }
  };

  // Firestore realtime subscription with three-way merge protection.
  //
  // When another browser updates Firestore while this browser still has local
  // unsaved edits, we DO NOT discard those local edits. Instead:
  //   previous Firestore base + local edits + newest Firestore remote
  // are merged field-by-field.
  useEffect(() => {
    if (!authReady || !authUserUid) return;

    firestoreReadyRef.current = false;
    hasInitialRemoteSnapshotRef.current = false;
    lastSyncedStateRef.current = null;
    lastSyncedRevisionRef.current = 0;
    localDirtyRef.current = false;
    setSyncStatus('connecting');

    const unsubscribe = subscribeToCurrentSessionFromFirestore(
      (remoteState, updatedBy, revision = 0) => {
        firestoreReadyRef.current = true;

        const normalizedRemoteState =
          normalizeIncomingAppState(remoteState);

        // First Firestore snapshot is the shared source of truth.
        if (!hasInitialRemoteSnapshotRef.current) {
          hasInitialRemoteSnapshotRef.current = true;
          lastSyncedStateRef.current = normalizedRemoteState;
          lastSyncedRevisionRef.current = revision;
          localDirtyRef.current = false;

          if (
            !areFirestoreStatesEqual(
              appStateRef.current,
              normalizedRemoteState
            )
          ) {
            applyingRemoteStateRef.current = true;
            appStateRef.current = normalizedRemoteState;
            saveAppState(normalizedRemoteState);
            setAppState(normalizedRemoteState);
          } else {
            saveAppState(normalizedRemoteState);
          }

          setSyncStatus('synced');
          return;
        }

        const previousBase =
          lastSyncedStateRef.current || normalizedRemoteState;
        const currentLocal = appStateRef.current;
        const hadUnsavedLocalChanges = localDirtyRef.current;

        // Update the known Firestore base first.
        lastSyncedStateRef.current = normalizedRemoteState;
        lastSyncedRevisionRef.current = revision;

        // If local edits are pending, replay only those local deltas on top of
        // the newest remote state. This preserves changes from both devices.
        const nextLocalState = hadUnsavedLocalChanges
          ? normalizeIncomingAppState(
              mergeLocalChanges(
                previousBase,
                currentLocal,
                normalizedRemoteState
              )
            )
          : normalizedRemoteState;

        if (
          !areFirestoreStatesEqual(
            currentLocal,
            nextLocalState
          )
        ) {
          applyingRemoteStateRef.current = true;
          appStateRef.current = nextLocalState;
          saveAppState(nextLocalState);
          setAppState(nextLocalState);
        } else {
          saveAppState(nextLocalState);
        }

        setSyncStatus(
          hadUnsavedLocalChanges ? 'saving' : 'synced'
        );
      },
      async () => {
        // First install / migration: no shared Firestore document exists yet.
        firestoreReadyRef.current = true;
        setSyncStatus('saving');

        try {
          const initialState = appStateRef.current;
          await saveCurrentSessionToFirestore(
            initialState,
            clientIdRef.current
          );

          hasInitialRemoteSnapshotRef.current = true;
          lastSyncedStateRef.current = initialState;
          lastSyncedRevisionRef.current = 1;
          localDirtyRef.current = false;
          setSyncStatus('synced');
        } catch (error) {
          console.error(
            'Failed to create initial Firestore session',
            error
          );
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
        }

        // ARCHIVE_NO_RESEED_V66D
        // Firestore is now the source of truth for Archive.
        // Do NOT seed stale LocalStorage back when remote archive is intentionally empty.
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

  // Keep LocalStorage as backup and debounce concurrency-safe Firestore writes.
  //
  // The transaction compares:
  //   lastSyncedStateRef (base) -> appState (local)
  // and applies only that delta over the newest Firestore state.
  useEffect(() => {
    appStateRef.current = appState;
    saveAppState(appState);

    // Offline-first behavior:
    // - always keep the newest state in LocalStorage
    // - do not attempt the Firestore transaction while offline
    // - mark local data dirty so it will be retried when Internet returns
    if (!isOnline) {
      if (!applyingRemoteStateRef.current) {
        localDirtyRef.current = true;
        localChangeSeqRef.current += 1;
      }
      setSyncStatus('saving');
      return;
    }

    if (!authReady || !authUserUid) return;
    if (!firestoreReadyRef.current) return;
    if (!hasInitialRemoteSnapshotRef.current) return;

    const wasRemoteApplication = applyingRemoteStateRef.current;
    if (wasRemoteApplication) {
      applyingRemoteStateRef.current = false;

      // Pure remote update: nothing local needs to be written back.
      if (!localDirtyRef.current) {
        return;
      }

      // If local edits were pending, the subscription merged them on top of
      // the new remote snapshot. Continue below and persist that merged delta.
    } else {
      localDirtyRef.current = true;
      localChangeSeqRef.current += 1;
    }

    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current);
      pushTimerRef.current = null;
    }

    setSyncStatus('saving');

    const scheduledSeq = localChangeSeqRef.current;
    const scheduledLocalState = appState;
    const scheduledBaseState =
      lastSyncedStateRef.current || appState;

    pushTimerRef.current = window.setTimeout(async () => {
      try {
        const result =
          await saveCurrentSessionMergedToFirestore(
            scheduledLocalState,
            scheduledBaseState,
            clientIdRef.current
          );

        const normalizedMergedState =
          normalizeIncomingAppState(result.state);

        lastSyncedStateRef.current = normalizedMergedState;
        lastSyncedRevisionRef.current = result.revision;

        const noNewerLocalEdit =
          scheduledSeq === localChangeSeqRef.current;

        if (noNewerLocalEdit) {
          localDirtyRef.current = false;

          // Transaction may have preserved changes from another device that
          // were not present in the scheduled local state. Bring them into UI.
          if (
            !areFirestoreStatesEqual(
              appStateRef.current,
              normalizedMergedState
            )
          ) {
            applyingRemoteStateRef.current = true;
            appStateRef.current = normalizedMergedState;
            saveAppState(normalizedMergedState);
            setAppState(normalizedMergedState);
          }

          setSyncStatus('synced');
        } else {
          // Another local action happened while this transaction was running.
          // Do not mark synced; the newer effect will persist that edit.
          localDirtyRef.current = true;
          setSyncStatus('saving');
        }
      } catch (error) {
        console.error(
          'Failed to merge/save state to Firestore',
          error
        );
        localDirtyRef.current = true;
        setSyncStatus('error');
      } finally {
        pushTimerRef.current = null;
      }
    }, 350);

    return () => {
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
    };
  }, [appState, authReady, authUserUid, isOnline]);

  const { sessionConfig, players, activeMatches, matchHistory } = appState;

  const confirmedPreMatch3 = ((appState as any).confirmedPreMatch3 || null) as ConfirmedPreMatch | null; // PREMATCH_3_FIFO_V64
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

  // HISTORICAL_SHUTTLE_BACKFILL_V73
  // One-time historical inventory migration.
  //
  // 25/09/2026:
  //   Purchase Ling Mei 80      60 pcs @ 83 = 4,980
  //   Usage                    21 pcs @ 83 = 1,743
  //   Remaining                39 pcs
  //
  // 08/10/2026:
  //   Purchase Ling Mei Silver 60 pcs @ 70 = 4,200
  //
  // 09/10/2026:
  //   Usage                    23 pcs @ 70 = 1,610
  //   Remaining                37 pcs
  //
  // Total remaining = 76 pcs
  useEffect(() => {
    // Wait until Firestore/local state is fully synchronized first.
    if (syncStatus !== 'synced') return;

    setAppState((prev) => {
      if ((prev as any).historicalShuttleBackfillV73) {
        return prev;
      }

      const existingPurchases = getShuttlePurchases(prev as any);
      const existingUsages = getShuttleUsageLedger(prev as any);

      const purchase80Id =
        'hist-purchase-20260925-ling-mei-80';
      const purchaseSilverId =
        'hist-purchase-20261008-ling-mei-silver';

      const usage80Id =
        'hist-usage-20260925-ling-mei-80';
      const usageSilverId =
        'hist-usage-20261009-ling-mei-silver';

      const backfillPurchases: any[] = [
        {
          id: purchase80Id,

          date: '2026-09-25',
          purchaseDate: '2026-09-25',

          brand: 'Ling Mei',
          model: '80',
          name: 'Ling Mei 80',

          quantity: 60,
          tubes: 5,
          piecesPerTube: 12,

          unitCost: 83,
          costPerPiece: 83,
          pricePerPiece: 83,

          totalCost: 4980,
          totalPrice: 4980,
          amount: 4980,

          pricePerTube: 996,

          note:
            'Historical backfill • ซื้อ 60 ลูก (5 หลอด × 12) • 83 บาท/ลูก',

          createdAt: new Date(
            '2026-09-25T12:00:00+07:00'
          ).getTime(),
        },
        {
          id: purchaseSilverId,

          date: '2026-10-08',
          purchaseDate: '2026-10-08',

          brand: 'Ling Mei',
          model: 'Silver',
          name: 'Ling Mei Silver',

          quantity: 60,
          tubes: 5,
          piecesPerTube: 12,

          unitCost: 70,
          costPerPiece: 70,
          pricePerPiece: 70,

          totalCost: 4200,
          totalPrice: 4200,
          amount: 4200,

          pricePerTube: 840,

          note:
            'Historical backfill • ซื้อ 60 ลูก (5 หลอด × 12) • 70 บาท/ลูก',

          createdAt: new Date(
            '2026-10-08T12:00:00+07:00'
          ).getTime(),
        },
      ];

      const backfillUsages: any[] = [
        {
          id: usage80Id,
          historyId:
            'historical-session-20260925-ling-mei-80',

          sessionDate: '2026-09-25',
          date: '2026-09-25',

          courtName:
            'Historical Session — Ling Mei 80',

          brand: 'Ling Mei',
          model: '80',
          shuttleName: 'Ling Mei 80',

          quantity: 21,

          unitCost: 83,
          costPerPiece: 83,

          totalCost: 1743,

          // 21 Matches × 4 members × 25/member/Match
          memberCount: 84,
          memberRatePerMatch: 25,
          baseMemberRevenue: 2100,

          note:
            'Historical backfill • 25/09/2026 • ใช้ Ling Mei 80 จำนวน 21 ลูก',

          createdAt: new Date(
            '2026-09-25T23:00:00+07:00'
          ).getTime(),
        },
        {
          id: usageSilverId,
          historyId:
            'historical-session-20261009-ling-mei-silver',

          sessionDate: '2026-10-09',
          date: '2026-10-09',

          courtName:
            'Historical Session — Ling Mei Silver',

          brand: 'Ling Mei',
          model: 'Silver',
          shuttleName: 'Ling Mei Silver',

          quantity: 23,

          unitCost: 70,
          costPerPiece: 70,

          totalCost: 1610,

          // 23 Matches × 4 members × 25/member/Match
          memberCount: 92,
          memberRatePerMatch: 25,
          baseMemberRevenue: 2300,

          note:
            'Historical backfill • 09/10/2026 • ใช้ Ling Mei Silver จำนวน 23 ลูก',

          createdAt: new Date(
            '2026-10-09T23:00:00+07:00'
          ).getTime(),
        },
      ];

      const existingPurchaseIds = new Set(
        existingPurchases.map((item) => item.id)
      );

      const existingUsageIds = new Set(
        existingUsages.map((item) => item.id)
      );

      const nextPurchases = [
        ...backfillPurchases.filter(
          (item) => !existingPurchaseIds.has(item.id)
        ),
        ...existingPurchases,
      ];

      const nextUsages = [
        ...backfillUsages.filter(
          (item) => !existingUsageIds.has(item.id)
        ),
        ...existingUsages,
      ];

      const inventory = getShuttleInventorySummary(
        nextPurchases,
        nextUsages,
        prev.sessionConfig.shuttlecockPrice,
        getShuttleStockAdjustments(prev as any)
      );

      console.info(
        '[GuanGuan v73] Historical shuttle backfill applied',
        {
          expectedPurchased: 120,
          expectedUsed: 44,
          expectedRemaining: 76,
          expectedStockValue: 5827,
          calculatedStock: inventory.stockQuantity,
          calculatedAverageCost: inventory.averageUnitCost,
        }
      );

      return {
        ...prev,

        shuttlePurchases: nextPurchases,
        shuttleUsageLedger: nextUsages,

        // Persistent migration marker prevents duplicate backfill.
        historicalShuttleBackfillV73: true,

        sessionConfig: {
          ...prev.sessionConfig,

          // Current reference cost should follow the remaining
          // inventory value after historical usage.
          shuttlecockPrice:
            inventory.averageUnitCost > 0
              ? inventory.averageUnitCost
              : prev.sessionConfig.shuttlecockPrice,
        },
      } as any;
    });
  }, [syncStatus]);
  // COURT_NAME_SOURCE_OF_TRUTH_V74
  // sessionCourts[].name is the real visible court name.
  // Keep legacy courtNames synchronized because older queue/match code
  // still reads courtNames by index.
  useEffect(() => {
    setAppState((prev) => {
      const courts = Array.isArray(prev.sessionConfig.sessionCourts)
        ? prev.sessionConfig.sessionCourts
        : [];

      if (courts.length === 0) return prev;

      const nextNames = courts.map((court, index) => {
        const value = String(court?.name || '').trim();
        return value || `คอร์ท ${index + 1}`;
      });

      const oldNames = Array.isArray(prev.sessionConfig.courtNames)
        ? prev.sessionConfig.courtNames
        : [];

      const sameNames =
        oldNames.length === nextNames.length &&
        oldNames.every(
          (name, index) => name === nextNames[index]
        );

      const activeAlreadyCorrect = prev.activeMatches.every((match) => {
        const index = courts.findIndex(
          (court) => court.id === match.courtId
        );

        return (
          index < 0 ||
          match.courtName === nextNames[index]
        );
      });

      if (sameNames && activeAlreadyCorrect) {
        return prev;
      }

      const legacyRename = new Map<string, string>();

      oldNames.forEach((oldName, index) => {
        const nextName = nextNames[index];

        if (
          oldName &&
          nextName &&
          oldName !== nextName
        ) {
          legacyRename.set(oldName, nextName);
        }
      });

      const nextActiveMatches = prev.activeMatches.map(
        (match) => {
          const index = courts.findIndex(
            (court) => court.id === match.courtId
          );

          const nextName =
            index >= 0 ? nextNames[index] : undefined;

          return nextName
            ? { ...match, courtName: nextName }
            : match;
        }
      );

      const nextMatchHistory = prev.matchHistory.map(
        (history) => {
          const nextName =
            legacyRename.get(history.courtName);

          return nextName
            ? { ...history, courtName: nextName }
            : history;
        }
      );

      const remapPreMatch = (pm: any) => {
        if (!pm?.targetCourtName) return pm;

        const nextName = legacyRename.get(
          pm.targetCourtName
        );

        return nextName
          ? { ...pm, targetCourtName: nextName }
          : pm;
      };

      return {
        ...prev,

        sessionConfig: {
          ...prev.sessionConfig,
          courtCount: courts.length,
          courtNames: nextNames,
        },

        activeMatches: nextActiveMatches,
        matchHistory: nextMatchHistory,

        confirmedPreMatch: remapPreMatch(
          (prev as any).confirmedPreMatch
        ),

        confirmedPreMatch2: remapPreMatch(
          (prev as any).confirmedPreMatch2
        ),

        ...(
          Object.prototype.hasOwnProperty.call(
            prev,
            'confirmedPreMatch3'
          )
            ? {
                confirmedPreMatch3: remapPreMatch(
                  (prev as any).confirmedPreMatch3
                ),
              }
            : {}
        ),
      } as any;
    });
  }, [sessionConfig.sessionCourts]);
  // MONTHLY_SHUTTLE_BACKFILL_REPAIR_V75
  // Normalize historical shuttle Purchase / Usage records so monthly reports
  // calculate purchase value, tubes, pieces, per-tube prices and Match count
  // exactly like normal live-session records.
  useEffect(() => {
    if (syncStatus !== 'synced') return;

    setAppState((prev) => {
      if ((prev as any).monthlyShuttleRepairV75) {
        return prev;
      }

      const currentPurchases = getShuttlePurchases(prev as any) as any[];
      const currentUsages = getShuttleUsageLedger(prev as any) as any[];

      const purchaseSpecs = [
        {
          id: 'hist-purchase-20260925-ling-mei-80',
          date: '2026-09-25',
          brand: 'Ling Mei',
          model: '80',
          name: 'Ling Mei 80',
          quantity: 60,
          tubes: 5,
          piecesPerTube: 12,
          unitCost: 83,
          pricePerTube: 996,
          total: 4980,
          createdAt: new Date('2026-09-25T12:00:00+07:00').getTime(),
        },
        {
          id: 'hist-purchase-20261008-ling-mei-silver',
          date: '2026-10-08',
          brand: 'Ling Mei',
          model: 'Silver',
          name: 'Ling Mei Silver',
          quantity: 60,
          tubes: 5,
          piecesPerTube: 12,
          unitCost: 70,
          pricePerTube: 840,
          total: 4200,
          createdAt: new Date('2026-10-08T12:00:00+07:00').getTime(),
        },
      ];

      const purchaseSpecById = new Map(
        purchaseSpecs.map((spec) => [spec.id, spec])
      );

      const upgradedPurchases = currentPurchases
        .filter((item) => !purchaseSpecById.has(item.id))
        .concat(
          purchaseSpecs.map((spec) => {
            const existing = currentPurchases.find(
              (item) => item.id === spec.id
            ) || {};

            return {
              ...existing,

              id: spec.id,

              // Date aliases
              date: spec.date,
              purchaseDate: spec.date,
              purchasedDate: spec.date,

              // Shuttle identity
              brand: spec.brand,
              model: spec.model,
              name: spec.name,
              shuttleName: spec.name,

              // Quantity aliases
              quantity: spec.quantity,
              pieces: spec.quantity,
              pieceCount: spec.quantity,
              totalPieces: spec.quantity,

              // Tube aliases
              tubes: spec.tubes,
              tubeCount: spec.tubes,
              quantityTubes: spec.tubes,
              totalTubes: spec.tubes,
              piecesPerTube: spec.piecesPerTube,

              // Per-piece cost aliases
              unitCost: spec.unitCost,
              costPerPiece: spec.unitCost,
              pricePerPiece: spec.unitCost,
              unitPrice: spec.unitCost,

              // Per-tube cost aliases
              pricePerTube: spec.pricePerTube,
              costPerTube: spec.pricePerTube,
              tubePrice: spec.pricePerTube,
              unitPricePerTube: spec.pricePerTube,

              // Purchase total aliases
              totalCost: spec.total,
              totalPrice: spec.total,
              totalAmount: spec.total,
              purchaseAmount: spec.total,
              amount: spec.total,

              note:
                existing.note ||
                `Historical backfill • ${spec.quantity} ลูก • ${spec.tubes} หลอด • ${spec.unitCost} บาท/ลูก`,

              createdAt:
                Number(existing.createdAt || 0) > 0
                  ? existing.createdAt
                  : spec.createdAt,
            };
          })
        );

      // Remove the two old aggregate v73 Usage records.
      const aggregateUsageIds = new Set([
        'hist-usage-20260925-ling-mei-80',
        'hist-usage-20261009-ling-mei-silver',
      ]);

      // Also remove prior v75 expanded rows if a partially applied local build exists.
      const baseUsages = currentUsages.filter(
        (item) =>
          !aggregateUsageIds.has(item.id) &&
          !String(item.id || '').startsWith(
            'hist-usage-20260925-ling-mei-80-match-'
          ) &&
          !String(item.id || '').startsWith(
            'hist-usage-20261009-ling-mei-silver-match-'
          )
      );

      const buildHistoricalMatchUsages = (
        prefix: string,
        sessionDate: string,
        matchCount: number,
        brand: string,
        model: string,
        unitCost: number,
        startHour: number
      ) => {
        const rows: any[] = [];

        for (let index = 1; index <= matchCount; index += 1) {
          const hh = Math.min(23, startHour + Math.floor((index - 1) / 3));
          const mm = ((index - 1) % 3) * 20;

          const createdAt = new Date(
            `${sessionDate}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+07:00`
          ).getTime();

          rows.push({
            id: `${prefix}-match-${String(index).padStart(2, '0')}`,
            historyId: `${prefix}-history-${String(index).padStart(2, '0')}`,

            sessionDate,
            date: sessionDate,

            brand,
            model,
            shuttleName: `${brand} ${model}`,

            // One historical row = one real Match = one physical shuttle.
            quantity: 1,
            matchCount: 1,
            matches: 1,

            unitCost,
            costPerPiece: unitCost,
            totalCost: unitCost,

            memberCount: 4,
            memberRatePerMatch: 25,
            baseMemberRevenue: 100,

            courtName: 'ย้อนหลัง (รวมทั้งรอบ)',

            note:
              `Historical backfill • Match ${index}/${matchCount} • ${brand} ${model}`,

            createdAt,
          });
        }

        return rows;
      };

      const historicalUsages = [
        ...buildHistoricalMatchUsages(
          'hist-usage-20260925-ling-mei-80',
          '2026-09-25',
          21,
          'Ling Mei',
          '80',
          83,
          19
        ),
        ...buildHistoricalMatchUsages(
          'hist-usage-20261009-ling-mei-silver',
          '2026-10-09',
          23,
          'Ling Mei',
          'Silver',
          70,
          19
        ),
      ];

      const nextUsages = [
        ...historicalUsages,
        ...baseUsages,
      ];

      return {
        ...prev,

        shuttlePurchases: upgradedPurchases,
        shuttleUsageLedger: nextUsages,

        monthlyShuttleRepairV75: true,
      } as any;
    });
  }, [syncStatus]);
  // Daily billing source of truth:
  // gamesPlayed / matchesPlayed must reflect FINISHED matches in current matchHistory only.
  // This prevents a fresh Check-in from inheriting old Match counts from a previous day.
  useEffect(() => {
    setAppState((prev) => {
      const statsMap = getMemberStatsMap(prev as any);
      let changed = false;

      const nextPlayers = prev.players.map((player) => {
        const completedHistoryMatches = getCurrentSessionCompletedMatchCount(
          player,
          statsMap,
          prev.matchHistory
        );

        // PENDING_ACTIVE_MATCH_BILLING_V29
        // A member may have pressed Stop before the organizer finishes the court.
        // Count that active match as billable exactly once.
        const hasPendingActiveMatchCharge =
          Boolean((player as any).stopAfterCurrentMatch) &&
          Boolean((player as any).stopAfterCurrentMatchId) &&
          prev.activeMatches.some(
            (m) =>
              m.id === (player as any).stopAfterCurrentMatchId &&
              [...m.teamA, ...m.teamB].includes(player.id)
          );

        const completedMatches =
          completedHistoryMatches + (hasPendingActiveMatchCharge ? 1 : 0);
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
  }, [matchHistory, activeMatches]);

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
            todayRoster: true, // TODAY_ROSTER_CHECKIN_V48B
            checkInTime: timeStr,
            checkInTimestamp: Date.now(),
            status: ('waiting' as PlayerStatus),
            // CLEAR_STOP_AFTER_MATCH_ON_CHECKIN_V29
            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
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
  // HANDLE_STOP_AFTER_MATCH_V29
  // If a member presses "Stop" while already on court:
  // - keep the member in the active match / court display
  // - pre-count this active match for billing immediately
  // - remove them from any future Pre-Match
  // - when the organizer eventually finishes the match, do not double-count it
  const handleStopAfterCurrentMatch = (playerId: string) => {
    setAppState((prev) => {
      const activeMatch = prev.activeMatches.find((m) =>
        [...m.teamA, ...m.teamB].includes(playerId)
      );

      // Safety fallback: if the player is no longer in an active match,
      // behave like a normal checkout.
      if (!activeMatch) {
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  isCheckedIn: false,
                  checkInTime: undefined,
                  checkInTimestamp: undefined,
                  status: 'left' as PlayerStatus,
                  stopAfterCurrentMatch: false,
                  stopAfterCurrentMatchId: undefined,
                  stopRequestedAt: Date.now(), // STOP_FALLBACK_ALERT_V49
                }
              : p
          ),
        } as any;
      }

      const nextPlayers = prev.players.map((p) => {
        if (p.id !== playerId) return p;

        const alreadyPrecounted =
          Boolean((p as any).stopAfterCurrentMatch) &&
          (p as any).stopAfterCurrentMatchId === activeMatch.id;

        if (alreadyPrecounted) return p;

        return {
          ...p,
          // IMPORTANT: remain checked-in + playing so the name stays on Court.
          stopAfterCurrentMatch: true,
          stopAfterCurrentMatchId: activeMatch.id,
          stopRequestedAt: Date.now(),

          // Pre-count the current active match NOW.
          // This protects billing even if the organizer forgets to press Finish Match.
          matchesPlayed: (p.matchesPlayed || 0) + 1,
          gamesPlayed: (p.gamesPlayed || 0) + 2,
        } as any;
      });

      const clearFuturePreMatch = (pm: ConfirmedPreMatch | null | undefined) =>
        pm && [...pm.teamA, ...pm.teamB].includes(playerId) ? null : pm;

      return {
        ...prev,
        players: nextPlayers,
        confirmedPreMatch: clearFuturePreMatch(prev.confirmedPreMatch),
        confirmedPreMatch2: clearFuturePreMatch(prev.confirmedPreMatch2),
        confirmedPreMatch3: clearFuturePreMatch((prev as any).confirmedPreMatch3),
      } as any;
    });
  };

  const handleCheckOutPlayer = (playerId: string) => {
    // ACTIVE_MATCH_CHECKOUT_LOCK_V43
    // A player already placed on court must stay locked until that active match is resolved.
    const activeMatchForCheckout = appState.activeMatches.find((match) =>
      [...match.teamA, ...match.teamB].includes(playerId)
    );

    if (activeMatchForCheckout) {
      const targetPlayer = appState.players.find(
        (player) => player.id === playerId
      );

      window.alert(
        `"${targetPlayer?.nickname || 'สมาชิก'}" กำลังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถ Check-out ได้ เพราะยอด Match ยังไม่ Final\n\n' +
        '• เล่นต่อ → รอผู้จัดกด Finish Match ก่อน\n' +
        '• ไม่ได้เล่น / ยกเลิก → ให้ผู้จัดปรับ Billing ของสมาชิกเพื่อยกเว้นค่าลูก Match นี้'
      );
      return;
    }
    // CHECKOUT_STAY_MEMBER_PAGE_V20
    // Member stays on the Member page after pressing "เลิกเล่น".
    setAppState((prev) => {
      const updatedPlayers = prev.players.map((p) => {
        if (p.id === playerId) {
          return {
            ...p,
            isCheckedIn: false,
            checkInTime: undefined,
            checkInTimestamp: undefined,
            status: ('left' as PlayerStatus),
            // MEMBER_CHECKOUT_ALERT_V49
            // Only member self-checkout creates an organizer alert.
            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: !isOrganizerMode ? Date.now() : p.stopRequestedAt,
          };
        }
        return p;
      });
      // IMPORTANT: If this member is already in a CONFIRMED Pre-Match,
      // keep the PM for now. Organizer will receive an alert and decide.
      return {
        ...prev,
        players: updatedPlayers,
      };
    });

    if (!isOrganizerMode && currentMemberId === playerId) {
      setIsSelfCheckInOpen(false);
      setIsMemberGateOpen(false);
    }
  };

  // TODAY_ROSTER_HANDLER_V48B
  const handleToggleTodayRoster = (playerId: string, inRoster: boolean) => {
    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;

        const hasTodayActivity =
          p.isCheckedIn ||
          (p.matchesPlayed || 0) > 0 ||
          (p.extraShuttlecocks || 0) > 0 ||
          Boolean(p.paid);

        // Prevent accidental removal after the member has started today's session.
        if (!inRoster && hasTodayActivity) {
          return p;
        }

        return {
          ...p,
          todayRoster: inRoster,
        };
      }),
    }));
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
      // IMPORTANT: Resting/left member stays in CONFIRMED PM temporarily.
      // Organizer will get a cross-device alert and must acknowledge removal.
      return {
        ...prev,
        players: updatedPlayers,
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
      todayRoster: true,
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
      sessionStorage.setItem('badminton_active_member_id', newPlayer.id);
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
        confirmedPreMatch3: clearPre((prev as any).confirmedPreMatch3),
        deletedMembers: [record, ...trash.filter((x) => x.playerId !== playerId)],
      } as any;
    });

    if (currentMemberId === playerId) {
      setCurrentMemberId('');
      sessionStorage.removeItem('badminton_active_member_id');
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
              // RESET_BILLING_ADJUSTMENTS_V31
              billingMatchAdjustment: 0,
              billingAmountAdjustment: 0,
              billingAdjustmentReason: undefined,
              billingAdjustmentLog: [],
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

    // 3. Resting / checked-out / not checked-in players cannot be put on court.
    const unavailablePlayers = players.filter(
      (p) =>
        allPlayerIds.has(p.id) &&
        (!p.isCheckedIn || p.status === 'resting' || p.status === 'left')
    );

    if (unavailablePlayers.length > 0) {
      window.alert(
        `ลงคอร์ทไม่ได้\n\n${unavailablePlayers
          .map((p) => `• ${p.nickname} — ${p.status === 'resting' ? 'พักเหนื่อย' : 'ไม่พร้อมเล่น'}`)
          .join('\n')}\n\nกรุณาเปลี่ยนสถานะเป็น "พร้อมลงคิว" ก่อน`
      );
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
      // PREMATCH_3_FIFO_V64
      confirmedPreMatch3:
        (prev as any).confirmedPreMatch3 &&
        [...(prev as any).confirmedPreMatch3.teamA, ...(prev as any).confirmedPreMatch3.teamB].some((id: string) =>
          allPlayerIds.has(id)
        )
          ? null
          : (prev as any).confirmedPreMatch3,
      players: prev.players.map((p) =>
        allPlayerIds.has(p.id) ? { ...p, status: 'playing' as PlayerStatus } : p
      ),
    }));

    confetti({ particleCount: 30, spread: 45, origin: { y: 0.5 } });
  };
  // HANDLE_CANCEL_ACTIVE_MATCH_NO_CHARGE_V30
  // Cancel an active court because the organizer needs to change players.
  // This is NOT a completed match:
  // - no MatchHistory
  // - no shuttle usage posting
  // - no session shuttle total increment
  // - no new match/game charge
  const handleCancelActiveMatch = (matchId: string) => {
    setAppState((prev) => {
      const targetMatch = prev.activeMatches.find((m) => m.id === matchId);
      if (!targetMatch) return prev;

      const matchPlayerIds = new Set([
        ...targetMatch.teamA,
        ...targetMatch.teamB,
      ]);

      const nextPlayers = prev.players.map((p) => {
        if (!matchPlayerIds.has(p.id)) return p;

        const stopWasPrecounted =
          Boolean((p as any).stopAfterCurrentMatch) &&
          (p as any).stopAfterCurrentMatchId === matchId;

        // V29/V29A may have pre-counted this active match when the member
        // pressed "Stop" while still playing. Since this match is CANCELLED,
        // roll that pending charge back exactly once.
        const nextMatches = stopWasPrecounted
          ? Math.max(0, (p.matchesPlayed || 0) - 1)
          : (p.matchesPlayed || 0);

        const nextGames = stopWasPrecounted
          ? Math.max(0, (p.gamesPlayed || 0) - 2)
          : (p.gamesPlayed || 0);

        if (stopWasPrecounted) {
          // The member already asked to stop playing, so keep that intent.
          return {
            ...p,
            matchesPlayed: nextMatches,
            gamesPlayed: nextGames,
            isCheckedIn: false,
            checkInTime: undefined,
            checkInTimestamp: undefined,
            status: 'left' as PlayerStatus,
            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
          } as any;
        }

        // Normal cancellation: player was not charged for this active match.
        // Return them to Waiting with the original queue/check-in data intact.
        return {
          ...p,
          status: p.isCheckedIn
            ? ('waiting' as PlayerStatus)
            : ('left' as PlayerStatus),
          stopAfterCurrentMatch: false,
          stopAfterCurrentMatchId: undefined,
          stopRequestedAt: undefined,
        } as any;
      });

      return {
        ...prev,
        activeMatches: prev.activeMatches.filter((m) => m.id !== matchId),
        players: nextPlayers,
      } as any;
    });
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
    // FINISH_MATCH_CONFIRM_V53
    const confirmFinish = window.confirm(
      `ยืนยันจบ Match "${targetMatch.courtName}" ?\n\n` +
      `เมื่อกดยืนยัน ระบบจะนับ +1 Match และนำไปคิดค่าใช้จ่าย`
    );
    if (!confirmFinish) return;


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
      // MATCH_TIMING_V83
      startedAt: Number(targetMatch.startTime || Date.now()),
      finishedAt: Date.now(),
      shuttlecocksCount,
      scoreA: g1A,
      scoreB: g1B,
      game1ScoreA: g1A,
      game1ScoreB: g1B,
      game2ScoreA: g2A,
      game2ScoreB: g2B,

      ...({
        __undo: {
          activeMatch: {
            ...targetMatch,
            teamA: [...targetMatch.teamA],
            teamB: [...targetMatch.teamB],
          },
          playerStates: [...targetMatch.teamA, ...targetMatch.teamB]
            .map((playerId) => {
              const player = players.find((p) => p.id === playerId) as any;
              if (!player) return null;
              return {
                id: player.id,
                isCheckedIn: player.isCheckedIn,
                checkInTime: player.checkInTime,
                checkInTimestamp: player.checkInTimestamp,
                status: player.status,
                gamesPlayed: player.gamesPlayed,
                matchesPlayed: player.matchesPlayed,
                lastMatchFinishTime: player.lastMatchFinishTime,
                stopAfterCurrentMatch: player.stopAfterCurrentMatch,
                stopAfterCurrentMatchId: player.stopAfterCurrentMatchId,
                stopRequestedAt: player.stopRequestedAt,
              };
            })
            .filter(Boolean),
          finishedAt: Date.now(),
        },
      } as any),

      ...({
        participantIds: [...allPlayerIds],
        teamAPlayerIds: [...targetMatch.teamA],
        teamBPlayerIds: [...targetMatch.teamB],
      } as any),
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
        players: prev.players.map((p) => {
          if (!allPlayerIds.has(p.id)) return p;

          // FINALIZE_STOP_AFTER_MATCH_V29
          const stopAfterThisMatch =
            Boolean((p as any).stopAfterCurrentMatch) &&
            (
              !(p as any).stopAfterCurrentMatchId ||
              (p as any).stopAfterCurrentMatchId === matchId
            );

          const alreadyPrecounted =
            stopAfterThisMatch &&
            (p as any).stopAfterCurrentMatchId === matchId;

          return {
            ...p,
            // Avoid double charge: this member's match was counted when they pressed Stop.
            gamesPlayed: alreadyPrecounted
              ? (p.gamesPlayed || 0)
              : (p.gamesPlayed || 0) + 2,
            matchesPlayed: alreadyPrecounted
              ? (p.matchesPlayed || 0)
              : (p.matchesPlayed || 0) + 1,

            // Other players go back to Waiting.
            // The member who requested Stop checks out only NOW.
            isCheckedIn: stopAfterThisMatch ? false : p.isCheckedIn,
            checkInTime: stopAfterThisMatch ? undefined : p.checkInTime,
            checkInTimestamp: stopAfterThisMatch ? undefined : p.checkInTimestamp,
            status: stopAfterThisMatch
              ? ('left' as PlayerStatus)
              : ('waiting' as PlayerStatus),

            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
            lastMatchFinishTime: Date.now(),
          } as any;
        }),
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


  // UNDO_FINISHED_MATCH_V53
  const handleUndoLastFinishedMatch = () => {
    if (!isOrganizerMode) return;

    const latest = appState.matchHistory?.[0] as any;
    if (!latest) {
      window.alert('ยังไม่มี Match ที่จบแล้วให้ยกเลิก');
      return;
    }

    const undoSnapshot = latest.__undo as
      | {
          activeMatch?: ActiveMatch;
          playerStates?: Array<any>;
          finishedAt?: number;
        }
      | undefined;

    const resolvePlayerIdsByNames = (names: string[] | undefined): string[] => {
      const result: string[] = [];

      for (const name of names || []) {
        const matches = appState.players.filter((p) => p.nickname === name);

        if (matches.length !== 1) {
          return [];
        }

        result.push(matches[0].id);
      }

      return result;
    };

    const snapshotTeamA = undoSnapshot?.activeMatch?.teamA || [];
    const snapshotTeamB = undoSnapshot?.activeMatch?.teamB || [];

    const teamAIds =
      snapshotTeamA.length > 0
        ? [...snapshotTeamA]
        : resolvePlayerIdsByNames(latest.teamANames);

    const teamBIds =
      snapshotTeamB.length > 0
        ? [...snapshotTeamB]
        : resolvePlayerIdsByNames(latest.teamBNames);

    const playerIds = [...teamAIds, ...teamBIds];
    const uniquePlayerIds = [...new Set(playerIds)];

    if (teamAIds.length === 0 || teamBIds.length === 0 || uniquePlayerIds.length !== 4) {
      window.alert(
        'ไม่สามารถ Undo Match นี้อัตโนมัติได้ เพราะหารายชื่อผู้เล่นเดิมไม่ครบ 4 คน\n\n' +
        'กรุณาอย่าแก้ Billing เอง และตรวจรายชื่อ Match ล่าสุดก่อน'
      );
      return;
    }

    const involvedPlayers = appState.players.filter((p) =>
      uniquePlayerIds.includes(p.id)
    );

    if (involvedPlayers.some((p) => p.paid)) {
      window.alert(
        'Undo ไม่ได้ เพราะมีผู้เล่นใน Match นี้ถูกยืนยัน Paid แล้ว\n\n' +
        'ให้ Undo Payment ก่อน แล้วจึงกลับมากด Undo Finish Match'
      );
      return;
    }

    const fallbackCourtIndex = appState.sessionConfig.courtNames.findIndex(
      (name) => name === latest.courtName
    );

    const restoredMatch: ActiveMatch = undoSnapshot?.activeMatch
      ? {
          ...undoSnapshot.activeMatch,
          teamA: [...teamAIds],
          teamB: [...teamBIds],
          status: 'playing',
        }
      : {
          id: `undo-${latest.id}`,
          courtId:
            fallbackCourtIndex >= 0
              ? `court-${fallbackCourtIndex + 1}`
              : `court-undo-${Date.now()}`,
          courtName: latest.courtName || 'Court',
          teamA: [...teamAIds],
          teamB: [...teamBIds],
          startTime:
            Date.now() -
            Math.max(1, Number(latest.durationMinutes || 1)) * 60 * 1000,
          shuttlecocksCount: Math.max(
            0,
            Number(latest.shuttlecocksCount || 0)
          ),
          status: 'playing',
          game1ScoreA: latest.game1ScoreA,
          game1ScoreB: latest.game1ScoreB,
          game2ScoreA: latest.game2ScoreA,
          game2ScoreB: latest.game2ScoreB,
          scoreA: latest.scoreA,
          scoreB: latest.scoreB,
          isRoundTrip: true,
        };

    const courtBusy = appState.activeMatches.some(
      (match) => match.courtId === restoredMatch.courtId
    );

    const activeIds = new Set(
      appState.activeMatches.flatMap((match) => [
        ...match.teamA,
        ...match.teamB,
      ])
    );

    const playerBusy = uniquePlayerIds.some((id) => activeIds.has(id));

    if (courtBusy || playerBusy) {
      window.alert(
        'Undo ยังไม่ได้ เพราะ Court หรือผู้เล่นจาก Match เดิมถูกใช้ใน Match ใหม่แล้ว\n\n' +
        'ให้จบ/ยกเลิก Match ใหม่ก่อน แล้วค่อย Undo Finish'
      );
      return;
    }

    const label =
      `${latest.courtName || 'Court'}\n` +
      `${(latest.teamANames || []).join(' / ')} vs ${(latest.teamBNames || []).join(' / ')}`;

    const confirmed = window.confirm(
      `Undo Finish Match นี้หรือไม่?\n\n${label}\n\n` +
      `ผลที่จะเกิดขึ้น:\n` +
      `- ไม่นับ Match นี้ใน Billing\n` +
      `- ลบ Match ออกจากประวัติที่จบแล้ว\n` +
      `- คืนจำนวนลูกแบดของ Match นี้\n` +
      `- นำผู้เล่น 4 คนกลับเข้า Court เดิม`
    );

    if (!confirmed) return;

    setAppState((prev) => {
      const history = prev.matchHistory?.[0] as any;

      if (!history || history.id !== latest.id) {
        window.alert(
          'ข้อมูล Match มีการเปลี่ยนแปลงจากอุปกรณ์อื่นแล้ว กรุณาลองใหม่'
        );
        return prev;
      }

      const stats = { ...getMemberStatsMap(prev as any) } as any;
      const existingUsages = getShuttleUsageLedger(prev as any);

      const nextUsages = existingUsages.filter(
        (item) => item.historyId !== history.id
      );

      const removedShuttles = Math.max(
        0,
        Number(history.shuttlecocksCount || 0)
      );

      const nextSessionUsedTotal = Math.max(
        0,
        Number(prev.sessionConfig.shuttlecocksUsedTotal || 0) -
          removedShuttles
      );

      uniquePlayerIds.forEach((playerId) => {
        const stat = stats[playerId];
        if (!stat) return;

        const processedHistoryIds = Array.isArray(stat.processedHistoryIds)
          ? stat.processedHistoryIds
          : [];

        if (!processedHistoryIds.includes(history.id)) return;

        stats[playerId] = {
          ...stat,
          totalGames: Math.max(0, Number(stat.totalGames || 0) - 2),
          totalMatches: Math.max(0, Number(stat.totalMatches || 0) - 1),
          processedHistoryIds: processedHistoryIds.filter(
            (id: string) => id !== history.id
          ),
          updatedAt: Date.now(),
        };
      });

      const snapshotById = new Map<string, any>(
        (undoSnapshot?.playerStates || []).map((state: any) => [
          state.id,
          state,
        ])
      );

      const nextPlayers = prev.players.map((player) => {
        if (!uniquePlayerIds.includes(player.id)) return player;

        const snapshot = snapshotById.get(player.id);

        if (snapshot) {
          return {
            ...player,
            ...snapshot,
            id: player.id,
            isCheckedIn: true,
            status: 'playing' as PlayerStatus,
            paid: false,
            paidAmount: undefined,
            paymentTime: undefined,
          };
        }

        // Compatibility for a Match that was finished before v53 existed.
        return {
          ...player,
          isCheckedIn: true,
          status: 'playing' as PlayerStatus,
          gamesPlayed: Math.max(0, Number(player.gamesPlayed || 0) - 2),
          matchesPlayed: Math.max(0, Number(player.matchesPlayed || 0) - 1),
          lastMatchFinishTime: undefined,
          paid: false,
          paidAmount: undefined,
          paymentTime: undefined,
        };
      });

      const usageSummary = getSessionShuttleUsageSummary(
        nextUsages,
        prev.sessionConfig.date,
        nextSessionUsedTotal,
        prev.sessionConfig.shuttlecockPrice
      );

      return {
        ...prev,
        activeMatches: [...prev.activeMatches, restoredMatch],
        matchHistory: prev.matchHistory.filter(
          (item) => item.id !== history.id
        ),
        players: nextPlayers,
        memberLifetimeStats: stats,
        shuttleUsageLedger: nextUsages,
        sessionConfig: {
          ...prev.sessionConfig,
          shuttlecocksUsedTotal: nextSessionUsedTotal,
          shuttlecockPrice:
            usageSummary.quantity > 0
              ? usageSummary.averageUnitCost
              : prev.sessionConfig.shuttlecockPrice,
        },
      } as any;
    });
  };


  // CANCEL_SELECTED_FINISHED_MATCH_V54
  const handleCancelSelectedFinishedMatch = (historyId: string) => {
    if (!isOrganizerMode) return;
    if (!historyId) {
      window.alert('กรุณาเลือก Match ที่ต้องการยกเลิก');
      return;
    }

    const selected = appState.matchHistory.find(
      (item) => item.id === historyId
    ) as any;

    if (!selected) {
      window.alert('ไม่พบ Match ที่เลือก อาจมีการเปลี่ยนแปลงจากอุปกรณ์อื่นแล้ว');
      return;
    }

    const resolvePlayerIdsByNames = (names: string[] | undefined): string[] => {
      const result: string[] = [];

      for (const name of names || []) {
        const matches = appState.players.filter(
          (player) => player.nickname === name
        );

        // Old history before v54 has names only.
        // Refuse when the nickname is ambiguous instead of changing the wrong member.
        if (matches.length !== 1) return [];
        result.push(matches[0].id);
      }

      return result;
    };

    const storedIds = Array.isArray(selected.participantIds)
      ? selected.participantIds.filter(Boolean)
      : [];

    const fallbackIds = [
      ...resolvePlayerIdsByNames(selected.teamANames),
      ...resolvePlayerIdsByNames(selected.teamBNames),
    ];

    const playerIds = [
      ...new Set(
        (storedIds.length === 4 ? storedIds : fallbackIds).map(String)
      ),
    ];

    if (playerIds.length !== 4) {
      window.alert(
        'ยกเลิก Match นี้อัตโนมัติไม่ได้ เพราะหารายชื่อผู้เล่นเดิมไม่ครบ 4 คน\n\n' +
        'Match ที่จบหลังติดตั้ง v54 จะเก็บ Player ID ไว้และยกเลิกได้แม่นยำ'
      );
      return;
    }

    const involvedPlayers = appState.players.filter((player) =>
      playerIds.includes(player.id)
    );

    if (involvedPlayers.some((player) => player.paid)) {
      window.alert(
        'ยกเลิก Match นี้ไม่ได้ เพราะมีผู้เล่นใน Match ถูกยืนยัน Paid แล้ว\n\n' +
        'กรุณา Undo Payment ของผู้เล่นที่เกี่ยวข้องก่อน'
      );
      return;
    }

    const playerText = [
      ...(selected.teamANames || []),
      ...(selected.teamBNames || []),
    ].join(', ');

    const confirmed = window.confirm(
      `ยืนยันยกเลิก Match ที่เลือกหรือไม่?\n\n` +
      `Court: ${selected.courtName || '-'}\n` +
      `เวลา: ${selected.startTime || '-'}\n` +
      `ผู้เล่น: ${playerText || '-'}\n\n` +
      `ผลที่จะเกิดขึ้น:\n` +
      `- Match นี้จะไม่ถูกนำไปคิดเงิน\n` +
      `- ลบออกจากประวัติ Match ที่จบแล้ว\n` +
      `- ลด Match ของผู้เล่น 4 คน คนละ 1 Match\n` +
      `- คืนจำนวนลูกแบดของ Match นี้\n\n` +
      `หมายเหตุ: ผู้เล่นจะไม่ถูกนำกลับขึ้น Court อัตโนมัติ`
    );

    if (!confirmed) return;

    setAppState((prev) => {
      const current = prev.matchHistory.find(
        (item) => item.id === historyId
      ) as any;

      if (!current) return prev;

      const currentStoredIds = Array.isArray(current.participantIds)
        ? current.participantIds.filter(Boolean).map(String)
        : playerIds;

      const affectedIds = [...new Set(currentStoredIds)];
      const affectedSet = new Set(affectedIds);

      const stats = { ...getMemberStatsMap(prev as any) } as any;

      affectedIds.forEach((playerId) => {
        const stat = stats[playerId];
        if (!stat) return;

        const processedHistoryIds = Array.isArray(stat.processedHistoryIds)
          ? stat.processedHistoryIds
          : [];

        const wasProcessed = processedHistoryIds.includes(current.id);

        stats[playerId] = {
          ...stat,
          totalGames: wasProcessed
            ? Math.max(0, Number(stat.totalGames || 0) - 2)
            : Number(stat.totalGames || 0),
          totalMatches: wasProcessed
            ? Math.max(0, Number(stat.totalMatches || 0) - 1)
            : Number(stat.totalMatches || 0),
          processedHistoryIds: processedHistoryIds.filter(
            (id: string) => id !== current.id
          ),
          updatedAt: Date.now(),
        };
      });

      const existingUsages = getShuttleUsageLedger(prev as any);
      const nextUsages = existingUsages.filter(
        (item) => item.historyId !== current.id
      );

      const removedShuttles = Math.max(
        0,
        Number(current.shuttlecocksCount || 0)
      );

      const nextSessionUsedTotal = Math.max(
        0,
        Number(prev.sessionConfig.shuttlecocksUsedTotal || 0) -
          removedShuttles
      );

      const nextHistory = prev.matchHistory.filter(
        (item) => item.id !== current.id
      );

      const nextPlayers = prev.players.map((player) => {
        if (!affectedSet.has(player.id)) return player;

        // This is also recalculated by the existing matchHistory billing effect.
        // Explicit rollback makes the UI correct immediately.
        return {
          ...player,
          gamesPlayed: Math.max(0, Number(player.gamesPlayed || 0) - 2),
          matchesPlayed: Math.max(
            0,
            Number(player.matchesPlayed || 0) - 1
          ),
        };
      });

      const usageSummary = getSessionShuttleUsageSummary(
        nextUsages,
        prev.sessionConfig.date,
        nextSessionUsedTotal,
        prev.sessionConfig.shuttlecockPrice
      );

      return {
        ...prev,
        matchHistory: nextHistory,
        players: nextPlayers,
        memberLifetimeStats: stats,
        shuttleUsageLedger: nextUsages,
        sessionConfig: {
          ...prev.sessionConfig,
          shuttlecocksUsedTotal: nextSessionUsedTotal,
          shuttlecockPrice:
            usageSummary.quantity > 0
              ? usageSummary.averageUnitCost
              : prev.sessionConfig.shuttlecockPrice,
        },
      } as any;
    });

    setCancelFinishedMatchId('');
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

  // --- PREMATCH_3_FIFO_V64: Pre-Match Queue & Organizer Confirmation (3 slots) ---
  const handleConfirmPreMatch = (
    preMatch: ConfirmedPreMatch,
    slotNumber: 1 | 2 | 3 = 1
  ) => {
    const preMatchPlayerIds = new Set([...preMatch.teamA, ...preMatch.teamB]);

    const unavailablePlayers = appState.players.filter(
      (p) =>
        preMatchPlayerIds.has(p.id) &&
        (!p.isCheckedIn || p.status === 'resting' || p.status === 'left')
    );

    if (unavailablePlayers.length > 0) {
      window.alert(
        `จัด Pre-Match ไม่ได้\n\n${unavailablePlayers
          .map((p) => `• ${p.nickname} — ${p.status === 'resting' ? 'พักเหนื่อย' : 'ไม่พร้อมเล่น'}`)
          .join('\n')}\n\nกรุณาเปลี่ยนสถานะเป็น "พร้อมลงคิว" ก่อน`
      );
      return;
    }

    const otherConfirmed = [
      appState.confirmedPreMatch,
      appState.confirmedPreMatch2,
      confirmedPreMatch3,
    ].filter(
      (pm, index): pm is ConfirmedPreMatch =>
        Boolean(pm) && index !== slotNumber - 1
    );

    const duplicatePm = otherConfirmed.find((pm) =>
      [...pm.teamA, ...pm.teamB].some((id) => preMatchPlayerIds.has(id))
    );

    if (duplicatePm) {
      window.alert(
        `Confirm ไม่ได้ เพราะมีผู้เล่นซ้ำกับ Pre-Match #${duplicatePm.slotNumber || '?'}\n\nกรุณาเปลี่ยนผู้เล่นก่อน`
      );
      return;
    }

    setAppState((prev) => {
      const current1 = prev.confirmedPreMatch || null;
      const current2 = prev.confirmedPreMatch2 || null;
      const current3 = ((prev as any).confirmedPreMatch3 || null) as ConfirmedPreMatch | null;

      // Editing an already-confirmed PM must keep its original FIFO timestamp.
      const currentTarget =
        slotNumber === 1 ? current1 : slotNumber === 2 ? current2 : current3;

      const normalized: ConfirmedPreMatch = {
        ...preMatch,
        slotNumber,
        confirmedAt:
          currentTarget && currentTarget.id === preMatch.id
            ? currentTarget.confirmedAt
            : Number(preMatch.confirmedAt || Date.now()),
      };

      const next = [current1, current2, current3] as Array<ConfirmedPreMatch | null>;
      next[slotNumber - 1] = normalized;

      return {
        ...prev,
        confirmedPreMatch: next[0],
        confirmedPreMatch2: next[1],
        confirmedPreMatch3: next[2],
      } as any;
    });

    confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
  };

  const handleCancelPreMatch = (slotNumber: 1 | 2 | 3 = 1) => {
    setAppState((prev) => ({
      ...prev,
      confirmedPreMatch: slotNumber === 1 ? null : prev.confirmedPreMatch,
      confirmedPreMatch2: slotNumber === 2 ? null : prev.confirmedPreMatch2,
      confirmedPreMatch3:
        slotNumber === 3 ? null : (prev as any).confirmedPreMatch3,
    } as any));
  };

  const handleRemovePlayerFromPreMatch = (
    playerId: string,
    slotNumber: 1 | 2 | 3
  ) => {
    setAppState((prev) => {
      const source =
        slotNumber === 1
          ? prev.confirmedPreMatch
          : slotNumber === 2
          ? prev.confirmedPreMatch2
          : ((prev as any).confirmedPreMatch3 as ConfirmedPreMatch | null | undefined);

      if (!source) return prev;

      const allIds = [...source.teamA, ...source.teamB];
      if (!allIds.includes(playerId)) return prev;

      const vacantId = `__PM_VACANT__${playerId}__${Date.now()}`;

      const replacePlayer = (team: [string, string]): [string, string] =>
        team.map((id) => (id === playerId ? vacantId : id)) as [string, string];

      const updatedPreMatch: ConfirmedPreMatch = {
        ...source,
        teamA: replacePlayer(source.teamA),
        teamB: replacePlayer(source.teamB),
        pairingLabelThai: '⚠️ รอผู้เล่นแทน',
        explanationThai:
          'มีสมาชิกขอพัก/กลับหลังจาก Confirm แล้ว ผู้จัดต้องเลือกผู้เล่นแทนก่อนลงคอร์ท',
        // Keep FIFO position while editing/replacing a player.
        confirmedAt: source.confirmedAt || Date.now(),
      };

      return {
        ...prev,
        confirmedPreMatch:
          slotNumber === 1 ? updatedPreMatch : prev.confirmedPreMatch,
        confirmedPreMatch2:
          slotNumber === 2 ? updatedPreMatch : prev.confirmedPreMatch2,
        confirmedPreMatch3:
          slotNumber === 3 ? updatedPreMatch : (prev as any).confirmedPreMatch3,
      } as any;
    });
  };

  const handleStartConfirmedPreMatch = (
    courtId: string,
    preMatch: ConfirmedPreMatch,
    slotNumber: 1 | 2 | 3 = 1
  ) => {
    const confirmedQueue = [
      appState.confirmedPreMatch,
      appState.confirmedPreMatch2,
      confirmedPreMatch3,
    ]
      .filter((pm): pm is ConfirmedPreMatch => Boolean(pm))
      .sort((a, b) => {
        const timeA = Number(a.confirmedAt || 0);
        const timeB = Number(b.confirmedAt || 0);
        if (timeA !== timeB) return timeA - timeB;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });

    const nextPreMatch = confirmedQueue[0];

    if (nextPreMatch && nextPreMatch.id !== preMatch.id) {
      window.alert(
        `PM นี้ยังไม่ถึงคิว\nต้องส่ง Pre-Match #${nextPreMatch.slotNumber || '?'} ลงสนามก่อน`
      );
      return;
    }

    const readyIds = [...preMatch.teamA, ...preMatch.teamB];
    const invalidForStart = readyIds.some((id) => {
      if (!id || id.startsWith('__PM_VACANT__')) return true;
      const p = players.find((x) => x.id === id);
      return !p || !p.isCheckedIn || p.status === 'resting' || p.status === 'left';
    });

    if (invalidForStart) {
      window.alert(
        'ยังเปิดสนามไม่ได้ เพราะ Pre-Match มีช่องว่าง หรือมีสมาชิกที่พัก/กลับแล้ว กรุณาเลือกผู้เล่นแทนก่อน'
      );
      return;
    }

    const selectedIds = new Set([...preMatch.teamA, ...preMatch.teamB]);
    const stillPlaying = activeMatches
      .flatMap((m) => [...m.teamA, ...m.teamB])
      .filter((id) => selectedIds.has(id));

    if (stillPlaying.length > 0) {
      window.alert('ยังส่ง PM ลงสนามไม่ได้ เพราะมีผู้เล่นบางคนกำลังเล่นอยู่');
      return;
    }

    const isTargetBusy = activeMatches.some((m) => m.courtId === courtId);
    let targetCourtId = courtId;
    let targetCourtName = '';

    if (isTargetBusy) {
      const freeIdx = sessionConfig.courtNames.findIndex((_, idx) => {
        const id = `court-${idx + 1}`;
        return !activeMatches.some((m) => m.courtId === id);
      });

      if (freeIdx === -1) {
        window.alert('ยังไม่มีคอร์ทว่างสำหรับ Pre-Match นี้');
        return;
      }

      targetCourtId = `court-${freeIdx + 1}`;
      targetCourtName =
        sessionConfig.courtNames[freeIdx] || `คอร์ท ${freeIdx + 1}`;
    } else {
      const courtIndex = parseInt(courtId.replace('court-', '')) - 1;
      targetCourtName =
        sessionConfig.courtNames[courtIndex] || `คอร์ท ${courtIndex + 1}`;
    }

    handleStartMatch(
      targetCourtId,
      targetCourtName,
      preMatch.teamA,
      preMatch.teamB
    );

    setAppState((prev) => ({
      ...prev,
      confirmedPreMatch:
        slotNumber === 1 ? null : prev.confirmedPreMatch,
      confirmedPreMatch2:
        slotNumber === 2 ? null : prev.confirmedPreMatch2,
      confirmedPreMatch3:
        slotNumber === 3 ? null : (prev as any).confirmedPreMatch3,
    } as any));
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
    // ACTIVE_MATCH_PAYMENT_LOCK_V43
    // Never finalize payment while the player is still on an active court.
    const targetIsInActiveMatch = appState.activeMatches.some((match) =>
      [...match.teamA, ...match.teamB].includes(playerId)
    );

    if (paid && targetIsInActiveMatch) {
      window.alert(
        `"${target.nickname}" ยังอยู่ใน Match ที่กำลังเล่น\n\n` +
        'ยังไม่สามารถบันทึกชำระเงินได้ เพราะยอด Match ยังไม่ Final\n\n' +
        'กรุณารอ Finish Match ก่อน หรือให้ผู้จัดปรับ Billing หาก Match นี้ถูกยกเลิก'
      );
      return;
    }

    // Payment is allowed only AFTER checkout.
    if (paid && target.isCheckedIn) {
      window.alert(
        `กรุณา Check-out "${target.nickname}" ก่อนชำระเงิน\n\nระบบจะล็อกยอดหลัง Check-out เพื่อป้องกันยอดเปลี่ยนระหว่างเล่น`
      );
      return;
    }

    // Apply organizer match adjustment before calculating final charge.
    const adjustedMatches = Math.max(
      0,
      Number(target.matchesPlayed || 0) +
        Number((target as any).billingMatchAdjustment || 0)
    );

    const adjustedPlayer = {
      ...target,
      matchesPlayed: adjustedMatches,
    };

    const finalCharge = calculatePlayerFinalCharge(
      adjustedPlayer,
      sessionConfig,
      promotionRedemptions,
      sessionConfig.date
    );

    const manualAmountAdjustment = Number(
      (target as any).billingAmountAdjustment || 0
    );

    const calculatedAmount = Math.max(
      0,
      Math.round(finalCharge.finalTotal + manualAmountAdjustment)
    );

    // If BillingView already sends the final amount, use it.
    // Otherwise calculate from the canonical billing formula.
    const safeAmount =
      paid
        ? typeof amount === 'number' && Number.isFinite(amount)
          ? Math.max(0, amount)
          : calculatedAmount
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
              paymentMethod: paid
                ? p.paymentMethod
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
    // Billing participants for the current session only.
    const isBillingParticipant = (p: Player) =>
      p.isCheckedIn ||
      p.status === 'left' ||
      Boolean(p.checkInTime) ||
      Boolean(p.checkInTimestamp) ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      p.paid;

    const eligible = appState.players.filter(
      (p) =>
        isBillingParticipant(p) &&
        !p.isCheckedIn &&
        !p.paid
    );

    if (eligible.length === 0) {
      window.alert('ยังไม่มีสมาชิกที่ Check-out และรอชำระเงิน');
      return;
    }

    const eligibleIds = new Set(
      eligible.map((p) => p.id)
    );

    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (!eligibleIds.has(p.id)) return p;

        const adjustedMatches = Math.max(
          0,
          Number(p.matchesPlayed || 0) +
            Number((p as any).billingMatchAdjustment || 0)
        );

        const adjustedPlayer = {
          ...p,
          matchesPlayed: adjustedMatches,
        };

        const finalCharge = calculatePlayerFinalCharge(
          adjustedPlayer,
          prev.sessionConfig,
          getPromotionRedemptions(prev as any),
          prev.sessionConfig.date
        );

        const manualAmountAdjustment = Number(
          (p as any).billingAmountAdjustment || 0
        );

        const finalAmount = Math.max(
          0,
          Math.round(
            finalCharge.finalTotal +
            manualAmountAdjustment
          )
        );

        return {
          ...p,
          paid: true,
          paidAmount: finalAmount,
          paymentTime: new Date().toLocaleTimeString('th-TH', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        };
      }),
    }));

    confetti({
      particleCount: 70,
      spread: 80,
      origin: { y: 0.6 },
    });
  };
  // BILLING_PREVIEW_CALC_V57B
  // Preview must use the SAME effective Match / Extra / manual amount
  // that BillingView uses after organizer adjustments.
  const calculateBillingPreviewChargeV57B = (player: Player) => {
    const baseMatches = Math.max(
      0,
      Number(player.matchesPlayed || 0)
    );

    const matchAdjustment = Number(
      (player as any).billingMatchAdjustment || 0
    );

    const amountAdjustment = Number(
      (player as any).billingAmountAdjustment || 0
    );

    const effectiveMatches = Math.max(
      0,
      baseMatches + matchAdjustment
    );

    const gameDifference = effectiveMatches - baseMatches;

    const adjustedPlayer: Player = {
      ...player,
      matchesPlayed: effectiveMatches,
      gamesPlayed: Math.max(
        0,
        Number(player.gamesPlayed || 0) + gameDifference * 2
      ),
    };

    const charge = calculatePlayerFinalCharge(
      adjustedPlayer,
      appState.sessionConfig,
      getPromotionRedemptions(appState as any),
      appState.sessionConfig.date
    );

    return {
      ...charge,
      finalTotal: Math.max(
        0,
        Math.round(Number(charge.finalTotal || 0) + amountAdjustment)
      ),
    };
  };

  // HANDLE_BILLING_ADJUSTMENT_V31
  const handleApplyBillingAdjustment = (
    playerId: string,
    kind: 'match' | 'extra' | 'amount',
    delta: number,
    reason: string
  ) => {
    // BILLING_ADJUSTMENT_CONFIRM_V57
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    if (target.paid) {
      window.alert(
        `แก้ยอด "${target.nickname}" ไม่ได้ เพราะยืนยัน Paid แล้ว\n\n` +
        `กรุณา Undo Payment ก่อน หากต้องการแก้ไขยอด`
      );
      return;
    }

    const currentCharge = calculateBillingPreviewChargeV57B(target);

    const currentMatchAdj = Number(
      (target as any).billingMatchAdjustment || 0
    );
    const currentAmountAdj = Number(
      (target as any).billingAmountAdjustment || 0
    );
    const currentExtra = Number(target.extraShuttlecocks || 0);

    let projected: Player = { ...target };
    let actionText = '';

    if (kind === 'match') {
      const minDelta = -(target.matchesPlayed || 0);
      const nextMatchAdj = Math.max(
        minDelta,
        currentMatchAdj + delta
      );

      projected = {
        ...projected,
        ...({ billingMatchAdjustment: nextMatchAdj } as any),
      };

      const beforeMatches = Math.max(
        0,
        Number(target.matchesPlayed || 0) + currentMatchAdj
      );
      const afterMatches = Math.max(
        0,
        Number(target.matchesPlayed || 0) + nextMatchAdj
      );

      actionText =
        `ปรับจำนวน Match: ${beforeMatches} → ${afterMatches} Match`;
    } else if (kind === 'extra') {
      const nextExtra = Math.max(0, currentExtra + delta);

      projected = {
        ...projected,
        extraShuttlecocks: nextExtra,
      };

      actionText =
        `ปรับ Extra Shuttle: ${currentExtra} → ${nextExtra} ลูก`;
    } else {
      const nextAmountAdj = currentAmountAdj + delta;

      projected = {
        ...projected,
        ...({ billingAmountAdjustment: nextAmountAdj } as any),
      };

      actionText =
        `ปรับยอดเงิน: ${currentAmountAdj >= 0 ? '+' : ''}${currentAmountAdj}฿ ` +
        `→ ${nextAmountAdj >= 0 ? '+' : ''}${nextAmountAdj}฿`;
    }

    const projectedCharge = calculateBillingPreviewChargeV57B(projected);

    const beforeTotal = Number(currentCharge.finalTotal || 0);
    const afterTotal = Number(projectedCharge.finalTotal || 0);
    const totalDiff = afterTotal - beforeTotal;

    const confirmed = window.confirm(
      `ยืนยันการปรับยอดหรือไม่?\n\n` +
      `สมาชิก: ${target.nickname}\n` +
      `${actionText}\n` +
      `เหตุผล: ${reason.trim() || '-'}\n\n` +
      `ยอดก่อนแก้: ${beforeTotal.toLocaleString()} บาท\n` +
      `ยอดหลังแก้: ${afterTotal.toLocaleString()} บาท\n` +
      `ผลต่าง: ${totalDiff >= 0 ? '+' : ''}${totalDiff.toLocaleString()} บาท\n\n` +
      `กด OK เพื่อยืนยันการแก้ไข`
    );

    if (!confirmed) return;


    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId) return p;
        if (p.paid) return p;

        const currentMatchAdj = Number((p as any).billingMatchAdjustment || 0);
        const currentAmountAdj = Number((p as any).billingAmountAdjustment || 0);
        const currentExtra = Number(p.extraShuttlecocks || 0);

        let nextMatchAdj = currentMatchAdj;
        let nextAmountAdj = currentAmountAdj;
        let nextExtra = currentExtra;

        if (kind === 'match') {
          const minDelta = -(p.matchesPlayed || 0);
          nextMatchAdj = Math.max(minDelta, currentMatchAdj + delta);
        } else if (kind === 'extra') {
          nextExtra = Math.max(0, currentExtra + delta);
        } else {
          nextAmountAdj = currentAmountAdj + delta;
        }

        const log = Array.isArray((p as any).billingAdjustmentLog)
          ? (p as any).billingAdjustmentLog
          : [];

        const entry = {
          id: `billing-adjust-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          kind,
          delta,
          reason: reason.trim(),
          createdAt: Date.now(),
        };

        return {
          ...p,
          billingMatchAdjustment: nextMatchAdj,
          billingAmountAdjustment: nextAmountAdj,
          extraShuttlecocks: nextExtra,
          billingAdjustmentReason: reason.trim(),
          billingAdjustmentLog: [...log, entry].slice(-100),
        } as any;
      }),
    }));
  };

  const handleUndoBillingAdjustment = (playerId: string) => {
    // BILLING_UNDO_CONFIRM_V57
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    if (target.paid) {
      window.alert(
        `Undo การปรับยอด "${target.nickname}" ไม่ได้ เพราะยืนยัน Paid แล้ว`
      );
      return;
    }

    const adjustmentLog = Array.isArray(
      (target as any).billingAdjustmentLog
    )
      ? [...(target as any).billingAdjustmentLog]
      : [];

    const lastAdjustment = adjustmentLog[adjustmentLog.length - 1];
    if (!lastAdjustment) {
      window.alert('ไม่มีรายการปรับยอดล่าสุดให้ Undo');
      return;
    }

    const currentCharge = calculateBillingPreviewChargeV57B(target);

    let projected: Player = { ...target };
    let undoText = '';

    if (lastAdjustment.kind === 'match') {
      const currentAdj = Number(
        (target as any).billingMatchAdjustment || 0
      );
      const nextAdj =
        currentAdj - Number(lastAdjustment.delta || 0);

      projected = {
        ...projected,
        ...({ billingMatchAdjustment: nextAdj } as any),
      };

      undoText =
        `คืนการปรับ Match ${Number(lastAdjustment.delta || 0) >= 0 ? '+' : ''}` +
        `${Number(lastAdjustment.delta || 0)}`;
    } else if (lastAdjustment.kind === 'extra') {
      const currentExtra = Number(target.extraShuttlecocks || 0);
      const nextExtra = Math.max(
        0,
        currentExtra - Number(lastAdjustment.delta || 0)
      );

      projected = {
        ...projected,
        extraShuttlecocks: nextExtra,
      };

      undoText =
        `คืนการปรับ Extra ${Number(lastAdjustment.delta || 0) >= 0 ? '+' : ''}` +
        `${Number(lastAdjustment.delta || 0)} ลูก`;
    } else {
      const currentAdj = Number(
        (target as any).billingAmountAdjustment || 0
      );
      const nextAdj =
        currentAdj - Number(lastAdjustment.delta || 0);

      projected = {
        ...projected,
        ...({ billingAmountAdjustment: nextAdj } as any),
      };

      undoText =
        `คืนการปรับเงิน ${Number(lastAdjustment.delta || 0) >= 0 ? '+' : ''}` +
        `${Number(lastAdjustment.delta || 0)} บาท`;
    }

    const projectedCharge = calculateBillingPreviewChargeV57B(projected);

    const beforeTotal = Number(currentCharge.finalTotal || 0);
    const afterTotal = Number(projectedCharge.finalTotal || 0);

    const confirmed = window.confirm(
      `ยืนยัน Undo การปรับยอดล่าสุดหรือไม่?\n\n` +
      `สมาชิก: ${target.nickname}\n` +
      `${undoText}\n` +
      `เหตุผลเดิม: ${String(lastAdjustment.reason || '-')}\n\n` +
      `ยอดปัจจุบัน: ${beforeTotal.toLocaleString()} บาท\n` +
      `หลัง Undo: ${afterTotal.toLocaleString()} บาท\n\n` +
      `กด OK เพื่อยืนยัน`
    );

    if (!confirmed) return;


    setAppState((prev) => ({
      ...prev,
      players: prev.players.map((p) => {
        if (p.id !== playerId || p.paid) return p;

        const log = Array.isArray((p as any).billingAdjustmentLog)
          ? [...(p as any).billingAdjustmentLog]
          : [];

        const last = log.pop();
        if (!last) return p;

        let matchAdj = Number((p as any).billingMatchAdjustment || 0);
        let amountAdj = Number((p as any).billingAmountAdjustment || 0);
        let extra = Number(p.extraShuttlecocks || 0);

        if (last.kind === 'match') {
          matchAdj -= Number(last.delta || 0);
        } else if (last.kind === 'extra') {
          extra = Math.max(0, extra - Number(last.delta || 0));
        } else if (last.kind === 'amount') {
          amountAdj -= Number(last.delta || 0);
        }

        const previousReason =
          log.length > 0 ? String(log[log.length - 1].reason || '') : '';

        return {
          ...p,
          billingMatchAdjustment: matchAdj,
          billingAmountAdjustment: amountAdj,
          extraShuttlecocks: extra,
          billingAdjustmentReason: previousReason || undefined,
          billingAdjustmentLog: log,
        } as any;
      }),
    }));
  };

  // BILLING_EXTRA_CONFIRM_V57
  const handleUpdatePlayerExtraShuttlecocks = (
    playerId: string,
    delta: number
  ) => {
    const target = appState.players.find((p) => p.id === playerId);
    if (!target) return;

    if (target.paid) {
      window.alert(
        `แก้ Extra Shuttle "${target.nickname}" ไม่ได้ เพราะยืนยัน Paid แล้ว`
      );
      return;
    }

    const currentExtra = Number(target.extraShuttlecocks || 0);
    const nextExtra = Math.max(0, currentExtra + delta);

    if (nextExtra === currentExtra) return;

    const currentCharge = calculateBillingPreviewChargeV57B(target);

    const projected: Player = {
      ...target,
      extraShuttlecocks: nextExtra,
    };

    const projectedCharge = calculateBillingPreviewChargeV57B(projected);

    const beforeTotal = Number(currentCharge.finalTotal || 0);
    const afterTotal = Number(projectedCharge.finalTotal || 0);
    const extraPrice = Number(
      appState.sessionConfig.extraShuttlecockPrice || 0
    );

    const confirmed = window.confirm(
      `ยืนยันการปรับ Extra Shuttle หรือไม่?\n\n` +
      `สมาชิก: ${target.nickname}\n` +
      `จำนวน: ${currentExtra} → ${nextExtra} ลูก\n` +
      `ราคา Extra: ${extraPrice.toLocaleString()} บาท/ลูก\n\n` +
      `ยอดก่อนแก้: ${beforeTotal.toLocaleString()} บาท\n` +
      `ยอดหลังแก้: ${afterTotal.toLocaleString()} บาท\n` +
      `ผลต่าง: ${(afterTotal - beforeTotal) >= 0 ? '+' : ''}` +
      `${(afterTotal - beforeTotal).toLocaleString()} บาท\n\n` +
      `กด OK เพื่อยืนยัน`
    );

    if (!confirmed) return;

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
    setAppState((prev) => {
      // AUTO_SESSION_HOURS_FROM_TIME_V33
      // เวลาเริ่ม/จบเป็น Source of Truth ของจำนวนชั่วโมงเช่าคอร์ท
      // เช่น 19:00 -> 23:00 = 4 ชั่วโมง
      const timeChanged =
        newConfig.startTime !== prev.sessionConfig.startTime ||
        newConfig.endTime !== prev.sessionConfig.endTime;

      let totalHours = newConfig.totalHours;

      if (timeChanged) {
        const parseMinutes = (value?: string): number | null => {
          const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
          if (!match) return null;

          const h = Number(match[1]);
          const m = Number(match[2]);

          if (
            !Number.isFinite(h) ||
            !Number.isFinite(m) ||
            h < 0 ||
            h > 23 ||
            m < 0 ||
            m > 59
          ) {
            return null;
          }

          return h * 60 + m;
        };


        const startMinutes = parseMinutes(newConfig.startTime);
        const endMinutes = parseMinutes(newConfig.endTime);

        if (startMinutes !== null && endMinutes !== null) {
          let durationMinutes = endMinutes - startMinutes;

          // รองรับกรณีเล่นข้ามเที่ยงคืน เช่น 22:00 -> 01:00
          if (durationMinutes <= 0) {
            durationMinutes += 24 * 60;
          }

          totalHours = Math.round((durationMinutes / 60) * 100) / 100;
        }
      }

      return {
        ...prev,
        sessionConfig: {
          ...newConfig,
          totalHours,
        },
      };
    });
  };

  // COURT_NAME_SYNC_TOPLEVEL_V70B
  // IMPORTANT: this handler must stay at App component scope.
  // sessionCourts[].name = source of truth; courtNames = compatibility mirror
  // for Pre-Match / Courts / Header / exports.
  const handleUpdateSessionCourtsV70B = (newConfig: SessionConfig) => {
    setAppState((prev) => {
      const oldNames = Array.isArray(prev.sessionConfig.courtNames)
        ? prev.sessionConfig.courtNames
        : [];

      const allSessionCourts = Array.isArray(newConfig.sessionCourts)
        ? newConfig.sessionCourts
        : [];

      const nextNames =
        allSessionCourts.length > 0
          ? allSessionCourts.map((court, index) => {
              const name = String(court?.name || '').trim();
              return (
                name ||
                oldNames[index] ||
                `คอร์ท ${index + 1}`
              );
            })
          : Array.isArray(newConfig.courtNames)
          ? newConfig.courtNames
          : oldNames;

      const nextConfig: SessionConfig = {
        ...newConfig,
        courtNames: nextNames,
        courtCount: nextNames.length || newConfig.courtCount,
      };

      const renameByOldName = new Map<string, string>();
      oldNames.forEach((oldName, index) => {
        const nextName = nextNames[index];
        if (oldName && nextName && oldName !== nextName) {
          renameByOldName.set(oldName, nextName);
        }
      });

      const nextActiveMatches = prev.activeMatches.map((match) => {
        const courtIndex =
          Number(String(match.courtId || '').replace('court-', '')) - 1;

        const nextName =
          Number.isInteger(courtIndex) && courtIndex >= 0
            ? nextNames[courtIndex]
            : renameByOldName.get(match.courtName);

        return nextName && nextName !== match.courtName
          ? { ...match, courtName: nextName }
          : match;
      });

      const nextMatchHistory = prev.matchHistory.map((item) => {
        const nextName = renameByOldName.get(item.courtName);
        return nextName
          ? { ...item, courtName: nextName }
          : item;
      });

      const syncPreMatchCourt = (preMatch: any) => {
        if (!preMatch?.targetCourtName) return preMatch;
        const nextName = renameByOldName.get(preMatch.targetCourtName);
        return nextName
          ? { ...preMatch, targetCourtName: nextName }
          : preMatch;
      };

      return {
        ...prev,
        sessionConfig: nextConfig,
        activeMatches: nextActiveMatches,
        matchHistory: nextMatchHistory,
        confirmedPreMatch: syncPreMatchCourt(prev.confirmedPreMatch),
        confirmedPreMatch2: syncPreMatchCourt(prev.confirmedPreMatch2),
        ...(Object.prototype.hasOwnProperty.call(prev, 'confirmedPreMatch3')
          ? {
              confirmedPreMatch3: syncPreMatchCourt(
                (prev as any).confirmedPreMatch3
              ),
            }
          : {}),
      } as any;
    });
  };
  // MEMBER_LOGOUT_CLEAR_SESSION_V59
  const handleMemberLogout = () => {
    if (isOrganizerMode || !currentMemberId) return;

    const member = appState.players.find((p) => p.id === currentMemberId);

    const warning = member?.isCheckedIn
      ? `\n\n⚠️ ตอนนี้คุณยัง Check-in และอยู่ในคิวเล่น\n` +
        `Logout จะล้างเฉพาะการ Login บนอุปกรณ์นี้ แต่จะไม่ Check-out และไม่เอาชื่อออกจากคิว`
      : '';

    const confirmed = window.confirm(
      `Logout สมาชิก${member?.nickname ? ` "${member.nickname}"` : ''} หรือไม่?\n\n` +
      `ระบบจะล้าง Member Session บนอุปกรณ์นี้\n` +
      `- ล้างชื่อสมาชิกที่จำไว้\n` +
      `- ล้างสถานะ Popup Check-in ของ browser session\n` +
      `- กลับไปหน้าเลือกชื่อ / ใส่ PIN\n` +
      `- ไม่ลบ Match, Billing หรือประวัติการเล่น` +
      warning
    );

    if (!confirmed) return;

    if (typeof window !== 'undefined') {
      // Support both old and new GuanGuan builds.
      localStorage.removeItem('badminton_active_member_id');
      sessionStorage.removeItem('badminton_active_member_id');

      // Clear only member/session UX keys. Do NOT clear the whole storage,
      // because app data, organizer preferences and alert settings must remain.
      const sessionKeysToRemove: string[] = [];

      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (!key) continue;

        if (
          key.startsWith('guanguan_checkin_prompt_') ||
          key.startsWith('guanguan_member_session_')
        ) {
          sessionKeysToRemove.push(key);
        }
      }

      sessionKeysToRemove.forEach((key) =>
        sessionStorage.removeItem(key)
      );
    }

    setCurrentMemberId('');
    setIsMemberGateOpen(true);
    setIsSelfCheckInOpen(false);
    setIsMemberPinModalOpen(false);
    setCurrentTab('prematch');
  };

  // DISCARD_SESSION_SAFE_ROLLBACK_V72D
  // Reset only CURRENT SESSION activity.
  // IMPORTANT:
  // - Preserve the complete Member Master (prev.players)
  // - Preserve pre-existing Lifetime Stats
  // - Roll back only Match/Game/Session increments created by this current session
  const handleDiscardSessionWithoutArchive = async (): Promise<boolean> => {
    if (!isOrganizerMode) {
      window.alert('เฉพาะผู้จัดก๊วนเท่านั้นที่ Reset ทิ้งได้');
      return false;
    }

    const sourceState = appStateRef.current;
    const currentDate = sourceState.sessionConfig.date;
    const playerIds = sourceState.players.map((player) => player.id);

    // v72c helper cancels test invoices instead of deleting them.
    try {
      await deleteSessionPaymentTransactions(
        currentDate,
        playerIds
      );
    } catch (error) {
      console.error(
        '[GuanGuan] discard payment cancel failed',
        error
      );

      window.alert(
        'ยังไม่ได้ Reset\n\n' +
        'ยกเลิก Payment Transaction ของรอบทดลองไม่สำเร็จ ' +
        'ระบบจึงหยุดไว้ก่อนเพื่อป้องกันข้อมูลทดลองปนกับเงินจริง'
      );

      return false;
    }

    // Existing saved archives are used only to determine whether a member
    // already has a REAL saved attendance on the same date and to restore
    // lastAttendanceDate if today's trial attendance is rolled back.
    const rawArchives = loadSessionArchives() as any[];

    const newestByDate = new Map<string, any>();

    for (const archive of rawArchives) {
      const date = String(archive?.archiveDate || '').trim();
      if (!date) continue;

      const existing = newestByDate.get(date);

      if (
        !existing ||
        Number(archive?.savedAt || 0) >=
          Number(existing?.savedAt || 0)
      ) {
        newestByDate.set(date, archive);
      }
    }

    const savedArchives = Array.from(
      newestByDate.values()
    ) as any[];

    setAppState((prev) => {
      const stats = {
        ...getMemberStatsMap(prev as any),
      } as any;

      const playerById = new Map(
        prev.players.map((player) => [
          player.id,
          player,
        ])
      );

      const nicknameToIds = new Map<string, string[]>();

      for (const player of prev.players) {
        const key = String(player.nickname || '')
          .trim()
          .toLowerCase();

        if (!key) continue;

        const ids = nicknameToIds.get(key) || [];
        ids.push(player.id);
        nicknameToIds.set(key, ids);
      }

      const resolveNickname = (
        nickname: unknown
      ): string | null => {
        const key = String(nickname || '')
          .trim()
          .toLowerCase();

        if (!key) return null;

        const ids = nicknameToIds.get(key) || [];

        return ids.length === 1 ? ids[0] : null;
      };

      const getHistoryPlayerIds = (
        history: any
      ): string[] => {
        const ids = new Set<string>();

        const directLists = [
          history?.participantIds,
          history?.teamAPlayerIds,
          history?.teamBPlayerIds,
        ];

        for (const list of directLists) {
          if (!Array.isArray(list)) continue;

          for (const id of list) {
            const value = String(id || '').trim();

            if (value && playerById.has(value)) {
              ids.add(value);
            }
          }
        }

        // Compatibility with old Match History that stored only nicknames.
        if (ids.size === 0) {
          const nameLists = [
            history?.teamA,
            history?.teamB,
          ];

          for (const list of nameLists) {
            if (!Array.isArray(list)) continue;

            for (const nickname of list) {
              const id = resolveNickname(nickname);
              if (id) ids.add(id);
            }
          }
        }

        return Array.from(ids);
      };

      const historyIdsByPlayer =
        new Map<string, Set<string>>();

      for (const history of prev.matchHistory as any[]) {
        const historyId = String(history?.id || '').trim();
        if (!historyId) continue;

        for (const playerId of getHistoryPlayerIds(history)) {
          const ids =
            historyIdsByPlayer.get(playerId) ||
            new Set<string>();

          ids.add(historyId);
          historyIdsByPlayer.set(playerId, ids);
        }
      }

      const snapshotParticipated = (
        snapshot: any
      ): boolean => {
        return (
          Boolean(snapshot?.isCheckedIn) ||
          snapshot?.status === 'left' ||
          Boolean(snapshot?.checkInTime) ||
          Boolean(snapshot?.checkInTimestamp) ||
          Number(snapshot?.matchesPlayed || 0) > 0 ||
          Number(snapshot?.gamesPlayed || 0) > 0 ||
          Number(snapshot?.extraShuttlecocks || 0) > 0 ||
          Boolean(snapshot?.paid) ||
          Number(snapshot?.paidAmount || 0) > 0
        );
      };

      const archiveContainsPlayer = (
        archive: any,
        player: Player
      ): boolean => {
        const snapshots = Array.isArray(
          archive?.playersSnapshot
        )
          ? archive.playersSnapshot
          : [];

        const nicknameKey = String(player.nickname || '')
          .trim()
          .toLowerCase();

        return snapshots.some((snapshot: any) => {
          const sameId =
            String(snapshot?.id || '') === player.id;

          const sameNickname =
            nicknameKey &&
            String(snapshot?.nickname || '')
              .trim()
              .toLowerCase() === nicknameKey;

          return (
            (sameId || sameNickname) &&
            snapshotParticipated(snapshot)
          );
        });
      };

      const findPreviousAttendanceDate = (
        player: Player
      ): string | undefined => {
        let latest: string | undefined;

        for (const archive of savedArchives) {
          const date = String(
            archive?.archiveDate || ''
          ).trim();

          if (!date || date >= currentDate) continue;
          if (!archiveContainsPlayer(archive, player)) {
            continue;
          }

          if (!latest || date > latest) {
            latest = date;
          }
        }

        return latest;
      };

      const hasSavedAttendanceToday = (
        player: Player
      ): boolean => {
        return savedArchives.some(
          (archive) =>
            String(archive?.archiveDate || '') ===
              currentDate &&
            archiveContainsPlayer(archive, player)
        );
      };

      for (const player of prev.players) {
        const stat = stats[player.id];
        if (!stat) continue;

        const processedHistoryIds = Array.isArray(
          stat.processedHistoryIds
        )
          ? stat.processedHistoryIds.map(
              (id: unknown) => String(id)
            )
          : [];

        const sessionHistoryIds =
          historyIdsByPlayer.get(player.id) ||
          new Set<string>();

        const processedCurrentMatchIds =
          processedHistoryIds.filter((id: string) =>
            sessionHistoryIds.has(id)
          );

        const rollbackMatchCount =
          processedCurrentMatchIds.length;

        const participatedThisSession =
          Boolean(player.isCheckedIn) ||
          player.status === 'left' ||
          Boolean(player.checkInTime) ||
          Boolean(player.checkInTimestamp) ||
          Number(player.matchesPlayed || 0) > 0 ||
          Number(player.gamesPlayed || 0) > 0 ||
          Number(player.extraShuttlecocks || 0) > 0 ||
          Boolean(player.paid) ||
          rollbackMatchCount > 0;

        let nextTotalSessions = Math.max(
          0,
          Number(stat.totalSessions || 0)
        );

        let nextLastAttendanceDate =
          stat.lastAttendanceDate;

        // Check-in increments totalSessions once for this current date.
        // Roll it back only when there is no already-saved REAL archive
        // for this same date.
        if (
          participatedThisSession &&
          String(stat.lastAttendanceDate || '') ===
            currentDate &&
          !hasSavedAttendanceToday(player)
        ) {
          nextTotalSessions = Math.max(
            0,
            nextTotalSessions - 1
          );

          nextLastAttendanceDate =
            findPreviousAttendanceDate(player);
        }

        stats[player.id] = {
          ...stat,

          totalSessions: nextTotalSessions,

          totalMatches: Math.max(
            0,
            Number(stat.totalMatches || 0) -
              rollbackMatchCount
          ),

          totalGames: Math.max(
            0,
            Number(stat.totalGames || 0) -
              rollbackMatchCount * 2
          ),

          processedHistoryIds:
            processedHistoryIds.filter(
              (id: string) =>
                !sessionHistoryIds.has(id)
            ),

          lastAttendanceDate:
            nextLastAttendanceDate,

          updatedAt: Date.now(),
        };
      }

      // IMPORTANT: preserve ALL members from prev.players.
      // We only clean today's session fields.
      const nextPlayers = prev.players.map(
        (player) =>
          ({
            ...player,

            todayRoster: false,
            isCheckedIn: false,
            checkInTime: undefined,
            checkInTimestamp: undefined,
            lastMatchFinishTime: undefined,
            status: 'waiting' as PlayerStatus,

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

            stopAfterCurrentMatch: false,
            stopAfterCurrentMatchId: undefined,
            stopRequestedAt: undefined,
          } as any)
      );

      return {
        ...prev,

        // Keep complete Member Master.
        players: nextPlayers,

        // Remove current-session activity only.
        activeMatches: [],
        matchHistory: [],
        confirmedPreMatch: null,
        confirmedPreMatch2: null,

        ...(Object.prototype.hasOwnProperty.call(
          prev,
          'confirmedPreMatch3'
        )
          ? { confirmedPreMatch3: null }
          : {}),

        // Preserve all old stats; rollback current session only.
        memberLifetimeStats: stats,

        // Current-date operational records are discarded.
        promotionRedemptions:
          getPromotionRedemptions(prev as any).filter(
            (item) =>
              item.sessionDate !== currentDate
          ),

        shuttleUsageLedger:
          getShuttleUsageLedger(prev as any).filter(
            (item) =>
              item.sessionDate !== currentDate
          ),

        // Preserve settings, court names, venue, prices and the same date.
        sessionConfig: {
          ...prev.sessionConfig,
          shuttlecocksUsedTotal: 0,
        },
      } as any;
    });

    if (typeof window !== 'undefined') {
      localStorage.removeItem(
        'badminton_active_member_id'
      );

      sessionStorage.removeItem(
        'badminton_active_member_id'
      );

      const removeKeys: string[] = [];

      for (
        let index = 0;
        index < sessionStorage.length;
        index += 1
      ) {
        const key = sessionStorage.key(index);

        if (
          key &&
          (
            key.startsWith(
              'guanguan_checkin_prompt_'
            ) ||
            key.startsWith(
              'guanguan_member_session_'
            )
          )
        ) {
          removeKeys.push(key);
        }
      }

      removeKeys.forEach((key) =>
        sessionStorage.removeItem(key)
      );
    }

    setCurrentMemberId('');
    setIsSelfCheckInOpen(false);
    setIsMemberPinModalOpen(false);
    setCurrentTab('prematch');

    window.alert(
      '✅ Reset ทิ้งเรียบร้อย\n\n' +
      '• Member Master ยังอยู่ครบ\n' +
      '• สถิติเดิมยังอยู่\n' +
      '• ลบเฉพาะ Session / Match / Game / Billing / Payment ที่เกิดจากรอบปัจจุบัน\n' +
      '• ไม่สร้าง Archive'
    );

    return true;
  };

  const handleResetSession = () => {
    setIsArchiveModalOpen(true);
  };

  // MEMBER_AUTO_CHECKIN_PROMPT_EFFECT_V58
  useEffect(() => {
    if (isOrganizerMode || !currentMemberId || isMemberGateOpen) {
      setIsMemberCheckInPromptOpen(false);
      return;
    }

    const member = players.find((p) => p.id === currentMemberId);
    if (!member || member.isCheckedIn) {
      setIsMemberCheckInPromptOpen(false);
      return;
    }

    // Only prompt a member who belongs to today's session/roster
    // or already has today's activity.
    const isTodayMember =
      Boolean((member as any).todayRoster) ||
      (member.matchesPlayed || 0) > 0 ||
      (member.extraShuttlecocks || 0) > 0 ||
      Boolean(member.paid);

    if (!isTodayMember) {
      setIsMemberCheckInPromptOpen(false);
      return;
    }

    if (typeof window === 'undefined') return;

    const promptKey =
      `guanguan_checkin_prompt_v58:${sessionConfig.date}:${currentMemberId}`;

    if (sessionStorage.getItem(promptKey) === '1') return;

    // Mark when shown so a member who intentionally closes it, or later
    // checks out, is not nagged repeatedly in the same browser tab/session.
    sessionStorage.setItem(promptKey, '1');

    const timer = window.setTimeout(() => {
      setIsMemberCheckInPromptOpen(true);
    }, 350);

    return () => window.clearTimeout(timer);
  }, [
    isOrganizerMode,
    currentMemberId,
    isMemberGateOpen,
    players,
    sessionConfig.date,
  ]);
  // TODAY_HEADER_MEMBER_COUNT_V59B
  // Header must show today's session roster, not the whole Member Master.
  const todaySessionPlayers = players.filter(
    (p) =>
      Boolean((p as any).todayRoster) ||
      p.isCheckedIn ||
      (p.matchesPlayed || 0) > 0 ||
      (p.extraShuttlecocks || 0) > 0 ||
      Boolean(p.paid)
  );

  const todayMemberCount = todaySessionPlayers.length;

  // MEMBER_SESSION_UI_REPAIR_V60
  const [showMemberCheckInPromptV60, setShowMemberCheckInPromptV60] =
    useState(false);
  const [
    memberCheckInPromptShownForV60,
    setMemberCheckInPromptShownForV60,
  ] = useState('');

  useEffect(() => {
    if (isOrganizerMode || isMemberGateOpen || !currentMemberId) {
      setShowMemberCheckInPromptV60(false);
      return;
    }

    const member = players.find((p) => p.id === currentMemberId);

    if (!member || member.isCheckedIn) {
      setShowMemberCheckInPromptV60(false);
      return;
    }

    if (memberCheckInPromptShownForV60 === currentMemberId) {
      return;
    }

    // Suppress the older v58 prompt if that version is still present.
    setIsMemberCheckInPromptOpen(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(
        `guanguan_checkin_prompt_v58:${sessionConfig.date}:${currentMemberId}`,
        '1'
      );
    }

    setMemberCheckInPromptShownForV60(currentMemberId);

    const timer = window.setTimeout(() => {
      setShowMemberCheckInPromptV60(true);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [
    isOrganizerMode,
    isMemberGateOpen,
    currentMemberId,
    players,
    sessionConfig.date,
    memberCheckInPromptShownForV60,
  ]);

  const handleMemberLogoutV60 = () => {
    if (isOrganizerMode || !currentMemberId) return;

    const member = players.find((p) => p.id === currentMemberId);

    const queueWarning = member?.isCheckedIn
      ? `\n\n⚠️ ตอนนี้คุณยัง Check-in อยู่\nLogout จะออกจาก Member Session ของเครื่องนี้เท่านั้น และจะไม่ Check-out / ไม่เอาชื่อออกจากคิว`
      : '';

    const confirmed = window.confirm(
      `Logout${member?.nickname ? ` "${member.nickname}"` : ''} หรือไม่?\n\n` +
      `ระบบจะล้างชื่อสมาชิกที่จำไว้บนอุปกรณ์นี้ และกลับไปหน้าเลือกชื่อ / PIN` +
      queueWarning
    );

    if (!confirmed) return;

    if (typeof window !== 'undefined') {
      localStorage.removeItem('badminton_active_member_id');
      sessionStorage.removeItem('badminton_active_member_id');

      const keysToRemove: string[] = [];

      for (let index = 0; index < sessionStorage.length; index += 1) {
        const key = sessionStorage.key(index);
        if (!key) continue;

        if (
          key.startsWith('guanguan_checkin_prompt_') ||
          key.startsWith('guanguan_member_session_')
        ) {
          keysToRemove.push(key);
        }
      }

      keysToRemove.forEach((key) => sessionStorage.removeItem(key));
    }

    setShowMemberCheckInPromptV60(false);
    setMemberCheckInPromptShownForV60('');
    setIsMemberCheckInPromptOpen(false);
    setIsSelfCheckInOpen(false);
    setIsMemberPinModalOpen(false);
    setCurrentMemberId('');
    setCurrentTab('prematch');
    setIsMemberGateOpen(true);
  };

  const checkedInCount = todaySessionPlayers.filter(
    (p) => p.isCheckedIn
  ).length;

  // GUANGUAN_SPLASH_V23B
  if (!authReady) {
    // DYNAMIC_COURT_RENAME_V63C
  // Safe component-scope handler for Today's Courts.
  const handleUpdateSessionCourtsV63C = (newConfig: SessionConfig) => {
    setAppState((prev) => {
      const oldNames = Array.isArray(prev.sessionConfig.courtNames)
        ? prev.sessionConfig.courtNames
        : [];

      const newNames = Array.isArray(newConfig.courtNames)
        ? newConfig.courtNames
        : [];

      // Used only to update today's finished Match History labels.
      const renameByOldName = new Map<string, string>();
      oldNames.forEach((oldName, index) => {
        const nextName = newNames[index];
        if (oldName && nextName && oldName !== nextName) {
          renameByOldName.set(oldName, nextName);
        }
      });

      // Active Match uses stable internal IDs: court-1, court-2, ...
      // Only the visible real venue court name changes.
      const nextActiveMatches = prev.activeMatches.map((match) => {
        const matchIndex =
          Number(String(match.courtId || '').replace('court-', '')) - 1;

        const nextName =
          Number.isInteger(matchIndex) && matchIndex >= 0
            ? newNames[matchIndex]
            : undefined;

        return nextName
          ? { ...match, courtName: nextName }
          : match;
      });

      const nextMatchHistory = prev.matchHistory.map((history) => {
        const nextName = renameByOldName.get(history.courtName);

        return nextName
          ? { ...history, courtName: nextName }
          : history;
      });

      return {
        ...prev,
        sessionConfig: newConfig,
        activeMatches: nextActiveMatches,
        matchHistory: nextMatchHistory,
      };
    });
  };
  return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-6">
        <div className="text-center">
          <img
            src="/icons/pwa-512x512.png"
            alt="GuanGuan"
            className="w-28 h-28 sm:w-32 sm:h-32 rounded-[2rem] object-cover mx-auto shadow-2xl ring-1 ring-cyan-300/30"
          />
          <div className="mt-4 text-2xl font-black tracking-tight text-white">GuanGuan</div>
          <div className="mt-1 text-xs font-bold tracking-[0.22em] text-cyan-300">BADMINTON LIVE</div>
          <div className="mt-5 flex items-center justify-center gap-2 text-xs text-slate-400">
            <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span>กำลังเชื่อมต่อระบบ...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
            {/* TOP_ACCOUNT_MODE_BAR_V9 */}
      <div className="border-b border-slate-800/80 bg-slate-950/95">
        <div
          className={`max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center justify-between gap-2 ${
            !isOrganizerMode && currentTab === 'checkin' ? 'pt-14 sm:pt-2' : ''
          }`}
        >
          {!isOrganizerMode ? (
            <button
              type="button"
              onClick={() => setIsMemberGateOpen(true)}
              className="min-w-0 inline-flex items-center gap-2 rounded-xl border border-indigo-700/50 bg-slate-900 hover:bg-slate-800 px-3 py-2 text-left transition"
              title="สลับไปใช้งานในชื่อสมาชิกคนอื่น"
            >
              <span className="text-indigo-300 text-base shrink-0">↔</span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[9px] sm:text-[10px] font-semibold text-indigo-400">
                  สลับสมาชิก
                </span>
                <span className="block max-w-[130px] sm:max-w-[220px] truncate text-xs font-black text-white">
                  {currentMemberId
                    ? `คุณ ${players.find((p) => p.id === currentMemberId)?.nickname || 'สมาชิก'}`
                    : 'เลือกสมาชิก'}
                </span>
              </span>
            </button>
          ) : (
            <div className="inline-flex items-center gap-2 rounded-xl border border-amber-700/50 bg-amber-950/30 px-3 py-2">
              <span>🛡️</span>
              <span className="text-xs font-black text-amber-300">Organizer Mode</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleToggleOrganizerMode}
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[11px] sm:text-xs font-black transition ${
              isOrganizerMode
                ? 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
                : 'border-amber-700/60 bg-amber-950/40 hover:bg-amber-900/50 text-amber-300'
            }`}
            title={isOrganizerMode ? 'กลับไปโหมดสมาชิก' : 'เข้าสู่โหมดผู้จัด'}
          >
            <span>{isOrganizerMode ? '👤' : '🛡️'}</span>
            <span>{isOrganizerMode ? 'โหมดสมาชิก' : 'โหมดผู้จัด'}</span>
          </button>
        </div>
      </div>

{/* Top Header */}
      {/* GLOBAL_ORGANIZER_ALERT_RENDER_V52C */}
      <OrganizerGlobalAlertCenter
        players={players}
        sessionDate={sessionConfig.date}
        isOrganizerMode={isOrganizerMode}
      />
      <Header
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        sessionConfig={sessionConfig}
        totalPlayers={todayMemberCount}
        checkedInCount={checkedInCount}
        activeMatchesCount={activeMatches.length}
        waitingCount={isOrganizerMode ? waitingCount : 0}
        isOrganizerMode={isOrganizerMode}
        onToggleOrganizerMode={handleToggleOrganizerMode}
        onOpenSettings={() => { if (isOrganizerMode) setIsSettingsOpen(true); }}
        onResetSession={handleResetSession}
        onShareMemberLink={handleShareMemberLink}
        copiedShareLink={copiedShareLink}
      />
      {/* TOOLS_TOP_MENU_V68B: menu moved into Header */}

      {/* MEMBER_LOGOUT_ALWAYS_VISIBLE_V60 */}
      {!isOrganizerMode && currentMemberId && (
        <div className="border-b border-slate-800/80 bg-slate-950/90">
          <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                Member Session
              </div>
              <div className="truncate text-xs font-black text-white">
                👤 {players.find((p) => p.id === currentMemberId)?.nickname || 'สมาชิก'}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMemberHistoryOpen(true)}
                className="rounded-xl border border-cyan-700/60 bg-cyan-950/55 px-3.5 py-2 text-xs font-black text-cyan-200 transition hover:bg-cyan-900/70"
                title="ดูประวัติการเล่นของฉัน"
              >
                📚 ประวัติของฉัน
              </button>

              <button
                type="button"
                onClick={handleMemberLogoutV60}
                className="rounded-xl border border-rose-600/60 bg-rose-950/60 px-3.5 py-2 text-xs font-black text-rose-200 transition hover:bg-rose-900/70"
                title="Logout และล้าง Member Session บนอุปกรณ์นี้"
              >
                🚪 Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Offline / reconnect status */}
        {!isOnline && (
          <div className="mb-4 rounded-2xl border border-amber-600/60 bg-amber-950/45 px-4 py-3 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="text-2xl leading-none">📴</div>
              <div className="min-w-0">
                <div className="text-sm font-black text-amber-300">OFFLINE MODE</div>
                <div className="mt-1 text-xs sm:text-sm text-amber-100/90 leading-relaxed">
                  ใช้งานต่อได้บน Tablet • ข้อมูลจะบันทึกไว้ในเครื่องก่อน
                  และจะพยายาม Sync ขึ้น Firestore อัตโนมัติเมื่อ Internet กลับมา
                </div>
              </div>
            </div>
          </div>
        )}

        {isOnline && syncStatus === 'saving' && (
          <div className="mb-4 rounded-2xl border border-cyan-700/50 bg-cyan-950/35 px-4 py-3">
            <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-cyan-300">
              <span>🔄</span>
              <span>ONLINE • กำลัง Sync ข้อมูลล่าสุดขึ้น Firestore...</span>
            </div>
          </div>
        )}

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
              onClick={() => { setCurrentTab('finance'); setFinanceWorkspaceV77('shuttle'); }}
              className="px-3.5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-black shrink-0"
            >
              ไปคลังลูกแบด
            </button>
          </div>
        )}

        {/* MEMBER_ACCESS_ONLY_CHECKIN */}
        {currentTab === 'checkin' && (
          <MemberAccessBar
          players={players}
          currentMemberId={currentMemberId}
          onSelectMember={(id) => {
            setCurrentMemberId(id);
            if (typeof window !== 'undefined') {
              sessionStorage.setItem('badminton_active_member_id', id);
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
          
          onCheckOutMember={(playerId) => {
            handleCheckOutPlayer(playerId);
          }}
          onStopAfterCurrentMatch={handleStopAfterCurrentMatch}
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
        )}

        {!isOrganizerMode && currentMemberId && currentTab === 'checkin' && (
          <div className="hidden">
            <button id="member-pin-trigger-v5"
              type="button"
              onClick={() => setIsMemberPinModalOpen(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-950/45 hover:bg-cyan-900/55 border border-cyan-700/45 text-cyan-300 text-xs font-black transition"
              title="เปลี่ยน PIN ส่วนตัว"
            >
              <span>🔐</span>
              <span>เปลี่ยน PIN ของฉัน</span>
            </button>
            {/* MEMBER_LOGOUT_VISIBLE_BUTTON_V59B */}
            <button
              type="button"
              onClick={handleMemberLogout}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-950/55 hover:bg-rose-900/70 border border-rose-600/60 text-rose-200 text-xs font-black transition"
              title="Logout และล้าง Member Session บนอุปกรณ์นี้"
            >
              <span>🚪</span>
              <span>Logout</span>
            </button>
            {/* MEMBER_LOGOUT_BUTTON_V59 */}
            <button
              type="button"
              onClick={handleMemberLogout}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-950/45 hover:bg-rose-900/60 border border-rose-700/50 text-rose-300 text-xs font-black transition"
              title="Logout และล้าง Member Session บนอุปกรณ์นี้"
            >
              <span>🚪</span>
              <span>Logout / Clear Session</span>
            </button>
          </div>
        )}
        {/* MEMBER_PLAY_NOTIFICATION_V33 */}
        <MemberPlayNotification
          currentMemberId={currentMemberId}
          players={players}
          activeMatches={activeMatches}
          confirmedPreMatch={appState.confirmedPreMatch}
          confirmedPreMatch2={appState.confirmedPreMatch2}
          isOrganizerMode={isOrganizerMode}
        />



        {currentTab === 'prematch' && (
          <PreMatchView
            sessionConfig={sessionConfig}
            players={players}
            activeMatches={activeMatches}
            isOrganizerMode={false} /* ORGANIZER_QUEUE_SAME_AS_MEMBER_V62H */
            organizerDisplayOnly={false}
            currentMemberId={currentMemberId}
            confirmedPreMatch={appState.confirmedPreMatch}
            confirmedPreMatch2={appState.confirmedPreMatch2}
            confirmedPreMatch3={confirmedPreMatch3}
            onConfirmPreMatch={handleConfirmPreMatch}
            onCancelPreMatch={handleCancelPreMatch}
            onRemovePlayerFromPreMatch={handleRemovePlayerFromPreMatch}
            onStartConfirmedPreMatch={handleStartConfirmedPreMatch}
            onSelectPlayerStatus={(id, status) => handleUpdatePlayerStatus(id, status)}
            onNavigateToCourts={() => setCurrentTab('courts')}
            onUnlockOrganizer={isOrganizerMode ? undefined : () => setIsPinModalOpen(true)}
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
              players={
                isOrganizerMode
                  ? players
                  : players.filter(
                      (p) =>
                        Boolean((p as any).todayRoster) ||
                        p.isCheckedIn ||
                        (p.matchesPlayed || 0) > 0 ||
                        (p.extraShuttlecocks || 0) > 0 ||
                        Boolean(p.paid)
                    )
              } /* MEMBER_CHECKIN_TODAY_ONLY_V56 */
              isOrganizerMode={isOrganizerMode}
              currentMemberId={currentMemberId}
              hideSkillFromMembers={sessionConfig.hideSkillFromMembers ?? true}
              organizerPin={sessionConfig.organizerPin || '1234'}
              onToggleCheckIn={handleToggleCheckIn}
              onCheckInPlayer={handleCheckInPlayer}
              onCheckOutPlayer={handleCheckOutPlayer}
              onToggleTodayRoster={handleToggleTodayRoster}
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
            onUnlockOrganizer={isOrganizerMode ? () => setIsPinModalOpen(true) : undefined}
          />
        )}


        {/* MATCH_REPAIR_TOOLS_MOVED_V64B */}

        {currentTab === 'courts' && (
          <>
            {isOrganizerMode && (
              <SessionCourtsPanel
                sessionConfig={sessionConfig}
                activeMatches={activeMatches}
                onChange={handleUpdateSessionCourtsV70B} /* COURT_NAME_SYNC_TOPLEVEL_V70B */
              />
            )}

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
              <div className="min-w-0">
                <CourtsView
                  sessionConfig={sessionConfig}
                  players={players.filter(
                    (p) =>
                      p.isCheckedIn &&
                      p.status !== 'resting' &&
                      p.status !== 'left'
                  )}
                  activeMatches={activeMatches}
                  matchHistory={matchHistory}
                  isOrganizerMode={isOrganizerMode}
                  hideSkillFromMembers={sessionConfig.hideSkillFromMembers ?? true}
                  confirmedPreMatch={appState.confirmedPreMatch}
                  confirmedPreMatch2={appState.confirmedPreMatch2}
                  singleColumnCourts={isOrganizerMode}
                  hideWaitingQueue={isOrganizerMode}
                  hidePreMatchQuickLoad={isOrganizerMode}
                  onStartMatch={handleStartMatch}
                  onFinishMatch={handleFinishMatch}
                  onCancelMatch={handleCancelActiveMatch}
                  onUpdateMatchShuttlecocks={handleUpdateMatchShuttlecocks}
                  onUpdateMatchScore={handleUpdateMatchScore}
                />
              </div>

              {isOrganizerMode && (
                <div className="min-w-0">
                  <PreMatchManagerV64
                    sessionConfig={sessionConfig}
                    players={players}
                    activeMatches={activeMatches}
                    confirmedPreMatches={[
                      appState.confirmedPreMatch || null,
                      appState.confirmedPreMatch2 || null,
                      confirmedPreMatch3,
                    ]}
                    onConfirmPreMatch={handleConfirmPreMatch}
                    onCancelPreMatch={handleCancelPreMatch}
                    onStartConfirmedPreMatch={handleStartConfirmedPreMatch}
                  />
                </div>
              )}
            </div>

            {isOrganizerMode && (
              <div className="mt-6">
                <OrganizerWaitingQueueV64
                  players={players}
                  activeMatches={activeMatches}
                  confirmedPreMatches={[
                    appState.confirmedPreMatch || null,
                    appState.confirmedPreMatch2 || null,
                    confirmedPreMatch3,
                  ]}
                />
              </div>
            )}

            {/* TABLET_MATCH_REPAIR_TOOLBOX_V64B */}
            {isOrganizerMode && matchHistory.length > 0 && (
              <details className="group mt-6 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 select-none">
                  <div className="min-w-0">
                    <div className="text-sm font-black text-white">
                      🧰 เครื่องมือแก้ไข Match
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400">
                      Undo Match ล่าสุด / ยกเลิก Match ที่จบแล้ว • ปกติไม่ต้องเปิด
                    </div>
                  </div>
                  <div className="shrink-0 rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-[10px] font-black text-slate-300 transition group-open:border-amber-600/60 group-open:text-amber-300">
                    แตะเพื่อเปิด ▾
                  </div>
                </summary>

                <div className="grid grid-cols-1 gap-3 border-t border-slate-800 p-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-amber-600/40 bg-amber-950/20 p-3">
                    <div className="text-xs font-black text-amber-200">
                      ↩️ เผลอกดจบ Match ล่าสุด?
                    </div>
                    <div className="mt-1 text-[10px] leading-5 text-slate-400">
                      Undo ได้เฉพาะ Match ล่าสุด และต้องยังไม่มีผู้เล่นใน Match นั้นถูก Paid
                    </div>
                    <button
                      type="button"
                      onClick={handleUndoLastFinishedMatch}
                      className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-2.5 text-xs font-black text-slate-950 transition hover:bg-amber-400"
                    >
                      ↩️ Undo Finish Match ล่าสุด
                    </button>
                  </div>

                  <div className="rounded-xl border border-rose-700/40 bg-rose-950/15 p-3">
                    <div className="text-xs font-black text-rose-200">
                      🗑️ ยกเลิก Match ที่จบแล้ว
                    </div>
                    <div className="mt-1 text-[10px] leading-5 text-slate-400">
                      ใช้กรณีเลือก Match ที่กด Finish ผิด • Match ที่ยกเลิกจะไม่ถูกคิดค่าเล่น
                    </div>

                    <select
                      value={cancelFinishedMatchId}
                      onChange={(event) =>
                        setCancelFinishedMatchId(event.target.value)
                      }
                      className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-xs text-white outline-none focus:border-rose-500"
                    >
                      <option value="">-- เลือก Match ที่ต้องการยกเลิก --</option>
                      {matchHistory.map((match, index) => (
                        <option key={match.id} value={match.id}>
                          {`#${matchHistory.length - index} • ${
                            match.courtName || 'Court'
                          } • ${match.startTime || '-'} • ${(
                            match.teamANames || []
                          ).join(' / ')} vs ${(
                            match.teamBNames || []
                          ).join(' / ')}`}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      disabled={!cancelFinishedMatchId}
                      onClick={() =>
                        handleCancelSelectedFinishedMatch(cancelFinishedMatchId)
                      }
                      className="mt-2.5 w-full rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-black text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      ยกเลิก Match ที่เลือก
                    </button>

                    <div className="mt-2 text-[9px] leading-4 text-amber-200/90">
                      ⚠️ หากมีผู้เล่นใน Match นี้ถูก Paid แล้ว ต้อง Undo Payment ก่อน
                    </div>
                  </div>
                </div>
              </details>
            )}
          </>
        )}

        {/* ORGANIZER_TOOLS_PAGE_V68 */}
        {currentTab === 'tools' && isOrganizerMode && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-violet-800/50 bg-gradient-to-r from-violet-950/35 to-slate-900 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-xl">
                  🧰
                </div>
                <div>
                  <div className="text-lg font-black text-white">
                    7. Tools
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    Data • Backup • Export • Repair
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              <section className="rounded-2xl border border-cyan-800/45 bg-cyan-950/15 p-4 sm:p-5">
                <div className="text-sm font-black text-white">
                  🏸 Export Match History
                </div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">
                  Export Court, Team A/B, Score, เวลาแข่งขัน และจำนวนลูกแบด
                </div>
                <button
                  type="button"
                  onClick={() => setShowMatchHistoryExport(true)}
                  className="mt-4 w-full rounded-xl bg-cyan-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-cyan-400"
                >
                  เปิด Export Match History
                </button>
              </section>

              <section className="rounded-2xl border border-violet-800/45 bg-violet-950/15 p-4 sm:p-5">
                <div className="text-sm font-black text-white">
                  📦 Data / Backup / Stat Repair
                </div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">
                  Full Day Backup • Import / Replace • Archive Export • Rebuild / Reset Lifetime Stats
                </div>
                <button
                  type="button"
                  onClick={() => setIsDataStatsManagerOpen(true)}
                  className="mt-4 w-full rounded-xl bg-violet-500 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-400"
                >
                  เปิด Data / Backup / Stat Repair
                </button>
              </section>
              {/* TOOLS_MEMBER_COST_CARD_V68B */}
              <section className="rounded-2xl border border-emerald-800/45 bg-emerald-950/15 p-4 sm:p-5">
                <div className="text-sm font-black text-white">
                  📋 Export รายชื่อ / ค่าใช้จ่าย
                </div>
                <div className="mt-1 text-xs leading-relaxed text-slate-400">
                  รายชื่อ • Match • ค่าคอร์ท • ค่าลูก • Extra • ส่วนลด • ยอดสุทธิ • สถานะชำระ
                </div>
                <button
                  type="button"
                  onClick={() => setShowMemberCostExportV68D(true)}
                  className="mt-4 w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-black text-slate-950 hover:bg-emerald-400"
                >
                  เปิด Export รายชื่อ / ค่าใช้จ่าย
                </button>
              </section>
            </div>

            {showMatchHistoryExport && (
              <MatchHistoryExportView
                sessionDate={sessionConfig.date}
                matchHistory={matchHistory}
                onClose={() => setShowMatchHistoryExport(false)}
              />
            )}


            {/* MEMBER_COST_EXPORT_RENDER_V68D */}
            {showMemberCostExportV68D && (
              <MemberCostExportToolV68D
                sessionConfig={sessionConfig}
                players={players}
                promotionRedemptions={promotionRedemptions}
                onClose={() => setShowMemberCostExportV68D(false)}
              />
            )}
            <div className="rounded-xl border border-slate-800 bg-slate-900/65 px-4 py-3 text-[11px] leading-relaxed text-slate-500">
              Tools เป็น Organizer-only • สมาชิกทั่วไปจะไม่เห็นเมนูนี้
            </div>
          </div>
        )}
        {currentTab === 'billing' && (
          <BillingView
            sessionConfig={sessionConfig}
            players={players}
            activePlayerIds={activeMatches.flatMap((match) => [
              ...match.teamA,
              ...match.teamB,
            ])}
            isOrganizerMode={isOrganizerMode}
            organizerPin={sessionConfig.organizerPin || '1234'}
            onUnlockOrganizer={isOrganizerMode ? () => setIsPinModalOpen(true) : undefined}
            onNavigateToFinance={() => setCurrentTab('finance')}
            onUpdateSessionConfig={handleUpdateSessionConfig}
            onTogglePlayerPayment={handleTogglePlayerPayment}
            onMarkAllCheckedInPaid={handleMarkAllCheckedInPaid}
            onEditPlayer={handleEditPlayer}
            onUpdatePlayerExtraShuttlecocks={handleUpdatePlayerExtraShuttlecocks}
            onApplyBillingAdjustment={handleApplyBillingAdjustment}
            onUndoBillingAdjustment={handleUndoBillingAdjustment}
            promotionRedemptions={promotionRedemptions}
          />
        )}

        {currentTab === 'finance' && isOrganizerMode && (
          <div className="space-y-4">
            {/* SHUTTLE_STOCK_SEPARATION_V77B */}
            <div className="flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 p-2 overflow-x-auto">
              <button
                type="button"
                onClick={() => setFinanceWorkspaceV77('financial')}
                className={`rounded-xl px-4 py-2.5 text-xs font-black whitespace-nowrap transition ${
                  financeWorkspaceV77 === 'financial'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                💰 การเงิน / Today's Financial
              </button>

              <button
                type="button"
                onClick={() => setFinanceWorkspaceV77('shuttle')}
                className={`rounded-xl px-4 py-2.5 text-xs font-black whitespace-nowrap transition ${
                  financeWorkspaceV77 === 'shuttle'
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-950 text-slate-400 border border-slate-800'
                }`}
              >
                🪶 คลังลูกแบด
              </button>
            </div>

            {financeWorkspaceV77 === 'financial' && (
              <SectionErrorBoundary
                title="สรุปเงิน"
                onBack={() => setCurrentTab('prematch')}
              >
                {/* FINANCE_WHITE_SCREEN_GUARD_V77C */}
                <FinancialStatsView
            key={`finance-${fundRevision}-${archiveRevision}`} /* FINANCE_ARCHIVE_REFRESH_V66C */
            sessionConfig={sessionConfig}
            players={players}
            isOrganizerMode={isOrganizerMode}
            onUnlockOrganizer={isOrganizerMode ? () => setIsPinModalOpen(true) : undefined}
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
                matchHistory={matchHistory}
              />
              </SectionErrorBoundary>
            )}

            {financeWorkspaceV77 === 'shuttle' && (
              <ShuttleStockWorkspaceV78
                sessionDate={sessionConfig.date}
                purchases={shuttlePurchases as any[]}
                usages={shuttleUsageLedger as any[]}
                adjustments={shuttleStockAdjustments as any[]}
                lowStockThreshold={shuttleLowStockThreshold}
                targetStock={shuttleTargetStock}
                defaultPiecesPerTube={shuttleDefaultPiecesPerTube}
                onAddPurchase={handleAddShuttlePurchase}
                onDeletePurchase={handleDeleteShuttlePurchase}
                onStocktake={handleStocktakeShuttles}
                onSetLowStockThreshold={handleSetShuttleLowStockThreshold}
                onSetReorderSettings={handleSetShuttleReorderSettings}
              />
            )}
          </div>
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
              !isOnline
                ? 'text-amber-300'
                : syncStatus === 'synced'
                ? 'text-emerald-400'
                : syncStatus === 'error'
                ? 'text-rose-400'
                : 'text-cyan-300'
            }`}
          >
            {!isOnline && '📴 OFFLINE MODE • บันทึกในเครื่องแล้ว • รอ Sync เมื่อ Internet กลับมา'}
            {isOnline && syncStatus === 'synced' && '🟢 ONLINE • Firestore Sync แล้ว • LocalStorage Backup'}
            {isOnline && syncStatus === 'saving' && '🔄 ONLINE • กำลัง Sync ขึ้น Firestore...'}
            {isOnline && syncStatus === 'connecting' && '🟡 ONLINE • กำลังเชื่อมต่อ Firestore...'}
            {isOnline && syncStatus === 'error' && '⚠️ ONLINE แต่ Firestore Sync มีปัญหา • ใช้ LocalStorage Backup'}
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

      {/* MEMBER_HISTORY_V65 */}
      <MemberHistoryModal
        key={`member-history-${archiveRevision}-${currentMemberId || 'none'}`}
        isOpen={isMemberHistoryOpen && !isOrganizerMode}
        onClose={() => setIsMemberHistoryOpen(false)}
        member={
          currentMemberId
            ? players.find((p) => p.id === currentMemberId) || null
            : null
        }
        currentSessionDate={sessionConfig.date}
        currentVenueName={sessionConfig.venueName}
        currentMatchHistory={matchHistory}
        memberStats={memberStats as any}
      />
      {/* DATA_STATS_REPAIR_V66 */}
      <DataStatsManagerV66
        isOpen={isDataStatsManagerOpen && isOrganizerMode}
        onClose={() => setIsDataStatsManagerOpen(false)}
        currentState={appState}
        onApplyState={(nextState) => {
          setAppState(nextState);
        }}
        onArchivesChanged={() => {
          setArchiveRevision((value) => value + 1);
        }}
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

      {/* SETTINGS_MODAL_ORGANIZER_ONLY_V9 */}
      {isOrganizerMode && (
        <SessionSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={sessionConfig}
        onSaveConfig={handleUpdateSessionConfig}
        onExportBackup={handleExportBackup}
        onImportBackup={handleImportBackup}
      />
      )}

      <SelfCheckInModal
        isOpen={isSelfCheckInOpen}
        onClose={() => setIsSelfCheckInOpen(false)}
        players={
          players.filter(
            (p) =>
              Boolean((p as any).todayRoster) ||
              p.isCheckedIn ||
              (p.matchesPlayed || 0) > 0 ||
              (p.extraShuttlecocks || 0) > 0 ||
              Boolean(p.paid)
          )
        } /* QR_CHECKIN_TODAY_ONLY_V56B */
        organizerPin={sessionConfig.organizerPin || '1234'}
        onCheckInPlayer={handleCheckInPlayer}
        onQuickAddAndCheckIn={handleQuickAddAndCheckIn}
      />

      <OrganizerPinModal
        isOpen={isPinModalOpen}
        onClose={() => setIsPinModalOpen(false)}
        onSuccess={() => {
          if (!isOrganizerUid(auth.currentUser?.uid)) {
            window.alert(
              'Firebase Organizer Session ไม่ถูกต้อง กรุณา Login ใหม่'
            );
            setIsOrganizerMode(false);
            return;
          }

          if (typeof window !== 'undefined') {
            localStorage.removeItem(
              'guanguan_organizer_ui_locked_v61'
            );

            const url = new URL(window.location.href);
            if (url.searchParams.get('mode') === 'member') {
              url.searchParams.delete('mode');
              window.history.replaceState(
                {},
                '',
                `${url.pathname}${url.search}${url.hash}`
              );
            }
          }

          setIsOrganizerMode(true);
          setIsPinModalOpen(false);
          setIsMemberGateOpen(false);
          confetti({
            particleCount: 40,
            spread: 60,
            origin: { y: 0.6 },
          });
        }}
      />

      <DailyArchiveModal
        key={`archive-${archiveRevision}`}
        isOpen={isArchiveModalOpen}
        onClose={() => setIsArchiveModalOpen(false)}
        currentState={appState}
        onDiscardSession={handleDiscardSessionWithoutArchive}
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
              // RESET_BILLING_ADJUSTMENTS_V31
              billingMatchAdjustment: 0,
              billingAmountAdjustment: 0,
              billingAdjustmentReason: undefined,
              billingAdjustmentLog: [],
              paid: false,
              paidAmount: undefined,
              paymentTime: undefined,
              paymentMethod: undefined,
            })),
            activeMatches: [],
            matchHistory: [],
            confirmedPreMatch: null,
            confirmedPreMatch2: null,
            confirmedPreMatch3: null, // PREMATCH_3_FIFO_V64
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

      {/* MEMBER_AUTO_CHECKIN_PROMPT_UI_V58 */}
      {!isOrganizerMode &&
        currentMemberId &&
        isMemberCheckInPromptOpen &&
        (() => {
          const member = players.find((p) => p.id === currentMemberId);

          if (!member || member.isCheckedIn) return null;

          return (
            <div className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-500/40 bg-slate-900 shadow-2xl">
                <div className="border-b border-slate-800 bg-emerald-500/10 px-5 py-4">
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    Check-in ก่อนเข้าคิว
                  </div>
                  <h2 className="mt-1 text-xl font-black text-white">
                    👋 สวัสดี {member.nickname}
                  </h2>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
                    <div className="text-base font-black text-amber-200">
                      ⚠️ ตอนนี้คุณยังไม่ได้ Check-in
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      หากต้องการเล่นวันนี้ กรุณากด Check-in เพื่อเข้าสู่
                      <strong className="text-white"> คิวรอเล่น </strong>
                      ก่อนครับ
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-800 bg-slate-950/50 px-4 py-3 text-xs text-slate-400">
                    หลัง Check-in ระบบจะพาไปหน้า Pre-Match และชื่อของคุณจะเข้าสู่คิวรอจัด Match อัตโนมัติ
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMemberCheckInPromptOpen(false);
                      handleCheckInPlayer(currentMemberId);
                    }}
                    className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-black text-slate-950 shadow-lg transition hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    ✅ Check-in และเข้าคิวรอเล่น
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsMemberCheckInPromptOpen(false)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/70 px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800"
                  >
                    ไว้ก่อน / ดูหน้าหลักก่อน
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* MEMBER_CHECKIN_PROMPT_REPAIR_V60 */}
      {!isOrganizerMode &&
        currentMemberId &&
        showMemberCheckInPromptV60 &&
        (() => {
          const member = players.find((p) => p.id === currentMemberId);

          if (!member || member.isCheckedIn) return null;

          return (
            <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm">
              <div className="w-full max-w-md overflow-hidden rounded-3xl border border-emerald-500/50 bg-slate-900 shadow-2xl">
                <div className="border-b border-slate-800 bg-gradient-to-r from-emerald-950/70 to-teal-950/40 px-5 py-5">
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-400">
                    Check-in เพื่อเข้าคิว
                  </div>
                  <div className="mt-1 text-2xl font-black text-white">
                    👋 สวัสดี {member.nickname}
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div className="rounded-2xl border border-amber-500/40 bg-amber-950/25 p-4">
                    <div className="text-base font-black text-amber-200">
                      ⚠️ คุณยังไม่ได้ Check-in
                    </div>
                    <div className="mt-2 text-sm leading-6 text-slate-300">
                      การเลือกชื่อและเข้าใช้งาน
                      <strong className="text-white"> ยังไม่ถือว่าเข้าคิวเล่น </strong>
                      กรุณากด Check-in เพื่อเข้าสู่ Waiting Queue
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setShowMemberCheckInPromptV60(false);
                      handleCheckInPlayer(currentMemberId);
                    }}
                    className="w-full rounded-2xl bg-emerald-500 px-5 py-4 text-base font-black text-slate-950 shadow-lg transition hover:bg-emerald-400 active:scale-[0.99]"
                  >
                    ✅ Check-in และเข้าคิวรอเล่น
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowMemberCheckInPromptV60(false)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-3 text-xs font-bold text-slate-300 transition hover:bg-slate-800"
                  >
                    ไว้ก่อน / ดูหน้าหลักก่อน
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

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
        players={players.filter((p) =>
          Boolean(
            p.todayRoster ||
            p.isCheckedIn ||
            (p.matchesPlayed || 0) > 0 ||
            (p.extraShuttlecocks || 0) > 0 ||
            p.paid
          )
        )} /* MEMBER_GATE_TODAY_ONLY_V48C */
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
            sessionStorage.setItem('badminton_active_member_id', player.id);
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




























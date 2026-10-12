# GuanGuan — Project Context & AI Handover

> Living handover document for working across computers, VS Code, and separate ChatGPT accounts.
> **Status:** Initial context from owner-provided Git output. AI must verify architecture and behavior against current source code before asserting details.
> **Last prepared:** 2026-10-12

## 1. Project identity

- **Project name:** GuanGuan
- **GitHub repository:** https://github.com/selamoonjr2527-ui/GuanGuan
- **Working branch as of 2026-10-12:** `feature/auto-payment`
- **Confirmed working commit:** `5fff77b` (2026-10-11 02:03:01 +0700)
- **Commit message:** `checkpoint: preserve current GuanGuan source before next changes`
- **Older `main` commit:** `64c7bc7` (2026-10-07 11:15:42 +0700), `Stable billing before auto payment integration`
- **Owner confirmation:** This feature branch is the latest desired locally running version.

## 2. Verified technology stack

The current branch is a single-page Vite + React + TypeScript app with a Firebase-backed data layer and a PWA shell for tablet use.

Verified from source:
- Frontend app bootstrap and build config: [package.json](package.json), [vite.config.ts](vite.config.ts)
- Main app shell and view routing: [src/App.tsx](src/App.tsx)
- Firebase initialization and auth setup: [src/firebase.ts](src/firebase.ts)
- Firebase hosting + functions config: [firebase.json](firebase.json), [.firebaserc](.firebaserc)
- Cloud Functions starter implementation: [functions/src/index.ts](functions/src/index.ts)

Runtime dependencies currently present in [package.json](package.json):
- React 19 and Vite 6 for the app shell and client build
- Firebase JS SDK for auth, Firestore, offline persistence, and realtime sync
- Tailwind + Vite plugin for styling
- PWA plugin for installed app behavior and offline shell
- `canvas-confetti` for celebratory UI feedback
- `qrcode` and `lucide-react` for QR / payment UI and iconography
- `dotenv`, `express`, and Google GenAI SDK are also listed, but the code reviewed does not show an active Google AI feature in the main app flow
- Cloud Functions package at [functions/package.json](functions/package.json) uses `firebase-admin`, `firebase-functions`, and TypeScript compilation

## 3. Verified architecture

### 3.1 App structure

The application is not a traditional multi-page app; it is a single React state-driven dashboard that switches between tabs and modal overlays from the main app state in [src/App.tsx](src/App.tsx). The header and tab navigation are defined in [src/components/Header.tsx](src/components/Header.tsx).

Key top-level app flows in [src/App.tsx](src/App.tsx):
- `currentTab` controls the main business views: `prematch`, `checkin`, `assessment`, `courts`, `billing`, `finance`, and `tools`
- organizer/member mode is enforced by Firebase UID allow-list logic in [src/firebase.ts](src/firebase.ts) and security checks in [src/App.tsx](src/App.tsx)
- Local app state is stored in `localStorage` and normalized on load; see [src/utils/storage.ts](src/utils/storage.ts)
- Firestore synchronization and conflict merging is implemented in [src/utils/firestoreSync.ts](src/utils/firestoreSync.ts)
- Archive and fund collections are synced in [src/utils/firestoreCollectionsSync.ts](src/utils/firestoreCollectionsSync.ts)

### 3.2 Data model and persistence

The app state is centralized in [src/utils/storage.ts](src/utils/storage.ts):
- `AppState` includes `sessionConfig`, `players`, `activeMatches`, `matchHistory`, and optional pre-match confirmation fields
- `DEFAULT_SESSION_CONFIG` defines the club defaults such as venue, court rates, shuttle pricing, member fees, organizer PIN, and match timing assumptions
- `INITIAL_PLAYERS` and `INITIAL_ACTIVE_MATCHES` populate a demo club session if no state is available
- Local backup keys include `badminton_club_session_v1`, `badminton_club_archives_v1`, and `badminton_club_fund_v1`

The sync logic keeps `localStorage` as the immediate backup and applies a three-way merge strategy to Firestore: base state -> local edits -> remote snapshot, implemented in [src/utils/firestoreSync.ts](src/utils/firestoreSync.ts). This is designed specifically to avoid overwriting local work while another browser tab/device is editing.

### 3.3 Firebase integration

Verified in [src/firebase.ts](src/firebase.ts):
- Firebase web app is initialized for project id `guanguan-cbbe7`
- Firestore is initialized with `persistentLocalCache` and `persistentMultipleTabManager` for offline persistence and multi-tab resilience
- Auth is initialized via Firebase Auth with anonymous sign-in on startup
- Organizer access is restricted to a fixed allowlist (`ORGANIZER_UIDS`); the active allow-list contains the app’s organizer UID plus a second UID in the current branch
- Firestore paths used by the app include:
  - `clubs/guanguan/runtime/currentSession`
  - `clubs/guanguan/archives`
  - `clubs/guanguan/fundTransactions`
  - `clubs/guanguan/paymentTransaction`

The app also creates payment records in [src/payment/paymentTransactions.ts](src/payment/paymentTransactions.ts), including pending invoice creation, verification flow, and realtime subscription to per-player payment state.

### 3.4 Verified match counting and billing source of truth

The actual implementation in [src/App.tsx](src/App.tsx) and [src/utils/memberRecords.ts](src/utils/memberRecords.ts) treats `matchHistory` as the source of truth for completed billing, not the player’s raw `matchesPlayed` field.

Key rules implemented in code:
- `getCurrentSessionCompletedMatchCount()` counts only completed matches present in the current `matchHistory` for that session and filters by player name and/or recorded processed history IDs.
- The daily sync effect recalculates `gamesPlayed` and `matchesPlayed` from `matchHistory` and a pending active-match exception before using the values in billing.
- A player who checks in on a new date starts with fresh session counts (`gamesPlayed = 0`, `matchesPlayed = 0`) while preserving prior lifetime stats in `memberLifetimeStats`.
- If a player presses “Stop after current match” while still on court, the app immediately pre-counts that active match once in [src/App.tsx](src/App.tsx); this prevents a missed charge when the organizer forgets to press Finish Match on time.
- The billing rules in [src/utils/promotionRules.ts](src/utils/promotionRules.ts) compute player charges as:
  - court fee = `memberCourtFee`
  - shuttle fee = `matchesPlayed × shuttlecockFeePerMatchPerPerson`
  - extra shuttle = `extraShuttlecocks × extraShuttlecockPrice`
  - final total = base total minus promotion discounts for that session date
- `splitMethod` values supported in [src/types.ts](src/types.ts) are `club_rate`, `equal`, `per_game`, and `fixed`, and the UI in [src/components/BillingView.tsx](src/components/BillingView.tsx) calculates totals differently for each method.

This is an important correctness point for the project: the app intentionally prevents stale counts from previous days from being billed again, and it specifically avoids counting active/in-progress matches before they are finalized in the history list.

## 4. Verified feature inventory

### 4.1 Member / organizer access and session flow

Evidence for role gating and session UX is in [src/App.tsx](src/App.tsx), [src/components/Header.tsx](src/components/Header.tsx), and [src/components/MemberGateModal.tsx](src/components/MemberGateModal.tsx):
- anonymous Firebase login is forced for members
- organizer mode is only enabled after UID allow-list validation and PIN-based unlock flow
- member session identity is session-scoped and stored in `sessionStorage` to avoid persistent identity leakage
- `?mode=member` / `?mode=organizer` URL switching is supported for direct-link entry and mode locking
- member-only access to current member history, self check-in, and member queue flow is included

### 4.2 Pre-match queue and waiting board

Verified from [src/App.tsx](src/App.tsx), [src/components/PreMatchView.tsx](src/components/PreMatchView.tsx), and [src/components/PreMatchManagerV64.tsx](src/components/PreMatchManagerV64.tsx):
- pre-match player queue and pairing workflow
- confirmed pre-match slots / FIFO handling for multiple pre-match confirmations
- waiting queue status and organizer scheduling controls
- manual or auto pairing logic tied to active court/session state

### 4.3 Check-in, roster, and member status

Evidence in [src/App.tsx](src/App.tsx), [src/components/CheckInView.tsx](src/components/CheckInView.tsx), and [src/components/MemberAccessBar.tsx](src/components/MemberAccessBar.tsx):
- member check-in / check-out
- today-roster filtering
- skill-level display and member status updates
- walk-in registration and member PIN verification
- self check-in modal and member gate flow
- “today-only” roster restrictions for member-facing views

### 4.4 Match flow, scoring, and scheduling

Evidence in [src/types.ts](src/types.ts), [src/components/CourtsView.tsx](src/components/CourtsView.tsx), [src/components/SessionCourtsPanel.tsx](src/components/SessionCourtsPanel.tsx), and [src/App.tsx](src/App.tsx):
- active match entities with teamA/teamB, score tracking, round-trip matches, and court IDs
- dynamic court configuration and session court metadata
- court assignment, match start/finish, match cancellation, and match history records
- end-of-match billing logic tied to finished matches only

### 4.5 Skill assessment and player analytics

Evidence in [src/components/SkillAssessmentView.tsx](src/components/SkillAssessmentView.tsx) and [src/utils/storage.ts](src/utils/storage.ts):
- assessment questionnaires and scoring model with levels from `Newbie` to `PRO`
- skill score normalization and skill-level assignment
- player rating data stored with membership state

### 4.6 Billing, payments, and prompt-pay flows

Evidence in [src/components/BillingView.tsx](src/components/BillingView.tsx), [src/payment/paymentTransactions.ts](src/payment/paymentTransactions.ts), [src/utils/promotionRules.ts](src/utils/promotionRules.ts), [src/components/MemberPaymentAction.tsx](src/components/MemberPaymentAction.tsx), and [src/components/OrganizerPaymentVerificationPanel.tsx](src/components/OrganizerPaymentVerificationPanel.tsx):
- per-player billing breakdown by club rate or venue split method
- PromptPay QR generation and payment verification handling
- pending payment transaction invoices (`GG-<date>-<playerId>` style IDs)
- payment status lifecycle: `pending`, `pending_verify`, `paid`, `rejected`, `cancelled`, `failed`, `expired`
- manual billing adjustments, match adjustments, and extra-shuttle adjustments
- promotions and discount rules such as milestone rewards and birthday court fee waivers

### 4.7 Financial reports and treasury

Evidence in [src/components/FinancialStatsView.tsx](src/components/FinancialStatsView.tsx), [src/components/TreasuryViewV79.tsx](src/components/TreasuryViewV79.tsx), [src/components/CourtProfitabilityV82.tsx](src/components/CourtProfitabilityV82.tsx), and [src/components/MatchHistoryExportView.tsx](src/components/MatchHistoryExportView.tsx):
- daily/session financial summary
- archives and treasury ledger with deposit / withdrawal tracking
- match-by-match and court profitability analysis
- exports for match history and member costs
- archive management and daily financial snapshots

### 4.8 Shuttle stock / inventory management

Evidence in [src/utils/shuttleInventory.ts](src/utils/shuttleInventory.ts), [src/components/ShuttleStockWorkspaceV78.tsx](src/components/ShuttleStockWorkspaceV78.tsx), [src/components/MonthlyShuttleReportV76.tsx](src/components/MonthlyShuttleReportV76.tsx), and [src/components/ShuttleLedgerHistoryV76.tsx](src/components/ShuttleLedgerHistoryV76.tsx):
- shuttle purchase tracking and stock ledger
- usage records and stock adjustments
- reorder threshold and target stock settings
- weighted average cost calculation and monthly reporting
- low-stock alerts in the main app shell

### 4.9 Member stats, promotions, and deleted-member recovery

Evidence in [src/utils/memberRecords.ts](src/utils/memberRecords.ts) and [src/components/MemberCenterModal.tsx](src/components/MemberCenterModal.tsx):
- lifetime member statistics (games, matches, sessions, birthdays)
- free-game rewards, birthday rewards, and promotion redemption tracking
- restoration of deleted members and permanent delete workflows
- member-level historical session analysis

### 4.10 Data export / archive / reset tools

Evidence in [src/components/DataStatsManagerV66.tsx](src/components/DataStatsManagerV66.tsx), [src/components/DailyArchiveModal.tsx](src/components/DailyArchiveModal.tsx), [src/components/BillingExportView.tsx](src/components/BillingExportView.tsx), and [src/App.tsx](src/App.tsx):
- full-day archive creation and reset flow
- session backup / data repair tools
- member cost export
- match history export
- safe reset flow for session state while preserving important histories

### 4.11 PWA / offline operation

Evidence in [vite.config.ts](vite.config.ts) and [src/App.tsx](src/App.tsx):
- Vite PWA manifest and service worker setup
- offline status banner and Firestore retry behavior
- local-first operation while network is unavailable
- persistent Firestore cache is enabled through the Firebase client config

## 5. Firebase and deployment status

### 5.1 Firebase configuration

Verified files:
- [.firebaserc](.firebaserc) — default project target is `guanguan-cbbe7`
- [firebase.json](firebase.json) — Hosting is configured for the Vite `dist` build; the app also declares a Firebase Functions source under `functions/`
- [src/firebase.ts](src/firebase.ts) — Firebase app, auth, Firestore cache config, organizer allowlist

### 5.2 Cloud Functions status

The Cloud Functions folder is present, but the actual implementation is still a starter stub in [functions/src/index.ts](functions/src/index.ts). There is no production-ready function logic in the current branch that was verified in this review. This means the backend is only partially configured and should be treated as unverified until concrete function code is added and deployed.

### 5.3 Deployment checklist

This remains a production-risk area until the actual Firebase console and environment are checked:
- [ ] Verify the real target Firebase project, environment, and hosting settings in Firebase Console
- [ ] Confirm whether production data, rules, and auth settings already exist or need to be created
- [ ] Review environment variables and any secret storage for Firebase Functions / admin credentials
- [ ] Review Firestore security rules before any data modification or deployment
- [ ] Run the app build and function build on a machine with the Node toolchain installed
- [ ] Obtain explicit approval before deploying to production

## 6. Important dependencies and project risks

From [package.json](package.json), [functions/package.json](functions/package.json), and active imports in the app:
- `firebase`: main backend/data platform
- `@google/genai`: included but not visibly wired into the app flow in the files reviewed
- `vite-plugin-pwa`: creates offline/PWA behavior
- `tailwindcss` and `@tailwindcss/vite`: styling system
- `lucide-react`: UI icons
- `canvas-confetti`: celebration / organizer feedback
- `qrcode`: PromptPay QR generation
- `firebase-functions` + `firebase-admin`: server-side Firebase backend scaffolding

Important caution: this environment did not have a working Node/npm shell path available, so the repo could not be built from the terminal here. That means no fresh `npm run lint` or `npm run build` verification is available in this session.

## 7. Current verified handover status

- [x] Latest repo state under review is the `feature/auto-payment` branch
- [x] Source-based architecture and major features were reviewed in the current codebase
- [x] Firebase project id and auth/firestore configuration have been confirmed from source
- [x] The app has an offline-first / local-backup design with Firestore reconciliation
- [x] Key features include member flows, court scheduling, billing, finance, treasury, inventory, exports, and archive tools
- [x] Build validation succeeded via the current terminal session (`npm.cmd run build` exit code 0)
- [ ] Production Firebase deployment must be explicitly approved by the owner before changes are pushed live

## 8. Update log

| Date | Branch / commit | Change | Verification | Next action |
|---|---|---|---|---|
| 2026-10-12 | feature/auto-payment / 5fff77b | Updated the project context to include the verified match-counting and billing logic, Firebase integration details, and current architecture summary from the live source | Source inspection plus terminal build confirmation (`npm.cmd run build` exit code 0) | Review Firebase console settings and deployment permissions before any production release |

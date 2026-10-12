export const PUBLIC_SESSION_SCHEMA_VERSION = 1 as const;

export type PublicPlayerStatus = 'waiting' | 'playing' | 'resting' | 'left';
export type PublicRegistrationType = 'registered' | 'walkin';
export type PublicSkillLevel = 'Newbie' | 'C' | 'B' | 'A' | 'PRO';

export interface PublicRosterPlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  isCheckedIn: boolean;
  todayRoster: boolean;
  status: PublicPlayerStatus;
  skillLevel?: PublicSkillLevel;
  skillScore?: number;
}

export interface PublicConfirmedPlayer {
  id: string;
  nickname: string;
  avatarColor: string;
  registrationType: PublicRegistrationType;
  matchesPlayed: number;
  walkInPenaltyMatches?: number;
  skillLevel?: PublicSkillLevel;
}

export interface PublicActiveMatch {
  id: string;
  courtId: string;
  courtName: string;
  teamA: [string, string];
  teamB: [string, string];
  startedAt: number;
  shuttlecocksCount: number;
  game1ScoreA?: number;
  game1ScoreB?: number;
  game2ScoreA?: number;
  game2ScoreB?: number;
}

export interface PublicConfirmedPreMatch {
  id: string;
  slotNumber: 1 | 2 | 3;
  courtName: string;
  teamA: [string, string];
  teamB: [string, string];
  participants: PublicConfirmedPlayer[];
  confirmedAt: number;
}

export interface PublicMatchHistoryItem {
  id: string;
  courtName: string;
  startTime: string;
  durationMinutes: number;
  teamANames: string[];
  teamBNames: string[];
  shuttlecocksCount: number;
  scoreA?: number;
  scoreB?: number;
  game1ScoreA?: number;
  game1ScoreB?: number;
  game2ScoreA?: number;
  game2ScoreB?: number;
}

export interface PublicSession {
  schemaVersion: typeof PUBLIC_SESSION_SCHEMA_VERSION;
  sourceRevision: number;
  session: {
    sessionId: string;
    title: string;
    date: string;
    venueName: string;
    startTime: string;
    endTime: string;
    courts: Array<{ id: string; name: string; displayOrder: number }>;
    skillVisibility: 'hidden' | 'public';
  };
  roster: PublicRosterPlayer[];
  activeMatches: PublicActiveMatch[];
  confirmedPreMatches: PublicConfirmedPreMatch[];
  queueSummary: {
    waitingCount: number;
    restingCount: number;
  };
  matchHistory: PublicMatchHistoryItem[];
}

type RecordValue = Record<string, unknown>;

const PLAYER_STATUSES = new Set<PublicPlayerStatus>([
  'waiting',
  'playing',
  'resting',
  'left',
]);

const SKILL_LEVELS = new Set<PublicSkillLevel>([
  'Newbie',
  'C',
  'B',
  'A',
  'PRO',
]);

const AVATAR_PALETTE = [
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-blue-500 to-indigo-600',
  'from-pink-500 to-rose-400',
  'from-rose-500 to-red-600',
  'from-cyan-500 to-blue-600',
  'from-violet-500 to-indigo-600',
] as const;

const asRecord = (value: unknown): RecordValue | undefined => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as RecordValue;
};

const asString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value.trim() : fallback;

const asNonNegativeInt = (value: unknown, fallback = 0): number => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric >= 0
    ? Math.floor(numeric)
    : fallback;
};

const asOptionalScore = (value: unknown): number | undefined => {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
};

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
};

const isSkillLevel = (value: unknown): value is PublicSkillLevel =>
  typeof value === 'string' && SKILL_LEVELS.has(value as PublicSkillLevel);

const normalizeStatus = (
  value: unknown,
  isCheckedIn: boolean
): PublicPlayerStatus => {
  if (typeof value === 'string' && PLAYER_STATUSES.has(value as PublicPlayerStatus)) {
    return value as PublicPlayerStatus;
  }
  return isCheckedIn ? 'waiting' : 'left';
};

const normalizeRegistrationType = (value: unknown): PublicRegistrationType =>
  value === 'walkin' ? 'walkin' : 'registered';

const stableAvatarColor = (id: string): string => {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
};

const twoPlayerTeam = (value: unknown): [string, string] | undefined => {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  if (value.some((id) => typeof id !== 'string' || !id.trim())) return undefined;
  return [value[0].trim(), value[1].trim()];
};

const optionalNumberField = (
  source: RecordValue,
  key: string,
  target: RecordValue,
  targetKey = key
): void => {
  const value = asOptionalScore(source[key]);
  if (value !== undefined) target[targetKey] = value;
};

/**
 * Projects the canonical session through a field allowlist. Unknown input is
 * accepted deliberately so legacy records and optional extension fields cannot
 * be copied into the public document by object spreading.
 */
export function mapCanonicalStateToPublicSession(
  canonicalState: unknown,
  sourceRevision: number
): PublicSession {
  const state = asRecord(canonicalState) ?? {};
  const config = asRecord(state.sessionConfig) ?? {};
  const date = asString(config.date, '');
  const courtNames = Array.isArray(config.courtNames)
    ? config.courtNames.map((name) => asString(name)).filter(Boolean)
    : [];
  const skillVisibility = config.hideSkillFromMembers === false ? 'public' : 'hidden';
  const canonicalPlayers = new Map<string, RecordValue>();
  if (Array.isArray(state.players)) {
    for (const candidate of state.players) {
      const player = asRecord(candidate);
      const id = player ? asString(player.id) : '';
      if (player && id) canonicalPlayers.set(id, player);
    }
  }

  const projectConfirmedPlayer = (id: string): PublicConfirmedPlayer | undefined => {
    const player = canonicalPlayers.get(id);
    if (!player) return undefined;
    const nickname = asString(player.nickname);
    if (!nickname) return undefined;
    const registrationType = normalizeRegistrationType(player.registrationType);
    const gamesPlayed = asNonNegativeInt(player.gamesPlayed);
    const projected: PublicConfirmedPlayer = {
      id,
      nickname,
      avatarColor: stableAvatarColor(id),
      registrationType,
      matchesPlayed: asNonNegativeInt(player.matchesPlayed, Math.floor(gamesPlayed / 2)),
    };
    if (registrationType === 'walkin') {
      projected.walkInPenaltyMatches = asNonNegativeInt(player.walkInPenaltyMatches, 1);
    }
    if (skillVisibility === 'public' && isSkillLevel(player.skillLevel)) {
      projected.skillLevel = player.skillLevel;
    }
    return projected;
  };

  const activeMatches: PublicActiveMatch[] = [];
  const activePlayerIds = new Set<string>();

  if (Array.isArray(state.activeMatches)) {
    for (const candidate of state.activeMatches) {
      const match = asRecord(candidate);
      if (!match) continue;

      const id = asString(match.id);
      const courtId = asString(match.courtId);
      const teamA = twoPlayerTeam(match.teamA);
      const teamB = twoPlayerTeam(match.teamB);
      const startedAt = asOptionalScore(match.startTime);
      if (!id || !courtId || !teamA || !teamB || startedAt === undefined) continue;
      if (match.status !== undefined && match.status !== 'playing') continue;

      const projected: PublicActiveMatch = {
        id,
        courtId,
        courtName: asString(match.courtName, courtNames[Number(courtId.replace('court-', '')) - 1] || courtId),
        teamA,
        teamB,
        startedAt,
        shuttlecocksCount: asNonNegativeInt(match.shuttlecocksCount),
      };
      optionalNumberField(match, 'game1ScoreA', projected as unknown as RecordValue);
      optionalNumberField(match, 'game1ScoreB', projected as unknown as RecordValue);
      optionalNumberField(match, 'game2ScoreA', projected as unknown as RecordValue);
      optionalNumberField(match, 'game2ScoreB', projected as unknown as RecordValue);
      activeMatches.push(projected);
      [...teamA, ...teamB].forEach((playerId) => activePlayerIds.add(playerId));
    }
  }
  activeMatches.sort((a, b) => a.courtId.localeCompare(b.courtId) || a.id.localeCompare(b.id));

  const confirmedSlots = [
    { slot: 1 as const, value: state.confirmedPreMatch },
    { slot: 2 as const, value: state.confirmedPreMatch2 },
    { slot: 3 as const, value: state.confirmedPreMatch3 },
  ];
  const confirmedPreMatches: PublicConfirmedPreMatch[] = [];
  const confirmedPlayerIds = new Set<string>();

  for (const { slotNumber, value } of confirmedSlots.map(({ slot, value }) => ({ slotNumber: slot, value }))) {
    const preMatch = asRecord(value);
    if (!preMatch) continue;
    const id = asString(preMatch.id, `confirmed-slot-${slotNumber}`);
    const teamA = twoPlayerTeam(preMatch.teamA);
    const teamB = twoPlayerTeam(preMatch.teamB);
    if (!teamA || !teamB) continue;
    const members = [...teamA, ...teamB];
    if (new Set(members).size !== 4 || members.some((memberId) => memberId.startsWith('__PM_VACANT__'))) continue;

    const confirmedAt = asNonNegativeInt(preMatch.confirmedAt, 0);
    const courtName = asString(
      preMatch.targetCourtName,
      courtNames[slotNumber - 1] || `Court ${slotNumber}`
    );
    const participants = members
      .map(projectConfirmedPlayer)
      .filter((player): player is PublicConfirmedPlayer => Boolean(player));
    confirmedPreMatches.push({
      id,
      slotNumber,
      courtName,
      teamA,
      teamB,
      participants,
      confirmedAt,
    });
    members.forEach((memberId) => confirmedPlayerIds.add(memberId));
  }
  confirmedPreMatches.sort((a, b) => a.confirmedAt - b.confirmedAt || a.slotNumber - b.slotNumber);

  const roster: PublicRosterPlayer[] = [];
  if (Array.isArray(state.players)) {
    for (const candidate of state.players) {
      const player = asRecord(candidate);
      if (!player) continue;
      const id = asString(player.id);
      const nickname = asString(player.nickname);
      if (!id || !nickname) continue;

      const isCheckedIn = player.isCheckedIn === true;
      const gamesPlayed = asNonNegativeInt(player.gamesPlayed);
      const todayRoster = player.todayRoster === true
        || isCheckedIn
        || gamesPlayed > 0
        || asNonNegativeInt(player.extraShuttlecocks) > 0
        || player.paid === true;

      if (!todayRoster && !activePlayerIds.has(id) && !confirmedPlayerIds.has(id)) continue;

      const projected: PublicRosterPlayer = {
        id,
        nickname,
        avatarColor: stableAvatarColor(id),
        isCheckedIn,
        todayRoster,
        status: normalizeStatus(player.status, isCheckedIn),
      };
      if (skillVisibility === 'public' && isSkillLevel(player.skillLevel)) {
        projected.skillLevel = player.skillLevel;
        const skillScore = asOptionalScore(player.skillScore);
        if (skillScore !== undefined) projected.skillScore = skillScore;
      }
      roster.push(projected);
    }
  }
  roster.sort((a, b) => a.id.localeCompare(b.id));

  const matchHistory: PublicMatchHistoryItem[] = [];
  if (Array.isArray(state.matchHistory)) {
    for (const candidate of state.matchHistory) {
      const item = asRecord(candidate);
      if (!item) continue;
      const id = asString(item.id);
      const courtName = asString(item.courtName);
      if (!id || !courtName) continue;
      const projected: PublicMatchHistoryItem = {
        id,
        courtName,
        startTime: asString(item.startTime),
        durationMinutes: asNonNegativeInt(item.durationMinutes),
        teamANames: asStringArray(item.teamANames),
        teamBNames: asStringArray(item.teamBNames),
        shuttlecocksCount: asNonNegativeInt(item.shuttlecocksCount),
      };
      optionalNumberField(item, 'scoreA', projected as unknown as RecordValue);
      optionalNumberField(item, 'scoreB', projected as unknown as RecordValue);
      optionalNumberField(item, 'game1ScoreA', projected as unknown as RecordValue);
      optionalNumberField(item, 'game1ScoreB', projected as unknown as RecordValue);
      optionalNumberField(item, 'game2ScoreA', projected as unknown as RecordValue);
      optionalNumberField(item, 'game2ScoreB', projected as unknown as RecordValue);
      matchHistory.push(projected);
    }
  }

  const waitingIds = new Set(
    roster
      .filter((player) => player.isCheckedIn && player.status === 'waiting' && !activePlayerIds.has(player.id))
      .map((player) => player.id)
  );
  const restingIds = new Set(
    roster
      .filter((player) => player.isCheckedIn && player.status === 'resting' && !activePlayerIds.has(player.id))
      .map((player) => player.id)
  );
  const normalizedRevision = asNonNegativeInt(sourceRevision);

  return {
    schemaVersion: PUBLIC_SESSION_SCHEMA_VERSION,
    sourceRevision: normalizedRevision,
    session: {
      sessionId: `guanguan:${date || 'undated'}`,
      title: asString(config.sessionTitle),
      date,
      venueName: asString(config.venueName),
      startTime: asString(config.startTime),
      endTime: asString(config.endTime),
      courts: courtNames.map((name, index) => ({
        id: `court-${index + 1}`,
        name,
        displayOrder: index + 1,
      })),
      skillVisibility,
    },
    roster,
    activeMatches,
    confirmedPreMatches,
    queueSummary: {
      waitingCount: waitingIds.size,
      restingCount: restingIds.size,
    },
    matchHistory,
  };
}
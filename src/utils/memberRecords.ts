import { Player } from '../types';

export interface DeletedMemberRecord {
  id: string;
  playerId: string;
  player: Player;
  deletedAt: number;
  deletedBy?: string;
  sessionDate?: string;
}

export interface MemberLifetimeStats {
  playerId: string;
  totalGames: number;
  totalMatches: number;
  totalSessions: number;
  lastAttendanceDate?: string;
  birthday?: string;
  processedHistoryIds: string[];
  freeGameRewardsRedeemed: number;
  birthdayCourtRewardsRedeemedYears: string[];
  updatedAt: number;
}

export type MemberLifetimeStatsMap = Record<string, MemberLifetimeStats>;

export function getDeletedMembers(state: any): DeletedMemberRecord[] {
  return Array.isArray(state?.deletedMembers) ? state.deletedMembers : [];
}

export function getMemberStatsMap(state: any): MemberLifetimeStatsMap {
  const raw = state?.memberLifetimeStats;
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as MemberLifetimeStatsMap)
    : {};
}

const num = (v: unknown, fallback = 0) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

export function ensureMemberStats(
  statsMap: MemberLifetimeStatsMap,
  player: Player,
  sessionDate?: string
): MemberLifetimeStats {
  const existing = statsMap[player.id];
  if (existing) {
    return {
      ...existing,
      playerId: player.id,
      totalGames: num(existing.totalGames),
      totalMatches: num(existing.totalMatches),
      totalSessions: num(existing.totalSessions),
      processedHistoryIds: Array.isArray(existing.processedHistoryIds)
        ? existing.processedHistoryIds
        : [],
      freeGameRewardsRedeemed: num(existing.freeGameRewardsRedeemed),
      birthdayCourtRewardsRedeemedYears: Array.isArray(existing.birthdayCourtRewardsRedeemedYears)
        ? existing.birthdayCourtRewardsRedeemedYears
        : [],
      updatedAt: num(existing.updatedAt, Date.now()),
    };
  }

  const attended = Boolean(player.isCheckedIn && sessionDate);
  return {
    playerId: player.id,
    totalGames: num(player.gamesPlayed),
    totalMatches: num(player.matchesPlayed),
    totalSessions: attended ? 1 : 0,
    lastAttendanceDate: attended ? sessionDate : undefined,
    processedHistoryIds: [],
    freeGameRewardsRedeemed: 0,
    birthdayCourtRewardsRedeemedYears: [],
    updatedAt: Date.now(),
  };
}

export const getFreeGameRewardsEarned = (totalGames: number) =>
  Math.floor(Math.max(0, totalGames) / 50);

export const getAvailableFreeGameRewards = (stats: MemberLifetimeStats) =>
  Math.max(0, getFreeGameRewardsEarned(stats.totalGames) - stats.freeGameRewardsRedeemed);

export const getLoyaltyProgressGames = (totalGames: number) =>
  Math.max(0, totalGames) % 50;

export const getGamesToNextReward = (totalGames: number) => {
  const safe = Math.max(0, totalGames);
  const remainder = safe % 50;
  return remainder === 0 && safe > 0 ? 50 : 50 - remainder;
};

const monthDay = (value?: string) => {
  if (!value) return '';
  const p = value.split('-');
  return p.length === 3 ? `${p[1]}-${p[2]}` : '';
};

export const isBirthdayOnSessionDate = (birthday?: string, sessionDate?: string) =>
  Boolean(birthday && sessionDate && monthDay(birthday) === monthDay(sessionDate));

export const getSessionYear = (sessionDate?: string) =>
  sessionDate?.slice(0, 4) || String(new Date().getFullYear());

export const isBirthdayCourtRewardAvailable = (
  stats: MemberLifetimeStats,
  sessionDate?: string
) =>
  isBirthdayOnSessionDate(stats.birthday, sessionDate) &&
  !stats.birthdayCourtRewardsRedeemedYears.includes(getSessionYear(sessionDate));


/**
 * Count only COMPLETED matches in the current session.
 * This is the billing source of truth for base shuttle charges.
 *
 * Why:
 * - Check-in alone must NOT create a shuttle charge.
 * - Active/in-progress match must NOT create a shuttle charge yet.
 * - Charge starts only after the match is finished and appears in matchHistory.
 * - This also protects against stale matchesPlayed values left from an older day.
 */
export function getCurrentSessionCompletedMatchCount(
  player: Player,
  statsMap: MemberLifetimeStatsMap,
  matchHistory: any[]
): number {
  if (!Array.isArray(matchHistory) || matchHistory.length === 0) return 0;

  const currentHistoryIds = new Set(
    matchHistory
      .map((item) => (item && typeof item.id === 'string' ? item.id : ''))
      .filter(Boolean)
  );

  const stats = statsMap[player.id];
  if (stats && Array.isArray(stats.processedHistoryIds)) {
    const byId = stats.processedHistoryIds.filter((id) =>
      currentHistoryIds.has(id)
    ).length;

    if (byId > 0) return byId;
  }

  // Fallback for old records created before processedHistoryIds existed.
  const nickname =
    typeof player.nickname === 'string' ? player.nickname.trim() : '';

  if (!nickname) return 0;

  return matchHistory.filter((item) => {
    const names = [
      ...(Array.isArray(item?.teamANames) ? item.teamANames : []),
      ...(Array.isArray(item?.teamBNames) ? item.teamBNames : []),
    ].map((name: unknown) =>
      typeof name === 'string' ? name.trim() : String(name ?? '').trim()
    );

    return names.includes(nickname);
  }).length;
}

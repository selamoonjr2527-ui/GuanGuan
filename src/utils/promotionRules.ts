import { Player, SessionConfig } from '../types';
import {
  MemberLifetimeStats,
  MemberLifetimeStatsMap,
  ensureMemberStats,
  getSessionYear,
  isBirthdayOnSessionDate,
} from './memberRecords';

export type PromotionConditionType =
  | 'games_milestone'
  | 'visits_milestone'
  | 'birthday';

export type PromotionRewardType =
  | 'free_court_fee'
  | 'free_shuttle_match'
  | 'discount_amount'
  | 'discount_percent';

export interface PromotionRule {
  id: string;
  name: string;
  enabled: boolean;
  conditionType: PromotionConditionType;
  conditionValue: number;
  rewardType: PromotionRewardType;
  rewardValue: number;
  createdAt: number;
  updatedAt: number;
}

export interface PromotionRedemption {
  id: string;
  promotionId: string;
  playerId: string;
  sessionDate: string;
  redeemedAt: number;
  discountAmount: number;
  note?: string;
}

export const DEFAULT_PROMOTION_RULES: PromotionRule[] = [
  {
    id: 'promo-50-games',
    name: 'ครบ 50 Games • ฟรีค่าลูก 1 Match',
    enabled: true,
    conditionType: 'games_milestone',
    conditionValue: 50,
    rewardType: 'free_shuttle_match',
    rewardValue: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
  {
    id: 'promo-birthday-court',
    name: 'Birthday • ฟรีค่าคอร์ท',
    enabled: true,
    conditionType: 'birthday',
    conditionValue: 1,
    rewardType: 'free_court_fee',
    rewardValue: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  },
];

export function getPromotionRules(state: any): PromotionRule[] {
  return Array.isArray(state?.promotionRules)
    ? state.promotionRules
    : DEFAULT_PROMOTION_RULES;
}

export function getPromotionRedemptions(state: any): PromotionRedemption[] {
  return Array.isArray(state?.promotionRedemptions)
    ? state.promotionRedemptions
    : [];
}

/**
 * Billing rule:
 * - Court fee = once per person/session
 * - Base shuttle = matchesPlayed × shuttlecockFeePerMatchPerPerson
 * - 1 round-trip match = 1 match charge, even though it records 2 games/sets.
 * - Extra shuttle = extraShuttlecocks × extraShuttlecockPrice
 */
export function calculatePlayerBaseCharge(
  player: Player,
  config: SessionConfig
): {
  courtFee: number;
  matchCount: number;
  shuttleFee: number;
  extraShuttleCount: number;
  extraShuttleFee: number;
  total: number;
} {
  const courtFee = Number(config.memberCourtFee || 0);
  const matchCount = Math.max(0, Number(player.matchesPlayed || 0));
  const shuttleFee =
    matchCount * Number(config.shuttlecockFeePerMatchPerPerson || 0);
  const extraShuttleCount = Math.max(0, Number(player.extraShuttlecocks || 0));
  const extraShuttleFee =
    extraShuttleCount * Number(config.extraShuttlecockPrice || 0);

  return {
    courtFee,
    matchCount,
    shuttleFee,
    extraShuttleCount,
    extraShuttleFee,
    total: Math.max(0, courtFee + shuttleFee + extraShuttleFee),
  };
}

export function calculatePromotionDiscount(
  rule: PromotionRule,
  player: Player,
  config: SessionConfig
): number {
  const base = calculatePlayerBaseCharge(player, config);

  switch (rule.rewardType) {
    case 'free_court_fee':
      return Math.min(base.total, base.courtFee);

    case 'free_shuttle_match':
      return Math.min(
        base.total,
        Math.max(0, Number(config.shuttlecockFeePerMatchPerPerson || 0)) *
          Math.max(1, Number(rule.rewardValue || 1))
      );

    case 'discount_amount':
      return Math.min(base.total, Math.max(0, Number(rule.rewardValue || 0)));

    case 'discount_percent':
      return Math.min(
        base.total,
        Math.max(0, base.total * Math.min(100, Number(rule.rewardValue || 0)) / 100)
      );

    default:
      return 0;
  }
}

function countRuleRedemptions(
  redemptions: PromotionRedemption[],
  playerId: string,
  promotionId: string
): number {
  return redemptions.filter(
    (x) => x.playerId === playerId && x.promotionId === promotionId
  ).length;
}

export function getPromotionAvailableCredits(
  rule: PromotionRule,
  player: Player,
  statsMap: MemberLifetimeStatsMap,
  redemptions: PromotionRedemption[],
  sessionDate: string
): number {
  if (!rule.enabled) return 0;

  const stats = ensureMemberStats(statsMap, player, sessionDate);
  const used = countRuleRedemptions(redemptions, player.id, rule.id);

  if (rule.conditionType === 'games_milestone') {
    const threshold = Math.max(1, Number(rule.conditionValue || 1));
    const earned = Math.floor(Math.max(0, stats.totalGames) / threshold);
    return Math.max(0, earned - used);
  }

  if (rule.conditionType === 'visits_milestone') {
    const threshold = Math.max(1, Number(rule.conditionValue || 1));
    const earned = Math.floor(Math.max(0, stats.totalSessions) / threshold);
    return Math.max(0, earned - used);
  }

  if (rule.conditionType === 'birthday') {
    if (!isBirthdayOnSessionDate(stats.birthday, sessionDate)) return 0;

    const year = getSessionYear(sessionDate);
    const usedThisYear = redemptions.some(
      (x) =>
        x.playerId === player.id &&
        x.promotionId === rule.id &&
        x.sessionDate.startsWith(year)
    );

    return usedThisYear ? 0 : 1;
  }

  return 0;
}

export function getSessionPromotionDiscountTotal(
  playerId: string,
  sessionDate: string,
  redemptions: PromotionRedemption[]
): number {
  return redemptions
    .filter(
      (x) => x.playerId === playerId && x.sessionDate === sessionDate
    )
    .reduce((sum, x) => sum + Math.max(0, Number(x.discountAmount || 0)), 0);
}

export function calculatePlayerFinalCharge(
  player: Player,
  config: SessionConfig,
  redemptions: PromotionRedemption[],
  sessionDate: string
) {
  const base = calculatePlayerBaseCharge(player, config);
  const promotionDiscount = Math.min(
    base.total,
    getSessionPromotionDiscountTotal(player.id, sessionDate, redemptions)
  );

  return {
    ...base,
    promotionDiscount,
    finalTotal: Math.max(0, base.total - promotionDiscount),
  };
}

export function conditionLabel(rule: PromotionRule): string {
  if (rule.conditionType === 'games_milestone') {
    return `ครบทุก ${rule.conditionValue} Games`;
  }
  if (rule.conditionType === 'visits_milestone') {
    return `มาครบทุก ${rule.conditionValue} ครั้ง`;
  }
  return 'ตรงกับวันเกิด';
}

export function rewardLabel(rule: PromotionRule): string {
  switch (rule.rewardType) {
    case 'free_court_fee':
      return 'ฟรีค่าคอร์ท';
    case 'free_shuttle_match':
      return `ฟรีค่าลูก ${Math.max(1, rule.rewardValue || 1)} Match`;
    case 'discount_amount':
      return `ลด ${Math.max(0, rule.rewardValue || 0)} บาท`;
    case 'discount_percent':
      return `ลด ${Math.max(0, rule.rewardValue || 0)}%`;
    default:
      return '-';
  }
}

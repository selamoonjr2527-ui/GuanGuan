import type { Player, SessionConfig } from '../types';
import { calculatePlayerFinalCharge, type PromotionRedemption } from './promotionRules';

/** GG_UNIFIED_FINANCE_V519A: pure, read-only, shared by Billing and Finance. */
export function getSessionBillingMembers(players: Player[]): Player[] {
  return players.filter((p) =>
    p.isCheckedIn || p.status === 'left' || Boolean(p.checkInTime) ||
    Boolean(p.checkInTimestamp) || (p.matchesPlayed || 0) > 0 ||
    (p.extraShuttlecocks || 0) > 0 || p.paid
  );
}

export function getMemberChargeV519(
  player: Player, config: SessionConfig, redemptions: PromotionRedemption[]
): number {
  const adjustment = Number((player as Player & { billingMatchAdjustment?: number }).billingMatchAdjustment || 0);
  const manual = Number((player as Player & { billingAmountAdjustment?: number }).billingAmountAdjustment || 0);
  const adjusted: Player = adjustment ? {
    ...player,
    matchesPlayed: Math.max(0, Number(player.matchesPlayed || 0) + adjustment),
    gamesPlayed: Math.max(0, Number(player.gamesPlayed || 0) + adjustment * 2),
  } : player;
  const charge = calculatePlayerFinalCharge(adjusted, config, redemptions, config.date).finalTotal;
  return Math.max(0, Math.round(charge + manual));
}

export function calculateSessionFinanceV519(
  players: Player[], config: SessionConfig, redemptions: PromotionRedemption[]
) {
  const members = getSessionBillingMembers(players);
  const expected = members.reduce((sum, member) => sum + getMemberChargeV519(member, config, redemptions), 0);
  const collected = members.reduce((sum, member) => member.paid
    ? sum + (typeof member.paidAmount === 'number' && Number.isFinite(member.paidAmount)
      ? member.paidAmount : getMemberChargeV519(member, config, redemptions))
    : sum, 0);
  const unpaid = members.filter((member) => !member.paid)
    .reduce((sum, member) => sum + getMemberChargeV519(member, config, redemptions), 0);
  return { members, expected, collected, unpaid, difference: expected - collected - unpaid };
}

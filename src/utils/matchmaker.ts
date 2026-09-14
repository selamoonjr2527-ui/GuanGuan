import { Player, SkillLevel } from '../types';

export interface MatchmakingResult {
  teamA: [Player, Player];
  teamB: [Player, Player];
  skillDiff: number;
  teamAAvgSkill: number;
  teamBAvgSkill: number;
  pairingType: 'strong_weak_balanced' | 'same_tier' | 'fair_queue';
  pairingLabelThai: string;
  explanationThai: string;
}

/**
 * Calculates how long a player has been waiting in milliseconds.
 * Priority: lastMatchFinishTime > checkInTimestamp > fallback estimate.
 */
export function getPlayerWaitTimeMs(player: Player, now: number = Date.now()): number {
  if (player.lastMatchFinishTime) {
    return Math.max(0, now - player.lastMatchFinishTime);
  }
  if (player.checkInTimestamp) {
    return Math.max(0, now - player.checkInTimestamp);
  }
  // Fallback: estimate from checkInTime HH:mm if available
  if (player.checkInTime) {
    const parts = player.checkInTime.split(':');
    if (parts.length === 2) {
      const d = new Date(now);
      const h = Number(parts[0]);
      const m = Number(parts[1]);
      if (!isNaN(h) && !isNaN(m)) {
        d.setHours(h, m, 0, 0);
        let diff = now - d.getTime();
        // If checkInTime is recorded in the same session but clock difference makes it slightly future, wrap
        if (diff < 0) {
          diff = Math.max(0, diff + 24 * 3600 * 1000);
        }
        if (diff >= 0 && diff <= 24 * 3600 * 1000) {
          return diff;
        }
      }
    }
  }
  return 15 * 60 * 1000; // default 15 minutes wait for legacy checked-in players
}

export function formatWaitMinutes(ms: number): string {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return `${mins} นาที`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hrs} ชม. ${remMins > 0 ? `${remMins} น.` : ''}`;
}

/**
 * Calculates effective games for court matchmaking priority.
 * Walk-in players carry a penalty (default 1 round = 2 games).
 */
export function getPlayerEffectiveGames(player: Player): number {
  const isWalkIn = player.registrationType === 'walkin';
  const penalty = isWalkIn ? (player.walkInPenaltyMatches ?? 1) * 2 : 0;
  return player.gamesPlayed + penalty;
}

/**
 * Compare two players for court queue priority.
 * 1. Pre-registered players with 0 games ALWAYS play before any Walk-in.
 * 2. Fewer effective games (gamesPlayed + Walk-in penalty) comes first.
 * 3. Pre-registered players ALWAYS beat Walk-in on equal effective games.
 * 4. Longest waiting time comes first as final tie-breaker.
 */
export function comparePlayerPriority(a: Player, b: Player, now: number = Date.now()): number {
  const isWalkInA = a.registrationType === 'walkin';
  const isWalkInB = b.registrationType === 'walkin';

  // 1. If one is pre-registered with 0 games and other is walk-in, pre-registered ALWAYS gets court first
  if (!isWalkInA && a.gamesPlayed === 0 && isWalkInB) return -1;
  if (isWalkInA && !isWalkInB && b.gamesPlayed === 0) return 1;

  // 2. Compare effective games (gamesPlayed + walkInPenaltyMatches * 2)
  const effGamesA = getPlayerEffectiveGames(a);
  const effGamesB = getPlayerEffectiveGames(b);

  if (effGamesA !== effGamesB) {
    return effGamesA - effGamesB;
  }

  // 3. Tie-breaker: Pre-registered member ALWAYS has priority over Walk-in
  if (!isWalkInA && isWalkInB) return -1;
  if (isWalkInA && !isWalkInB) return 1;

  // 4. Tie-breaker: Higher waiting time first
  const waitA = getPlayerWaitTimeMs(a, now);
  const waitB = getPlayerWaitTimeMs(b, now);
  return waitB - waitA;
}

export function findBalancedMatch(
  availablePlayers: Player[],
  mode: 'balanced' | 'same_tier' | 'fair_queue' = 'balanced'
): MatchmakingResult | null {
  if (availablePlayers.length < 4) {
    return null;
  }

  const now = Date.now();

  // Primary Sort: Registered first + fewer effective games (with walk-in penalty) + waiting time
  const sorted = [...availablePlayers].sort((a, b) => comparePlayerPriority(a, b, now));

  // If mode is fair queue, strictly take top 4 in exact priority order
  if (mode === 'fair_queue') {
    const p = sorted.slice(0, 4);
    return findBestPairingAmongFour(p[0], p[1], p[2], p[3], 'fair_queue');
  }

  // Priority protection: Determine candidate pool so that NO player with lower priority
  // (e.g. Walk-in with penalty or someone with more games) can jump over players at the front of the queue!
  const fourthPlayer = sorted[3];
  const thresholdEff = getPlayerEffectiveGames(fourthPlayer);
  const isWalkInAt4 = fourthPlayer.registrationType === 'walkin';

  // Eligible candidates: must be within the priority tier of the 4th player in queue
  const eligibleCandidates = sorted.filter((p) => {
    const eff = getPlayerEffectiveGames(p);
    if (eff < thresholdEff) return true;
    if (eff === thresholdEff) {
      // If the 4th player is pre-registered, walk-in players with same effGames cannot jump in
      if (!isWalkInAt4 && p.registrationType === 'walkin') return false;
      return true;
    }
    return false;
  });

  // Pick top eligible candidates (up to 6) to find best balance without violating priority
  const candidates = eligibleCandidates.length >= 4
    ? eligibleCandidates.slice(0, Math.min(eligibleCandidates.length, 6))
    : sorted.slice(0, 4);

  if (mode === 'same_tier') {
    // Try to find 4 players from the top waiting group with the closest skill levels
    let bestCluster: Player[] = candidates.slice(0, 4);
    let minTierVariance = Infinity;

    for (let i = 0; i < candidates.length - 3; i++) {
      for (let j = i + 1; j < candidates.length - 2; j++) {
        for (let k = j + 1; k < candidates.length - 1; k++) {
          for (let l = k + 1; l < candidates.length; l++) {
            const group = [candidates[i], candidates[j], candidates[k], candidates[l]];
            const scores = group.map((p) => p.skillScore);
            const max = Math.max(...scores);
            const min = Math.min(...scores);
            const diff = max - min;
            if (diff < minTierVariance) {
              minTierVariance = diff;
              bestCluster = group;
            }
          }
        }
      }
    }

    return findBestPairingAmongFour(
      bestCluster[0],
      bestCluster[1],
      bestCluster[2],
      bestCluster[3],
      'same_tier'
    );
  }

  // Default: 'balanced'
  // Explore combinations from top waiting candidates that achieve the best balance
  // Either same-tier OR strong+weak pairing [เก่ง+อ่อน vs เก่ง+อ่อน]
  let bestResult: MatchmakingResult | null = null;
  let minDiff = Infinity;

  for (let i = 0; i < candidates.length - 3; i++) {
    for (let j = i + 1; j < candidates.length - 2; j++) {
      for (let k = j + 1; k < candidates.length - 1; k++) {
        for (let l = k + 1; l < candidates.length; l++) {
          const result = findBestPairingAmongFour(
            candidates[i],
            candidates[j],
            candidates[k],
            candidates[l],
            'balanced'
          );
          if (result.skillDiff < minDiff) {
            minDiff = result.skillDiff;
            bestResult = result;
          }
        }
      }
    }
  }

  return bestResult;
}

export function findBestPairingAmongFour(
  p1: Player,
  p2: Player,
  p3: Player,
  p4: Player,
  preferredMode: 'balanced' | 'same_tier' | 'fair_queue' = 'balanced'
): MatchmakingResult {
  // Sort players by skill: [Highest, 2nd, 3rd, Lowest]
  const ranked = [p1, p2, p3, p4].sort((a, b) => b.skillScore - a.skillScore);
  const [high1, high2, low2, low1] = ranked;

  // Doubles pairings:
  // Option 1 (Classic Strong+Weak): [high1 + low1] vs [high2 + low2]
  // Option 2 (Split): [high1 + low2] vs [high2 + low1]
  // Option 3 (Uneven high vs low): [high1 + high2] vs [low2 + low1]
  const pairings: Array<{ teamA: [Player, Player]; teamB: [Player, Player] }> = [
    { teamA: [high1, low1], teamB: [high2, low2] },
    { teamA: [high1, low2], teamB: [high2, low1] },
    { teamA: [high1, high2], teamB: [low2, low1] },
  ];

  let best = pairings[0];
  let minDiff = Infinity;
  let bestTeamAAvg = 0;
  let bestTeamBAvg = 0;

  for (const pair of pairings) {
    const avgA = (pair.teamA[0].skillScore + pair.teamA[1].skillScore) / 2;
    const avgB = (pair.teamB[0].skillScore + pair.teamB[1].skillScore) / 2;
    const diff = Math.abs(avgA - avgB);

    if (diff < minDiff) {
      minDiff = diff;
      best = pair;
      bestTeamAAvg = avgA;
      bestTeamBAvg = avgB;
    }
  }

  // Determine pairing character
  const maxSkill = high1.skillScore;
  const minSkill = low1.skillScore;
  const spread = maxSkill - minSkill;

  let pairingType: 'strong_weak_balanced' | 'same_tier' | 'fair_queue' = 'same_tier';
  let pairingLabelThai = 'มือระดับใกล้เคียงกัน (Same Tier)';
  let explanationThai = 'ผู้เล่นทั้ง 4 คนมีระดับฝีมือใกล้เคียงกัน ตีสนุกสูสี';

  if (spread >= 1.0) {
    pairingType = 'strong_weak_balanced';
    pairingLabelThai = 'สมดุล: คนเก่ง + คนเริ่มต้น ดึงเกมสูสี (Strong + Weak)';
    explanationThai = `ประกบคู่คนเก่งจับคู่กับคนเริ่มต้น (${best.teamA[0].nickname}+${best.teamA[1].nickname} vs ${best.teamB[0].nickname}+${best.teamB[1].nickname}) เพื่อให้แต้มเฉลี่ยสมดุลกัน`;
  } else if (preferredMode === 'fair_queue') {
    pairingType = 'fair_queue';
    pairingLabelThai = 'จัดตามคิวรอนานสุด (Longest Waiting)';
    explanationThai = 'เรียงลำดับจากผู้ที่รอเล่นนานที่สุดก่อนเป็นอันดับแรก';
  }

  return {
    teamA: best.teamA,
    teamB: best.teamB,
    skillDiff: Math.round(minDiff * 100) / 100,
    teamAAvgSkill: Math.round(bestTeamAAvg * 10) / 10,
    teamBAvgSkill: Math.round(bestTeamBAvg * 10) / 10,
    pairingType,
    pairingLabelThai,
    explanationThai,
  };
}

export function calculateSkillTier(score: number): SkillLevel {
  if (score <= 1.5) return 'Newbie';
  if (score <= 2.5) return 'C';
  if (score <= 3.5) return 'B';
  if (score <= 4.4) return 'A';
  return 'PRO';
}

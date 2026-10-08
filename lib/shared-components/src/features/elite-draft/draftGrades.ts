/**
 * Draft-grade helpers shared by both completion layouts — the compact
 * {@link DraftRoomRecap} and the wide {@link DraftCompleteView} (LS-10997) —
 * so the same team always receives the same grade, projected points and ADP
 * value regardless of viewport tier.
 */
import type { DraftPickRecord, DraftPlayer } from './types';

export interface PickValue {
  pick: DraftPickRecord;
  player: DraftPlayer;
  /** overallPick - adpRank; positive means the player fell further than expected (good value). */
  value: number;
}

export interface TeamDraftGrade {
  grade: string;
  /** Sum of per-pick ADP value across the team's picks. */
  totalValue: number;
  /** Sum of the team's projected points. */
  projPts: number;
  pickValues: PickValue[];
  /** The pick with the highest ADP value, or null for an empty roster. */
  bestValue: PickValue | null;
}

/**
 * No ADP field exists on `DraftPlayer` (see DraftPlayersTab.tsx) — proxy
 * each drafted player's expected pick position with their 1-based rank by
 * projected points among every player drafted this draft, mirroring the
 * same "no real ADP" proxy already established elsewhere in this feature.
 */
export function buildAdpRanks(
  pickHistory: DraftPickRecord[],
  statsLookup: Map<number, DraftPlayer>,
): Map<number, number> {
  const ranked = pickHistory
    .map((pick) => ({
      playerId: pick.playerId,
      ppg: statsLookup.get(pick.playerId)?.ppg ?? 0,
    }))
    .sort((a, b) => b.ppg - a.ppg);
  const ranks = new Map<number, number>();
  ranked.forEach((entry, index) => {
    if (!ranks.has(entry.playerId)) ranks.set(entry.playerId, index + 1);
  });
  return ranks;
}

/** Coarse letter grade from the average per-pick ADP value — the "prototype"
 *  heuristic the README calls for (sum of overall − ADP), bucketed since the
 *  underlying ADP is itself only a same-draft proxy, not real precision. */
export function gradeFor(totalValue: number, pickCount: number): string {
  if (pickCount === 0) return '—';
  const avg = totalValue / pickCount;
  if (avg >= 15) return 'A+';
  if (avg >= 8) return 'A';
  if (avg >= 3) return 'B+';
  if (avg >= -2) return 'B';
  if (avg >= -8) return 'C';
  return 'D';
}

/**
 * Grade one team's draft. `picks` and `players` must be index-aligned (as
 * `resolveDraftedPlayers` returns them); `pickHistory` is the whole draft,
 * which the ADP proxy ranks against.
 */
export function computeTeamDraftGrade(
  pickHistory: DraftPickRecord[],
  picks: DraftPickRecord[],
  players: DraftPlayer[],
  statsLookup: Map<number, DraftPlayer>,
): TeamDraftGrade {
  const adpRanks = buildAdpRanks(pickHistory, statsLookup);
  const pickValues = picks.map<PickValue>((pick, i) => {
    const rank = adpRanks.get(pick.playerId) ?? pick.overallPick;
    return { pick, player: players[i], value: pick.overallPick - rank };
  });
  const totalValue = pickValues.reduce((sum, v) => sum + v.value, 0);
  const projPts = players.reduce((sum, p) => sum + (p.ppg ?? 0), 0);
  const bestValue = pickValues.reduce<PickValue | null>(
    (best, v) => (best == null || v.value > best.value ? v : best),
    null,
  );
  return {
    grade: gradeFor(totalValue, picks.length),
    totalValue,
    projPts,
    pickValues,
    bestValue,
  };
}

import { PlayoffProjection, TeamStats } from './types';

/**
 * Calculate playoff projections for all teams in a league
 */
export function calculatePlayoffProjections(
  teamStats: TeamStats[],
  options: {
    playoffTeams?: number;
    remainingWeeks?: number;
    simulationCount?: number;
    /** Base RNG seed. Defaults to a hash of the standings, so identical
     *  inputs always yield identical projections (LS-10759). */
    seed?: number;
  } = {},
): PlayoffProjection[] {
  const {
    playoffTeams = Math.ceil(teamStats.length / 2),
    remainingWeeks = 5,
    simulationCount = 1000,
  } = options;
  const seed =
    options.seed ?? hashStandings(teamStats, playoffTeams, remainingWeeks);

  const projections: PlayoffProjection[] = [];

  teamStats.forEach((stats) => {
    // Run Monte Carlo simulations for remaining matchups
    const simResults = runPlayoffSimulations(
      stats,
      teamStats,
      remainingWeeks,
      simulationCount,
      createRng(seed ^ Math.imul(stats.teamId, 0x9e3779b1)),
    );

    // Calculate playoff probability based on simulations
    const playoffProbability = simResults.playoffAppearances / simulationCount;

    // Project final wins/losses
    const projectedAdditionalWins = simResults.totalWins / simulationCount;
    const projectedAdditionalLosses = simResults.totalLosses / simulationCount;
    const projectedWins = stats.wins + projectedAdditionalWins;
    const projectedLosses = stats.losses + projectedAdditionalLosses;

    // Calculate strength of schedule
    const strengthOfSchedule = calculateStrengthOfSchedule(stats, teamStats);

    // Calculate magic number (wins needed to clinch playoff spot)
    const magicNumber = calculateMagicNumber(
      stats,
      teamStats,
      playoffTeams,
      remainingWeeks,
    );

    // Calculate elimination number (losses before being eliminated)
    const eliminationNumber = calculateEliminationNumber(
      stats,
      teamStats,
      playoffTeams,
      remainingWeeks,
    );

    projections.push({
      teamId: stats.teamId,
      teamName: stats.teamName,
      currentRecord: `${stats.wins}-${stats.losses}${stats.ties > 0 ? `-${stats.ties}` : ''}`,
      playoffProbability,
      projectedWins: Math.round(projectedWins * 10) / 10,
      projectedLosses: Math.round(projectedLosses * 10) / 10,
      strengthOfSchedule,
      remainingMatchups: remainingWeeks,
      magicNumber,
      eliminationNumber,
    });
  });

  // Sort by playoff probability (highest first); teamId breaks ties so the
  // order does not depend on DB row order (LS-10759)
  return projections.sort(
    (a, b) =>
      b.playoffProbability - a.playoffProbability || a.teamId - b.teamId,
  );
}

/**
 * Run Monte Carlo simulations for playoff predictions
 */
function runPlayoffSimulations(
  team: TeamStats,
  allTeams: TeamStats[],
  remainingWeeks: number,
  simulationCount: number,
  random: () => number,
): {
  playoffAppearances: number;
  totalWins: number;
  totalLosses: number;
} {
  let playoffAppearances = 0;
  let totalWins = 0;
  let totalLosses = 0;

  // Get team's current win probability based on win percentage
  const baseWinProbability = team.winPercentage || 0.5;

  for (let sim = 0; sim < simulationCount; sim++) {
    let simWins = team.wins;
    let simLosses = team.losses;

    // Simulate remaining matchups
    for (let week = 0; week < remainingWeeks; week++) {
      // Add some randomness around the base probability
      const randomFactor = (random() - 0.5) * 0.2; // ±10% variance
      const winProbability = Math.max(
        0.1,
        Math.min(0.9, baseWinProbability + randomFactor),
      );

      if (random() < winProbability) {
        simWins += 1;
      } else {
        simLosses += 1;
      }
    }

    totalWins += simWins - team.wins;
    totalLosses += simLosses - team.losses;

    // Determine if team made playoffs in this simulation
    // Simplified: check if in top half by projected win percentage
    const finalWinPct = simWins / (simWins + simLosses);
    const playoffThreshold = calculatePlayoffThreshold(
      allTeams,
      remainingWeeks,
    );

    if (finalWinPct >= playoffThreshold) {
      playoffAppearances += 1;
    }
  }

  return {
    playoffAppearances,
    totalWins,
    totalLosses,
  };
}

/**
 * Calculate the win percentage threshold for making playoffs
 */
function calculatePlayoffThreshold(
  teams: TeamStats[],
  remainingWeeks: number,
): number {
  // Estimate based on current standings
  // Assume playoff teams need to be in top 50% or better
  const sortedByWinPct = [...teams].sort(
    (a, b) => b.winPercentage - a.winPercentage,
  );
  const medianIndex = Math.floor(sortedByWinPct.length / 2);
  const medianWinPct = sortedByWinPct[medianIndex]?.winPercentage || 0.5;

  // Adjust slightly based on remaining weeks
  const adjustment = remainingWeeks > 0 ? 0.05 : 0;
  return Math.max(0.4, medianWinPct - adjustment);
}

/**
 * Calculate strength of schedule based on opponents' win percentages
 */
function calculateStrengthOfSchedule(
  _team: TeamStats,
  allTeams: TeamStats[],
): number {
  // Simplified: average win percentage of all opponents
  // In a real implementation, would look at actual matchup history
  const totalWinPct = allTeams.reduce((sum, t) => sum + t.winPercentage, 0);
  const averageWinPct = totalWinPct / allTeams.length;

  // Normalize to 0-1 scale where 0.5 is average difficulty
  return averageWinPct;
}

/**
 * Calculate magic number (wins needed to clinch playoff spot).
 *
 * A team clinches once it has strictly more wins than the best-case finish of
 * the `playoffTeams`-th best *other* team, so tied records are treated
 * symmetrically instead of by array order (LS-10759). Returns null when the
 * team cannot clinch on its own wins alone (e.g. early in the season).
 */
function calculateMagicNumber(
  team: TeamStats,
  allTeams: TeamStats[],
  playoffTeams: number,
  remainingWeeks: number,
): number | null {
  if (playoffTeams <= 0) return null;

  const others = allTeams
    .filter((t) => t.teamId !== team.teamId)
    .sort((a, b) => b.wins - a.wins);

  // Fewer rivals than playoff spots: the team cannot be pushed out
  const threat = others[playoffTeams - 1];
  if (!threat) return 0;

  const winsNeeded = threat.wins + remainingWeeks - team.wins + 1;
  if (winsNeeded > remainingWeeks) return null;

  return Math.max(0, winsNeeded);
}

/**
 * Calculate elimination number (losses before being eliminated from playoffs)
 */
function calculateEliminationNumber(
  team: TeamStats,
  allTeams: TeamStats[],
  _playoffTeams: number,
  remainingWeeks: number,
): number | null {
  // Sort teams by wins (descending)
  const sortedTeams = [...allTeams].sort((a, b) => b.wins - a.wins);

  // Find teams that could still pass this team
  const teamsBelow = sortedTeams.filter(
    (t) => t.teamId !== team.teamId && t.wins <= team.wins,
  );

  if (teamsBelow.length === 0) {
    // No teams can catch this team
    return null;
  }

  // Find the team most likely to catch up (highest current wins)
  const closestChaser = teamsBelow[0];
  const chaserMaxWins = closestChaser.wins + remainingWeeks;

  // Calculate how many losses before being caught
  const teamMaxWins = team.wins + remainingWeeks;
  const lossesUntilCaught = teamMaxWins - chaserMaxWins;

  if (lossesUntilCaught <= 0) {
    return null; // Already eliminated or clinched
  }

  return Math.min(remainingWeeks, lossesUntilCaught);
}

/**
 * Deterministic 32-bit hash of the standings so projections are stable across
 * reloads until a result changes. Order-independent (sorted by teamId).
 */
function hashStandings(
  teamStats: TeamStats[],
  playoffTeams: number,
  remainingWeeks: number,
): number {
  const key = [...teamStats]
    .sort((a, b) => a.teamId - b.teamId)
    .map((t) => `${t.teamId}:${t.wins}-${t.losses}-${t.ties}`)
    .join('|');
  let hash = 2166136261;
  for (const char of `${key}#${playoffTeams}#${remainingWeeks}`) {
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  return hash >>> 0;
}

/**
 * Seeded PRNG (mulberry32) returning floats in [0, 1).
 */
function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

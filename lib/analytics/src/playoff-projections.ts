import {
  PlayoffProjection,
  TeamStats,
} from './types';

/**
 * Calculate playoff projections for all teams in a league
 */
export function calculatePlayoffProjections(
  teamStats: TeamStats[],
  options: {
    playoffTeams?: number;
    remainingWeeks?: number;
    simulationCount?: number;
  } = {}
): PlayoffProjection[] {
  const {
    playoffTeams = Math.ceil(teamStats.length / 2),
    remainingWeeks = 5,
    simulationCount = 1000,
  } = options;

  const projections: PlayoffProjection[] = [];

  teamStats.forEach((stats) => {
    // Run Monte Carlo simulations for remaining matchups
    const simResults = runPlayoffSimulations(
      stats,
      teamStats,
      remainingWeeks,
      simulationCount
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
      remainingWeeks
    );

    // Calculate elimination number (losses before being eliminated)
    const eliminationNumber = calculateEliminationNumber(
      stats,
      teamStats,
      playoffTeams,
      remainingWeeks
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

  // Sort by playoff probability (highest first)
  return projections.sort((a, b) => b.playoffProbability - a.playoffProbability);
}

/**
 * Run Monte Carlo simulations for playoff predictions
 */
function runPlayoffSimulations(
  team: TeamStats,
  allTeams: TeamStats[],
  remainingWeeks: number,
  simulationCount: number
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
      const randomFactor = (Math.random() - 0.5) * 0.2; // ±10% variance
      const winProbability = Math.max(
        0.1,
        Math.min(0.9, baseWinProbability + randomFactor)
      );

      if (Math.random() < winProbability) {
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
    const playoffThreshold = calculatePlayoffThreshold(allTeams, remainingWeeks);

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
  remainingWeeks: number
): number {
  // Estimate based on current standings
  // Assume playoff teams need to be in top 50% or better
  const sortedByWinPct = [...teams].sort((a, b) => b.winPercentage - a.winPercentage);
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
  allTeams: TeamStats[]
): number {
  // Simplified: average win percentage of all opponents
  // In a real implementation, would look at actual matchup history
  const totalWinPct = allTeams.reduce((sum, t) => sum + t.winPercentage, 0);
  const averageWinPct = totalWinPct / allTeams.length;

  // Normalize to 0-1 scale where 0.5 is average difficulty
  return averageWinPct;
}

/**
 * Calculate magic number (wins needed to clinch playoff spot)
 */
function calculateMagicNumber(
  team: TeamStats,
  allTeams: TeamStats[],
  playoffTeams: number,
  remainingWeeks: number
): number | null {
  // Sort teams by wins (descending)
  const sortedTeams = [...allTeams].sort((a, b) => b.wins - a.wins);

  // Find the team at the playoff cutoff line
  const cutoffTeam = sortedTeams[playoffTeams - 1];
  if (!cutoffTeam) return null;

  // If team is currently in playoff position
  const currentPosition = sortedTeams.findIndex((t) => t.teamId === team.teamId);
  if (currentPosition < playoffTeams) {
    // Already in playoffs, calculate wins to clinch
    const teamsBelow = sortedTeams.slice(playoffTeams);
    const maxWinsBelow = Math.max(...teamsBelow.map((t) => t.wins + remainingWeeks));
    const winsNeeded = maxWinsBelow - team.wins + 1;
    return Math.max(0, winsNeeded);
  }

  // Not in playoffs, calculate wins needed to pass cutoff
  const winsNeeded = cutoffTeam.wins - team.wins + 1;
  if (winsNeeded > remainingWeeks) {
    return null; // Eliminated
  }

  return Math.max(0, winsNeeded);
}

/**
 * Calculate elimination number (losses before being eliminated from playoffs)
 */
function calculateEliminationNumber(
  team: TeamStats,
  allTeams: TeamStats[],
  _playoffTeams: number,
  remainingWeeks: number
): number | null {
  // Sort teams by wins (descending)
  const sortedTeams = [...allTeams].sort((a, b) => b.wins - a.wins);

  // Find teams that could still pass this team
  const teamsBelow = sortedTeams.filter(
    (t) => t.teamId !== team.teamId && t.wins <= team.wins
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
 * Calculate clinch/elimination scenarios
 */
export function calculateScenarios(
  team: TeamStats,
  allTeams: TeamStats[],
  playoffTeams: number,
  remainingWeeks: number
): {
  hasClinched: boolean;
  isEliminated: boolean;
  scenariosText: string[];
} {
  const magicNumber = calculateMagicNumber(team, allTeams, playoffTeams, remainingWeeks);
  const eliminationNumber = calculateEliminationNumber(
    team,
    allTeams,
    playoffTeams,
    remainingWeeks
  );

  const scenarios: string[] = [];
  let hasClinched = false;
  let isEliminated = false;

  if (magicNumber === 0) {
    hasClinched = true;
    scenarios.push('Team has clinched a playoff spot!');
  } else if (magicNumber === null && eliminationNumber === null) {
    isEliminated = true;
    scenarios.push('Team has been eliminated from playoff contention.');
  } else {
    if (magicNumber !== null && magicNumber > 0) {
      scenarios.push(`${magicNumber} win(s) needed to clinch playoff spot`);
    }
    if (eliminationNumber !== null && eliminationNumber > 0) {
      scenarios.push(
        `Will be eliminated with ${eliminationNumber} more loss(es)`
      );
    }
  }

  return {
    hasClinched,
    isEliminated,
    scenariosText: scenarios,
  };
}

/**
 * Generate detailed playoff race summary
 */
export function generatePlayoffRaceSummary(
  projections: PlayoffProjection[],
  playoffTeams: number
): {
  inPlayoffPosition: PlayoffProjection[];
  onTheBubble: PlayoffProjection[];
  eliminated: PlayoffProjection[];
  summary: string;
} {
  const inPlayoffPosition = projections.slice(0, playoffTeams);
  const onTheBubble = projections
    .slice(playoffTeams, playoffTeams + 3)
    .filter((p) => p.playoffProbability > 0.1);
  const eliminated = projections.filter((p) => p.playoffProbability < 0.01);

  const summary = [
    `Playoff Picture (Top ${playoffTeams} teams make playoffs)`,
    ``,
    `In Position: ${inPlayoffPosition.map((p) => p.teamName).join(', ')}`,
    onTheBubble.length > 0
      ? `On the Bubble: ${onTheBubble.map((p) => p.teamName).join(', ')}`
      : '',
    eliminated.length > 0
      ? `Eliminated: ${eliminated.map((p) => p.teamName).join(', ')}`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    inPlayoffPosition,
    onTheBubble,
    eliminated,
    summary,
  };
}

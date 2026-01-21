/**
 * Season selection logic for matchups
 *
 * Selects eligible seasons based on:
 * - League's min_games_per_season configuration
 * - All rostered players must have sufficient games in the season
 * - Random selection from eligible seasons for variety
 */

import type { PlayerGameCount, SeasonInfo, TeamRoster } from './types';

export interface SeasonEligibilityParams {
  teamRosters: TeamRoster[];
  playerGameCounts: PlayerGameCount[];
  minGamesPerSeason: number;
}

export interface SeasonSelectionParams {
  eligibleSeasons: SeasonInfo[];
  teamIds: number[];
  usedSeasonCounts?: Map<number, number>; // Track season usage for balance
}

/**
 * Determines which seasons are eligible for a set of teams
 * A season is eligible if ALL players on ALL teams have >= minGamesPerSeason
 */
export function determineEligibleSeasons(
  params: SeasonEligibilityParams,
): SeasonInfo[] {
  const { teamRosters, playerGameCounts, minGamesPerSeason } = params;

  // Build a map of player -> season -> games
  const playerSeasonGames = new Map<number, Map<number, number>>();
  for (const pgc of playerGameCounts) {
    if (!playerSeasonGames.has(pgc.playerId)) {
      playerSeasonGames.set(pgc.playerId, new Map());
    }
    const seasonMap = playerSeasonGames.get(pgc.playerId);
    if (seasonMap) {
      seasonMap.set(pgc.season, pgc.gamesPlayed);
    }
  }

  // Get all unique seasons from player game counts
  const allSeasons = new Set<number>();
  for (const pgc of playerGameCounts) {
    allSeasons.add(pgc.season);
  }

  // For each season, check if all players on all teams meet the threshold
  const eligibleSeasons: SeasonInfo[] = [];

  for (const season of allSeasons) {
    let isSeasonEligible = true;
    const eligibleTeamIds: number[] = [];

    // Check each team
    for (const roster of teamRosters) {
      let isTeamEligible = true;

      // Check each player on the team
      for (const playerId of roster.playerIds) {
        const gamesInSeason = playerSeasonGames.get(playerId)?.get(season) ?? 0;

        if (gamesInSeason < minGamesPerSeason) {
          isTeamEligible = false;
          break;
        }
      }

      if (isTeamEligible) {
        eligibleTeamIds.push(roster.teamId);
      } else {
        // If any team isn't eligible, the season isn't eligible for league-wide use
        isSeasonEligible = false;
        break;
      }
    }

    if (isSeasonEligible && eligibleTeamIds.length > 0) {
      // Count total games available (sum for all players in this season)
      const totalGames = playerGameCounts
        .filter((pgc) => pgc.season === season)
        .reduce((sum, pgc) => sum + pgc.gamesPlayed, 0);

      eligibleSeasons.push({
        season,
        eligibleTeamIds,
        totalGames,
      });
    }
  }

  return eligibleSeasons.sort((a, b) => b.season - a.season); // Most recent first
}

/**
 * Select a random season from eligible seasons
 * Considers usage counts to balance season selection over time
 */
export function selectRandomSeason(
  params: SeasonSelectionParams,
): number | null {
  const { eligibleSeasons, teamIds, usedSeasonCounts } = params;

  if (eligibleSeasons.length === 0) {
    return null;
  }

  // Filter to seasons where all involved teams are eligible
  const validSeasons = eligibleSeasons.filter((seasonInfo) =>
    teamIds.every((teamId) => seasonInfo.eligibleTeamIds.includes(teamId)),
  );

  if (validSeasons.length === 0) {
    return null;
  }

  // If we have usage counts, prefer less-used seasons
  if (usedSeasonCounts && usedSeasonCounts.size > 0) {
    // Find minimum usage count
    const minUsage = Math.min(
      ...validSeasons.map((s) => usedSeasonCounts.get(s.season) ?? 0),
    );

    // Filter to seasons with minimum usage
    const leastUsedSeasons = validSeasons.filter(
      (s) => (usedSeasonCounts.get(s.season) ?? 0) === minUsage,
    );

    // Random selection from least-used seasons
    const randomIndex = Math.floor(Math.random() * leastUsedSeasons.length);
    return leastUsedSeasons[randomIndex].season;
  }

  // No usage tracking - pure random selection
  const randomIndex = Math.floor(Math.random() * validSeasons.length);
  return validSeasons[randomIndex].season;
}

/**
 * Validates that a season is eligible for a specific matchup
 */
export function validateSeasonForMatchup(
  season: number,
  teamIds: number[],
  eligibleSeasons: SeasonInfo[],
): boolean {
  const seasonInfo = eligibleSeasons.find((s) => s.season === season);
  if (!seasonInfo) {
    return false;
  }

  return teamIds.every((teamId) => seasonInfo.eligibleTeamIds.includes(teamId));
}

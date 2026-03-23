import type { APIRequestContext } from '@playwright/test';
import { graphqlOk } from './graphql';

export interface MatchupPollResult {
  id: number;
  weekNumber: number;
  status: string;
  statsLoadingStatus: string;
  team1Score: number | null;
  team2Score: number | null;
  selectedGamesCount: number | null;
  gamesPerMatchup: number | null;
}

export interface WaitForStatsLoadedOptions {
  /** Polling interval in milliseconds. Default 3000. */
  pollIntervalMs?: number;
  /** Total timeout in milliseconds. Default 120000. */
  timeoutMs?: number;
}

/**
 * Poll a single matchup until its `statsLoadingStatus` reaches `completed`
 * (or `failed`). Returns the final matchup state.
 */
export async function waitForStatsLoaded(
  api: APIRequestContext,
  matchupId: number,
  options?: WaitForStatsLoadedOptions,
): Promise<MatchupPollResult> {
  const pollInterval = options?.pollIntervalMs ?? 3_000;
  const timeout = options?.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const data = await graphqlOk<{
      getMatchupById: MatchupPollResult | null;
    }>(
      api,
      `query GetMatchupById($id: Int!) {
         getMatchupById(id: $id) {
           id weekNumber status statsLoadingStatus
           team1Score team2Score selectedGamesCount gamesPerMatchup
         }
       }`,
      { id: matchupId },
    );

    const matchup = data.getMatchupById;
    if (!matchup) {
      throw new Error(`Matchup ${matchupId} not found`);
    }

    if (matchup.statsLoadingStatus === 'failed') {
      throw new Error(`Stats loading failed for matchup ${matchupId}`);
    }

    if (matchup.statsLoadingStatus === 'completed') {
      return matchup;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timed out waiting for stats to load on matchup ${matchupId} after ${timeout}ms`,
  );
}

/**
 * Wait for all matchups in a given league + week to finish loading stats.
 * Returns the final state of every matchup for that week.
 */
export async function waitForAllMatchupsStatsLoaded(
  api: APIRequestContext,
  leagueId: number,
  weekNumber: number,
  options?: WaitForStatsLoadedOptions,
): Promise<MatchupPollResult[]> {
  const pollInterval = options?.pollIntervalMs ?? 3_000;
  const timeout = options?.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    const data = await graphqlOk<{
      getMatchupsForLeague: MatchupPollResult[];
    }>(
      api,
      `query GetMatchupsForWeek($leagueId: Int!, $weekNumber: Int) {
         getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) {
           id weekNumber status statsLoadingStatus
           team1Score team2Score selectedGamesCount gamesPerMatchup
         }
       }`,
      { leagueId, weekNumber },
    );

    const matchups = data.getMatchupsForLeague ?? [];
    if (matchups.length === 0) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      continue;
    }

    const failedMatchup = matchups.find(
      (m) => m.statsLoadingStatus === 'failed',
    );
    if (failedMatchup) {
      throw new Error(`Stats loading failed for matchup ${failedMatchup.id}`);
    }

    const allDone = matchups.every((m) => m.statsLoadingStatus === 'completed');

    if (allDone) {
      return matchups;
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }

  throw new Error(
    `Timed out waiting for all matchup stats in league ${leagueId} week ${weekNumber} after ${timeout}ms`,
  );
}

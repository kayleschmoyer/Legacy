import type { APIRequestContext } from '@playwright/test';

import { graphqlOk } from './graphql';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Subset of the StatsLoadingStatus enum relevant for polling. */
type StatsLoadingStatus =
  | 'not_started'
  | 'queued'
  | 'loading'
  | 'completed'
  | 'failed'
  | 'retry';

/** Matchup shape returned by the polling queries. */
export interface MatchupPollResult {
  id: string;
  weekNumber: number;
  status: string;
  statsLoadingStatus: StatsLoadingStatus;
  team1Score: number | null;
  team2Score: number | null;
}

export interface WaitForStatsLoadedOptions {
  /** Milliseconds between polls. @default 3000 */
  pollIntervalMs?: number;
  /** Maximum milliseconds to wait before timing out. @default 120000 */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// GraphQL queries (inline — integration test helpers, not app code)
// ---------------------------------------------------------------------------

const GET_MATCHUP_BY_ID = `
  query GetMatchupById($id: Int!) {
    getMatchupById(id: $id) {
      id
      weekNumber
      status
      statsLoadingStatus
      team1Score
      team2Score
    }
  }
`;

const GET_MATCHUPS_BY_WEEK = `
  query GetMatchupsByWeek($leagueId: Int!, $weekNumber: Int!) {
    getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
      id
      weekNumber
      status
      statsLoadingStatus
      team1Score
      team2Score
    }
  }
`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatElapsed(startMs: number): string {
  const elapsed = Date.now() - startMs;
  return `${(elapsed / 1000).toFixed(1)}s`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Poll a single matchup until its `statsLoadingStatus` reaches `completed`.
 *
 * - Returns the final matchup data on success.
 * - Throws immediately if the status is `failed`.
 * - Keeps polling on `retry`, `queued`, `loading`, and `not_started`.
 * - Throws on timeout with elapsed-time diagnostics.
 */
export async function waitForStatsLoaded(
  api: APIRequestContext,
  matchupId: number,
  options?: WaitForStatsLoadedOptions,
): Promise<MatchupPollResult> {
  const { pollIntervalMs = 3_000, timeoutMs = 120_000 } = options ?? {};
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const data = await graphqlOk<{
      getMatchupById: MatchupPollResult | null;
    }>(api, GET_MATCHUP_BY_ID, { id: matchupId });

    const matchup = data.getMatchupById;

    if (!matchup) {
      throw new Error(
        `getMatchupById returned null for matchup ${matchupId} ` +
          `after ${formatElapsed(start)}. The matchup may not exist.`,
      );
    }

    if (matchup.statsLoadingStatus === 'completed') {
      return matchup;
    }

    if (matchup.statsLoadingStatus === 'failed') {
      throw new Error(
        `Matchup ${matchupId} stats loading failed after ${formatElapsed(start)}. ` +
          `Status: ${matchup.statsLoadingStatus}, matchup status: ${matchup.status}`,
      );
    }

    // For retry / queued / loading / not_started — keep polling
    await delay(pollIntervalMs);
  }

  throw new Error(
    `Timed out waiting for matchup ${matchupId} stats to complete ` +
      `after ${formatElapsed(start)} (timeout: ${timeoutMs}ms)`,
  );
}

/**
 * Poll all matchups in a given league week until every matchup's
 * `statsLoadingStatus` reaches `completed`.
 *
 * - Returns the full list of matchups on success.
 * - Throws immediately if ANY matchup has `failed` status.
 * - Keeps polling while any matchup is still in progress.
 * - Throws on timeout with details about which matchups were incomplete.
 */
export async function waitForAllMatchupsStatsLoaded(
  api: APIRequestContext,
  leagueId: number,
  weekNumber: number,
  options?: WaitForStatsLoadedOptions,
): Promise<MatchupPollResult[]> {
  const { pollIntervalMs = 3_000, timeoutMs = 120_000 } = options ?? {};
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const data = await graphqlOk<{
      getMatchupsByWeek: MatchupPollResult[] | null;
    }>(api, GET_MATCHUPS_BY_WEEK, { leagueId, weekNumber });

    const matchups = data.getMatchupsByWeek;

    if (!matchups || matchups.length === 0) {
      // Keep polling — matchups may not be created yet
      await delay(pollIntervalMs);
      continue;
    }

    // Check for any failures first
    const failed = matchups.filter((m) => m.statsLoadingStatus === 'failed');
    if (failed.length > 0) {
      const ids = failed.map((m) => m.id).join(', ');
      throw new Error(
        `Stats loading failed for matchup(s) [${ids}] in league ${leagueId}, ` +
          `week ${weekNumber} after ${formatElapsed(start)}`,
      );
    }

    // Check if all are completed
    const allCompleted = matchups.every(
      (m) => m.statsLoadingStatus === 'completed',
    );
    if (allCompleted) {
      return matchups;
    }

    await delay(pollIntervalMs);
  }

  // On timeout, provide detail about which matchups are still pending
  const data = await graphqlOk<{
    getMatchupsByWeek: MatchupPollResult[] | null;
  }>(api, GET_MATCHUPS_BY_WEEK, { leagueId, weekNumber }).catch(() => null);

  const pending =
    data?.getMatchupsByWeek
      ?.filter((m) => m.statsLoadingStatus !== 'completed')
      .map((m) => `${m.id} (${m.statsLoadingStatus})`) ?? [];

  throw new Error(
    `Timed out waiting for all matchup stats to complete in league ${leagueId}, ` +
      `week ${weekNumber} after ${formatElapsed(start)} (timeout: ${timeoutMs}ms). ` +
      `Pending matchups: [${pending.join(', ')}]`,
  );
}

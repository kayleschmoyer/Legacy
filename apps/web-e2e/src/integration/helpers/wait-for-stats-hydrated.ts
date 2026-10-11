import type { APIRequestContext } from '@playwright/test';
import { LOGGER } from '@legacy-sports/logging';

import { gqlFetch } from './gql-fetch';
import { graphqlOk } from './graphql';

/**
 * Progress-aware wait for a league week's stats hydration (LS-11046, shared
 * by every integration matchup-stats wait since LS-11063).
 *
 * The matchup-level `statsLoadingStatus` is the terminal signal autoAdvance
 * needs, but it is a poor *liveness* signal: the stats-lambda only writes it
 * after the matchup's **last** SQS batch (lambdas/stats-lambda/src/load-game.ts
 * `isLastBatch`). A 2×15-player league queues ~4 FIFO batches of 8, each with
 * its own 240s invocation budget, so the matchup sits at `loading` for the
 * whole run even while players complete steadily — and a fixed wall-clock
 * ceiling on it can't tell "slow" from "stuck".
 *
 * So liveness comes from the per-player `matchup_player_games` statuses,
 * which flip to `completed` as each player finishes: we fail fast when none
 * completes for STATS_STALL_MS (pipeline genuinely not processing) and
 * otherwise keep waiting up to `timeoutMs` for every matchup status to settle.
 * The durable fix — a test-only seed that bypasses the download entirely — is
 * tracked on LS-4513.
 */

/** Players per stats-lambda SQS message — mirrors BATCH_SIZE in
 *  lambdas/game-selection/src/index.ts (queueMatchupStatsLoad). */
const STATS_BATCH_SIZE = 8;
/** One stats-lambda invocation's processing budget — mirrors
 *  PLAYER_PROCESSING_BUDGET_MS in lambdas/stats-lambda/src/load-game-types.ts. */
const STATS_INVOCATION_BUDGET_MS = 240_000;
/**
 * How long hydration may go without a single player game completing before
 * we call the pipeline stuck rather than slow. The stats-lambda runs with
 * reserved concurrency 1, shared across the game/season/football stats queues
 * (terraform/main/lambda-stats.tf), so another matchup's invocation can hold
 * the only slot for a full processing budget before ours is picked up. One
 * budget plus a minute of slack is therefore the longest a *healthy* pipeline
 * can go without progress on this matchup.
 */
export const STATS_STALL_MS = STATS_INVOCATION_BUDGET_MS + 60_000;

/**
 * Default overall ceiling: ~6 min nominal for 30 uncached players (~12s each
 * on the single-concurrency stats-lambda), plus other shards' invocations
 * holding the only slot. Bounds a healthy-but-contended run; a stuck one
 * fails after STATS_STALL_MS instead.
 */
export const STATS_HYDRATION_TIMEOUT_MS = 600_000;

/**
 * Either a JWT (UI fixture — `gqlFetch`) or an `APIRequestContext` (API
 * fixture — `graphqlOk`). Both throw on GraphQL `errors[]`.
 */
export type StatsGqlClient = string | APIRequestContext;

export interface WeekMatchupStats {
  id: string;
  statsLoadingStatus: string;
}

export interface WaitForWeekStatsHydratedOptions {
  /** Overall ceiling. @default STATS_HYDRATION_TIMEOUT_MS */
  timeoutMs?: number;
  /** Prefix for log lines and error messages, e.g. the calling helper. */
  label?: string;
}

interface HydrationSnapshot {
  matchups: WeekMatchupStats[];
  /** Per-player game status → count, across every matchup in the week. */
  gameStatusCounts: Record<string, number>;
  completedGames: number;
  totalGames: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runQuery<T>(
  client: StatsGqlClient,
  query: string,
  variables: Record<string, unknown>,
): Promise<T> {
  return typeof client === 'string'
    ? gqlFetch<T>(client, query, variables)
    : graphqlOk<T>(client, query, variables);
}

async function readHydrationSnapshot(
  client: StatsGqlClient,
  leagueId: number,
  weekNumber: number,
): Promise<HydrationSnapshot | null> {
  const data = await runQuery<{
    getMatchupsByWeek: WeekMatchupStats[] | null;
  }>(
    client,
    `query StatsLoaded($leagueId: Int!, $weekNumber: Int!) {
       getMatchupsByWeek(leagueId: $leagueId, weekNumber: $weekNumber) {
         id
         statsLoadingStatus
       }
     }`,
    { leagueId, weekNumber },
  ).catch(() => null);
  const matchups = data?.getMatchupsByWeek ?? [];
  if (matchups.length === 0) return null;

  const gameStatusCounts: Record<string, number> = {};
  for (const matchup of matchups) {
    const players = await runQuery<{
      getMatchupPlayers: Array<{
        games: Array<{ statsLoadingStatus: string | null }> | null;
      }> | null;
    }>(
      client,
      `query HydrationProgress($matchupId: Int!) {
         getMatchupPlayers(matchupId: $matchupId) {
           games { statsLoadingStatus }
         }
       }`,
      { matchupId: Number(matchup.id) },
    ).catch(() => null);
    // All-or-nothing: a partial snapshot would read as a progress change.
    if (!players) return null;
    for (const player of players.getMatchupPlayers ?? []) {
      for (const game of player.games ?? []) {
        const status = game.statsLoadingStatus ?? 'null';
        gameStatusCounts[status] = (gameStatusCounts[status] ?? 0) + 1;
      }
    }
  }
  const totalGames = Object.values(gameStatusCounts).reduce(
    (sum, n) => sum + n,
    0,
  );
  return {
    matchups,
    gameStatusCounts,
    completedGames: gameStatusCounts['completed'] ?? 0,
    totalGames,
  };
}

function describeSnapshot(snapshot: HydrationSnapshot | null): string {
  if (!snapshot) return 'no matchups observed';
  const games = Object.entries(snapshot.gameStatusCounts)
    .map(([status, n]) => `${status}=${n}`)
    .join(', ');
  const matchups = snapshot.matchups
    .map((m) => `${m.id} (${m.statsLoadingStatus})`)
    .join(', ');
  return (
    `matchups [${matchups}], ` +
    `player games ${snapshot.completedGames}/${snapshot.totalGames} hydrated ` +
    `(${games || 'none'}), ` +
    `~${Math.ceil(snapshot.totalGames / STATS_BATCH_SIZE)} stats batches`
  );
}

/**
 * Wait until every matchup in the league week reports
 * `statsLoadingStatus: completed`, judging liveness from per-player progress.
 *
 * - Returns the week's matchups on success.
 * - Throws immediately if any matchup is `failed`.
 * - Throws after STATS_STALL_MS without a player game completing or a matchup
 *   status transition (stuck pipeline).
 * - Throws after `timeoutMs` even with steady progress.
 */
export async function waitForWeekStatsHydrated(
  client: StatsGqlClient,
  leagueId: number,
  weekNumber: number,
  options?: WaitForWeekStatsHydratedOptions,
): Promise<WeekMatchupStats[]> {
  const {
    timeoutMs = STATS_HYDRATION_TIMEOUT_MS,
    label = 'waitForWeekStatsHydrated',
  } = options ?? {};
  const start = Date.now();
  let lastProgressAt = start;
  let lastProgressKey = '';
  let snapshot: HydrationSnapshot | null = null;
  while (Date.now() - start < timeoutMs) {
    snapshot =
      (await readHydrationSnapshot(client, leagueId, weekNumber)) ?? snapshot;
    if (snapshot) {
      const statuses = snapshot.matchups.map((m) => m.statsLoadingStatus);
      if (statuses.includes('failed')) {
        throw new Error(
          `[${label}] stats loading failed for league ${leagueId} ` +
            `week ${weekNumber} (${describeSnapshot(snapshot)})`,
        );
      }
      if (statuses.every((s) => s === 'completed')) {
        LOGGER.info(
          `[${label}] league ${leagueId} week ${weekNumber} stats hydrated ` +
            `in ${Math.round((Date.now() - start) / 1000)}s (${describeSnapshot(snapshot)})`,
        );
        return snapshot.matchups;
      }
      // Any completed player game, or a matchup status transition (queued →
      // loading → retry), counts as forward progress.
      const progressKey = `${snapshot.completedGames}|${statuses.join(',')}`;
      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey;
        lastProgressAt = Date.now();
      }
    }
    if (Date.now() - lastProgressAt > STATS_STALL_MS) {
      throw new Error(
        `[${label}] stats hydration stalled for league ${leagueId} ` +
          `week ${weekNumber}: no progress for ${STATS_STALL_MS}ms ` +
          `(${describeSnapshot(snapshot)}) — the single-concurrency stats-lambda is ` +
          `either stalled or draining a backlog queued ahead of this week (e.g. the ` +
          `05:00 UTC nightly auto-select-games cron, which takes ~1h to drain on dev)`,
      );
    }
    await delay(5_000);
  }
  throw new Error(
    `[${label}] stats still hydrating for league ${leagueId} ` +
      `week ${weekNumber} after ${timeoutMs}ms despite steady progress ` +
      `(${describeSnapshot(snapshot)})`,
  );
}

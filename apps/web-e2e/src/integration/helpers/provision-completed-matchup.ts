import { LOGGER } from '@legacy-sports/logging';
import { gqlFetch } from './gql-fetch';

/**
 * API-driven provisioning of a single completed matchup with a narrative recap
 * (LS-7704).
 *
 * The matchup-roster-recap spec used to *discover* a completed-with-recap
 * matchup among the test commissioner's pre-existing leagues. That made the
 * spec depend on seed data that the global sweep wipes for the base
 * commissioner, so it found zero leagues and failed in `beforeAll`. Instead we
 * provision our own data: create a 2-team league, run a one-week season to
 * completion, and return the resulting completed matchup. Matchup recaps are
 * generated synchronously and deterministically when a matchup is `completed`
 * (lambdas/db/.../matchups/types.ts → @legacy-sports/narrative — no LLM, no
 * queue), so a completed matchup always has a recap.
 *
 * All calls are JWT-based `gqlFetch` so the helper works from the UI fixture
 * (which exposes `commissionerJwt` / `managerJwt*` rather than an
 * `APIRequestContext`).
 */

/** Roster size — large enough that drafted players spill onto the bench
 *  (positionId === null), which the roster-comparison phases require. */
const MAX_ROSTER_SIZE = 15;
/** Two teams → exactly one head-to-head matchup per week. */
const NUMBER_OF_TEAMS = 2;

export interface ProvisionedMatchup {
  leagueId: number;
  matchupId: number;
  /** True when the matchup has at least one bench player (positionId === null). */
  hasBenchPlayers: boolean;
}

export interface ProvisionArgs {
  /** Commissioner JWT — owns the league and makes all draft picks. */
  commissionerJwt: string;
  /** Manager JWT — joins to fill the second team. */
  managerJwt: string;
  /** League name; should contain the `E2E <timestamp>` marker for sweep eligibility. */
  leagueName: string;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDraftStatus(
  jwt: string,
  leagueId: number,
  target: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const data = await gqlFetch<{ league: { draftStatus: string } | null }>(
      jwt,
      `query DraftStatus($id: Int!) { league(id: $id) { draftStatus } }`,
      { id: leagueId },
    ).catch(() => null);
    if (data?.league?.draftStatus === target) return;
    await delay(2_000);
  }
  throw new Error(
    `[provisionCompletedMatchup] draftStatus did not reach '${target}' for league ${leagueId} within ${timeoutMs}ms`,
  );
}

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
const STATS_STALL_MS = STATS_INVOCATION_BUDGET_MS + 60_000;

interface HydrationSnapshot {
  matchupStatuses: string[];
  /** Per-player game status → count, across every matchup in the week. */
  gameStatusCounts: Record<string, number>;
  completedGames: number;
  totalGames: number;
}

async function readHydrationSnapshot(
  jwt: string,
  leagueId: number,
  weekNumber: number,
): Promise<HydrationSnapshot | null> {
  const data = await gqlFetch<{
    getMatchupsByWeek: Array<{ id: string; statsLoadingStatus: string }> | null;
  }>(
    jwt,
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
    const players = await gqlFetch<{
      getMatchupPlayers: Array<{
        games: Array<{ statsLoadingStatus: string | null }> | null;
      }> | null;
    }>(
      jwt,
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
    matchupStatuses: matchups.map((m) => m.statsLoadingStatus),
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
  return (
    `matchup statuses [${snapshot.matchupStatuses.join(', ')}], ` +
    `player games ${snapshot.completedGames}/${snapshot.totalGames} hydrated ` +
    `(${games || 'none'}), ` +
    `~${Math.ceil(snapshot.totalGames / STATS_BATCH_SIZE)} stats batches`
  );
}

/**
 * Wait for the week's stats hydration to finish (LS-11046).
 *
 * The matchup-level `statsLoadingStatus` is the terminal signal autoAdvance
 * needs, but it is a poor *liveness* signal: the stats-lambda only writes it
 * after the matchup's **last** SQS batch (lambdas/stats-lambda/src/load-game.ts
 * `isLastBatch`). A 2×15-player league queues ~4 FIFO batches of 8, each with
 * its own 240s invocation budget, so the matchup sits at `loading` for the
 * whole run even while players complete steadily — and a fixed wall-clock
 * ceiling on it can't tell "slow" from "stuck". (The previous 240s ceiling
 * was one *batch's* budget, below the nominal ~12s × 30 players of work.)
 *
 * So liveness comes from the per-player `matchup_player_games` statuses,
 * which flip to `completed` as each player finishes: we fail fast when none
 * completes for STATS_STALL_MS (pipeline genuinely not processing) and
 * otherwise keep waiting up to `timeoutMs` for the matchup status to settle.
 */
async function waitForMatchupStatsHydrated(
  jwt: string,
  leagueId: number,
  weekNumber: number,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  let lastProgressAt = start;
  let lastProgressKey = '';
  let snapshot: HydrationSnapshot | null = null;
  while (Date.now() - start < timeoutMs) {
    snapshot =
      (await readHydrationSnapshot(jwt, leagueId, weekNumber)) ?? snapshot;
    if (snapshot) {
      if (snapshot.matchupStatuses.includes('failed')) {
        throw new Error(
          `[provisionCompletedMatchup] stats loading failed for league ${leagueId} ` +
            `week ${weekNumber} (${describeSnapshot(snapshot)})`,
        );
      }
      if (snapshot.matchupStatuses.every((s) => s === 'completed')) {
        LOGGER.info(
          `[provisionCompletedMatchup] league ${leagueId} week ${weekNumber} stats hydrated ` +
            `in ${Math.round((Date.now() - start) / 1000)}s (${describeSnapshot(snapshot)})`,
        );
        return;
      }
      // Any completed player game, or a matchup status transition (queued →
      // loading → retry), counts as forward progress.
      const progressKey = `${snapshot.completedGames}|${snapshot.matchupStatuses.join(',')}`;
      if (progressKey !== lastProgressKey) {
        lastProgressKey = progressKey;
        lastProgressAt = Date.now();
      }
    }
    if (Date.now() - lastProgressAt > STATS_STALL_MS) {
      throw new Error(
        `[provisionCompletedMatchup] stats hydration stalled for league ${leagueId} ` +
          `week ${weekNumber}: no progress for ${STATS_STALL_MS}ms ` +
          `(${describeSnapshot(snapshot)}) — the stats pipeline is not processing this matchup`,
      );
    }
    await delay(5_000);
  }
  throw new Error(
    `[provisionCompletedMatchup] stats still hydrating for league ${leagueId} ` +
      `week ${weekNumber} after ${timeoutMs}ms despite steady progress ` +
      `(${describeSnapshot(snapshot)})`,
  );
}

export async function provisionCompletedMatchup(
  args: ProvisionArgs,
): Promise<ProvisionedMatchup> {
  const { commissionerJwt, managerJwt, leagueName } = args;

  // No free-tier slot clearing (LS-8057): both identities are premium now, so
  // neither league creation nor joining trips the 3-league cap. Clearing slots
  // against these shared premium identities would be unsafe — the helper has no
  // age guard and would delete leagues that concurrent shards are mid-test on.

  // 1. Create the league + teams.
  const created = await gqlFetch<{
    createLeagueAndTeams: {
      league: { id: number; inviteCode: string };
    };
  }>(
    commissionerJwt,
    `mutation CreateLeague($input: CreateLeagueAndTeamsInput!) {
       createLeagueAndTeams(input: $input) {
         league { id inviteCode }
       }
     }`,
    {
      input: {
        leagueName,
        numberOfTeams: NUMBER_OF_TEAMS,
        numberOfDivisions: 1,
        maxRosterSize: MAX_ROSTER_SIZE,
        playerPool: 'all',
      },
    },
  );
  const leagueId = Number(created.createLeagueAndTeams.league.id);
  const inviteCode = created.createLeagueAndTeams.league.inviteCode;

  // 2. Shorten the season to a single one-game week with no playoffs so it can
  //    be driven to completion in one autoSelect + autoAdvance cycle.
  await gqlFetch(
    commissionerJwt,
    `mutation SetSettings($input: UpdateLeagueSettingsInput!) {
       updateLeagueSettings(input: $input) { id }
     }`,
    {
      input: {
        leagueId,
        totalMatchups: 1,
        gamesPerMatchup: 1,
        playoffEnabled: false,
      },
    },
  );

  // 3. Manager joins to fill the second team.
  await gqlFetch(
    managerJwt,
    `mutation JoinLeague($inviteCode: String!, $teamName: String!) {
       joinLeague(inviteCode: $inviteCode, teamName: $teamName) { teamId }
     }`,
    { inviteCode, teamName: 'Recap Opponent' },
  );

  // 4. Run the draft to completion (fills every roster → bench players exist).
  const draft = await gqlFetch<{ initializeDraft: { id: number } }>(
    commissionerJwt,
    `mutation InitDraft($leagueId: Int!, $draftMode: String, $selectionMethod: String, $draftOrder: String) {
       initializeDraft(leagueId: $leagueId, draftMode: $draftMode, selectionMethod: $selectionMethod, draftOrder: $draftOrder) { id }
     }`,
    {
      leagueId,
      draftMode: 'live',
      selectionMethod: 'standard',
      draftOrder: 'snake',
    },
  );
  const draftId = Number(draft.initializeDraft.id);

  await gqlFetch(
    commissionerJwt,
    `mutation RandomizeOrder($draftId: Int!) { randomizeDraftOrder(draftId: $draftId) { id } }`,
    { draftId },
  );

  const orderData = await gqlFetch<{
    getDraftTeamOrder: Array<{ teamId: number }>;
  }>(
    commissionerJwt,
    `query DraftOrder($draftId: Int!) { getDraftTeamOrder(draftId: $draftId) { teamId } }`,
    { draftId },
  );
  const numTeams = orderData.getDraftTeamOrder.length;

  await gqlFetch(
    commissionerJwt,
    `mutation StartDraft($leagueId: Int!) { startDraft(leagueId: $leagueId) { id draftStatus } }`,
    { leagueId },
  );
  await pollDraftStatus(commissionerJwt, leagueId, 'in-progress', 60_000);

  const avail = await gqlFetch<{
    getAvailableDraftPlayers: Array<{ id: number }>;
  }>(
    commissionerJwt,
    `query AvailablePlayers($draftId: Int!) { getAvailableDraftPlayers(draftId: $draftId) { id } }`,
    { draftId },
  );
  const pool = avail.getAvailableDraftPlayers;
  const totalPicks = numTeams * MAX_ROSTER_SIZE;
  for (let i = 0; i < totalPicks && i < pool.length; i++) {
    await gqlFetch(
      commissionerJwt,
      `mutation Pick($draftId: Int!, $playerId: Int!) {
         commissionerPick(draftId: $draftId, playerId: $playerId) { playerId }
       }`,
      { draftId, playerId: pool[i].id },
    );
  }
  await pollDraftStatus(commissionerJwt, leagueId, 'completed', 120_000);

  // 5. Create matchups, play the single game, advance the (final) week so the
  //    matchup transitions to 'completed' and a recap becomes available.
  await gqlFetch(
    commissionerJwt,
    `mutation CreateMatchups($leagueId: Int!) {
       createAllMatchups(leagueId: $leagueId) { matchups { id } }
     }`,
    { leagueId },
  );

  await gqlFetch(
    commissionerJwt,
    `mutation AutoSelect($leagueId: Int) { autoSelectGames(leagueId: $leagueId) { gamesTriggered } }`,
    { leagueId },
  );
  // Wait for the async stats-hydration pipeline that autoSelectGames enqueues
  // (game-selection → ~4 FIFO batches of 8 players → single-concurrency
  // stats-lambda downloads each uncached game log from Baseball Reference at
  // ~12s/player). Liveness is judged per player, so a stuck pipeline fails in
  // STATS_STALL_MS; the overall ceiling only bounds a healthy-but-contended run
  // (~6 min nominal for 30 uncached players, plus other shards' invocations
  // holding the single slot). The durable fix — a test-only seed that bypasses
  // the download entirely — is tracked on LS-4513.
  await waitForMatchupStatsHydrated(commissionerJwt, leagueId, 1, 600_000);

  await gqlFetch(
    commissionerJwt,
    `mutation AutoAdvance($leagueId: Int) { autoAdvanceMatchups(leagueId: $leagueId) { leaguesAdvanced } }`,
    { leagueId },
  );

  // 6. Locate the completed matchup and confirm it carries bench players.
  const matchupsData = await gqlFetch<{
    getMatchupsForLeague: Array<{ id: string; status: string }>;
  }>(
    commissionerJwt,
    `query Matchups($leagueId: Int!, $weekNumber: Int) {
       getMatchupsForLeague(leagueId: $leagueId, weekNumber: $weekNumber) { id status }
     }`,
    { leagueId, weekNumber: 1 },
  );
  const completed = matchupsData.getMatchupsForLeague.find(
    (m) => m.status === 'completed',
  );
  if (!completed) {
    throw new Error(
      `[provisionCompletedMatchup] no completed matchup found for league ${leagueId} after advancing week 1`,
    );
  }
  const matchupId = Number(completed.id);

  const players = await gqlFetch<{
    getMatchupPlayers: Array<{ positionId: number | null }>;
  }>(
    commissionerJwt,
    `query MatchupPlayers($matchupId: Int!) {
       getMatchupPlayers(matchupId: $matchupId) { positionId }
     }`,
    { matchupId },
  );
  const hasBenchPlayers = (players.getMatchupPlayers ?? []).some(
    (p) => p.positionId === null,
  );

  LOGGER.info(
    `[provisionCompletedMatchup] league ${leagueId} matchup ${matchupId} completed (hasBenchPlayers=${hasBenchPlayers})`,
  );

  return { leagueId, matchupId, hasBenchPlayers };
}

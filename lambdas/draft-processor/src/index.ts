import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  ALLOWED_POSITIONS,
  BATTING_POSITIONS,
  MIN_SEASON_WITH_GAME_DATA,
  NEGRO_LEAGUE_IDS,
  PITCHING_POSITIONS,
  SEASON_MATCHUP_MULTIPLIER,
  shuffleArray,
} from '@legacy-sports/utils';
import {
  formatVersionInfo,
  getDbOptions,
  getVersionInfo,
} from '@legacy-sports/utils/node';
import {
  createNotificationPublisher,
  createNotificationService,
  DraftProcessingResult,
  SqsDraftMessage,
} from '@legacy-sports/aws-utils';
import {
  addBreadcrumb,
  getRollbarConfigFromEnv,
  initRollbar,
  withRollbar,
} from '@legacy-sports/rollbar';
import {
  createAllMatchupsForLeague,
  filterPlayerIdsByLeagueEligibility,
  finalizeDraftCompletion,
  inArrayAny,
  PublicDb,
  PublicSchema,
  runWithPublicClient,
  updateLeagueDraftStatus,
  validateDraftMode,
  validateSelectionMethod,
  validateUserAccess,
} from '@legacy-sports/db-client';
import {
  and,
  eq,
  gte,
  inArray,
  isNull,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

// Initialize Rollbar
const rollbarConfig = getRollbarConfigFromEnv();
if (rollbarConfig) {
  initRollbar(rollbarConfig);
}

// Log version information on cold start
const versionInfo = getVersionInfo('legacy-sports-draft-processor');
LOGGER.info('Draft Processor Lambda initialized', {
  versionFormatted: formatVersionInfo(versionInfo),
  ...versionInfo,
});

// Initialize notification services
const notificationService = createNotificationService();
const pushPublisher = createNotificationPublisher();

const SqsDraftMessageSchema = z.object({
  messageType: z.literal('START_DRAFT'),
  payload: z.object({
    leagueId: z.number().int().positive(),
    draftMode: z.enum(['live', 'automated']),
    selectionMethod: z.enum(['standard', 'auction', 'random']),
    draftOrder: z.enum(['snake', 'linear']),
    requestedBy: z.number().int().positive(),
    timestamp: z.string(),
  }),
});

/**
 * Draft Processing Lambda
 * Processes draft messages from SQS queue and executes the draft logic
 */

/**
 * Enhanced player data with positions and stats for draft optimization
 */
interface PlayerWithPositions {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
  statsLastFetchedAt: Date | null; // Used to prioritize players with stats in draft
  eligiblePositions: string[];
  isPitcher: boolean;
  positionDetails?: Record<
    string,
    { games: number; gamesStarted: number; position: string }
  >;
  positionScore?: number; // Dynamic scoring for position assignments
}

/**
 * Build an interleaved list of remaining players (alternating batters and pitchers)
 * and assign them to bench slots using snake-order team traversal so each team
 * gets a balanced mix of batters and pitchers on its bench.
 *
 * Exported for testability.
 */
export function buildBenchAssignments(
  remainingPlayers: { id: number; isPitcher: boolean }[],
  teams: { id: number }[],
  benchSlots: number,
  leagueId: number,
): { teamId: number; leagueId: number; playerId: number; positionId: null }[] {
  // Split by pitcher/batter and interleave to produce balanced benches
  const batters = remainingPlayers.filter((p) => !p.isPitcher);
  const pitchers = remainingPlayers.filter((p) => p.isPitcher);
  const interleaved: { id: number; isPitcher: boolean }[] = [];
  const maxLen = Math.max(batters.length, pitchers.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < batters.length) interleaved.push(batters[i]);
    if (i < pitchers.length) interleaved.push(pitchers[i]);
  }

  // Snake-order: reverse team traversal on odd bench rounds so each team
  // alternates between batter/pitcher picks across its bench slots.
  const assignments: {
    teamId: number;
    leagueId: number;
    playerId: number;
    positionId: null;
  }[] = [];
  let playerIndex = 0;
  for (let benchSlot = 0; benchSlot < benchSlots; benchSlot++) {
    const teamsInOrder = benchSlot % 2 === 0 ? teams : [...teams].reverse();
    for (const team of teamsInOrder) {
      if (playerIndex < interleaved.length) {
        assignments.push({
          teamId: team.id,
          leagueId,
          playerId: interleaved[playerIndex].id,
          positionId: null,
        });
        playerIndex++;
      }
    }
  }
  return assignments;
}

/**
 * Load player position eligibility from the player_eligible_positions materialized view.
 *
 * This is the single source of truth for position eligibility — the same view consumed
 * by the GraphQL API and the UI. Using it here ensures the draft-processor and the
 * roster management UI always agree on which positions a player qualifies for.
 */
async function loadAllPlayersWithPositions(
  db: PublicDb,
  playerIds: number[],
): Promise<Map<number, PlayerWithPositions>> {
  const startTime = Date.now();
  addBreadcrumb(
    'Loading player positions from player_eligible_positions view',
    {
      playerCount: playerIds.length,
    },
  );

  const rows = await db
    .select({
      playerId: PublicSchema.playerEligiblePositions.playerId,
      position: PublicSchema.playerEligiblePositions.position,
    })
    .from(PublicSchema.playerEligiblePositions)
    .where(inArray(PublicSchema.playerEligiblePositions.playerId, playerIds));

  // Group positions by player
  const positionsByPlayer = new Map<number, string[]>();
  for (const row of rows) {
    const positions = positionsByPlayer.get(row.playerId) ?? [];
    positions.push(row.position);
    positionsByPlayer.set(row.playerId, positions);
  }

  const playerMap = new Map<number, PlayerWithPositions>();
  let playersWithPositionData = 0;
  let playersWithFallbackData = 0;

  for (const playerId of playerIds) {
    const eligiblePositions = positionsByPlayer.get(playerId) ?? [];

    if (eligiblePositions.length > 0) {
      playersWithPositionData++;
    } else {
      // Player has no rows in the mat view — no tracked position history.
      // Fall back to DH (most flexible slot) so they still land on a roster.
      playersWithFallbackData++;
      eligiblePositions.push('DH');
    }

    const isPitcher = eligiblePositions.some((pos) =>
      PITCHING_POSITIONS.has(pos),
    );

    playerMap.set(playerId, {
      id: playerId,
      firstName: '',
      lastName: '',
      brefId: '',
      statsLastFetchedAt: null,
      eligiblePositions,
      isPitcher,
    });
  }

  const processingTime = Date.now() - startTime;

  addBreadcrumb('Position loading completed', {
    totalPlayers: playerMap.size,
    playersWithPositionData,
    playersWithFallbackData,
    totalProcessingTimeMs: processingTime,
  });

  return playerMap;
}

/**
 * Optimized player assignment data structures
 */
interface TeamAssignment {
  teamId: number;
  leagueId: number;
  playerId: number;
  positionId: number | null; // null for bench players
}

/**
 * Position-grouped players for efficient assignment
 */
interface PositionPlayerGroup {
  [positionType: string]: PlayerWithPositions[];
}

/**
 * ENHANCED: Check if a player can play a specific position with detailed game experience
 * Uses the same ALLOWED_POSITIONS logic as GraphQL API but adds smart weighting
 * based on actual games played at each position for better draft decisions
 *
 * CRITICAL: Prevents pitchers from being assigned to batting slots and vice versa
 */
function canPlayerPlayPosition(
  playerEligiblePositions: string[],
  requiredPosition: string,
): boolean {
  // Use same core logic as GraphQL API: lib/shared-components/src/utils/PositionModels.ts
  const allowedPositions = ALLOWED_POSITIONS[requiredPosition];

  if (!allowedPositions) {
    return false;
  }

  // Determine if this is a pitching or batting slot
  const isPitchingSlot = PITCHING_POSITIONS.has(requiredPosition);
  const isBattingSlot =
    BATTING_POSITIONS.has(requiredPosition) ||
    requiredPosition === 'IF' ||
    requiredPosition === 'OF' ||
    requiredPosition === 'XDH';

  // Check if player is a pitcher (has any pitching positions)
  const isPitcher = playerEligiblePositions.some((pos) =>
    PITCHING_POSITIONS.has(pos),
  );

  // Check if player is a batter (has any batting positions)
  const isBatter = playerEligiblePositions.some((pos) =>
    BATTING_POSITIONS.has(pos),
  );

  // CRITICAL VALIDATION: Prevent position type mismatches
  // - Pitchers can only play pitching slots (SP, RP)
  // - Batters can only play batting slots (C, 1B, 2B, 3B, SS, OF, IF, DH, etc.)
  // - Exception: Two-way players (rare) have both pitching AND batting positions
  if (isPitchingSlot && !isPitcher) {
    // Trying to assign a non-pitcher to a pitching slot
    return false;
  }

  if (isBattingSlot && isPitcher && !isBatter) {
    // Trying to assign a pure pitcher to a batting slot
    return false;
  }

  // Check if player has any of the allowed positions for this slot
  for (const pos of allowedPositions) {
    if (playerEligiblePositions.includes(pos)) {
      return true;
    }
  }

  return false;
}

/**
 * NEW: Enhanced position scoring for smarter draft assignments
 * Uses detailed games played data to rank how well-suited a player is for a position
 */
function getPositionScore(
  playerEligiblePositions: string[],
  requiredPosition: string,
  positionDetails?: Record<
    string,
    { games: number; gamesStarted: number; position: string }
  >,
): number {
  if (!canPlayerPlayPosition(playerEligiblePositions, requiredPosition)) {
    return 0;
  }

  const allowedPositions = ALLOWED_POSITIONS[requiredPosition];
  if (!allowedPositions || !positionDetails) {
    return 1; // Basic eligibility score
  }

  let maxScore = 0;

  // Calculate score based on actual games played at relevant positions
  for (const pos of allowedPositions) {
    const posData = positionDetails[pos];
    if (posData && playerEligiblePositions.includes(pos)) {
      // Score based on games played with bonus for games started (primary position indicator)
      let score = Math.min(posData.games / 100, 1); // Normalize to 0-1 scale
      if (posData.gamesStarted > 0) {
        score += Math.min(posData.gamesStarted / posData.games, 0.5); // Bonus for starting games
      }

      // Exact position match gets highest priority
      if (pos === requiredPosition) {
        score *= 1.5;
      }

      maxScore = Math.max(maxScore, score);
    }
  }

  return maxScore || 1; // Fallback to basic eligibility
}

// ── Shared player-pool builder ────────────────────────────────────────────────

/** Result returned by buildPlayerPool */
interface PlayerPoolResult {
  enhancedPlayers: PlayerWithPositions[];
  playersByPosition: PositionPlayerGroup;
}

/**
 * Load, filter, and group the eligible player pool for any automated draft mode.
 *
 * Extracted so randomlyAssignPlayers and runAuctionDraft share the same player
 * loading pipeline without duplication.
 *
 * @param db      A Drizzle database instance or transaction (both satisfy PublicDb).
 * @param leagueId  League to draft for.
 * @param numTeams  Number of teams participating.
 * @param leaguePositions  Explicit roster positions for the league.
 * @param config   League settings that control player eligibility.
 */
async function buildPlayerPool(
  db: PublicDb,
  leagueId: number,
  numTeams: number,
  leaguePositions: Array<{ id: number; positionType: string }>,
  config: {
    gamesPerMatchup: number | null;
    playerPool: string;
    minCareerGames: number;
    minCareerSeasons: number;
    baseballHofOnly: boolean;
    eraFilter: string;
    customEraStartYear: number | null;
    customEraEndYear: number | null;
    maxRosterSize: number;
  },
): Promise<PlayerPoolResult> {
  const gamesPerMatchup = config.gamesPerMatchup ?? 5;
  const minGames = gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER;
  const {
    playerPool,
    minCareerGames,
    minCareerSeasons,
    baseballHofOnly,
    eraFilter,
    customEraStartYear,
    customEraEndYear,
    maxRosterSize,
  } = config;

  // ── 1. Fetch candidate players ordered by stats availability ─────────────
  // ORDER BY stats_last_fetched_at DESC NULLS LAST, id ASC is equivalent to
  // the old CASE WHEN expression but can be served by the
  // idx_players_stats_fetched_sort index, avoiding a full-table sort.
  const estimatedPlayersNeeded = numTeams * maxRosterSize * 2;
  const negroLeagueList = [...NEGRO_LEAGUE_IDS];
  const candidatePlayers = await db
    .select({
      id: PublicSchema.players.id,
      firstName: PublicSchema.players.firstName,
      lastName: PublicSchema.players.lastName,
      brefId: PublicSchema.players.brefId,
      statsLastFetchedAt: PublicSchema.players.statsLastFetchedAt,
    })
    .from(PublicSchema.players)
    .orderBy(
      sql`${PublicSchema.players.statsLastFetchedAt} DESC NULLS LAST`,
      PublicSchema.players.id,
    )
    .limit(Math.max(estimatedPlayersNeeded, 2000));

  LOGGER.info(
    `[buildPlayerPool] ${candidatePlayers.length} candidates fetched for league ${leagueId}`,
  );

  // ── 2. Filter to players with at least one valid season ───────────────────
  const candidatePlayerIds = candidatePlayers.map((p) => p.id);

  // Negro-league filter pushed to SQL: rows with NULL lg_id are non-NL and
  // must be kept, so we use (lg_id IS NULL OR lg_id NOT IN (...)).
  const notNegroLeague = (
    lgIdCol:
      | typeof PublicSchema.seasonBatting.lgId
      | typeof PublicSchema.seasonPitching.lgId
      | typeof PublicSchema.seasonFielding.lgId,
  ) => or(isNull(lgIdCol), notInArray(lgIdCol, negroLeagueList));

  const [battingStats, pitchingStats, fieldingStats] = await Promise.all([
    db
      .select({
        playerId: PublicSchema.seasonBatting.playerId,
        g: PublicSchema.seasonBatting.g,
      })
      .from(PublicSchema.seasonBatting)
      .where(
        and(
          inArrayAny(PublicSchema.seasonBatting.playerId, candidatePlayerIds),
          gte(PublicSchema.seasonBatting.season, MIN_SEASON_WITH_GAME_DATA),
          gte(PublicSchema.seasonBatting.g, minGames),
          notNegroLeague(PublicSchema.seasonBatting.lgId),
        ),
      ),
    db
      .select({
        playerId: PublicSchema.seasonPitching.playerId,
        g: PublicSchema.seasonPitching.g,
      })
      .from(PublicSchema.seasonPitching)
      .where(
        and(
          inArrayAny(PublicSchema.seasonPitching.playerId, candidatePlayerIds),
          gte(PublicSchema.seasonPitching.season, MIN_SEASON_WITH_GAME_DATA),
          gte(PublicSchema.seasonPitching.g, minGames),
          notNegroLeague(PublicSchema.seasonPitching.lgId),
        ),
      ),
    db
      .select({
        playerId: PublicSchema.seasonFielding.playerId,
        season: PublicSchema.seasonFielding.season,
        g: PublicSchema.seasonFielding.g,
      })
      .from(PublicSchema.seasonFielding)
      .where(
        and(
          inArrayAny(PublicSchema.seasonFielding.playerId, candidatePlayerIds),
          gte(PublicSchema.seasonFielding.season, MIN_SEASON_WITH_GAME_DATA),
          notNegroLeague(PublicSchema.seasonFielding.lgId),
        ),
      ),
  ]);

  const fieldingByPlayerSeason = new Map<string, number>();
  for (const stat of fieldingStats) {
    const key = `${stat.playerId}-${stat.season}`;
    fieldingByPlayerSeason.set(
      key,
      (fieldingByPlayerSeason.get(key) ?? 0) + (stat.g ?? 0),
    );
  }

  // Batting and pitching rows already satisfy g >= minGames (filtered in SQL).
  const playersWithValidSeasons = new Set<number>();
  for (const stat of battingStats) {
    playersWithValidSeasons.add(stat.playerId);
  }
  for (const stat of pitchingStats) {
    playersWithValidSeasons.add(stat.playerId);
  }
  // Fielding requires per-season aggregation (multiple positions per season).
  for (const [key, totalGames] of fieldingByPlayerSeason.entries()) {
    if (totalGames >= minGames) {
      playersWithValidSeasons.add(parseInt(key.split('-')[0]));
    }
  }

  let players = candidatePlayers.filter((p) =>
    playersWithValidSeasons.has(p.id),
  );

  LOGGER.info(
    `[buildPlayerPool] ${players.length} players with valid seasons (≥${minGames} games)`,
  );

  // ── 3. Apply league eligibility settings ─────────────────────────────────
  const eligibilityResult = await filterPlayerIdsByLeagueEligibility(
    db,
    players.map((p) => p.id),
    {
      playerPool,
      minCareerGames,
      minCareerSeasons,
      baseballHofOnly,
      baseballEraFilter: eraFilter,
      customEraStartYear,
      customEraEndYear,
    },
  );
  players = players.filter((p) => eligibilityResult.eligibleIds.has(p.id));

  LOGGER.info(
    `[buildPlayerPool] ${players.length} eligible after filters ` +
      `(pool: -${eligibilityResult.excludedByPool}, ` +
      `career games: -${eligibilityResult.excludedByCareerGames}, ` +
      `career seasons: -${eligibilityResult.excludedByCareerSeasons}, ` +
      `hof: -${eligibilityResult.excludedByHofOnly}, ` +
      `era: -${eligibilityResult.excludedByEraFilter})`,
  );

  if (players.length === 0) {
    throw new Error('No players available for draft');
  }

  // ── 4. Load position eligibility data ────────────────────────────────────
  const playerIds = players.map((p) => p.id);
  const playersWithPositions = await loadAllPlayersWithPositions(db, playerIds);

  const enhancedPlayers: PlayerWithPositions[] = players.map((player) => {
    const positionData = playersWithPositions.get(player.id);
    return {
      ...player,
      eligiblePositions: positionData?.eligiblePositions ?? [
        '1B',
        '2B',
        '3B',
        'OF',
        'DH',
      ],
      isPitcher: positionData?.isPitcher ?? false,
      positionDetails: positionData?.positionDetails,
    };
  });

  // ── 5. Build per-position player pools with quality scoring ───────────────
  const playersByPosition: PositionPlayerGroup = {};
  for (const position of leaguePositions) {
    const eligiblePlayers = enhancedPlayers
      .filter((player) =>
        canPlayerPlayPosition(player.eligiblePositions, position.positionType),
      )
      .map((player) => ({
        ...player,
        positionScore: player.statsLastFetchedAt
          ? getPositionScore(
              player.eligiblePositions,
              position.positionType,
              player.positionDetails,
            )
          : -1,
      }))
      .sort((a, b) => b.positionScore - a.positionScore);

    // Group by score band and shuffle within each band for controlled randomness
    const groupedByScore: PlayerWithPositions[][] = [];
    let currentGroup: PlayerWithPositions[] = [];
    let currentScore = -1;
    for (const player of eligiblePlayers) {
      const scoreGroup = Math.floor(player.positionScore * 10);
      if (scoreGroup !== currentScore) {
        if (currentGroup.length > 0)
          groupedByScore.push(shuffleArray(currentGroup));
        currentGroup = [player];
        currentScore = scoreGroup;
      } else {
        currentGroup.push(player);
      }
    }
    if (currentGroup.length > 0)
      groupedByScore.push(shuffleArray(currentGroup));
    playersByPosition[position.positionType] = groupedByScore.flat();
  }

  addBreadcrumb('Player pool built', {
    leagueId,
    totalPlayers: enhancedPlayers.length,
    positionGroups: Object.keys(playersByPosition).length,
  });

  return { enhancedPlayers, playersByPosition };
}

/**
 * Assigns players to roster slots randomly while respecting position eligibility.
 * Uses the player_eligible_positions materialized view as the single source of truth
 * for which positions a player qualifies for.
 */
async function randomlyAssignPlayers(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (db) => {
    // Use transaction for atomic draft operations
    return await db.transaction(async (tx) => {
      addBreadcrumb('Starting optimized draft process', { leagueId });

      // Idempotency guard: if team members already exist for this league, a prior
      // invocation already committed the assignment. This can happen when the draft
      // Lambda fails *after* this step (e.g. during matchup creation) and SQS
      // retries the same START_DRAFT message.
      const existingMembersCheck = await tx
        .select({ count: sql<number>`count(*)` })
        .from(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.leagueId, leagueId));

      if (Number(existingMembersCheck[0]?.count) > 0) {
        LOGGER.warn(
          `Team members already assigned for league ${leagueId} — skipping random assignment (idempotency guard)`,
          { leagueId, existingCount: Number(existingMembersCheck[0]?.count) },
        );
        return;
      }

      // Step 1: Batch fetch all required data in parallel (including league config)
      const [teams, leaguePositions, leagueConfig] = await Promise.all([
        tx
          .select({
            id: PublicSchema.teams.id,
            name: PublicSchema.teams.name,
          })
          .from(PublicSchema.teams)
          .where(eq(PublicSchema.teams.leagueId, leagueId)),

        tx
          .select({
            id: PublicSchema.leaguePosition.id,
            positionType: PublicSchema.leaguePosition.positionType,
          })
          .from(PublicSchema.leaguePosition)
          .where(eq(PublicSchema.leaguePosition.leagueId, leagueId))
          .orderBy(PublicSchema.leaguePosition.id),

        tx
          .select({
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            playerPool: PublicSchema.leagues.playerPool,
            minCareerGames: PublicSchema.leagues.minCareerGames,
            minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            eraFilter: PublicSchema.leagues.baseballEraFilter,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1),
      ]);

      // Calculate minimum games needed for valid seasons
      const gamesPerMatchup = leagueConfig[0]?.gamesPerMatchup ?? 5;
      const minGames = gamesPerMatchup * SEASON_MATCHUP_MULTIPLIER;

      // League eligibility settings
      const playerPool = leagueConfig[0]?.playerPool ?? 'all';
      const minCareerGames = leagueConfig[0]?.minCareerGames ?? 50;
      const minCareerSeasons = leagueConfig[0]?.minCareerSeasons ?? 3;
      const baseballHofOnly = leagueConfig[0]?.baseballHofOnly ?? false;
      const eraFilter = leagueConfig[0]?.eraFilter ?? 'all';
      const customEraStartYear = leagueConfig[0]?.customEraStartYear ?? null;
      const customEraEndYear = leagueConfig[0]?.customEraEndYear ?? null;
      const maxRosterSizeFromConfig = leagueConfig[0]?.maxRosterSize ?? 25;

      LOGGER.info('Draft season requirements', {
        gamesPerMatchup,
        minGames,
        playerPool,
        minCareerGames,
        minCareerSeasons,
        baseballHofOnly,
        eraFilter,
        leagueId,
      });

      if (teams.length === 0) {
        throw new Error(`No teams found for league ${leagueId}`);
      }
      if (leaguePositions.length === 0) {
        throw new Error(
          `No positions found for league ${leagueId}. Make sure league positions are set up.`,
        );
      }

      // Steps 1.5–3: Load eligible players and build per-position pools
      // (shared with runAuctionDraft via buildPlayerPool)
      const { enhancedPlayers, playersByPosition } = await buildPlayerPool(
        tx,
        leagueId,
        teams.length,
        leaguePositions,
        {
          gamesPerMatchup: leagueConfig[0]?.gamesPerMatchup ?? null,
          playerPool,
          minCareerGames,
          minCareerSeasons,
          baseballHofOnly,
          eraFilter,
          customEraStartYear,
          customEraEndYear,
          maxRosterSize: maxRosterSizeFromConfig,
        },
      );

      addBreadcrumb('Player pool ready', {
        teamCount: teams.length,
        positionCount: leaguePositions.length,
        playerCount: enhancedPlayers.length,
      });

      // Step 4: Optimized assignment algorithm with batch operations
      const assignments: TeamAssignment[] = [];
      const usedPlayerIds = new Set<number>();
      const teamPositionAssignments: Map<number, Set<number>> = new Map();

      // Initialize team tracking
      teams.forEach((team) => teamPositionAssignments.set(team.id, new Set()));

      // Assign players in round-robin fashion by position
      for (const position of leaguePositions) {
        const availablePlayers = playersByPosition[
          position.positionType
        ].filter((player) => !usedPlayerIds.has(player.id));

        let playerIndex = 0;
        for (const team of teams) {
          const teamAssignedPositions = teamPositionAssignments.get(team.id);
          if (!teamAssignedPositions) continue;

          // Skip if team already has this position filled
          if (teamAssignedPositions.has(position.id)) {
            continue;
          }

          // Find next available player for this position
          if (playerIndex < availablePlayers.length) {
            const assignedPlayer = availablePlayers[playerIndex];

            // Create assignment record for batch insert
            assignments.push({
              teamId: team.id,
              leagueId: leagueId,
              playerId: assignedPlayer.id,
              positionId: position.id,
            });

            // Track assignment
            teamAssignedPositions.add(position.id);
            usedPlayerIds.add(assignedPlayer.id);

            LOGGER.debug(
              `Queued: ${assignedPlayer.firstName} ${assignedPlayer.lastName} → ${team.name} (${position.positionType})`,
            );
            playerIndex++;
          } else {
            LOGGER.warn(
              `No available players for ${team.name} at position ${position.positionType}`,
            );
          }
        }
      }

      // Step 4b: Fill remaining roster spots with bench players (no explicit positions)
      // maxRosterSize was already fetched as part of the league config in Step 1
      const maxRosterSize = maxRosterSizeFromConfig;
      const explicitPositions = leaguePositions.length; // 20 explicit positions
      const benchSlots = maxRosterSize - explicitPositions; // remaining slots are bench

      if (benchSlots > 0) {
        LOGGER.info(
          `Filling ${benchSlots} bench slots per team (maxRosterSize: ${maxRosterSize}, explicit positions: ${explicitPositions})`,
        );

        const remainingAll = enhancedPlayers.filter(
          (player) => !usedPlayerIds.has(player.id),
        );

        const benchAssignments = buildBenchAssignments(
          remainingAll,
          teams,
          benchSlots,
          leagueId,
        );

        for (const benchAssignment of benchAssignments) {
          assignments.push(benchAssignment);
          usedPlayerIds.add(benchAssignment.playerId);
        }

        LOGGER.debug(
          `Assigned ${benchAssignments.length} bench players across ${teams.length} teams`,
        );
      }

      addBreadcrumb('Assignment planning completed', {
        plannedAssignments: assignments.length,
        expectedAssignments: teams.length * maxRosterSize,
        explicitPositions: teams.length * explicitPositions,
        benchAssignments: teams.length * benchSlots,
      });

      // Step 5: Execute batch insert (single database operation instead of N individual inserts)
      if (assignments.length > 0) {
        LOGGER.info(
          `Executing batch insert of ${assignments.length} team member assignments`,
        );

        // Idempotency guard: if a prior SQS delivery committed team_members but
        // a later step (createLeagueMatchupsAfterDraft / finalizeDraftAndStatus)
        // failed, the message is retried and this insert would hit a duplicate-key
        // error on the (team_id, position_id) unique constraint.  Deleting
        // within this same transaction is safe: on success both the delete and
        // the insert commit atomically; on failure everything rolls back.
        await tx
          .delete(PublicSchema.teamMembers)
          .where(eq(PublicSchema.teamMembers.leagueId, leagueId));
        await tx
          .delete(PublicSchema.leagueActivityLog)
          .where(
            and(
              eq(PublicSchema.leagueActivityLog.leagueId, leagueId),
              eq(PublicSchema.leagueActivityLog.eventType, 'draft_pick_made'),
            ),
          );

        await tx.insert(PublicSchema.teamMembers).values(
          assignments.map((assignment) => ({
            teamId: assignment.teamId,
            leagueId: assignment.leagueId,
            playerId: assignment.playerId,
            positionId: assignment.positionId, // null for bench slots
          })),
        );

        // Insert activity log entries for every assignment so the activity feed
        // is populated for random drafts, matching the live pick-by-pick behaviour.
        const teamCount = teams.length;
        await tx.insert(PublicSchema.leagueActivityLog).values(
          assignments.map((assignment, index) => {
            const overallPick = index + 1;
            const round = Math.ceil(overallPick / teamCount);
            const pickNumber = ((overallPick - 1) % teamCount) + 1;
            return {
              leagueId: assignment.leagueId,
              teamId: assignment.teamId,
              actorUserId: null,
              eventType: 'draft_pick_made' as const,
              payload: {
                playerId: assignment.playerId,
                positionId: assignment.positionId,
                overallPick,
                round,
                pickNumber,
                wasAutoPick: true,
                wasRandomDraft: true,
              },
            };
          }),
        );

        LOGGER.info(
          `Inserted ${assignments.length} activity log entries for random draft`,
          { leagueId },
        );

        addBreadcrumb('Batch insert completed', {
          assignmentCount: assignments.length,
          activityLogEntries: assignments.length,
        });
      }

      // Step 6: Verify assignments
      const finalAssignments = await tx
        .select()
        .from(PublicSchema.teamMembers)
        .where(eq(PublicSchema.teamMembers.leagueId, leagueId));

      const assignmentCount = finalAssignments.length;
      const expectedAssignments = teams.length * maxRosterSize; // Total roster spots (positions + bench)

      LOGGER.info(
        `OPTIMIZED Draft completed: ${assignmentCount}/${expectedAssignments} roster spots filled for league ${leagueId}`,
      );
      LOGGER.info(
        `  - Explicit positions: ${teams.length * explicitPositions} spots`,
      );
      LOGGER.info(`  - Bench slots: ${teams.length * benchSlots} spots`);

      if (assignmentCount < expectedAssignments) {
        LOGGER.warn(
          `Performance note: ${expectedAssignments - assignmentCount} roster spots remain unfilled due to player availability constraints`,
        );
      }

      addBreadcrumb('Draft process completed', {
        finalAssignmentCount: assignmentCount,
        expectedTotal: expectedAssignments,
        explicitPositionsFilled: Math.min(
          assignmentCount,
          teams.length * explicitPositions,
        ),
        benchSlotsFilled: Math.max(
          0,
          assignmentCount - teams.length * explicitPositions,
        ),
        fillRate: `${Math.round((assignmentCount / expectedAssignments) * 100)}%`,
      });
    }); // End transaction
  }); // End runWithPublicClient
}

/**
 * Automated auction draft: simulates a complete auction and assigns all roster
 * slots across every team in the league.
 *
 * Simulation strategy per position slot:
 *   1. Nomination rotates round-robin through draftTeams ordered by draftOrder.
 *   2. Best available player eligible for the current position slot is
 *      auto-nominated.
 *   3. Every team that still needs THIS position slot bids proportionally to
 *      their remaining budget, with ±30% randomness to avoid determinism.
 *   4. Budget constraint: max_bid = remaining − (remaining_slots − 1) × min_bid.
 *      This ensures a team can always fill the rest of its roster at minimum cost.
 *   5. Highest bidder wins; remaining_budget and slots_left are decremented.
 *   6. player_salaries is upserted only when salary_cap_enabled = true.
 *
 * Database writes (all within a single transaction):
 *   - team_members  (salary = winning bid)
 *   - draft_picks   (bid_amount = winning bid)
 *   - player_salaries (only when salary_cap_enabled)
 *   - league_activity_log
 *   - auction_budgets (final remaining_budget + players_won per team)
 */
async function runAuctionDraft(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (db) => {
    return await db.transaction(async (tx) => {
      addBreadcrumb('Starting automated auction draft', { leagueId });

      // ── 1. Load league config + draft record ─────────────────────────────
      const [leagueRows, draftRows] = await Promise.all([
        tx
          .select({
            maxRosterSize: PublicSchema.leagues.maxRosterSize,
            auctionBudget: PublicSchema.leagues.auctionBudget,
            auctionMinBid: PublicSchema.leagues.auctionMinBid,
            salaryCapEnabled: PublicSchema.leagues.salaryCapEnabled,
            seasonNumber: PublicSchema.leagues.seasonNumber,
            gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
            playerPool: PublicSchema.leagues.playerPool,
            minCareerGames: PublicSchema.leagues.minCareerGames,
            minCareerSeasons: PublicSchema.leagues.minCareerSeasons,
            baseballHofOnly: PublicSchema.leagues.baseballHofOnly,
            eraFilter: PublicSchema.leagues.baseballEraFilter,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1),
        tx
          .select({ id: PublicSchema.drafts.id })
          .from(PublicSchema.drafts)
          .where(eq(PublicSchema.drafts.leagueId, leagueId))
          .limit(1),
      ]);

      if (leagueRows.length === 0) {
        throw new Error(`League ${leagueId} not found`);
      }
      if (draftRows.length === 0) {
        throw new Error(`No draft found for league ${leagueId}`);
      }

      const config = leagueRows[0];
      const draftId = draftRows[0].id;
      const { auctionBudget, auctionMinBid, maxRosterSize, seasonNumber } =
        config;

      addBreadcrumb('Auction config loaded', {
        draftId,
        auctionBudget,
        auctionMinBid,
        maxRosterSize,
        salaryCapEnabled: config.salaryCapEnabled,
      });

      // ── 2. Load draft teams + league positions ────────────────────────────
      const [draftTeamRows, leaguePositions] = await Promise.all([
        tx
          .select({
            teamId: PublicSchema.draftTeams.teamId,
            draftOrder: PublicSchema.draftTeams.draftOrder,
          })
          .from(PublicSchema.draftTeams)
          .where(eq(PublicSchema.draftTeams.draftId, draftId))
          .orderBy(PublicSchema.draftTeams.draftOrder),
        tx
          .select({
            id: PublicSchema.leaguePosition.id,
            positionType: PublicSchema.leaguePosition.positionType,
          })
          .from(PublicSchema.leaguePosition)
          .where(eq(PublicSchema.leaguePosition.leagueId, leagueId))
          .orderBy(PublicSchema.leaguePosition.id),
      ]);

      const numTeams = draftTeamRows.length;
      if (numTeams === 0) {
        throw new Error(
          `No teams registered for draft ${draftId} in league ${leagueId}`,
        );
      }
      if (leaguePositions.length === 0) {
        throw new Error(
          `No positions found for league ${leagueId}. Make sure league positions are set up.`,
        );
      }

      const explicitPositionCount = leaguePositions.length;
      const benchSlots = maxRosterSize - explicitPositionCount;

      LOGGER.info('Auction draft: teams and positions loaded', {
        numTeams,
        explicitPositionCount,
        benchSlots,
        leagueId,
      });

      // ── 3. Initialize auction_budgets (one row per team) ─────────────────
      await tx
        .insert(PublicSchema.auctionBudgets)
        .values(
          draftTeamRows.map((t) => ({
            draftId,
            teamId: t.teamId,
            remainingBudget: auctionBudget,
            playersWon: 0,
          })),
        )
        .onConflictDoNothing();

      // In-memory tracking for the bidding simulation
      const budgets = new Map<number, number>(
        draftTeamRows.map((t) => [t.teamId, auctionBudget]),
      );
      // Remaining roster slots per team (for budget-constraint calculation)
      const slotsLeft = new Map<number, number>(
        draftTeamRows.map((t) => [t.teamId, maxRosterSize]),
      );
      // Which positionIds each team has already filled (prevents duplicate positionId per team)
      const filledPositions = new Map<number, Set<number>>(
        draftTeamRows.map((t) => [t.teamId, new Set()]),
      );

      // ── 4. Build eligible player pool ─────────────────────────────────────
      const { enhancedPlayers, playersByPosition } = await buildPlayerPool(
        tx,
        leagueId,
        numTeams,
        leaguePositions,
        {
          gamesPerMatchup: config.gamesPerMatchup,
          playerPool: config.playerPool,
          minCareerGames: config.minCareerGames,
          minCareerSeasons: config.minCareerSeasons,
          baseballHofOnly: config.baseballHofOnly,
          eraFilter: config.eraFilter,
          customEraStartYear: config.customEraStartYear,
          customEraEndYear: config.customEraEndYear,
          maxRosterSize,
        },
      );

      LOGGER.info('Auction draft: player pool ready', {
        totalPlayers: enhancedPlayers.length,
        leagueId,
      });

      // ── 5. Auction simulation ──────────────────────────────────────────────
      interface AuctionResult {
        teamId: number;
        playerId: number;
        bidAmount: number;
        positionId: number | null;
        overallPick: number;
        round: number;
        pickNumber: number;
      }

      const auctionResults: AuctionResult[] = [];
      const usedPlayerIds = new Set<number>();
      let overallPick = 0;
      let nominationCycle = 0; // round-robin nominator index

      /**
       * Simulate a single-player auction among eligible bidders.
       * Each team bids proportionally to (remaining / slotsLeft) ± 30%.
       * Budget constraint: max_bid = remaining − (slotsLeft − 1) × min_bid.
       * Returns the winning team ID and their bid amount.
       */
      function simulateBid(
        eligibleBidders: typeof draftTeamRows,
        fallbackTeamId: number,
      ): { winner: number; bid: number } {
        let winner = fallbackTeamId;
        let winningBid = auctionMinBid;

        for (const team of eligibleBidders) {
          const remaining = budgets.get(team.teamId) ?? 0;
          const slots = slotsLeft.get(team.teamId) ?? 0;
          if (slots <= 0 || remaining < auctionMinBid) continue;

          // Max bid keeps min_bid reserved for each remaining slot after this one
          const maxBid = Math.max(
            auctionMinBid,
            remaining - Math.max(0, slots - 1) * auctionMinBid,
          );
          // Proportional bid with ±30% randomness, clamped to [min_bid, max_bid]
          const targetBid = Math.ceil(remaining / slots);
          const bid = Math.max(
            auctionMinBid,
            Math.min(
              maxBid,
              Math.round(targetBid * (0.7 + Math.random() * 0.6)),
            ),
          );
          if (bid > winningBid) {
            winningBid = bid;
            winner = team.teamId;
          }
        }
        return { winner, bid: winningBid };
      }

      // ── 5a. Explicit position slots ────────────────────────────────────────
      for (const position of leaguePositions) {
        const playersForPosition =
          playersByPosition[position.positionType] ?? [];

        // Auction one player per team needing this position
        for (let slot = 0; slot < numTeams; slot++) {
          // Teams that haven't filled this specific position yet
          const stillNeeded = draftTeamRows.filter(
            (t) => !filledPositions.get(t.teamId)?.has(position.id),
          );
          if (stillNeeded.length === 0) break;

          overallPick++;

          // Auto-nominate: best available player eligible for this position
          const nominee = playersForPosition.find(
            (p) => !usedPlayerIds.has(p.id),
          );
          if (!nominee) {
            LOGGER.warn(
              `No available player for position ${position.positionType}`,
              { overallPick, leagueId },
            );
            nominationCycle++;
            overallPick--; // revert the pick counter — no pick was recorded
            continue;
          }

          const nominatorIdx = nominationCycle % stillNeeded.length;
          const fallbackTeamId = stillNeeded[nominatorIdx].teamId;
          nominationCycle++;

          const { winner, bid } = simulateBid(stillNeeded, fallbackTeamId);

          budgets.set(winner, (budgets.get(winner) ?? auctionBudget) - bid);
          slotsLeft.set(winner, (slotsLeft.get(winner) ?? maxRosterSize) - 1);
          filledPositions.get(winner)?.add(position.id);
          usedPlayerIds.add(nominee.id);

          auctionResults.push({
            teamId: winner,
            playerId: nominee.id,
            bidAmount: bid,
            positionId: position.id,
            overallPick,
            round: Math.ceil(overallPick / numTeams),
            pickNumber: ((overallPick - 1) % numTeams) + 1,
          });

          LOGGER.debug(
            `Pick ${overallPick}: team ${winner} wins ${nominee.firstName} ${nominee.lastName} (${position.positionType}) for $${bid}`,
          );
        }
      }

      // ── 5b. Bench slots ────────────────────────────────────────────────────
      if (benchSlots > 0) {
        const remainingPlayers = enhancedPlayers.filter(
          (p) => !usedPlayerIds.has(p.id),
        );

        outer: for (let bench = 0; bench < benchSlots; bench++) {
          for (let slot = 0; slot < numTeams; slot++) {
            const nominee = remainingPlayers.find(
              (p) => !usedPlayerIds.has(p.id),
            );
            if (!nominee) break outer; // no more players

            const eligibleBidders = draftTeamRows.filter(
              (t) => (slotsLeft.get(t.teamId) ?? 0) > 0,
            );
            if (eligibleBidders.length === 0) break outer;

            overallPick++;
            const fallbackTeamId =
              eligibleBidders[nominationCycle % eligibleBidders.length].teamId;
            nominationCycle++;

            const { winner, bid } = simulateBid(
              eligibleBidders,
              fallbackTeamId,
            );

            budgets.set(winner, (budgets.get(winner) ?? auctionBudget) - bid);
            slotsLeft.set(winner, (slotsLeft.get(winner) ?? maxRosterSize) - 1);
            usedPlayerIds.add(nominee.id);

            auctionResults.push({
              teamId: winner,
              playerId: nominee.id,
              bidAmount: bid,
              positionId: null,
              overallPick,
              round: Math.ceil(overallPick / numTeams),
              pickNumber: ((overallPick - 1) % numTeams) + 1,
            });
          }
        }
      }

      const expectedPicks = numTeams * maxRosterSize;
      LOGGER.info(
        `Auction simulation done: ${auctionResults.length}/${expectedPicks} picks`,
        { leagueId },
      );

      if (auctionResults.length === 0) {
        throw new Error('Auction draft produced no picks');
      }

      // ── 6. Batch database writes ───────────────────────────────────────────

      // a) Team members with salary set to winning bid
      await tx.insert(PublicSchema.teamMembers).values(
        auctionResults.map((r) => ({
          teamId: r.teamId,
          leagueId,
          playerId: r.playerId,
          positionId: r.positionId,
          salary: r.bidAmount,
        })),
      );

      // b) Draft picks with bidAmount recorded
      await tx.insert(PublicSchema.draftPicks).values(
        auctionResults.map((r) => ({
          draftId,
          teamId: r.teamId,
          playerId: r.playerId,
          round: r.round,
          pickNumber: r.pickNumber,
          overallPick: r.overallPick,
          bidAmount: r.bidAmount,
        })),
      );

      // c) Player salaries — only when the league has salary cap enabled
      if (config.salaryCapEnabled) {
        await tx
          .insert(PublicSchema.playerSalaries)
          .values(
            auctionResults.map((r) => ({
              leagueId,
              playerId: r.playerId,
              currentSalary: r.bidAmount,
              initialSalary: r.bidAmount,
              acquisitionType: 'auction' as const,
              yearAcquired: seasonNumber,
              freeAgentYears: 0,
            })),
          )
          .onConflictDoUpdate({
            target: [
              PublicSchema.playerSalaries.leagueId,
              PublicSchema.playerSalaries.playerId,
            ],
            set: {
              currentSalary: sql`EXCLUDED.current_salary`,
              initialSalary: sql`EXCLUDED.initial_salary`,
              acquisitionType: sql`EXCLUDED.acquisition_type`,
              updatedAt: sql`now()`,
            },
          });
      }

      // d) Activity log
      await tx.insert(PublicSchema.leagueActivityLog).values(
        auctionResults.map((r) => ({
          leagueId,
          teamId: r.teamId,
          actorUserId: null,
          eventType: 'draft_pick_made' as const,
          payload: {
            playerId: r.playerId,
            positionId: r.positionId,
            overallPick: r.overallPick,
            round: r.round,
            pickNumber: r.pickNumber,
            bidAmount: r.bidAmount,
            wasAutoPick: true,
            wasAuctionDraft: true,
          },
        })),
      );

      // e) Persist final auction_budgets state (remaining budget + players won per team)
      for (const team of draftTeamRows) {
        const finalBudget = budgets.get(team.teamId) ?? 0;
        const playersWon = auctionResults.filter(
          (r) => r.teamId === team.teamId,
        ).length;
        await tx
          .update(PublicSchema.auctionBudgets)
          .set({ remainingBudget: finalBudget, playersWon })
          .where(
            and(
              eq(PublicSchema.auctionBudgets.draftId, draftId),
              eq(PublicSchema.auctionBudgets.teamId, team.teamId),
            ),
          );
      }

      addBreadcrumb('Automated auction draft completed', {
        totalPicks: auctionResults.length,
        expectedPicks,
        leagueId,
      });
    }); // End transaction
  }); // End runWithPublicClient
}

/**
 * Update draft status with comprehensive error handling and Sentry tracking
 * Now uses shared updateLeagueDraftStatus utility with additional Sentry integration
 */
async function updateDraftStatus(
  leagueId: number,
  status: 'in-progress' | 'completed' | 'not-started',
  context: string,
): Promise<void> {
  try {
    addBreadcrumb(`Updating draft status to ${status}`, {
      leagueId,
      status,
      context,
      operation: 'updateDraftStatus',
    });

    // Use shared utility for consistent status updates
    await updateLeagueDraftStatus(
      leagueId,
      status,
      `${context} (draft-processor)`,
    );
  } catch (error) {
    LOGGER.error(
      `Failed to update draft status to '${status}' for league ${leagueId}:`,
      error instanceof Error ? error : new Error(String(error)),
      {
        tags: { lambda: 'draft-processor', operation: 'updateDraftStatus' },
        extra: {
          leagueId,
          targetStatus: status,
          context,
          ...(!(error instanceof Error) && { originalError: error }),
        },
      },
    );

    throw error;
  }
}

/**
 * Atomically finalize the draft: stamp draftCompletedAt on the drafts row
 * and set draftStatus = 'completed' on the leagues row, both in a single
 * database transaction.  This eliminates the race window that existed when
 * setDraftCompletedAt and updateDraftStatus('completed') ran as separate
 * connections.
 *
 * Uses the shared finalizeDraftCompletion helper (lib/db-client) so the
 * automated-draft path applies identical completion logic to the live-draft
 * path (commitDraftPick).
 */
async function finalizeDraftAndStatus(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (db) => {
    await db.transaction(async (tx) => {
      await finalizeDraftCompletion(tx, leagueId);
    });
  });
  addBreadcrumb(
    'Draft finalized atomically: draftCompletedAt + draftStatus=completed',
    {
      leagueId,
    },
  );
}

/**
 * Create all matchups (schedule) for the league after an automated draft completes.
 * This runs the same matchup-generation logic that the pick-by-pick GraphQL path uses.
 */
async function createLeagueMatchupsAfterDraft(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (db) => {
    addBreadcrumb('Creating league matchups after automated draft', {
      leagueId,
    });

    const result = await createAllMatchupsForLeague(db, leagueId);

    LOGGER.info('League matchups created successfully', {
      leagueId,
      matchupCount: result.matchupCount,
      currentMatchupId: result.currentMatchupId,
    });
  });
}

/**
 * Process a single draft message with comprehensive error handling
 */
async function processDraftMessage(
  message: SqsDraftMessage,
): Promise<DraftProcessingResult> {
  const {
    leagueId,
    draftMode,
    selectionMethod,
    draftOrder,
    requestedBy,
    timestamp,
  } = message.payload;

  addBreadcrumb('Starting draft processing', {
    leagueId,
    draftMode,
    selectionMethod,
    draftOrder,
    requestedBy,
    timestamp,
    operation: 'processDraftMessage',
  });

  LOGGER.info(
    `Processing draft for league ${leagueId}, mode: ${draftMode}, method: ${selectionMethod}, requested by user ${requestedBy}`,
  );

  try {
    // Step 1: Update draft status to 'in-progress'
    await updateDraftStatus(
      leagueId,
      'in-progress',
      'draft processing started',
    );

    // Step 2: Verify league exists and user has access
    addBreadcrumb('Verifying user access', { leagueId, requestedBy });

    // Use shared validation utility for consistent access checking
    await validateUserAccess(leagueId, requestedBy);

    addBreadcrumb('User access verified', { leagueId, requestedBy });

    // Step 2.5: Validate draft fields using shared utilities
    validateDraftMode(draftMode);
    validateSelectionMethod(selectionMethod);
    addBreadcrumb('Draft fields validated', {
      draftMode,
      selectionMethod,
      leagueId,
    });

    // Step 3: Process based on selection method
    addBreadcrumb('Processing draft by selection method', { selectionMethod });

    switch (selectionMethod) {
      case 'random':
        await randomlyAssignPlayers(leagueId);
        break;
      case 'standard':
        throw new Error(
          'Standard (pick-by-pick) draft processing not yet implemented in Lambda',
        );
      case 'auction':
        await runAuctionDraft(leagueId);
        break;
      default:
        throw new Error(`Unknown selection method: ${String(selectionMethod)}`);
    }

    // Step 3.5: Create all matchups (schedule) for the league.
    // The pick-by-pick GraphQL path does this inline; we must do it here
    // for automated drafts since the Lambda bypasses the GraphQL layer.
    addBreadcrumb('Creating league matchups after draft', {
      leagueId,
      selectionMethod,
    });
    await createLeagueMatchupsAfterDraft(leagueId);
    addBreadcrumb('League matchups created', { leagueId });

    // Step 3.6: Atomically stamp draftCompletedAt and set draftStatus='completed'.
    // Using finalizeDraftAndStatus (shared helper) ensures both writes land in the
    // same transaction — eliminating the race window where draftStatus could be
    // 'completed' while draftCompletedAt was still null.
    await finalizeDraftAndStatus(leagueId);

    addBreadcrumb('Draft processing completed successfully', {
      selectionMethod,
      leagueId,
    });

    // Step 4: Send WebSocket notification
    try {
      if (notificationService) {
        await notificationService.notifyDraftCompleted(
          leagueId,
          selectionMethod,
        );
        addBreadcrumb('WebSocket notification sent', {
          leagueId,
          selectionMethod,
        });
      } else {
        LOGGER.warn('Notification service not available');
      }
    } catch (notificationError) {
      // Don't fail the draft if notification fails
      LOGGER.error(
        'Failed to send draft completion notification',
        notificationError instanceof Error
          ? notificationError
          : new Error(String(notificationError)),
        {
          leagueId,
          tags: { lambda: 'draft-processor', operation: 'notification' },
          extra: { leagueId, selectionMethod },
        },
      );
    }

    // Step 5: Publish push notification for draft completion
    // NOTE: Requires sqs:SendMessage on the notifications queue in Terraform.
    // Until the IAM policy is added, publish calls will fail with AccessDenied
    // and degrade gracefully via the non-fatal catch block below.
    if (pushPublisher) {
      try {
        await pushPublisher.publish({
          userId: message.payload.requestedBy,
          notificationType: 'draft_completed',
          title: 'Draft Complete',
          body: `Your ${selectionMethod} draft for league ${leagueId} has been completed. Check your roster!`,
          data: { leagueId },
        });
        addBreadcrumb('Push notification queued for draft completion', {
          leagueId,
          selectionMethod,
          userId: message.payload.requestedBy,
        });
      } catch (pushNotificationError) {
        // Don't fail the draft if push notification queuing fails
        LOGGER.error(
          'Failed to queue draft completion push notification',
          pushNotificationError instanceof Error
            ? pushNotificationError
            : new Error(String(pushNotificationError)),
          {
            leagueId,
            selectionMethod,
            userId: message.payload.requestedBy,
            tags: {
              lambda: 'draft-processor',
              operation: 'push_notification',
            },
            extra: {
              leagueId,
              selectionMethod,
              userId: message.payload.requestedBy,
            },
          },
        );
      }
    }

    LOGGER.info(
      `Successfully completed ${selectionMethod} draft for league ${leagueId}`,
    );

    return {
      success: true,
      leagueId,
      message: `${selectionMethod} draft completed successfully for league ${leagueId}`,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    LOGGER.error(
      `Error processing draft message for league ${leagueId}:`,
      error instanceof Error ? error : new Error(String(error)),
      {
        tags: {
          lambda: 'draft-processor',
          operation: 'processDraftMessage',
          selectionMethod,
          failureType: 'processing_error',
        },
        extra: {
          leagueId,
          draftMode,
          selectionMethod,
          requestedBy,
          timestamp,
          errorMessage,
          errorStack,
          processingPhase: 'draft_processing',
          ...(!(error instanceof Error) && { originalError: error }),
        },
      },
    );

    // Critical: Reset draft status to 'not-started' for retry capability
    try {
      await updateDraftStatus(
        leagueId,
        'not-started',
        `error recovery - ${errorMessage}`,
      );

      addBreadcrumb('Draft status reset to not-started due to error', {
        leagueId,
        errorMessage,
        recovery: 'success',
      });
    } catch (statusError) {
      const statusErrorMessage =
        statusError instanceof Error
          ? statusError.message
          : 'Unknown status update error';

      LOGGER.error(
        `CRITICAL: Failed to reset draft status for league ${leagueId} after processing error:`,
        statusError instanceof Error
          ? statusError
          : new Error(String(statusError)),
        {
          tags: {
            lambda: 'draft-processor',
            operation: 'statusRecovery',
            severity: 'critical',
            failureType: 'status_reset_failure',
          },
          extra: {
            leagueId,
            originalError: errorMessage,
            statusUpdateError: statusErrorMessage,
            processingPhase: 'error_recovery',
            impact: 'league_may_be_stuck_in_progress',
          },
        },
      );

      addBreadcrumb('CRITICAL: Status recovery failed', {
        leagueId,
        originalError: errorMessage,
        statusError: statusErrorMessage,
        recovery: 'failed',
      });
    }

    return {
      success: false,
      leagueId,
      message: 'Draft processing failed',
      error: errorMessage,
      cause: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Base SQS handler function
 */
const baseDraftProcessorHandler = async (
  event: SQSEvent,
): Promise<SQSBatchResponse> => {
  addBreadcrumb(`Processing ${event.Records.length} draft messages`, {
    recordCount: event.Records.length,
  });

  LOGGER.info(`Processing ${event.Records.length} draft messages`);

  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      const message: SqsDraftMessage = SqsDraftMessageSchema.parse(
        JSON.parse(record.body) as unknown,
      );

      addBreadcrumb('Processing draft message', {
        messageId: record.messageId,
        messageType: message.messageType,
        leagueId: message.payload?.leagueId,
      });

      // Validate message format
      if (message.messageType !== 'START_DRAFT') {
        throw new Error(`Invalid message type: ${String(message.messageType)}`);
      }

      const result = await processDraftMessage(message);

      if (!result.success) {
        LOGGER.error(
          `Draft processing failed for league ${result.leagueId}: ${result.error}`,
          result.cause ??
            new Error(
              `Draft processing failed: ${result.error ?? 'unknown error'}`,
            ),
          {
            tags: {
              lambda: 'draft-processor',
              operation: 'processDraftMessage',
            },
            extra: {
              leagueId: result.leagueId,
              messageId: record.messageId,
              error: result.error,
            },
          },
        );

        batchItemFailures.push({ itemIdentifier: record.messageId });
      } else {
        LOGGER.info(`Draft processing succeeded for league ${result.leagueId}`);
      }
    } catch (error) {
      LOGGER.error(
        'Error processing SQS record:',
        error instanceof Error ? error : new Error(String(error)),
        {
          tags: { lambda: 'draft-processor', operation: 'sqsRecordProcessing' },
          extra: { messageId: record.messageId, recordBody: record.body },
        },
      );

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

/**
 * Main SQS handler function with Rollbar integration
 */
export const handler = withRollbar(baseDraftProcessorHandler);

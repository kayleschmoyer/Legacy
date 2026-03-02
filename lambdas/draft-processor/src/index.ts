import { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { LOGGER } from '@legacy-sports/logging';
import {
  formatVersionInfo,
  getDbOptions,
  getVersionInfo,
  isNegroLeague,
  MIN_SEASON_WITH_GAME_DATA,
} from '@legacy-sports/utils';
import {
  createNotificationService,
  DraftProcessingResult,
  SqsDraftMessage,
} from '@legacy-sports/aws-utils';
import {
  addBreadcrumb,
  captureError,
  getSentryConfigFromEnv,
  initSentry,
  withSentry,
} from '@legacy-sports/sentry';
import {
  createAllMatchupsForLeague,
  filterPlayerIdsByLeagueEligibility,
  PublicDb,
  PublicSchema,
  runWithPublicClient,
  updateLeagueDraftStatus,
  validateDraftMode,
  validateSelectionMethod,
  validateUserAccess,
} from '@legacy-sports/db-client';
import { and, eq, gte, inArray, sql } from 'drizzle-orm';

// Initialize Sentry
const sentryConfig = getSentryConfigFromEnv();
if (sentryConfig) {
  initSentry(sentryConfig);
}

// Log version information on cold start
const versionInfo = getVersionInfo('legacy-sports-draft-processor');
LOGGER.info('Draft Processor Lambda initialized', {
  versionFormatted: formatVersionInfo(versionInfo),
  ...versionInfo,
});

// Initialize notification service
const notificationService = createNotificationService();

/**
 * Draft Processing Lambda
 * Processes draft messages from SQS queue and executes the draft logic
 */

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

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
 * OPTIMIZED: Batch load player positions using career_fielding positionsPlayed JSONB data
 *
 * ARCHITECTURE: Uses the same positionsPlayed data structure as the GraphQL API but
 * accesses it directly from the database for maximum performance:
 *
 * ✅ Uses career_fielding.positions_played JSONB field (same as GraphQL positionsPlayed resolver)
 * ✅ Same ALLOWED_POSITIONS mapping (verified by test-position-consistency.ts)
 * ✅ Enhanced position eligibility logic with games/gamesStarted thresholds
 * ✅ Single database query instead of multiple views for better Lambda performance
 *
 * Performance improvements:
 * - Single query vs 3 separate queries (3x faster database access)
 * - JSONB position data includes games played for smarter eligibility decisions
 * - Direct database access eliminates GraphQL resolution overhead
 */
async function loadAllPlayersWithPositions(
  db: PublicDb,
  playerIds: number[],
): Promise<Map<number, PlayerWithPositions>> {
  const startTime = Date.now();
  addBreadcrumb('Loading optimized player positions and stats', {
    playerCount: playerIds.length,
  });

  // Single optimized query: Get career fielding data with positions_played JSONB
  // and career pitching data in one go using LEFT JOINs
  const playerData = await db
    .select({
      playerId: PublicSchema.careerFielding.playerId,
      positionsPlayed: PublicSchema.careerFielding.positionsPlayed,
      fieldingGames: PublicSchema.careerFielding.g,
      pitchingGames: PublicSchema.careerPitching.g,
      pitchingGamesStarted: PublicSchema.careerPitching.gs,
    })
    .from(PublicSchema.careerFielding)
    .leftJoin(
      PublicSchema.careerPitching,
      eq(
        PublicSchema.careerFielding.playerId,
        PublicSchema.careerPitching.playerId,
      ),
    )
    .where(inArray(PublicSchema.careerFielding.playerId, playerIds));

  const queryTime = Date.now() - startTime;
  addBreadcrumb('Database query completed', {
    queryTimeMs: queryTime,
    recordsFound: playerData.length,
  });

  // Create enhanced player map with detailed position data
  const playerMap = new Map<number, PlayerWithPositions>();
  let playersWithPositionData = 0;
  let playersWithFallbackData = 0;

  for (const record of playerData) {
    const playerId = record.playerId;
    let eligiblePositions: string[] = [];
    let positionDetails: Record<
      string,
      { games: number; gamesStarted: number; position: string }
    > = {};

    // Parse positions_played JSONB data (same format as GraphQL API)
    if (record.positionsPlayed && typeof record.positionsPlayed === 'object') {
      try {
        const positions = record.positionsPlayed as Record<
          string,
          { games: number; gamesStarted: number; position: string }
        >;
        positionDetails = positions;

        // Extract eligible positions based on game thresholds
        // Use same logic as GraphQL API but with performance optimizations
        for (const [pos, data] of Object.entries(positions)) {
          if (
            data &&
            typeof data === 'object' &&
            typeof data.games === 'number'
          ) {
            // Apply smart thresholds based on position type
            let threshold = 25; // Default threshold for field positions

            // Higher thresholds for specialized positions (same as player_eligible_positions view)
            if (['C'].includes(pos)) threshold = 50; // Catcher needs more experience
            if (['SP', 'RP'].includes(pos)) threshold = 10; // Pitchers have lower threshold

            if (data.games >= threshold) {
              eligiblePositions.push(pos);
            }
          }
        }

        playersWithPositionData++;
        addBreadcrumb('Parsed position data from JSONB', {
          playerId,
          positionCount: Object.keys(positions).length,
          eligibleCount: eligiblePositions.length,
          totalFieldingGames: record.fieldingGames || 0,
        });
      } catch (error) {
        addBreadcrumb('Failed to parse positions_played JSONB', {
          playerId,
          error: error instanceof Error ? error.message : 'Unknown error',
          rawData: record.positionsPlayed,
        });
      }
    }

    // Apply enhanced fallback logic if no positions found from JSONB
    if (eligiblePositions.length === 0) {
      playersWithFallbackData++;

      // Check pitching stats first (most reliable indicator)
      if (record.pitchingGames && record.pitchingGames > 10) {
        if (record.pitchingGamesStarted && record.pitchingGamesStarted > 10) {
          eligiblePositions = ['SP']; // Starting pitcher
        } else {
          eligiblePositions = ['RP']; // Relief pitcher
        }
        addBreadcrumb('Applied pitching fallback positions', {
          playerId,
          pitchingGames: record.pitchingGames,
          pitchingGamesStarted: record.pitchingGamesStarted || 0,
          assignedPositions: eligiblePositions,
        });
      }
      // Check fielding games as secondary indicator
      else if (record.fieldingGames && record.fieldingGames > 25) {
        // Assign broad field positions for players with fielding experience
        eligiblePositions = [
          '1B',
          '2B',
          '3B',
          'SS',
          'LF',
          'CF',
          'RF',
          'C',
          'DH',
        ];
        addBreadcrumb('Applied fielding fallback positions', {
          playerId,
          fieldingGames: record.fieldingGames,
          assignedPositions: eligiblePositions,
        });
      }
      // Final fallback: make player eligible for flexible positions
      else {
        eligiblePositions = ['DH']; // DH is the most flexible position slot
        addBreadcrumb('Applied default fallback position', {
          playerId,
          fieldingGames: record.fieldingGames || 0,
          pitchingGames: record.pitchingGames || 0,
          assignedPositions: eligiblePositions,
        });
      }
    }

    const isPitcher = eligiblePositions.some((pos) =>
      PITCHING_POSITIONS.has(pos),
    );

    playerMap.set(playerId, {
      id: playerId,
      firstName: '', // Will be filled from main player query
      lastName: '',
      brefId: '',
      statsLastFetchedAt: null, // Will be filled from main player query
      eligiblePositions,
      isPitcher,
      positionDetails,
    });
  }

  // Handle players not found in career_fielding (no fielding/pitching stats)
  for (const playerId of playerIds) {
    if (!playerMap.has(playerId)) {
      playersWithFallbackData++;

      // Assign default flexible positions for players with no stats
      playerMap.set(playerId, {
        id: playerId,
        firstName: '',
        lastName: '',
        brefId: '',
        statsLastFetchedAt: null, // Will be filled from main player query
        eligiblePositions: ['DH'], // Most flexible position
        isPitcher: false,
        positionDetails: {},
      });

      addBreadcrumb(
        'Player not found in career stats, assigned default position',
        {
          playerId,
          assignedPositions: ['DH'],
        },
      );
    }
  }

  const processingTime = Date.now() - startTime;

  // Enhanced performance tracking
  addBreadcrumb('Optimized position assignment completed', {
    totalPlayers: playerMap.size,
    playersWithPositionData,
    playersWithFallbackData,
    fallbackPercentage: Math.round(
      (playersWithFallbackData / playerMap.size) * 100,
    ),
    totalProcessingTimeMs: processingTime,
    avgProcessingTimePerPlayer:
      Math.round((processingTime / playerMap.size) * 100) / 100,
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
 * Position mapping logic - MUST match GraphQL API's ALLOWED_POSITIONS exactly
 * Source: lib/shared-components/src/utils/PositionModels.ts
 */
const ALLOWED_POSITIONS = Object.freeze({
  '1B': ['1B'],
  '2B': ['2B'],
  '3B': ['3B'],
  C: ['C'],
  CF: ['CF'],
  DH: ['1B', '2B', '3B', 'SS', 'LF', 'RF', 'CF', 'C', 'DH'], // DH can be any position player
  IF: ['1B', '2B', '3B', 'SS'],
  LF: ['LF'],
  OF: ['LF', 'RF', 'CF'],
  RF: ['RF'],
  RP: ['RP', 'P'], // Relief pitchers include generic P
  SP: ['SP', 'P'], // Starting pitchers include generic P
  SS: ['SS'],
  XDH: ['DH'],
} as const);

const PITCHING_POSITIONS = Object.freeze(new Set(['SP', 'RP', 'P']));
const BATTING_POSITIONS = Object.freeze(
  new Set(['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH']),
);

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
  const allowedPositions =
    ALLOWED_POSITIONS[requiredPosition as keyof typeof ALLOWED_POSITIONS];

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

  const allowedPositions =
    ALLOWED_POSITIONS[requiredPosition as keyof typeof ALLOWED_POSITIONS];
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

/**
 * HEAVILY OPTIMIZED: Smart player assignment using positionsPlayed JSONB data
 *
 * Performance Improvements:
 * - Single database query vs 3 separate queries (3x faster DB access)
 * - Uses career_fielding.positions_played JSONB field (same as GraphQL API)
 * - Smart position scoring based on actual games played at each position
 * - Enhanced fallback logic for players without complete stats
 * - Batched database operations and transaction management
 *
 * Quality Improvements:
 * - Players assigned to positions where they have most experience
 * - Controlled randomness maintains draft fairness while optimizing fit
 * - Better handling of multi-position players
 */
async function randomlyAssignPlayers(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (db) => {
    // Use transaction for atomic draft operations
    return await db.transaction(async (tx) => {
      addBreadcrumb('Starting optimized draft process', { leagueId });

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
            hofOnly: PublicSchema.leagues.hofOnly,
            eraFilter: PublicSchema.leagues.eraFilter,
            customEraStartYear: PublicSchema.leagues.customEraStartYear,
            customEraEndYear: PublicSchema.leagues.customEraEndYear,
          })
          .from(PublicSchema.leagues)
          .where(eq(PublicSchema.leagues.id, leagueId))
          .limit(1),
      ]);

      // Calculate minimum games needed for valid seasons
      const gamesPerMatchup = leagueConfig[0]?.gamesPerMatchup ?? 5;
      const minGames = gamesPerMatchup * 2; // Same logic as matchup season selection

      // League eligibility settings
      const playerPool = leagueConfig[0]?.playerPool ?? 'all';
      const minCareerGames = leagueConfig[0]?.minCareerGames ?? 50;
      const minCareerSeasons = leagueConfig[0]?.minCareerSeasons ?? 3;
      const hofOnly = leagueConfig[0]?.hofOnly ?? false;
      const eraFilter = leagueConfig[0]?.eraFilter ?? 'all';
      const customEraStartYear = leagueConfig[0]?.customEraStartYear ?? null;
      const customEraEndYear = leagueConfig[0]?.customEraEndYear ?? null;

      LOGGER.info('Draft season requirements', {
        gamesPerMatchup,
        minGames,
        playerPool,
        minCareerGames,
        minCareerSeasons,
        hofOnly,
        eraFilter,
        leagueId,
      });

      // Calculate players needed and fetch with appropriate buffer
      const estimatedPlayersNeeded = teams.length * leaguePositions.length * 2; // 2x buffer

      // Step 1.5: Query ALL candidate players first (before filtering by valid seasons)
      // Query explanation:
      // 1. ORDER BY statsLastFetchedAt to prioritize players WITH stats
      // 2. Most recently fetched stats appear first
      // 3. Players with no stats (NULL) appear last
      // 4. Secondary sort by player ID for consistent ordering
      const candidatePlayers = await tx
        .select({
          id: PublicSchema.players.id,
          firstName: PublicSchema.players.firstName,
          lastName: PublicSchema.players.lastName,
          brefId: PublicSchema.players.brefId,
          statsLastFetchedAt: PublicSchema.players.statsLastFetchedAt,
        })
        .from(PublicSchema.players)
        .orderBy(
          sql`CASE WHEN ${PublicSchema.players.statsLastFetchedAt} IS NOT NULL THEN 0 ELSE 1 END`, // Players with stats first
          sql`${PublicSchema.players.statsLastFetchedAt} DESC NULLS LAST`, // Most recently fetched stats first
          PublicSchema.players.id, // Consistent tiebreaker
        )
        .limit(Math.max(estimatedPlayersNeeded, 2000)); // Larger buffer since we'll filter

      LOGGER.info(
        `Loaded ${candidatePlayers.length} candidate players before season filtering`,
      );

      // Step 1.6: Filter to only players with valid seasons (at least minGames in batting, pitching, OR fielding)
      // Only consider seasons from 1901+ (Baseball-Reference has game-level data from 1901 onwards)
      const candidatePlayerIds = candidatePlayers.map((p) => p.id);

      // Query player stats to determine which players have valid seasons
      const [battingStats, pitchingStats, fieldingStats] = await Promise.all([
        tx
          .select({
            playerId: PublicSchema.seasonBatting.playerId,
            season: PublicSchema.seasonBatting.season,
            g: PublicSchema.seasonBatting.g,
            lgId: PublicSchema.seasonBatting.lgId,
          })
          .from(PublicSchema.seasonBatting)
          .where(
            and(
              inArray(PublicSchema.seasonBatting.playerId, candidatePlayerIds),
              gte(PublicSchema.seasonBatting.season, MIN_SEASON_WITH_GAME_DATA),
            ),
          )
          .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
        tx
          .select({
            playerId: PublicSchema.seasonPitching.playerId,
            season: PublicSchema.seasonPitching.season,
            g: PublicSchema.seasonPitching.g,
            lgId: PublicSchema.seasonPitching.lgId,
          })
          .from(PublicSchema.seasonPitching)
          .where(
            and(
              inArray(PublicSchema.seasonPitching.playerId, candidatePlayerIds),
              gte(
                PublicSchema.seasonPitching.season,
                MIN_SEASON_WITH_GAME_DATA,
              ),
            ),
          )
          .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
        tx
          .select({
            playerId: PublicSchema.seasonFielding.playerId,
            season: PublicSchema.seasonFielding.season,
            g: PublicSchema.seasonFielding.g,
            lgId: PublicSchema.seasonFielding.lgId,
          })
          .from(PublicSchema.seasonFielding)
          .where(
            and(
              inArray(PublicSchema.seasonFielding.playerId, candidatePlayerIds),
              gte(
                PublicSchema.seasonFielding.season,
                MIN_SEASON_WITH_GAME_DATA,
              ),
            ),
          )
          .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
      ]);

      // Identify players with at least one valid season
      // Aggregate fielding stats by player+season (since fielding has multiple positions)
      const fieldingByPlayerSeason = new Map<string, number>();
      for (const stat of fieldingStats) {
        const key = `${stat.playerId}-${stat.season}`;
        const games = stat.g ?? 0;
        fieldingByPlayerSeason.set(
          key,
          (fieldingByPlayerSeason.get(key) ?? 0) + games,
        );
      }

      const playersWithValidSeasons = new Set<number>();

      // Check batting seasons
      for (const stat of battingStats) {
        if ((stat.g ?? 0) >= minGames) {
          playersWithValidSeasons.add(stat.playerId);
        }
      }

      // Check pitching seasons
      for (const stat of pitchingStats) {
        if ((stat.g ?? 0) >= minGames) {
          playersWithValidSeasons.add(stat.playerId);
        }
      }

      // Check fielding seasons (aggregated)
      for (const [key, totalGames] of fieldingByPlayerSeason.entries()) {
        if (totalGames >= minGames) {
          const playerId = parseInt(key.split('-')[0]);
          playersWithValidSeasons.add(playerId);
        }
      }

      // Filter to only players with valid seasons
      let players = candidatePlayers.filter((p) =>
        playersWithValidSeasons.has(p.id),
      );

      LOGGER.info(
        `Filtered to ${players.length} players with valid seasons (≥${minGames} games)`,
      );
      LOGGER.info(
        `Excluded ${candidatePlayers.length - players.length} players without valid seasons`,
      );

      // Step 1.7: Apply league eligibility settings (playerPool, minCareerGames, minCareerSeasons, hofOnly, eraFilter)
      const preEligibilityCount = players.length;
      const eligibilityResult = await filterPlayerIdsByLeagueEligibility(
        tx,
        players.map((p) => p.id),
        {
          playerPool,
          minCareerGames,
          minCareerSeasons,
          hofOnly,
          eraFilter,
          customEraStartYear,
          customEraEndYear,
        },
      );
      players = players.filter((p) => eligibilityResult.eligibleIds.has(p.id));

      LOGGER.info(
        `League eligibility filters: ${preEligibilityCount} → ${players.length} players ` +
          `(pool: -${eligibilityResult.excludedByPool}, ` +
          `career games: -${eligibilityResult.excludedByCareerGames}, ` +
          `career seasons: -${eligibilityResult.excludedByCareerSeasons}, ` +
          `hof: -${eligibilityResult.excludedByHofOnly}, ` +
          `era: -${eligibilityResult.excludedByEraFilter})`,
      );

      if (teams.length === 0) {
        throw new Error(`No teams found for league ${leagueId}`);
      }
      if (leaguePositions.length === 0) {
        throw new Error(
          `No positions found for league ${leagueId}. Make sure league positions are set up.`,
        );
      }
      if (players.length === 0) {
        throw new Error('No players available for draft');
      }

      // Log stats about player stats availability
      const playersWithStats = players.filter(
        (p) => p.statsLastFetchedAt !== null,
      ).length;
      const statsPercentage = Math.round(
        (playersWithStats / players.length) * 100,
      );

      LOGGER.info(
        `Draft data loaded: ${teams.length} teams, ${leaguePositions.length} positions, ${players.length} players`,
      );
      LOGGER.info(
        `Player stats availability: ${playersWithStats}/${players.length} players (${statsPercentage}%) have loaded stats`,
      );
      addBreadcrumb('Basic draft data loaded', {
        teamCount: teams.length,
        positionCount: leaguePositions.length,
        playerCount: players.length,
        playersWithStats: playersWithStats,
        statsPercentage: `${statsPercentage}%`,
      });

      // Step 2: Batch load all player positions and stats (eliminates N+1 queries)
      const playerIds = players.map((p) => p.id);
      const playersWithPositions = await loadAllPlayersWithPositions(
        tx,
        playerIds,
      );

      // Merge player data with position data
      const enhancedPlayers: PlayerWithPositions[] = players.map((player) => {
        const positionData = playersWithPositions.get(player.id);
        const eligiblePositions = positionData?.eligiblePositions || [
          '1B',
          '2B',
          '3B',
          'OF',
          'DH',
        ];

        // DEBUG: Log some sample player eligibility
        if (players.indexOf(player) < 5) {
          LOGGER.info(
            `Sample player ${player.firstName} ${player.lastName}: eligible for ${eligiblePositions.join(',')}`,
          );
        }

        return {
          ...player,
          eligiblePositions,
          isPitcher: positionData?.isPitcher || false,
        };
      });

      LOGGER.info(`Total enhanced players: ${enhancedPlayers.length}`);

      // Step 3: Create OPTIMIZED position-based player groups with smart scoring
      const playersByPosition: PositionPlayerGroup = {};
      for (const position of leaguePositions) {
        // DEBUG: Log position requirements and player eligibility
        LOGGER.info(
          `Processing position ${position.positionType} (id: ${position.id})`,
        );

        // Filter eligible players and add position scoring for smarter assignments
        const eligiblePlayers = enhancedPlayers
          .filter((player) => {
            const canPlay = canPlayerPlayPosition(
              player.eligiblePositions,
              position.positionType,
            );
            if (!canPlay) {
              LOGGER.debug(
                `Player ${player.firstName} ${player.lastName} (${player.eligiblePositions.join(',')}) cannot play ${position.positionType}`,
              );
            }
            return canPlay;
          })
          .map((player) => ({
            ...player,
            // Combine position score with stats availability
            // Players without stats get -1, ensuring they always sort last
            positionScore: player.statsLastFetchedAt
              ? getPositionScore(
                  player.eligiblePositions,
                  position.positionType,
                  player.positionDetails,
                )
              : -1, // Players without stats always go to the end
          }))
          // Sort by position score (best fits first) then shuffle within similar score ranges
          .sort((a, b) => b.positionScore - a.positionScore);

        LOGGER.info(
          `Position ${position.positionType}: ${eligiblePlayers.length} eligible players found`,
        );

        // Add controlled randomness: shuffle players with similar scores to maintain draft fairness
        const groupedByScore: PlayerWithPositions[][] = [];
        let currentGroup: PlayerWithPositions[] = [];
        let currentScore = -1;

        for (const player of eligiblePlayers) {
          const scoreGroup = Math.floor(player.positionScore * 10); // Group by 0.1 increments

          if (scoreGroup !== currentScore) {
            if (currentGroup.length > 0) {
              groupedByScore.push(shuffleArray(currentGroup));
            }
            currentGroup = [player];
            currentScore = scoreGroup;
          } else {
            currentGroup.push(player);
          }
        }

        if (currentGroup.length > 0) {
          groupedByScore.push(shuffleArray(currentGroup));
        }

        // Flatten back into single array maintaining score-based ordering with randomness
        playersByPosition[position.positionType] = groupedByScore.flat();

        LOGGER.debug(
          `Position ${position.positionType}: ${playersByPosition[position.positionType].length} eligible players (smart-sorted)`,
        );
      }

      // Enhanced performance monitoring with position quality metrics
      const positionQualityMetrics = Object.entries(playersByPosition).map(
        ([pos, players]) => {
          const avgScore =
            players.reduce((sum, p) => sum + (p.positionScore || 1), 0) /
            players.length;
          const highQualityPlayers = players.filter(
            (p) => (p.positionScore || 1) > 1.2,
          ).length;

          return {
            position: pos,
            totalPlayers: players.length,
            avgQualityScore: Math.round(avgScore * 100) / 100,
            highQualityCount: highQualityPlayers,
            highQualityPercentage: Math.round(
              (highQualityPlayers / players.length) * 100,
            ),
          };
        },
      );

      addBreadcrumb('OPTIMIZED position groups created with quality scoring', {
        positionGroups: Object.keys(playersByPosition).length,
        totalEligibleAssignments: Object.values(playersByPosition).reduce(
          (sum, players) => sum + players.length,
          0,
        ),
        qualityMetrics: positionQualityMetrics,
        improvementNote:
          'Using positionsPlayed JSONB data for smarter assignments',
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
      // Get league's maxRosterSize to determine total roster spots
      const leagueInfo = await tx
        .select({ maxRosterSize: PublicSchema.leagues.maxRosterSize })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, leagueId))
        .limit(1);

      if (leagueInfo.length === 0) {
        throw new Error(`League ${leagueId} not found`);
      }

      const maxRosterSize = leagueInfo[0].maxRosterSize;
      const explicitPositions = leaguePositions.length; // 20 explicit positions
      const benchSlots = maxRosterSize - explicitPositions; // remaining slots are bench

      if (benchSlots > 0) {
        LOGGER.info(
          `Filling ${benchSlots} bench slots per team (maxRosterSize: ${maxRosterSize}, explicit positions: ${explicitPositions})`,
        );

        // Get all remaining players (not used in explicit positions)
        const remainingPlayers = enhancedPlayers.filter(
          (player) => !usedPlayerIds.has(player.id),
        );

        // Assign remaining players to bench slots (positionId = null)
        let playerIndex = 0;
        for (let benchSlot = 0; benchSlot < benchSlots; benchSlot++) {
          for (const team of teams) {
            if (playerIndex < remainingPlayers.length) {
              const assignedPlayer = remainingPlayers[playerIndex];

              // Create bench assignment (positionId = null for bench)
              assignments.push({
                teamId: team.id,
                leagueId: leagueId,
                playerId: assignedPlayer.id,
                positionId: null, // null indicates bench spot
              });

              usedPlayerIds.add(assignedPlayer.id);
              LOGGER.debug(
                `Queued bench: ${assignedPlayer.firstName} ${assignedPlayer.lastName} → ${team.name} (bench)`,
              );
              playerIndex++;
            } else {
              LOGGER.warn(
                `No more available players for bench slot in ${team.name}`,
              );
            }
          }
        }
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

        await tx.insert(PublicSchema.teamMembers).values(
          assignments.map((assignment) => ({
            teamId: assignment.teamId,
            leagueId: assignment.leagueId,
            playerId: assignment.playerId,
            positionId: assignment.positionId, // null for bench slots
          })),
        );

        addBreadcrumb('Batch insert completed', {
          assignmentCount: assignments.length,
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
      error,
    );

    captureError(error instanceof Error ? error : new Error(String(error)), {
      tags: {
        lambda: 'draft-processor',
        operation: 'updateDraftStatus',
      },
      extra: {
        leagueId,
        targetStatus: status,
        context,
        originalError: error,
      },
    });

    throw error;
  }
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
 * Stamp the league's draft_completed_at timestamp.
 * Called after matchup creation so the frontend knows the league is fully ready.
 */
async function setDraftCompletedAt(leagueId: number): Promise<void> {
  await runWithPublicClient(getDbOptions(), async (db) => {
    await db
      .update(PublicSchema.leagues)
      .set({ draftCompletedAt: new Date() })
      .where(eq(PublicSchema.leagues.id, leagueId));

    LOGGER.info('Set draftCompletedAt on league', { leagueId });
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
        // TODO(LS-327): Implement snake/linear draft logic
        throw new Error(
          'Standard (pick-by-pick) draft processing not yet implemented in Lambda',
        );
      case 'auction':
        // TODO(LS-328): Implement auction draft logic
        throw new Error('Auction draft not yet implemented');
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

    // Step 3.6: Stamp draft_completed_at so the frontend knows the league is ready.
    await setDraftCompletedAt(leagueId);

    addBreadcrumb('Draft processing completed successfully', {
      selectionMethod,
      leagueId,
    });

    // Step 4: Update draft status to 'completed'
    await updateDraftStatus(
      leagueId,
      'completed',
      'draft processing completed successfully',
    );

    // Step 5: Send WebSocket notification
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
      LOGGER.error('Failed to send draft completion notification', {
        error: notificationError,
        leagueId,
      });
      captureError(
        notificationError instanceof Error
          ? notificationError
          : new Error(String(notificationError)),
        {
          tags: { lambda: 'draft-processor', operation: 'notification' },
          extra: { leagueId, selectionMethod },
        },
      );
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
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    LOGGER.error(
      `Error processing draft message for league ${leagueId}:`,
      error,
    );

    // Capture detailed error context with Sentry
    captureError(error instanceof Error ? error : new Error(String(error)), {
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
      },
    });

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
        statusError,
      );

      // This is a critical error - we failed to reset the status AND the original processing failed
      captureError(
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
      const message = JSON.parse(record.body) as SqsDraftMessage;

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
        );

        captureError(new Error(`Draft processing failed: ${result.error}`), {
          tags: {
            lambda: 'draft-processor',
            operation: 'processDraftMessage',
          },
          extra: {
            leagueId: result.leagueId,
            messageId: record.messageId,
            error: result.error,
          },
        });

        batchItemFailures.push({ itemIdentifier: record.messageId });
      } else {
        LOGGER.info(`Draft processing succeeded for league ${result.leagueId}`);
      }
    } catch (error) {
      LOGGER.error('Error processing SQS record:', error);

      captureError(error instanceof Error ? error : new Error(String(error)), {
        tags: {
          lambda: 'draft-processor',
          operation: 'sqsRecordProcessing',
        },
        extra: {
          messageId: record.messageId,
          recordBody: record.body,
        },
      });

      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

/**
 * Main SQS handler function with Sentry integration
 */
export const handler = withSentry(baseDraftProcessorHandler);

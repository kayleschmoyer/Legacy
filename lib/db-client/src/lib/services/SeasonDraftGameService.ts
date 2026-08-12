import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
import { randomBytes } from 'crypto';
import * as PublicSchema from '../../drizzle/public/schema';
import type { PublicDb } from '../client/PublicDbClient';

/**
 * Season Draft Game Service
 *
 * Business logic for the Season Draft Game, a turn-based drafting game where
 * players select baseball player + season (or career-with-team) combinations
 * to fill roster positions.
 *
 * Supports:
 * - Configurable stat key (HR, H, RBI, SB, etc. for hitters; W, SO, SV, etc. for pitchers)
 * - Three game modes: season (player+year), career_team (player+team career total),
 *   or most_teams (COUNT(DISTINCT team))
 * - Hitter or pitcher drafts with different roster layouts
 */

/**
 * Hard cap on participants per Season Draft Game. Enforced both by
 * `createGame` validation and by the lobby/join displays that show
 * "X / 6 joined" seat strips. The `season_draft_games.numPlayers`
 * column tracks the current joined count and is mutated as players
 * join — it does NOT represent the cap.
 */
export const SEASON_DRAFT_MAX_PLAYERS = 6;

/**
 * Stable error codes for join-game failures. Surfaced to GraphQL clients via
 * `extensions.code` so they can render localized messages without parsing
 * the human-readable error string.
 */
export type SeasonDraftJoinErrorCode =
  | 'SEASON_DRAFT_GAME_ALREADY_STARTED'
  | 'SEASON_DRAFT_GAME_FULL';

export class SeasonDraftJoinError extends Error {
  readonly code: SeasonDraftJoinErrorCode;
  constructor(code: SeasonDraftJoinErrorCode, message: string) {
    super(message);
    this.name = 'SeasonDraftJoinError';
    this.code = code;
  }
}

/** Valid stat keys for hitter drafts */
export const HITTER_STAT_KEYS = [
  'hr',
  'h',
  'rbi',
  'sb',
  'r',
  'doubles',
  'triples',
  'bb',
  'tb',
] as const;

/** Valid stat keys for pitcher drafts */
export const PITCHER_STAT_KEYS = ['w', 'so', 'sv', 'sho', 'cg'] as const;

export type HitterStatKey = (typeof HITTER_STAT_KEYS)[number];
export type PitcherStatKey = (typeof PITCHER_STAT_KEYS)[number];
export type StatKey = HitterStatKey | PitcherStatKey;
export type PlayerType = 'hitter' | 'pitcher';
export type GameMode = 'season' | 'career_team' | 'most_teams';
export type Sport = 'baseball' | 'football';

export interface CreateSeasonDraftGameParams {
  name: string;
  createdBy: number;
  numPlayers: number;
  playerNames: string[];
  userIds: number[];
  statKey?: string; // defaults to 'hr'
  gameMode?: GameMode; // defaults to 'season'
  playerType?: PlayerType; // defaults to 'hitter'
  sport?: Sport; // defaults to 'baseball'
}

export interface MakePickParams {
  gameId: number;
  userId: number;
  playerId: number;
  season: number;
  position: string; // The position to score from
  rosterSlotId: number;
  team?: string; // Required for career_team mode
}

export interface GameState {
  id: number;
  name: string;
  status: string;
  currentTurn: number;
  createdBy: number;
  statKey: string;
  gameMode: string;
  playerType: string;
  sport: Sport;
  inviteCode: string | null;
  pickDeadlineSeconds: number;
  currentPickDeadline: string | null;
  players: {
    id: number;
    userId: number;
    playerName: string;
    draftOrder: number;
    totalScore: number;
    roster: {
      slotId: number;
      position: string;
      slotNumber: number;
      isFilled: boolean;
      pick?: {
        playerName: string;
        season: number;
        statValue: number;
        team?: string;
      };
    }[];
  }[];
  picks: {
    pickNumber: number;
    playerName: string;
    draftingUser: string;
    baseballPlayerName: string;
    season: number;
    position: string;
    statValue: number;
    team?: string;
    pickedAt: string;
  }[];
}

export class SeasonDraftGameService {
  /**
   * Create a new Season Draft Game
   */
  static async createGame(
    db: PublicDb,
    params: CreateSeasonDraftGameParams,
  ): Promise<number> {
    if (params.numPlayers < 1 || params.numPlayers > SEASON_DRAFT_MAX_PLAYERS) {
      throw new Error(
        `Number of players must be between 1 and ${SEASON_DRAFT_MAX_PLAYERS}`,
      );
    }

    if (params.playerNames.length !== params.numPlayers) {
      throw new Error('Player names count must match num players');
    }

    if (params.userIds.length !== params.numPlayers) {
      throw new Error('User IDs count must match num players');
    }

    const playerType: PlayerType = params.playerType ?? 'hitter';
    const gameMode: GameMode = params.gameMode ?? 'season';
    const sport: Sport = params.sport ?? 'baseball';

    // For most_teams mode, statKey is a derived stat — auto-set to 'teams_played'
    const statKey =
      gameMode === 'most_teams' ? 'teams_played' : (params.statKey ?? 'hr');

    // Validate stat key matches player type (skip for most_teams — derived stat)
    if (gameMode !== 'most_teams') {
      if (
        playerType === 'hitter' &&
        !HITTER_STAT_KEYS.includes(statKey as HitterStatKey)
      ) {
        throw new Error(
          `Invalid stat key '${statKey}' for hitter draft. Valid: ${HITTER_STAT_KEYS.join(', ')}`,
        );
      }
      if (
        playerType === 'pitcher' &&
        !PITCHER_STAT_KEYS.includes(statKey as PitcherStatKey)
      ) {
        throw new Error(
          `Invalid stat key '${statKey}' for pitcher draft. Valid: ${PITCHER_STAT_KEYS.join(', ')}`,
        );
      }
    }

    const inviteCode = randomBytes(6).toString('hex');

    // Create game
    const [game] = await db
      .insert(PublicSchema.seasonDraftGames)
      .values({
        name: params.name,
        createdBy: params.createdBy,
        numPlayers: params.numPlayers,
        status: 'setup',
        currentTurn: 0,
        statKey,
        gameMode,
        playerType,
        sport,
        inviteCode,
      })
      .returning();

    LOGGER.info(
      `Created Season Draft Game ${game.id}: ${params.name} (${sport}/${playerType}/${statKey}/${gameMode})`,
    );

    // Define roster positions based on player type
    const positions =
      playerType === 'pitcher'
        ? // Pitcher draft: 9 generic P slots
          Array.from({ length: 9 }, (_, i) => ({
            position: 'P',
            slotNumber: i,
          }))
        : // Hitter draft: standard positions
          [
            { position: '1B', slotNumber: 0 },
            { position: '2B', slotNumber: 0 },
            { position: '3B', slotNumber: 0 },
            { position: 'SS', slotNumber: 0 },
            { position: 'OF', slotNumber: 0 },
            { position: 'OF', slotNumber: 1 },
            { position: 'OF', slotNumber: 2 },
            { position: 'C', slotNumber: 0 },
            { position: 'UT', slotNumber: 0 },
          ];

    for (let i = 0; i < params.numPlayers; i++) {
      const [player] = await db
        .insert(PublicSchema.seasonDraftPlayers)
        .values({
          gameId: game.id,
          userId: params.userIds[i],
          playerName: params.playerNames[i],
          draftOrder: i,
          totalScore: 0,
        })
        .returning();

      // Create roster slots for this player
      for (const pos of positions) {
        await db.insert(PublicSchema.seasonDraftRosterSlots).values({
          seasonDraftPlayerId: player.id,
          position: pos.position,
          slotNumber: pos.slotNumber,
          isFilled: false,
        });
      }

      LOGGER.info(
        `Created player ${player.playerName} (order ${i}) with 9 roster slots`,
      );
    }

    return game.id;
  }

  /**
   * Start the game (move from setup to drafting).
   * Syncs numPlayers from actual joined player count and requires >= 2.
   */
  static async startGame(db: PublicDb, gameId: number): Promise<void> {
    const players = await db
      .select({ id: PublicSchema.seasonDraftPlayers.id })
      .from(PublicSchema.seasonDraftPlayers)
      .where(eq(PublicSchema.seasonDraftPlayers.gameId, gameId));

    if (players.length < 2) {
      throw new Error('At least 2 players must join before starting the draft');
    }

    const [game] = await db
      .select({
        pickDeadlineSeconds: PublicSchema.seasonDraftGames.pickDeadlineSeconds,
      })
      .from(PublicSchema.seasonDraftGames)
      .where(eq(PublicSchema.seasonDraftGames.id, gameId))
      .limit(1);

    const deadlineSeconds = game?.pickDeadlineSeconds ?? 60;
    const deadline = new Date(
      Date.now() + deadlineSeconds * 1000,
    ).toISOString();

    await db
      .update(PublicSchema.seasonDraftGames)
      .set({
        status: 'drafting',
        numPlayers: players.length,
        startedAt: new Date().toISOString(),
        currentPickDeadline: deadline,
      })
      .where(eq(PublicSchema.seasonDraftGames.id, gameId));

    LOGGER.info(`Started Season Draft Game ${gameId}`);
  }

  /**
   * Join a game via invite code.
   * Adds the user as a new player with roster slots.
   */
  static async joinGameByInviteCode(
    db: PublicDb,
    inviteCode: string,
    userId: number,
    playerName: string,
  ): Promise<number> {
    const [game] = await db
      .select()
      .from(PublicSchema.seasonDraftGames)
      .where(eq(PublicSchema.seasonDraftGames.inviteCode, inviteCode))
      .limit(1);

    if (!game) {
      throw new Error('Invalid invite code');
    }

    if (game.status !== 'setup') {
      throw new SeasonDraftJoinError(
        'SEASON_DRAFT_GAME_ALREADY_STARTED',
        'This game has already started or been cancelled',
      );
    }

    const existingPlayers = await db
      .select({ id: PublicSchema.seasonDraftPlayers.id })
      .from(PublicSchema.seasonDraftPlayers)
      .where(eq(PublicSchema.seasonDraftPlayers.gameId, game.id));

    if (existingPlayers.length >= SEASON_DRAFT_MAX_PLAYERS) {
      throw new SeasonDraftJoinError(
        'SEASON_DRAFT_GAME_FULL',
        `This game is already full (maximum ${SEASON_DRAFT_MAX_PLAYERS} players)`,
      );
    }

    const alreadyJoined = await db
      .select({ id: PublicSchema.seasonDraftPlayers.id })
      .from(PublicSchema.seasonDraftPlayers)
      .where(
        and(
          eq(PublicSchema.seasonDraftPlayers.gameId, game.id),
          eq(PublicSchema.seasonDraftPlayers.userId, userId),
        ),
      )
      .limit(1);

    if (alreadyJoined.length > 0) {
      return game.id;
    }

    const draftOrder = existingPlayers.length;

    const positions =
      game.playerType === 'pitcher'
        ? Array.from({ length: 9 }, (_, i) => ({
            position: 'P',
            slotNumber: i,
          }))
        : [
            { position: '1B', slotNumber: 0 },
            { position: '2B', slotNumber: 0 },
            { position: '3B', slotNumber: 0 },
            { position: 'SS', slotNumber: 0 },
            { position: 'OF', slotNumber: 0 },
            { position: 'OF', slotNumber: 1 },
            { position: 'OF', slotNumber: 2 },
            { position: 'C', slotNumber: 0 },
            { position: 'UT', slotNumber: 0 },
          ];

    const [player] = await db
      .insert(PublicSchema.seasonDraftPlayers)
      .values({
        gameId: game.id,
        userId,
        playerName,
        draftOrder,
        totalScore: 0,
      })
      .returning();

    for (const pos of positions) {
      await db.insert(PublicSchema.seasonDraftRosterSlots).values({
        seasonDraftPlayerId: player.id,
        position: pos.position,
        slotNumber: pos.slotNumber,
        isFilled: false,
      });
    }

    await db
      .update(PublicSchema.seasonDraftGames)
      .set({ numPlayers: existingPlayers.length + 1 })
      .where(eq(PublicSchema.seasonDraftGames.id, game.id));

    LOGGER.info(
      `User ${userId} joined Season Draft Game ${game.id} via invite code`,
    );

    return game.id;
  }

  /**
   * Get basic game info by invite code (for the join page preview).
   */
  static async getGameByInviteCode(
    db: PublicDb,
    inviteCode: string,
  ): Promise<{
    id: number;
    name: string;
    status: string;
    statKey: string;
    gameMode: string;
    playerType: string;
    sport: Sport;
    playerCount: number;
    maxPlayers: number;
    creatorName: string;
    players: Array<{ id: number; playerName: string }>;
  } | null> {
    const [game] = await db
      .select()
      .from(PublicSchema.seasonDraftGames)
      .where(eq(PublicSchema.seasonDraftGames.inviteCode, inviteCode))
      .limit(1);

    if (!game) return null;

    const joinedPlayers = await db
      .select({
        id: PublicSchema.seasonDraftPlayers.id,
        playerName: PublicSchema.seasonDraftPlayers.playerName,
        userId: PublicSchema.seasonDraftPlayers.userId,
        draftOrder: PublicSchema.seasonDraftPlayers.draftOrder,
      })
      .from(PublicSchema.seasonDraftPlayers)
      .where(eq(PublicSchema.seasonDraftPlayers.gameId, game.id))
      .orderBy(PublicSchema.seasonDraftPlayers.draftOrder);

    const creator = joinedPlayers.find((p) => p.userId === game.createdBy);

    return {
      id: game.id,
      name: game.name,
      status: game.status,
      statKey: game.statKey,
      gameMode: game.gameMode,
      playerType: game.playerType,
      sport: game.sport,
      playerCount: joinedPlayers.length,
      maxPlayers: SEASON_DRAFT_MAX_PLAYERS,
      creatorName: creator?.playerName ?? joinedPlayers[0]?.playerName ?? '',
      players: joinedPlayers.map((p) => ({
        id: p.id,
        playerName: p.playerName,
      })),
    };
  }

  /**
   * Get current game state with all players, rosters, and picks
   */
  static async getGameState(
    db: PublicDb,
    gameId: number,
  ): Promise<GameState | null> {
    // Get game
    const [game] = await db
      .select()
      .from(PublicSchema.seasonDraftGames)
      .where(eq(PublicSchema.seasonDraftGames.id, gameId))
      .limit(1);

    if (!game) {
      return null;
    }

    // Get players
    const players = await db
      .select()
      .from(PublicSchema.seasonDraftPlayers)
      .where(eq(PublicSchema.seasonDraftPlayers.gameId, gameId))
      .orderBy(PublicSchema.seasonDraftPlayers.draftOrder);

    // Get all roster slots and picks
    const playersWithRosters = await Promise.all(
      players.map(
        async (player: typeof PublicSchema.seasonDraftPlayers.$inferSelect) => {
          const rosterSlots = await db
            .select()
            .from(PublicSchema.seasonDraftRosterSlots)
            .where(
              eq(
                PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId,
                player.id,
              ),
            )
            .orderBy(PublicSchema.seasonDraftRosterSlots.position);

          const roster = await Promise.all(
            rosterSlots.map(
              async (
                slot: typeof PublicSchema.seasonDraftRosterSlots.$inferSelect,
              ) => {
                const [pick] = await db
                  .select({
                    playerFirstName: PublicSchema.players.firstName,
                    playerLastName: PublicSchema.players.lastName,
                    season: PublicSchema.seasonDraftPicks.season,
                    statValue: PublicSchema.seasonDraftPicks.statValue,
                    team: PublicSchema.seasonDraftPicks.team,
                  })
                  .from(PublicSchema.seasonDraftPicks)
                  .innerJoin(
                    PublicSchema.players,
                    eq(
                      PublicSchema.seasonDraftPicks.playerId,
                      PublicSchema.players.id,
                    ),
                  )
                  .where(
                    eq(PublicSchema.seasonDraftPicks.rosterSlotId, slot.id),
                  )
                  .limit(1);

                return {
                  slotId: slot.id,
                  position: slot.position,
                  slotNumber: slot.slotNumber,
                  isFilled: slot.isFilled,
                  pick: pick
                    ? {
                        playerName: `${pick.playerFirstName} ${pick.playerLastName}`,
                        season: pick.season,
                        statValue: pick.statValue,
                        team: pick.team ?? undefined,
                      }
                    : undefined,
                };
              },
            ),
          );

          return {
            id: player.id,
            userId: player.userId,
            playerName: player.playerName,
            draftOrder: player.draftOrder,
            totalScore: player.totalScore,
            roster,
          };
        },
      ),
    );

    // Get all picks in order
    const picks = await db
      .select({
        pickNumber: PublicSchema.seasonDraftPicks.pickNumber,
        playerName: PublicSchema.seasonDraftPlayers.playerName,
        baseballPlayerFirstName: PublicSchema.players.firstName,
        baseballPlayerLastName: PublicSchema.players.lastName,
        season: PublicSchema.seasonDraftPicks.season,
        position: PublicSchema.seasonDraftPicks.position,
        statValue: PublicSchema.seasonDraftPicks.statValue,
        team: PublicSchema.seasonDraftPicks.team,
        pickedAt: PublicSchema.seasonDraftPicks.pickedAt,
      })
      .from(PublicSchema.seasonDraftPicks)
      .innerJoin(
        PublicSchema.seasonDraftPlayers,
        eq(
          PublicSchema.seasonDraftPicks.seasonDraftPlayerId,
          PublicSchema.seasonDraftPlayers.id,
        ),
      )
      .innerJoin(
        PublicSchema.players,
        eq(PublicSchema.seasonDraftPicks.playerId, PublicSchema.players.id),
      )
      .where(eq(PublicSchema.seasonDraftPicks.gameId, gameId))
      .orderBy(PublicSchema.seasonDraftPicks.pickNumber);

    return {
      id: game.id,
      name: game.name,
      status: game.status,
      currentTurn: game.currentTurn,
      createdBy: game.createdBy,
      statKey: game.statKey,
      gameMode: game.gameMode,
      playerType: game.playerType,
      sport: game.sport,
      inviteCode: game.inviteCode ?? null,
      pickDeadlineSeconds: game.pickDeadlineSeconds,
      currentPickDeadline:
        game.status === 'drafting' ? (game.currentPickDeadline ?? null) : null,
      players: playersWithRosters,
      picks: picks.map((p) => ({
        pickNumber: p.pickNumber,
        playerName: p.playerName,
        draftingUser: p.playerName,
        baseballPlayerName: `${p.baseballPlayerFirstName} ${p.baseballPlayerLastName}`,
        season: p.season,
        position: p.position,
        statValue: p.statValue,
        team: p.team ?? undefined,
        pickedAt: p.pickedAt,
      })),
    };
  }

  /**
   * Get stat value for a player in a specific season at a specific position.
   *
   * Supports:
   * - Multiple hitter stats (hr, h, rbi, sb, r, doubles, triples, bb, tb)
   * - Multiple pitcher stats (w, so, sv, sho, cg)
   * - Season mode (specific year) and career_team mode (aggregated by team)
   */
  static async getStatValueForPlayerSeasonPosition(
    db: PublicDb,
    playerId: number,
    season: number,
    position: string,
    statKey = 'hr',
    playerType: PlayerType = 'hitter',
    gameMode: GameMode = 'season',
    team?: string,
  ): Promise<number> {
    // most_teams mode: COUNT(DISTINCT team) — no position eligibility check
    if (gameMode === 'most_teams') {
      return this.getMostTeamsStatValue(db, playerId, playerType);
    }

    if (playerType === 'pitcher') {
      return this.getPitcherStatValue(
        db,
        playerId,
        season,
        statKey,
        gameMode,
        team,
      );
    }

    return this.getHitterStatValue(
      db,
      playerId,
      season,
      position,
      statKey,
      gameMode,
      team,
    );
  }

  /**
   * Get the number of distinct teams a player played for (most_teams mode)
   */
  private static async getMostTeamsStatValue(
    db: PublicDb,
    playerId: number,
    playerType: PlayerType,
  ): Promise<number> {
    const table =
      playerType === 'pitcher'
        ? PublicSchema.seasonPitching
        : PublicSchema.seasonBatting;

    const result = await db
      .select({
        stat_value: sql<number>`COUNT(DISTINCT ${table.team})::int`,
      })
      .from(table)
      .where(eq(table.playerId, playerId));

    return result[0]?.stat_value ?? 0;
  }

  /**
   * Get stat value for a hitter - checks position eligibility first
   */
  private static async getHitterStatValue(
    db: PublicDb,
    playerId: number,
    season: number,
    position: string,
    statKey: string,
    gameMode: GameMode,
    team?: string,
  ): Promise<number> {
    if (gameMode === 'career_team') {
      if (!team) {
        throw new Error('Team is required for career_team mode');
      }

      // For career_team mode, check career position eligibility across any season with that team
      const fieldingStats = await db
        .select({ pos: PublicSchema.seasonFielding.pos })
        .from(PublicSchema.seasonFielding)
        .where(
          and(
            eq(PublicSchema.seasonFielding.playerId, playerId),
            eq(PublicSchema.seasonFielding.team, team),
          ),
        );

      const hasPositionEligibility = this.checkPositionEligibility(
        fieldingStats,
        position,
      );
      if (!hasPositionEligibility) return 0;

      // Sum stat across all seasons with that team
      const result = await db.execute(
        sql`SELECT COALESCE(SUM(${sql.raw(statKey)}), 0)::int AS stat_value
            FROM season_batting
            WHERE player_id = ${playerId} AND team = ${team}`,
      );
      return (
        (result as unknown as Array<{ stat_value: number }>)[0]?.stat_value ?? 0
      );
    }

    // Season mode: check position eligibility for this specific season
    const fieldingStats = await db
      .select({ pos: PublicSchema.seasonFielding.pos })
      .from(PublicSchema.seasonFielding)
      .where(
        and(
          eq(PublicSchema.seasonFielding.playerId, playerId),
          eq(PublicSchema.seasonFielding.season, season),
        ),
      );

    const hasPositionEligibility = this.checkPositionEligibility(
      fieldingStats,
      position,
    );
    if (!hasPositionEligibility) return 0;

    // Get stat from season batting
    const result = await db.execute(
      sql`SELECT COALESCE(SUM(${sql.raw(statKey)}), 0)::int AS stat_value
          FROM season_batting
          WHERE player_id = ${playerId} AND season = ${season}`,
    );
    return (
      (result as unknown as Array<{ stat_value: number }>)[0]?.stat_value ?? 0
    );
  }

  /**
   * Get stat value for a pitcher
   * Pitchers use P position, no complex position eligibility needed
   */
  private static async getPitcherStatValue(
    db: PublicDb,
    playerId: number,
    season: number,
    statKey: string,
    gameMode: GameMode,
    team?: string,
  ): Promise<number> {
    if (gameMode === 'career_team') {
      if (!team) {
        throw new Error('Team is required for career_team mode');
      }

      // For IP, we need special handling since it's a double
      const ipCast = statKey === 'ip' ? '::int' : '::int';

      const result = await db.execute(
        sql`SELECT COALESCE(SUM(${sql.raw(statKey)})${sql.raw(ipCast)}, 0) AS stat_value
            FROM season_pitching
            WHERE player_id = ${playerId} AND team = ${team}`,
      );
      return (
        (result as unknown as Array<{ stat_value: number }>)[0]?.stat_value ?? 0
      );
    }

    // Season mode
    const result = await db.execute(
      sql`SELECT COALESCE(SUM(${sql.raw(statKey)}), 0)::int AS stat_value
          FROM season_pitching
          WHERE player_id = ${playerId} AND season = ${season}`,
    );
    return (
      (result as unknown as Array<{ stat_value: number }>)[0]?.stat_value ?? 0
    );
  }

  /**
   * Check if a player has eligibility for a given position
   */
  private static checkPositionEligibility(
    fieldingStats: Array<{ pos: string | null }>,
    position: string,
  ): boolean {
    return fieldingStats.some((stat) => {
      const statPos = stat.pos?.trim();
      if (position === 'OF') {
        return (
          statPos === 'OF' ||
          statPos === 'LF' ||
          statPos === 'CF' ||
          statPos === 'RF'
        );
      }
      if (position === 'UT') {
        return true;
      }
      return statPos === position;
    });
  }

  /**
   * Get available draft options for a player (teams or seasons with stats).
   *
   * Returns distinct teams (career_team mode, sorted alphabetically) or
   * seasons (season mode, sorted descending — most recent first) that
   * the player has batting or pitching stats recorded for.
   * Used to power the team/season picker in the draft UI instead of requiring
   * the user to type a team abbreviation or year from memory.
   */
  static async getPlayerDraftOptions(
    db: PublicDb,
    playerId: number,
    gameMode: GameMode,
    playerType: PlayerType,
  ): Promise<string[]> {
    // most_teams mode: no team/season selection needed
    if (gameMode === 'most_teams') {
      return [];
    }

    if (gameMode === 'career_team') {
      const table =
        playerType === 'pitcher'
          ? PublicSchema.seasonPitching
          : PublicSchema.seasonBatting;

      const rows = await db
        .selectDistinct({ team: table.team })
        .from(table)
        .where(eq(table.playerId, playerId))
        .orderBy(table.team);

      return rows.map((r) => r.team).filter(Boolean);
    }

    // Season mode — return distinct years as strings, most recent first
    const table =
      playerType === 'pitcher'
        ? PublicSchema.seasonPitching
        : PublicSchema.seasonBatting;

    const rows = await db
      .selectDistinct({ season: table.season })
      .from(table)
      .where(eq(table.playerId, playerId))
      .orderBy(desc(table.season));

    return rows.map((r) => String(r.season));
  }

  /**
   * Check if a player has stats loaded (statsLastFetchedAt is not null)
   */
  static async checkPlayerHasStats(
    db: PublicDb,
    playerId: number,
  ): Promise<boolean> {
    const [player] = await db
      .select({ statsLastFetchedAt: PublicSchema.players.statsLastFetchedAt })
      .from(PublicSchema.players)
      .where(eq(PublicSchema.players.id, playerId))
      .limit(1);

    return player?.statsLastFetchedAt != null;
  }

  /**
   * Get a player's brefId for stat loading
   */
  static async getPlayerBrefId(
    db: PublicDb,
    playerId: number,
  ): Promise<string | null> {
    const [player] = await db
      .select({ brefId: PublicSchema.players.brefId })
      .from(PublicSchema.players)
      .where(eq(PublicSchema.players.id, playerId))
      .limit(1);

    return player?.brefId ?? null;
  }

  /**
   * Cancel a game (only the creator can cancel, and only in setup or drafting)
   */
  static async cancelGame(
    db: PublicDb,
    gameId: number,
    userId: number,
  ): Promise<void> {
    const [game] = await db
      .select()
      .from(PublicSchema.seasonDraftGames)
      .where(eq(PublicSchema.seasonDraftGames.id, gameId))
      .limit(1);

    if (!game) {
      throw new Error('Game not found');
    }

    if (game.createdBy !== userId) {
      throw new Error('Only the game creator can cancel the game');
    }

    if (game.status !== 'setup' && game.status !== 'drafting') {
      throw new Error('Game can only be cancelled in setup or drafting phase');
    }

    await db
      .update(PublicSchema.seasonDraftGames)
      .set({ status: 'cancelled' })
      .where(eq(PublicSchema.seasonDraftGames.id, gameId));

    LOGGER.info(`Cancelled Season Draft Game ${gameId} by user ${userId}`);
  }

  /**
   * Make a draft pick
   */
  static async makePick(db: PublicDb, params: MakePickParams): Promise<void> {
    // Get game and validate turn
    const [game] = await db
      .select()
      .from(PublicSchema.seasonDraftGames)
      .where(eq(PublicSchema.seasonDraftGames.id, params.gameId))
      .limit(1);

    if (!game) {
      throw new Error('Game not found');
    }

    if (game.status !== 'drafting') {
      throw new Error('Game is not in drafting phase');
    }

    // Get current player
    const [currentPlayer] = await db
      .select()
      .from(PublicSchema.seasonDraftPlayers)
      .where(
        and(
          eq(PublicSchema.seasonDraftPlayers.gameId, params.gameId),
          eq(PublicSchema.seasonDraftPlayers.draftOrder, game.currentTurn),
        ),
      )
      .limit(1);

    if (!currentPlayer) {
      throw new Error('Current player not found');
    }

    if (currentPlayer.userId !== params.userId) {
      throw new Error('Not your turn');
    }

    // Verify roster slot belongs to this player and is not filled
    const [rosterSlot] = await db
      .select()
      .from(PublicSchema.seasonDraftRosterSlots)
      .where(eq(PublicSchema.seasonDraftRosterSlots.id, params.rosterSlotId))
      .limit(1);

    if (!rosterSlot) {
      throw new Error('Roster slot not found');
    }

    if (rosterSlot.seasonDraftPlayerId !== currentPlayer.id) {
      throw new Error('Roster slot does not belong to you');
    }

    if (rosterSlot.isFilled) {
      throw new Error('Roster slot is already filled');
    }

    // Check for duplicate picks in this game
    // most_teams: same player can't be drafted twice
    // career_team: same player+team can't be drafted twice
    // season: same player+season can't be drafted twice
    const duplicateConditions = [
      eq(PublicSchema.seasonDraftPicks.gameId, params.gameId),
      eq(PublicSchema.seasonDraftPicks.playerId, params.playerId),
    ];

    if (game.gameMode === 'career_team') {
      duplicateConditions.push(
        eq(PublicSchema.seasonDraftPicks.team, params.team ?? ''),
      );
    } else if (game.gameMode !== 'most_teams') {
      // season mode
      duplicateConditions.push(
        eq(PublicSchema.seasonDraftPicks.season, params.season),
      );
    }
    // most_teams: only check gameId + playerId (no additional condition)

    const existingPicks = await db
      .select({ id: PublicSchema.seasonDraftPicks.id })
      .from(PublicSchema.seasonDraftPicks)
      .where(and(...duplicateConditions))
      .limit(1);

    if (existingPicks.length > 0) {
      const messages: Record<string, string> = {
        career_team:
          'This player + team combination has already been drafted in this game',
        most_teams: 'This player has already been drafted in this game',
        season:
          'This player + season combination has already been drafted in this game',
      };
      throw new Error(messages[game.gameMode] ?? messages.season);
    }

    // Get stat value for this player/season/position using game config
    const statValue = await this.getStatValueForPlayerSeasonPosition(
      db,
      params.playerId,
      params.season,
      params.position,
      game.statKey,
      game.playerType,
      game.gameMode,
      params.team,
    );

    // Get pick number
    const pickCount = await db
      .select()
      .from(PublicSchema.seasonDraftPicks)
      .where(eq(PublicSchema.seasonDraftPicks.gameId, params.gameId));

    const pickNumber = pickCount.length;

    // Create pick
    await db.insert(PublicSchema.seasonDraftPicks).values({
      gameId: params.gameId,
      seasonDraftPlayerId: currentPlayer.id,
      rosterSlotId: params.rosterSlotId,
      playerId: params.playerId,
      season: params.season,
      position: params.position,
      team: params.team ?? null,
      statValue,
      pickNumber,
    });

    // Mark roster slot as filled
    await db
      .update(PublicSchema.seasonDraftRosterSlots)
      .set({ isFilled: true })
      .where(eq(PublicSchema.seasonDraftRosterSlots.id, params.rosterSlotId));

    // Update player's total score
    await db
      .update(PublicSchema.seasonDraftPlayers)
      .set({
        totalScore: currentPlayer.totalScore + statValue,
      })
      .where(eq(PublicSchema.seasonDraftPlayers.id, currentPlayer.id));

    // Advance to next turn and set new pick deadline
    const nextTurn = (game.currentTurn + 1) % game.numPlayers;
    const nextDeadline = new Date(
      Date.now() + game.pickDeadlineSeconds * 1000,
    ).toISOString();
    await db
      .update(PublicSchema.seasonDraftGames)
      .set({ currentTurn: nextTurn, currentPickDeadline: nextDeadline })
      .where(eq(PublicSchema.seasonDraftGames.id, params.gameId));

    // Check if game is complete (all roster slots filled — including any
    // slots forfeited via deadline expiry, which have isFilled=true but no
    // pick row).
    await this.completeGameIfAllSlotsFilled(db, params.gameId);

    LOGGER.info(
      `Pick made in game ${params.gameId}: Player ${params.playerId}, Season ${params.season}, Position ${params.position}, Stat Value: ${statValue}`,
    );
  }

  /**
   * Process an expired pick deadline.
   *
   * Penalty for running out of time: the current player forfeits one roster
   * slot. The first unfilled slot is marked filled with no pick row (so it
   * scores 0 and renders as "Empty"), the turn advances to the next player,
   * and the deadline is reset. Idempotent — safe to call from any client as
   * a nudge whenever a countdown hits zero; only acts if the deadline is
   * actually in the past.
   *
   * Returns true if a forfeit was applied, false if the deadline is not
   * expired or the game is not in the drafting phase.
   */
  static async processExpiredPick(
    db: PublicDb,
    gameId: number,
  ): Promise<boolean> {
    const applied = await db.transaction(async (tx) => {
      // Lock the game row to serialize concurrent nudges from multiple
      // clients — without this, two countdown-zero firings could both advance
      // the turn.
      const gameRows = await tx.execute(
        sql`SELECT id, status, current_turn, num_players, pick_deadline_seconds, current_pick_deadline
            FROM season_draft_games WHERE id = ${gameId} FOR UPDATE`,
      );
      const game = (
        gameRows as unknown as Array<{
          id: number;
          status: string;
          current_turn: number;
          num_players: number;
          pick_deadline_seconds: number;
          current_pick_deadline: Date | string | null;
        }>
      )[0];

      if (!game || game.status !== 'drafting') return false;
      if (!game.current_pick_deadline) return false;
      const deadlineMs = new Date(game.current_pick_deadline).getTime();
      if (deadlineMs > Date.now()) return false;

      // Current player whose deadline expired.
      const [currentPlayer] = await tx
        .select()
        .from(PublicSchema.seasonDraftPlayers)
        .where(
          and(
            eq(PublicSchema.seasonDraftPlayers.gameId, gameId),
            eq(PublicSchema.seasonDraftPlayers.draftOrder, game.current_turn),
          ),
        )
        .limit(1);

      if (currentPlayer) {
        const [firstUnfilled] = await tx
          .select()
          .from(PublicSchema.seasonDraftRosterSlots)
          .where(
            and(
              eq(
                PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId,
                currentPlayer.id,
              ),
              eq(PublicSchema.seasonDraftRosterSlots.isFilled, false),
            ),
          )
          .orderBy(PublicSchema.seasonDraftRosterSlots.id)
          .limit(1);

        if (firstUnfilled) {
          await tx
            .update(PublicSchema.seasonDraftRosterSlots)
            .set({ isFilled: true })
            .where(
              eq(PublicSchema.seasonDraftRosterSlots.id, firstUnfilled.id),
            );
        }
      }

      const nextTurn = (game.current_turn + 1) % game.num_players;
      const nextDeadline = new Date(
        Date.now() + game.pick_deadline_seconds * 1000,
      ).toISOString();
      await tx
        .update(PublicSchema.seasonDraftGames)
        .set({ currentTurn: nextTurn, currentPickDeadline: nextDeadline })
        .where(eq(PublicSchema.seasonDraftGames.id, gameId));

      return true;
    });

    if (applied) {
      LOGGER.info(
        `Season Draft Game ${gameId}: pick deadline expired, slot forfeited`,
      );
      await this.completeGameIfAllSlotsFilled(db, gameId);
    }

    return applied;
  }

  /**
   * Mark the game completed if every roster slot is filled. Filled slots
   * include both real picks and slots forfeited via deadline expiry.
   */
  private static async completeGameIfAllSlotsFilled(
    db: PublicDb,
    gameId: number,
  ): Promise<void> {
    const [unfilled] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(PublicSchema.seasonDraftRosterSlots)
      .innerJoin(
        PublicSchema.seasonDraftPlayers,
        eq(
          PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId,
          PublicSchema.seasonDraftPlayers.id,
        ),
      )
      .where(
        and(
          eq(PublicSchema.seasonDraftPlayers.gameId, gameId),
          eq(PublicSchema.seasonDraftRosterSlots.isFilled, false),
        ),
      );

    if ((unfilled?.count ?? 0) === 0) {
      await db
        .update(PublicSchema.seasonDraftGames)
        .set({
          status: 'completed',
          completedAt: new Date().toISOString(),
          currentPickDeadline: null,
        })
        .where(eq(PublicSchema.seasonDraftGames.id, gameId));

      LOGGER.info(`Season Draft Game ${gameId} completed`);
    }
  }

  /**
   * Get games for a user
   */
  static async getGamesForUser(
    db: PublicDb,
    userId: number,
  ): Promise<
    Array<{
      id: number;
      name: string;
      status: string;
      statKey: string;
      gameMode: string;
      playerType: string;
      sport: Sport;
      isMyTurn: boolean;
      inviteCode: string | null;
      playerCount: number;
      maxPlayers: number;
      picksMade: number;
      totalPicks: number;
      winnerName: string | null;
      myPlayerId: number | null;
      players: Array<{ id: number; playerName: string }>;
    }>
  > {
    const games = await db
      .select({
        gameId: PublicSchema.seasonDraftGames.id,
        gameName: PublicSchema.seasonDraftGames.name,
        gameStatus: PublicSchema.seasonDraftGames.status,
        statKey: PublicSchema.seasonDraftGames.statKey,
        gameMode: PublicSchema.seasonDraftGames.gameMode,
        playerType: PublicSchema.seasonDraftGames.playerType,
        sport: PublicSchema.seasonDraftGames.sport,
        currentTurn: PublicSchema.seasonDraftGames.currentTurn,
        draftOrder: PublicSchema.seasonDraftPlayers.draftOrder,
        myPlayerId: PublicSchema.seasonDraftPlayers.id,
        inviteCode: PublicSchema.seasonDraftGames.inviteCode,
      })
      .from(PublicSchema.seasonDraftPlayers)
      .innerJoin(
        PublicSchema.seasonDraftGames,
        eq(
          PublicSchema.seasonDraftPlayers.gameId,
          PublicSchema.seasonDraftGames.id,
        ),
      )
      .where(eq(PublicSchema.seasonDraftPlayers.userId, userId))
      .orderBy(desc(PublicSchema.seasonDraftGames.createdAt));

    if (games.length === 0) return [];

    // Batch all per-game enrichment into three grouped queries to avoid
    // an N+1 pattern as users accumulate games (LS-4128 review).
    const gameIds = games.map((g) => g.gameId);

    const allPlayers = await db
      .select({
        id: PublicSchema.seasonDraftPlayers.id,
        gameId: PublicSchema.seasonDraftPlayers.gameId,
        playerName: PublicSchema.seasonDraftPlayers.playerName,
        totalScore: PublicSchema.seasonDraftPlayers.totalScore,
        draftOrder: PublicSchema.seasonDraftPlayers.draftOrder,
      })
      .from(PublicSchema.seasonDraftPlayers)
      .where(inArray(PublicSchema.seasonDraftPlayers.gameId, gameIds))
      .orderBy(PublicSchema.seasonDraftPlayers.draftOrder);

    const playersByGame = new Map<number, typeof allPlayers>();
    for (const p of allPlayers) {
      const list = playersByGame.get(p.gameId);
      if (list) list.push(p);
      else playersByGame.set(p.gameId, [p]);
    }

    const pickCounts = await db
      .select({
        gameId: PublicSchema.seasonDraftPicks.gameId,
        count: sql<number>`count(*)::int`,
      })
      .from(PublicSchema.seasonDraftPicks)
      .where(inArray(PublicSchema.seasonDraftPicks.gameId, gameIds))
      .groupBy(PublicSchema.seasonDraftPicks.gameId);
    const pickCountByGame = new Map(
      pickCounts.map((row) => [row.gameId, row.count]),
    );

    const allPlayerIds = allPlayers.map((p) => p.id);
    const slotRows = allPlayerIds.length
      ? await db
          .select({
            seasonDraftPlayerId:
              PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId,
            count: sql<number>`count(*)::int`,
          })
          .from(PublicSchema.seasonDraftRosterSlots)
          .where(
            inArray(
              PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId,
              allPlayerIds,
            ),
          )
          .groupBy(PublicSchema.seasonDraftRosterSlots.seasonDraftPlayerId)
      : [];
    const slotCountByPlayer = new Map(
      slotRows.map((row) => [row.seasonDraftPlayerId, row.count]),
    );

    return games.map((g) => {
      const players = playersByGame.get(g.gameId) ?? [];
      const pickCount = pickCountByGame.get(g.gameId) ?? 0;
      const slotCount = players.reduce(
        (sum, p) => sum + (slotCountByPlayer.get(p.id) ?? 0),
        0,
      );
      const winner =
        g.gameStatus === 'completed' && players.length > 0
          ? players.reduce((best, p) =>
              p.totalScore > best.totalScore ? p : best,
            )
          : null;

      return {
        id: g.gameId,
        name: g.gameName,
        status: g.gameStatus,
        statKey: g.statKey,
        gameMode: g.gameMode,
        playerType: g.playerType,
        sport: g.sport,
        isMyTurn: g.currentTurn === g.draftOrder,
        inviteCode: g.inviteCode ?? null,
        playerCount: players.length,
        maxPlayers: SEASON_DRAFT_MAX_PLAYERS,
        picksMade: pickCount,
        totalPicks: slotCount,
        winnerName: winner?.playerName ?? null,
        myPlayerId: g.myPlayerId ?? null,
        players: players.map((p) => ({
          id: p.id,
          playerName: p.playerName,
        })),
      };
    });
  }

  /**
   * Completed Season Draft games the user played in, with a `won` flag.
   * Winner is the player with the highest `totalScore` in the game, ties
   * broken by lowest draftOrder — same tie-break `getGamesForUser`'s
   * `winnerName` already uses, so this agrees with what the game's own
   * lobby displays as the winner (LS-8803).
   */
  static async getCompletedGamesForUser(
    db: PublicDb,
    userId: number,
  ): Promise<
    Array<{ gameId: number; completedAt: string | null; won: boolean }>
  > {
    const myRows = await db
      .select({
        gameId: PublicSchema.seasonDraftGames.id,
        completedAt: PublicSchema.seasonDraftGames.completedAt,
        myDraftOrder: PublicSchema.seasonDraftPlayers.draftOrder,
      })
      .from(PublicSchema.seasonDraftPlayers)
      .innerJoin(
        PublicSchema.seasonDraftGames,
        eq(
          PublicSchema.seasonDraftPlayers.gameId,
          PublicSchema.seasonDraftGames.id,
        ),
      )
      .where(
        and(
          eq(PublicSchema.seasonDraftPlayers.userId, userId),
          eq(PublicSchema.seasonDraftGames.status, 'completed'),
        ),
      );

    if (myRows.length === 0) return [];

    const gameIds = myRows.map((r) => r.gameId);
    const allPlayers = await db
      .select({
        gameId: PublicSchema.seasonDraftPlayers.gameId,
        totalScore: PublicSchema.seasonDraftPlayers.totalScore,
        draftOrder: PublicSchema.seasonDraftPlayers.draftOrder,
      })
      .from(PublicSchema.seasonDraftPlayers)
      .where(inArray(PublicSchema.seasonDraftPlayers.gameId, gameIds))
      .orderBy(PublicSchema.seasonDraftPlayers.draftOrder);

    const playersByGame = new Map<number, typeof allPlayers>();
    for (const p of allPlayers) {
      const list = playersByGame.get(p.gameId);
      if (list) list.push(p);
      else playersByGame.set(p.gameId, [p]);
    }

    return myRows.map((r) => {
      const players = playersByGame.get(r.gameId) ?? [];
      const winner =
        players.length > 0
          ? players.reduce((best, p) =>
              p.totalScore > best.totalScore ? p : best,
            )
          : null;
      return {
        gameId: r.gameId,
        completedAt: r.completedAt,
        won: winner !== null && winner.draftOrder === r.myDraftOrder,
      };
    });
  }
}

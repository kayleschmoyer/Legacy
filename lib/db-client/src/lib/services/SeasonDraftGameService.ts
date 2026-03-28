import { and, desc, eq, sql } from 'drizzle-orm';
import { LOGGER } from '@legacy-sports/logging';
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

export interface CreateSeasonDraftGameParams {
  name: string;
  createdBy: number;
  numPlayers: number;
  playerNames: string[];
  userIds: number[];
  statKey?: string; // defaults to 'hr'
  gameMode?: GameMode; // defaults to 'season'
  playerType?: PlayerType; // defaults to 'hitter'
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
    if (params.numPlayers < 2 || params.numPlayers > 6) {
      throw new Error('Number of players must be between 2 and 6');
    }

    if (params.playerNames.length !== params.numPlayers) {
      throw new Error('Player names count must match num players');
    }

    if (params.userIds.length !== params.numPlayers) {
      throw new Error('User IDs count must match num players');
    }

    const playerType: PlayerType = params.playerType ?? 'hitter';
    const gameMode: GameMode = params.gameMode ?? 'season';

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
      })
      .returning();

    LOGGER.info(
      `Created Season Draft Game ${game.id}: ${params.name} (${playerType}/${statKey}/${gameMode})`,
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
   * Start the game (move from setup to drafting)
   */
  static async startGame(db: PublicDb, gameId: number): Promise<void> {
    await db
      .update(PublicSchema.seasonDraftGames)
      .set({
        status: 'drafting',
        startedAt: new Date().toISOString(),
      })
      .where(eq(PublicSchema.seasonDraftGames.id, gameId));

    LOGGER.info(`Started Season Draft Game ${gameId}`);
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
      game.playerType as PlayerType,
      game.gameMode as GameMode,
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

    // Advance to next turn
    const nextTurn = (game.currentTurn + 1) % game.numPlayers;
    await db
      .update(PublicSchema.seasonDraftGames)
      .set({ currentTurn: nextTurn })
      .where(eq(PublicSchema.seasonDraftGames.id, params.gameId));

    // Check if game is complete (all slots filled)
    const totalSlots = game.numPlayers * 9; // 9 positions per player
    const totalPicks = pickCount.length + 1;

    if (totalPicks >= totalSlots) {
      await db
        .update(PublicSchema.seasonDraftGames)
        .set({
          status: 'completed',
          completedAt: new Date().toISOString(),
        })
        .where(eq(PublicSchema.seasonDraftGames.id, params.gameId));

      LOGGER.info(`Season Draft Game ${params.gameId} completed`);
    }

    LOGGER.info(
      `Pick made in game ${params.gameId}: Player ${params.playerId}, Season ${params.season}, Position ${params.position}, Stat Value: ${statValue}`,
    );
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
      isMyTurn: boolean;
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
        currentTurn: PublicSchema.seasonDraftGames.currentTurn,
        draftOrder: PublicSchema.seasonDraftPlayers.draftOrder,
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

    return games.map((g) => ({
      id: g.gameId,
      name: g.gameName,
      status: g.gameStatus,
      statKey: g.statKey,
      gameMode: g.gameMode,
      playerType: g.playerType,
      isMyTurn: g.currentTurn === g.draftOrder,
    }));
  }
}

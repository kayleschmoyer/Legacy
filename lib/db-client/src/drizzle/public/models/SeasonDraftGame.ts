import {
  pgTable,
  serial,
  varchar,
  integer,
  timestamp,
  foreignKey,
  index,
  unique,
  boolean,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { players } from './Players';

/**
 * Season Draft Game Database Schema
 *
 * This is a standalone game type where players take turns drafting
 * baseball players + seasons to fill roster positions. Scoring is
 * based on stats from the selected season/position.
 *
 * Supports:
 * - Multiple stat keys (hr, h, rbi, sb, r, doubles, triples, bb, tb for hitters;
 *   w, so, sv, sho, ip, cg for pitchers)
 * - Three game modes: season (player+year), career_team (player+team career total),
 *   or most_teams (player only — COUNT(DISTINCT team))
 * - Hitter or pitcher player types with different roster layouts
 */

// Game status enum
export const seasonDraftGameStatus = pgEnum('season_draft_game_status', [
  'setup', // Game created, waiting for players to join
  'drafting', // Active drafting phase
  'completed', // All positions filled, game over
  'cancelled', // Game cancelled
]);

// Player type enum (hitter vs pitcher draft)
export const seasonDraftPlayerType = pgEnum('season_draft_player_type', [
  'hitter',
  'pitcher',
]);

// Game mode enum
export const seasonDraftGameMode = pgEnum('season_draft_game_mode', [
  'season', // Player + specific year
  'career_team', // Player + specific team (career total with that franchise)
  'most_teams', // Player only — stat is COUNT(DISTINCT team)
]);

// Main game table
export const seasonDraftGames = pgTable(
  'season_draft_games',
  {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    createdBy: integer('created_by').notNull(), // User ID of creator
    status: seasonDraftGameStatus('status').notNull().default('setup'),
    numPlayers: integer('num_players').notNull(), // 2-6 players
    currentTurn: integer('current_turn').notNull().default(0), // Index into seasonDraftPlayers
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    statKey: varchar('stat_key', { length: 20 }).notNull().default('hr'), // Stat column to score (hr, h, rbi, sb, etc.)
    gameMode: seasonDraftGameMode('game_mode').notNull().default('season'), // season or career_team
    playerType: seasonDraftPlayerType('player_type')
      .notNull()
      .default('hitter'), // hitter or pitcher
    inviteCode: varchar('invite_code', { length: 12 }).unique(), // Shareable invite code
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'string',
    }),
  },
  (table) => {
    return {
      statusIdx: index('season_draft_games_status_idx').on(table.status),
      createdByIdx: index('season_draft_games_created_by_idx').on(
        table.createdBy,
      ),
      inviteCodeIdx: index('season_draft_games_invite_code_idx').on(
        table.inviteCode,
      ),
    };
  },
);

// Players participating in a game (human players, not baseball players)
export const seasonDraftPlayers = pgTable(
  'season_draft_players',
  {
    id: serial('id').primaryKey().notNull(),
    gameId: integer('game_id').notNull(),
    userId: integer('user_id').notNull(), // User ID
    playerName: varchar('player_name', { length: 255 }).notNull(), // Display name
    draftOrder: integer('draft_order').notNull(), // 0-indexed position in draft
    totalScore: integer('total_score').notNull().default(0), // Cumulative score
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      seasonDraftPlayersGameFk: foreignKey({
        columns: [table.gameId],
        foreignColumns: [seasonDraftGames.id],
        name: 'season_draft_players_game_fk',
      }).onDelete('cascade'),
      gameUserUnique: unique('season_draft_players_game_user_unique').on(
        table.gameId,
        table.userId,
      ),
      gameOrderUnique: unique('season_draft_players_game_order_unique').on(
        table.gameId,
        table.draftOrder,
      ),
      gameIdIdx: index('season_draft_players_game_id_idx').on(table.gameId),
    };
  },
);

// Roster positions for each player
// Each player has 9 slots: 1B, 2B, 3B, SS, OF, OF, OF, C, UT
export const seasonDraftRosterSlots = pgTable(
  'season_draft_roster_slots',
  {
    id: serial('id').primaryKey().notNull(),
    seasonDraftPlayerId: integer('season_draft_player_id').notNull(),
    position: varchar('position', { length: 10 }).notNull(), // 1B, 2B, 3B, SS, OF, C, UT
    slotNumber: integer('slot_number').notNull(), // For multiple OF positions: 0, 1, 2
    isFilled: boolean('is_filled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      seasonDraftRosterSlotsPlayerFk: foreignKey({
        columns: [table.seasonDraftPlayerId],
        foreignColumns: [seasonDraftPlayers.id],
        name: 'season_draft_roster_slots_player_fk',
      }).onDelete('cascade'),
      playerPositionSlotUnique: unique(
        'season_draft_roster_player_position_slot_unique',
      ).on(table.seasonDraftPlayerId, table.position, table.slotNumber),
      playerIdIdx: index('season_draft_roster_slots_player_id_idx').on(
        table.seasonDraftPlayerId,
      ),
    };
  },
);

// Draft picks - each selection of player + season + position
export const seasonDraftPicks = pgTable(
  'season_draft_picks',
  {
    id: serial('id').primaryKey().notNull(),
    gameId: integer('game_id').notNull(),
    seasonDraftPlayerId: integer('season_draft_player_id').notNull(), // Who made the pick
    rosterSlotId: integer('roster_slot_id').notNull(), // Which slot this fills
    playerId: integer('player_id').notNull(), // Baseball player from players table
    season: integer('season').notNull(), // Year (e.g., 2023)
    position: varchar('position', { length: 10 }).notNull(), // Position selected for scoring
    team: varchar('team', { length: 50 }), // Team (for career_team mode)
    statValue: integer('stat_value').notNull().default(0), // Stat value for that season/position
    pickNumber: integer('pick_number').notNull(), // Overall pick number in game
    pickedAt: timestamp('picked_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => {
    return {
      seasonDraftPicksGameFk: foreignKey({
        columns: [table.gameId],
        foreignColumns: [seasonDraftGames.id],
        name: 'season_draft_picks_game_fk',
      }).onDelete('cascade'),
      seasonDraftPicksPlayerFk: foreignKey({
        columns: [table.seasonDraftPlayerId],
        foreignColumns: [seasonDraftPlayers.id],
        name: 'season_draft_picks_player_fk',
      }).onDelete('cascade'),
      seasonDraftPicksRosterSlotFk: foreignKey({
        columns: [table.rosterSlotId],
        foreignColumns: [seasonDraftRosterSlots.id],
        name: 'season_draft_picks_roster_slot_fk',
      }).onDelete('cascade'),
      seasonDraftPicksBaseballPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'season_draft_picks_baseball_player_fk',
      }),
      rosterSlotUnique: unique('season_draft_picks_roster_slot_unique').on(
        table.rosterSlotId,
      ),
      gamePickNumberUnique: unique(
        'season_draft_picks_game_pick_number_unique',
      ).on(table.gameId, table.pickNumber),
      gameIdIdx: index('season_draft_picks_game_id_idx').on(table.gameId),
      playerIdIdx: index('season_draft_picks_player_id_idx').on(
        table.seasonDraftPlayerId,
      ),
    };
  },
);

import {
  pgTable,
  unique,
  uniqueIndex,
  serial,
  text,
  varchar,
  integer,
  primaryKey,
  foreignKey,
  pgMaterializedView,
  timestamp,
  bigint,
  boolean,
  real,
} from 'drizzle-orm/pg-core';
import { playerPosition, sportKind } from './Enums';
import { sql } from 'drizzle-orm';
import { nflTeams } from './FootballTeams';
import { mlbTeams } from './MlbTeams';

export const players = pgTable(
  'players',
  {
    id: serial('id').primaryKey().notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    brefId: varchar('bref_id', { length: 10 }).notNull(),
    statsLastFetchedAt: timestamp('stats_last_fetched_at'),
    // Career achievement counts — populated by the data loader from bref award_summary
    allStarSelections: integer('all_star_selections').notNull().default(0),
    goldGloves: integer('gold_gloves').notNull().default(0),
    silverSluggers: integer('silver_sluggers').notNull().default(0),
    mvpAwards: integer('mvp_awards').notNull().default(0),
    cyYoungAwards: integer('cy_young_awards').notNull().default(0),
    worldSeriesRings: integer('world_series_rings').notNull().default(0),
    hallOfFame: boolean('hall_of_fame').notNull().default(false),
    rookieOfTheYear: boolean('rookie_of_the_year').notNull().default(false),
    // Precomputed career games; maintained by the data loaders so eligibility
    // filters can avoid correlated subqueries. Baseball: career batting +
    // pitching games. Football: max career games across the career_football_*
    // tables (LS-10647).
    totalGames: integer('total_games').notNull().default(0),
    // MLB Stats API player ID for cross-referencing with the external data
    // provider. Nullable — historical players may not have a mapping yet.
    mlbPlayerId: integer('mlb_player_id'),
    // Handedness — populated by Baseball Reference import pipeline. Added in
    // migration 20260418_000000_add_twenty_questions_tables.
    batHand: text('bat_hand'),
    throwHand: text('throw_hand'),
    // Football identity columns (LS-246 / LS-4150)
    sport: sportKind('sport').notNull().default('baseball'),
    pfrId: varchar('pfr_id', { length: 20 }),
    // Pro Football Archives player id (LS-10588, ADR 0023). Set only on
    // football rows with no obtainable pfr_id; those rows use
    // bref_id = 'pfa-' || pfa_id.
    pfaId: varchar('pfa_id', { length: 20 }),
    isDst: boolean('is_dst').notNull().default(false),
    nflTeam: varchar('nfl_team', { length: 10 }),
    // PFR canonical position for football players (LS-250). Nullable — baseball players
    // and football players without a PFR mapping have null.
    position: playerPosition('position'),
    // Jersey number for display. Originally NFL-only (LS-6236); shared across
    // sports as of LS-8597 — populated for baseball players by the MLB Stats
    // API pipeline. Nullable — DST and unmapped players have null.
    jerseyNumber: integer('jersey_number'),
    // News for football players (LS-5436). Populated by the news pipeline;
    // null until a feed is connected.
    news: text('news'),
    // Premium advanced-search filter fields for football players (LS-6489 /
    // FPL-008). Populated by a projections/ADP data pipeline; null until a feed
    // is connected. Gated behind the `advanced_search_filters` entitlement when
    // used as search filters.
    projectedFantasyPoints: real('projected_fantasy_points'),
    adpRank: integer('adp_rank'),
    // Current MLB team abbreviation for baseball players (LS-8597), FK ->
    // mlb_teams.abbreviation. Populated by the MLB Stats API pipeline via
    // mlbPlayerId; null until synced.
    mlbTeam: varchar('mlb_team', { length: 3 }),
  },
  (table) => {
    return {
      playersUkBrefId: unique('players_uk_bref_id').on(table.brefId),
      // GIN trigram indexes for LIKE '%name%' search: idx_players_name_trgm (LS-905)
      // and idx_players_unaccent_name_trgm (LS-10728, accent-insensitive)
      // Managed by migration — cannot be modeled in Drizzle (expression + pg_trgm ops class)
      // Partial unique index: one row per pfr_id when non-null (LS-246)
      playersPfrIdUnique: uniqueIndex('players_pfr_id_unique')
        .on(table.pfrId)
        .where(sql`pfr_id IS NOT NULL`),
      // Partial unique index: one row per pfa_id when non-null (LS-10588)
      playersPfaIdUnique: uniqueIndex('players_pfa_id_unique')
        .on(table.pfaId)
        .where(sql`pfa_id IS NOT NULL`),
      playersNflTeamFk: foreignKey({
        columns: [table.nflTeam],
        foreignColumns: [nflTeams.abbreviation],
        name: 'players_nfl_team_fk',
      }).onDelete('set null'),
      playersMlbTeamFk: foreignKey({
        columns: [table.mlbTeam],
        foreignColumns: [mlbTeams.abbreviation],
        name: 'players_mlb_team_fk',
      }).onDelete('set null'),
    };
  },
);

// NOTE: This is a MATERIALIZED VIEW (not a plain view) as of migration
// 20260302_120000_materialize_player_eligible_positions. Drizzle schema
// reflects the materialized variant so introspection stays accurate.
export const playerEligiblePositions = pgMaterializedView(
  'player_eligible_positions',
  {
    playerId: integer('player_id').notNull(),
    position: playerPosition('position').notNull(),
    games: bigint('games', { mode: 'number' }).notNull(),
  },
).as(sql`
SELECT cfbp.player_id,
       cfbp.pos AS position,
       cfbp.g AS games
FROM career_fielding_by_position cfbp
JOIN career_batting cb ON cb.player_id = cfbp.player_id
WHERE cfbp.pos != 'P'
  AND (cfbp.g >= 100 OR (cb.g > 0 AND cfbp.g * 10 >= cb.g))
UNION
SELECT player_id,
       'SP' AS position,
       gs AS games
FROM career_pitching
WHERE gs >= 100 OR (g > 0 AND gs * 10 >= g)
UNION
SELECT player_id,
       'RP' AS position,
       (g - gs) AS games
FROM career_pitching
WHERE (g - gs) >= 100 OR (g > 0 AND (g - gs) * 10 >= g)
ORDER BY player_id, games DESC
`);

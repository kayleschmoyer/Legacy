import {
  pgTable,
  serial,
  integer,
  varchar,
  timestamp,
  foreignKey,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { leagues } from './Leagues';
import { players } from './Players';
import { drafts, teams } from './Leagues';

/**
 * player_salaries — authoritative salary for every player in a salary-cap league.
 *
 * Tracks salary for rostered and free-agent players alike. team_members.salary
 * is a denormalized copy for query convenience; this table is the source of truth.
 *
 * Added in LS-634 (salary cap schema foundations).
 */
export const playerSalaries = pgTable(
  'player_salaries',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    playerId: integer('player_id').notNull(),
    currentSalary: integer('current_salary').notNull(),
    initialSalary: integer('initial_salary').notNull(),
    /** 'auction' | 'waiver' | 'commissioner' */
    acquisitionType: varchar('acquisition_type', { length: 20 }).notNull(),
    yearAcquired: integer('year_acquired').notNull(),
    lastRosteredSeason: integer('last_rostered_season'),
    freeAgentYears: integer('free_agent_years').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      playerSalariesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'player_salaries_league_fk',
      }).onDelete('cascade'),
      playerSalariesPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'player_salaries_player_fk',
      }),
      playerSalariesUk: unique('player_salaries_uk_league_player').on(
        table.leagueId,
        table.playerId,
      ),
      leagueIdIdx: index('player_salaries_league_id_idx').on(table.leagueId),
      playerIdIdx: index('player_salaries_player_id_idx').on(table.playerId),
      leagueSalaryIdx: index('player_salaries_league_salary_idx').on(
        table.leagueId,
        table.currentSalary,
      ),
    };
  },
);

/**
 * auction_state — live state of an auction draft in progress.
 *
 * Ephemeral: one row per draft while the auction is running. Deleted when
 * the draft completes.
 *
 * Added in LS-634 (salary cap schema foundations).
 */
export const auctionState = pgTable(
  'auction_state',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    nominatorTeamId: integer('nominator_team_id').notNull(),
    nominatedPlayerId: integer('nominated_player_id'),
    currentBid: integer('current_bid'),
    currentBidderTeamId: integer('current_bidder_team_id'),
    nominationDeadline: timestamp('nomination_deadline', {
      withTimezone: true,
    }),
    bidDeadline: timestamp('bid_deadline', { withTimezone: true }),
    nominationOrder: integer('nomination_order').notNull(),
  },
  (table) => {
    return {
      auctionStateDraftFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'auction_state_draft_fk',
      }).onDelete('cascade'),
      auctionStateDraftUk: unique('auction_state_uk_draft').on(table.draftId),
    };
  },
);

/**
 * auction_budgets — per-team budget tracking during an auction draft.
 *
 * One row per (draft, team). remainingBudget is decremented on each winning bid.
 *
 * Added in LS-634 (salary cap schema foundations).
 */
export const auctionBudgets = pgTable(
  'auction_budgets',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    teamId: integer('team_id').notNull(),
    remainingBudget: integer('remaining_budget').notNull(),
    playersWon: integer('players_won').notNull().default(0),
  },
  (table) => {
    return {
      auctionBudgetsDraftFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'auction_budgets_draft_fk',
      }).onDelete('cascade'),
      auctionBudgetsTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'auction_budgets_team_fk',
      }).onDelete('cascade'),
      auctionBudgetsUk: unique('auction_budgets_uk_draft_team').on(
        table.draftId,
        table.teamId,
      ),
    };
  },
);

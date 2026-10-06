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
import { draftParticipants, drafts } from './Leagues';

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
    nominatedPlayerId: integer('nominated_player_id'),
    currentBid: integer('current_bid'),
    /** Seat ids for the nominator / current bidder (LS-10073); they replaced
     *  the *_team_id columns (LS-10592). */
    nominatorParticipantId: integer('nominator_participant_id').notNull(),
    currentBidderParticipantId: integer('current_bidder_participant_id'),
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
      auctionStateNominatorParticipantIdFk: foreignKey({
        columns: [table.nominatorParticipantId],
        foreignColumns: [draftParticipants.id],
        name: 'auction_state_nominator_participant_id_fk',
      }).onDelete('cascade'),
      auctionStateCurrentBidderParticipantIdFk: foreignKey({
        columns: [table.currentBidderParticipantId],
        foreignColumns: [draftParticipants.id],
        name: 'auction_state_current_bidder_participant_id_fk',
      }).onDelete('set null'),
    };
  },
);

/**
 * auction_budgets — per-seat budget tracking during an auction draft.
 *
 * One row per (draft, seat). remainingBudget is decremented on each winning bid.
 *
 * Added in LS-634 (salary cap schema foundations).
 */
export const auctionBudgets = pgTable(
  'auction_budgets',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    /** The budget owner's seat (LS-10073). Replaced team_id (LS-10592). */
    participantId: integer('participant_id').notNull(),
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
      auctionBudgetsUk: unique('auction_budgets_uk_draft_participant').on(
        table.draftId,
        table.participantId,
      ),
      auctionBudgetsParticipantIdFk: foreignKey({
        columns: [table.participantId],
        foreignColumns: [draftParticipants.id],
        name: 'auction_budgets_participant_id_fk',
      }).onDelete('cascade'),
      participantIdIdx: index('auction_budgets_participant_id_idx').on(
        table.participantId,
      ),
    };
  },
);

import {
  pgTable,
  unique,
  serial,
  varchar,
  foreignKey,
  uniqueIndex,
  integer,
  date,
  index,
  timestamp,
  primaryKey,
  boolean,
} from 'drizzle-orm/pg-core';
import {
  draftOrder,
  draftMode,
  selectionMethod,
  playerPool,
  draftStatus,
  leaguePermissionLevel,
  positionSlot,
  rosterLockTiming,
  emergencySubRule,
  schedulingStrategy,
  waiverClaimStatus,
  waiverType,
  weekAdvanceStatus,
} from './Enums';
import { players } from './Players';

// Define leagues first since other tables reference it
export const leagues = pgTable(
  'leagues',
  {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name').notNull(),
    owner: integer('owner').notNull(),
    maxRosterSize: integer('max_roster_size').notNull().default(25),
    currentMatchup: integer('current_matchup'),
    draftStatus: draftStatus('draft_status').notNull().default('not-started'),
    inviteCode: varchar('invite_code', { length: 8 }).notNull().unique(),
    minGamesPerSeason: integer('min_games_per_season').default(10),
    gamesPerMatchup: integer('games_per_matchup').default(5),
    tradeDeadlineWeek: integer('trade_deadline_week'),
    rosterLockTiming: rosterLockTiming('roster_lock_timing')
      .notNull()
      .default('matchup_start'),
    schedulingStrategy: schedulingStrategy('scheduling_strategy')
      .notNull()
      .default('round-robin'),
    weekAdvanceStatus: weekAdvanceStatus('week_advance_status')
      .notNull()
      .default('idle'),
    playerPool: playerPool('player_pool').notNull().default('all'),
    waiverType: waiverType('waiver_type').notNull().default('standard'),
    waiverEnabled: boolean('waiver_enabled').notNull().default(true),
    faabBudgetDefault: integer('faab_budget_default').notNull().default(100),
    spStartsPerMatchup: integer('sp_starts_per_matchup').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      inviteCodeIdx: index('leagues_invite_code_idx').on(table.inviteCode),
      ownerIdx: index('leagues_owner_idx').on(table.owner),
      currentMatchupIdx: index('leagues_current_matchup_idx').on(
        table.currentMatchup,
      ),
    };
  },
);

export const teams = pgTable(
  'teams',
  {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name').notNull(),
    leagueId: integer('league_id').notNull(),
    waiverOrder: integer('waiver_order'),
    faabBudget: integer('faab_budget'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      teamsLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'teams_leagues_id_fk',
      }).onDelete('cascade'),
      teamsUkIdLeagueId: unique('teams_uk_id_league_id').on(
        table.id,
        table.leagueId,
      ),
      leagueIdIdx: index('teams_league_id_idx').on(table.leagueId),
    };
  },
);

export const drafts = pgTable(
  'drafts',
  {
    id: serial('id').primaryKey().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    leagueId: integer('league_id').notNull(),
    draftMode: draftMode('draft_mode').notNull().default('live'),
    selectionMethod: selectionMethod('selection_method')
      .notNull()
      .default('standard'),
    date: date('date'),
    draftOrder: draftOrder('draft_order').default('snake').notNull(),
    currentPick: integer('current_pick').notNull().default(0),
    draftStartedAt: timestamp('draft_started_at', { withTimezone: true }),
    draftCompletedAt: timestamp('draft_completed_at', { withTimezone: true }),
  },
  (table) => {
    return {
      draftsLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'drafts_leagues_id_fk',
      }).onDelete('cascade'),
      leagueIdIdx: index('drafts_league_id_idx').on(table.leagueId),
    };
  },
);

export const leagueMessages = pgTable(
  'league_messages',
  {
    leagueId: integer('league_id').notNull(),
    messageText: varchar('message_text').notNull(),
    timestamp: timestamp('timestamp', { mode: 'string' }).defaultNow(),
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id').notNull(),
  },
  (table) => {
    return {
      leagueIdIdx: index().using('btree', table.leagueId.asc().nullsLast()),
      leagueIdTimestampIdx: index().using(
        'btree',
        table.leagueId.asc().nullsLast(),
        table.timestamp.asc().nullsLast(),
      ),
      leagueMessagesLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_messages_leagues_id_fk',
      }),
    };
  },
);

export const leagueMembers = pgTable(
  'league_members',
  {
    leagueId: integer('league_id').notNull(),
    teamId: integer('team_id'),
    permissionLevel: leaguePermissionLevel('permission_level').notNull(),
    userId: integer('user_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      leagueMembersLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_members_leagues_id_fk',
      }).onDelete('cascade'),
      leagueMembersPk: primaryKey({
        columns: [table.leagueId, table.userId],
        name: 'league_members_pk',
      }),
      userIdIdx: index('league_members_user_id_idx').on(table.userId),
      teamIdIdx: index('league_members_team_id_idx').on(table.teamId),
    };
  },
);

export const draftTeams = pgTable(
  'draft_teams',
  {
    draftId: integer('draft_id').notNull(),
    teamId: integer('team_id').notNull(),
    leagueId: integer('league_id').notNull(),
    draftOrder: integer('draft_order').notNull(),
  },
  (table) => {
    return {
      draftTeamsDraftsIdFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'draft_teams_drafts_id_fk',
      }).onDelete('cascade'),
      draftTeamsTeamsIdLeagueIdFk: foreignKey({
        columns: [table.teamId, table.leagueId],
        foreignColumns: [teams.id, teams.leagueId],
        name: 'draft_teams_teams_id_league_id_fk',
      }),
      draftTeamsPk: primaryKey({
        columns: [table.draftId, table.teamId, table.leagueId],
        name: 'draft_teams_pk',
      }),
      draftTeamsUkOrder: unique('draft_teams_uk_order').on(
        table.draftId,
        table.draftOrder,
      ),
      draftIdIdx: index('draft_teams_draft_id_idx').on(table.draftId),
      teamIdLeagueIdIdx: index('draft_teams_team_id_league_id_idx').on(
        table.teamId,
        table.leagueId,
      ),
    };
  },
);

export const draftPicks = pgTable(
  'draft_picks',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    teamId: integer('team_id').notNull(),
    playerId: integer('player_id').notNull(),
    round: integer('round').notNull(),
    pickNumber: integer('pick_number').notNull(),
    overallPick: integer('overall_pick').notNull(),
    pickedAt: timestamp('picked_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      draftPicksDraftsIdFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'draft_picks_drafts_id_fk',
      }).onDelete('cascade'),
      draftPicksTeamsIdFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'draft_picks_teams_id_fk',
      }),
      draftPicksPlayersIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'draft_picks_players_id_fk',
      }),
      draftPicksUkDraftOverall: unique('draft_picks_uk_draft_overall').on(
        table.draftId,
        table.overallPick,
      ),
      draftPicksUkDraftPlayer: unique('draft_picks_uk_draft_player').on(
        table.draftId,
        table.playerId,
      ),
      draftIdIdx: index('draft_picks_draft_id_idx').on(table.draftId),
      teamIdIdx: index('draft_picks_team_id_idx').on(table.teamId),
      playerIdIdx: index('draft_picks_player_id_idx').on(table.playerId),
      overallPickIdx: index('draft_picks_overall_pick_idx').on(
        table.draftId,
        table.overallPick,
      ),
    };
  },
);

export const leaguePosition = pgTable(
  'league_positions',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    positionType: positionSlot('position_type').notNull(),
  },
  (table) => {
    return {
      leaguePositionLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_position_league_fk',
      }),
      createdAt: timestamp('created_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      updatedAt: timestamp('updated_at', { withTimezone: true })
        .notNull()
        .defaultNow(),
      leagueIdIdx: index('league_positions_league_id_idx').on(table.leagueId),
    };
  },
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: serial('id').primaryKey().notNull(),
    teamId: integer('team_id'),
    leagueId: integer('league_id').notNull(),
    playerId: integer('player_id').notNull(),
    positionId: integer('position_id'),
    draftRound: integer('draft_round'),
    draftPick: integer('draft_pick'),
    acquisitionType: varchar('acquisition_type', { length: 20 }).default(
      'draft',
    ),
  },
  (table) => {
    return {
      teamMembersTeamsFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'team_members_teams_fk',
      }).onDelete('cascade'),
      teamMembersLeagueFK: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'team_members_league_fk',
      }).onDelete('cascade'),

      teamMembersPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'team_members_players_fk',
      }),
      teamMembersPositionFk: foreignKey({
        columns: [table.positionId],
        foreignColumns: [leaguePosition.id],
        name: 'team_members_position_fk',
      }),
      // Ensure only one player per position per team
      teamMembersUkTeamPosition: unique('team_members_uk_team_position').on(
        table.teamId,
        table.positionId,
      ),
      teamIdIdx: index('team_members_team_id_idx').on(table.teamId),
      playerIdIdx: index('team_members_player_id_idx').on(table.playerId),
      leagueIdIdx: index('team_members_league_id_idx').on(table.leagueId),
    };
  },
);

export const waiverClaims = pgTable(
  'waiver_claims',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    teamId: integer('team_id').notNull(),
    userId: integer('user_id').notNull(),
    playerId: integer('player_id').notNull(),
    dropPlayerId: integer('drop_player_id'),
    faabBid: integer('faab_bid'),
    status: waiverClaimStatus('status').notNull().default('pending'),
    errorMessage: varchar('error_message', { length: 500 }),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      waiverClaimsLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'waiver_claims_league_fk',
      }).onDelete('cascade'),
      waiverClaimsTeamFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'waiver_claims_team_fk',
      }).onDelete('cascade'),
      waiverClaimsPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'waiver_claims_player_fk',
      }),
      leagueIdIdx: index('waiver_claims_league_id_idx').on(table.leagueId),
      teamIdIdx: index('waiver_claims_team_id_idx').on(table.teamId),
      statusIdx: index('waiver_claims_status_idx').on(table.status),
    };
  },
);

export const rosterLockRules = pgTable(
  'roster_lock_rules',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    allowEmergencySubs: boolean('allow_emergency_subs')
      .notNull()
      .default(false),
    emergencySubRule: emergencySubRule('emergency_sub_rule')
      .notNull()
      .default('none'),
    customLockTime: timestamp('custom_lock_time', { mode: 'string' }),
    lockHoursBeforeMatchup: integer('lock_hours_before_matchup').default(0),
    commissionerCanOverride: boolean('commissioner_can_override')
      .notNull()
      .default(true),
  },
  (table) => {
    return {
      rosterLockRulesLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'roster_lock_rules_league_fk',
      }),
      rosterLockRulesLeagueUk: unique('roster_lock_rules_league_uk').on(
        table.leagueId,
      ),
    };
  },
);

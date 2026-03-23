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
  jsonb,
  text,
} from 'drizzle-orm/pg-core';
import { players } from './Players';
import {
  draftOrder,
  draftMode,
  selectionMethod,
  playerPool,
  eraFilter,
  draftStatus,
  leaguePhase,
  leaguePermissionLevel,
  positionSlot,
  rosterLockTiming,
  emergencySubRule,
  schedulingStrategy,
  waiverClaimStatus,
  waiverType,
  weekAdvanceStatus,
  tradeOfferStatus,
} from './Enums';

// Define leagues first since other tables reference it
export const leagues = pgTable(
  'leagues',
  {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name').notNull(),
    owner: integer('owner').notNull(),
    maxRosterSize: integer('max_roster_size').notNull().default(25),
    currentMatchup: integer('current_matchup'),
    /** Canonical current active week number. Replaces the currentMatchup FK as the
     * authoritative "which week is the league on" signal. Backfilled from
     * matchups.week_number on migration 20260305_120000. */
    currentWeek: integer('current_week'),
    draftStatus: draftStatus('draft_status').notNull().default('not-started'),
    /** Lifecycle phase: pre-draft (awaiting draft), active (season in play), offseason (post-renewal, pre-start) */
    leaguePhase: leaguePhase('league_phase').notNull().default('pre-draft'),
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
    // Era-based league settings (LS-295)
    eraFilter: eraFilter('era_filter').notNull().default('all'),
    hofOnly: boolean('hof_only').notNull().default(false),
    customEraStartYear: integer('custom_era_start_year'),
    customEraEndYear: integer('custom_era_end_year'),
    waiverType: waiverType('waiver_type').notNull().default('standard'),
    waiverEnabled: boolean('waiver_enabled').notNull().default(true),
    faabBudgetDefault: integer('faab_budget_default').notNull().default(100),
    spStartsPerMatchup: integer('sp_starts_per_matchup').notNull().default(1),
    minCareerGames: integer('min_career_games').notNull().default(50),
    minCareerSeasons: integer('min_career_seasons').notNull().default(3),
    totalMatchups: integer('total_matchups').notNull().default(10),
    numberOfDivisions: integer('number_of_divisions').notNull().default(2),
    // Playoff settings
    playoffEnabled: boolean('playoff_enabled').notNull().default(true),
    playoffFormat: varchar('playoff_format', { length: 10 })
      .notNull()
      .default('4-team'),
    playoffMultiWeek: boolean('playoff_multi_week').notNull().default(false),
    /** Persistent commissioner notes visible to all league members */
    lmNotes: text('lm_notes'),
    /** True for ephemeral mock drafts created via initializeMockDraft (LS-470).
     *  Rosters are NOT persisted and matchups are NOT created when isMockDraft=true. */
    isMockDraft: boolean('is_mock_draft').notNull().default(false),
    // League visibility
    isPublic: boolean('is_public').notNull().default(false),
    logoUrl: text('logo_url'),
    bannerUrl: text('banner_url'),
    primaryColor: varchar('primary_color', { length: 7 }),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    /** Points to the previous season's league — used to build the lineage chain */
    previousLeagueId: integer('previous_league_id'),
    /** Set when the league is retired at the end of a season and becomes read-only */
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    /** Set when the league is frozen because the owner's subscription tier was downgraded.
     *  Distinct from frozenAt (season retirement). Cleared if the user re-upgrades or
     *  re-selects this league as one of their free-tier active leagues. */
    tierFrozenAt: timestamp('tier_frozen_at', { withTimezone: true }),
    /** Monotonic season counter (1 = founding season, incremented on each renewal) */
    seasonNumber: integer('season_number').notNull().default(1),
    // Salary cap settings (LS-634)
    salaryCapEnabled: boolean('salary_cap_enabled').notNull().default(false),
    salaryCap: integer('salary_cap'),
    salaryFloor: integer('salary_floor'),
    luxuryTaxThreshold: integer('luxury_tax_threshold'),
    minSalary: integer('min_salary').notNull().default(1),
    salaryEscalationPct: integer('salary_escalation_pct').notNull().default(10),
    salaryDecayPct: integer('salary_decay_pct').notNull().default(25),
    auctionBudget: integer('auction_budget').notNull().default(260),
    auctionMinBid: integer('auction_min_bid').notNull().default(1),
    /** Discord webhook URL for league notifications (draft picks, scores, trades, etc.) */
    discordWebhookUrl: text('discord_webhook_url'),
    discordGuildId: varchar('discord_guild_id', { length: 32 }),
    discordChannelId: varchar('discord_channel_id', { length: 32 }),
    discordCategoryId: varchar('discord_category_id', { length: 32 }),
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
      currentWeekIdx: index('leagues_current_week_idx').on(table.currentWeek),
      previousLeagueIdIdx: index('leagues_previous_league_id_idx').on(
        table.previousLeagueId,
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
    divisionId: integer('division_id'),
    waiverOrder: integer('waiver_order'),
    faabBudget: integer('faab_budget'),
    /** Commissioner can lock a team to prevent roster moves */
    isLocked: boolean('is_locked').notNull().default(false),
    logoUrl: text('logo_url'),
    primaryColor: varchar('primary_color', { length: 7 }),
    secondaryColor: varchar('secondary_color', { length: 7 }),
    /** Team logo / avatar image URL — editable by the GM from the My Team page */
    avatarUrl: text('avatar_url'),
    /** Team banner / header image URL — editable by the GM from the My Team page */
    bannerUrl: text('banner_url'),
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
    pickTimeLimitSeconds: integer('pick_time_limit_seconds')
      .notNull()
      .default(120),
    currentPickDeadline: timestamp('current_pick_deadline', {
      withTimezone: true,
    }),
    draftStartedAt: timestamp('draft_started_at', { withTimezone: true }),
    draftCompletedAt: timestamp('draft_completed_at', { withTimezone: true }),
    /** Scheduled start time set by the commissioner (LS-423). Draft auto-starts at this time. */
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    /** When true, the commissioner has disabled auto-pick for the entire draft (LS-481).
     *  - autoProcessDraftPicks will not fire for this draft when deadlines expire.
     *  - Individual team auto-pick toggles are blocked while this flag is set.
     */
    autoPickDisabled: boolean('auto_pick_disabled').notNull().default(false),
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
    timestamp: timestamp('timestamp', {
      withTimezone: true,
      mode: 'string',
    }).defaultNow(),
    id: serial('id').primaryKey().notNull(),
    userId: integer('user_id'),
    messageType: varchar('message_type', { length: 50 })
      .notNull()
      .default('text'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    /** URL of GIF attachment; null for text messages */
    gifUrl: text('gif_url'),
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
      }).onDelete('cascade'),
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
    autoPick: boolean('auto_pick').notNull().default(false),
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
    /** Winning auction bid amount. Null for non-auction drafts. (LS-634) */
    bidAmount: integer('bid_amount'),
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
      }).onDelete('cascade'),
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

/**
 * Draft queue — prioritised list of players a user wants auto-pick to select
 * on their behalf (LS-473). Ordered by `priority` ASC; the auto-pick engine
 * picks the first available, eligible, undrafted entry before falling back
 * to the FPG × positional-scarcity algorithm.
 */
export const draftQueue = pgTable(
  'draft_queue',
  {
    id: serial('id').primaryKey().notNull(),
    draftId: integer('draft_id').notNull(),
    teamId: integer('team_id').notNull(),
    playerId: integer('player_id').notNull(),
    priority: integer('priority').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      draftQueueDraftsIdFk: foreignKey({
        columns: [table.draftId],
        foreignColumns: [drafts.id],
        name: 'draft_queue_drafts_id_fk',
      }).onDelete('cascade'),
      draftQueuePlayersIdFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'draft_queue_players_id_fk',
      }).onDelete('cascade'),
      draftQueueUkDraftTeamPlayer: unique(
        'draft_queue_uk_draft_team_player',
      ).on(table.draftId, table.teamId, table.playerId),
      draftQueueUkDraftTeamPriority: unique(
        'draft_queue_uk_draft_team_priority',
      ).on(table.draftId, table.teamId, table.priority),
      draftQueueDraftTeamIdx: index('draft_queue_draft_team_idx').on(
        table.draftId,
        table.teamId,
      ),
      draftQueuePlayerIdx: index('draft_queue_player_idx').on(table.playerId),
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
      }).onDelete('cascade'),
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
    onTradeBlock: boolean('on_trade_block').notNull().default(false),
    /** Current salary cap hit for this player on this team. Null in non-salary-cap leagues. (LS-634) */
    salary: integer('salary'),
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
      }).onDelete('cascade'),
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
      }).onDelete('cascade'),
      rosterLockRulesLeagueUk: unique('roster_lock_rules_league_uk').on(
        table.leagueId,
      ),
    };
  },
);

// ── Trade Offers ───────────────────────────────────────────────────────────

/**
 * A trade proposal from one team (proposing) to another (receiving).
 * Each offer can carry multiple players on both sides via tradeOfferPlayers.
 *
 * Status lifecycle:
 *   pending → accepted | rejected | cancelled | vetoed | expired
 */
export const tradeOffers = pgTable(
  'trade_offers',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    proposingTeamId: integer('proposing_team_id').notNull(),
    receivingTeamId: integer('receiving_team_id').notNull(),
    status: tradeOfferStatus('status').notNull().default('pending'),
    message: varchar('message', { length: 500 }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    vetoedAt: timestamp('vetoed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      tradeOffersLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'trade_offers_league_fk',
      }).onDelete('cascade'),
      tradeOffersProposingTeamFk: foreignKey({
        columns: [table.proposingTeamId],
        foreignColumns: [teams.id],
        name: 'trade_offers_proposing_team_fk',
      }).onDelete('cascade'),
      tradeOffersReceivingTeamFk: foreignKey({
        columns: [table.receivingTeamId],
        foreignColumns: [teams.id],
        name: 'trade_offers_receiving_team_fk',
      }).onDelete('cascade'),
      leagueIdIdx: index('trade_offers_league_id_idx').on(table.leagueId),
      proposingTeamIdIdx: index('trade_offers_proposing_team_id_idx').on(
        table.proposingTeamId,
      ),
      receivingTeamIdIdx: index('trade_offers_receiving_team_id_idx').on(
        table.receivingTeamId,
      ),
      statusIdx: index('trade_offers_status_idx').on(table.status),
    };
  },
);

/**
 * Individual player legs of a trade offer.
 * fromTeamId is the team that currently owns the player and will give them up
 * if the trade is accepted. This allows asymmetric multi-player trades.
 */
export const tradeOfferPlayers = pgTable(
  'trade_offer_players',
  {
    id: serial('id').primaryKey().notNull(),
    tradeOfferId: integer('trade_offer_id').notNull(),
    playerId: integer('player_id').notNull(),
    fromTeamId: integer('from_team_id').notNull(),
  },
  (table) => {
    return {
      tradeOfferPlayersTradeFk: foreignKey({
        columns: [table.tradeOfferId],
        foreignColumns: [tradeOffers.id],
        name: 'trade_offer_players_trade_fk',
      }).onDelete('cascade'),
      tradeOfferPlayersPlayerFk: foreignKey({
        columns: [table.playerId],
        foreignColumns: [players.id],
        name: 'trade_offer_players_player_fk',
      }),
      tradeOfferPlayersTeamFk: foreignKey({
        columns: [table.fromTeamId],
        foreignColumns: [teams.id],
        name: 'trade_offer_players_team_fk',
      }).onDelete('cascade'),
      tradeIdIdx: index('trade_offer_players_trade_id_idx').on(
        table.tradeOfferId,
      ),
      uniquePlayerPerOffer: unique('trade_offer_players_unique').on(
        table.tradeOfferId,
        table.playerId,
      ),
    };
  },
);

/**
 * Per-league achievement-based roster restrictions set by the commissioner.
 *
 * achievement_type is one of the well-known keys:
 *   Repeatable (integer count on player):
 *     all_star_selections | gold_gloves | silver_sluggers |
 *     mvp_awards | cy_young_awards | world_series_rings
 *   One-time (boolean on player):
 *     hall_of_fame | rookie_of_the_year
 *
 * roster_min / roster_max — number of qualifying players per roster.
 * player_min_count — minimum award count a player must have to qualify
 *   (only meaningful for repeatable types; for booleans it is always 1).
 * repeatable_roster_max — cap on the TOTAL award count summed across the
 *   whole roster (only applicable for repeatable types).
 */
export const leagueAchievementRestrictions = pgTable(
  'league_achievement_restrictions',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    achievementType: varchar('achievement_type', { length: 50 }).notNull(),
    isRepeatable: boolean('is_repeatable').notNull().default(false),
    playerMinCount: integer('player_min_count'),
    rosterMin: integer('roster_min'),
    rosterMax: integer('roster_max'),
    repeatableRosterMax: integer('repeatable_roster_max'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      larLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_achievement_restrictions_league_fk',
      }).onDelete('cascade'),
      larLeagueAchievementUk: unique('league_achievement_restrictions_uk').on(
        table.leagueId,
        table.achievementType,
      ),
      larLeagueIdIdx: index('lar_league_id_idx').on(table.leagueId),
    };
  },
);

// ─── Commissioner Audit Log ─────────────────────────────────────────────────

/**
 * Audit trail for all commissioner actions.
 * Every force move, score edit, schedule change, etc. is recorded here.
 */
export const commissionerAuditLog = pgTable(
  'commissioner_audit_log',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    userId: integer('user_id').notNull(),
    /** Action performed, e.g. 'force_add', 'force_drop', 'edit_score' */
    action: varchar('action', { length: 100 }).notNull(),
    /** Type of entity acted on: 'team', 'matchup', 'player', 'league' */
    targetType: varchar('target_type', { length: 50 }),
    targetId: integer('target_id'),
    /** JSON payload with before/after values or other context */
    details: jsonb('details').$type<Record<string, unknown>>(),
    reason: text('reason'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      calLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'commissioner_audit_log_league_fk',
      }).onDelete('cascade'),
      calLeagueIdIdx: index('commissioner_audit_log_league_id_idx').on(
        table.leagueId,
      ),
      calCreatedAtIdx: index('commissioner_audit_log_created_at_idx').on(
        table.createdAt,
      ),
    };
  },
);

// ─── Season Awards ──────────────────────────────────────────────────────────

/**
 * Commissioner-assigned season-long awards for fantasy league players.
 *
 * Awards such as League MVP, Cy Young, Gold Glove, etc. are assigned manually
 * by the commissioner at the end of a season, based on in-league performance.
 * These are NOT real MLB awards — they are fantasy-league-specific honors.
 *
 * One winner per award type per season per league.
 */
export const leagueSeasonAwards = pgTable(
  'league_season_awards',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    season: integer('season').notNull(),
    playerId: integer('player_id').notNull(),
    awardType: varchar('award_type', { length: 50 }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => {
    return {
      lsaLeagueFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_season_awards_league_fk',
      }).onDelete('cascade'),
      lsaUk: unique('league_season_awards_uk').on(
        table.leagueId,
        table.season,
        table.awardType,
      ),
      lsaLeagueSeasonIdx: index('league_season_awards_league_season_idx').on(
        table.leagueId,
        table.season,
      ),
    };
  },
);

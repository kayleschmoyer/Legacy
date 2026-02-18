import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * SQLite schema definitions for integration tests.
 * These mirror the production PostgreSQL schema but use SQLite types.
 * This allows tests to use properly-typed table references with the in-memory SQLite database.
 */

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull().unique(),
  password: text('password'),
  accessLevel: text('access_level').default('none'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const leagues = sqliteTable('leagues', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  owner: integer('owner').notNull(),
  maxRosterSize: integer('max_roster_size').default(25),
  currentMatchup: integer('current_matchup'),
  draftStatus: text('draft_status').default('not-started'),
  inviteCode: text('invite_code').notNull().unique(),
  minGamesPerSeason: integer('min_games_per_season').default(10),
  gamesPerMatchup: integer('games_per_matchup').default(5),
  tradeDeadlineWeek: integer('trade_deadline_week'),
  rosterLockTiming: text('roster_lock_timing').default('matchup_start'),
  schedulingStrategy: text('scheduling_strategy').default('round-robin'),
  createdAt: integer('created_at', { mode: 'timestamp' }),
});

export const teams = sqliteTable('teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  leagueId: integer('league_id')
    .notNull()
    .references(() => leagues.id, { onDelete: 'cascade' }),
});

export const leagueMembers = sqliteTable('league_members', {
  leagueId: integer('league_id')
    .notNull()
    .references(() => leagues.id, { onDelete: 'cascade' }),
  userId: integer('user_id').notNull(),
  teamId: integer('team_id').references(() => teams.id, {
    onDelete: 'set null',
  }),
  permissionLevel: text('permission_level'),
});

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name'),
  lastName: text('last_name'),
  brefId: text('bref_id').unique(),
});

export const matchups = sqliteTable('matchups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id')
    .notNull()
    .references(() => leagues.id, { onDelete: 'cascade' }),
  weekNumber: integer('week_number').notNull(),
  team1Id: integer('team1_id').references(() => teams.id),
  team2Id: integer('team2_id').references(() => teams.id),
  team1Score: text('team1_score'), // NUMERIC stored as text in SQLite
  team2Score: text('team2_score'),
  status: text('status'),
  selectedSeason: integer('selected_season'),
  gamesPerMatchup: integer('games_per_matchup'),
  startTime: integer('start_time', { mode: 'timestamp' }),
  endTime: integer('end_time', { mode: 'timestamp' }),
});

export const matchupPlayers = sqliteTable('matchup_players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchupId: integer('matchup_id')
    .notNull()
    .references(() => matchups.id, { onDelete: 'cascade' }),
  playerId: integer('player_id')
    .notNull()
    .references(() => players.id),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
});

export const drafts = sqliteTable('drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id')
    .notNull()
    .references(() => leagues.id, { onDelete: 'cascade' }),
  draftType: text('draft_type'),
  date: text('date'), // DATE stored as ISO string in SQLite
  draftOrder: text('draft_order').notNull(),
  currentPick: integer('current_pick').notNull().default(0),
  draftStartedAt: text('draft_started_at'), // Timestamp as ISO string
  draftCompletedAt: text('draft_completed_at'), // Timestamp as ISO string
});

export const draftTeams = sqliteTable('draft_teams', {
  draftId: integer('draft_id')
    .notNull()
    .references(() => drafts.id, { onDelete: 'cascade' }),
  teamId: integer('team_id')
    .notNull()
    .references(() => teams.id),
  leagueId: integer('league_id')
    .notNull()
    .references(() => leagues.id),
  draftOrder: integer('draft_order').notNull().unique(),
});

export const draftPicks = sqliteTable(
  'draft_picks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    draftId: integer('draft_id')
      .notNull()
      .references(() => drafts.id, { onDelete: 'cascade' }),
    teamId: integer('team_id')
      .notNull()
      .references(() => teams.id),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    round: integer('round').notNull(),
    pickNumber: integer('pick_number').notNull(),
    overallPick: integer('overall_pick').notNull(),
    pickedAt: text('picked_at').notNull(), // Timestamp as ISO string
  },
  (table) => ({
    uniqueDraftPlayer: unique().on(table.draftId, table.playerId),
    uniqueOverallPick: unique().on(table.draftId, table.overallPick),
  }),
);

export const teamMembers = sqliteTable(
  'team_members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    teamId: integer('team_id').references(() => teams.id, {
      onDelete: 'cascade',
    }),
    leagueId: integer('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    playerId: integer('player_id')
      .notNull()
      .references(() => players.id),
    positionId: integer('position_id'),
    draftRound: integer('draft_round'),
    draftPick: integer('draft_pick'),
    acquisitionType: text('acquisition_type').default('draft'),
  },
  (table) => ({
    uniqueTeamPlayer: unique().on(table.teamId, table.playerId),
  }),
);

// Export all tables as a schema object for easier imports
export const integrationTestSchema = {
  users,
  leagues,
  teams,
  leagueMembers,
  players,
  teamMembers,
  matchups,
  matchupPlayers,
  drafts,
  draftTeams,
  draftPicks,
};

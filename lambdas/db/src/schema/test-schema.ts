/**
 * SQLite schema definitions for integration tests
 *
 * These mirror the PostgreSQL schema but use SQLite table definitions
 * so they work with the better-sqlite3 test database.
 */

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  leagueId: integer('league_id').notNull(),
});

export const leagueMembers = sqliteTable('league_members', {
  leagueId: integer('league_id').notNull(),
  userId: integer('user_id').notNull(),
  teamId: integer('team_id'),
  permissionLevel: text('permission_level'),
});

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  brefId: text('bref_id').notNull().unique(),
});

export const teamMembers = sqliteTable('team_members', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  teamId: integer('team_id').notNull(),
  leagueId: integer('league_id').notNull(),
  playerId: integer('player_id').notNull(),
  positionId: integer('position_id'),
});

export const matchups = sqliteTable('matchups', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id').notNull(),
  weekNumber: integer('week_number').notNull(),
  team1Id: integer('team1_id').notNull(),
  team2Id: integer('team2_id').notNull(),
  team1Score: text('team1_score'),
  team2Score: text('team2_score'),
  status: text('status').notNull().default('scheduled'),
  selectedSeason: integer('selected_season'),
  gamesPerMatchup: integer('games_per_matchup'),
  startTime: text('start_time'),
  endTime: text('end_time'),
});

export const matchupPlayers = sqliteTable('matchup_players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  matchupId: integer('matchup_id').notNull(),
  playerId: integer('player_id').notNull(),
  teamId: integer('team_id').notNull(),
});

export const drafts = sqliteTable('drafts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id').notNull(),
  draftType: text('draft_type').notNull(),
  date: text('date'),
  draftOrder: text('draft_order').notNull(),
});

export const draftTeams = sqliteTable('draft_teams', {
  draftId: integer('draft_id').notNull(),
  teamId: integer('team_id').notNull(),
  leagueId: integer('league_id').notNull(),
  draftOrder: integer('draft_order').notNull(),
});

export const leaguePositions = sqliteTable('league_positions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  leagueId: integer('league_id').notNull(),
  positionType: text('position_type').notNull(),
});

// Export all tables as a single schema object
export const testSchema = {
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
  leaguePositions,
};

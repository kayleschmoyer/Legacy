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
} from 'drizzle-orm/pg-core';
import {
  draftOrder,
  draftType,
  leaguePermissionLevel,
  positionSlot,
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
  },
  (table) => {
    return {};
  }
);

export const teams = pgTable(
  'teams',
  {
    id: serial('id').primaryKey().notNull(),
    name: varchar('name').notNull(),
    leagueId: integer('league_id').notNull(),
  },
  (table) => {
    return {
      teamsLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'teams_leagues_id_fk',
      }),
      teamsUkIdLeagueId: unique('teams_uk_id_league_id').on(
        table.id,
        table.leagueId
      ),
    };
  }
);

export const drafts = pgTable(
  'drafts',
  {
    id: serial('id').primaryKey().notNull(),
    leagueId: integer('league_id').notNull(),
    draftType: draftType('draft_type').notNull(),
    date: date('date'),
    draftOrder: draftOrder('draft_order').default('snake').notNull(),
  },
  (table) => {
    return {
      draftsLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'drafts_leagues_id_fk',
      }),
    };
  }
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
        table.timestamp.asc().nullsLast()
      ),
      leagueMessagesLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_messages_leagues_id_fk',
      }),
    };
  }
);

export const leagueMembers = pgTable(
  'league_members',
  {
    leagueId: integer('league_id').notNull(),
    teamId: integer('team_id'),
    permissionLevel: leaguePermissionLevel('permission_level').notNull(),
    userId: integer('user_id').notNull(),
  },
  (table) => {
    return {
      leagueMembersLeaguesIdFk: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'league_members_leagues_id_fk',
      }),
      leagueMembersPk: primaryKey({
        columns: [table.leagueId, table.userId],
        name: 'league_members_pk',
      }),
    };
  }
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
      }),
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
        table.draftOrder
      ),
    };
  }
);

export const leaguePosition = pgTable(
  'league_positions',
  {
    id: serial('id').primaryKey().notNull(),
    teamId: integer('league_id').notNull(),
    positionType: positionSlot('position_type').notNull(),
  },
  (table) => {
    return {
      leaguePositionLeagueFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [leagues.id],
        name: 'league_position_league_fk',
      }),
    };
  }
);

export const teamMembers = pgTable(
  'team_members',
  {
    id: serial('id').primaryKey().notNull(),
    teamId: integer('team_id'),
    leagueId: integer('league_id').notNull(),
    playerId: integer('player_id').notNull(),
    positionId: integer('position_id'),
  },
  (table) => {
    return {
      teamMembersTeamsFk: foreignKey({
        columns: [table.teamId],
        foreignColumns: [teams.id],
        name: 'team_members_teams_fk',
      }),
      teamMembersLeagueFK: foreignKey({
        columns: [table.leagueId],
        foreignColumns: [leagues.id],
        name: 'team_members_league_fk',
      }),

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
    };
  }
);

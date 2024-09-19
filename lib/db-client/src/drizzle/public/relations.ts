import { relations } from 'drizzle-orm/relations';
import {
  leagues,
  teams,
  drafts,
  usersInAppInternal,
  leagueMessages,
  leagueMembers,
  draftTeams,
  players,
  seasonFielding,
  seasonBatting,
  seasonPitching,
} from './schema';

export const teamsRelations = relations(teams, ({ one, many }) => ({
  league: one(leagues, {
    fields: [teams.leagueId],
    references: [leagues.id],
  }),
  draftTeams: many(draftTeams),
}));

export const leaguesRelations = relations(leagues, ({ one, many }) => ({
  teams: many(teams),
  drafts: many(drafts),
  usersInAppInternal: one(usersInAppInternal, {
    fields: [leagues.owner],
    references: [usersInAppInternal.id],
  }),
  leagueMessages: many(leagueMessages),
  leagueMembers: many(leagueMembers),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  league: one(leagues, {
    fields: [drafts.leagueId],
    references: [leagues.id],
  }),
  draftTeams: many(draftTeams),
}));

export const usersInAppInternalRelations = relations(
  usersInAppInternal,
  ({ many }) => ({
    leagues: many(leagues),
    leagueMessages: many(leagueMessages),
  })
);

export const leagueMessagesRelations = relations(leagueMessages, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMessages.leagueId],
    references: [leagues.id],
  }),
  usersInAppInternal: one(usersInAppInternal, {
    fields: [leagueMessages.userId],
    references: [usersInAppInternal.id],
  }),
}));

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMembers.leagueId],
    references: [leagues.id],
  }),
}));

export const draftTeamsRelations = relations(draftTeams, ({ one }) => ({
  draft: one(drafts, {
    fields: [draftTeams.draftId],
    references: [drafts.id],
  }),
  team: one(teams, {
    fields: [draftTeams.teamId],
    references: [teams.id],
  }),
}));

export const seasonFieldingRelations = relations(seasonFielding, ({ one }) => ({
  player: one(players, {
    fields: [seasonFielding.playerId],
    references: [players.id],
  }),
}));

export const playersRelations = relations(players, ({ many }) => ({
  seasonFieldings: many(seasonFielding),
  seasonBattings: many(seasonBatting),
  seasonPitchings: many(seasonPitching),
}));

export const seasonBattingRelations = relations(seasonBatting, ({ one }) => ({
  player: one(players, {
    fields: [seasonBatting.playerId],
    references: [players.id],
  }),
}));

export const seasonPitchingRelations = relations(seasonPitching, ({ one }) => ({
  player: one(players, {
    fields: [seasonPitching.playerId],
    references: [players.id],
  }),
}));

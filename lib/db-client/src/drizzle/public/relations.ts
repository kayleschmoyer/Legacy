import { relations } from 'drizzle-orm/relations';
import {
  leagues,
  teams,
  drafts,
  leagueMessages,
  leagueMembers,
  draftTeams,
  players,
  seasonFielding,
  seasonBatting,
  seasonPitching,
  matchups,
  matchupPlayers,
  matchupPlayerGames,
  teamMembers,
  leaguePosition,
  scoringStatDefinitions,
  leagueScoringProfiles,
  leagueScoringProfileEntries,
  leagueScoringChangeLog,
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
  leagueMessages: many(leagueMessages),
  leagueMembers: many(leagueMembers),
  scoringProfiles: many(leagueScoringProfiles),
}));

export const draftsRelations = relations(drafts, ({ one, many }) => ({
  league: one(leagues, {
    fields: [drafts.leagueId],
    references: [leagues.id],
  }),
  draftTeams: many(draftTeams),
}));

export const leagueMessagesRelations = relations(leagueMessages, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMessages.leagueId],
    references: [leagues.id],
  }),
}));

export const leagueMembersRelations = relations(leagueMembers, ({ one }) => ({
  league: one(leagues, {
    fields: [leagueMembers.leagueId],
    references: [leagues.id],
  }),
}));

export const leagueScoringProfilesRelations = relations(
  leagueScoringProfiles,
  ({ one, many }) => ({
    league: one(leagues, {
      fields: [leagueScoringProfiles.leagueId],
      references: [leagues.id],
    }),
    entries: many(leagueScoringProfileEntries),
    changeLogs: many(leagueScoringChangeLog),
  }),
);

export const scoringStatDefinitionsRelations = relations(
  scoringStatDefinitions,
  ({ many }) => ({
    entries: many(leagueScoringProfileEntries),
    changeLogs: many(leagueScoringChangeLog),
  }),
);

export const leagueScoringProfileEntriesRelations = relations(
  leagueScoringProfileEntries,
  ({ one, many }) => ({
    profile: one(leagueScoringProfiles, {
      fields: [leagueScoringProfileEntries.profileId],
      references: [leagueScoringProfiles.id],
    }),
    statDefinition: one(scoringStatDefinitions, {
      fields: [leagueScoringProfileEntries.statDefinitionId],
      references: [scoringStatDefinitions.id],
    }),
    changeLogs: many(leagueScoringChangeLog),
  }),
);

export const leagueScoringChangeLogRelations = relations(
  leagueScoringChangeLog,
  ({ one }) => ({
    profile: one(leagueScoringProfiles, {
      fields: [leagueScoringChangeLog.profileId],
      references: [leagueScoringProfiles.id],
    }),
    statDefinition: one(scoringStatDefinitions, {
      fields: [leagueScoringChangeLog.statDefinitionId],
      references: [scoringStatDefinitions.id],
    }),
  }),
);

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

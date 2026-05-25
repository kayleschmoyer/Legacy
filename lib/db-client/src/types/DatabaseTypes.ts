import { Column, InferModelFromColumns, View } from 'drizzle-orm';
import { PgEnum } from 'drizzle-orm/pg-core';
import {
  aggregateSeasonBatting,
  aggregateSeasonFielding,
  aggregateSeasonFieldingByPos,
  aggregateSeasonPitching,
  careerBatting,
  careerFielding,
  careerFootballDefenseIdp,
  careerPitching,
  commissionerAuditLog,
  footballSeasonDefenseIdp,
  gameBatting,
  gameFielding,
  gameFootballDefense,
  gameFootballDefenseIdp,
  gameFootballKicking,
  gameFootballPassing,
  gameFootballReceiving,
  gameFootballRushing,
  gamePitching,
  leagueMembers,
  leaguePosition,
  leagues,
  leagueScoringChangeLog,
  leagueScoringProfileEntries,
  leagueScoringProfiles,
  matchupPlayerGames,
  matchupPlayers,
  matchups,
  playerEligiblePositions,
  playerPosition,
  players,
  positionSlot,
  scoringChangeAction,
  scoringProfileStatus,
  scoringStatDefinitions,
  scoringStatGroup,
  seasonBatting,
  seasonFielding,
  seasonPitching,
  teamMembers,
  teams,
  tradeOfferPlayers,
  tradeOffers,
  users,
} from '../drizzle/public/schema';
import { usersInAppInternal } from '../drizzle/internal/schema';

type ViewSelection<T> = T extends View ? T['_']['selectedFields'] : never;

type InferModelFromView<
  T extends View<string, boolean, Record<string, Column>>,
> = InferModelFromColumns<ViewSelection<T>, 'select'>;

type InferEnumValue<T> =
  T extends PgEnum<infer TValues> ? TValues[number] : never;

export type CareerBatting = InferModelFromView<typeof careerBatting>;
export type CareerFootballDefenseIdp = InferModelFromView<
  typeof careerFootballDefenseIdp
>;
export type CareerFielding = InferModelFromView<typeof careerFielding>;
export type CareerPitching = InferModelFromView<typeof careerPitching>;
export type GameBatting = typeof gameBatting.$inferSelect;
export type GameFielding = typeof gameFielding.$inferSelect;
export type GameFootballDefense = typeof gameFootballDefense.$inferSelect;
export type FootballSeasonDefenseIdp =
  typeof footballSeasonDefenseIdp.$inferSelect;
export type GameFootballDefenseIdp = typeof gameFootballDefenseIdp.$inferSelect;
export type GameFootballKicking = typeof gameFootballKicking.$inferSelect;
export type GameFootballPassing = typeof gameFootballPassing.$inferSelect;
export type GameFootballReceiving = typeof gameFootballReceiving.$inferSelect;
export type GameFootballRushing = typeof gameFootballRushing.$inferSelect;
export type GamePitching = typeof gamePitching.$inferSelect;
export type InternalUser = typeof usersInAppInternal.$inferSelect;
export type Matchup = typeof matchups.$inferSelect;
export type MatchupPlayer = typeof matchupPlayers.$inferSelect;
export type MatchupPlayerGame = typeof matchupPlayerGames.$inferSelect;
export type Player = typeof players.$inferSelect;
export type SeasonBatting = typeof seasonBatting.$inferSelect;
export type SeasonFielding = typeof seasonFielding.$inferSelect;
export type SeasonPitching = typeof seasonPitching.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamPosition = typeof leaguePosition.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type TradeOffer = typeof tradeOffers.$inferSelect;
export type TradeOfferPlayer = typeof tradeOfferPlayers.$inferSelect;
export type CreateTradeOfferInput = typeof tradeOffers.$inferInsert;
export type CreateTradeOfferPlayerInput = typeof tradeOfferPlayers.$inferInsert;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type ScoringStatDefinition = typeof scoringStatDefinitions.$inferSelect;
export type LeagueScoringProfile = typeof leagueScoringProfiles.$inferSelect;
export type LeagueScoringProfileEntry =
  typeof leagueScoringProfileEntries.$inferSelect;
export type LeagueScoringChangeLog = typeof leagueScoringChangeLog.$inferSelect;
export type CommissionerAuditLog = typeof commissionerAuditLog.$inferSelect;

export type CreatePlayerInput = typeof players.$inferInsert;
export type CreateMatchupPlayer = typeof matchupPlayers.$inferInsert;
export type CreateLeagueInput = typeof leagues.$inferInsert;
export type CreateTeamInput = typeof teams.$inferInsert;
export type CreateLeagueMemberInput = typeof leagueMembers.$inferInsert;
export type CreateScoringStatDefinitionInput =
  typeof scoringStatDefinitions.$inferInsert;
export type CreateLeagueScoringProfileInput =
  typeof leagueScoringProfiles.$inferInsert;
export type CreateLeagueScoringProfileEntryInput =
  typeof leagueScoringProfileEntries.$inferInsert;

export type PlayerEligiblePosition = InferModelFromView<
  typeof playerEligiblePositions
>;
export type AggregateSeasonBatting = InferModelFromView<
  typeof aggregateSeasonBatting
>;
export type AggregateSeasonFielding = InferModelFromView<
  typeof aggregateSeasonFielding
>;
export type AggregateSeasonFieldingByPos = InferModelFromView<
  typeof aggregateSeasonFieldingByPos
>;
export type AggregateSeasonPitching = InferModelFromView<
  typeof aggregateSeasonPitching
>;
export type PlayerPosition = InferEnumValue<typeof playerPosition>;
export type PositionSlot = InferEnumValue<typeof positionSlot>;
export type ScoringStatGroup = InferEnumValue<typeof scoringStatGroup>;
export type ScoringProfileStatus = InferEnumValue<typeof scoringProfileStatus>;
export type ScoringChangeAction = InferEnumValue<typeof scoringChangeAction>;
export type User = InferModelFromView<typeof users>;

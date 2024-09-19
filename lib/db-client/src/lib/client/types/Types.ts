import { Column, InferModelFromColumns, View } from 'drizzle-orm';
import { PgEnum } from 'drizzle-orm/pg-core';
import { usersInAppInternal } from '../../../drizzle/internal/schema';
import {
  careerBatting,
  careerFielding,
  careerPitching,
  leaguePosition,
  matchupPlayers,
  matchups,
  playerEligiblePositions,
  playerPosition,
  players,
  positionSlot,
  seasonBatting,
  seasonFielding,
  seasonPitching,
  teamMembers,
  users,
} from '../../../drizzle/public/schema';

type ViewSelection<T> = T extends View ? T['_']['selectedFields'] : never;

type InferModelFromView<
  T extends View<string, boolean, Record<string, Column>>
> = InferModelFromColumns<ViewSelection<T>, 'select'>;

type InferEnumValue<T> = T extends PgEnum<infer TValues>
  ? TValues[number]
  : never;

export type CareerBatting = InferModelFromView<typeof careerBatting>;
export type careerFielding = InferModelFromView<typeof careerFielding>;
export type CareerPitching = InferModelFromView<typeof careerPitching>;
export type InternalUser = typeof usersInAppInternal.$inferSelect;
export type Matchup = typeof matchups.$inferSelect;
export type MatchupPlayer = typeof matchupPlayers.$inferSelect;
export type Player = typeof players.$inferSelect;
export type SeasonBatting = typeof seasonBatting.$inferSelect;
export type SeasonFielding = typeof seasonFielding.$inferSelect;
export type SeasonPitching = typeof seasonPitching.$inferSelect;
export type TeamMember = typeof teamMembers.$inferSelect;
export type TeamPosition = typeof leaguePosition.$inferSelect;

export type CreatePlayerInput = typeof players.$inferInsert;
export type CreateMatchupPlayer = typeof matchupPlayers.$inferInsert;

export type PlayerEligiblePosition = InferModelFromView<
  typeof playerEligiblePositions
>;
export type PlayerPosition = InferEnumValue<typeof playerPosition>;
export type PositionSlot = InferEnumValue<typeof positionSlot>;
export type User = InferModelFromView<typeof users>;

import { and, eq, inArray, not } from 'drizzle-orm';
import { conflictUpdateAllExcept } from './utils/ConflictUpdateAllExcept';
import { TakeUniqueOrNull } from './utils/TakeUniqueOrThrow';
import { GenericDatabase } from './abstract/BaseDbClient';
import {
  AggregateSeasonBatting,
  AggregateSeasonFieldingByPos,
  AggregateSeasonPitching,
  CareerBatting,
  careerFielding,
  CareerPitching,
  CreateMatchupPlayer,
  CreatePlayerInput,
  Matchup,
  MatchupPlayer,
  Player,
  PlayerEligiblePosition,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from './types/Types';
import * as Schema from '../../drizzle/public/schema';

export const PublicSchema = Schema;

export type PublicDb = GenericDatabase<typeof Schema>;

export async function getPlayerByBrefId(
  db: PublicDb,
  brefId: string
): Promise<Player | null> {
  return await db
    .select()
    .from(Schema.players)
    .where(eq(Schema.players.brefId, brefId))
    .then(TakeUniqueOrNull);
}

export async function getCareerBattingStatsForPlayer(
  db: PublicDb,
  playerId: number
): Promise<CareerBatting | null> {
  return await db
    .select()
    .from(Schema.careerBatting)
    .where(eq(Schema.careerBatting.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getCareerFieldingStatsForPlayer(
  db: PublicDb,
  playerId: number
): Promise<careerFielding | null> {
  return await db
    .select()
    .from(Schema.careerFielding)
    .where(eq(Schema.careerFielding.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getCareerPitchingStatsForPlayer(
  db: PublicDb,
  playerId: number
): Promise<CareerPitching | null> {
  return await db
    .select()
    .from(Schema.careerPitching)
    .where(eq(Schema.careerPitching.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getAllPlayers(db: PublicDb): Promise<Player[]> {
  return await db.select().from(Schema.players);
}

export async function getPlayersOnTeams(db: PublicDb): Promise<Player[]> {
  const subSelect = db
    .select({
      playerId: Schema.teamMembers.playerId,
    })
    .from(Schema.teamMembers);

  return await db
    .select()
    .from(Schema.players)
    .where(inArray(Schema.players.id, subSelect));
}

export async function bulkUpsertBattingSeason(
  db: PublicDb,
  season: SeasonBatting[]
): Promise<SeasonBatting[]> {
  if (season.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.seasonBatting)
    .values(season)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.seasonBatting, [
        'playerId',
        'season',
        'team',
        'rowId',
      ]),
      target: [
        Schema.seasonBatting.playerId,
        Schema.seasonBatting.season,
        Schema.seasonBatting.team,
        Schema.seasonBatting.rowId,
      ],
    })
    .returning();
}

export async function bulkUpsertFieldingSeason(
  db: PublicDb,
  season: SeasonFielding[]
): Promise<SeasonFielding[]> {
  if (season.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.seasonFielding)
    .values(season)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.seasonFielding, [
        'playerId',
        'season',
        'team',
        'pos',
        'rowId',
      ]),
      target: [
        Schema.seasonFielding.playerId,
        Schema.seasonFielding.season,
        Schema.seasonFielding.team,
        Schema.seasonFielding.pos,
        Schema.seasonFielding.rowId,
      ],
    })
    .returning();
}

export async function bulkUpsertPitchingSeason(
  db: PublicDb,
  season: SeasonPitching[]
): Promise<SeasonPitching[]> {
  if (season.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.seasonPitching)
    .values(season)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.seasonPitching, [
        'playerId',
        'season',
        'team',
        'rowId',
      ]),
      target: [
        Schema.seasonPitching.playerId,
        Schema.seasonPitching.season,
        Schema.seasonPitching.team,
        Schema.seasonPitching.rowId,
      ],
    })
    .returning();
}

export async function bulkCreatePlayers(
  db: PublicDb,
  players: CreatePlayerInput[]
): Promise<Player[]> {
  if (players.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.players)
    .values(players)
    .onConflictDoUpdate({
      set: conflictUpdateAllExcept(Schema.players, ['brefId']),
      target: [Schema.players.brefId],
    })
    .returning();
}

export function getPositionsForPlayer(
  db: PublicDb,
  playerId: number
): Promise<PlayerEligiblePosition[]> {
  return db
    .select()
    .from(Schema.playerEligiblePositions)
    .where(eq(Schema.playerEligiblePositions.playerId, playerId));
}

export function getMatchupForLeague(
  db: PublicDb,
  leagueId: number,
  weekId: number
): Promise<Matchup | null> {
  return db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, weekId)
      )
    )
    .then(TakeUniqueOrNull);
}

export function getPlayersForLeague(
  db: PublicDb,
  leagueId: number
): Promise<Player[]> {
  const subQuery = db
    .select()
    .from(Schema.teamMembers)
    .where(eq(Schema.teamMembers.leagueId, leagueId))
    .as('TeamMembersForLeague');

  return db
    .select()
    .from(Schema.players)
    .where(inArray(Schema.players.id, subQuery.playerId));
}

export function getSeasonBattingStatsForPlayer(
  db: PublicDb,
  playerId: number
): Promise<SeasonBatting[]> {
  return db
    .select()
    .from(Schema.seasonBatting)
    .where(eq(Schema.seasonBatting.playerId, playerId));
}

export function getSeasonBattingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number
): Promise<AggregateSeasonBatting | null> {
  return db
    .select()
    .from(Schema.aggregateSeasonBatting)
    .where(
      and(
        eq(Schema.aggregateSeasonBatting.playerId, playerId),
        eq(Schema.aggregateSeasonBatting.season, season)
      )
    )
    .then(TakeUniqueOrNull);
}

export function getSeasonPitchingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number
): Promise<AggregateSeasonPitching | null> {
  return db
    .select()
    .from(Schema.aggregateSeasonPitching)
    .where(
      and(
        eq(Schema.aggregateSeasonPitching.playerId, playerId),
        eq(Schema.aggregateSeasonPitching.season, season)
      )
    )
    .then(TakeUniqueOrNull);
}

export function getSeasonFieldingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number
): Promise<AggregateSeasonFieldingByPos[]> {
  return db
    .select()
    .from(Schema.aggregateSeasonFieldingByPos)
    .where(
      and(
        eq(Schema.aggregateSeasonFieldingByPos.playerId, playerId),
        eq(Schema.aggregateSeasonFieldingByPos.season, season)
      )
    );
}

export function getMissingMatchupRecords(
  db: PublicDb,
  matchupId: number
): Promise<Player[]> {
  const populatedMatchups = db
    .select({
      playerId: Schema.matchupPlayers.playerId,
    })
    .from(Schema.matchupPlayers)
    .where(eq(Schema.matchupPlayers.matchupId, matchupId));

  const teamMembers = db
    .select({ playerId: Schema.teamMembers.playerId })
    .from(Schema.teamMembers)
    .innerJoin(
      Schema.matchups,
      eq(Schema.matchups.leagueId, Schema.teamMembers.leagueId)
    )
    .where(eq(Schema.matchups.id, matchupId));

  return db
    .select()
    .from(Schema.players)
    .where(
      and(
        inArray(Schema.players.id, teamMembers),
        not(inArray(Schema.players.id, populatedMatchups))
      )
    );
}

export async function createMatchupRecord(
  db: PublicDb,
  record: CreateMatchupPlayer
): Promise<MatchupPlayer> {
  const [result] = await db
    .insert(Schema.matchupPlayers)
    .values(record)
    .returning();
  return result;
}

export function getMatchup(
  db: PublicDb,
  leagueId: number,
  week: number
): Promise<Matchup | null> {
  return db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, week)
      )
    )
    .then(TakeUniqueOrNull);
}

import { and, eq, inArray, not } from 'drizzle-orm';
import { conflictUpdateAllExcept } from './utils/ConflictUpdateAllExcept';
import { TakeUniqueOrNull } from './utils/TakeUniqueOrThrow';
import { GenericDatabase } from './abstract/BaseDbClient';
import {
  AggregateSeasonBatting,
  AggregateSeasonFieldingByPos,
  AggregateSeasonPitching,
  CareerBatting,
  CareerFielding,
  CareerPitching,
  CreateMatchupPlayer,
  CreatePlayerInput,
  LeagueScoringProfile,
  LeagueScoringProfileEntry,
  Matchup,
  MatchupPlayer,
  Player,
  PlayerEligiblePosition,
  ScoringStatDefinition,
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '../../types/DatabaseTypes';
import { LeagueScoringMultipliers } from '../../types/ScoringTypes';
import * as Schema from '../../drizzle/public/schema';

export const PublicSchema = Schema;

export type PublicDb = GenericDatabase<typeof Schema>;

export interface LeagueScoringMultiplierUpdateInput {
  statDefinitionId: number;
  multiplier?: number | null;
  isEnabled?: boolean | null;
}

export async function getPlayerByBrefId(
  db: PublicDb,
  brefId: string,
): Promise<Player | null> {
  return await db
    .select()
    .from(Schema.players)
    .where(eq(Schema.players.brefId, brefId))
    .then(TakeUniqueOrNull);
}

export async function getCareerBattingStatsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<CareerBatting | null> {
  return await db
    .select()
    .from(Schema.careerBatting)
    .where(eq(Schema.careerBatting.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getCareerFieldingStatsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<CareerFielding | null> {
  return await db
    .select()
    .from(Schema.careerFielding)
    .where(eq(Schema.careerFielding.playerId, playerId))
    .then(TakeUniqueOrNull);
}

export async function getCareerPitchingStatsForPlayer(
  db: PublicDb,
  playerId: number,
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
  season: SeasonBatting[],
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
  season: SeasonFielding[],
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
  season: SeasonPitching[],
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
  players: CreatePlayerInput[],
): Promise<Player[]> {
  if (players.length === 0) {
    return [];
  }

  return await db
    .insert(Schema.players)
    .values(players)
    .onConflictDoNothing({
      target: [Schema.players.brefId],
    })
    .returning();
}

export function getPositionsForPlayer(
  db: PublicDb,
  playerId: number,
): Promise<PlayerEligiblePosition[]> {
  return db
    .select()
    .from(Schema.playerEligiblePositions)
    .where(eq(Schema.playerEligiblePositions.playerId, playerId));
}

export function getMatchupForLeague(
  db: PublicDb,
  leagueId: number,
  weekId: number,
): Promise<Matchup | null> {
  return db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, weekId),
      ),
    )
    .then(TakeUniqueOrNull);
}

export function getPlayersForLeague(
  db: PublicDb,
  leagueId: number,
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
  playerId: number,
): Promise<SeasonBatting[]> {
  return db
    .select()
    .from(Schema.seasonBatting)
    .where(eq(Schema.seasonBatting.playerId, playerId));
}

export function getSeasonBattingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<AggregateSeasonBatting | null> {
  return db
    .select()
    .from(Schema.aggregateSeasonBatting)
    .where(
      and(
        eq(Schema.aggregateSeasonBatting.playerId, playerId),
        eq(Schema.aggregateSeasonBatting.season, season),
      ),
    )
    .then(TakeUniqueOrNull);
}

export function getSeasonPitchingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<AggregateSeasonPitching | null> {
  return db
    .select()
    .from(Schema.aggregateSeasonPitching)
    .where(
      and(
        eq(Schema.aggregateSeasonPitching.playerId, playerId),
        eq(Schema.aggregateSeasonPitching.season, season),
      ),
    )
    .then(TakeUniqueOrNull);
}

export function getSeasonFieldingStatsForPlayerSeason(
  db: PublicDb,
  playerId: number,
  season: number,
): Promise<AggregateSeasonFieldingByPos[]> {
  return db
    .select()
    .from(Schema.aggregateSeasonFieldingByPos)
    .where(
      and(
        eq(Schema.aggregateSeasonFieldingByPos.playerId, playerId),
        eq(Schema.aggregateSeasonFieldingByPos.season, season),
      ),
    );
}

export function getMissingMatchupRecords(
  db: PublicDb,
  matchupId: number,
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
      eq(Schema.matchups.leagueId, Schema.teamMembers.leagueId),
    )
    .where(eq(Schema.matchups.id, matchupId));

  return db
    .select()
    .from(Schema.players)
    .where(
      and(
        inArray(Schema.players.id, teamMembers),
        not(inArray(Schema.players.id, populatedMatchups)),
      ),
    );
}

export async function createMatchupRecord(
  db: PublicDb,
  record: CreateMatchupPlayer,
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
  week: number,
): Promise<Matchup | null> {
  return db
    .select()
    .from(Schema.matchups)
    .where(
      and(
        eq(Schema.matchups.leagueId, leagueId),
        eq(Schema.matchups.weekNumber, week),
      ),
    )
    .then(TakeUniqueOrNull);
}

// Re-export player stats utilities
export {
  getPlayersWithoutStats,
  getPlayersWithStaleStats,
  getPlayersNeedingStatsRefresh,
  getStatsRefreshSummary,
  getPlayersOrderedByLastFetch,
} from './PlayerStatsUtils';

function normalizeNumeric(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function emptyLeagueMultipliers(): LeagueScoringMultipliers {
  return {
    batting: Object.create(null) as Record<string, number>,
    pitching: Object.create(null) as Record<string, number>,
    fielding: Object.create(null) as Record<string, number>,
  };
}

function assignMultiplier(
  multipliers: LeagueScoringMultipliers,
  definition: ScoringStatDefinition,
  value: number,
): void {
  switch (definition.statGroup) {
    case 'batting':
      multipliers.batting[definition.sourceColumn] = value;
      break;
    case 'pitching':
      multipliers.pitching[definition.sourceColumn] = value;
      break;
    case 'fielding':
      multipliers.fielding[definition.sourceColumn] = value;
      break;
  }
}

export async function getScoringStatDefinitions(
  db: PublicDb,
): Promise<ScoringStatDefinition[]> {
  return db.select().from(Schema.scoringStatDefinitions);
}

export async function getActiveScoringProfileForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<LeagueScoringProfile | null> {
  return db
    .select()
    .from(Schema.leagueScoringProfiles)
    .where(
      and(
        eq(Schema.leagueScoringProfiles.leagueId, leagueId),
        eq(Schema.leagueScoringProfiles.isDefault, true),
      ),
    )
    .limit(1)
    .then(TakeUniqueOrNull);
}

export async function getScoringProfileEntriesForProfile(
  db: PublicDb,
  profileId: number,
): Promise<LeagueScoringProfileEntry[]> {
  return db
    .select()
    .from(Schema.leagueScoringProfileEntries)
    .where(eq(Schema.leagueScoringProfileEntries.profileId, profileId));
}

export async function updateLeagueScoringProfileEntries(
  db: PublicDb,
  profileId: number,
  updates: LeagueScoringMultiplierUpdateInput[],
): Promise<LeagueScoringProfileEntry[]> {
  if (updates.length === 0) {
    return getScoringProfileEntriesForProfile(db, profileId);
  }

  const mergedUpdates = new Map<number, LeagueScoringMultiplierUpdateInput>();

  for (const update of updates) {
    mergedUpdates.set(update.statDefinitionId, {
      ...mergedUpdates.get(update.statDefinitionId),
      ...update,
    });
  }

  const statDefinitionIds = Array.from(mergedUpdates.keys());

  return db.transaction(async (tx) => {
    const definitions = await tx
      .select()
      .from(Schema.scoringStatDefinitions)
      .where(inArray(Schema.scoringStatDefinitions.id, statDefinitionIds));

    const definitionById = new Map(
      definitions.map((definition) => [definition.id, definition]),
    );

    const missingDefinitions = statDefinitionIds.filter(
      (id) => !definitionById.has(id),
    );

    if (missingDefinitions.length > 0) {
      throw new Error(
        `Unknown scoring stat definition ids: ${missingDefinitions.join(', ')}`,
      );
    }

    const existingEntries = await tx
      .select()
      .from(Schema.leagueScoringProfileEntries)
      .where(
        and(
          eq(Schema.leagueScoringProfileEntries.profileId, profileId),
          inArray(
            Schema.leagueScoringProfileEntries.statDefinitionId,
            statDefinitionIds,
          ),
        ),
      );

    const existingByDefinitionId = new Map(
      existingEntries.map((entry) => [entry.statDefinitionId, entry]),
    );

    const values = statDefinitionIds.map((statDefinitionId) => {
      const update = mergedUpdates.get(statDefinitionId);

      if (!update) {
        throw new Error(
          `Missing multiplier update payload for stat definition ${statDefinitionId}`,
        );
      }

      const definition = definitionById.get(statDefinitionId);

      if (!definition) {
        throw new Error(
          `Unknown scoring stat definition id: ${statDefinitionId}`,
        );
      }

      const existing = existingByDefinitionId.get(statDefinitionId);

      const resolvedMultiplier =
        update.multiplier ??
        normalizeNumeric(existing?.multiplier) ??
        normalizeNumeric(definition.defaultMultiplier);

      if (resolvedMultiplier === null) {
        throw new Error(
          `Multiplier is required for stat definition ${statDefinitionId}`,
        );
      }

      const resolvedIsEnabled =
        update.isEnabled ?? (existing ? existing.isEnabled : true);

      return {
        profileId,
        statDefinitionId,
        multiplier: resolvedMultiplier.toString(),
        isEnabled: resolvedIsEnabled,
      };
    });

    await tx
      .insert(Schema.leagueScoringProfileEntries)
      .values(values)
      .onConflictDoUpdate({
        target: [
          Schema.leagueScoringProfileEntries.profileId,
          Schema.leagueScoringProfileEntries.statDefinitionId,
        ],
        set: conflictUpdateAllExcept(Schema.leagueScoringProfileEntries, [
          'id',
          'profileId',
          'statDefinitionId',
          'createdAt',
        ]),
      });

    return tx
      .select()
      .from(Schema.leagueScoringProfileEntries)
      .where(eq(Schema.leagueScoringProfileEntries.profileId, profileId));
  });
}
export async function getScoringMultipliersForLeague(
  db: PublicDb,
  leagueId?: number | null,
): Promise<LeagueScoringMultipliers> {
  const multipliers = emptyLeagueMultipliers();
  const definitions = await getScoringStatDefinitions(db);

  let entryByDefinitionId = new Map<number, LeagueScoringProfileEntry>();

  if (leagueId !== null && leagueId !== undefined) {
    const profile = await getActiveScoringProfileForLeague(db, leagueId);

    if (profile) {
      const entries = await getScoringProfileEntriesForProfile(db, profile.id);
      entryByDefinitionId = new Map(
        entries.map((entry) => [entry.statDefinitionId, entry]),
      );
    }
  }

  for (const definition of definitions) {
    const entry = entryByDefinitionId.get(definition.id);

    if (entry && entry.isEnabled === false) {
      // Disabled stats should not contribute to scoring
      continue;
    }

    const overrideMultiplier = normalizeNumeric(entry?.multiplier);
    const defaultMultiplier = normalizeNumeric(definition.defaultMultiplier);

    if (overrideMultiplier !== null) {
      assignMultiplier(multipliers, definition, overrideMultiplier);
      continue;
    }

    if (defaultMultiplier !== null) {
      assignMultiplier(multipliers, definition, defaultMultiplier);
    }
  }

  return multipliers;
}

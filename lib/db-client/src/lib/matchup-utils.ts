/**
 * Matchup Utilities — shared between lambdas/db and lambdas/draft-processor
 *
 * Contains:
 *  - MatchupService  (schedule generation + DB persistence helpers)
 *  - selectSeasonsForPlayers (season-assignment logic)
 *  - populateMatchupPlayersAndSeasons (populates matchup_players)
 *  - createAllMatchupsForLeague (top-level orchestrator)
 *
 * These were originally spread across lambdas/db local services but are moved
 * here so the draft-processor Lambda can create matchups after an automated
 * draft completes without cross-importing between lambdas.
 */

import { LOGGER } from '@legacy-sports/logging';
import {
  determineEligibleSeasons,
  DivisionalStrategy,
  type LeagueConfig,
  MatchupScheduler,
  type PlayerGameCount,
  RandomStrategy,
  RoundRobinStrategy,
  type ScheduleResult,
  type SchedulingStrategy,
  type SeasonInfo,
  type TeamInfo,
  type TeamRoster,
} from '@legacy-sports/scheduling';
import { isNegroLeague } from '@legacy-sports/utils';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import { type GenericDatabase } from './client/abstract/BaseDbClient';
import { PublicSchema } from './client/PublicDbClient';

// ── Season Selector ──────────────────────────────────────────────────────────

export interface PlayerSeasonStats {
  playerId: number;
  season: number;
  g: number | null;
}

export interface SeasonSelection {
  leagueId: number;
  weekNumber: number;
  playerId: number;
  season: number;
}

export interface SeasonSelectionResult {
  selections: SeasonSelection[];
  skippedPlayers: Array<{
    playerId: number;
    reason: string;
    battingSeasons: string[];
    pitchingSeasons: string[];
  }>;
}

/**
 * Select random seasons for players based on their available batting, pitching,
 * and fielding stats. A player qualifies for a season if they have at least
 * minGames in ANY of: batting, pitching, or fielding.
 */
export function selectSeasonsForPlayers(
  playerIds: number[],
  battingStats: PlayerSeasonStats[],
  pitchingStats: PlayerSeasonStats[],
  fieldingStats: PlayerSeasonStats[],
  minGames: number,
  leagueId: number,
  weekNumber: number,
): SeasonSelectionResult {
  LOGGER.info('Starting season selection', {
    playerCount: playerIds.length,
    battingSeasonCount: battingStats.length,
    pitchingSeasonCount: pitchingStats.length,
    fieldingSeasonCount: fieldingStats.length,
    minGames,
  });

  // Track max games per player-season (batting, pitching, OR fielding)
  const playerSeasonGames = new Map<string, number>(); // key: "playerId-season"

  battingStats.forEach((seasonStat) => {
    const key = `${seasonStat.playerId}-${seasonStat.season}`;
    const games = seasonStat.g ?? 0;
    const currentMax = playerSeasonGames.get(key) ?? 0;
    playerSeasonGames.set(key, Math.max(currentMax, games));
  });

  pitchingStats.forEach((seasonStat) => {
    const key = `${seasonStat.playerId}-${seasonStat.season}`;
    const games = seasonStat.g ?? 0;
    const currentMax = playerSeasonGames.get(key) ?? 0;
    playerSeasonGames.set(key, Math.max(currentMax, games));
  });

  const fieldingGamesByPlayerSeason = new Map<string, number>();
  fieldingStats.forEach((seasonStat) => {
    const key = `${seasonStat.playerId}-${seasonStat.season}`;
    const games = seasonStat.g ?? 0;
    const currentTotal = fieldingGamesByPlayerSeason.get(key) ?? 0;
    fieldingGamesByPlayerSeason.set(key, currentTotal + games);
  });

  fieldingGamesByPlayerSeason.forEach((games, key) => {
    const currentMax = playerSeasonGames.get(key) ?? 0;
    playerSeasonGames.set(key, Math.max(currentMax, games));
  });

  LOGGER.debug('Player-season game counts calculated', {
    uniquePlayerSeasons: playerSeasonGames.size,
  });

  const seasonsByPlayer = new Map<number, number[]>();

  playerSeasonGames.forEach((games, key) => {
    if (games >= minGames) {
      const [playerIdStr, seasonStr] = key.split('-');
      const playerId = parseInt(playerIdStr, 10);
      const season = parseInt(seasonStr, 10);

      if (!seasonsByPlayer.has(playerId)) {
        seasonsByPlayer.set(playerId, []);
      }
      const seasons = seasonsByPlayer.get(playerId);
      if (seasons && !seasons.includes(season)) {
        seasons.push(season);
      }
    }
  });

  LOGGER.info('Eligible seasons by player', {
    playersWithSeasons: seasonsByPlayer.size,
    playersWithoutSeasons: playerIds.length - seasonsByPlayer.size,
  });

  const selections: SeasonSelection[] = [];
  const skippedPlayers: SeasonSelectionResult['skippedPlayers'] = [];

  for (const playerId of playerIds) {
    const availableSeasons = seasonsByPlayer.get(playerId) || [];

    if (availableSeasons.length === 0) {
      const playerBattingSeasons = battingStats
        .filter((s) => s.playerId === playerId)
        .map((s) => `${s.season}(${s.g}g)`);
      const playerPitchingSeasons = pitchingStats
        .filter((s) => s.playerId === playerId)
        .map((s) => `${s.season}(${s.g}g)`);

      const fieldingBySeasonMap = new Map<number, number>();
      fieldingStats
        .filter((s) => s.playerId === playerId)
        .forEach((s) => {
          const games = s.g ?? 0;
          fieldingBySeasonMap.set(
            s.season,
            (fieldingBySeasonMap.get(s.season) ?? 0) + games,
          );
        });

      const reason = `No seasons with at least ${minGames} games`;

      skippedPlayers.push({
        playerId,
        reason,
        battingSeasons: playerBattingSeasons,
        pitchingSeasons: playerPitchingSeasons,
      });

      LOGGER.warn(`No eligible seasons for player ${playerId}`, {
        minGamesRequired: minGames,
        battingSeasons: playerBattingSeasons,
        pitchingSeasons: playerPitchingSeasons,
      });
      continue;
    }

    const seasonIdx = Math.floor(Math.random() * availableSeasons.length);
    const selectedSeason = availableSeasons[seasonIdx];

    selections.push({
      leagueId,
      weekNumber,
      playerId,
      season: selectedSeason,
    });

    LOGGER.debug(`Selected season ${selectedSeason} for player ${playerId}`, {
      availableSeasons,
    });
  }

  LOGGER.info('Season selection completed', {
    selectionsCreated: selections.length,
    playersSkipped: skippedPlayers.length,
  });

  return { selections, skippedPlayers };
}

// ── MatchupService ────────────────────────────────────────────────────────────

export interface GenerateScheduleParams {
  leagueId: number;
  numberOfWeeks: number;
  strategyType: 'round-robin' | 'divisional' | 'random';
}

export interface CreateMatchupParams {
  leagueId: number;
  weekNumber: number;
  team1Id: number | null;
  team2Id: number | null;
  gamesPerMatchup: number | null;
  spStartsPerMatchup?: number | null;
  status?: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
}

export class MatchupService {
  /**
   * Generate a complete schedule for a league.
   */
  static async generateSchedule(
    db: GenericDatabase<typeof PublicSchema>,
    params: GenerateScheduleParams,
  ): Promise<ScheduleResult> {
    const { leagueId, numberOfWeeks, strategyType } = params;

    const leagueResult = await db
      .select({
        id: PublicSchema.leagues.id,
        minGamesPerSeason: PublicSchema.leagues.minGamesPerSeason,
        gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    if (leagueResult.length === 0) {
      throw new Error(`League ${leagueId} not found`);
    }

    const league = leagueResult[0];
    const leagueConfig: LeagueConfig = {
      id: league.id,
      minGamesPerSeason: league.minGamesPerSeason ?? 10,
      gamesPerMatchup: league.gamesPerMatchup ?? 5,
    };

    const teamsResult = await db
      .select({
        id: PublicSchema.teams.id,
        name: PublicSchema.teams.name,
        leagueId: PublicSchema.teams.leagueId,
        divisionId: PublicSchema.teams.divisionId,
      })
      .from(PublicSchema.teams)
      .where(eq(PublicSchema.teams.leagueId, leagueId));

    const teams: TeamInfo[] = teamsResult.map((t) => ({
      id: t.id,
      name: t.name,
      leagueId: t.leagueId,
      divisionId: t.divisionId ?? undefined,
    }));

    if (teams.length < 2) {
      return {
        matchups: [],
        seasonUsage: new Map(),
        warnings: ['League must have at least 2 teams to generate schedule'],
      };
    }

    const teamIds = teams.map((t) => t.id);
    const teamMembersResult = await db
      .select({
        teamId: PublicSchema.teamMembers.teamId,
        playerId: PublicSchema.teamMembers.playerId,
      })
      .from(PublicSchema.teamMembers)
      .where(
        and(
          inArray(PublicSchema.teamMembers.teamId, teamIds),
          eq(PublicSchema.teamMembers.leagueId, leagueId),
        ),
      );

    const teamRosters: TeamRoster[] = [];
    const teamPlayerMap = new Map<number, number[]>();

    for (const tm of teamMembersResult) {
      if (!tm.teamId) continue;
      if (!teamPlayerMap.has(tm.teamId)) {
        teamPlayerMap.set(tm.teamId, []);
      }
      const playerList = teamPlayerMap.get(tm.teamId);
      if (playerList) {
        playerList.push(tm.playerId);
      }
    }

    for (const teamId of teamIds) {
      teamRosters.push({
        teamId,
        playerIds: teamPlayerMap.get(teamId) ?? [],
      });
    }

    const allPlayerIds = Array.from(
      new Set(teamMembersResult.map((tm) => tm.playerId)),
    );

    if (allPlayerIds.length === 0) {
      return {
        matchups: [],
        seasonUsage: new Map(),
        warnings: [
          'No players found on teams. Cannot determine eligible seasons.',
        ],
      };
    }

    const battingStats = await db
      .select({
        playerId: PublicSchema.seasonBatting.playerId,
        season: PublicSchema.seasonBatting.season,
        g: PublicSchema.seasonBatting.g,
      })
      .from(PublicSchema.seasonBatting)
      .where(inArray(PublicSchema.seasonBatting.playerId, allPlayerIds));

    const fieldingStats = await db
      .select({
        playerId: PublicSchema.seasonFielding.playerId,
        season: PublicSchema.seasonFielding.season,
        g: PublicSchema.seasonFielding.g,
      })
      .from(PublicSchema.seasonFielding)
      .where(inArray(PublicSchema.seasonFielding.playerId, allPlayerIds));

    const gameCountMap = new Map<string, number>();

    for (const stat of battingStats) {
      const key = `${stat.playerId}-${stat.season}`;
      const games = stat.g ?? 0;
      gameCountMap.set(key, Math.max(gameCountMap.get(key) ?? 0, games));
    }

    for (const stat of fieldingStats) {
      const key = `${stat.playerId}-${stat.season}`;
      const games = stat.g ?? 0;
      gameCountMap.set(key, Math.max(gameCountMap.get(key) ?? 0, games));
    }

    const playerGameCounts: PlayerGameCount[] = [];
    for (const [key, count] of gameCountMap) {
      const [playerIdStr, seasonStr] = key.split('-');
      playerGameCounts.push({
        playerId: parseInt(playerIdStr),
        season: parseInt(seasonStr),
        gamesPlayed: count,
      });
    }

    const eligibleSeasons: SeasonInfo[] = determineEligibleSeasons({
      teamRosters,
      playerGameCounts,
      minGamesPerSeason: leagueConfig.minGamesPerSeason,
    });

    const strategy = this.createStrategy(strategyType);
    const scheduler = new MatchupScheduler(strategy);
    const scheduleResult = scheduler.generateSchedule({
      teams,
      numberOfWeeks,
      leagueConfig,
      eligibleSeasons,
    });

    return scheduleResult;
  }

  /**
   * Save generated schedule to database (replaces any existing matchups).
   */
  static async saveSchedule(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    scheduleResult: ScheduleResult,
  ): Promise<void> {
    await db
      .delete(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.leagueId, leagueId));

    const leagueSettings = await db
      .select({
        gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
        spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
      })
      .from(PublicSchema.leagues)
      .where(eq(PublicSchema.leagues.id, leagueId))
      .limit(1);

    const gamesPerMatchup = leagueSettings[0]?.gamesPerMatchup ?? 5;
    const spStartsPerMatchup = leagueSettings[0]?.spStartsPerMatchup ?? 1;

    for (const matchup of scheduleResult.matchups) {
      await db.insert(PublicSchema.matchups).values({
        weekNumber: matchup.weekNumber,
        leagueId: matchup.leagueId,
        team1Id: matchup.team1Id,
        team2Id: matchup.team2Id,
        gamesPerMatchup,
        spStartsPerMatchup,
        status: matchup.status,
        team1Score: null,
        team2Score: null,
        startTime: null,
        endTime: null,
      });
    }
  }

  /**
   * Generate and save schedule in one operation.
   */
  static async generateAndSaveSchedule(
    db: GenericDatabase<typeof PublicSchema>,
    params: GenerateScheduleParams,
  ): Promise<ScheduleResult> {
    const scheduleResult = await this.generateSchedule(db, params);
    await this.saveSchedule(db, params.leagueId, scheduleResult);
    return scheduleResult;
  }

  /**
   * Create a single matchup row.
   */
  static async createMatchup(
    db: GenericDatabase<typeof PublicSchema>,
    params: CreateMatchupParams,
  ): Promise<number> {
    const result = await db
      .insert(PublicSchema.matchups)
      .values({
        weekNumber: params.weekNumber,
        leagueId: params.leagueId,
        team1Id: params.team1Id,
        team2Id: params.team2Id,
        gamesPerMatchup: params.gamesPerMatchup,
        spStartsPerMatchup: params.spStartsPerMatchup ?? null,
        status: params.status ?? 'scheduled',
        team1Score: null,
        team2Score: null,
        startTime: null,
        endTime: null,
      })
      .returning({ id: PublicSchema.matchups.id });

    return result[0].id;
  }

  /** Get all matchups for a league. */
  static async getLeagueMatchups(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
  ) {
    return await db
      .select()
      .from(PublicSchema.matchups)
      .where(eq(PublicSchema.matchups.leagueId, leagueId));
  }

  /** Get matchups for a specific week. */
  static async getWeekMatchups(
    db: GenericDatabase<typeof PublicSchema>,
    leagueId: number,
    weekNumber: number,
  ) {
    return await db
      .select()
      .from(PublicSchema.matchups)
      .where(
        and(
          eq(PublicSchema.matchups.leagueId, leagueId),
          eq(PublicSchema.matchups.weekNumber, weekNumber),
        ),
      );
  }

  private static createStrategy(
    strategyType: 'round-robin' | 'divisional' | 'random',
  ): SchedulingStrategy {
    switch (strategyType) {
      case 'round-robin':
        return new RoundRobinStrategy();
      case 'divisional':
        return new DivisionalStrategy({ divisionalGamePercentage: 1.0 });
      case 'random':
        return new RandomStrategy();
    }
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Populate matchup_players and assign seasons for a set of matchups.
 *
 * For each matchup in a given week:
 * 1. Copies team_members into matchup_players (with their positions)
 * 2. Assigns random historical seasons per player per week
 *
 * Exported so lambdas/db can use it in `adjustMatchupsForNewTotal` without
 * maintaining a duplicate local copy.
 */
export async function populateMatchupPlayersAndSeasons(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
  matchupRows: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
  }>,
  gamesPerMatchup: number,
): Promise<void> {
  const matchupsByWeek = new Map<number, typeof matchupRows>();
  for (const m of matchupRows) {
    if (!matchupsByWeek.has(m.weekNumber)) {
      matchupsByWeek.set(m.weekNumber, []);
    }
    const weekList = matchupsByWeek.get(m.weekNumber);
    if (weekList) weekList.push(m);
  }

  const allTeamMembers = await db
    .select({
      teamId: PublicSchema.teamMembers.teamId,
      playerId: PublicSchema.teamMembers.playerId,
      positionId: PublicSchema.teamMembers.positionId,
    })
    .from(PublicSchema.teamMembers)
    .where(eq(PublicSchema.teamMembers.leagueId, leagueId));

  const teamPlayersMap = new Map<
    number,
    Array<{ playerId: number; positionId: number | null }>
  >();
  for (const tm of allTeamMembers) {
    if (!tm.teamId) continue;
    if (!teamPlayersMap.has(tm.teamId)) {
      teamPlayersMap.set(tm.teamId, []);
    }
    const teamList = teamPlayersMap.get(tm.teamId);
    if (teamList)
      teamList.push({
        playerId: tm.playerId,
        positionId: tm.positionId,
      });
  }

  const allPlayerIds = Array.from(
    new Set(allTeamMembers.map((tm) => tm.playerId)),
  );

  if (allPlayerIds.length === 0) return;

  const minGames = gamesPerMatchup * 2;
  const [allBattingSeasons, allPitchingSeasons, allFieldingSeasons] =
    await Promise.all([
      db
        .select({
          playerId: PublicSchema.seasonBatting.playerId,
          season: PublicSchema.seasonBatting.season,
          g: PublicSchema.seasonBatting.g,
          lgId: PublicSchema.seasonBatting.lgId,
        })
        .from(PublicSchema.seasonBatting)
        .where(
          and(
            inArray(PublicSchema.seasonBatting.playerId, allPlayerIds),
            isNotNull(PublicSchema.seasonBatting.g),
          ),
        )
        .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
      db
        .select({
          playerId: PublicSchema.seasonPitching.playerId,
          season: PublicSchema.seasonPitching.season,
          g: PublicSchema.seasonPitching.g,
          lgId: PublicSchema.seasonPitching.lgId,
        })
        .from(PublicSchema.seasonPitching)
        .where(
          and(
            inArray(PublicSchema.seasonPitching.playerId, allPlayerIds),
            isNotNull(PublicSchema.seasonPitching.g),
          ),
        )
        .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
      db
        .select({
          playerId: PublicSchema.seasonFielding.playerId,
          season: PublicSchema.seasonFielding.season,
          g: PublicSchema.seasonFielding.g,
          lgId: PublicSchema.seasonFielding.lgId,
        })
        .from(PublicSchema.seasonFielding)
        .where(
          and(
            inArray(PublicSchema.seasonFielding.playerId, allPlayerIds),
            isNotNull(PublicSchema.seasonFielding.g),
          ),
        )
        .then((rows) => rows.filter((row) => !isNegroLeague(row.lgId))),
    ]);

  const sortedWeeks = Array.from(matchupsByWeek.keys()).sort((a, b) => a - b);

  for (const weekNumber of sortedWeeks) {
    const weekMatchups = matchupsByWeek.get(weekNumber) ?? [];

    for (const matchup of weekMatchups) {
      const playersToInsert: Array<{
        matchupId: number;
        playerId: number;
        teamId: number;
        positionId: number | null;
      }> = [];

      for (const teamId of [matchup.team1Id, matchup.team2Id]) {
        if (!teamId) continue;
        const players = teamPlayersMap.get(teamId) ?? [];
        for (const p of players) {
          playersToInsert.push({
            matchupId: matchup.id,
            playerId: p.playerId,
            teamId,
            positionId: p.positionId,
          });
        }
      }

      if (playersToInsert.length > 0) {
        await db.insert(PublicSchema.matchupPlayers).values(playersToInsert);
      }
    }

    const weekPlayerIds = new Set<number>();
    for (const matchup of weekMatchups) {
      for (const teamId of [matchup.team1Id, matchup.team2Id]) {
        if (!teamId) continue;
        const players = teamPlayersMap.get(teamId) ?? [];
        for (const p of players) {
          weekPlayerIds.add(p.playerId);
        }
      }
    }

    const playerIdsForWeek = Array.from(weekPlayerIds);
    if (playerIdsForWeek.length === 0) continue;

    const selectionResult = selectSeasonsForPlayers(
      playerIdsForWeek,
      allBattingSeasons,
      allPitchingSeasons,
      allFieldingSeasons,
      minGames,
      leagueId,
      weekNumber,
    );

    if (selectionResult.selections.length > 0) {
      await db
        .insert(PublicSchema.leagueWeekPlayerSeasons)
        .values(selectionResult.selections);
    }

    if (selectionResult.skippedPlayers.length > 0) {
      LOGGER.warn('Some players could not be assigned seasons', {
        leagueId,
        weekNumber,
        skippedCount: selectionResult.skippedPlayers.length,
      });
    }
  }
}

// ── createAllMatchupsForLeague ────────────────────────────────────────────────

/**
 * Create all matchups for a league at once.
 *
 * Uses the scheduling library to generate a full round-robin schedule,
 * inserts all matchups, populates matchup_players, and assigns seasons.
 * Sets the league's currentMatchup to the first week-1 matchup.
 *
 * Called from:
 *  - lambdas/db  — pick-by-pick draft completion flow (via GraphQL)
 *  - lambdas/draft-processor — automated draft completion flow (via SQS)
 */
export async function createAllMatchupsForLeague(
  db: GenericDatabase<typeof PublicSchema>,
  leagueId: number,
): Promise<{ matchupCount: number; currentMatchupId: number | null }> {
  const leagueResult = await db
    .select({
      id: PublicSchema.leagues.id,
      totalMatchups: PublicSchema.leagues.totalMatchups,
      gamesPerMatchup: PublicSchema.leagues.gamesPerMatchup,
      spStartsPerMatchup: PublicSchema.leagues.spStartsPerMatchup,
      schedulingStrategy: PublicSchema.leagues.schedulingStrategy,
    })
    .from(PublicSchema.leagues)
    .where(eq(PublicSchema.leagues.id, leagueId))
    .limit(1);

  if (!leagueResult[0]) {
    throw new Error('League not found');
  }

  const league = leagueResult[0];
  const totalMatchups = league.totalMatchups ?? 10;
  const gamesPerMatchup = league.gamesPerMatchup ?? 5;
  const spStartsPerMatchup = league.spStartsPerMatchup ?? 1;
  const strategyType = league.schedulingStrategy ?? 'round-robin';

  const scheduleResult = await MatchupService.generateSchedule(db, {
    leagueId,
    numberOfWeeks: totalMatchups,
    strategyType,
  });

  if (scheduleResult.matchups.length === 0) {
    LOGGER.warn('No matchups generated', {
      leagueId,
      totalMatchups,
      warnings: scheduleResult.warnings,
    });
    return { matchupCount: 0, currentMatchupId: null };
  }

  const insertedMatchups: Array<{
    id: number;
    weekNumber: number;
    team1Id: number | null;
    team2Id: number | null;
  }> = [];

  for (const matchup of scheduleResult.matchups) {
    const result = await db
      .insert(PublicSchema.matchups)
      .values({
        leagueId,
        weekNumber: matchup.weekNumber,
        team1Id: matchup.team1Id,
        team2Id: matchup.team2Id,
        gamesPerMatchup,
        spStartsPerMatchup,
        status: 'scheduled',
        team1Score: null,
        team2Score: null,
        startTime: null,
        endTime: null,
      })
      .returning({
        id: PublicSchema.matchups.id,
        weekNumber: PublicSchema.matchups.weekNumber,
        team1Id: PublicSchema.matchups.team1Id,
        team2Id: PublicSchema.matchups.team2Id,
      });

    insertedMatchups.push(result[0]);
  }

  await populateMatchupPlayersAndSeasons(
    db,
    leagueId,
    insertedMatchups,
    gamesPerMatchup,
  );

  const week1Matchup = insertedMatchups.find((m) => m.weekNumber === 1);
  const currentMatchupId = week1Matchup?.id ?? insertedMatchups[0]?.id ?? null;

  await db
    .update(PublicSchema.leagues)
    .set({
      currentMatchup: currentMatchupId ?? undefined,
      weekAdvanceStatus: 'success',
    })
    .where(eq(PublicSchema.leagues.id, leagueId));

  LOGGER.info('Created all matchups for league', {
    leagueId,
    totalMatchups,
    matchupCount: insertedMatchups.length,
    currentMatchupId,
  });

  return { matchupCount: insertedMatchups.length, currentMatchupId };
}

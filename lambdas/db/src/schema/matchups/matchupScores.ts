/**
 * matchupScores query — returns per-team, per-player fantasy point breakdowns
 * for a given league week.
 *
 * Returns a MatchupStats union: BaseballMatchupStats for baseball leagues or
 * FootballMatchupStats (with DST/IDP/offense branching) for football leagues.
 */

import { and, eq, inArray } from 'drizzle-orm';
import {
  type FootballMatchupPlayerGameStats,
  getMatchupFootballPlayerGameStats,
  type PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import { LOGGER } from '@legacy-sports/logging';
import {
  aggregatePlayerStats,
  calculatePlayerScore,
  computeDefenseScore,
  computeIDPScore,
  computeScoring,
  DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
  DEFAULT_DEFENSE_SCORING,
  DEFAULT_IDP_SCORING,
  DEFAULT_KICKING_SCORING,
  DEFAULT_PASSING_SCORING,
  DEFAULT_RECEIVING_SCORING,
  DEFAULT_RUSHING_SCORING,
  getDefaultScoringSettings,
  type PlayerGameStats,
} from '@legacy-sports/scoring';

import { builder } from '../builder';
import { FootballMatchupStatsRef } from '../football';
import { AuthenticationError } from '../graphql-errors';
import { verifyLeagueMembership } from '../authorization';

type Db = PublicDb;

// ─── Discriminated union shapes ──────────────────────────────────────────────

type BaseballMatchupStatsShape = {
  _type: 'baseball';
  teamId: number;
  teamName: string;
  totalPoints: number;
  players: BaseballMatchupPlayerShape[];
};

type BaseballMatchupPlayerShape = {
  playerId: number;
  playerName: string;
  position: string;
  totalPoints: number;
};

type FootballMatchupStatsShape = {
  _type: 'football';
  teamId: number;
  teamName: string;
  totalPoints: number;
  players: FootballMatchupPlayerShape[];
};

type FootballMatchupPlayerShape = {
  playerId: number;
  playerName: string;
  position: string;
  nflTeam: string | null;
  isDst: boolean;
  games: FootballMatchupPlayerGameShape[];
  totalPoints: number;
};

type FootballMatchupPlayerGameShape = {
  gameNum: number;
  gameIdentifier: string;
  opponent: string | null;
  gameDate: string | null;
  passing: GamePassingShape | null;
  rushing: GameRushingShape | null;
  receiving: GameReceivingShape | null;
  kicking: GameKickingShape | null;
  defense: GameDefenseShape | null;
  idp: GameIDPShape | null;
  fantasyPoints: number;
};

type GamePassingShape = {
  cmp: number | null;
  att: number | null;
  yds: number | null;
  td: number | null;
  int: number | null;
};

type GameRushingShape = {
  att: number | null;
  yds: number | null;
  td: number | null;
};

type GameReceivingShape = {
  rec: number | null;
  tgt: number | null;
  yds: number | null;
  td: number | null;
};

type GameKickingShape = {
  fgm: number | null;
  fga: number | null;
  xpm: number | null;
  xpa: number | null;
};

type GameDefenseShape = {
  sacks: number | null;
  int: number | null;
  fumRec: number | null;
  defTd: number | null;
  safeties: number | null;
  ptsAllowed: number | null;
  ydsAllowed: number | null;
};

type GameIDPShape = {
  soloTkl: number | null;
  astTkl: number | null;
  sacks: number | null;
  int: number | null;
  pd: number | null;
  ff: number | null;
  fr: number | null;
  defTd: number | null;
  safeties: number | null;
};

// ─── DB-to-GraphQL / DB-to-scoring adapters ──────────────────────────────────

type OffenseRow =
  typeof PublicSchema.gameFootballPlayerOffenseStats.$inferSelect;

function adaptDefenseRow(
  row: typeof PublicSchema.gameFootballDefense.$inferSelect,
): GameDefenseShape {
  return {
    sacks: row.sacks ?? null,
    int: row.interceptions ?? null,
    fumRec: row.fumblesRec ?? null,
    defTd: row.defTd ?? null,
    safeties: row.safeties ?? null,
    ptsAllowed: row.ptsAllowed ?? null,
    ydsAllowed: row.ydsAllowed ?? null,
  };
}

function adaptIdpRow(
  row: typeof PublicSchema.gameFootballDefenseIdp.$inferSelect,
): GameIDPShape {
  return {
    soloTkl: row.soloTkl ?? null,
    astTkl: row.astTkl ?? null,
    sacks:
      row.sacks !== null && row.sacks !== undefined
        ? parseFloat(String(row.sacks))
        : null,
    int: row.interceptions ?? null,
    pd: row.pd ?? null,
    ff: row.ff ?? null,
    fr: row.fr ?? null,
    defTd: row.defTd ?? null,
    safeties: row.safeties ?? null,
  };
}

function adaptPassingFromOffense(row: OffenseRow): GamePassingShape {
  return {
    cmp: row.cmp ?? null,
    att: row.passAtt ?? null,
    yds: row.passYds ?? null,
    td: row.passTd ?? null,
    int: row.interceptions ?? null,
  };
}

function adaptRushingFromOffense(row: OffenseRow): GameRushingShape {
  return {
    att: row.rushAtt ?? null,
    yds: row.rushYds ?? null,
    td: row.rushTd ?? null,
  };
}

function adaptReceivingFromOffense(row: OffenseRow): GameReceivingShape {
  return {
    rec: row.rec ?? null,
    tgt: row.tgt ?? null,
    yds: row.recYds ?? null,
    td: row.recTd ?? null,
  };
}

function adaptKickingFromOffense(row: OffenseRow): GameKickingShape {
  return {
    fgm: row.fgm ?? null,
    fga: row.fga ?? null,
    xpm: row.xpm ?? null,
    xpa: row.xpa ?? null,
  };
}

// ─── Fantasy point computation ───────────────────────────────────────────────

/**
 * Compute fantasy points for a single player game.
 *
 * Branches on player type:
 *  - DST players (`isDst=true`): `computeDefenseScore` using sacks, turnovers, and
 *    points-allowed bands.
 *  - IDP players (`isIdp=true`): `computeIDPScore` using tackles, sacks, and
 *    defensive plays.
 *  - All other players (offense + kicking): sums `computeScoring` across whichever
 *    stat groups are present.
 *
 * @param stats  Raw Drizzle stat row(s) for one player game from `getMatchupFootballPlayerGameStats`.
 * @param isDst  True when `players.is_dst` is true (DST team defense slot).
 * @param isIdp  True when the player's position type is DL, LB, DB, or DP.
 * @returns      Fantasy point total for this single game using default scoring settings.
 */
export function computeFootballGamePoints(
  stats: FootballMatchupPlayerGameStats,
  isDst: boolean,
  isIdp: boolean,
): number {
  if (isDst && stats.defense) {
    const adapted = adaptDefenseRow(stats.defense);
    return computeDefenseScore(
      {
        sacks: adapted.sacks,
        int: adapted.int,
        fumbles_rec: adapted.fumRec,
        def_td: adapted.defTd,
        safeties: adapted.safeties,
        pts_allowed: adapted.ptsAllowed,
        yds_allowed: adapted.ydsAllowed,
      },
      DEFAULT_DEFENSE_SCORING,
      DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
    );
  }

  if (isIdp && stats.idpDefense) {
    const adapted = adaptIdpRow(stats.idpDefense);
    return computeIDPScore(
      {
        solo_tkl: adapted.soloTkl,
        ast_tkl: adapted.astTkl,
        sacks: adapted.sacks,
        int: adapted.int,
        pd: adapted.pd,
        ff: adapted.ff,
        fr: adapted.fr,
        def_td: adapted.defTd,
        safeties: adapted.safeties,
      },
      DEFAULT_IDP_SCORING,
    );
  }

  // Offense / kicking — all offensive stats are in the unified offense row
  let pts = 0;
  if (stats.offense) {
    pts += computeScoring(
      {
        yds: stats.offense.passYds,
        td: stats.offense.passTd,
        int: stats.offense.interceptions,
        sacked: stats.offense.sacked,
      },
      DEFAULT_PASSING_SCORING,
    );
    pts += computeScoring(
      {
        yds: stats.offense.rushYds,
        td: stats.offense.rushTd,
        fumbles: stats.offense.rushFumbles,
      },
      DEFAULT_RUSHING_SCORING,
    );
    pts += computeScoring(
      {
        rec: stats.offense.rec,
        yds: stats.offense.recYds,
        td: stats.offense.recTd,
        fumbles: stats.offense.recFumbles,
      },
      DEFAULT_RECEIVING_SCORING,
    );
    pts += computeScoring(
      {
        fgm: stats.offense.fgm,
        fg_50m: stats.offense.fg50m,
        xpm: stats.offense.xpm,
      },
      DEFAULT_KICKING_SCORING,
    );
  }
  return pts;
}

// ─── Football resolver ───────────────────────────────────────────────────────

/**
 * Resolve fantasy scores for all matchups in a football league week.
 *
 * For each matchup, fetches per-player, per-game stat rows from
 * `getMatchupFootballPlayerGameStats`, then applies the appropriate scoring
 * function (DST/IDP/offense) based on the player's `is_dst` flag and roster
 * position type.  Both teams are always present in the output even when no
 * stats have been loaded yet.
 *
 * @param db       Database connection.
 * @param leagueId League to look up matchups for.
 * @param weekNum  Matchup week number.
 * @returns        One `FootballMatchupStatsShape` per team slot in the week.
 */
export async function resolveFootballMatchupScores(
  db: Db,
  leagueId: number,
  weekNum: number,
): Promise<FootballMatchupStatsShape[]> {
  const matchupRows = await db
    .select({
      id: PublicSchema.matchups.id,
      team1Id: PublicSchema.matchups.team1Id,
      team2Id: PublicSchema.matchups.team2Id,
    })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        eq(PublicSchema.matchups.weekNumber, weekNum),
      ),
    );

  if (matchupRows.length === 0) return [];

  const allTeamIds = [
    ...new Set(
      matchupRows.flatMap((m) =>
        [m.team1Id, m.team2Id].filter((id): id is number => id !== null),
      ),
    ),
  ];

  const teamRows =
    allTeamIds.length > 0
      ? await db
          .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
          .from(PublicSchema.teams)
          .where(inArray(PublicSchema.teams.id, allTeamIds))
      : [];

  const teamNameMap = new Map(teamRows.map((t) => [t.id, t.name]));

  // Prefetch all per-matchup football stats concurrently to avoid sequential N+1.
  const playerGameStatsMap = new Map(
    await Promise.all(
      matchupRows.map(
        async (m) =>
          [m.id, await getMatchupFootballPlayerGameStats(db, m.id)] as const,
      ),
    ),
  );

  const allMatchupIds = matchupRows.map((m) => m.id);

  // Batch-fetch all matchup players across all matchups to avoid N+1.
  const allMatchupPlayerRows =
    allMatchupIds.length > 0
      ? await db
          .select({
            matchupPlayerId: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            teamId: PublicSchema.matchupPlayers.teamId,
            playerId: PublicSchema.matchupPlayers.playerId,
            positionType: PublicSchema.leaguePosition.positionType,
          })
          .from(PublicSchema.matchupPlayers)
          .leftJoin(
            PublicSchema.leaguePosition,
            eq(
              PublicSchema.leaguePosition.id,
              PublicSchema.matchupPlayers.positionId,
            ),
          )
          .where(inArray(PublicSchema.matchupPlayers.matchupId, allMatchupIds))
      : [];

  const matchupPlayersByMatchupId = new Map<
    number,
    typeof allMatchupPlayerRows
  >();
  for (const mp of allMatchupPlayerRows) {
    const matchupId = mp.matchupId;
    if (matchupId === null) continue;
    const list = matchupPlayersByMatchupId.get(matchupId) ?? [];
    list.push(mp);
    matchupPlayersByMatchupId.set(matchupId, list);
  }

  // Batch-fetch player details for all rostered football players.
  const allFootballPlayerIds = [
    ...new Set(
      allMatchupPlayerRows
        .map((mp) => mp.playerId)
        .filter((id): id is number => id !== null),
    ),
  ];
  const allPlayerDetailRows =
    allFootballPlayerIds.length > 0
      ? await db
          .select({
            id: PublicSchema.players.id,
            firstName: PublicSchema.players.firstName,
            lastName: PublicSchema.players.lastName,
            isDst: PublicSchema.players.isDst,
            nflTeam: PublicSchema.players.nflTeam,
          })
          .from(PublicSchema.players)
          .where(inArray(PublicSchema.players.id, allFootballPlayerIds))
      : [];
  const playerDetailMap = new Map(allPlayerDetailRows.map((p) => [p.id, p]));

  const result: FootballMatchupStatsShape[] = [];

  for (const matchup of matchupRows) {
    const playerGameStats = playerGameStatsMap.get(matchup.id) ?? [];

    const matchupPlayerRows = matchupPlayersByMatchupId.get(matchup.id) ?? [];

    const matchupPlayerInfoMap = new Map(
      matchupPlayerRows.map((mp) => [
        mp.matchupPlayerId,
        {
          teamId: mp.teamId,
          playerId: mp.playerId,
          positionType: mp.positionType,
        },
      ]),
    );

    // teamId → (playerId → accumulated data)
    const teamPlayerMap = new Map<
      number,
      Map<
        number,
        {
          positionType: string | null;
          games: FootballMatchupPlayerGameShape[];
          totalPoints: number;
        }
      >
    >();

    for (const gameStats of playerGameStats) {
      const mpInfo = matchupPlayerInfoMap.get(gameStats.matchupPlayerId);
      if (!mpInfo) continue;

      const playerDetail = playerDetailMap.get(mpInfo.playerId);
      if (!playerDetail) continue;

      const isDst = playerDetail.isDst;
      const posType = mpInfo.positionType ?? '';
      const isIdp =
        posType === 'DL' ||
        posType === 'LB' ||
        posType === 'DB' ||
        posType === 'DP';

      const fantasyPoints = computeFootballGamePoints(gameStats, isDst, isIdp);

      const gameShape: FootballMatchupPlayerGameShape = {
        gameNum: gameStats.gameNum,
        gameIdentifier: gameStats.gameIdentifier,
        opponent: null,
        gameDate: null,
        passing: gameStats.offense
          ? adaptPassingFromOffense(gameStats.offense)
          : null,
        rushing: gameStats.offense
          ? adaptRushingFromOffense(gameStats.offense)
          : null,
        receiving: gameStats.offense
          ? adaptReceivingFromOffense(gameStats.offense)
          : null,
        kicking: gameStats.offense
          ? adaptKickingFromOffense(gameStats.offense)
          : null,
        defense: gameStats.defense ? adaptDefenseRow(gameStats.defense) : null,
        idp: gameStats.idpDefense ? adaptIdpRow(gameStats.idpDefense) : null,
        fantasyPoints,
      };

      let teamPlayers = teamPlayerMap.get(mpInfo.teamId);
      if (!teamPlayers) {
        teamPlayers = new Map();
        teamPlayerMap.set(mpInfo.teamId, teamPlayers);
      }

      let playerEntry = teamPlayers.get(mpInfo.playerId);
      if (!playerEntry) {
        playerEntry = {
          positionType: mpInfo.positionType,
          games: [],
          totalPoints: 0,
        };
        teamPlayers.set(mpInfo.playerId, playerEntry);
      }

      playerEntry.games.push(gameShape);
      playerEntry.totalPoints += fantasyPoints;
    }

    // Emit one FootballMatchupStats per team that has players
    for (const [teamId, playerEntries] of teamPlayerMap.entries()) {
      const players: FootballMatchupPlayerShape[] = [];
      let teamTotal = 0;

      for (const [playerId, entry] of playerEntries.entries()) {
        const playerDetail = playerDetailMap.get(playerId);
        if (!playerDetail) continue;

        players.push({
          playerId,
          playerName:
            `${playerDetail.firstName} ${playerDetail.lastName}`.trim(),
          position: entry.positionType ?? 'FLEX',
          nflTeam: playerDetail.nflTeam ?? null,
          isDst: playerDetail.isDst,
          games: entry.games,
          totalPoints: entry.totalPoints,
        });
        teamTotal += entry.totalPoints;
      }

      result.push({
        _type: 'football',
        teamId,
        teamName: teamNameMap.get(teamId) ?? `Team ${teamId}`,
        totalPoints: teamTotal,
        players,
      });
    }

    // Ensure both teams appear even when they have no game stats yet
    for (const teamId of [matchup.team1Id, matchup.team2Id]) {
      if (teamId === null || teamPlayerMap.has(teamId)) continue;
      result.push({
        _type: 'football',
        teamId,
        teamName: teamNameMap.get(teamId) ?? `Team ${teamId}`,
        totalPoints: 0,
        players: [],
      });
    }
  }

  return result;
}

// ─── Baseball resolver ───────────────────────────────────────────────────────

/**
 * Resolve fantasy scores for all matchups in a baseball league week.
 *
 * Fetches batting, pitching, and fielding stats for all rostered players in a
 * single batched query per stat type (3 queries total for the week, regardless
 * of roster size), then groups results in memory and computes per-player
 * fantasy totals using the default baseball scoring settings.
 *
 * @param db       Database connection.
 * @param leagueId League to look up matchups for.
 * @param weekNum  Matchup week number.
 * @returns        One `BaseballMatchupStatsShape` per team slot in the week.
 */
export async function resolveBaseballMatchupScores(
  db: Db,
  leagueId: number,
  weekNum: number,
): Promise<BaseballMatchupStatsShape[]> {
  const matchupRows = await db
    .select({
      id: PublicSchema.matchups.id,
      team1Id: PublicSchema.matchups.team1Id,
      team2Id: PublicSchema.matchups.team2Id,
    })
    .from(PublicSchema.matchups)
    .where(
      and(
        eq(PublicSchema.matchups.leagueId, leagueId),
        eq(PublicSchema.matchups.weekNumber, weekNum),
      ),
    );

  if (matchupRows.length === 0) return [];

  const allTeamIds = [
    ...new Set(
      matchupRows.flatMap((m) =>
        [m.team1Id, m.team2Id].filter((id): id is number => id !== null),
      ),
    ),
  ];

  const teamRows =
    allTeamIds.length > 0
      ? await db
          .select({ id: PublicSchema.teams.id, name: PublicSchema.teams.name })
          .from(PublicSchema.teams)
          .where(inArray(PublicSchema.teams.id, allTeamIds))
      : [];

  const teamNameMap = new Map(teamRows.map((t) => [t.id, t.name]));
  const scoringSettings = getDefaultScoringSettings();
  const result: BaseballMatchupStatsShape[] = [];

  const allMatchupIds = matchupRows.map((m) => m.id);

  // Batch-fetch all matchup players across all matchups to avoid N+1.
  const allBaseballMatchupPlayerRows =
    allMatchupIds.length > 0
      ? await db
          .select({
            matchupPlayerId: PublicSchema.matchupPlayers.id,
            matchupId: PublicSchema.matchupPlayers.matchupId,
            teamId: PublicSchema.matchupPlayers.teamId,
            playerId: PublicSchema.matchupPlayers.playerId,
            positionType: PublicSchema.leaguePosition.positionType,
          })
          .from(PublicSchema.matchupPlayers)
          .leftJoin(
            PublicSchema.leaguePosition,
            eq(
              PublicSchema.leaguePosition.id,
              PublicSchema.matchupPlayers.positionId,
            ),
          )
          .where(inArray(PublicSchema.matchupPlayers.matchupId, allMatchupIds))
      : [];

  const baseballMatchupPlayersByMatchupId = new Map<
    number,
    typeof allBaseballMatchupPlayerRows
  >();
  for (const mp of allBaseballMatchupPlayerRows) {
    const matchupId = mp.matchupId;
    if (matchupId === null) continue;
    const list = baseballMatchupPlayersByMatchupId.get(matchupId) ?? [];
    list.push(mp);
    baseballMatchupPlayersByMatchupId.set(matchupId, list);
  }

  // Season rows use only leagueId + weekNum — one query for all matchups.
  const allSeasonRows = await db
    .select({
      playerId: PublicSchema.leagueWeekPlayerSeasons.playerId,
      season: PublicSchema.leagueWeekPlayerSeasons.season,
    })
    .from(PublicSchema.leagueWeekPlayerSeasons)
    .where(
      and(
        eq(PublicSchema.leagueWeekPlayerSeasons.leagueId, leagueId),
        eq(PublicSchema.leagueWeekPlayerSeasons.weekNumber, weekNum),
      ),
    );
  const seasonMap = new Map(allSeasonRows.map((s) => [s.playerId, s.season]));

  // Batch-fetch game rows for all matchup players.
  const allBaseballMatchupPlayerIds = allBaseballMatchupPlayerRows.map(
    (mp) => mp.matchupPlayerId,
  );
  const allGameRows =
    allBaseballMatchupPlayerIds.length > 0
      ? await db
          .select({
            matchupPlayerId: PublicSchema.matchupPlayerGames.matchupPlayerId,
            gameIdentifier: PublicSchema.matchupPlayerGames.gameIdentifier,
          })
          .from(PublicSchema.matchupPlayerGames)
          .where(
            inArray(
              PublicSchema.matchupPlayerGames.matchupPlayerId,
              allBaseballMatchupPlayerIds,
            ),
          )
      : [];

  const gamesByMatchupPlayer = new Map<number, string[]>();
  for (const g of allGameRows) {
    if (!g.gameIdentifier) continue;
    const list = gamesByMatchupPlayer.get(g.matchupPlayerId) ?? [];
    list.push(g.gameIdentifier);
    gamesByMatchupPlayer.set(g.matchupPlayerId, list);
  }

  // Batch-fetch player details for all rostered baseball players.
  const allBaseballPlayerIds = [
    ...new Set(
      allBaseballMatchupPlayerRows
        .map((mp) => mp.playerId)
        .filter((id): id is number => id !== null),
    ),
  ];
  const allBaseballPlayerRows =
    allBaseballPlayerIds.length > 0
      ? await db
          .select({
            id: PublicSchema.players.id,
            firstName: PublicSchema.players.firstName,
            lastName: PublicSchema.players.lastName,
          })
          .from(PublicSchema.players)
          .where(inArray(PublicSchema.players.id, allBaseballPlayerIds))
      : [];
  const playerDetailMap = new Map(allBaseballPlayerRows.map((p) => [p.id, p]));

  // Batch-fetch all game stats (batting, pitching, fielding) for all players.
  const allGameIdentifiers = [
    ...new Set([...gamesByMatchupPlayer.values()].flat()),
  ];
  const [allBattingRows, allPitchingRows, allFieldingRows] =
    allGameIdentifiers.length > 0 && allBaseballPlayerIds.length > 0
      ? await Promise.all([
          db
            .select()
            .from(PublicSchema.gameBatting)
            .where(
              and(
                inArray(
                  PublicSchema.gameBatting.playerId,
                  allBaseballPlayerIds,
                ),
                inArray(
                  PublicSchema.gameBatting.gameIdentifier,
                  allGameIdentifiers,
                ),
              ),
            ),
          db
            .select()
            .from(PublicSchema.gamePitching)
            .where(
              and(
                inArray(
                  PublicSchema.gamePitching.playerId,
                  allBaseballPlayerIds,
                ),
                inArray(
                  PublicSchema.gamePitching.gameIdentifier,
                  allGameIdentifiers,
                ),
              ),
            ),
          db
            .select()
            .from(PublicSchema.gameFielding)
            .where(
              and(
                inArray(
                  PublicSchema.gameFielding.playerId,
                  allBaseballPlayerIds,
                ),
                inArray(
                  PublicSchema.gameFielding.gameIdentifier,
                  allGameIdentifiers,
                ),
              ),
            ),
        ])
      : ([[], [], []] as [
          (typeof PublicSchema.gameBatting.$inferSelect)[],
          (typeof PublicSchema.gamePitching.$inferSelect)[],
          (typeof PublicSchema.gameFielding.$inferSelect)[],
        ]);

  const battingByKey = new Map(
    allBattingRows.map((r) => [`${r.playerId}:${r.gameIdentifier}`, r]),
  );
  const pitchingByKey = new Map(
    allPitchingRows.map((r) => [`${r.playerId}:${r.gameIdentifier}`, r]),
  );
  const fieldingByKey = new Map(
    allFieldingRows.map((r) => [`${r.playerId}:${r.gameIdentifier}`, r]),
  );

  for (const matchup of matchupRows) {
    const matchupPlayerRows =
      baseballMatchupPlayersByMatchupId.get(matchup.id) ?? [];

    if (matchupPlayerRows.length === 0) {
      for (const teamId of [matchup.team1Id, matchup.team2Id]) {
        if (teamId === null) continue;
        result.push({
          _type: 'baseball',
          teamId,
          teamName: teamNameMap.get(teamId) ?? `Team ${teamId}`,
          totalPoints: 0,
          players: [],
        });
      }
      continue;
    }

    const teamPlayers = new Map<number, BaseballMatchupPlayerShape[]>();

    for (const mp of matchupPlayerRows) {
      const season = seasonMap.get(mp.playerId);
      if (!season) continue;

      const gameIds = gamesByMatchupPlayer.get(mp.matchupPlayerId) ?? [];
      if (gameIds.length === 0) continue;

      const gameStatsByIdentifier = new Map<string, PlayerGameStats>();
      for (const gameId of gameIds) {
        const battingRow = battingByKey.get(`${mp.playerId}:${gameId}`);
        const pitchingRow = pitchingByKey.get(`${mp.playerId}:${gameId}`);
        const fieldingRow = fieldingByKey.get(`${mp.playerId}:${gameId}`);

        if (!battingRow && !pitchingRow) continue;
        gameStatsByIdentifier.set(gameId, {
          playerId: mp.playerId,
          season,
          gameNum: (battingRow ?? pitchingRow)!.gameNum,
          ...(battingRow && { batting: battingRow }),
          ...(pitchingRow && { pitching: pitchingRow }),
          ...(fieldingRow && {
            fielding: {
              innDef: fieldingRow.innDef,
              po: fieldingRow.po,
              a: fieldingRow.a,
              eDef: fieldingRow.eDef,
              dpDef: fieldingRow.dpDef,
            },
          }),
        });
      }

      const gameStatsList = Array.from(gameStatsByIdentifier.values());
      if (gameStatsList.length === 0) continue;

      let totalPoints = 0;
      try {
        const aggregated = aggregatePlayerStats(gameStatsList);
        const score = calculatePlayerScore(aggregated, scoringSettings);
        totalPoints = score.totalScore;
      } catch (err) {
        const error = err as Error;
        LOGGER.warn(
          'Failed to aggregate baseball player stats for matchupScores',
          error,
          { playerId: mp.playerId, matchupId: matchup.id },
        );
      }

      const playerDetail = playerDetailMap.get(mp.playerId);
      const playerName = playerDetail
        ? `${playerDetail.firstName} ${playerDetail.lastName}`.trim()
        : `Player ${mp.playerId}`;

      const teamList = teamPlayers.get(mp.teamId) ?? [];
      teamList.push({
        playerId: mp.playerId,
        playerName,
        position: mp.positionType ?? 'FLEX',
        totalPoints,
      });
      teamPlayers.set(mp.teamId, teamList);
    }

    for (const teamId of [matchup.team1Id, matchup.team2Id]) {
      if (teamId === null) continue;
      const players = teamPlayers.get(teamId) ?? [];
      result.push({
        _type: 'baseball',
        teamId,
        teamName: teamNameMap.get(teamId) ?? `Team ${teamId}`,
        totalPoints: players.reduce((s, p) => s + p.totalPoints, 0),
        players,
      });
    }
  }

  return result;
}

// ─── GraphQL types ───────────────────────────────────────────────────────────
// Football*Ref types are imported from football.ts to avoid duplicate typename
// registrations with the Pothos builder.

const BaseballMatchupPlayerRef = builder.objectRef<BaseballMatchupPlayerShape>(
  'BaseballMatchupPlayer',
);
BaseballMatchupPlayerRef.implement({
  fields: (t) => ({
    playerId: t.exposeInt('playerId', { nullable: false }),
    playerName: t.exposeString('playerName', { nullable: false }),
    position: t.exposeString('position', { nullable: false }),
    totalPoints: t.exposeFloat('totalPoints', { nullable: false }),
  }),
});

const BaseballMatchupStatsRef = builder.objectRef<BaseballMatchupStatsShape>(
  'BaseballMatchupStats',
);
BaseballMatchupStatsRef.implement({
  fields: (t) => ({
    teamId: t.exposeInt('teamId', { nullable: false }),
    teamName: t.exposeString('teamName', { nullable: false }),
    totalPoints: t.exposeFloat('totalPoints', { nullable: false }),
    players: t.field({
      type: [BaseballMatchupPlayerRef],
      nullable: false,
      resolve: (s) => s.players,
    }),
  }),
});

// Union — discriminated via the hidden _type field
const MatchupStats = builder.unionType('MatchupStats', {
  types: [BaseballMatchupStatsRef, FootballMatchupStatsRef],
  resolveType: (value) => {
    if ((value as { _type?: string })._type === 'football') {
      return FootballMatchupStatsRef;
    }
    return BaseballMatchupStatsRef;
  },
});

// ─── Query registration ───────────────────────────────────────────────────────

builder.queryField('matchupScores', (t) =>
  t.field({
    type: [MatchupStats],
    nullable: false,
    args: {
      leagueId: t.arg.int({ required: true }),
      weekNum: t.arg.int({ required: true }),
    },
    resolve: async (_, args, context) => {
      if (!context.user) {
        throw AuthenticationError();
      }

      await verifyLeagueMembership(context.db, args.leagueId, context.user.id);

      const leagueRows = await context.db
        .select({
          sport: PublicSchema.leagues.sport,
        })
        .from(PublicSchema.leagues)
        .where(eq(PublicSchema.leagues.id, args.leagueId))
        .limit(1);

      const league = leagueRows[0];
      if (!league) return [];

      if (league.sport === 'football') {
        return resolveFootballMatchupScores(
          context.db,
          args.leagueId,
          args.weekNum,
        );
      }

      return resolveBaseballMatchupScores(
        context.db,
        args.leagueId,
        args.weekNum,
      );
    },
  }),
);

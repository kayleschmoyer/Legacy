/**
 * Season-to-date totals for football matchup players (LS-10823).
 *
 * "Season to date" is this league's fantasy season through the requested
 * week, not a real-world season: the sum of every game the league scored for
 * the player in a starting slot across matchup weeks 1..weekNum. Each league
 * week can assign a player a different historical season
 * (`league_week_player_seasons`), so a real-world season total would be wrong.
 *
 * Totals are keyed by player, not by team, so a player traded mid-season
 * carries every week they started for any team in the league.
 *
 * Kept free of the Pothos builder so the DataLoader layer can import it.
 */

import { inArray } from 'drizzle-orm';
import {
  type FootballGameStatsDataQuality,
  type FootballLeaguePlayerGameStats,
  getLeagueFootballPlayerGameStatsThroughWeek,
  type PublicDb,
  PublicSchema,
} from '@legacy-sports/db-client';
import {
  computeFootballPlayerGamePoints,
  type FootballScoringSettings,
} from '@legacy-sports/scoring';
import { getFootballScoringSettingsForLeague } from '@legacy-sports/scoring/server';
import {
  adaptDefenseRow,
  adaptIdpRow,
  adaptKickingFromOffense,
  adaptPassingFromOffense,
  adaptReceivingFromOffense,
  adaptRushingFromOffense,
  type GameDefenseShape,
  type GameIDPShape,
  type GameKickingShape,
  type GamePassingShape,
  type GameReceivingShape,
  type GameRushingShape,
  isIdpPositionType,
  worseDataQuality,
} from './football-game-lines';

export interface FootballSeasonToDateShape {
  /** Distinct matchup weeks in which the player had at least one stat line. */
  weeksPlayed: number;
  /** Scheduled games that produced a stat line. */
  gamesPlayed: number;
  fantasyPoints: number;
  /** Worst data-quality state across the summed games (LS-6394). */
  dataQuality: FootballGameStatsDataQuality;
  passing: GamePassingShape | null;
  rushing: GameRushingShape | null;
  receiving: GameReceivingShape | null;
  kicking: GameKickingShape | null;
  defense: GameDefenseShape | null;
  idp: GameIDPShape | null;
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return a + b;
}

/**
 * Field-wise sum of two stat groups. A field stays null only when it is null
 * in both, so a stat the source never records is not reported as 0.
 */
function addGroup<T extends Record<string, number | null>>(
  acc: T | null,
  next: T | null,
): T | null {
  if (next === null) return acc;
  if (acc === null) return { ...next };
  const sum = { ...acc };
  for (const key of Object.keys(next) as (keyof T)[]) {
    sum[key] = addNullable(acc[key], next[key]) as T[keyof T];
  }
  return sum;
}

/**
 * Fold a league's per-game stat rows into one season-to-date total per player.
 *
 * Only starting-slot games count (bench rows have a null `positionType`):
 * those are the games the league actually scored toward a team total.
 *
 * @param games          Rows from `getLeagueFootballPlayerGameStatsThroughWeek`.
 * @param isDstByPlayerId `players.is_dst` per player, which picks DST scoring.
 * @param settings       The league's football scoring settings.
 * @returns              Totals by player id. A player with no scored game in
 *                       the window has no entry.
 */
export function accumulateFootballSeasonToDate(
  games: FootballLeaguePlayerGameStats[],
  isDstByPlayerId: Map<number, boolean>,
  settings: FootballScoringSettings,
): Map<number, FootballSeasonToDateShape> {
  const totals = new Map<number, FootballSeasonToDateShape>();
  const weeksByPlayerId = new Map<number, Set<number>>();

  for (const game of games) {
    if (game.positionType === null) continue;

    const position = game.positionType;
    const fantasyPoints = computeFootballPlayerGamePoints(game, settings, {
      isDst: isDstByPlayerId.get(game.playerId) ?? false,
      isIdp: isIdpPositionType(position),
      position,
    });

    let total = totals.get(game.playerId);
    if (!total) {
      total = {
        weeksPlayed: 0,
        gamesPlayed: 0,
        fantasyPoints: 0,
        dataQuality: 'ok',
        passing: null,
        rushing: null,
        receiving: null,
        kicking: null,
        defense: null,
        idp: null,
      };
      totals.set(game.playerId, total);
    }

    total.fantasyPoints += fantasyPoints;
    total.dataQuality = worseDataQuality(total.dataQuality, game.dataQuality);

    const { offense, defense, idpDefense } = game;
    if (offense === null && defense === null && idpDefense === null) continue;

    total.gamesPlayed += 1;
    const weeks = weeksByPlayerId.get(game.playerId) ?? new Set<number>();
    weeks.add(game.weekNumber);
    weeksByPlayerId.set(game.playerId, weeks);
    total.weeksPlayed = weeks.size;

    if (offense) {
      total.passing = addGroup(total.passing, adaptPassingFromOffense(offense));
      total.rushing = addGroup(total.rushing, adaptRushingFromOffense(offense));
      total.receiving = addGroup(
        total.receiving,
        adaptReceivingFromOffense(offense),
      );
      total.kicking = addGroup(total.kicking, adaptKickingFromOffense(offense));
    }
    if (defense) {
      total.defense = addGroup(total.defense, adaptDefenseRow(defense));
    }
    if (idpDefense) {
      total.idp = addGroup(total.idp, adaptIdpRow(idpDefense));
    }
  }

  return totals;
}

/**
 * Season-to-date totals for every player who started for any team in
 * `leagueId` during weeks 1..`weekNum`. One call serves a whole
 * `matchupScores` response; the per-request DataLoader dedupes it.
 */
export async function loadFootballSeasonToDate(
  db: PublicDb,
  leagueId: number,
  weekNum: number,
): Promise<Map<number, FootballSeasonToDateShape>> {
  const games = await getLeagueFootballPlayerGameStatsThroughWeek(
    db,
    leagueId,
    weekNum,
  );
  const playerIds = [
    ...new Set(
      games.filter((g) => g.positionType !== null).map((g) => g.playerId),
    ),
  ];
  if (playerIds.length === 0) return new Map();

  const [playerRows, settings] = await Promise.all([
    db
      .select({
        id: PublicSchema.players.id,
        isDst: PublicSchema.players.isDst,
      })
      .from(PublicSchema.players)
      .where(inArray(PublicSchema.players.id, playerIds)),
    getFootballScoringSettingsForLeague(db, leagueId),
  ]);

  return accumulateFootballSeasonToDate(
    games,
    new Map(playerRows.map((p) => [p.id, p.isDst])),
    settings,
  );
}

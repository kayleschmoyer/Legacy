/**
 * Football matchup score projections (LS-6364).
 *
 * Mirrors the baseball projection model (`calculateMatchupProjection` /
 * `computeAverageScoring`): a player's projected score for a game not yet
 * played is their average fantasy points per game (fppg) for their assigned
 * matchup season. Football matchups are exactly one NFL week, so "remaining
 * games" is always 0 or 1 per player.
 *
 * Unlike baseball's flat per-stat multipliers, DST scoring applies
 * non-linear points-allowed bands (`computeDefenseScore`), so a season total
 * cannot be scored once and divided by games after the fact — a summed
 * points-allowed figure would fall in the wrong band entirely. Every stat is
 * therefore averaged to a per-game rate first, then run through the same
 * scoring functions used for a single game.
 *
 * Season stat tables key on (playerId, season, team, pfrRowId) rather than
 * (playerId, season) — a player traded mid-season has one row per team — so
 * every query here sums across all rows for the season before averaging
 * (LS-255's `FootballPlayerSeasonStats.passing` etc. are lists for the same
 * reason).
 */

import { and, eq } from 'drizzle-orm';
import { type PublicDb, PublicSchema } from '@legacy-sports/db-client';
import {
  computeFootballDefenseFantasyPoints,
  computeFootballIdpFantasyPoints,
  computeFootballOffenseFantasyPoints,
  type FootballScoringSettings,
} from '@legacy-sports/scoring';

/** Sums a numeric field across rows, coercing each value with `Number(...)`. */
function sumField<T>(rows: T[], key: keyof T): number {
  return rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
}

/** Per-game average of a summed stat, rounded to nowhere — division only. */
function avgField<T>(rows: T[], key: keyof T, gamesPlayed: number): number {
  return sumField(rows, key) / gamesPlayed;
}

/**
 * Average fantasy points per game for one player's assigned season, using the
 * same DST/IDP/offense branching as the live per-game scoring path
 * (`computeFootballGamePoints` in matchupScores.ts). Returns 0 when the
 * player has no season stats (games === 0) for the assigned season — a
 * missing projection should never contribute negatively to a team total.
 */
export async function getFootballPlayerSeasonAverage(
  db: PublicDb,
  playerId: number,
  season: number,
  isDst: boolean,
  isIdp: boolean,
  settings: FootballScoringSettings,
  position?: string,
): Promise<number> {
  if (isDst) {
    const rows = await db
      .select()
      .from(PublicSchema.footballSeasonDefense)
      .where(
        and(
          eq(PublicSchema.footballSeasonDefense.playerId, playerId),
          eq(PublicSchema.footballSeasonDefense.season, season),
        ),
      );

    const gamesPlayed = sumField(rows, 'g');
    if (gamesPlayed === 0) return 0;

    // Averaged (not summed) before scoring — pts_allowed drives a non-linear
    // per-game band lookup, so a season-total figure would land in the wrong
    // band entirely.
    return computeFootballDefenseFantasyPoints(
      {
        sacks: avgField(rows, 'sacks', gamesPlayed),
        int: avgField(rows, 'int', gamesPlayed),
        fumbles_rec: avgField(rows, 'fumRec', gamesPlayed),
        def_td: avgField(rows, 'defTd', gamesPlayed),
        safeties: avgField(rows, 'safeties', gamesPlayed),
        pts_allowed: avgField(rows, 'ptsAllowed', gamesPlayed),
        yds_allowed: avgField(rows, 'ydsAllowed', gamesPlayed),
      },
      settings,
    );
  }

  if (isIdp) {
    const rows = await db
      .select()
      .from(PublicSchema.footballSeasonDefenseIdp)
      .where(
        and(
          eq(PublicSchema.footballSeasonDefenseIdp.playerId, playerId),
          eq(PublicSchema.footballSeasonDefenseIdp.season, season),
        ),
      );

    const gamesPlayed = sumField(rows, 'g');
    if (gamesPlayed === 0) return 0;

    // `sacks` is a `numeric` column (half-sack precision) — drizzle returns
    // it as a string, but Number(...) in sumField/avgField already coerces it.
    return computeFootballIdpFantasyPoints(
      {
        solo_tkl: avgField(rows, 'soloTkl', gamesPlayed),
        ast_tkl: avgField(rows, 'astTkl', gamesPlayed),
        sacks: avgField(rows, 'sacks', gamesPlayed),
        int: avgField(rows, 'int', gamesPlayed),
        pd: avgField(rows, 'pd', gamesPlayed),
        ff: avgField(rows, 'ff', gamesPlayed),
        fr: avgField(rows, 'fr', gamesPlayed),
        def_td: avgField(rows, 'defTd', gamesPlayed),
        safeties: avgField(rows, 'safeties', gamesPlayed),
      },
      settings,
      position,
    );
  }

  const [passingRows, rushingRows, receivingRows, kickingRows] =
    await Promise.all([
      db
        .select()
        .from(PublicSchema.footballSeasonPassing)
        .where(
          and(
            eq(PublicSchema.footballSeasonPassing.playerId, playerId),
            eq(PublicSchema.footballSeasonPassing.season, season),
          ),
        ),
      db
        .select()
        .from(PublicSchema.footballSeasonRushing)
        .where(
          and(
            eq(PublicSchema.footballSeasonRushing.playerId, playerId),
            eq(PublicSchema.footballSeasonRushing.season, season),
          ),
        ),
      db
        .select()
        .from(PublicSchema.footballSeasonReceiving)
        .where(
          and(
            eq(PublicSchema.footballSeasonReceiving.playerId, playerId),
            eq(PublicSchema.footballSeasonReceiving.season, season),
          ),
        ),
      db
        .select()
        .from(PublicSchema.footballSeasonKicking)
        .where(
          and(
            eq(PublicSchema.footballSeasonKicking.playerId, playerId),
            eq(PublicSchema.footballSeasonKicking.season, season),
          ),
        ),
    ]);

  const gamesPlayed = Math.max(
    sumField(passingRows, 'g'),
    sumField(rushingRows, 'g'),
    sumField(receivingRows, 'g'),
    sumField(kickingRows, 'g'),
  );
  if (gamesPlayed === 0) return 0;

  return computeFootballOffenseFantasyPoints(
    {
      passing:
        passingRows.length > 0
          ? {
              yds: avgField(passingRows, 'yds', gamesPlayed),
              td: avgField(passingRows, 'td', gamesPlayed),
              int: avgField(passingRows, 'int', gamesPlayed),
              sacked: avgField(passingRows, 'sacked', gamesPlayed),
            }
          : null,
      rushing:
        rushingRows.length > 0
          ? {
              yds: avgField(rushingRows, 'yds', gamesPlayed),
              td: avgField(rushingRows, 'td', gamesPlayed),
              fumbles: avgField(rushingRows, 'fumbles', gamesPlayed),
            }
          : null,
      receiving:
        receivingRows.length > 0
          ? {
              rec: avgField(receivingRows, 'rec', gamesPlayed),
              yds: avgField(receivingRows, 'yds', gamesPlayed),
              td: avgField(receivingRows, 'td', gamesPlayed),
              fumbles: avgField(receivingRows, 'fumbles', gamesPlayed),
            }
          : null,
      kicking:
        kickingRows.length > 0
          ? {
              fgm: avgField(kickingRows, 'fgm', gamesPlayed),
              fg_50m: avgField(kickingRows, 'fg50m', gamesPlayed),
              xpm: avgField(kickingRows, 'xpm', gamesPlayed),
            }
          : null,
    },
    settings,
    position,
  );
}

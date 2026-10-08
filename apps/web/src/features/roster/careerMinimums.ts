/**
 * Client mirror of the league career-minimum rule
 * (`careerMinimumConditions` in lib/db-client/src/lib/DraftUtils.ts), used to
 * flag a starter who can't hold a starting roster spot under the league's
 * minimums.
 */

export interface CareerMinimums {
  /** Batter minimum career AL/NL games played. */
  minCareerGames?: number;
  /** Batter minimum distinct AL/NL seasons batted. */
  minCareerSeasons?: number;
  /** Pitcher minimum career AL/NL games pitched (LS-10807). 0 = off. */
  minCareerPitcherGames?: number;
  /** Pitcher minimum distinct AL/NL seasons pitched (LS-10807). 0 = off. */
  minCareerPitcherSeasons?: number;
}

export interface CareerRecord {
  careerBatting?: { games?: number | null } | null;
  seasonsPlayed?: number | null;
  careerPitching?: { games?: number | null } | null;
  pitchingSeasonsPlayed?: number | null;
}

/**
 * True when the player falls below the league's career minimums.
 *
 * With no pitcher minimums set, only position players with a batting record
 * are checked (the legacy rule). Once a pitcher minimum is set, pure pitchers
 * — every batting game was one they pitched in — are judged on pitching,
 * position players on batting, and two-way players pass by meeting either the
 * full batter or the full pitcher set.
 */
export function isBelowCareerMinimums(
  player: CareerRecord,
  {
    minCareerGames = 0,
    minCareerSeasons = 0,
    minCareerPitcherGames = 0,
    minCareerPitcherSeasons = 0,
  }: CareerMinimums,
): boolean {
  const hasBatting = player.careerBatting != null;
  const battingGames = player.careerBatting?.games ?? 0;
  const battingSeasons = player.seasonsPlayed ?? 0;
  const pitchingGames = player.careerPitching?.games ?? 0;
  const pitchingSeasons = player.pitchingSeasonsPlayed ?? 0;

  const failsBatter =
    battingGames < minCareerGames || battingSeasons < minCareerSeasons;
  const failsPitcher =
    pitchingGames < minCareerPitcherGames ||
    pitchingSeasons < minCareerPitcherSeasons;

  if (minCareerPitcherGames <= 0 && minCareerPitcherSeasons <= 0) {
    return hasBatting && failsBatter;
  }
  if (pitchingGames === 0) return hasBatting && failsBatter;
  if (battingGames <= pitchingGames) return failsPitcher;
  return failsBatter && failsPitcher;
}

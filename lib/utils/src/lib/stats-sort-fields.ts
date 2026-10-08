/**
 * Sort-field contract between the player stats grids (lib/shared-components)
 * and the career-stats ORDER BY builders (lib/db-client). The grids type their
 * column → sort-field maps against these lists, and db-client's unit tests
 * assert every listed field has an explicit ORDER BY case. A field that
 * reaches the server without a case silently falls through to the default
 * order (HR DESC / W DESC), so the header arrow flips while the rows do not
 * (LS-4005, LS-10690). Add a field here only together with its ORDER BY case.
 *
 * Lives in utils because both libraries already depend on it, while
 * db-client cannot import shared-components (shared-components → scoring →
 * db-client would form a cycle).
 */

/** `orderBy` values `getCareerBattingOrderByClause` handles explicitly. */
export const CAREER_BATTING_SORT_FIELDS = [
  'lastName',
  'games',
  'plateAppearances',
  'atBats',
  'runs',
  'hits',
  'doubles',
  'triples',
  'homeRuns',
  'rbi',
  'stolenBases',
  'caughtStealing',
  'baseOnBalls',
  'strikeouts',
  'hitByPitch',
  'intentionalBaseOnBalls',
  'totalBases',
  'groundedIntoDoublePlays',
  'sacrificeHits',
  'offensiveWAR',
  'battingAverage',
  'onBasePercentage',
  'sluggingPercentage',
  'ops',
  'totalScore',
  'avgPointsPerGame',
] as const;

export type CareerBattingSortField =
  (typeof CAREER_BATTING_SORT_FIELDS)[number];

/** `orderBy` values `getCareerPitchingOrderByClause` handles explicitly. */
export const CAREER_PITCHING_SORT_FIELDS = [
  'lastName',
  'fantasyPoints',
  'fantasyPointsPerGame',
  'wins',
  'losses',
  'strikeouts',
  'era',
  'games',
  'gamesStarted',
  'completeGames',
  'shutouts',
  'saves',
  'baseOnBalls',
  'hits',
  'earnedRuns',
  'homeRuns',
  'pitchingWAR',
  'outsRecorded',
  'whip',
  'strikeoutsPerNine',
] as const;

export type CareerPitchingSortField =
  (typeof CAREER_PITCHING_SORT_FIELDS)[number];

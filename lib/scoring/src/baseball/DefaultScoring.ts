import {
  SeasonBatting,
  SeasonFielding,
  SeasonPitching,
} from '@legacy-sports/db-client';

export const DEFAULT_BATTING_SCORING = Object.freeze<
  Partial<Record<keyof SeasonBatting, number>>
>({
  cs: -1,
  doubles: 1,
  h: 1,
  hbp: 1,
  hr: 3,
  r: 1,
  rbi: 1,
  sb: 1,
  so: -0.5,
  triples: 2,
});

export const DEFAULT_FIELDING_SCORING = Object.freeze<
  Partial<Record<keyof SeasonFielding, number>>
>({
  eDef: -1,
});

export const DEFAULT_PITCHING_SCORING = Object.freeze<
  Partial<Record<keyof SeasonPitching, number>>
>({
  // Missing Stats
  //    Holds - 2
  //    Quality starts - 5
  bb: -1,
  er: -2,
  h: -1,
  l: -2,
  outsRecorded: 1,
  so: 1,
  sv: 3,
  w: 2,
});

// Per-view column definitions for the NFL stats grid (LS-8566). The three
// leading identity columns (NAME / POS / TEAM) are rendered by the grid itself;
// this module owns the stat columns each view appends, the section titles, and
// the formatting — one source of truth aligned with FOOTBALL_STAT_SORT_FIELDS
// (and therefore with the server's sort allow-list).

import type { FootballPlayerStatsRowFragment } from '@legacy-sports/graphql';
import {
  fmt,
  fmtFloat,
  type FootballSortField,
  type FootballStatsView,
  getFootballKeyStat,
} from './footballStatsHelpers';

export type FootballStatsRow = FootballPlayerStatsRowFragment;

export interface FootballGridColumn {
  /** Stable key for React lists and test ids. */
  key: string;
  /** Header label (uppercase short form, e.g. 'YDS'). */
  label: string;
  /** Server sort key; omitted ⇒ the column is display-only. */
  sortKey?: FootballSortField;
  /** Column width hint (defaults to a compact stat column). */
  width?: number;
  minWidth?: number;
  /** Primary cell text. */
  format: (row: FootballStatsRow) => string;
  /**
   * Optional muted suffix rendered after the value (used by the overview's
   * per-position key stat, e.g. "2,733 / 12" + "YDS / TD").
   */
  subLabel?: (row: FootballStatsRow) => string;
}

export const FOOTBALL_VIEW_TITLES: Record<FootballStatsView, string> = {
  overview: 'NFL Players Overview',
  passing: 'NFL Career Passing Leaders',
  rushing: 'NFL Career Rushing Leaders',
  receiving: 'NFL Career Receiving Leaders',
  kicking: 'NFL Career Kicking Leaders',
  idp: 'NFL Career Defense Leaders',
  defense: 'NFL Career DST Leaders',
};

const passing = (row: FootballStatsRow) => row.careerStats?.passing;
const rushing = (row: FootballStatsRow) => row.careerStats?.rushing;
const receiving = (row: FootballStatsRow) => row.careerStats?.receiving;
const kicking = (row: FootballStatsRow) => row.careerStats?.kicking;
const idp = (row: FootballStatsRow) => row.careerStats?.idp;
const defense = (row: FootballStatsRow) => row.careerStats?.defense;

/**
 * Career games for the overview: the max `g` across whichever categories the
 * player has rows for (a QB's passing g, a DST's defense g, …). Games played
 * is the same season count regardless of category, so max-of-present is the
 * closest available proxy for total career games.
 */
const overviewGames = (row: FootballStatsRow): number | null => {
  const values = [
    passing(row)?.g,
    rushing(row)?.g,
    receiving(row)?.g,
    kicking(row)?.g,
    defense(row)?.g,
    idp(row)?.g,
  ].filter((g): g is number => g != null && g > 0);
  return values.length > 0 ? Math.max(...values) : null;
};

/**
 * Fantasy points are the product the whole app optimizes for, so every view
 * leads its stat columns with career FPTS and FP/G. Both sort via the
 * server's pool-wide fantasy-points sort ('fpts'/'fpg', no category required
 * — LS-9071), which sums across every stat category the player has rows in
 * rather than joining a single category table (LS-9504).
 */
const fantasyColumns = (
  games: (row: FootballStatsRow) => number | null | undefined,
): FootballGridColumn[] => [
  {
    key: 'fantasyPoints',
    label: 'FPTS',
    sortKey: 'fpts',
    width: 90,
    format: (row) => fmtFloat(row.careerStats?.fantasyPoints, 1),
  },
  {
    key: 'fantasyPointsPerGame',
    label: 'FP/G',
    sortKey: 'fpg',
    width: 74,
    format: (row) => {
      const fantasyPoints = row.careerStats?.fantasyPoints;
      const g = games(row);
      return fantasyPoints != null && g != null && g > 0
        ? fmtFloat(fantasyPoints / g, 1)
        : '—';
    },
  },
];

export const FOOTBALL_STAT_COLUMNS_BY_VIEW: Record<
  FootballStatsView,
  readonly FootballGridColumn[]
> = {
  overview: [
    ...fantasyColumns(overviewGames),
    {
      key: 'keyStat',
      label: 'Career Stats',
      minWidth: 140,
      format: (row) =>
        getFootballKeyStat(row.position, row.isDst ?? false, row.careerStats)
          .value || '—',
      subLabel: (row) =>
        getFootballKeyStat(row.position, row.isDst ?? false, row.careerStats)
          .label,
    },
  ],
  passing: [
    ...fantasyColumns((r) => passing(r)?.g),
    {
      key: 'passing.g',
      label: 'G',
      sortKey: 'passing.g',
      format: (r) => fmt(passing(r)?.g),
    },
    {
      key: 'passing.cmp',
      label: 'CMP',
      sortKey: 'passing.cmp',
      format: (r) => fmt(passing(r)?.cmp),
    },
    {
      key: 'passing.att',
      label: 'ATT',
      sortKey: 'passing.att',
      format: (r) => fmt(passing(r)?.att),
    },
    {
      key: 'passing.yds',
      label: 'YDS',
      sortKey: 'passing.yds',
      format: (r) => fmt(passing(r)?.yds),
    },
    {
      key: 'passing.td',
      label: 'TD',
      sortKey: 'passing.td',
      format: (r) => fmt(passing(r)?.td),
    },
    {
      key: 'passing.int',
      label: 'INT',
      sortKey: 'passing.int',
      format: (r) => fmt(passing(r)?.int),
    },
    {
      key: 'passing.rating',
      label: 'RTG',
      sortKey: 'passing.rating',
      format: (r) => fmtFloat(passing(r)?.rating),
    },
  ],
  rushing: [
    ...fantasyColumns((r) => rushing(r)?.g),
    {
      key: 'rushing.g',
      label: 'G',
      sortKey: 'rushing.g',
      format: (r) => fmt(rushing(r)?.g),
    },
    {
      key: 'rushing.att',
      label: 'ATT',
      sortKey: 'rushing.att',
      format: (r) => fmt(rushing(r)?.att),
    },
    {
      key: 'rushing.yds',
      label: 'YDS',
      sortKey: 'rushing.yds',
      format: (r) => fmt(rushing(r)?.yds),
    },
    {
      key: 'rushing.td',
      label: 'TD',
      sortKey: 'rushing.td',
      format: (r) => fmt(rushing(r)?.td),
    },
    {
      key: 'rushing.lng',
      label: 'LNG',
      sortKey: 'rushing.lng',
      format: (r) => fmt(rushing(r)?.lng),
    },
    {
      key: 'rushing.fumbles',
      label: 'FUM',
      sortKey: 'rushing.fumbles',
      format: (r) => fmt(rushing(r)?.fumbles),
    },
  ],
  receiving: [
    ...fantasyColumns((r) => receiving(r)?.g),
    {
      key: 'receiving.g',
      label: 'G',
      sortKey: 'receiving.g',
      format: (r) => fmt(receiving(r)?.g),
    },
    {
      key: 'receiving.rec',
      label: 'REC',
      sortKey: 'receiving.rec',
      format: (r) => fmt(receiving(r)?.rec),
    },
    {
      key: 'receiving.tgt',
      label: 'TGT',
      sortKey: 'receiving.tgt',
      format: (r) => fmt(receiving(r)?.tgt),
    },
    {
      key: 'receiving.yds',
      label: 'YDS',
      sortKey: 'receiving.yds',
      format: (r) => fmt(receiving(r)?.yds),
    },
    {
      key: 'receiving.td',
      label: 'TD',
      sortKey: 'receiving.td',
      format: (r) => fmt(receiving(r)?.td),
    },
    {
      key: 'receiving.lng',
      label: 'LNG',
      sortKey: 'receiving.lng',
      format: (r) => fmt(receiving(r)?.lng),
    },
  ],
  kicking: [
    ...fantasyColumns((r) => kicking(r)?.g),
    {
      key: 'kicking.g',
      label: 'G',
      sortKey: 'kicking.g',
      format: (r) => fmt(kicking(r)?.g),
    },
    {
      key: 'kicking.fgm',
      label: 'FGM',
      sortKey: 'kicking.fgm',
      format: (r) => fmt(kicking(r)?.fgm),
    },
    {
      key: 'kicking.fga',
      label: 'FGA',
      sortKey: 'kicking.fga',
      format: (r) => fmt(kicking(r)?.fga),
    },
    {
      key: 'kicking.fgPct',
      label: 'FG%',
      sortKey: 'kicking.fgPct',
      format: (r) => fmtFloat(kicking(r)?.fgPct),
    },
    {
      key: 'kicking.xpm',
      label: 'XPM',
      sortKey: 'kicking.xpm',
      format: (r) => fmt(kicking(r)?.xpm),
    },
    {
      key: 'kicking.xpa',
      label: 'XPA',
      sortKey: 'kicking.xpa',
      format: (r) => fmt(kicking(r)?.xpa),
    },
    {
      key: 'kicking.lng',
      label: 'LNG',
      sortKey: 'kicking.lng',
      format: (r) => fmt(kicking(r)?.lng),
    },
  ],
  idp: [
    ...fantasyColumns((r) => idp(r)?.g),
    {
      key: 'idp.g',
      label: 'G',
      sortKey: 'idp.g',
      format: (r) => fmt(idp(r)?.g),
    },
    {
      key: 'idp.soloTkl',
      label: 'SOLO',
      sortKey: 'idp.soloTkl',
      format: (r) => fmt(idp(r)?.soloTkl),
    },
    {
      key: 'idp.astTkl',
      label: 'AST',
      sortKey: 'idp.astTkl',
      format: (r) => fmt(idp(r)?.astTkl),
    },
    {
      key: 'idp.totalTkl',
      label: 'TKL',
      sortKey: 'idp.totalTkl',
      format: (r) => fmt(idp(r)?.totalTkl),
    },
    {
      key: 'idp.sacks',
      label: 'SK',
      sortKey: 'idp.sacks',
      format: (r) => fmtFloat(idp(r)?.sacks),
    },
    {
      key: 'idp.int',
      label: 'INT',
      sortKey: 'idp.int',
      format: (r) => fmt(idp(r)?.int),
    },
    {
      key: 'idp.pd',
      label: 'PD',
      sortKey: 'idp.pd',
      format: (r) => fmt(idp(r)?.pd),
    },
    {
      key: 'idp.ff',
      label: 'FF',
      sortKey: 'idp.ff',
      format: (r) => fmt(idp(r)?.ff),
    },
    {
      key: 'idp.fr',
      label: 'FR',
      sortKey: 'idp.fr',
      format: (r) => fmt(idp(r)?.fr),
    },
    {
      key: 'idp.defTd',
      label: 'TD',
      sortKey: 'idp.defTd',
      format: (r) => fmt(idp(r)?.defTd),
    },
  ],
  defense: [
    ...fantasyColumns((r) => defense(r)?.g),
    {
      key: 'defense.g',
      label: 'G',
      sortKey: 'defense.g',
      format: (r) => fmt(defense(r)?.g),
    },
    {
      key: 'defense.sacks',
      label: 'SK',
      sortKey: 'defense.sacks',
      format: (r) => fmtFloat(defense(r)?.sacks),
    },
    {
      key: 'defense.int',
      label: 'INT',
      sortKey: 'defense.int',
      format: (r) => fmt(defense(r)?.int),
    },
    {
      key: 'defense.fumRec',
      label: 'FR',
      sortKey: 'defense.fumRec',
      format: (r) => fmt(defense(r)?.fumRec),
    },
    {
      key: 'defense.defTd',
      label: 'TD',
      sortKey: 'defense.defTd',
      format: (r) => fmt(defense(r)?.defTd),
    },
    {
      key: 'defense.safeties',
      label: 'SFTY',
      sortKey: 'defense.safeties',
      format: (r) => fmt(defense(r)?.safeties),
    },
    {
      key: 'defense.ptsAllowedPerG',
      label: 'PA/G',
      sortKey: 'defense.ptsAllowedPerG',
      format: (r) => fmtFloat(defense(r)?.ptsAllowedPerG),
    },
    {
      key: 'defense.ydsAllowedPerG',
      label: 'YA/G',
      sortKey: 'defense.ydsAllowedPerG',
      format: (r) => fmtFloat(defense(r)?.ydsAllowedPerG),
    },
  ],
};

import type { DraftPlayer } from './types';
import type { SportKind } from '../../config/sports';

export interface StatColumn {
  /** Header label rendered in the data table thead. */
  label: string;
  /** Renders the cell value for a player; returns the em-dash for missing data. */
  render: (player: DraftPlayer) => string;
  /** Returns a numeric value for sorting; missing/N-A fields should return -Infinity so they sort last. */
  sortValue: (player: DraftPlayer) => number;
}

const dash = '—';
const num = (n: number | undefined, digits = 0): string =>
  n == null ? dash : digits > 0 ? n.toFixed(digits) : String(n);

const BASEBALL_COLUMNS: StatColumn[] = [
  {
    label: 'AVG',
    render: (p) => num(p.avg, 3),
    sortValue: (p) => p.avg ?? -Infinity,
  },
  {
    label: 'HR',
    render: (p) => num(p.hr),
    sortValue: (p) => p.hr ?? -Infinity,
  },
  {
    label: 'RBI',
    render: (p) => num(p.rbi),
    sortValue: (p) => p.rbi ?? -Infinity,
  },
  {
    label: 'SB',
    render: (p) => num(p.sb),
    sortValue: (p) => p.sb ?? -Infinity,
  },
  {
    label: 'WAR',
    render: (p) => num(p.war, 1),
    sortValue: (p) => p.war ?? -Infinity,
  },
];

const FOOTBALL_COLUMNS: StatColumn[] = [
  {
    label: 'PASS YDS',
    render: (p) => num(p.passYds),
    sortValue: (p) => p.passYds ?? -Infinity,
  },
  {
    label: 'RUSH YDS',
    render: (p) => num(p.rushYds),
    sortValue: (p) => p.rushYds ?? -Infinity,
  },
  {
    label: 'REC',
    render: (p) => num(p.rec),
    sortValue: (p) => p.rec ?? -Infinity,
  },
  {
    label: 'TD',
    render: (p) => num(p.td),
    sortValue: (p) => p.td ?? -Infinity,
  },
  {
    label: 'FG',
    render: (p) => num(p.fg),
    sortValue: (p) => p.fg ?? -Infinity,
  },
];

export const STAT_COLUMNS_BY_SPORT: Record<SportKind, StatColumn[]> = {
  baseball: BASEBALL_COLUMNS,
  football: FOOTBALL_COLUMNS,
};

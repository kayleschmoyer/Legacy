import type { DraftPlayer } from './types';
import type { SportKind } from '../../config/sports';

// Football stat fields on DraftPlayer are not yet wired; the loader still
// serves baseball fields. Until LS-4666 lands a football mock player pool,
// reads through a permissive view that may return undefined.
type SportPlayerView = DraftPlayer & {
  passYds?: number;
  rushYds?: number;
  rec?: number;
  td?: number;
  fg?: number;
  war?: number;
};

export interface StatColumn {
  /** Header label rendered in the data table thead. */
  label: string;
  /** Renders the cell value for a player; returns the em-dash for missing data. */
  render: (player: SportPlayerView) => string;
}

const dash = '—';
const num = (n: number | undefined, digits = 0): string =>
  n == null ? dash : digits > 0 ? n.toFixed(digits) : String(n);

const BASEBALL_COLUMNS: StatColumn[] = [
  { label: 'AVG', render: (p) => num(p.avg, 3) },
  { label: 'HR', render: (p) => num(p.hr) },
  { label: 'RBI', render: (p) => num(p.rbi) },
  { label: 'SB', render: (p) => num(p.sb) },
  { label: 'WAR', render: (p) => num(p.war, 1) },
];

const FOOTBALL_COLUMNS: StatColumn[] = [
  { label: 'PASS YDS', render: (p) => num(p.passYds) },
  { label: 'RUSH YDS', render: (p) => num(p.rushYds) },
  { label: 'REC', render: (p) => num(p.rec) },
  { label: 'TD', render: (p) => num(p.td) },
  { label: 'FG', render: (p) => num(p.fg) },
];

export const STAT_COLUMNS_BY_SPORT: Record<SportKind, StatColumn[]> = {
  baseball: BASEBALL_COLUMNS,
  football: FOOTBALL_COLUMNS,
};

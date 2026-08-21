/**
 * STAT_COLUMNS_BY_SPORT (LS-9478)
 *
 * Guards the exact defect this ticket exists to avoid repeating (LS-9473):
 * an unmeasured stat must render as an em-dash, never `0` — a fabricated
 * measurement. Also guards sport exclusivity: football columns must never
 * read baseball fields and vice versa, now that both live on the single
 * widened DraftPlayer type (the permissive SportPlayerView cast was retired
 * in this ticket).
 */

import { STAT_COLUMNS_BY_SPORT } from './statColumns';
import type { DraftPlayer } from './types';

function basePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Test Player',
    position: 'QB',
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
    ...overrides,
  };
}

describe('STAT_COLUMNS_BY_SPORT.football (LS-9478)', () => {
  const columns = STAT_COLUMNS_BY_SPORT.football;
  const labels = columns.map((c) => c.label);

  it('has exactly the five columns the ticket scoped, in order', () => {
    expect(labels).toEqual(['PASS YDS', 'RUSH YDS', 'REC', 'TD', 'FG']);
  });

  it('renders an em-dash — never 0 — for every column when the player has no football stats', () => {
    const player = basePlayer(); // no passYds/rushYds/rec/td/fg set
    for (const col of columns) {
      expect(col.render(player)).toBe('—');
      expect(col.sortValue(player)).toBe(-Infinity);
    }
  });

  it('renders the real value for a player with football stats', () => {
    const player = basePlayer({
      passYds: 4300,
      rushYds: 210,
      rec: 0,
      td: 5,
      fg: 12,
    });
    expect(columns.map((c) => c.render(player))).toEqual([
      '4300',
      '210',
      '0',
      '5',
      '12',
    ]);
  });

  it('distinguishes a measured 0 from missing data (REC=0 renders "0", not an em-dash)', () => {
    const player = basePlayer({ rec: 0 });
    const recColumn = columns.find((c) => c.label === 'REC');
    expect(recColumn?.render(player)).toBe('0');
    expect(recColumn?.render(basePlayer())).toBe('—'); // rec undefined
  });

  it('never reads baseball fields (avg/hr/rbi/sb) for any football column', () => {
    // A player with baseball fields populated (e.g. a stale/leftover
    // baseball DraftPlayer accidentally rendered through the football
    // column set) must still show em-dashes — football columns must read
    // only passYds/rushYds/rec/td/fg, never fall back to avg/hr/rbi/sb.
    const player = basePlayer({ avg: 0.315, hr: 40, rbi: 120, sb: 15 });
    for (const col of columns) {
      expect(col.render(player)).toBe('—');
    }
  });
});

describe('STAT_COLUMNS_BY_SPORT.baseball — unaffected by the LS-9478 widening', () => {
  const columns = STAT_COLUMNS_BY_SPORT.baseball;

  it('has exactly the five columns AVG/HR/RBI/SB/WAR, in order', () => {
    expect(columns.map((c) => c.label)).toEqual([
      'AVG',
      'HR',
      'RBI',
      'SB',
      'WAR',
    ]);
  });

  it('never reads football fields for any baseball column', () => {
    const player = basePlayer({
      passYds: 4300,
      rushYds: 210,
      rec: 80,
      td: 5,
      fg: 12,
    });
    // AVG/HR/RBI/SB are required baseball fields (0 here); WAR is the only
    // optional one and must stay an em-dash, not pick up a football value.
    expect(columns.map((c) => c.render(player))).toEqual([
      '0.000',
      '0',
      '0',
      '0',
      '—',
    ]);
  });
});

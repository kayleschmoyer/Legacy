import {
  aggregateFielding,
  assignGameNumbers,
  type CsvRow,
  isValueRow,
  outsToInningsNotation,
  toStoredBatting,
  toStoredPitching,
} from './transform';

/**
 * Mirrors the Postgres GENERATED ALWAYS expression on
 * `game_pitching.outs_recorded`:
 *   floor(ip)*3 + (ip - floor(ip))*10
 * Used to prove the innings notation round-trips exactly.
 */
function generatedOutsRecorded(ip: number): number {
  return Math.round(Math.floor(ip) * 3 + (ip - Math.floor(ip)) * 10);
}

describe('outsToInningsNotation', () => {
  it.each([
    [0, 0],
    [1, 0.1],
    [2, 0.2],
    [3, 1],
    [20, 6.2],
    [27, 9],
    [28, 9.1],
  ])('converts %i outs to %f innings', (outs, expected) => {
    expect(outsToInningsNotation(outs)).toBe(expected);
  });

  it('round-trips through the generated-column formula for a full game range', () => {
    for (let outs = 0; outs <= 60; outs++) {
      expect(generatedOutsRecorded(outsToInningsNotation(outs))).toBe(outs);
    }
  });
});

describe('isValueRow', () => {
  it('accepts value rows and rejects other stattypes', () => {
    expect(isValueRow({ stattype: 'value' })).toBe(true);
    expect(isValueRow({ stattype: 'adjustment' })).toBe(false);
    expect(isValueRow({})).toBe(false);
  });
});

describe('toStoredBatting', () => {
  const row: CsvRow = {
    gid: 'BSN192704120',
    stattype: 'value',
    b_pa: '5',
    b_ab: '3',
    b_r: '2',
    b_h: '1',
    b_d: '0',
    b_t: '0',
    b_hr: '0',
    b_rbi: '4',
    b_sb: '1',
    b_cs: '0',
    b_w: '2',
    b_k: '2',
    b_gdp: '0',
    b_hbp: '0',
    b_sh: '0',
    b_sf: '',
    b_iw: '1',
  };

  it('maps every counting stat to its target column', () => {
    const out = toStoredBatting(row, 1927, 3);
    expect(out).toEqual({
      season: 1927,
      gameNum: 3,
      gameIdentifier: 'BSN192704120',
      pa: 5,
      ab: 3,
      r: 2,
      h: 1,
      doubles: 0,
      triples: 0,
      hr: 0,
      rbi: 4,
      sb: 1,
      cs: 0,
      bb: 2,
      so: 2,
      gidp: 0,
      hbp: 0,
      sh: 0,
      sf: null,
      ibb: 1,
    });
  });

  it('maps walks from b_w and strikeouts from b_k, not the reverse', () => {
    const out = toStoredBatting({ ...row, b_w: '4', b_k: '9' }, 1927, 1);
    expect(out.bb).toBe(4);
    expect(out.so).toBe(9);
  });

  it('represents blank columns as null rather than 0', () => {
    const out = toStoredBatting({ gid: 'X', b_pa: '' }, 1927, 1);
    expect(out.pa).toBeNull();
    expect(out.hr).toBeNull();
  });
});

describe('toStoredPitching', () => {
  const base: CsvRow = {
    gid: 'BSN192704120',
    stattype: 'value',
    p_ipouts: '27',
    p_bfp: '34',
    p_h: '7',
    p_r: '2',
    p_er: '2',
    p_hr: '0',
    p_w: '1',
    p_iw: '0',
    p_k: '3',
    p_hbp: '0',
    p_wp: '5',
    p_gs: '1',
    p_gf: '1',
    p_cg: '1',
    wp: '1',
    lp: '0',
    save: '0',
  };

  it('converts outs to innings notation', () => {
    expect(toStoredPitching(base, 1927, 1).ip).toBe(9);
    expect(toStoredPitching({ ...base, p_ipouts: '20' }, 1927, 1).ip).toBe(6.2);
  });

  it('takes the win flag from wp, NOT wild pitches from p_wp', () => {
    const out = toStoredPitching({ ...base, wp: '1', p_wp: '5' }, 1927, 1);
    expect(out.w).toBe(1);
    // p_wp (wild pitches) must not leak into any pitching column.
    expect(Object.values(out)).not.toContain(5);
  });

  it('derives a shutout from a complete game with zero runs allowed', () => {
    expect(
      toStoredPitching({ ...base, p_cg: '1', p_r: '0' }, 1927, 1).sho,
    ).toBe(1);
  });

  it('does not call a complete game with runs allowed a shutout', () => {
    expect(
      toStoredPitching({ ...base, p_cg: '1', p_r: '3' }, 1927, 1).sho,
    ).toBe(0);
  });

  it('does not call a scoreless relief outing a shutout', () => {
    expect(
      toStoredPitching({ ...base, p_cg: '0', p_r: '0' }, 1927, 1).sho,
    ).toBe(0);
  });

  it('maps bases on balls from p_w and strikeouts from p_k', () => {
    const out = toStoredPitching({ ...base, p_w: '6', p_k: '11' }, 1927, 1);
    expect(out.bb).toBe(6);
    expect(out.so).toBe(11);
  });

  it('omits outsRecorded so the generated column is not written', () => {
    expect('outsRecorded' in toStoredPitching(base, 1927, 1)).toBe(false);
  });
});

describe('aggregateFielding', () => {
  it('sums counting stats across every position played in one game', () => {
    const rows: CsvRow[] = [
      {
        gid: 'BSN192704120',
        d_pos: '7',
        d_ifouts: '15',
        d_po: '2',
        d_a: '0',
        d_e: '1',
        d_dp: '0',
      },
      {
        gid: 'BSN192704120',
        d_pos: '3',
        d_ifouts: '12',
        d_po: '5',
        d_a: '1',
        d_e: '0',
        d_dp: '1',
      },
    ];

    const out = aggregateFielding(rows, 1927, 4);
    expect(out.po).toBe(7);
    expect(out.a).toBe(1);
    expect(out.eDef).toBe(1);
    expect(out.dpDef).toBe(1);
    // 27 defensive outs = 9 innings.
    expect(out.innDef).toBe(9);
    // chances = po + a + e
    expect(out.chances).toBe(9);
    expect(out.gameIdentifier).toBe('BSN192704120');
    expect(out.gameNum).toBe(4);
  });

  it('handles a single-position game unchanged', () => {
    const out = aggregateFielding(
      [{ gid: 'X', d_ifouts: '27', d_po: '3', d_a: '2', d_e: '0', d_dp: '1' }],
      1927,
      1,
    );
    expect(out.chances).toBe(5);
    expect(out.innDef).toBe(9);
  });
});

describe('assignGameNumbers', () => {
  it('numbers a player-season chronologically starting at 1', () => {
    const rows: CsvRow[] = [
      { gid: 'CHN192705251', date: '19270525' },
      { gid: 'BSN192704120', date: '19270412' },
      { gid: 'CIN192704170', date: '19270417' },
    ];
    const numbers = assignGameNumbers(rows);
    expect(numbers.get('BSN192704120')).toBe(1);
    expect(numbers.get('CIN192704170')).toBe(2);
    expect(numbers.get('CHN192705251')).toBe(3);
  });

  it('orders doubleheaders by game suffix within the same date', () => {
    const rows: CsvRow[] = [
      { gid: 'BRO192707202', date: '19270720' },
      { gid: 'BRO192707201', date: '19270720' },
    ];
    const numbers = assignGameNumbers(rows);
    expect(numbers.get('BRO192707201')).toBe(1);
    expect(numbers.get('BRO192707202')).toBe(2);
  });

  it('assigns one number per game even when a row repeats', () => {
    const rows: CsvRow[] = [
      { gid: 'A192704120', date: '19270412' },
      { gid: 'A192704120', date: '19270412' },
      { gid: 'B192704130', date: '19270413' },
    ];
    const numbers = assignGameNumbers(rows);
    expect(numbers.size).toBe(2);
    expect(numbers.get('B192704130')).toBe(2);
  });
});

describe('aggregateFielding guard', () => {
  it('names the broken contract instead of throwing an opaque TypeError', () => {
    expect(() => aggregateFielding([], 1927, 1)).toThrow(
      /requires at least one fielding row/,
    );
  });
});

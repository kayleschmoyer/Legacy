import { sql } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import {
  computeOnBasePercentage,
  onBasePercentageSql,
} from './on-base-percentage';

describe('computeOnBasePercentage (LS-10846)', () => {
  it('is (H+BB+HBP)/(AB+BB+HBP+SF)', () => {
    expect(
      computeOnBasePercentage({ h: 150, bb: 60, hbp: 5, ab: 500, sf: 6 }),
    ).toBeCloseTo(215 / 571, 12);
  });

  it('matches Baseball-Reference for Babe Ruth 1931 (SF untracked)', () => {
    expect(
      computeOnBasePercentage({ h: 199, bb: 128, hbp: 1, ab: 534, sf: null }),
    ).toBeCloseTo(0.495, 3);
  });

  it('treats zero and missing components as 0 rather than returning null', () => {
    expect(computeOnBasePercentage({ h: 5, bb: 0, hbp: 0, ab: 7, sf: 0 })).toBe(
      5 / 7,
    );
    expect(computeOnBasePercentage({ ab: 10 })).toBe(0);
  });

  it('accepts sf as a numeric string (season_batting model types it varchar)', () => {
    expect(
      computeOnBasePercentage({ h: 150, bb: 60, hbp: 5, ab: 500, sf: '6' }),
    ).toBeCloseTo(215 / 571, 12);
    expect(computeOnBasePercentage({ h: 1, ab: 2, sf: '' })).toBe(0.5);
  });

  it('returns null only when the denominator is 0', () => {
    expect(
      computeOnBasePercentage({ h: 0, bb: 0, hbp: 0, ab: 0, sf: 0 }),
    ).toBeNull();
    expect(computeOnBasePercentage({})).toBeNull();
    expect(computeOnBasePercentage({ bb: 2, ab: 0 })).toBe(1);
  });
});

describe('onBasePercentageSql (LS-10846)', () => {
  it('COALESCEs every component and guards the denominator with NULLIF', () => {
    const rendered = new PgDialect().sqlToQuery(
      onBasePercentageSql({
        h: sql.raw('h'),
        bb: sql.raw('bb'),
        hbp: sql.raw('hbp'),
        ab: sql.raw('ab'),
        sf: sql.raw('sf'),
      }),
    ).sql;
    expect(rendered).toBe(
      '((COALESCE(h, 0) + COALESCE(bb, 0) + COALESCE(hbp, 0))::numeric / NULLIF(COALESCE(ab, 0) + COALESCE(bb, 0) + COALESCE(hbp, 0) + COALESCE(sf, 0), 0))',
    );
  });
});

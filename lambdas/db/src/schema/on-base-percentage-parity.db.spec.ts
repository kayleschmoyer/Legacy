/**
 * OBP sort/display parity — DB Integration Tests (LS-10846)
 *
 * The career OBP/OPS sort renders `onBasePercentageSql` in Postgres while the
 * CareerBatting/SeasonBatting resolvers display `computeOnBasePercentage` in
 * TS. If the two ever drift, the grid shows values out of order (the
 * Deisel .714 / Jansen .800 inversion). These tests evaluate the SQL fragment
 * against a fixture set and require it to agree with the TS helper value for
 * value and in sort order, including NULL components and a zero denominator.
 */

import { sql } from 'drizzle-orm';
import {
  computeOnBasePercentage,
  type OnBasePercentageComponents,
  onBasePercentageSql,
} from '@legacy-sports/db-client';
import { getTestDatabase } from '../../integration-test-setup';

const FIXTURES: Array<{ id: number } & OnBasePercentageComponents> = [
  // Babe Ruth 1931 (SF untracked → NULL) — B-Ref .495
  { id: 1, h: 199, bb: 128, hbp: 1, ab: 534, sf: null },
  // Zero BB / HBP / SF — the falsy-zero resolver bug returned null here
  { id: 2, h: 5, bb: 0, hbp: 0, ab: 7, sf: 0 },
  // Low-sample rows like the reported inversion
  { id: 3, h: 4, bb: 1, hbp: 0, ab: 6, sf: 0 },
  { id: 4, h: 3, bb: 1, hbp: 0, ab: 4, sf: 0 },
  { id: 5, h: 6, bb: 1, hbp: 0, ab: 8, sf: 1 },
  // Every component NULL except AB
  { id: 6, h: null, bb: null, hbp: null, ab: 10, sf: null },
  // Walks only (AB = 0) — OBP 1.000
  { id: 7, h: 0, bb: 2, hbp: 0, ab: 0, sf: 0 },
  // Zero denominator — NULL in both renderings
  { id: 8, h: 0, bb: 0, hbp: 0, ab: 0, sf: 0 },
];

describe('onBasePercentageSql ↔ computeOnBasePercentage parity (LS-10846)', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeAll(async () => {
    db = await getTestDatabase();
  });

  async function evaluate(): Promise<Map<number, number | null>> {
    const values = sql.join(
      FIXTURES.map(
        (f) =>
          sql`(${f.id}::int, ${f.h ?? null}::int, ${f.bb ?? null}::int, ${f.hbp ?? null}::int, ${f.ab ?? null}::int, ${f.sf ?? null}::int)`,
      ),
      sql`, `,
    );
    const obp = onBasePercentageSql({
      h: sql.raw('t.h'),
      bb: sql.raw('t.bb'),
      hbp: sql.raw('t.hbp'),
      ab: sql.raw('t.ab'),
      sf: sql.raw('t.sf'),
    });
    const result = await db.execute(sql`
      SELECT t.id, ${obp}::float8 AS obp
        FROM (VALUES ${values}) AS t(id, h, bb, hbp, ab, sf)
       ORDER BY ${obp} DESC NULLS LAST, t.id
    `);
    const rows = result.rows as Array<{ id: number; obp: number | null }>;
    return new Map(rows.map((r) => [Number(r.id), r.obp]));
  }

  it('computes the same OBP as the TS helper for every fixture', async () => {
    const fromSql = await evaluate();
    for (const f of FIXTURES) {
      const expected = computeOnBasePercentage(f);
      const actual = fromSql.get(f.id);
      if (expected === null) {
        expect(actual).toBeNull();
      } else {
        expect(actual).toBeCloseTo(expected, 12);
      }
    }
  });

  it('orders rows identically to sorting the TS helper values', async () => {
    const sqlOrder = [...(await evaluate()).keys()];
    const tsOrder = [...FIXTURES]
      .map((f) => ({ id: f.id, obp: computeOnBasePercentage(f) }))
      .sort((a, b) => {
        if (a.obp === null && b.obp === null) return a.id - b.id;
        if (a.obp === null) return 1;
        if (b.obp === null) return -1;
        return b.obp - a.obp || a.id - b.id;
      })
      .map((r) => r.id);
    expect(sqlOrder).toEqual(tsOrder);
  });

  it('exposes a numeric sf column on career_batting', async () => {
    // career_batting is a materialized view, which information_schema omits.
    const result = await db.execute(sql`
      SELECT format_type(a.atttypid, a.atttypmod) AS data_type
        FROM pg_attribute a
       WHERE a.attrelid = 'public.career_batting'::regclass
         AND a.attname = 'sf' AND NOT a.attisdropped
    `);
    expect(result.rows).toEqual([{ data_type: 'bigint' }]);
  });
});

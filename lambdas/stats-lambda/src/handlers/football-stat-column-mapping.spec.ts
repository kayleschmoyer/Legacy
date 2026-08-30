/**
 * Closes the last link in football's scoring name chain (LS-9672).
 *
 * `lib/scoring`'s own spec proves the mapping matches the seed migrations and
 * the `DEFAULT_*` constants, but it cannot see the Drizzle models —
 * `lib/scoring` must stay importable from the browser bundles, and
 * `lib/db-client` cannot import `lib/scoring` back without creating a package
 * cycle. So the "does this property actually exist on the stat row?" half of
 * the check lives here, in a lambda that already depends on both.
 *
 * Without it, renaming a `game_football_*` column property (or adding a stat
 * mapped to a property that never existed) would compile, pass every other
 * test, and score 0 for that stat in every league — silently.
 */

import { PublicSchema } from '@legacy-sports/db-client';
import {
  FOOTBALL_STAT_COLUMN_SOURCES,
  type FootballStatRowKind,
} from '@legacy-sports/scoring';

const ROW_TABLES: Record<FootballStatRowKind, unknown> = {
  offense: PublicSchema.gameFootballPlayerOffenseStats,
  defense: PublicSchema.gameFootballDefense,
  idpDefense: PublicSchema.gameFootballDefenseIdp,
};

describe('football stat column sources point at real Drizzle columns', () => {
  it.each(Object.entries(FOOTBALL_STAT_COLUMN_SOURCES))(
    '%s',
    (_statKey, source) => {
      const table = ROW_TABLES[source.row] as Record<string, unknown>;

      expect(table[source.property]).toBeDefined();
    },
  );

  it('reads the DST and IDP interception columns by their model names', () => {
    // The physical column is `int` in both tables; the Drizzle property is
    // `interceptions`. Mapping to `int` would silently score every
    // interception at 0 — the exact failure LS-9532 hit with `outs_recorded`.
    expect(FOOTBALL_STAT_COLUMN_SOURCES['defense.int'].property).toBe(
      'interceptions',
    );
    expect(FOOTBALL_STAT_COLUMN_SOURCES['idp.int'].property).toBe(
      'interceptions',
    );
  });

  it('reads the 50+ yard field goal column by its model name', () => {
    // `fg_50m` survives the snake→camel regex unchanged (it only uppercases
    // letters, never digits) while the model property is `fg50m`.
    expect(FOOTBALL_STAT_COLUMN_SOURCES['kicking.fg_50m'].property).toBe(
      'fg50m',
    );
  });
});

/**
 * Regression test for LS-9353.
 *
 * The `teamById` query orders league members with a raw SQL `CASE` on
 * `permission_level` (queries.ts). That literal list is not type-checked
 * against the `league_permission_level` Postgres enum, so a rename like
 * LS-193's `owner` -> `general_manager` / `team_manager` -> `assistant_manager`
 * can silently leave a stale literal behind — Postgres then rejects the
 * query at runtime with "invalid input value for enum league_permission_level".
 * This test statically checks every literal in that CASE against the current
 * enum so a future rename fails fast in CI instead of in production.
 */
import { PublicSchema } from '@legacy-sports/db-client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('teamById permission_level CASE ordering (LS-9353)', () => {
  it('only references valid league_permission_level enum values', () => {
    const source = readFileSync(join(__dirname, 'queries.ts'), 'utf-8');
    const caseBlockMatch = source.match(
      /CASE \$\{PublicSchema\.leagueMembers\.permissionLevel\}([\s\S]*?)END`/,
    );
    if (!caseBlockMatch) {
      throw new Error(
        'Could not find permission_level CASE block in queries.ts',
      );
    }

    const literals = Array.from(
      caseBlockMatch[1].matchAll(/WHEN '([^']+)'/g),
    ).map((match) => match[1]);

    expect(literals.length).toBeGreaterThan(0);
    const validValues = PublicSchema.leagueMembers.permissionLevel.enumValues;
    for (const literal of literals) {
      expect(validValues).toContain(literal);
    }
  });
});

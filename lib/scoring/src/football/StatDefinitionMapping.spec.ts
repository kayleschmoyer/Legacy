/**
 * The guard that turns football's silent-zero failure mode into a build
 * failure (LS-9672).
 *
 * Three name spaces have to agree for a commissioner's football override to
 * reach a score: `scoring_stat_definitions.source_column`, the scoring-engine
 * settings key, and the Drizzle row property. Historically they diverged
 * quietly — a mismatched key resolves to weight 0 and the matchup still
 * produces a plausible-looking number (LS-9532's `outs_recorded`).
 *
 * These tests make each link explicit:
 *
 *  1. The manifest matches the seed migrations, so a new definition cannot be
 *     added without being mapped here.
 *  2. Every definition resolves to a target key that actually exists in the
 *     matching `DEFAULT_*` constant.
 *  3. Every `DEFAULT_*` key is backed by a definition, so a commissioner can
 *     reach every weight the engine reads.
 *  4. Every definition, given a league override, actually moves the score —
 *     end to end, through the real scoring functions.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS,
  DEFAULT_DEFENSE_SCORING,
  DEFAULT_IDP_SCORING,
  DEFAULT_KICKING_SCORING,
  DEFAULT_PASSING_SCORING,
  DEFAULT_RECEIVING_SCORING,
  DEFAULT_RUSHING_SCORING,
  getDefaultFootballScoringSettings,
} from './DefaultScoring';
import { computeFootballPlayerGamePoints } from './FootballGameScoring';
import type { FootballScoringSettings } from './ScoringSettings';
import {
  DEFENSE_BAND_COLUMN_TO_BAND_KEY,
  FOOTBALL_SCORING_STAT_GROUPS,
  FOOTBALL_STAT_DEFINITIONS,
  type FootballScoringStatGroup,
  type FootballStatDefinitionRef,
  resolveFootballScoringTarget,
  resolveFootballStatColumnSource,
} from './StatDefinitionMapping';

const MIGRATIONS_DIR = join(__dirname, '../../../db-client/migrations');

const SEED_MIGRATIONS = [
  '20260522_190000_seed_football_scoring_stat_definitions.ts',
  '20260522_190100_seed_football_idp_stat_definitions.ts',
];

/**
 * The settings keys each `DEFAULT_*` constant actually carries. Captured as
 * key lists rather than the constants themselves because two of them are
 * typed through an interface (`IDPScoringSettings`,
 * `DefensePointsAllowedBands`), which has no implicit index signature.
 */
const DEFAULT_KEYS_BY_GROUP: Record<
  FootballScoringStatGroup,
  readonly string[]
> = {
  passing: Object.keys(DEFAULT_PASSING_SCORING),
  rushing: Object.keys(DEFAULT_RUSHING_SCORING),
  receiving: Object.keys(DEFAULT_RECEIVING_SCORING),
  kicking: Object.keys(DEFAULT_KICKING_SCORING),
  defense: Object.keys(DEFAULT_DEFENSE_SCORING),
  idp: Object.keys(DEFAULT_IDP_SCORING),
};

const DEFAULT_BAND_KEYS = Object.keys(DEFAULT_DEFENSE_POINTS_ALLOWED_BANDS);

/**
 * Pull the (stat_key, stat_group, source_table, source_column) tuples out of a
 * seed migration's INSERT ... VALUES block. Deliberately parses the migration
 * rather than querying the database so the guard runs in CI with no RDS.
 */
function parseSeededDefinitions(fileName: string): FootballStatDefinitionRef[] {
  const source = readFileSync(join(MIGRATIONS_DIR, fileName), 'utf8');

  // Only the seeding INSERT's VALUES block — the `down` migration's
  // `stat_key IN (...)` list would otherwise be parsed as rows. `ON CONFLICT`
  // is searched from the VALUES offset because the file's docblock mentions
  // it too.
  const valuesStart = source.indexOf('VALUES');
  const valuesEnd = source.indexOf('ON CONFLICT', valuesStart);

  if (valuesStart === -1 || valuesEnd === -1) {
    throw new Error(`No seed INSERT ... VALUES block found in ${fileName}`);
  }

  const valuesBlock = source.slice(valuesStart, valuesEnd);

  const rowPattern =
    /\(\s*'([a-z0-9_]+)',\s*'([a-z]+)',\s*'([a-z0-9_]+)',\s*'([a-z0-9_]+)',\s*'/g;

  const rows: FootballStatDefinitionRef[] = [];
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(valuesBlock)) !== null) {
    rows.push({
      statKey: match[1],
      statGroup: match[2] as FootballScoringStatGroup,
      sourceTable: match[3],
      sourceColumn: match[4],
    });
  }

  return rows;
}

function sortByStatKey(
  definitions: readonly FootballStatDefinitionRef[],
): FootballStatDefinitionRef[] {
  return [...definitions].sort((a, b) => a.statKey.localeCompare(b.statKey));
}

/** Settings where every weight is 0 — so any non-zero score is attributable. */
function zeroedSettings(): FootballScoringSettings {
  const settings = getDefaultFootballScoringSettings();

  for (const group of FOOTBALL_SCORING_STAT_GROUPS) {
    for (const key of Object.keys(settings[group])) {
      settings[group][key] = 0;
    }
  }

  for (const key of Object.keys(
    settings.defenseBands,
  ) as (keyof typeof settings.defenseBands)[]) {
    settings.defenseBands[key] = 0;
  }

  return settings;
}

/** Points allowed that lands squarely inside each band. */
const BAND_PROBE_POINTS_ALLOWED: Record<string, number> = {
  pts_0: 0,
  pts_1_6: 3,
  pts_7_13: 10,
  pts_14_17: 15,
  pts_18_27: 20,
  pts_28_34: 30,
  pts_35_plus: 40,
};

describe('football stat definition manifest', () => {
  it('matches the definitions seeded by the migrations', () => {
    const seeded = SEED_MIGRATIONS.flatMap(parseSeededDefinitions);

    // If this fails, a migration added, removed or renamed a football scoring
    // definition. Update FOOTBALL_STAT_DEFINITIONS *and* give the new stat a
    // mapping target — the tests below will tell you if it has none.
    expect(sortByStatKey(seeded)).toEqual(
      sortByStatKey(FOOTBALL_STAT_DEFINITIONS),
    );
  });

  it('covers all 35 football definitions', () => {
    expect(FOOTBALL_STAT_DEFINITIONS).toHaveLength(35);
  });
});

describe('every football definition resolves to a real scoring key', () => {
  it.each(FOOTBALL_STAT_DEFINITIONS.map((d) => [d.statKey, d] as const))(
    '%s',
    (_statKey, definition) => {
      const target = resolveFootballScoringTarget(
        definition.statGroup,
        definition.sourceColumn,
      );

      expect(target).not.toBeNull();

      if (target === null) return;

      if (target.kind === 'band') {
        expect(DEFAULT_BAND_KEYS).toContain(target.settingsKey);
        return;
      }

      // A definition whose settings key is absent from the DEFAULT_* constant
      // would resolve to weight 0 for every league — silently. That is the
      // bug this assertion exists to prevent.
      expect(DEFAULT_KEYS_BY_GROUP[target.group]).toContain(target.settingsKey);
    },
  );
});

describe('every scoring weight is reachable from a definition', () => {
  it.each(
    FOOTBALL_SCORING_STAT_GROUPS.flatMap((group) =>
      DEFAULT_KEYS_BY_GROUP[group].map((key) => [group, key] as const),
    ),
  )('%s.%s has a stat definition', (group, settingsKey) => {
    const match = FOOTBALL_STAT_DEFINITIONS.some((definition) => {
      const target = resolveFootballScoringTarget(
        definition.statGroup,
        definition.sourceColumn,
      );
      return (
        target?.kind === 'flat' &&
        target.group === group &&
        target.settingsKey === settingsKey
      );
    });

    // A weight with no definition is a stat a commissioner cannot configure.
    expect(match).toBe(true);
  });

  it.each(DEFAULT_BAND_KEYS)(
    'defenseBands.%s has a stat definition',
    (bandKey) => {
      expect(Object.values(DEFENSE_BAND_COLUMN_TO_BAND_KEY)).toContain(bandKey);
    },
  );
});

describe('a league override on any football stat moves the score', () => {
  const flatDefinitions = FOOTBALL_STAT_DEFINITIONS.filter(
    (definition) =>
      resolveFootballScoringTarget(
        definition.statGroup,
        definition.sourceColumn,
      )?.kind === 'flat',
  );

  it.each(flatDefinitions.map((d) => [d.statKey, d] as const))(
    '%s',
    (_statKey, definition) => {
      const source = resolveFootballStatColumnSource(
        definition.statGroup,
        definition.sourceColumn,
      );

      // Every flat definition must know which Drizzle property carries it —
      // this is where `int` → `interceptions` and `fg_50m` → `fg50m` live.
      expect(source).not.toBeNull();

      if (source === null) return;

      const target = resolveFootballScoringTarget(
        definition.statGroup,
        definition.sourceColumn,
      );

      if (target?.kind !== 'flat') return;

      const settings = zeroedSettings();
      settings[target.group][target.settingsKey] = 7;

      // Only the stat under test carries a value, and only its weight is
      // non-zero — so a score of 21 can only have come from this stat being
      // read off the right column and weighted by the right key.
      const row = { [source.property]: 3 };

      const points = computeFootballPlayerGamePoints(
        {
          offense: source.row === 'offense' ? row : null,
          defense: source.row === 'defense' ? row : null,
          idpDefense: source.row === 'idpDefense' ? row : null,
        },
        settings,
      );

      expect(points).toBe(21);
    },
  );

  it.each(Object.entries(DEFENSE_BAND_COLUMN_TO_BAND_KEY))(
    'defense band %s',
    (_sourceColumn, bandKey) => {
      const settings = zeroedSettings();
      settings.defenseBands[bandKey] = 9;

      const points = computeFootballPlayerGamePoints(
        { defense: { ptsAllowed: BAND_PROBE_POINTS_ALLOWED[bandKey] } },
        settings,
      );

      expect(points).toBe(9);
    },
  );
});

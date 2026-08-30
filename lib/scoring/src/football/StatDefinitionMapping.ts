/**
 * The explicit `scoring_stat_definitions` → football-scoring-engine mapping
 * (LS-9672).
 *
 * Football has three separate name spaces that all describe the same stat, and
 * none of them agree:
 *
 *  1. **`scoring_stat_definitions.source_column`** — what a commissioner's
 *     override entry is keyed by (`int`, `fg_50m`, `pts_band_35plus`).
 *  2. **The scoring-engine settings keys** — the keys `computeScoring`,
 *     `computeDefenseScore` and `computeIDPScore` look weights up by. Unlike
 *     baseball these are snake_case (`fumbles_rec`, `def_td`, `solo_tkl`), so
 *     `camelCaseScoringMultipliers` is the *wrong* transform here and would
 *     resolve every football stat to weight 0 — the same silent-zero failure
 *     as LS-9532's `outs_recorded`.
 *  3. **The Drizzle model property** on the `game_football_*` rows
 *     (`interceptions`, `fg50m`, `rushYds`).
 *
 * Two of those gaps are load-bearing:
 *
 *  - The DST points-allowed bands are not a flat multiplier at all. The DB
 *    models them as seven `defense`-group rows named `pts_band_0` …
 *    `pts_band_35plus`; `FootballScoringSettings` carries them under a
 *    *separate* top-level `defenseBands` key named `pts_0` … `pts_35_plus`.
 *    Note both the `pts_band_` vs `pts_` prefix and `35plus` vs `35_plus`. A
 *    band override therefore cannot be routed by stat group alone —
 *    `defense` in the DB spans both `settings.defense` and
 *    `settings.defenseBands`.
 *  - `game_football_defense` and `game_football_defense_idp` expose the
 *    `int` column as the property `interceptions`, the offense view prefixes
 *    every shared column (`yds` → `passYds` / `rushYds` / `recYds`), and
 *    `fg_50m` becomes `fg50m` (the camel-case regex only uppercases letters,
 *    never digits, so it would leave `fg_50m` untouched).
 *
 * Both mappings live here, explicitly, and
 * `StatDefinitionMapping.spec.ts` asserts every seeded definition resolves to
 * a key that actually exists in the `DEFAULT_*` constants *and* actually
 * moves the score. A definition with no mapping target is a failing test, not
 * a stat that silently scores 0.
 */

import type { DefensePointsAllowedBands } from './ScoringSettings';

/** The six `scoring_stat_group` values that belong to football. */
export type FootballScoringStatGroup =
  | 'passing'
  | 'rushing'
  | 'receiving'
  | 'kicking'
  | 'defense'
  | 'idp';

export const FOOTBALL_SCORING_STAT_GROUPS: readonly FootballScoringStatGroup[] =
  Object.freeze([
    'passing',
    'rushing',
    'receiving',
    'kicking',
    'defense',
    'idp',
  ]);

/** One row of `scoring_stat_definitions`, narrowed to what scoring needs. */
export interface FootballStatDefinitionRef {
  statKey: string;
  statGroup: FootballScoringStatGroup;
  sourceTable: string;
  sourceColumn: string;
}

/**
 * Where a definition's multiplier lands inside `FootballScoringSettings`.
 *
 * `flat` → `settings[group][settingsKey]`, consumed by `computeScoring` /
 * `computeDefenseScore` / `computeIDPScore` as a per-unit weight.
 * `band` → `settings.defenseBands[settingsKey]`, a flat award for landing in
 * that points-allowed bracket rather than a per-unit multiplier.
 */
export type FootballScoringTarget =
  | { kind: 'flat'; group: FootballScoringStatGroup; settingsKey: string }
  | { kind: 'band'; settingsKey: keyof DefensePointsAllowedBands };

/**
 * `defense_pts_band_*` `source_column` → `DefensePointsAllowedBands` key.
 *
 * The two were seeded independently, so neither the prefix nor the last
 * bracket's spelling lines up. This table is the only place that knows.
 */
export const DEFENSE_BAND_COLUMN_TO_BAND_KEY: Readonly<
  Record<string, keyof DefensePointsAllowedBands>
> = Object.freeze({
  pts_band_0: 'pts_0',
  pts_band_1_6: 'pts_1_6',
  pts_band_7_13: 'pts_7_13',
  pts_band_14_17: 'pts_14_17',
  pts_band_18_27: 'pts_18_27',
  pts_band_28_34: 'pts_28_34',
  pts_band_35plus: 'pts_35_plus',
});

/**
 * Resolve where a football stat definition's multiplier belongs in
 * `FootballScoringSettings`.
 *
 * Returns `null` for a group football does not score. Every football
 * definition currently seeded resolves to a target whose key exists in the
 * matching `DEFAULT_*` constant; the spec fails the build if that ever stops
 * being true.
 */
export function resolveFootballScoringTarget(
  statGroup: string,
  sourceColumn: string,
): FootballScoringTarget | null {
  if (
    !FOOTBALL_SCORING_STAT_GROUPS.includes(
      statGroup as FootballScoringStatGroup,
    )
  ) {
    return null;
  }

  const group = statGroup as FootballScoringStatGroup;

  if (group === 'defense') {
    const bandKey = DEFENSE_BAND_COLUMN_TO_BAND_KEY[sourceColumn];
    if (bandKey) {
      return { kind: 'band', settingsKey: bandKey };
    }
  }

  // Every non-band football definition's `source_column` *is* its scoring
  // settings key — the engine is snake_case-keyed, so no transform applies.
  // Kept as an explicit branch rather than an implicit identity so a future
  // divergence has an obvious place to be handled.
  return { kind: 'flat', group, settingsKey: sourceColumn };
}

/** Which stat row on a matchup player game a definition reads from. */
export type FootballStatRowKind = 'offense' | 'defense' | 'idpDefense';

/** Where a scoring key's value comes from on the Drizzle stat row. */
export interface FootballStatColumnSource {
  row: FootballStatRowKind;
  /** Property name on the Drizzle model — NOT always the `source_column`. */
  property: string;
}

function sourceKey(group: FootballScoringStatGroup, column: string): string {
  return `${group}.${column}`;
}

/**
 * `<stat group>.<source_column>` → the Drizzle row + property that carries it.
 *
 * Keyed by group as well as column because the offense view flattens four
 * source tables into one row, so `yds`, `td` and `fumbles` are ambiguous on
 * their own (`passing.yds` → `passYds`, `rushing.yds` → `rushYds`).
 *
 * Bands are absent by design: they are derived from `pts_allowed`, not read
 * from a column of their own.
 */
export const FOOTBALL_STAT_COLUMN_SOURCES: Readonly<
  Record<string, FootballStatColumnSource>
> = Object.freeze({
  // Passing — all four live on the flattened offense view.
  [sourceKey('passing', 'yds')]: { row: 'offense', property: 'passYds' },
  [sourceKey('passing', 'td')]: { row: 'offense', property: 'passTd' },
  [sourceKey('passing', 'int')]: { row: 'offense', property: 'interceptions' },
  [sourceKey('passing', 'sacked')]: { row: 'offense', property: 'sacked' },

  // Rushing
  [sourceKey('rushing', 'yds')]: { row: 'offense', property: 'rushYds' },
  [sourceKey('rushing', 'td')]: { row: 'offense', property: 'rushTd' },
  [sourceKey('rushing', 'fumbles')]: {
    row: 'offense',
    property: 'rushFumbles',
  },

  // Receiving
  [sourceKey('receiving', 'rec')]: { row: 'offense', property: 'rec' },
  [sourceKey('receiving', 'yds')]: { row: 'offense', property: 'recYds' },
  [sourceKey('receiving', 'td')]: { row: 'offense', property: 'recTd' },
  [sourceKey('receiving', 'fumbles')]: {
    row: 'offense',
    property: 'recFumbles',
  },

  // Kicking — `fg_50m` survives the snake→camel regex unchanged (digits are
  // never uppercased), so the Drizzle property has to be named here.
  [sourceKey('kicking', 'fgm')]: { row: 'offense', property: 'fgm' },
  [sourceKey('kicking', 'fg_50m')]: { row: 'offense', property: 'fg50m' },
  [sourceKey('kicking', 'xpm')]: { row: 'offense', property: 'xpm' },

  // DST flat stats — `int` is exposed as `interceptions`.
  [sourceKey('defense', 'sacks')]: { row: 'defense', property: 'sacks' },
  [sourceKey('defense', 'int')]: { row: 'defense', property: 'interceptions' },
  [sourceKey('defense', 'fumbles_rec')]: {
    row: 'defense',
    property: 'fumblesRec',
  },
  [sourceKey('defense', 'def_td')]: { row: 'defense', property: 'defTd' },
  [sourceKey('defense', 'safeties')]: { row: 'defense', property: 'safeties' },

  // IDP — same `int` → `interceptions` divergence as DST.
  [sourceKey('idp', 'solo_tkl')]: { row: 'idpDefense', property: 'soloTkl' },
  [sourceKey('idp', 'ast_tkl')]: { row: 'idpDefense', property: 'astTkl' },
  [sourceKey('idp', 'sacks')]: { row: 'idpDefense', property: 'sacks' },
  [sourceKey('idp', 'int')]: {
    row: 'idpDefense',
    property: 'interceptions',
  },
  [sourceKey('idp', 'pd')]: { row: 'idpDefense', property: 'pd' },
  [sourceKey('idp', 'ff')]: { row: 'idpDefense', property: 'ff' },
  [sourceKey('idp', 'fr')]: { row: 'idpDefense', property: 'fr' },
  [sourceKey('idp', 'def_td')]: { row: 'idpDefense', property: 'defTd' },
  [sourceKey('idp', 'safeties')]: { row: 'idpDefense', property: 'safeties' },
});

/**
 * The Drizzle row + property a football stat definition reads from, or `null`
 * for the points-allowed bands (which are derived from `pts_allowed`).
 */
export function resolveFootballStatColumnSource(
  statGroup: FootballScoringStatGroup,
  sourceColumn: string,
): FootballStatColumnSource | null {
  return (
    FOOTBALL_STAT_COLUMN_SOURCES[sourceKey(statGroup, sourceColumn)] ?? null
  );
}

/**
 * Every football row seeded into `scoring_stat_definitions`.
 *
 * Mirrors `lib/db-client/migrations/20260522_190000_seed_football_scoring_stat_definitions.ts`
 * and `..._190100_seed_football_idp_stat_definitions.ts`. The spec parses both
 * migrations and fails if this list drifts from them, so adding a definition
 * without giving it a mapping target breaks the build rather than silently
 * scoring 0.
 */
export const FOOTBALL_STAT_DEFINITIONS: readonly FootballStatDefinitionRef[] =
  Object.freeze([
    // Passing
    {
      statKey: 'passing_yds',
      statGroup: 'passing',
      sourceTable: 'game_football_passing',
      sourceColumn: 'yds',
    },
    {
      statKey: 'passing_td',
      statGroup: 'passing',
      sourceTable: 'game_football_passing',
      sourceColumn: 'td',
    },
    {
      statKey: 'passing_int',
      statGroup: 'passing',
      sourceTable: 'game_football_passing',
      sourceColumn: 'int',
    },
    {
      statKey: 'passing_sacked',
      statGroup: 'passing',
      sourceTable: 'game_football_passing',
      sourceColumn: 'sacked',
    },

    // Rushing
    {
      statKey: 'rushing_yds',
      statGroup: 'rushing',
      sourceTable: 'game_football_rushing',
      sourceColumn: 'yds',
    },
    {
      statKey: 'rushing_td',
      statGroup: 'rushing',
      sourceTable: 'game_football_rushing',
      sourceColumn: 'td',
    },
    {
      statKey: 'rushing_fumbles',
      statGroup: 'rushing',
      sourceTable: 'game_football_rushing',
      sourceColumn: 'fumbles',
    },

    // Receiving
    {
      statKey: 'receiving_rec',
      statGroup: 'receiving',
      sourceTable: 'game_football_receiving',
      sourceColumn: 'rec',
    },
    {
      statKey: 'receiving_yds',
      statGroup: 'receiving',
      sourceTable: 'game_football_receiving',
      sourceColumn: 'yds',
    },
    {
      statKey: 'receiving_td',
      statGroup: 'receiving',
      sourceTable: 'game_football_receiving',
      sourceColumn: 'td',
    },
    {
      statKey: 'receiving_fumbles',
      statGroup: 'receiving',
      sourceTable: 'game_football_receiving',
      sourceColumn: 'fumbles',
    },

    // Kicking
    {
      statKey: 'kicking_fgm',
      statGroup: 'kicking',
      sourceTable: 'game_football_kicking',
      sourceColumn: 'fgm',
    },
    {
      statKey: 'kicking_fg_50m',
      statGroup: 'kicking',
      sourceTable: 'game_football_kicking',
      sourceColumn: 'fg_50m',
    },
    {
      statKey: 'kicking_xpm',
      statGroup: 'kicking',
      sourceTable: 'game_football_kicking',
      sourceColumn: 'xpm',
    },

    // DST flat stats
    {
      statKey: 'defense_sacks',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'sacks',
    },
    {
      statKey: 'defense_int',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'int',
    },
    {
      statKey: 'defense_fumbles_rec',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'fumbles_rec',
    },
    {
      statKey: 'defense_td',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'def_td',
    },
    {
      statKey: 'defense_safeties',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'safeties',
    },

    // DST points-allowed bands
    {
      statKey: 'defense_pts_band_0',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_0',
    },
    {
      statKey: 'defense_pts_band_1_6',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_1_6',
    },
    {
      statKey: 'defense_pts_band_7_13',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_7_13',
    },
    {
      statKey: 'defense_pts_band_14_17',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_14_17',
    },
    {
      statKey: 'defense_pts_band_18_27',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_18_27',
    },
    {
      statKey: 'defense_pts_band_28_34',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_28_34',
    },
    {
      statKey: 'defense_pts_band_35plus',
      statGroup: 'defense',
      sourceTable: 'game_football_defense',
      sourceColumn: 'pts_band_35plus',
    },

    // IDP
    {
      statKey: 'idp_solo_tkl',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'solo_tkl',
    },
    {
      statKey: 'idp_ast_tkl',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'ast_tkl',
    },
    {
      statKey: 'idp_sack',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'sacks',
    },
    {
      statKey: 'idp_int',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'int',
    },
    {
      statKey: 'idp_pd',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'pd',
    },
    {
      statKey: 'idp_ff',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'ff',
    },
    {
      statKey: 'idp_fr',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'fr',
    },
    {
      statKey: 'idp_def_td',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'def_td',
    },
    {
      statKey: 'idp_safety',
      statGroup: 'idp',
      sourceTable: 'game_football_defense_idp',
      sourceColumn: 'safeties',
    },
  ]);

/**
 * The single per-game football scoring entry point (LS-9672).
 *
 * Every surface that turns one football player-game into fantasy points goes
 * through here: the `matchupScores` breakdown resolver (lambdas/db) and the
 * authoritative matchup score written by the stats lambda. The epic decision
 * behind LS-9532 was that **no entry point may compute scores differently**;
 * before this module the two had independently written adapters that already
 * disagreed on which defensive columns they read.
 *
 * The Drizzle-row → scoring-key translation is not hand-written here. It is
 * driven by `FOOTBALL_STAT_COLUMN_SOURCES`, so the names the scoring engine
 * looks weights up by and the names read off the stat row can only ever
 * disagree in one place — which is asserted, not assumed
 * (`StatDefinitionMapping.spec.ts`).
 */

import { computeDefenseScore } from './DefenseScoring';
import { computeIDPScore } from './IDPScoring';
import type {
  FootballPositionScoringBonuses,
  FootballScoringSettings,
} from './ScoringSettings';
import {
  FOOTBALL_STAT_DEFINITIONS,
  type FootballScoringStatGroup,
  resolveFootballStatColumnSource,
} from './StatDefinitionMapping';
import type { ScoringDictionary } from '../ScoringTypes';
import { computeScoring } from '../ComputeScoring';

/**
 * The flattened `game_football_player_offense_stats` row, narrowed to the
 * properties football scoring reads. Declared structurally rather than
 * imported from `@legacy-sports/db-client` so this module stays usable from
 * the web and mobile bundles.
 */
export interface FootballOffenseStatRow {
  passYds?: number | null;
  passTd?: number | null;
  interceptions?: number | null;
  sacked?: number | null;
  rushYds?: number | null;
  rushTd?: number | null;
  rushFumbles?: number | null;
  rec?: number | null;
  recYds?: number | null;
  recTd?: number | null;
  recFumbles?: number | null;
  fgm?: number | null;
  fg50m?: number | null;
  xpm?: number | null;
}

/** The `game_football_defense` (team DST) row, narrowed to scoring inputs. */
export interface FootballDefenseStatRow {
  sacks?: number | null;
  interceptions?: number | null;
  fumblesRec?: number | null;
  defTd?: number | null;
  safeties?: number | null;
  ptsAllowed?: number | null;
  ydsAllowed?: number | null;
  passYdsAllowed?: number | null;
  rushYdsAllowed?: number | null;
}

/**
 * The `game_football_defense_idp` row. `sacks` is `numeric(4,1)` to carry
 * half-sacks, so Drizzle hands it back as a string.
 */
export interface FootballIdpStatRow {
  soloTkl?: number | null;
  astTkl?: number | null;
  sacks?: number | string | null;
  interceptions?: number | null;
  pd?: number | null;
  ff?: number | null;
  fr?: number | null;
  defTd?: number | null;
  safeties?: number | null;
}

/** One player's stat rows for a single game, as fetched for a matchup. */
export interface FootballPlayerGameStatRows {
  offense?: FootballOffenseStatRow | null;
  defense?: FootballDefenseStatRow | null;
  idpDefense?: FootballIdpStatRow | null;
}

export interface FootballGameScoringOptions {
  /**
   * Force the DST branch. Defaults to "the row is present", which is
   * equivalent in practice: `getMatchupFootballPlayerGameStats` only fetches
   * a `defense` row for a player rostered in a DST slot.
   */
  isDst?: boolean;
  /** Force the IDP branch. Defaults to "the `idpDefense` row is present". */
  isIdp?: boolean;
  /**
   * Rostered position type (e.g. 'TE', 'DL'), used to apply any matching
   * position-scoped bonus (LS-9104) additively on top of the base multiplier.
   * Ignored for DST, which has no individual roster position.
   */
  position?: string;
}

/** Stat values handed to the scoring engine, keyed by `source_column`. */
type ScoringStatRecord = Record<string, number | null>;

/**
 * Coerce one Drizzle column value to a number the scoring engine can weight.
 * `numeric` columns arrive as strings; anything unparseable scores nothing
 * rather than throwing partway through a matchup.
 */
function toStatNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

/**
 * Build the scoring-engine stat record for one stat group by walking the
 * definitions in that group and reading each one's mapped Drizzle property.
 *
 * This is the only place a `source_column` is turned into a row property, so
 * `fg_50m` → `fg50m` and `int` → `interceptions` are handled once for every
 * caller instead of being re-derived per entry point.
 */
function collectGroupStats(
  group: FootballScoringStatGroup,
  row: object | null | undefined,
): ScoringStatRecord {
  const stats: ScoringStatRecord = {};

  if (!row) {
    return stats;
  }

  const values = row as Record<string, unknown>;

  for (const definition of FOOTBALL_STAT_DEFINITIONS) {
    if (definition.statGroup !== group) continue;

    const source = resolveFootballStatColumnSource(
      definition.statGroup,
      definition.sourceColumn,
    );

    // Points-allowed bands have no column of their own — they are derived
    // from `pts_allowed` by `computeDefenseScore`.
    if (!source) continue;

    stats[definition.sourceColumn] = toStatNumber(values[source.property]);
  }

  return stats;
}

/** Offense/kicking points, including any position-scoped bonuses. */
function computeOffensePoints(
  row: FootballOffenseStatRow,
  settings: FootballScoringSettings,
  bonuses: FootballPositionScoringBonuses | undefined,
): number {
  // Narrower than FootballScoringStatGroup on purpose: `positionBonuses`
  // has no 'defense' key (a DST slot has no roster position to scope a
  // bonus to), so indexing it with the full union would not type-check.
  const groups = ['passing', 'rushing', 'receiving', 'kicking'] as const;

  let total = 0;

  for (const group of groups) {
    const stats = collectGroupStats(group, row);
    const weights: ScoringDictionary = settings[group];
    total += computeScoring(stats, weights, bonuses?.[group]);
  }

  return total;
}

/**
 * Fantasy points for a single football player-game under the given league
 * scoring settings.
 *
 * Pass `getDefaultFootballScoringSettings()` for a league with no scoring
 * profile — the defaults are the same constants that used to be hardcoded, so
 * an unconfigured league scores exactly as it did before LS-9672.
 */
export function computeFootballPlayerGamePoints(
  stats: FootballPlayerGameStatRows,
  settings: FootballScoringSettings,
  options: FootballGameScoringOptions = {},
): number {
  const defenseRow = stats.defense ?? null;
  const idpRow = stats.idpDefense ?? null;
  const offenseRow = stats.offense ?? null;

  const isDst = options.isDst ?? defenseRow !== null;
  const isIdp = options.isIdp ?? idpRow !== null;

  if (isDst && defenseRow) {
    return computeDefenseScore(
      {
        ...collectGroupStats('defense', defenseRow),
        pts_allowed: toStatNumber(defenseRow.ptsAllowed),
        yds_allowed: toStatNumber(defenseRow.ydsAllowed),
        pass_yds_allowed: toStatNumber(defenseRow.passYdsAllowed),
        rush_yds_allowed: toStatNumber(defenseRow.rushYdsAllowed),
      },
      settings.defense,
      settings.defenseBands,
    );
  }

  const bonuses = options.position
    ? settings.positionBonuses[options.position]
    : undefined;

  if (isIdp && idpRow) {
    return computeIDPScore(
      collectGroupStats('idp', idpRow),
      settings.idp,
      bonuses?.idp,
    );
  }

  if (!offenseRow) {
    return 0;
  }

  return computeOffensePoints(offenseRow, settings, bonuses);
}

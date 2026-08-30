/**
 * Resolve a league's football scoring settings from its active scoring
 * profile (LS-9041, LS-9672).
 *
 * Falls back to the hardcoded defaults for any stat group or stat with no
 * profile and no override entry, so a league that has never touched its
 * scoring settings scores exactly as it did before league profiles existed.
 *
 * ## Why this lives behind `@legacy-sports/scoring/server`
 *
 * It needs db-client's query helpers, which are Node-only (their config
 * reaches for `fs.readFileSync`). `lib/scoring`'s main entry is bundled into
 * the web and mobile apps, and importing db-client's runtime from there broke
 * the Vite build during LS-9041 ("readFileSync is not exported by
 * __vite-browser-external"). The `/server` subpath keeps the query side out
 * of the browser graph while letting every server-side scoring entry point —
 * the `matchupScores` breakdown resolver and the stats lambda that writes the
 * authoritative matchup score — resolve multipliers through the *same*
 * function. Before LS-9672 the stats lambda resolved nothing at all and
 * scored every football matchup from the platform defaults, silently ignoring
 * whatever the commissioner had configured.
 */

import {
  getActiveScoringProfileForLeague,
  getScoringPositionBonusesForProfile,
  getScoringProfileEntriesForProfile,
  getScoringStatDefinitions,
  normalizeNumeric,
  type PublicDb,
  type ScoringStatDefinition,
} from '@legacy-sports/db-client';
import { getDefaultFootballScoringSettings } from '../football/DefaultScoring';
import type { FootballScoringSettings } from '../football/ScoringSettings';
import {
  type FootballScoringStatGroup,
  resolveFootballScoringTarget,
} from '../football/StatDefinitionMapping';

/**
 * Stat groups eligible for a position-scoped bonus (LS-9104). Excludes
 * 'defense' — DST is a whole-team slot with no individual roster position to
 * scope a bonus to (its band-based scoring also has no per-stat shape a
 * flat bonus could apply to).
 */
const BONUS_ELIGIBLE_GROUPS = new Set<ScoringStatDefinition['statGroup']>([
  'passing',
  'rushing',
  'receiving',
  'kicking',
  'idp',
]);

export async function getFootballScoringSettingsForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<FootballScoringSettings> {
  const settings = getDefaultFootballScoringSettings();

  const profile = await getActiveScoringProfileForLeague(db, leagueId);
  if (!profile) {
    return settings;
  }

  const [definitions, entries, positionBonusRows] = await Promise.all([
    getScoringStatDefinitions(db),
    getScoringProfileEntriesForProfile(db, profile.id),
    getScoringPositionBonusesForProfile(db, profile.id),
  ]);

  const entryByDefinitionId = new Map(
    entries.map((entry) => [entry.statDefinitionId, entry]),
  );
  const definitionById = new Map(
    definitions.map((definition) => [definition.id, definition]),
  );

  const flatGroups: Record<
    FootballScoringStatGroup,
    Partial<Record<string, number>>
  > = {
    passing: settings.passing,
    rushing: settings.rushing,
    receiving: settings.receiving,
    kicking: settings.kicking,
    defense: settings.defense,
    idp: settings.idp,
  };

  for (const definition of definitions) {
    // Routes a football definition to either a flat multiplier or the
    // separate `defenseBands` map, and returns null for baseball groups —
    // `defense` in the DB spans both targets, so group name alone cannot
    // tell them apart (LS-9672).
    const target = resolveFootballScoringTarget(
      definition.statGroup,
      definition.sourceColumn,
    );

    if (!target) {
      continue;
    }

    const entry = entryByDefinitionId.get(definition.id);
    const isDisabled = entry?.isEnabled === false;
    const overrideMultiplier = isDisabled
      ? null
      : normalizeNumeric(entry?.multiplier);
    const resolvedMultiplier = isDisabled
      ? null
      : (overrideMultiplier ?? normalizeNumeric(definition.defaultMultiplier));

    if (target.kind === 'band') {
      // A disabled band still has to resolve to a number: the band lookup is
      // total (every points-allowed value lands in exactly one bracket), so
      // there is no "absent" state the way there is for a flat multiplier.
      settings.defenseBands[target.settingsKey] = resolvedMultiplier ?? 0;
      continue;
    }

    const group = flatGroups[target.group];
    if (resolvedMultiplier === null) {
      // Disabled stat — remove any default so it contributes 0, matching
      // getScoringMultipliersForLeague's "disabled stats don't score" rule.
      delete group[target.settingsKey];
    } else {
      group[target.settingsKey] = resolvedMultiplier;
    }
  }

  // Position-scoped scoring bonuses (LS-9104) — additive on top of the base
  // multiplier resolved above, so they're merged in a separate pass keyed by
  // roster position rather than folded into `flatGroups`.
  const positionBonuses: Record<
    string,
    Record<string, Record<string, number>>
  > = {};

  for (const bonus of positionBonusRows) {
    if (bonus.isEnabled === false) continue;

    const definition = definitionById.get(bonus.statDefinitionId);
    if (!definition || !BONUS_ELIGIBLE_GROUPS.has(definition.statGroup)) {
      continue;
    }

    const bonusMultiplier = normalizeNumeric(bonus.bonusMultiplier);
    if (bonusMultiplier === null) continue;

    const positionEntry = positionBonuses[bonus.position] ?? {};
    const group = positionEntry[definition.statGroup] ?? {};
    group[definition.sourceColumn] = bonusMultiplier;
    positionEntry[definition.statGroup] = group;
    positionBonuses[bonus.position] = positionEntry;
  }

  settings.positionBonuses = positionBonuses;

  return settings;
}

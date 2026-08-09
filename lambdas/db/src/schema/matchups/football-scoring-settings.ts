import {
  getActiveScoringProfileForLeague,
  getScoringProfileEntriesForProfile,
  getScoringStatDefinitions,
  normalizeNumeric,
  type PublicDb,
  type ScoringStatDefinition,
} from '@legacy-sports/db-client';
import {
  type DefensePointsAllowedBands,
  type FootballScoringSettings,
  getDefaultFootballScoringSettings,
} from '@legacy-sports/scoring';

/**
 * Maps a `defense_pts_band_*` stat definition's `source_column` to the
 * corresponding key in `DefensePointsAllowedBands` — the two use slightly
 * different naming (`pts_band_35plus` vs. `pts_35_plus`) because the DB
 * column names were seeded independently of the scoring-lib band type.
 */
const DEFENSE_BAND_COLUMN_TO_BAND_KEY: Record<
  string,
  keyof DefensePointsAllowedBands
> = {
  pts_band_0: 'pts_0',
  pts_band_1_6: 'pts_1_6',
  pts_band_7_13: 'pts_7_13',
  pts_band_14_17: 'pts_14_17',
  pts_band_18_27: 'pts_18_27',
  pts_band_28_34: 'pts_28_34',
  pts_band_35plus: 'pts_35_plus',
};

const FOOTBALL_SCORING_GROUPS = new Set<ScoringStatDefinition['statGroup']>([
  'passing',
  'rushing',
  'receiving',
  'kicking',
  'defense',
  'idp',
]);

/**
 * Build a league's football scoring settings from its active scoring
 * profile, falling back to the hardcoded defaults for any stat group/stat
 * with no profile or no override entry (LS-9041). Mirrors the merge
 * semantics of `getScoringMultipliersForLeague` (override > default,
 * disabled entries excluded) but returns the strongly-typed
 * `FootballScoringSettings` shape the football scoring functions consume,
 * including the DST points-allowed bands (which have no baseball
 * equivalent).
 *
 * Lives in lambdas/db (server-only) rather than lib/scoring: lib/scoring is
 * bundled into the web/mobile apps, and a runtime import of db-client's
 * query helpers here would drag db-client's Node-only config (e.g.
 * fs.readFileSync) into the browser bundle (LS-9041 build-break — Vite
 * failed on "readFileSync is not exported by __vite-browser-external").
 */
export async function getFootballScoringSettingsForLeague(
  db: PublicDb,
  leagueId: number,
): Promise<FootballScoringSettings> {
  const settings = getDefaultFootballScoringSettings();

  const profile = await getActiveScoringProfileForLeague(db, leagueId);
  if (!profile) {
    return settings;
  }

  const [definitions, entries] = await Promise.all([
    getScoringStatDefinitions(db),
    getScoringProfileEntriesForProfile(db, profile.id),
  ]);

  const entryByDefinitionId = new Map(
    entries.map((entry) => [entry.statDefinitionId, entry]),
  );

  const flatGroups: Record<string, Partial<Record<string, number>>> = {
    passing: settings.passing,
    rushing: settings.rushing,
    receiving: settings.receiving,
    kicking: settings.kicking,
    defense: settings.defense,
    idp: settings.idp,
  };

  for (const definition of definitions) {
    if (!FOOTBALL_SCORING_GROUPS.has(definition.statGroup)) {
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

    if (definition.statGroup === 'defense') {
      const bandKey = DEFENSE_BAND_COLUMN_TO_BAND_KEY[definition.sourceColumn];
      if (bandKey) {
        settings.defenseBands[bandKey] = resolvedMultiplier ?? 0;
        continue;
      }
    }

    const group = flatGroups[definition.statGroup];
    if (resolvedMultiplier === null) {
      // Disabled stat — remove any default so it contributes 0, matching
      // getScoringMultipliersForLeague's "disabled stats don't score" rule.
      delete group[definition.sourceColumn];
    } else {
      group[definition.sourceColumn] = resolvedMultiplier;
    }
  }

  return settings;
}

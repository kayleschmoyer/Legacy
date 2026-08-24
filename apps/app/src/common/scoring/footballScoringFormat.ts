import {
  type GetLeagueScoringProfileQuery,
  ScoringStatGroup,
} from '@legacy-sports/graphql';
import {
  detectFootballScoringPreset,
  type FootballScoringFormat,
} from '@legacy-sports/shared-components/football';

type LeagueScoringProfileResult = NonNullable<
  GetLeagueScoringProfileQuery['leagueScoringProfile']
>;

const RECEPTION_STAT_GROUP = ScoringStatGroup.Receiving;
const RECEPTION_STAT_KEY = 'rec';

/**
 * Classifies a league's football scoring profile as Standard / Half-PPR / PPR /
 * Custom, derived from the receiving 'rec' stat multiplier (LS-6437). Uses the
 * same thresholds as ScoringSettingsEditor's preset detection so the Settings
 * editor and this indicator never drift.
 */
export function deriveFootballScoringFormat(
  profile: LeagueScoringProfileResult | null | undefined,
): FootballScoringFormat | undefined {
  const receptionStat = profile?.stats?.find(
    (stat) =>
      stat?.definition?.statGroup === RECEPTION_STAT_GROUP &&
      stat.definition.statKey === RECEPTION_STAT_KEY,
  );

  const multiplier = receptionStat?.multiplier;

  if (typeof multiplier !== 'number' || !Number.isFinite(multiplier)) {
    return undefined;
  }

  return detectFootballScoringPreset(multiplier);
}

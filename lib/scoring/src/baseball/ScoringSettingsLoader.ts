import {
  DEFAULT_BATTING_SCORING,
  DEFAULT_FIELDING_SCORING,
  DEFAULT_PITCHING_SCORING,
} from './DefaultScoring';
import type { BaseballScoringSettings } from './ScoringSettings';

export function createDefaultScoringSettings(): BaseballScoringSettings {
  return {
    batting: { ...DEFAULT_BATTING_SCORING },
    fielding: { ...DEFAULT_FIELDING_SCORING },
    pitching: { ...DEFAULT_PITCHING_SCORING },
  };
}

export function mergeScoringOverrides(
  overrides?: Partial<BaseballScoringSettings>,
): BaseballScoringSettings {
  if (!overrides) {
    return createDefaultScoringSettings();
  }

  return {
    batting: { ...DEFAULT_BATTING_SCORING, ...overrides.batting },
    fielding: { ...DEFAULT_FIELDING_SCORING, ...overrides.fielding },
    pitching: { ...DEFAULT_PITCHING_SCORING, ...overrides.pitching },
  };
}

export function cloneScoringSettings(
  settings: BaseballScoringSettings,
): BaseballScoringSettings {
  return {
    batting: { ...settings.batting },
    fielding: { ...settings.fielding },
    pitching: { ...settings.pitching },
  };
}

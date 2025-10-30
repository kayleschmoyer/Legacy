import {
  applyMultiplierGroups,
  createDefaultScoringSettings,
} from '../scoring';
import { ScoringStatGroup } from '../../api/db/graphql.generated';

describe('applyMultiplierGroups', () => {
  it('returns defaults when groups are empty', () => {
    const defaults = createDefaultScoringSettings();
    const result = applyMultiplierGroups(undefined, defaults);

    expect(result).toEqual(defaults);
  });

  it('overrides default multipliers by stat group', () => {
    const result = applyMultiplierGroups([
      {
        __typename: 'LeagueScoringMultiplierGroup',
        group: ScoringStatGroup.Batting,
        values: [
          {
            __typename: 'ScoringMultiplierEntry',
            statKey: 'batting_hr',
            sourceColumn: 'hr',
            multiplier: 5,
          },
        ],
      },
    ]); // base defaults are applied internally

    expect(result.batting.hr).toBe(5);
    expect(result.pitching.w).toBeDefined();
  });

  it('ignores entries without numeric multipliers', () => {
    const defaults = createDefaultScoringSettings();
    const result = applyMultiplierGroups(
      [
        {
          __typename: 'LeagueScoringMultiplierGroup',
          group: ScoringStatGroup.Pitching,
          values: [
            {
              __typename: 'ScoringMultiplierEntry',
              statKey: 'pitching_w',
              sourceColumn: 'w',
              multiplier: null,
            },
            null,
          ],
        },
      ],
      defaults,
    );

    expect(result.pitching.w).toBe(defaults.pitching.w);
  });
});

import { applyMultiplierGroups, createDefaultScoringSettings } from './scoring';
import { ScoringStatGroup } from '../api/db/graphql.generated';

describe('applyMultiplierGroups', () => {
  it('returns defaults when groups are empty', () => {
    const defaults = createDefaultScoringSettings();
    const result = applyMultiplierGroups(undefined, defaults);

    expect(result).toEqual(defaults);
  });

  it('overrides default multipliers by stat group', () => {
    const result = applyMultiplierGroups([
      {
        __typename: 'ScoringRuleGroup',
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
          __typename: 'ScoringRuleGroup',
          group: ScoringStatGroup.Pitching,
          values: [
            {
              __typename: 'ScoringMultiplierEntry',
              statKey: 'pitching_w',
              sourceColumn: 'w',
              multiplier: null,
            },
          ],
        },
      ],
      defaults,
    );

    expect(result.pitching.w).toBe(defaults.pitching.w);
  });

  it('normalizes snake_case sourceColumn to camelCase keys', () => {
    const result = applyMultiplierGroups([
      {
        __typename: 'ScoringRuleGroup',
        group: ScoringStatGroup.Fielding,
        values: [
          {
            __typename: 'ScoringMultiplierEntry',
            statKey: 'fielding_errors',
            sourceColumn: 'e_def',
            multiplier: -2,
          },
        ],
      },
      {
        __typename: 'ScoringRuleGroup',
        group: ScoringStatGroup.Pitching,
        values: [
          {
            __typename: 'ScoringMultiplierEntry',
            statKey: 'pitching_outs',
            sourceColumn: 'outs_recorded',
            multiplier: 0.5,
          },
        ],
      },
    ]);

    // snake_case "e_def" should map to camelCase "eDef"
    expect(result.fielding.eDef).toBe(-2);
    expect(result.fielding).not.toHaveProperty('e_def');

    // snake_case "outs_recorded" should map to camelCase "outsRecorded"
    expect(result.pitching.outsRecorded).toBe(0.5);
    expect(result.pitching).not.toHaveProperty('outs_recorded');
  });
});

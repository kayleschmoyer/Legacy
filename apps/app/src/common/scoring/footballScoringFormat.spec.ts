import { ScoringStatGroup } from '@legacy-sports/graphql';

import { deriveFootballScoringFormat } from './footballScoringFormat';

// Avoids loading the real @legacy-sports/shared-components/football barrel,
// which pulls in NFLHome/FootballPlayerCard/etc. and transitively
// @react-native-google-signin/google-signin — an ESM-only package Jest can't
// parse (not in apps/app/jest.config.ts's transformIgnorePatterns allowlist).
jest.mock('@legacy-sports/shared-components/football', () => ({
  detectFootballScoringPreset: (rec: number) => {
    if (rec === 0) return 'standard';
    if (rec === 0.5) return 'half_ppr';
    if (rec === 1) return 'ppr';
    return 'custom';
  },
}));

function buildProfile(recMultiplier: number | null | undefined) {
  return {
    __typename: 'ScoringConfig' as const,
    profileId: 1,
    profileName: 'Test Profile',
    stats: [
      {
        __typename: 'ScoringRule' as const,
        multiplier: recMultiplier,
        defaultMultiplier: 1,
        isOverride: recMultiplier !== 1,
        isEnabled: true,
        definition: {
          __typename: 'ScoringStatDefinition' as const,
          id: 1,
          statKey: 'rec',
          statGroup: ScoringStatGroup.Receiving,
          displayName: 'Reception',
        },
      },
    ],
  };
}

describe('deriveFootballScoringFormat', () => {
  it('returns "standard" when the receiving rec multiplier is 0', () => {
    expect(deriveFootballScoringFormat(buildProfile(0))).toBe('standard');
  });

  it('returns "half_ppr" when the receiving rec multiplier is 0.5', () => {
    expect(deriveFootballScoringFormat(buildProfile(0.5))).toBe('half_ppr');
  });

  it('returns "ppr" when the receiving rec multiplier is 1', () => {
    expect(deriveFootballScoringFormat(buildProfile(1))).toBe('ppr');
  });

  it('returns "custom" when the receiving rec multiplier matches no preset', () => {
    expect(deriveFootballScoringFormat(buildProfile(0.75))).toBe('custom');
  });

  it('returns undefined when the profile is null', () => {
    expect(deriveFootballScoringFormat(null)).toBeUndefined();
  });

  it('returns undefined when the profile is undefined', () => {
    expect(deriveFootballScoringFormat(undefined)).toBeUndefined();
  });

  it('returns undefined when no receiving rec stat exists in the profile', () => {
    expect(
      deriveFootballScoringFormat({
        __typename: 'ScoringConfig',
        profileId: 1,
        profileName: 'Test Profile',
        stats: [],
      }),
    ).toBeUndefined();
  });

  it('returns undefined when the receiving rec multiplier is not numeric', () => {
    expect(deriveFootballScoringFormat(buildProfile(null))).toBeUndefined();
  });

  it('ignores stats outside the receiving group with a matching statKey', () => {
    expect(
      deriveFootballScoringFormat({
        __typename: 'ScoringConfig',
        profileId: 1,
        profileName: 'Test Profile',
        stats: [
          {
            __typename: 'ScoringRule',
            multiplier: 1,
            defaultMultiplier: 1,
            isOverride: false,
            isEnabled: true,
            definition: {
              __typename: 'ScoringStatDefinition',
              id: 2,
              statKey: 'rec',
              statGroup: ScoringStatGroup.Rushing,
              displayName: 'Not receiving',
            },
          },
        ],
      }),
    ).toBeUndefined();
  });
});

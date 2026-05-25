import { computeIDPScore } from './IDPScoring';
import { DEFAULT_IDP_SCORING } from './DefaultScoring';

describe('computeIDPScore', () => {
  it('computes correct score for typical IDP stats', () => {
    const result = computeIDPScore(
      {
        solo_tkl: 5,
        ast_tkl: 3,
        sacks: 1.5,
        int: 1,
        pd: 2,
        ff: 1,
        fr: 0,
        def_td: 0,
        safeties: 0,
      },
      DEFAULT_IDP_SCORING,
    );
    // 5*1 + 3*0.5 + 1.5*2 + 1*3 + 2*1 + 1*2 + 0*2 + 0*6 + 0*2 = 5+1.5+3+3+2+2 = 16.5
    expect(result).toBe(16.5);
  });

  it('returns exactly 0 for all-zero stats', () => {
    const result = computeIDPScore(
      {
        solo_tkl: 0,
        ast_tkl: 0,
        sacks: 0,
        int: 0,
        pd: 0,
        ff: 0,
        fr: 0,
        def_td: 0,
        safeties: 0,
      },
      DEFAULT_IDP_SCORING,
    );
    expect(result).toBe(0);
  });

  it('skips null stat values', () => {
    const result = computeIDPScore(
      { solo_tkl: 4, sacks: null, int: null },
      DEFAULT_IDP_SCORING,
    );
    expect(result).toBe(4);
  });

  it('handles fractional sack values', () => {
    const result = computeIDPScore({ sacks: 0.5 }, DEFAULT_IDP_SCORING);
    // 0.5 * 2 = 1
    expect(result).toBe(1);
  });

  it('computes defensive TD bonus', () => {
    const result = computeIDPScore({ def_td: 1 }, DEFAULT_IDP_SCORING);
    expect(result).toBe(6);
  });
});

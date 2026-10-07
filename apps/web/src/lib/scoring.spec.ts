import { act, renderHook } from '@testing-library/react';
import { ScoringStatGroup } from '@legacy-sports/graphql';
import {
  applyMultiplierGroups,
  createDefaultScoringSettings,
  useLeagueScoringSettings,
} from './scoring';

jest.mock('@legacy-sports/graphql', () => {
  const actual = jest.requireActual<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );
  return {
    ...actual,
    useGetLeagueScoringProfileQuery: jest.fn(),
  };
});

const { useGetLeagueScoringProfileQuery } = jest.requireMock(
  '@legacy-sports/graphql',
);

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

describe('useLeagueScoringSettings — poll interval (LS-4053)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('passes pollInterval of 5 minutes to the query', () => {
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: jest.fn().mockResolvedValue({ data: undefined }),
    });

    renderHook(() => useLeagueScoringSettings(42));

    expect(useGetLeagueScoringProfileQuery).toHaveBeenCalledWith(
      expect.objectContaining({ pollInterval: 5 * 60 * 1000 }),
    );
  });

  it('still passes pollInterval when leagueId is provided', () => {
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch: jest.fn().mockResolvedValue({ data: undefined }),
    });

    renderHook(() => useLeagueScoringSettings(99));

    const [options] = useGetLeagueScoringProfileQuery.mock.calls[0] as [
      { pollInterval?: number; skip?: boolean },
    ];
    expect(options.pollInterval).toBe(5 * 60 * 1000);
    expect(options.skip).toBe(false);
  });
});

describe('useLeagueScoringSettings — visibility refetch (LS-4039)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => state,
    });
    document.dispatchEvent(new Event('visibilitychange'));
  };

  it('refetches the scoring profile when the tab returns to visible', () => {
    const refetch = jest.fn().mockResolvedValue({ data: undefined });
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch,
    });

    renderHook(() => useLeagueScoringSettings(42));

    expect(refetch).not.toHaveBeenCalled();

    act(() => setVisibility('hidden'));
    expect(refetch).not.toHaveBeenCalled();

    act(() => setVisibility('visible'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when the hook is skipped (no leagueId)', () => {
    const refetch = jest.fn().mockResolvedValue({ data: undefined });
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch,
    });

    renderHook(() => useLeagueScoringSettings(undefined));

    act(() => setVisibility('visible'));
    expect(refetch).not.toHaveBeenCalled();
  });

  it('cleans up the visibilitychange listener on unmount', () => {
    const refetch = jest.fn().mockResolvedValue({ data: undefined });
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      refetch,
    });

    const { unmount } = renderHook(() => useLeagueScoringSettings(42));
    unmount();

    act(() => setVisibility('visible'));
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe('useLeagueScoringSettings — scoringLabel (LS-10744)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  const mockProfile = (isOverrideFlags: boolean[]) => {
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: {
        leagueScoringProfile: {
          profileId: 1,
          profileName: 'Default',
          stats: isOverrideFlags.map((isOverride) => ({ isOverride })),
          multiplierGroups: [],
        },
      },
      loading: false,
      error: undefined,
      refetch: jest.fn().mockResolvedValue({ data: undefined }),
    });
  };

  it('labels the profile "Custom" when any stat is overridden', () => {
    mockProfile([false, true, false]);

    const { result } = renderHook(() => useLeagueScoringSettings(42));

    expect(result.current.scoringLabel).toBe('Custom');
    expect(result.current.profileName).toBe('Default');
  });

  it('falls back to the profile name when no stat is overridden', () => {
    mockProfile([false, false]);

    const { result } = renderHook(() => useLeagueScoringSettings(42));

    expect(result.current.scoringLabel).toBe('Default');
  });

  it('labels "Default" while no profile is loaded', () => {
    useGetLeagueScoringProfileQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
      refetch: jest.fn().mockResolvedValue({ data: undefined }),
    });

    const { result } = renderHook(() => useLeagueScoringSettings(42));

    expect(result.current.scoringLabel).toBe('Default');
  });
});

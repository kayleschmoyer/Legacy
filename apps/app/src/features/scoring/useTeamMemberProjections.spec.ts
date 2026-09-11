import { renderHook } from '@testing-library/react-native';
import { usePlayerProjections } from '@legacy-sports/shared-components';
import type { AppTeamMemberFragment } from '@legacy-sports/graphql';
import { useCareerAverageStats } from './careerAverages';
import { useTeamMemberProjections } from './useTeamMemberProjections';
import { useLeagueScoringSettings } from '../../common/scoring';

jest.mock('./careerAverages', () => ({
  useCareerAverageStats: jest.fn(),
}));

jest.mock('../../common/scoring', () => ({
  useLeagueScoringSettings: jest.fn(),
}));

jest.mock('@legacy-sports/shared-components', () => ({
  usePlayerProjections: jest.fn(),
}));

const mockedUseCareerAverageStats = jest.mocked(useCareerAverageStats);
const mockedUseLeagueScoringSettings = jest.mocked(useLeagueScoringSettings);
const mockedUsePlayerProjections = jest.mocked(usePlayerProjections);

const PPR_SETTINGS = {
  batting: { hr: 4 },
  fielding: {},
  pitching: {},
} as never;

const STANDARD_SETTINGS = {
  batting: { hr: 2 },
  fielding: {},
  pitching: {},
} as never;

function makeTeamMembers(): ReadonlyArray<AppTeamMemberFragment> {
  return [
    {
      playerId: 1,
      player: { firstName: 'A', lastName: 'B', brefId: 'ab01' },
    },
  ] as ReadonlyArray<AppTeamMemberFragment>;
}

describe('useTeamMemberProjections', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockedUseCareerAverageStats.mockReturnValue({
      records: new Map(),
      loading: false,
      error: undefined,
    });

    // Mirror the real hook's contract closely enough that recomputation
    // driven by a settings-identity change is observable: the projection
    // returned depends on which settings object was passed in.
    mockedUsePlayerProjections.mockImplementation(
      (_players, _stats, settings) => ({
        projections:
          settings === PPR_SETTINGS ? new Map([[1, 10]]) : new Map([[1, 5]]),
        loading: false,
        error: undefined,
      }),
    );
  });

  it('tags projections with a scoring-format version derived from the active profile', () => {
    mockedUseLeagueScoringSettings.mockReturnValue({
      settings: PPR_SETTINGS,
      profileName: 'PPR',
      loading: false,
      error: undefined,
      profile: null,
      refetch: jest.fn(),
    });

    const { result } = renderHook(() =>
      useTeamMemberProjections(makeTeamMembers(), 42),
    );

    expect(result.current.projections).toEqual({ 1: 10 });
    expect(result.current.scoringFormatVersion).toContain('PPR');
  });

  it('polls the league scoring profile so a format change elsewhere is detected', () => {
    mockedUseLeagueScoringSettings.mockReturnValue({
      settings: PPR_SETTINGS,
      profileName: 'PPR',
      loading: false,
      error: undefined,
      profile: null,
      refetch: jest.fn(),
    });

    renderHook(() => useTeamMemberProjections(makeTeamMembers(), 42));

    expect(mockedUseLeagueScoringSettings).toHaveBeenCalledWith(
      42,
      expect.objectContaining({
        pollInterval: expect.any(Number) as unknown,
      }),
    );
    const [, options] = mockedUseLeagueScoringSettings.mock.calls[0];
    const pollInterval: number | undefined = options?.pollInterval;
    expect(pollInterval).toBeGreaterThan(0);
  });

  it('invalidates and refreshes projections when the scoring format changes', () => {
    mockedUseLeagueScoringSettings.mockReturnValue({
      settings: PPR_SETTINGS,
      profileName: 'PPR',
      loading: false,
      error: undefined,
      profile: null,
      refetch: jest.fn(),
    });

    const { result, rerender } = renderHook(
      (props: { leagueId: number }) =>
        useTeamMemberProjections(makeTeamMembers(), props.leagueId),
      { initialProps: { leagueId: 42 } },
    );

    const pprVersion = result.current.scoringFormatVersion;
    expect(result.current.projections).toEqual({ 1: 10 });

    // Commissioner switches the league to Standard scoring — simulate the
    // poll picking up the new profile.
    mockedUseLeagueScoringSettings.mockReturnValue({
      settings: STANDARD_SETTINGS,
      profileName: 'Standard',
      loading: false,
      error: undefined,
      profile: null,
      refetch: jest.fn(),
    });

    rerender({ leagueId: 42 });

    expect(result.current.scoringFormatVersion).not.toBe(pprVersion);
    expect(result.current.scoringFormatVersion).toContain('Standard');
    expect(result.current.projections).toEqual({ 1: 5 });
  });

  it('exposes a refetch handle for forcing an immediate scoring-format check', () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    mockedUseLeagueScoringSettings.mockReturnValue({
      settings: PPR_SETTINGS,
      profileName: 'PPR',
      loading: false,
      error: undefined,
      profile: null,
      refetch,
    });

    const { result } = renderHook(() =>
      useTeamMemberProjections(makeTeamMembers(), 42),
    );

    void result.current.refetchScoringFormat();
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

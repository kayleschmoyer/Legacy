/**
 * Regression guard for LS-8789: the season picker used a raw HTML `<select>`/
 * `<option>`. `SeasonAwardsControl` is rendered directly on native (via
 * apps/app's CommissionerScreen) with no `.native.tsx` split, so RN has no
 * view config for those lowercase host tags and crashes with "View config
 * getter callback for component `option` must be a function" — the same
 * class of bug fixed for `div` in LS-8669. The fix swaps in the shared
 * cross-platform `Select` component; this asserts the season picker still
 * renders and drives season-scoped queries correctly.
 */
import React from 'react';
import { SeasonAwardsControl } from './SeasonAwardsControl';
import { act, fireEvent, render, screen } from '../../test-utils';

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueSeasonAwardsQuery: jest.fn(() => ({
    data: { leagueSeasonAwards: [] },
    loading: false,
  })),
  useGetAwardVotingPeriodQuery: jest.fn(() => ({
    data: { awardVotingPeriod: null },
    loading: false,
  })),
  useGetAwardVoteResultsQuery: jest.fn(() => ({
    data: { awardVoteResults: [] },
  })),
  useGetPlayersWithStatsQuery: jest.fn(() => ({
    data: { playersWithStats: [] },
    loading: false,
  })),
  useOpenAwardVotingMutation: jest.fn(() => [jest.fn()]),
  useCloseAwardVotingMutation: jest.fn(() => [jest.fn()]),
  useDeleteLeagueSeasonAwardMutation: jest.fn(() => [jest.fn()]),
  useUpsertLeagueSeasonAwardMutation: jest.fn(() => [jest.fn()]),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

describe('SeasonAwardsControl — LS-8789 native-safe season picker', () => {
  it('renders without throwing', () => {
    expect(() =>
      render(<SeasonAwardsControl leagueId={42} currentSeason={2024} />),
    ).not.toThrow();
  });

  it('uses the shared cross-platform Select, not a raw <option> list', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={2024} />);

    // The season picker is the only <select> in the tree (award recipients
    // use a text search input, not a dropdown) — it comes from the shared
    // Select component's Tamagui-backed mock, not a literal <select> in
    // this component's source.
    const seasonSelect = screen.getByRole('combobox');
    expect(seasonSelect).toBeTruthy();
    expect(screen.getByRole('option', { name: '2024 Season' })).toBeTruthy();
  });

  it('re-queries season-scoped data when a different season is picked', () => {
    const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
      '@legacy-sports/graphql',
    );

    render(<SeasonAwardsControl leagueId={42} currentSeason={2024} />);

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: '2023' },
    });

    expect(graphql.useGetLeagueSeasonAwardsQuery).toHaveBeenLastCalledWith({
      variables: { leagueId: 42, season: 2023 },
    });
  });
});

describe('SeasonAwardsControl — LS-10847 consolidated web behaviour', () => {
  const graphql = jest.requireMock<typeof import('@legacy-sports/graphql')>(
    '@legacy-sports/graphql',
  );

  afterEach(() => {
    jest.mocked(graphql.useGetAwardVotingPeriodQuery).mockImplementation(
      () =>
        ({
          data: { awardVotingPeriod: null },
          loading: false,
        }) as unknown as ReturnType<
          typeof graphql.useGetAwardVotingPeriodQuery
        >,
    );
    jest
      .mocked(graphql.useCloseAwardVotingMutation)
      .mockImplementation(
        () =>
          [jest.fn()] as unknown as ReturnType<
            typeof graphql.useCloseAwardVotingMutation
          >,
      );
  });

  it('exposes the panel and per-award row testids used by web e2e', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={2024} />);

    expect(screen.getByTestId('season-awards-panel')).toBeTruthy();
    for (const key of [
      'mvp',
      'cy_young',
      'rookie_of_the_year',
      'gold_glove',
      'silver_slugger',
    ]) {
      expect(screen.getByTestId(`award-row-${key}`)).toBeTruthy();
    }
  });

  it('labels the season picker "Select season" for assistive tech', () => {
    render(<SeasonAwardsControl leagueId={42} currentSeason={2024} />);

    expect(
      screen.getByRole('combobox', { name: /select season/i }),
    ).toBeTruthy();
  });

  it('fires closeVoting only once when Close Voting is double-clicked', () => {
    const closeVoting = jest.fn(() => new Promise<never>(() => undefined));
    jest
      .mocked(graphql.useCloseAwardVotingMutation)
      .mockImplementation(
        () =>
          [closeVoting] as unknown as ReturnType<
            typeof graphql.useCloseAwardVotingMutation
          >,
      );
    jest.mocked(graphql.useGetAwardVotingPeriodQuery).mockImplementation(
      () =>
        ({
          data: {
            awardVotingPeriod: {
              id: 1,
              status: 'open',
              awardTypes: ['mvp'],
            },
          },
          loading: false,
        }) as unknown as ReturnType<
          typeof graphql.useGetAwardVotingPeriodQuery
        >,
    );

    render(<SeasonAwardsControl leagueId={42} currentSeason={2024} />);

    const closeButton = screen.getByText(/close voting & tally results/i);
    // Both clicks land before React re-renders with `disabled`, so only the
    // ref guard can stop the second one.
    act(() => {
      fireEvent.click(closeButton);
      fireEvent.click(closeButton);
    });

    expect(closeVoting).toHaveBeenCalledTimes(1);
  });
});

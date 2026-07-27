import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  SeasonDraftGameStatus,
  useGetDisclosureGameBestScoreQuery,
  useGetMinigamesStatsQuery,
  useGetSeasonDraftGamesQuery,
} from '@legacy-sports/graphql';
import { MinigamesHub } from './MinigamesHub.native';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

// react-native-svg's real implementation pulls in RN's native Touchable
// mixin, which the shared mobile jest mock of 'react-native' doesn't
// provide. Stub the handful of primitives MinigamesHub.native uses.
jest.mock('react-native-svg', () => {
  /* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires -- jest.mock factory needs runtime require */
  const ReactLocal = require('react') as typeof import('react');
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires */
  const stub = (tag: string) => {
    const Component = ({
      children,
      ...props
    }: { children?: React.ReactNode } & Record<string, unknown>) =>
      ReactLocal.createElement(tag, props, children);
    Component.displayName = tag;
    return Component;
  };
  return {
    __esModule: true,
    default: stub('svg'),
    Circle: stub('circle'),
    Path: stub('path'),
  };
});

function setupDefaultMocks() {
  jest.mocked(useGetSeasonDraftGamesQuery).mockReturnValue({
    data: {
      seasonDraftGames: [
        { status: SeasonDraftGameStatus.Setup },
        { status: SeasonDraftGameStatus.Drafting },
        { status: SeasonDraftGameStatus.Completed },
      ],
    },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetSeasonDraftGamesQuery>);
  jest.mocked(useGetDisclosureGameBestScoreQuery).mockReturnValue({
    data: { disclosureGameBestScore: 7 },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetDisclosureGameBestScoreQuery>);
  jest.mocked(useGetMinigamesStatsQuery).mockReturnValue({
    data: {
      minigamesStats: {
        playerSeasons: 21_000_000,
        earliestYear: 1876,
        playersTracked: 20000,
      },
    },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetMinigamesStatsQuery>);
}

describe('MinigamesHub (native)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // Regression test for LS-8669: the web MinigamesHub renders raw HTML/SVG
  // host tags, which crash React Native with "View config getter callback
  // for component `div` must be a function". This asserts the native
  // implementation mounts cleanly instead.
  it('renders without throwing', () => {
    const onNavigate = jest.fn();
    expect(() =>
      render(<MinigamesHub onNavigate={onNavigate} isNarrow={false} />),
    ).not.toThrow();
  });

  it('renders every game title and its live stat', () => {
    const { getByText } = render(
      <MinigamesHub onNavigate={jest.fn()} isNarrow={false} />,
    );

    expect(getByText('Season Draft')).toBeTruthy();
    expect(getByText('Who Am I?')).toBeTruthy();
    expect(getByText('20 Questions')).toBeTruthy();
    // activeGamesCount counts only Setup/Drafting statuses (2 of the 3 mocked games).
    expect(getByText('2')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
  });

  it('falls back to em-dash while stat queries are loading', () => {
    jest.mocked(useGetSeasonDraftGamesQuery).mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    } as unknown as ReturnType<typeof useGetSeasonDraftGamesQuery>);
    jest.mocked(useGetDisclosureGameBestScoreQuery).mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    } as unknown as ReturnType<typeof useGetDisclosureGameBestScoreQuery>);

    const { getAllByText } = render(
      <MinigamesHub onNavigate={jest.fn()} isNarrow={false} />,
    );

    expect(getAllByText('—').length).toBeGreaterThan(0);
  });

  it('calls onNavigate with the pressed game id', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <MinigamesHub onNavigate={onNavigate} isNarrow={false} />,
    );

    fireEvent.click(getByText('Enter Lobby'));

    expect(onNavigate).toHaveBeenCalledWith('season-draft');
  });

  it('logs a non-fatal query error instead of throwing', () => {
    const { LOGGER } = jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
      '@legacy-sports/logging',
    );
    const queryError = new Error('boom');
    jest.mocked(useGetDisclosureGameBestScoreQuery).mockReturnValue({
      data: undefined,
      loading: false,
      error: queryError,
    } as unknown as ReturnType<typeof useGetDisclosureGameBestScoreQuery>);

    render(<MinigamesHub onNavigate={jest.fn()} isNarrow={false} />);

    // Pass the error object itself (not a stringified message) so Rollbar
    // can extract the stack trace.
    expect(LOGGER.error).toHaveBeenCalledWith(
      expect.stringContaining('disclosureGameBestScore'),
      queryError,
    );
  });
});

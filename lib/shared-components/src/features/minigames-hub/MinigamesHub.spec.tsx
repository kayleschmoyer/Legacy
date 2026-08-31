import React from 'react';
import { fireEvent } from '@testing-library/react';
import {
  SeasonDraftGameStatus,
  useGetDisclosureGameBestScoreQuery,
  useGetMinigamesStatsQuery,
  useGetMyMockDraftUsageQuery,
  useGetSeasonDraftGamesQuery,
} from '@legacy-sports/graphql';
import { MinigamesHub } from './MinigamesHub';
import { render } from '../../test-utils';

jest.mock('@legacy-sports/graphql');

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

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
  jest.mocked(useGetMyMockDraftUsageQuery).mockReturnValue({
    data: {
      getMyMockDraftUsage: {
        used: 1,
        limit: 2,
        remaining: 1,
        isUnlimited: false,
      },
    },
    loading: false,
    error: undefined,
  } as unknown as ReturnType<typeof useGetMyMockDraftUsageQuery>);
}

describe('MinigamesHub', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupDefaultMocks();
  });

  // Regression test for LS-8669/LS-9058: MinigamesHub used to fork into a
  // raw-HTML/SVG web file and a Tamagui native file because the raw host
  // tags crashed React Native. The single merged component now builds on
  // Tamagui + platform-split icon/artwork shims, so it renders cleanly.
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
    expect(getByText('Mock Draft')).toBeTruthy();
    // activeGamesCount counts only Setup/Drafting statuses (2 of the 3 mocked games).
    expect(getByText('2')).toBeTruthy();
    expect(getByText('7')).toBeTruthy();
    // mockDraftsRemaining from the mocked getMyMockDraftUsage query.
    expect(getByText('1')).toBeTruthy();
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

  it('calls onNavigate when the Mock Draft card is pressed', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <MinigamesHub onNavigate={onNavigate} isNarrow={false} />,
    );

    fireEvent.click(getByText('Start Draft'));

    expect(onNavigate).toHaveBeenCalledWith('mock-draft');
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

  it('logs a non-fatal getMyMockDraftUsage query error instead of throwing', () => {
    const { LOGGER } = jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
      '@legacy-sports/logging',
    );
    const queryError = new Error('boom');
    jest.mocked(useGetMyMockDraftUsageQuery).mockReturnValue({
      data: undefined,
      loading: false,
      error: queryError,
    } as unknown as ReturnType<typeof useGetMyMockDraftUsageQuery>);

    render(<MinigamesHub onNavigate={jest.fn()} isNarrow={false} />);

    expect(LOGGER.error).toHaveBeenCalledWith(
      expect.stringContaining('getMyMockDraftUsage'),
      queryError,
    );
  });
});

import React from 'react';
import { fireEvent, within } from '@testing-library/react';
import {
  SeasonDraftGameStatus,
  useGetDisclosureGameBestScoreQuery,
  useGetMinigamesStatsQuery,
  useGetMyMockDraftUsageQuery,
  useGetSeasonDraftGamesQuery,
} from '@legacy-sports/graphql';
import { formatDraftDate } from '@legacy-sports/utils';
import { MinigamesHub } from './MinigamesHub';
import { GAME_TEMPLATES } from './MinigamesHub.shared';
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

  it('shows when the next free mock draft opens once none remain (LS-10455)', () => {
    const resetsAt = '2026-10-09T16:00:00.000Z';
    jest.mocked(useGetMyMockDraftUsageQuery).mockReturnValue({
      data: {
        getMyMockDraftUsage: {
          used: 2,
          limit: 2,
          remaining: 0,
          isUnlimited: false,
          resetsAt,
        },
      },
      loading: false,
      error: undefined,
    } as unknown as ReturnType<typeof useGetMyMockDraftUsageQuery>);

    const { getByTestId } = render(
      <MinigamesHub onNavigate={jest.fn()} isNarrow={false} />,
    );

    // Local time zone via formatDraftDate (zone-independent assertion).
    expect(getByTestId('minigame-stat-note-mock-draft').textContent).toBe(
      `Next free draft ${formatDraftDate(resetsAt)}`,
    );
  });

  it('shows ∞ on the Mock Draft card for unlimited (premium) users (LS-10463)', () => {
    jest.mocked(useGetMyMockDraftUsageQuery).mockReturnValue({
      data: {
        getMyMockDraftUsage: {
          used: 0,
          limit: 2,
          remaining: null,
          isUnlimited: true,
          resetsAt: null,
        },
      },
      loading: false,
      error: undefined,
    } as unknown as ReturnType<typeof useGetMyMockDraftUsageQuery>);

    const { getByText, queryByTestId } = render(
      <MinigamesHub onNavigate={jest.fn()} isNarrow={false} />,
    );

    expect(getByText('∞')).toBeTruthy();
    expect(queryByTestId('minigame-stat-note-mock-draft')).toBeNull();
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

  // LS-10460: two cards share the "Play Now" label, so each CTA is located
  // inside the card carrying its title — a press must report that card's own
  // id, exactly once, never a neighbour's. The expected ids are spelled out
  // here rather than read from GAME_TEMPLATES so a template carrying the wrong
  // id fails the spec instead of agreeing with itself.
  const CARD_TARGETS = [
    ['Season Draft', 'Enter Lobby', 'season-draft'],
    ['Who Am I?', 'Play Now', 'disclosure'],
    ['20 Questions', 'Play Now', 'twenty-questions'],
    ['Mock Draft', 'Start Draft', 'mock-draft'],
  ] as const;

  it('covers every game card', () => {
    expect(CARD_TARGETS.map(([title]) => title)).toEqual(
      GAME_TEMPLATES.map((g) => g.title),
    );
  });

  it.each(CARD_TARGETS)(
    'pressing the %s card\'s "%s" CTA calls onNavigate with %s',
    (title, cta, id) => {
      const onNavigate = jest.fn();
      const { getAllByRole } = render(
        <MinigamesHub onNavigate={onNavigate} isNarrow={false} />,
      );
      const card = getAllByRole('button').find(
        (el) =>
          within(el).queryByText(title) !== null &&
          within(el).queryByText(cta) !== null,
      );
      if (!card) throw new Error(`No card found for ${title}`);

      fireEvent.click(within(card).getByText(cta));

      expect(onNavigate).toHaveBeenCalledTimes(1);
      expect(onNavigate).toHaveBeenCalledWith(id);
    },
  );

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

  // LS-10710: the hero title and card titles were plain Text, so /games had
  // no headings for assistive-tech heading navigation.
  it('exposes one h1 and an h2 per game card plus Coming Soon', () => {
    const { getAllByRole } = render(
      <MinigamesHub onNavigate={jest.fn()} isNarrow={false} />,
    );

    const h1s = getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0].textContent).toContain("The game doesn't stop");

    const h2Names = getAllByRole('heading', { level: 2 }).map(
      (h) => h.textContent,
    );
    expect(h2Names).toEqual([
      ...GAME_TEMPLATES.map((t) => t.title),
      'Coming Soon',
    ]);
  });

  it('renders the optional banner slot (LS-10465)', () => {
    const { getByText } = render(
      <MinigamesHub
        onNavigate={jest.fn()}
        isNarrow={false}
        banner={<span>Resume your mock draft</span>}
      />,
    );
    expect(getByText('Resume your mock draft')).toBeTruthy();
  });
});

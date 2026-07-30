import React from 'react';
import { type PlayerFeedRow, PlayersCardFeed } from './PlayersCardFeed';
import { BASEBALL_CARD_POSITIONS } from './cardFeedHelpers';
import { fireEvent, render, screen } from '../../../test-utils';

function makeRow(overrides: Partial<PlayerFeedRow> = {}): PlayerFeedRow {
  return {
    id: 'player-1',
    position: 'OF',
    name: 'Barry Bonds',
    subStats: 'HR 762 · RBI 1,996 · AVG .298',
    fpts: '14,208',
    trend: 'flat',
    ...overrides,
  };
}

const baseProps = () => ({
  sport: 'baseball' as const,
  onSportChange: jest.fn(),
  positions: BASEBALL_CARD_POSITIONS,
  position: 'ALL',
  onPositionChange: jest.fn(),
  searchValue: '',
  onSearchChange: jest.fn(),
  sortDirection: 'desc' as const,
  onToggleSort: jest.fn(),
  rows: [makeRow()],
  resultCount: 1,
  onPlayerPress: jest.fn(),
  isLoading: false,
  isError: false,
  onRetry: jest.fn(),
  onClearFilters: jest.fn(),
  isPremium: false,
  onPremiumPress: jest.fn(),
  hasMore: false,
  isLoadingMore: false,
  onEndReached: jest.fn(),
});

describe('PlayersCardFeed', () => {
  test('renders the title, sport toggle, search field, and chip rail', () => {
    render(<PlayersCardFeed {...baseProps()} />);

    expect(screen.getByText('Players')).toBeInTheDocument();
    expect(
      screen.getByTestId('players-card-feed-sport-toggle'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('players-card-feed-search')).toBeInTheDocument();
    expect(
      screen.getByTestId('players-card-feed-position-chips'),
    ).toBeInTheDocument();
  });

  test('shows the loading skeleton and hides results while isLoading', () => {
    render(<PlayersCardFeed {...baseProps()} isLoading rows={[]} />);

    expect(
      screen.getByTestId('players-card-feed-skeleton'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Barry Bonds')).not.toBeInTheDocument();
  });

  test('shows the error card and a working retry action', () => {
    const props = baseProps();
    render(<PlayersCardFeed {...props} isError rows={[]} />);

    expect(screen.getByTestId('player-stats-error-card')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
  });

  test('shows the empty card with a working clear-filters action', () => {
    const props = baseProps();
    render(<PlayersCardFeed {...props} rows={[]} resultCount={0} />);

    expect(screen.getByTestId('player-stats-empty-card')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear all filters'));
    expect(props.onClearFilters).toHaveBeenCalledTimes(1);
  });

  test('renders result rows and the sort control when loaded with results', () => {
    render(<PlayersCardFeed {...baseProps()} />);

    expect(screen.getByText('Barry Bonds')).toBeInTheDocument();
    expect(screen.getByTestId('players-card-feed-sort')).toBeInTheDocument();
    expect(screen.getByText('1 players')).toBeInTheDocument();
  });

  test('tapping a player card fires onPlayerPress with its id', () => {
    const props = baseProps();
    render(<PlayersCardFeed {...props} />);

    fireEvent.click(screen.getByTestId('players-card-feed-card-player-1'));

    expect(props.onPlayerPress).toHaveBeenCalledWith('player-1');
  });

  test('renders the premium teaser after the 3rd card for free-tier users', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `player-${i}`, name: `Player ${i}` }),
    );
    render(<PlayersCardFeed {...baseProps()} rows={rows} isPremium={false} />);

    expect(
      screen.getByTestId('players-card-feed-premium-teaser'),
    ).toBeInTheDocument();
  });

  test('never renders the premium teaser for premium users', () => {
    const rows = Array.from({ length: 5 }, (_, i) =>
      makeRow({ id: `player-${i}`, name: `Player ${i}` }),
    );
    render(<PlayersCardFeed {...baseProps()} rows={rows} isPremium={true} />);

    expect(
      screen.queryByTestId('players-card-feed-premium-teaser'),
    ).not.toBeInTheDocument();
  });

  test('appends the premium teaser at the end for a short list', () => {
    render(
      <PlayersCardFeed
        {...baseProps()}
        rows={[makeRow()]}
        resultCount={1}
        isPremium={false}
      />,
    );

    expect(
      screen.getByTestId('players-card-feed-premium-teaser'),
    ).toBeInTheDocument();
  });

  test('toggling sort fires onToggleSort', () => {
    const props = baseProps();
    render(<PlayersCardFeed {...props} />);

    fireEvent.click(screen.getByTestId('players-card-feed-sort'));

    expect(props.onToggleSort).toHaveBeenCalledTimes(1);
  });

  test('omits the sport toggle when showSportToggle is false', () => {
    render(<PlayersCardFeed {...baseProps()} showSportToggle={false} />);

    expect(
      screen.queryByTestId('players-card-feed-sport-toggle'),
    ).not.toBeInTheDocument();
  });

  test('renders an overflow action when provided (Compare entry point)', () => {
    const onOverflowPress = jest.fn();
    render(
      <PlayersCardFeed {...baseProps()} onOverflowPress={onOverflowPress} />,
    );

    fireEvent.click(screen.getByTestId('players-card-feed-overflow'));

    expect(onOverflowPress).toHaveBeenCalledTimes(1);
  });
});

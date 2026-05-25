import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { MatchupCard } from './MatchupCard';
import { MatchupStatus } from '../../api/db/graphql.generated';
import type { MatchupFragment } from '../../api/db/graphql.generated';
import { render } from '../../test-utils';

const createMatchup = (
  overrides: Partial<MatchupFragment> = {},
): MatchupFragment => ({
  __typename: 'Matchup',
  id: '1',
  weekNumber: 3,
  leagueId: 10,
  team1Id: 1,
  team2Id: 2,
  team1Score: 85.5,
  team2Score: 72.3,
  status: MatchupStatus.InProgress,
  statsLoadingStatus: null,
  gamesPerMatchup: 7,
  pitcherStartsPerMatchup: 2,
  selectedGamesCount: 5,
  startTime: null,
  endTime: null,
  ...overrides,
});

describe('MatchupCard', () => {
  it('returns null when matchup is null', () => {
    const { container } = render(<MatchupCard matchup={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null when matchup is undefined', () => {
    const { container } = render(<MatchupCard matchup={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders the matchup card', () => {
    render(<MatchupCard matchup={createMatchup()} />);
    expect(screen.getByTestId('matchup-card')).toBeTruthy();
  });

  it('displays the week number when showWeek is true', () => {
    render(<MatchupCard matchup={createMatchup({ weekNumber: 5 })} />);
    expect(screen.getByText('Week 5')).toBeTruthy();
  });

  it('hides the week number when showWeek is false', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ weekNumber: 5 })}
        showWeek={false}
      />,
    );
    expect(screen.queryByText('Week 5')).toBeNull();
  });

  it('displays team scores', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ team1Score: 85.5, team2Score: 72.3 })}
      />,
    );
    expect(screen.getByText('85.50')).toBeTruthy();
    expect(screen.getByText('72.30')).toBeTruthy();
  });

  it('displays dash when scores are null', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ team1Score: null, team2Score: null })}
      />,
    );
    const dashes = screen.getAllByText('-');
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('displays VS separator', () => {
    render(<MatchupCard matchup={createMatchup()} />);
    expect(screen.getByText('VS')).toBeTruthy();
  });

  it('shows "Live" for in-progress matchups', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ status: MatchupStatus.InProgress })}
      />,
    );
    expect(screen.getByText('Live')).toBeTruthy();
  });

  it('shows "Final" for completed matchups', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ status: MatchupStatus.Completed })}
      />,
    );
    expect(screen.getByText('Final')).toBeTruthy();
  });

  it('shows "Scheduled" for scheduled matchups', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ status: MatchupStatus.Scheduled })}
      />,
    );
    expect(screen.getByText('Scheduled')).toBeTruthy();
  });

  it('shows "Cancelled" for cancelled matchups', () => {
    render(
      <MatchupCard
        matchup={createMatchup({ status: MatchupStatus.Cancelled })}
      />,
    );
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });

  it('calls onPress when card is clicked', () => {
    const onPress = jest.fn();
    render(<MatchupCard matchup={createMatchup()} onPress={onPress} />);
    fireEvent.click(screen.getByTestId('matchup-card'));
    expect(onPress).toHaveBeenCalled();
  });

  it('renders team labels', () => {
    render(<MatchupCard matchup={createMatchup()} />);
    expect(screen.getByText('Team 1')).toBeTruthy();
    expect(screen.getByText('Team 2')).toBeTruthy();
  });
});

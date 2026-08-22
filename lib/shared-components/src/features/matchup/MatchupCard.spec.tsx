import React from 'react';
import { fireEvent, screen } from '@testing-library/react';

import { MatchupStatus } from '@legacy-sports/graphql';
import type { MatchupFragment } from '@legacy-sports/graphql';
import { MatchupCard } from './MatchupCard';
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

  it('renders provided team names from the fragment', () => {
    render(
      <MatchupCard
        matchup={createMatchup({
          team1: { __typename: 'Team', id: 1, name: 'Sluggers' },
          team2: { __typename: 'Team', id: 2, name: 'Aces' },
        })}
      />,
    );
    expect(screen.getByText('Sluggers')).toBeTruthy();
    expect(screen.getByText('Aces')).toBeTruthy();
  });

  it('renders team logos when logo URLs are supplied', () => {
    render(
      <MatchupCard
        matchup={createMatchup({
          team1: { __typename: 'Team', id: 1, name: 'Sluggers' },
          team2: { __typename: 'Team', id: 2, name: 'Aces' },
        })}
        team1LogoUrl="https://cdn.example.com/team1.png"
        team2LogoUrl="https://cdn.example.com/team2.png"
      />,
    );
    const logos = screen.getAllByRole('img');
    const sources = logos.map((img) => img.getAttribute('src'));
    expect(sources).toContain('https://cdn.example.com/team1.png');
    expect(sources).toContain('https://cdn.example.com/team2.png');
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
    // The wrapper div only carries data-testid (LS-4133 workaround, see
    // MatchupCard.tsx); the click must dispatch on its first child, the
    // actual Tamagui-rendered onPress carrier.
    const wrapper = screen.getByTestId('matchup-card');
    fireEvent.click(wrapper.firstElementChild as HTMLElement);
    expect(onPress).toHaveBeenCalled();
  });

  it('renders team labels', () => {
    render(<MatchupCard matchup={createMatchup()} />);
    expect(screen.getByText('Team 1')).toBeTruthy();
    expect(screen.getByText('Team 2')).toBeTruthy();
  });

  it('displays projected scores when winProbability is present (LS-6323)', () => {
    render(
      <MatchupCard
        matchup={createMatchup({
          winProbability: {
            __typename: 'MatchupWinProbability',
            team1ProjectedScore: 124.5,
            team2ProjectedScore: 118.2,
          },
        })}
      />,
    );
    expect(screen.getByText('Proj 124.50')).toBeTruthy();
    expect(screen.getByText('Proj 118.20')).toBeTruthy();
  });

  it('omits projected scores when winProbability is absent', () => {
    render(<MatchupCard matchup={createMatchup({ winProbability: null })} />);
    expect(screen.queryByText(/^Proj /)).toBeNull();
  });
});

import React from 'react';
import { screen } from '@testing-library/react';

import {
  MatchupScoreboardHero,
  type MatchupScoreboardHeroProps,
} from './MatchupScoreboardHero';
import { MatchupStatus } from '../../api/db/graphql.generated';
import { render } from '../../test-utils';

const baseProps = (
  overrides: Partial<MatchupScoreboardHeroProps> = {},
): MatchupScoreboardHeroProps => ({
  weekNumber: 5,
  totalMatchups: 12,
  status: MatchupStatus.InProgress,
  team1: { id: 10, name: 'Team A', score: 87.5, projectedScore: 120.5 },
  team2: { id: 20, name: 'Team B', score: 138.0, projectedScore: 150.25 },
  gamesPlayed: 6,
  totalGames: 10,
  ...overrides,
});

describe('MatchupScoreboardHero', () => {
  it('renders team names and scores', () => {
    render(<MatchupScoreboardHero {...baseProps()} />);
    expect(screen.getByText('Team A')).toBeTruthy();
    expect(screen.getByText('Team B')).toBeTruthy();
    expect(screen.getByText('87.50')).toBeTruthy();
    expect(screen.getByText('138.00')).toBeTruthy();
  });

  it('renders the VS badge and status chip with week number', () => {
    render(<MatchupScoreboardHero {...baseProps({ weekNumber: 7 })} />);
    expect(screen.getByText('VS')).toBeTruthy();
    expect(screen.getByText('Live · Week 7')).toBeTruthy();
  });

  it('shows the Final chip for completed matchups', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({ status: MatchupStatus.Completed })}
      />,
    );
    expect(screen.getByText('Final · Week 5')).toBeTruthy();
  });

  it('renders projected scores when provided', () => {
    render(<MatchupScoreboardHero {...baseProps()} />);
    expect(screen.getByText('120.50 proj')).toBeTruthy();
    expect(screen.getByText('150.25 proj')).toBeTruthy();
  });

  it('falls back to 0.00 when a score is missing', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          team1: { id: 10, name: 'Team A', score: null },
          team2: { id: 20, name: 'Team B', score: null },
        })}
      />,
    );
    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(2);
  });

  it('renders the W-L-T record when provided and a placeholder otherwise', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          team1: { id: 10, name: 'Team A', score: 87.5, record: '7-3-1' },
          team2: { id: 20, name: 'Team B', score: 138.0 },
        })}
      />,
    );
    expect(screen.getByText('7-3-1')).toBeTruthy();
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('renders the matchup index in the meta line', () => {
    render(<MatchupScoreboardHero {...baseProps({ weekNumber: 3 })} />);
    expect(screen.getByText('Head-to-Head · Matchup 3/12')).toBeTruthy();
  });

  it('renders team avatars as interactive when onTeamPress is provided', () => {
    // The tamagui mock strips `onPress`, so the callback cannot be fired via
    // fireEvent here; this asserts the pressable branch renders cleanly.
    const onTeamPress = jest.fn();
    render(<MatchupScoreboardHero {...baseProps({ onTeamPress })} />);
    expect(screen.getByText('Team A')).toBeTruthy();
    expect(screen.getByText('Team B')).toBeTruthy();
  });
});

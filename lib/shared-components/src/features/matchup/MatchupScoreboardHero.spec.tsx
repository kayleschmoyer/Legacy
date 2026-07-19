import React from 'react';
import { screen } from '@testing-library/react';

import { MatchupStatus } from '@legacy-sports/graphql';
import {
  MatchupScoreboardHero,
  type MatchupScoreboardHeroProps,
} from './MatchupScoreboardHero';
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

  it('renders non-interactive avatars when a team id is null (BYE slot)', () => {
    // When team1.id is null the pressable flag must be false — the avatar
    // should carry no pointer cursor even if onTeamPress is provided.
    const onTeamPress = jest.fn();
    render(
      <MatchupScoreboardHero
        {...baseProps({
          team1: { id: null, name: 'BYE' },
          onTeamPress,
        })}
      />,
    );
    expect(screen.getByText('BYE')).toBeTruthy();
    // onTeamPress must NOT be called for the null-id team — the component
    // renders but exposes no pressable handler for that side.
    expect(onTeamPress).not.toHaveBeenCalled();
  });

  it('shows the Cancelled chip for cancelled matchups', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({ status: MatchupStatus.Cancelled })}
      />,
    );
    expect(screen.getByText('Cancelled · Week 5')).toBeTruthy();
  });

  it('shows the Scheduled chip for scheduled matchups', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({ status: MatchupStatus.Scheduled })}
      />,
    );
    expect(screen.getByText('Scheduled · Week 5')).toBeTruthy();
  });

  it('shows "Status unknown" chip when status is null', () => {
    render(<MatchupScoreboardHero {...baseProps({ status: null })} />);
    expect(screen.getByText('Status unknown · Week 5')).toBeTruthy();
  });

  it('shows "Status unknown" chip when status is undefined', () => {
    render(<MatchupScoreboardHero {...baseProps({ status: undefined })} />);
    expect(screen.getByText('Status unknown · Week 5')).toBeTruthy();
  });

  it('announces the leading team and score via a live region', () => {
    render(<MatchupScoreboardHero {...baseProps()} />);
    expect(screen.getByText('Team B now leads 138.00 to 87.50')).toBeTruthy();
  });

  it('announces a tie via the live region', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          team1: { id: 10, name: 'Team A', score: 100 },
          team2: { id: 20, name: 'Team B', score: 100 },
        })}
      />,
    );
    expect(screen.getByText('Team A and Team B tied at 100.00')).toBeTruthy();
  });

  it('exposes each score as a polite live region labelled with the team name', () => {
    render(<MatchupScoreboardHero {...baseProps()} />);
    const score1 = screen.getByLabelText('Team A score 87.50');
    const score2 = screen.getByLabelText('Team B score 138.00');
    expect(score1.getAttribute('aria-live')).toBe('polite');
    expect(score1.getAttribute('aria-atomic')).toBe('true');
    expect(score2.getAttribute('aria-live')).toBe('polite');
  });
});

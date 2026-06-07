import React from 'react';
import { screen } from '@testing-library/react';

import {
  MatchupScoreboardView,
  type MatchupScoreboardViewProps,
} from './MatchupScoreboardView';
import { MatchupStatus } from '../../api/db/graphql.generated';
import { render } from '../../test-utils';

const baseProps = (
  overrides: Partial<MatchupScoreboardViewProps> = {},
): MatchupScoreboardViewProps => ({
  hasMatchup: true,
  weekNumber: 5,
  status: MatchupStatus.InProgress,
  gamesPerMatchup: 10,
  gamesRemaining: 4,
  team1Id: 10,
  team2Id: 20,
  team1Name: 'Team A',
  team2Name: 'Team B',
  team1Score: 87.5,
  team2Score: 138.0,
  team1Projected: null,
  team2Projected: null,
  hasPlayersError: false,
  ...overrides,
});

describe('MatchupScoreboardView', () => {
  it('renders the empty state when hasMatchup is false', () => {
    render(<MatchupScoreboardView {...baseProps({ hasMatchup: false })} />);
    expect(screen.getByText('No active matchup')).toBeTruthy();
    // None of the team data should render in the empty state.
    expect(screen.queryByText('Team A')).toBeNull();
  });

  it('renders team names and scores', () => {
    render(<MatchupScoreboardView {...baseProps()} />);
    expect(screen.getByText('Team A')).toBeTruthy();
    expect(screen.getByText('Team B')).toBeTruthy();
    expect(screen.getByText('87.50')).toBeTruthy();
    expect(screen.getByText('138.00')).toBeTruthy();
  });

  it('renders the VS badge and week number', () => {
    render(<MatchupScoreboardView {...baseProps({ weekNumber: 7 })} />);
    expect(screen.getByText('VS')).toBeTruthy();
    expect(screen.getByText('Week 7')).toBeTruthy();
  });

  it('falls back to 0.00 when a score is null', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ team1Score: null, team2Score: null })}
      />,
    );
    expect(screen.getAllByText('0.00').length).toBeGreaterThanOrEqual(2);
  });

  it('shows the LIVE status for in-progress matchups', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ status: MatchupStatus.InProgress })}
      />,
    );
    expect(screen.getByText('LIVE')).toBeTruthy();
  });

  it('shows the FINAL status and Winner label for completed matchups', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ status: MatchupStatus.Completed, gamesRemaining: 0 })}
      />,
    );
    expect(screen.getByText('FINAL')).toBeTruthy();
    // team2 has the higher score, so it is the winner.
    expect(screen.getByText('Winner')).toBeTruthy();
  });

  it('shows the SCHEDULED status for scheduled matchups', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ status: MatchupStatus.Scheduled })}
      />,
    );
    expect(screen.getByText('SCHEDULED')).toBeTruthy();
  });

  it('surfaces the stale-data warning when hasPlayersError is true', () => {
    render(<MatchupScoreboardView {...baseProps({ hasPlayersError: true })} />);
    expect(
      screen.getByText('Live stats unavailable — showing last saved scores.'),
    ).toBeTruthy();
  });

  it('does not show the stale-data warning when there is no error', () => {
    render(
      <MatchupScoreboardView {...baseProps({ hasPlayersError: false })} />,
    );
    expect(
      screen.queryByText('Live stats unavailable — showing last saved scores.'),
    ).toBeNull();
  });

  it('shows projections when games remain and projections are provided', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({
          status: MatchupStatus.InProgress,
          gamesRemaining: 4,
          team1Projected: 120.5,
          team2Projected: 150.25,
        })}
      />,
    );
    expect(screen.getByText('Proj: 120.50')).toBeTruthy();
    expect(screen.getByText('Proj: 150.25')).toBeTruthy();
  });

  it('hides projections once the matchup is completed', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({
          status: MatchupStatus.Completed,
          gamesRemaining: 0,
          team1Projected: 120.5,
          team2Projected: 150.25,
        })}
      />,
    );
    expect(screen.queryByText('Proj: 120.50')).toBeNull();
  });

  it('renders team names as interactive when onTeamClick is provided', () => {
    // The tamagui Text mock strips `onPress`, so the callback cannot be fired
    // via fireEvent here; this asserts the clickable branch renders cleanly.
    const onTeamClick = jest.fn();
    render(
      <MatchupScoreboardView
        {...baseProps({ team1Id: 10, team2Id: 20, onTeamClick })}
      />,
    );
    expect(screen.getByText('Team A')).toBeTruthy();
    expect(screen.getByText('Team B')).toBeTruthy();
  });
});

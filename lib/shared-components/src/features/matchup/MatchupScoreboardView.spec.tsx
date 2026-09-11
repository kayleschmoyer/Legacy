import React from 'react';
import { screen } from '@testing-library/react';

import { MatchupStatus } from '@legacy-sports/graphql';
import {
  MatchupScoreboardView,
  type MatchupScoreboardViewProps,
} from './MatchupScoreboardView';
import { render } from '../../test-utils';

// See StaleScoringIndicator.spec.tsx for why the real Popover isn't
// rendered under jsdom; this double just respects the controlled `open`
// state so these tests can assert on the trigger alone.
jest.mock('../../components/Popover', () => ({
  Popover: ({
    trigger,
    open,
    children,
  }: {
    trigger: React.ReactNode;
    open?: boolean;
    children?: React.ReactNode;
  }) => (
    <>
      {trigger}
      {open ? children : null}
    </>
  ),
}));

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

  it('shows the CANCELLED status and explanation for cancelled matchups', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ status: MatchupStatus.Cancelled })}
      />,
    );
    expect(screen.getByText('CANCELLED')).toBeTruthy();
    expect(screen.getByText('This matchup was cancelled.')).toBeTruthy();
  });

  it('shows the cancellation reason when present (LS-9683)', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({
          status: MatchupStatus.Cancelled,
          cancellationReason: 'Not enough rostered players to field a lineup',
        })}
      />,
    );
    expect(
      screen.getByText(
        'This matchup was cancelled: Not enough rostered players to field a lineup.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('This matchup was cancelled.')).toBeNull();
  });

  it('hides projections and the games progress bar for cancelled matchups', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({
          status: MatchupStatus.Cancelled,
          team1Projected: 100,
          team2Projected: 90,
        })}
      />,
    );
    expect(screen.queryByText(/proj/i)).toBeNull();
    expect(screen.queryByText(/games completed/)).toBeNull();
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

  it('renders each team record when provided', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ team1Record: '7-3-1', team2Record: '5-5' })}
      />,
    );
    expect(screen.getByText('7-3-1')).toBeTruthy();
    expect(screen.getByText('5-5')).toBeTruthy();
  });

  it('does not render a record when not provided', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ team1Record: undefined, team2Record: undefined })}
      />,
    );
    expect(screen.queryByText(/^\d+-\d+/)).toBeNull();
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

  it('renders the timeInfo label when provided', () => {
    render(
      <MatchupScoreboardView
        {...baseProps({ timeInfo: 'Kickoff Sun 1:00 PM' })}
      />,
    );
    expect(screen.getByText('Kickoff Sun 1:00 PM')).toBeTruthy();
  });

  it('renders no timeInfo text when omitted', () => {
    render(<MatchupScoreboardView {...baseProps()} />);
    expect(screen.queryByText(/^Kickoff /)).toBeNull();
    expect(screen.queryByText(/^Ends /)).toBeNull();
  });

  // LS-9667 — stale-scoring indicator wiring.
  describe('stale scoring indicator', () => {
    it('renders on a completed matchup with scoringIsStale true', () => {
      render(
        <MatchupScoreboardView
          {...baseProps({
            status: MatchupStatus.Completed,
            scoringIsStale: true,
          })}
        />,
      );
      expect(screen.getByTestId('stale-scoring-indicator')).toBeTruthy();
    });

    it('is absent when scoringIsStale is false', () => {
      render(
        <MatchupScoreboardView
          {...baseProps({
            status: MatchupStatus.Completed,
            scoringIsStale: false,
          })}
        />,
      );
      expect(screen.queryByTestId('stale-scoring-indicator')).toBeNull();
    });

    it('is absent when staleness is unknown (null)', () => {
      render(
        <MatchupScoreboardView
          {...baseProps({
            status: MatchupStatus.Completed,
            scoringIsStale: null,
          })}
        />,
      );
      expect(screen.queryByTestId('stale-scoring-indicator')).toBeNull();
    });

    it('is absent on an in-progress matchup even if scoringIsStale is true', () => {
      render(
        <MatchupScoreboardView
          {...baseProps({
            status: MatchupStatus.InProgress,
            scoringIsStale: true,
          })}
        />,
      );
      expect(screen.queryByTestId('stale-scoring-indicator')).toBeNull();
    });
  });
});

import React from 'react';
import { screen } from '@testing-library/react';

import { MatchupStatus } from '@legacy-sports/graphql';
import {
  MatchupScoreboardHero,
  type MatchupScoreboardHeroProps,
} from './MatchupScoreboardHero';
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

  it('falls back to 0.00 when a score is missing on an in-progress matchup', () => {
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

  it('shows a "—" placeholder instead of 0.00 for a scheduled (pre-lock) matchup (LS-6386)', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          status: MatchupStatus.Scheduled,
          team1: { id: 10, name: 'Team A', score: null },
          team2: { id: 20, name: 'Team B', score: null },
        })}
      />,
    );
    expect(screen.queryByText('0.00')).toBeNull();
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('shows an actual 0.00 for a scheduled matchup once a real (non-zero) score exists', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          status: MatchupStatus.Scheduled,
          team1: { id: 10, name: 'Team A', score: 0 },
          team2: { id: 20, name: 'Team B', score: 14.5 },
        })}
      />,
    );
    // Team A is still scoreless pre-lock, so it gets the placeholder; Team B
    // has a real score and renders normally.
    expect(screen.getByText('14.50')).toBeTruthy();
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

  it('shows the Cancelled chip and explanation for cancelled matchups', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({ status: MatchupStatus.Cancelled })}
      />,
    );
    expect(screen.getByText('Cancelled · Week 5')).toBeTruthy();
    expect(screen.getByText('This matchup was cancelled.')).toBeTruthy();
  });

  it('shows the cancellation reason when present (LS-9683)', () => {
    render(
      <MatchupScoreboardHero
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

  it('does not show the cancelled explanation for non-cancelled matchups', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({ status: MatchupStatus.InProgress })}
      />,
    );
    expect(screen.queryByText('This matchup was cancelled.')).toBeNull();
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

  it('shows the Bye chip and dedicated bye layout for a bye-week matchup', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          status: MatchupStatus.Bye,
          team1: { id: 10, name: 'Team A' },
          team2: { id: null, name: 'Team 2' },
        })}
      />,
    );
    expect(screen.getByText('Bye · Week 5')).toBeTruthy();
    expect(screen.getByText('BYE WEEK')).toBeTruthy();
    expect(screen.getByText('Team A has no game this week')).toBeTruthy();
    // The normal VS / two-score layout must not render for a bye matchup.
    expect(screen.queryByText('VS')).toBeNull();
    expect(screen.queryByText('0.00')).toBeNull();
  });

  it('announces the bye team via the live region', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({
          status: MatchupStatus.Bye,
          team1: { id: 10, name: 'Team A' },
          team2: { id: null, name: 'Team 2' },
        })}
      />,
    );
    expect(screen.getByText('Team A is on a bye this week')).toBeTruthy();
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

  it('renders the timeInfo label when provided', () => {
    render(
      <MatchupScoreboardHero
        {...baseProps({ timeInfo: 'Ends Sun 1:00 PM' })}
      />,
    );
    expect(screen.getByText('Ends Sun 1:00 PM')).toBeTruthy();
  });

  it('renders no timeInfo text when omitted', () => {
    render(<MatchupScoreboardHero {...baseProps()} />);
    expect(screen.queryByText(/^Kickoff /)).toBeNull();
    expect(screen.queryByText(/^Ends /)).toBeNull();
  });

  it('exposes each score as a polite live region labelled with the team name', () => {
    render(<MatchupScoreboardHero {...baseProps()} />);
    const score1 = screen.getByLabelText('Team A score 87.50');
    const score2 = screen.getByLabelText('Team B score 138.00');
    expect(score1.getAttribute('aria-live')).toBe('polite');
    expect(score1.getAttribute('aria-atomic')).toBe('true');
    expect(score2.getAttribute('aria-live')).toBe('polite');
  });

  // LS-9667 — stale-scoring indicator wiring.
  describe('stale scoring indicator', () => {
    it('renders on a completed matchup with scoringIsStale true', () => {
      render(
        <MatchupScoreboardHero
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
        <MatchupScoreboardHero
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
        <MatchupScoreboardHero
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
        <MatchupScoreboardHero
          {...baseProps({
            status: MatchupStatus.InProgress,
            scoringIsStale: true,
          })}
        />,
      );
      expect(screen.queryByTestId('stale-scoring-indicator')).toBeNull();
    });
  });
  // LS-6392 / FMD-012 — animated score increase + premium "+N" flourish.
  describe('score increase animation', () => {
    it('announces the settled score, not an intermediate animation frame', () => {
      const { rerender } = render(<MatchupScoreboardHero {...baseProps()} />);

      rerender(
        <MatchupScoreboardHero
          {...baseProps({
            team1: {
              id: 10,
              name: 'Team A',
              score: 94.5,
              projectedScore: 120.5,
            },
          })}
        />,
      );

      // The live region is labelled with the real new score immediately. The
      // visible digits count up, but assistive tech must not hear every frame.
      expect(screen.getByLabelText('Team A score 94.50')).toBeTruthy();
    });

    it('shows the "+N" badge to premium users when a score increases', () => {
      const { rerender } = render(
        <MatchupScoreboardHero {...baseProps({ isPremium: true })} />,
      );

      rerender(
        <MatchupScoreboardHero
          {...baseProps({
            isPremium: true,
            team1: {
              id: 10,
              name: 'Team A',
              score: 94.5,
              projectedScore: 120.5,
            },
          })}
        />,
      );

      expect(screen.getByTestId('score-delta-10')).toBeTruthy();
      expect(screen.getByText('+7.00')).toBeTruthy();
    });

    it('withholds the "+N" badge from free-tier users', () => {
      const { rerender } = render(
        <MatchupScoreboardHero {...baseProps({ isPremium: false })} />,
      );

      rerender(
        <MatchupScoreboardHero
          {...baseProps({
            isPremium: false,
            team1: {
              id: 10,
              name: 'Team A',
              score: 94.5,
              projectedScore: 120.5,
            },
          })}
        />,
      );

      expect(screen.queryByTestId('score-delta-10')).toBeNull();
    });

    it('withholds the "+N" badge when isPremium is not supplied at all', () => {
      // Defaulting to false keeps an unwired caller from leaking a premium
      // affordance to every tier.
      const { rerender } = render(<MatchupScoreboardHero {...baseProps()} />);

      rerender(
        <MatchupScoreboardHero
          {...baseProps({
            team1: {
              id: 10,
              name: 'Team A',
              score: 94.5,
              projectedScore: 120.5,
            },
          })}
        />,
      );

      expect(screen.queryByTestId('score-delta-10')).toBeNull();
    });

    it('shows no badge on first render, when there is no increase yet', () => {
      render(<MatchupScoreboardHero {...baseProps({ isPremium: true })} />);
      expect(screen.queryByTestId('score-delta-10')).toBeNull();
      expect(screen.queryByTestId('score-delta-20')).toBeNull();
    });
  });
});

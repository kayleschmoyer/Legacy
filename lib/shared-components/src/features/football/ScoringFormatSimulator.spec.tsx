import React from 'react';
import {
  ScoringFormatSimulator,
  type ScoringFormatSimulatorPlayer,
} from './ScoringFormatSimulator';
import { fireEvent, render, screen } from '../../test-utils';

/**
 * LS-6454 — the simulator expresses every number relative to the league's own
 * reception multiplier, so these specs pin the arithmetic rather than the
 * layout: a delta is exactly `(targetRec - leagueRec) * receptions`.
 */

// PremiumGate's lock glyph reaches for a Tamagui theme this bare render has
// no provider for. Only the icon is stubbed — every other Tamagui primitive
// renders for real so the assertions below exercise the actual markup.
jest.mock('@tamagui/lucide-icons/icons/Lock', () => ({ Lock: () => null }));

/** Two games, six receptions total. */
const receiver: ScoringFormatSimulatorPlayer = {
  playerId: 1,
  playerName: 'Ja Marr Chase',
  position: 'WR',
  totalPoints: 22.5,
  receivingGames: [
    { rec: 4, yds: 61, td: 1 },
    { rec: 2, yds: 18, td: 0 },
  ],
};

/** A player who caught nothing — no format change moves their score. */
const runningBack: ScoringFormatSimulatorPlayer = {
  playerId: 2,
  playerName: 'Derrick Henry',
  position: 'RB',
  totalPoints: 14,
  receivingGames: [{ rec: 0, yds: 0, td: 0 }],
};

function renderSimulator(
  overrides: Partial<React.ComponentProps<typeof ScoringFormatSimulator>> = {},
) {
  const onUpgrade = jest.fn();

  render(
    <ScoringFormatSimulator
      players={[receiver, runningBack]}
      teamTotalPoints={36.5}
      leagueReceptionPoints={1}
      isPremium
      onUpgrade={onUpgrade}
      {...overrides}
    />,
  );

  return { onUpgrade };
}

function expand(): void {
  fireEvent.click(screen.getByTestId('football-scoring-simulator-toggle'));
}

describe('ScoringFormatSimulator', () => {
  it('renders nothing until the league scoring profile resolves', () => {
    renderSimulator({ leagueReceptionPoints: undefined });

    expect(screen.queryByTestId('football-scoring-simulator')).toBeNull();
  });

  it('is collapsed by default and shows only the toggle row', () => {
    renderSimulator();

    expect(screen.getByTestId('football-scoring-simulator')).toBeTruthy();
    expect(
      screen.queryByTestId('football-scoring-simulator-results'),
    ).toBeNull();
  });

  it('marks the league own format as the baseline with a zero delta', () => {
    renderSimulator({ leagueReceptionPoints: 1 });
    expand();

    expect(
      screen.getByTestId('football-scoring-simulator-baseline'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('football-scoring-simulator-delta-ppr'),
    ).toHaveTextContent('—');
  });

  it('scores Standard as one point lost per reception', () => {
    renderSimulator({ leagueReceptionPoints: 1 });
    expand();

    // 6 receptions x (0 - 1) = -6.00, off an authoritative 36.5 team total.
    expect(
      screen.getByTestId('football-scoring-simulator-delta-standard'),
    ).toHaveTextContent('-6.00');
    expect(
      screen.getByTestId('football-scoring-simulator-format-standard'),
    ).toHaveTextContent('30.50');
  });

  it('scores Half-PPR as half that', () => {
    renderSimulator({ leagueReceptionPoints: 1 });
    expand();

    expect(
      screen.getByTestId('football-scoring-simulator-delta-half_ppr'),
    ).toHaveTextContent('-3.00');
  });

  it('gains points when the league is below the simulated format', () => {
    renderSimulator({ leagueReceptionPoints: 0 });
    expand();

    // Standard league: PPR gains a point per reception.
    expect(
      screen.getByTestId('football-scoring-simulator-delta-ppr'),
    ).toHaveTextContent('+6.00');
    expect(
      screen.getByTestId('football-scoring-simulator-baseline'),
    ).toBeTruthy();
  });

  it('labels a custom profile as Custom and still simulates all three presets', () => {
    renderSimulator({ leagueReceptionPoints: 0.75 });
    expand();

    expect(
      screen.getByTestId('football-scoring-simulator-results'),
    ).toHaveTextContent('Custom');
    // No preset matches 0.75, so no row is the baseline.
    expect(
      screen.queryByTestId('football-scoring-simulator-baseline'),
    ).toBeNull();
    expect(
      screen.getByTestId('football-scoring-simulator-delta-standard'),
    ).toHaveTextContent('-4.50');
    expect(
      screen.getByTestId('football-scoring-simulator-delta-ppr'),
    ).toHaveTextContent('+1.50');
  });

  it('shows zero delta for every format when nobody caught a pass', () => {
    renderSimulator({ players: [runningBack], teamTotalPoints: 14 });
    expand();

    for (const format of ['standard', 'half_ppr', 'ppr']) {
      expect(
        screen.getByTestId(`football-scoring-simulator-delta-${format}`),
      ).toHaveTextContent('—');
    }
  });

  it('breaks a format down per player, largest change first', () => {
    const slotReceiver: ScoringFormatSimulatorPlayer = {
      playerId: 3,
      playerName: 'Slot Guy',
      position: 'WR',
      totalPoints: 9,
      receivingGames: [{ rec: 9, yds: 70, td: 0 }],
    };

    renderSimulator({
      players: [receiver, slotReceiver],
      teamTotalPoints: 31.5,
    });
    expand();
    fireEvent.click(
      screen.getByTestId('football-scoring-simulator-format-standard'),
    );

    const breakdown = screen.getByTestId(
      'football-scoring-simulator-players-standard',
    );
    expect(breakdown).toHaveTextContent('Slot Guy (WR)');
    expect(breakdown).toHaveTextContent('Ja Marr Chase (WR)');
    // Derrick Henry moved zero points, so he is filtered out entirely.
    expect(breakdown).not.toHaveTextContent('Derrick Henry');
  });

  it('locks the panel and offers the upgrade action for a free manager', () => {
    const { onUpgrade } = renderSimulator({ isPremium: false });
    expand();

    expect(
      screen.queryByTestId('football-scoring-simulator-results'),
    ).toBeNull();
    expect(screen.getByTestId('premium-feature-gate')).toBeTruthy();

    fireEvent.click(screen.getByText(/upgrade to premium/i));
    expect(onUpgrade).toHaveBeenCalledTimes(1);
  });
});

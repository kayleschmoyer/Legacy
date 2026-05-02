import React from 'react';
import { GameCard } from './GameCard';
import type { ScoreboardGame } from './types';
import { fireEvent, render } from '../../test-utils';

const liveGame: ScoreboardGame = {
  gamePk: 1,
  status: 'Live',
  inning: 7,
  inningHalf: 'Top',
  outs: 1,
  awayTeam: {
    teamName: 'Yankees',
    abbreviation: 'NYY',
    runs: 4,
    hits: 8,
    errors: 0,
    linescoreInnings: [1, 0, 0, 2, 0, 0, 1],
  },
  homeTeam: {
    teamName: 'Red Sox',
    abbreviation: 'BOS',
    runs: 3,
    hits: 7,
    errors: 1,
    linescoreInnings: [0, 1, 0, 0, 0, 2, 0],
  },
};

const finalGame: ScoreboardGame = {
  gamePk: 7,
  status: 'Final',
  awayTeam: {
    teamName: 'Astros',
    abbreviation: 'HOU',
    runs: 7,
    hits: 12,
    errors: 1,
    linescoreInnings: [2, 0, 3, 0, 0, 0, 1, 1, 0],
  },
  homeTeam: {
    teamName: 'Mariners',
    abbreviation: 'SEA',
    runs: 2,
    hits: 5,
    errors: 2,
    linescoreInnings: [0, 0, 1, 0, 1, 0, 0, 0, 0],
  },
};

const upcomingGame: ScoreboardGame = {
  gamePk: 4,
  // The GraphQL API documents this as "Preview" — exercised here so the
  // shared component is verified against the actual API status string.
  status: 'Preview',
  startTime: '2025-04-18T19:05:00.000Z',
  awayTeam: {
    teamName: 'Braves',
    abbreviation: 'ATL',
    runs: 0,
    hits: 0,
    errors: 0,
  },
  homeTeam: {
    teamName: 'Mets',
    abbreviation: 'NYM',
    runs: 0,
    hits: 0,
    errors: 0,
  },
};

describe('GameCard', () => {
  it('renders a live game with inning and outs indicator', () => {
    const { getByText, getByLabelText } = render(<GameCard game={liveGame} />);
    expect(getByText(/▶ Top 7/)).toBeTruthy();
    expect(getByLabelText('1 out')).toBeTruthy();
  });

  it('renders a final game with the "Final" status', () => {
    const { getByText } = render(<GameCard game={finalGame} />);
    expect(getByText('Final')).toBeTruthy();
  });

  it('renders an upcoming game with its raw API status and dash scores', () => {
    const { getByText, getAllByText } = render(
      <GameCard game={upcomingGame} />,
    );
    // Pass-through status: the badge surfaces whatever the API returned
    // ("Preview" here) instead of forcing a generic "Scheduled" label.
    expect(getByText('Preview')).toBeTruthy();
    // Both teams render "–" because they have not played yet.
    expect(getAllByText('–').length).toBe(2);
  });

  it('does not render the linescore by default for live games', () => {
    const { queryByText } = render(<GameCard game={liveGame} />);
    // Header label "R" only appears once Linescore is mounted.
    expect(queryByText('R')).toBeNull();
  });

  it('expands the linescore when the card is pressed', () => {
    const { queryByText, queryAllByText, getByTestId } = render(
      <GameCard game={liveGame} />,
    );
    const card = getByTestId('game-card-1');
    // The collapsed footer already shows "Linescore ▼"; once expanded the
    // toggle hint flips to "Hide ▲". The R/H/E header letters from the
    // Linescore appear as additional matches alongside the footer's
    // existing H/E labels — so we use queryAllByText for those.
    expect(queryByText('Linescore ▼')).toBeTruthy();
    fireEvent.click(card);
    expect(queryByText('Hide ▲')).toBeTruthy();
    expect(queryAllByText('R').length).toBeGreaterThanOrEqual(1);
    expect(queryAllByText('H').length).toBeGreaterThanOrEqual(2);
    expect(queryAllByText('E').length).toBeGreaterThanOrEqual(2);
  });

  it('marks the winning team for final games via a "WIN" label', () => {
    const { getByText } = render(<GameCard game={finalGame} />);
    expect(getByText(/WIN/)).toBeTruthy();
  });
});

import React from 'react';

import { GamesRemaining } from './GamesRemaining';
import { render } from '../../test-utils';

describe('GamesRemaining', () => {
  it('renders progress text with correct counts', () => {
    const { getByText } = render(
      <GamesRemaining gamesRemaining={4} totalGames={7} />,
    );
    expect(getByText('3 completed')).toBeTruthy();
    expect(getByText('7 total')).toBeTruthy();
  });

  it('shows "Complete" when all games are done', () => {
    const { getByText } = render(
      <GamesRemaining gamesRemaining={0} totalGames={7} />,
    );
    expect(getByText('Complete')).toBeTruthy();
    expect(getByText('7 completed')).toBeTruthy();
  });

  it('shows remaining count when in progress', () => {
    const { getByText } = render(
      <GamesRemaining gamesRemaining={3} totalGames={7} />,
    );
    expect(getByText('3 left')).toBeTruthy();
  });

  it('renders minimal UI in compact mode', () => {
    const { getByText, queryByText } = render(
      <GamesRemaining gamesRemaining={3} totalGames={7} compact />,
    );
    expect(getByText('3 games left')).toBeTruthy();
    // Full mode elements should not be present
    expect(queryByText('Games Progress')).toBeNull();
    expect(queryByText('3 completed')).toBeNull();
  });

  it('shows "Complete" in compact mode when all games are done', () => {
    const { getByText } = render(
      <GamesRemaining gamesRemaining={0} totalGames={7} compact />,
    );
    expect(getByText('Complete')).toBeTruthy();
  });
});

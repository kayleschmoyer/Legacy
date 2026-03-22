import React from 'react';

import type { PlayerProjection } from './PlayerProjections';
import { PlayerProjections } from './PlayerProjections';
import { render } from '../../test-utils';

const mockProjections: PlayerProjection[] = [
  {
    playerId: 1,
    playerName: 'Mike Trout',
    matchupProjection: 12.5,
    careerProjection: 10.2,
    selectedGamesCount: 4,
  },
  {
    playerId: 2,
    playerName: 'Mookie Betts',
    matchupProjection: 11.8,
    careerProjection: 9.7,
    selectedGamesCount: 3,
  },
];

describe('PlayerProjections', () => {
  it('renders player names and projections', () => {
    const { getByText } = render(
      <PlayerProjections projections={mockProjections} gamesRemaining={3} />,
    );
    expect(getByText('Mike Trout')).toBeTruthy();
    expect(getByText('Mookie Betts')).toBeTruthy();
    expect(getByText('12.50')).toBeTruthy();
    expect(getByText('10.20')).toBeTruthy();
    expect(getByText('11.80')).toBeTruthy();
    expect(getByText('9.70')).toBeTruthy();
  });

  it('shows loading state', () => {
    const { getByText } = render(
      <PlayerProjections projections={[]} gamesRemaining={0} loading />,
    );
    expect(getByText('Loading projections...')).toBeTruthy();
  });

  it('shows error state', () => {
    const { getByText } = render(
      <PlayerProjections
        projections={[]}
        gamesRemaining={0}
        error={new globalThis.Error('Failed to load')}
      />,
    );
    expect(getByText('Error: Failed to load')).toBeTruthy();
  });

  it('shows empty state', () => {
    const { getByText } = render(
      <PlayerProjections projections={[]} gamesRemaining={0} />,
    );
    expect(getByText('No player projections available')).toBeTruthy();
  });

  it('shows "games left" badge when gamesRemaining > 0', () => {
    const { getByText } = render(
      <PlayerProjections projections={mockProjections} gamesRemaining={3} />,
    );
    expect(getByText('3 games left')).toBeTruthy();
  });

  it('does not show "games left" badge when gamesRemaining is 0', () => {
    const { queryByText } = render(
      <PlayerProjections projections={mockProjections} gamesRemaining={0} />,
    );
    expect(queryByText(/games left/)).toBeNull();
  });
});

import React from 'react';
import { StatsOverlay } from './StatsOverlay';
import type { Player } from './PlayerCard';
import { fireEvent, render } from '../../test-utils';

const mockPlayer: Player = {
  id: '1',
  name: 'Mike Trout',
  position: 'CF',
  team: 'LAA',
  adp: 1,
  rank: 1,
  ownership: 95,
  trending: 'up',
  injury: 'healthy',
  stats: { AVG: 0.283, HR: 40 },
  faabValue: 50,
  isWatched: false,
};

describe('StatsOverlay', () => {
  it('shows the player name in the title', () => {
    const { getByText } = render(
      <StatsOverlay onClose={jest.fn()} player={mockPlayer} />,
    );

    expect(getByText('Mike Trout Stats')).toBeTruthy();
  });

  it('calls onClose when X button is pressed', () => {
    const onCloseMock = jest.fn();
    const { getByText } = render(
      <StatsOverlay onClose={onCloseMock} player={mockPlayer} />,
    );

    fireEvent.click(getByText('X'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('handles null player gracefully', () => {
    const { getByText } = render(
      <StatsOverlay onClose={jest.fn()} player={null} />,
    );

    expect(getByText('Stats')).toBeTruthy();
  });
});

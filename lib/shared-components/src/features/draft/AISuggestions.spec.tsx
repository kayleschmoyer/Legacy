import React from 'react';
import { AISuggestions } from './AISuggestions';
import type { Player } from './PlayerCard';
import { fireEvent, render } from '../../test-utils';

const mockPlayers: Player[] = [
  {
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
  },
  {
    id: '2',
    name: 'Shohei Ohtani',
    position: 'DH',
    team: 'LAD',
    adp: 2,
    rank: 2,
    ownership: 99,
    trending: 'up',
    injury: 'healthy',
    stats: { AVG: 0.304, HR: 54 },
    faabValue: 100,
    isWatched: true,
  },
  {
    id: '3',
    name: 'Mookie Betts',
    position: 'RF',
    team: 'LAD',
    adp: 3,
    rank: 3,
    ownership: 90,
    trending: 'stable',
    injury: 'healthy',
    stats: { AVG: 0.307, HR: 39 },
    faabValue: 45,
    isWatched: false,
  },
];

describe('AISuggestions', () => {
  it('renders the title', () => {
    const { getByText } = render(
      <AISuggestions suggestions={mockPlayers} onPick={jest.fn()} />,
    );

    expect(getByText('AI Suggestions')).toBeTruthy();
  });

  it('shows player names', () => {
    const { getByText } = render(
      <AISuggestions suggestions={mockPlayers} onPick={jest.fn()} />,
    );

    expect(getByText('Mike Trout - CF')).toBeTruthy();
    expect(getByText('Shohei Ohtani - DH')).toBeTruthy();
    expect(getByText('Mookie Betts - RF')).toBeTruthy();
  });

  it('calls onPick when Pick button is pressed', () => {
    const onPickMock = jest.fn();
    const { getAllByText } = render(
      <AISuggestions suggestions={mockPlayers} onPick={onPickMock} />,
    );

    const pickButtons = getAllByText('Pick');
    fireEvent.click(pickButtons[0]);
    expect(onPickMock).toHaveBeenCalledWith('1');
  });
});

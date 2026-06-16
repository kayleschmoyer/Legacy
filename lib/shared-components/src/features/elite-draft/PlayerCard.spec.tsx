/**
 * LS-8068: a player card is draggable only on the user's pick, and starting a
 * drag reports the player so the rail can resolve the drop.
 */
import React from 'react';
import { PlayerCard } from './PlayerCard';
import type { DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

const player: DraftPlayer = {
  id: 9,
  name: 'Tester',
  position: 'SS',
  eligiblePositions: ['SS'],
  avg: 0.3,
  hr: 10,
  rbi: 50,
  runs: 60,
  sb: 5,
  games: 100,
  hits: 120,
  obp: 0.36,
  slg: 0.45,
};

const baseProps = {
  player,
  index: 0,
  isWatched: false,
  onDraft: jest.fn(),
  onToggleWatch: jest.fn(),
};

describe('PlayerCard drag-to-draft source', () => {
  it('is draggable and reports the player on drag start when it is my pick', () => {
    const onDragStartPlayer = jest.fn();
    const { container } = render(
      <PlayerCard
        {...baseProps}
        isMyPick
        onDragStartPlayer={onDragStartPlayer}
        onDragEndPlayer={jest.fn()}
      />,
    );
    const card = container.querySelector('.d-card') as HTMLElement;
    expect(card.getAttribute('draggable')).toBe('true');

    fireEvent.dragStart(card, {
      dataTransfer: { setData: jest.fn(), effectAllowed: '' },
    });
    expect(onDragStartPlayer).toHaveBeenCalledWith(player);
  });

  it('is not draggable when it is not my pick', () => {
    const { container } = render(
      <PlayerCard
        {...baseProps}
        isMyPick={false}
        onDragStartPlayer={jest.fn()}
      />,
    );
    const card = container.querySelector('.d-card') as HTMLElement;
    expect(card.getAttribute('draggable')).toBe('false');
  });
});

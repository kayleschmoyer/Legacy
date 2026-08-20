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

/**
 * LS-9473: the card is the draft room's default view and was hardcoded to
 * baseball with no `sport` prop, so a football player rendered
 * `AVG .000 / HR 0 / RBI 0 / SB 0` — fabricated zeros reading as real
 * measurements. These cover both halves: football never shows a baseball
 * label, and an unmeasured stat renders as an em-dash rather than 0.
 */
describe('PlayerCard sport-aware stat block (LS-9473)', () => {
  // A football player as the board actually builds one: usePlayerData fills
  // the baseball fields with `?? 0`, and no football stat fields exist yet.
  const footballPlayer: DraftPlayer = {
    id: 21,
    name: 'Gridiron Tester',
    position: 'QB',
    eligiblePositions: ['QB'],
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
    ppg: 0,
  };

  it('renders football stat labels and never baseball ones', () => {
    const { getByText, queryByText } = render(
      <PlayerCard {...baseProps} player={footballPlayer} sport="football" />,
    );

    for (const label of ['PASS YDS', 'RUSH YDS', 'REC', 'TD', 'FG']) {
      expect(getByText(label)).toBeTruthy();
    }
    for (const label of ['AVG', 'HR', 'RBI', 'SB', 'OBP', 'SLG']) {
      expect(queryByText(label)).toBeNull();
    }
  });

  it('shows an em-dash for unserved football stats, never a zero', () => {
    const { container } = render(
      <PlayerCard {...baseProps} player={footballPlayer} sport="football" />,
    );

    const values = Array.from(container.querySelectorAll('.d-stat-val')).map(
      (el) => el.textContent,
    );
    expect(values).toHaveLength(5);
    expect(values.every((v) => v === '—')).toBe(true);
  });

  it('withholds the baseball-derived Career Pts/Matchup bar for football', () => {
    const { queryByText } = render(
      <PlayerCard {...baseProps} player={footballPlayer} sport="football" />,
    );
    expect(queryByText('Career Pts/Matchup')).toBeNull();
  });

  it('leaves the baseball card unchanged and defaults to baseball', () => {
    const { getByText } = render(<PlayerCard {...baseProps} />);
    expect(getByText('AVG')).toBeTruthy();
    expect(getByText('HR')).toBeTruthy();
    expect(getByText('0.300')).toBeTruthy();
  });
});

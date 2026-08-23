import React from 'react';
import { act } from '@testing-library/react';
import { DraftPickToast } from './DraftPickToast';
import type { PickToastQueueItem } from './hooks/useDraftUIState';
import type { DraftPlayer } from './types';
import { render } from '../../test-utils';

function makePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Patrick Mahomes',
    position: 'QB',
    avg: 0,
    hr: 0,
    rbi: 0,
    runs: 0,
    sb: 0,
    games: 0,
    hits: 0,
    obp: 0,
    slg: 0,
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<PickToastQueueItem> = {},
): PickToastQueueItem {
  return {
    id: '7',
    player: makePlayer(),
    pickNumber: 7,
    round: 1,
    roundPickNumber: 7,
    teamName: 'Dinger Dynasty',
    isAuto: false,
    ...overrides,
  };
}

describe('DraftPickToast', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when the queue is empty', () => {
    const { queryByTestId } = render(
      <DraftPickToast queue={[]} onDismiss={jest.fn()} sport="football" />,
    );

    expect(queryByTestId('draft-pick-toast')).toBeNull();
  });

  it('renders "PICK r.p · TEAM" and the overall pick numeral for a regular pick', () => {
    const { getByText } = render(
      <DraftPickToast
        queue={[makeItem()]}
        onDismiss={jest.fn()}
        sport="football"
      />,
    );

    expect(getByText('PICK 1.7 · Dinger Dynasty')).toBeTruthy();
    expect(getByText('Patrick Mahomes')).toBeTruthy();
    expect(getByText('#7')).toBeTruthy();
  });

  it('renders a pick-quality badge when the player has ADP data (LS-9465)', () => {
    const { getByText } = render(
      <DraftPickToast
        queue={[makeItem({ player: makePlayer({ adp: 20 }), pickNumber: 7 })]}
        onDismiss={jest.fn()}
        sport="football"
      />,
    );

    expect(getByText('Good Value')).toBeTruthy();
  });

  it('renders no pick-quality badge when the player has no ADP', () => {
    const { queryByText } = render(
      <DraftPickToast
        queue={[makeItem()]}
        onDismiss={jest.fn()}
        sport="football"
      />,
    );

    expect(queryByText('Good Value')).toBeNull();
    expect(queryByText('Great Pick!')).toBeNull();
    expect(queryByText('Reach')).toBeNull();
  });

  it('renders "AUTO PICK ·" for an auto-pick', () => {
    const { getByText } = render(
      <DraftPickToast
        queue={[makeItem({ isAuto: true })]}
        onDismiss={jest.fn()}
        sport="football"
      />,
    );

    expect(getByText('AUTO PICK ·')).toBeTruthy();
  });

  it('auto-dismisses after ~1.9s', () => {
    const onDismiss = jest.fn();
    render(
      <DraftPickToast
        queue={[makeItem()]}
        onDismiss={onDismiss}
        sport="football"
      />,
    );

    act(() => {
      jest.advanceTimersByTime(1899);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

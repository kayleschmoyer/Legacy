import React from 'react';
import { act } from '@testing-library/react';
import { DraftMyPickSplash } from './DraftMyPickSplash';
import type { PickSplashQueueItem } from './hooks/useDraftUIState';
import type { DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

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
    ppg: 24.5,
    ...overrides,
  };
}

function makeItem(
  overrides: Partial<PickSplashQueueItem> = {},
): PickSplashQueueItem {
  return {
    id: '3',
    player: makePlayer(),
    pickNumber: 3,
    round: 1,
    roundPickNumber: 3,
    ...overrides,
  };
}

describe('DraftMyPickSplash', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when the queue is empty', () => {
    const { queryByTestId } = render(
      <DraftMyPickSplash
        queue={[]}
        onDismiss={jest.fn()}
        sport="football"
        celebrate
      />,
    );

    expect(queryByTestId('draft-my-pick-splash')).toBeNull();
  });

  it('renders the eyebrow, name, and PROJ meta line for the front of the queue', () => {
    const { getByText } = render(
      <DraftMyPickSplash
        queue={[makeItem()]}
        onDismiss={jest.fn()}
        sport="football"
        celebrate
      />,
    );

    expect(getByText('WITH PICK #3, YOU SELECT')).toBeTruthy();
    expect(getByText('Patrick Mahomes')).toBeTruthy();
    expect(getByText('QB · PROJ 24.5')).toBeTruthy();
  });

  it('renders confetti when celebrate is true', () => {
    const { getByTestId } = render(
      <DraftMyPickSplash
        queue={[makeItem()]}
        onDismiss={jest.fn()}
        sport="football"
        celebrate
      />,
    );

    expect(getByTestId('draft-pick-splash-confetti')).toBeTruthy();
  });

  it('fully suppresses confetti when celebrate is false', () => {
    const { queryByTestId } = render(
      <DraftMyPickSplash
        queue={[makeItem()]}
        onDismiss={jest.fn()}
        sport="football"
        celebrate={false}
      />,
    );

    expect(queryByTestId('draft-pick-splash-confetti')).toBeNull();
  });

  it('dismisses on tap', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <DraftMyPickSplash
        queue={[makeItem()]}
        onDismiss={onDismiss}
        sport="football"
        celebrate
      />,
    );

    fireEvent.click(getByTestId('draft-my-pick-splash'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after ~2.8s', () => {
    const onDismiss = jest.fn();
    render(
      <DraftMyPickSplash
        queue={[makeItem()]}
        onDismiss={onDismiss}
        sport="football"
        celebrate
      />,
    );

    act(() => {
      jest.advanceTimersByTime(2799);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

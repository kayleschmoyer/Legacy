import React from 'react';
import { act } from '@testing-library/react';
import {
  DraftMyPickAnnouncement,
  MY_PICK_ANNOUNCEMENT_DISMISS_MS,
} from './DraftMyPickAnnouncement';
import type { PickSplashQueueItem } from './hooks/useDraftUIState';
import type { DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

function makePlayer(overrides: Partial<DraftPlayer> = {}): DraftPlayer {
  return {
    id: 1,
    name: 'Randy Moss',
    position: 'WR',
    club: 'MIN',
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
  overrides: Partial<PickSplashQueueItem> = {},
): PickSplashQueueItem {
  return {
    id: '42',
    player: makePlayer(),
    pickNumber: 42,
    round: 4,
    roundPickNumber: 6,
    ...overrides,
  };
}

describe('DraftMyPickAnnouncement', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing when the queue is empty', () => {
    const { queryByTestId } = render(
      <DraftMyPickAnnouncement
        queue={[]}
        onDismiss={jest.fn()}
        teamName="Sunday Captains"
      />,
    );

    expect(queryByTestId('draft-my-pick-announcement')).toBeNull();
  });

  it('renders the design card content for the front of the queue', () => {
    const { getByText, getByTestId } = render(
      <DraftMyPickAnnouncement
        queue={[makeItem()]}
        onDismiss={jest.fn()}
        teamName="Sunday Captains"
      />,
    );

    expect(getByText('RM')).toBeTruthy();
    expect(getByText('Pick #42 · Round 4')).toBeTruthy();
    expect(getByText('Randy Moss')).toBeTruthy();
    expect(getByText('WR · MIN — to Sunday Captains')).toBeTruthy();
    expect(getByTestId('draft-my-pick-announcement-quip').textContent).toBe(
      'Smart mid-round selection — Randy Moss brings solid value at this spot.',
    );
  });

  it('dismisses on tap', () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <DraftMyPickAnnouncement
        queue={[makeItem()]}
        onDismiss={onDismiss}
        teamName="Sunday Captains"
      />,
    );

    fireEvent.click(getByTestId('draft-my-pick-announcement'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after 5s', () => {
    const onDismiss = jest.fn();
    render(
      <DraftMyPickAnnouncement
        queue={[makeItem()]}
        onDismiss={onDismiss}
        teamName="Sunday Captains"
      />,
    );

    expect(MY_PICK_ANNOUNCEMENT_DISMISS_MS).toBe(5000);
    act(() => {
      jest.advanceTimersByTime(4999);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('does not auto-dismiss after being unmounted by a tap', () => {
    const onDismiss = jest.fn();
    const { getByTestId, unmount } = render(
      <DraftMyPickAnnouncement
        queue={[makeItem()]}
        onDismiss={onDismiss}
        teamName="Sunday Captains"
      />,
    );

    fireEvent.click(getByTestId('draft-my-pick-announcement'));
    unmount();
    act(() => {
      jest.advanceTimersByTime(MY_PICK_ANNOUNCEMENT_DISMISS_MS);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

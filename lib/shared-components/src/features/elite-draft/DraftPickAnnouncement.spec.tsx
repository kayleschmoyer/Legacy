/**
 * Web capability-shim regression gate for LS-9206: DraftPickAnnouncement must
 * render the announcement card on web (no react-native Animated dependency).
 * Confetti is intentionally omitted on web — see the top-of-file comment.
 */
import React from 'react';
import { DraftPickAnnouncement } from './DraftPickAnnouncement';
import type { DraftPlayer, NotablePlaySummary } from './types';
import { fireEvent, render } from '../../test-utils';

const player: DraftPlayer = {
  id: 1,
  name: 'Infielder One',
  position: '1B',
  avg: 0.301,
  hr: 20,
  rbi: 80,
} as DraftPlayer;

describe('DraftPickAnnouncement (web)', () => {
  it('renders nothing when there is no announcement', () => {
    const { container } = render(
      <DraftPickAnnouncement
        announcement={null}
        celebrate={false}
        onDismiss={jest.fn()}
      />,
    );
    expect(container.textContent).toBe('');
  });

  it('renders the pick card with the eyebrow and player name', () => {
    const { getByText } = render(
      <DraftPickAnnouncement
        announcement={{
          player,
          pickNumber: 5,
          round: 1,
          roundPickNumber: 5,
          isMyPick: true,
          isAuto: false,
          teamName: 'Team One',
        }}
        celebrate={true}
        onDismiss={jest.fn()}
      />,
    );
    expect(getByText('WITH PICK #5, YOU SELECT')).toBeTruthy();
    expect(getByText('Infielder One')).toBeTruthy();
  });

  it('renders a pick-quality badge when the player has ADP data (LS-9465)', () => {
    const { getByText } = render(
      <DraftPickAnnouncement
        announcement={{
          player: { ...player, adp: 30 },
          pickNumber: 5,
          round: 1,
          roundPickNumber: 5,
          isMyPick: true,
          isAuto: false,
          teamName: 'Team One',
        }}
        celebrate={false}
        onDismiss={jest.fn()}
      />,
    );
    expect(getByText('Great Pick!')).toBeTruthy();
  });

  it('renders no pick-quality badge when the player has no ADP', () => {
    const { queryByText } = render(
      <DraftPickAnnouncement
        announcement={{
          player,
          pickNumber: 5,
          round: 1,
          roundPickNumber: 5,
          isMyPick: true,
          isAuto: false,
          teamName: 'Team One',
        }}
        celebrate={false}
        onDismiss={jest.fn()}
      />,
    );
    expect(queryByText('Great Pick!')).toBeNull();
    expect(queryByText('Good Value')).toBeNull();
    expect(queryByText('Reach')).toBeNull();
  });

  it('calls onDismiss when tapped', () => {
    const onDismiss = jest.fn();
    const { getByRole } = render(
      <DraftPickAnnouncement
        announcement={{
          player,
          pickNumber: 5,
          round: 1,
          roundPickNumber: 5,
          isMyPick: false,
          isAuto: false,
          teamName: 'Team One',
        }}
        celebrate={false}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(getByRole('button', { name: /Tap to dismiss/ }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('renders the notable-play stat graphic when notablePlay is provided (LS-9112)', () => {
    const notablePlay: NotablePlaySummary = {
      mlbPlayerId: 1,
      playerRole: 'batter',
      gameDate: '2026-08-01',
      eventType: 'home_run',
      description: 'Deep drive to left field, home run.',
      exitVelocity: 104.3,
      launchAngle: 27,
      hitDistance: 412,
      pitchSpeed: null,
      pitchType: null,
      filmRoomUrl: null,
    };
    const { getByText } = render(
      <DraftPickAnnouncement
        announcement={{
          player,
          pickNumber: 5,
          round: 1,
          roundPickNumber: 5,
          isMyPick: true,
          isAuto: false,
          teamName: 'Team One',
        }}
        celebrate={false}
        onDismiss={jest.fn()}
        notablePlay={notablePlay}
      />,
    );
    expect(getByText('HOME RUN')).toBeTruthy();
  });
});

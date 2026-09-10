/**
 * DraftPickAnnouncement (native, LS-9263) — full-bleed pick reveal card, plus
 * the confetti burst reserved for the viewer's own picks.
 *
 * Under test: empty state, eyebrow + player name, pick-quality badge,
 * dismiss-on-tap, and the notable-play stat graphic — asserted via RN
 * accessibilityRole/accessibilityLabel (mapped to data-accessibility-*
 * attributes by the mock below), not DOM role/aria-label (see
 * DraftPickAnnouncement.spec.tsx for the web/DOM-role counterpart, which
 * this jest project's moduleFileExtensions no longer resolves to this
 * component).
 *
 * Ships its own minimal `react-native` mock (mirroring
 * PickSplashStatGraphic.native.spec.tsx) — this component composes
 * PickSplashStatGraphic.native, which also pulls from 'react-native', so the
 * mock covers both. Confetti is presentation-only (randomized geometry) and
 * not asserted beyond "it doesn't crash and stays out of the way when not
 * celebrating".
 */
import React from 'react';
import { DraftPickAnnouncement } from './DraftPickAnnouncement.native';
import type { DraftPlayer, NotablePlaySummary } from './types';
import { fireEvent, render } from '../../test-utils';

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(() => undefined),
    })),
    View: ({ children }: { children?: React.ReactNode }) => (
      <div>{children}</div>
    ),
    timing: jest.fn(() => ({ start: jest.fn(), stop: jest.fn() })),
  },
  Easing: {
    in: jest.fn((easing: unknown) => easing),
    out: jest.fn((easing: unknown) => easing),
    inOut: jest.fn((easing: unknown) => easing),
    quad: jest.fn(),
    cubic: jest.fn(),
  },
  Linking: {
    openURL: jest.fn(() => Promise.resolve()),
  },
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityRole,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    accessibilityRole?: string;
  }) => (
    <button
      onClick={onPress}
      data-accessibility-label={accessibilityLabel}
      data-accessibility-role={accessibilityRole}
    >
      {children}
    </button>
  ),
}));

const player: DraftPlayer = {
  id: 1,
  name: 'Infielder One',
  position: '1B',
  avg: 0.301,
  hr: 20,
  rbi: 80,
} as DraftPlayer;

describe('DraftPickAnnouncement (native)', () => {
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
    const { container } = render(
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
    const overlay = container.querySelector(
      '[data-accessibility-label="PICK #5 · Team One. Infielder One. Tap to dismiss."]',
    );
    expect(overlay).toBeTruthy();
    fireEvent.click(overlay as Element);
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

  it('renders the confetti burst for a celebrated own pick', () => {
    const { container } = render(
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
    expect(container.textContent).toContain('Infielder One');
  });
});

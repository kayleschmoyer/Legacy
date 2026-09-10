/**
 * DraftClockRing (native, LS-9263) — the circular pick countdown ring.
 *
 * Under test: countdown label, react-native-svg progress ring, pause/untimed
 * states, and the accessibility timer role/label (asserted via RN
 * accessibilityRole/accessibilityLabel, not DOM role/aria-label — see
 * DraftClockRing.spec.tsx for the web/DOM-role counterpart, which this jest
 * project's moduleFileExtensions no longer resolves to this component).
 *
 * Ships its own minimal `react-native` mock (mirroring
 * PickSplashStatGraphic.native.spec.tsx) so Animated.View surfaces
 * accessibilityRole/accessibilityLabel as queryable data attributes instead
 * of raw (and React-dev-warning-producing) DOM props.
 */
import React from 'react';
import { DraftClockRing } from './DraftClockRing.native';
import { render } from '../../test-utils';

jest.mock('react-native', () => ({
  Animated: {
    Value: jest.fn(() => ({
      setValue: jest.fn(),
      interpolate: jest.fn(() => undefined),
    })),
    View: ({
      children,
      accessibilityRole,
      accessibilityLabel,
    }: {
      children?: React.ReactNode;
      accessibilityRole?: string;
      accessibilityLabel?: string;
    }) => (
      <div
        data-accessibility-role={accessibilityRole}
        data-accessibility-label={accessibilityLabel}
      >
        {children}
      </div>
    ),
  },
  Easing: {
    inOut: jest.fn((easing: unknown) => easing),
    quad: jest.fn(),
  },
}));

describe('DraftClockRing (native)', () => {
  it('renders the countdown label with an accessible timer role', () => {
    const { container, getByText } = render(
      <DraftClockRing secondsRemaining={75} totalSeconds={120} />,
    );
    expect(getByText('1:15')).toBeTruthy();
    const timer = container.querySelector('[data-accessibility-role="timer"]');
    expect(timer).toBeTruthy();
    expect(timer?.getAttribute('data-accessibility-label')).toBe(
      '1:15 left on the clock',
    );
  });

  it('shows PAUSE instead of a countdown when the draft is paused', () => {
    const { container, getByText } = render(
      <DraftClockRing secondsRemaining={30} totalSeconds={120} paused />,
    );
    expect(getByText('PAUSE')).toBeTruthy();
    expect(
      container
        .querySelector('[data-accessibility-role="timer"]')
        ?.getAttribute('data-accessibility-label'),
    ).toBe('Draft paused');
  });

  it('renders the react-native-svg progress ring, not a DOM-only svg', () => {
    const { container } = render(
      <DraftClockRing secondsRemaining={60} totalSeconds={120} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(container.querySelectorAll('circle').length).toBe(2);
  });

  it('clamps to 0:00 when the clock has run out', () => {
    const { getByText } = render(
      <DraftClockRing secondsRemaining={0} totalSeconds={120} />,
    );
    expect(getByText('0:00')).toBeTruthy();
  });

  it('shows the untimed infinity state for offline mock drafts (LS-9144)', () => {
    const { container, getByText } = render(
      <DraftClockRing secondsRemaining={30} totalSeconds={120} untimed />,
    );
    expect(getByText('∞')).toBeTruthy();
    expect(
      container
        .querySelector('[data-accessibility-role="timer"]')
        ?.getAttribute('data-accessibility-label'),
    ).toBe('No pick time limit');
  });
});

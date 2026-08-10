/**
 * Web capability-shim regression gate for LS-9206: DraftClockRing must render
 * on web (no react-native-svg / Animated dependency) with the same countdown
 * behavior as the native version.
 */
import React from 'react';
import { DraftClockRing } from './DraftClockRing';
import { render } from '../../test-utils';

describe('DraftClockRing (web)', () => {
  it('renders the countdown label and an accessible timer role', () => {
    const { getByRole, getByText } = render(
      <DraftClockRing secondsRemaining={75} totalSeconds={120} />,
    );
    expect(getByRole('timer')).toBeTruthy();
    expect(getByText('1:15')).toBeTruthy();
  });

  it('shows PAUSE instead of a countdown when the draft is paused', () => {
    const { getByText } = render(
      <DraftClockRing secondsRemaining={30} totalSeconds={120} paused />,
    );
    expect(getByText('PAUSE')).toBeTruthy();
  });

  it('renders a DOM svg progress ring (not react-native-svg)', () => {
    const { container } = render(
      <DraftClockRing secondsRemaining={60} totalSeconds={120} />,
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.querySelectorAll('circle').length).toBe(2);
  });

  it('clamps to 0:00 when the clock has run out', () => {
    const { getByText } = render(
      <DraftClockRing secondsRemaining={0} totalSeconds={120} />,
    );
    expect(getByText('0:00')).toBeTruthy();
  });

  it('shows the untimed infinity state for offline mock drafts (LS-9144)', () => {
    const { getByText, getByLabelText } = render(
      <DraftClockRing secondsRemaining={30} totalSeconds={120} untimed />,
    );
    expect(getByText('∞')).toBeTruthy();
    expect(getByLabelText('No pick time limit')).toBeTruthy();
  });
});

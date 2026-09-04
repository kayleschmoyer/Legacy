/**
 * DraftConnectionBanner — LS-9856.
 *
 * The banner is the "board is up but stale" tier. It must announce itself
 * assertively (a timed draft is exactly when a polite live region gets
 * missed) and its Retry must reach the caller.
 */
import React from 'react';
import { DraftConnectionBanner } from './DraftConnectionBanner';
import { fireEvent, render, screen } from '../../test-utils';

describe('DraftConnectionBanner', () => {
  it('announces the stale state as an alert', () => {
    render(<DraftConnectionBanner onRetry={jest.fn()} />);

    const banner = screen.getByTestId('draft-connection-banner');
    expect(banner).toBeTruthy();
    expect(banner.getAttribute('role')).toBe('alert');
    expect(screen.getByText('Reconnecting')).toBeTruthy();
    expect(
      screen.getByText('Picks and the clock may be out of date.'),
    ).toBeTruthy();
  });

  it('invokes onRetry when the retry action is pressed', () => {
    const onRetry = jest.fn();
    render(<DraftConnectionBanner onRetry={onRetry} />);

    fireEvent.click(screen.getByTestId('draft-connection-banner-retry'));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

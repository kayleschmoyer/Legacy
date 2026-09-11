import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';

import { StaleScoringIndicator } from './StaleScoringIndicator';
import { render } from '../../test-utils';

// The real Tamagui Popover requires a full native/web render environment
// that isn't available under jsdom (no other component in this package unit
// tests it directly either). Stand in a minimal double that respects the
// component's own controlled `open` state, so these tests exercise
// StaleScoringIndicator's own logic (when it renders, what the trigger
// reveals) rather than Tamagui's popover machinery.
jest.mock('../../components/Popover', () => ({
  Popover: ({
    trigger,
    open,
    children,
  }: {
    trigger: React.ReactNode;
    open?: boolean;
    children?: React.ReactNode;
  }) => (
    <>
      {trigger}
      {open ? children : null}
    </>
  ),
}));

/**
 * LS-9667 AC5 — coverage for the three staleness states the indicator must
 * distinguish: fresh (false), stale (true), and unknown (null).
 */
describe('StaleScoringIndicator', () => {
  it('renders nothing when scoringIsStale is false (fresh)', () => {
    const { container } = render(
      <StaleScoringIndicator scoringIsStale={false} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when scoringIsStale is null (unknown — never a false positive)', () => {
    const { container } = render(
      <StaleScoringIndicator scoringIsStale={null} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when scoringIsStale is undefined', () => {
    const { container } = render(
      <StaleScoringIndicator scoringIsStale={undefined} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the indicator when scoringIsStale is true (stale)', () => {
    render(<StaleScoringIndicator scoringIsStale />);
    expect(screen.getByTestId('stale-scoring-indicator')).toBeTruthy();
  });

  it('has an accessible label explaining the badge', () => {
    render(<StaleScoringIndicator scoringIsStale />);
    expect(
      screen.getByLabelText(
        'Scoring settings changed since this matchup was scored',
      ),
    ).toBeTruthy();
  });

  it('reveals the change log on interaction', async () => {
    render(
      <StaleScoringIndicator
        scoringIsStale
        changeLog={[
          {
            statDisplayName: 'Home Run',
            previousMultiplier: 2.5,
            newMultiplier: 4,
            changedAt: '2026-08-02T00:00:00.000Z',
            changedByUsername: 'commish_alice',
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('stale-scoring-indicator'));

    await waitFor(() => {
      expect(screen.getByText('Scoring settings changed')).toBeTruthy();
    });
    expect(screen.getByText('Home Run')).toBeTruthy();
    expect(screen.getByText(/commish_alice/)).toBeTruthy();
    expect(screen.getByText('2.50 → 4.00')).toBeTruthy();
  });

  it('explains staleness without a change list when the log is empty', async () => {
    render(<StaleScoringIndicator scoringIsStale changeLog={[]} />);

    fireEvent.click(screen.getByTestId('stale-scoring-indicator'));

    await waitFor(() => {
      expect(screen.getByText('Scoring settings changed')).toBeTruthy();
    });
  });
});

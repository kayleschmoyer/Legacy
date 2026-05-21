/**
 * LS-4647: LoadingScreen must mirror the populated DraftTopBand + main +
 * DraftRail layout shapes so the loading → populated reveal is a content
 * swap, not a reflow. Pins the high-level skeleton structure (topband, main
 * pane with card grid, right rail with panel placeholders) so silent removal
 * of any of those regions fails fast in CI.
 */
import React from 'react';
import { LoadingScreen } from './DraftStateScreens';
import { render } from '../../test-utils';

describe('LoadingScreen (LS-4647)', () => {
  it('renders the d-layout shell with topband, main, and rail skeletons', () => {
    const { container, getByTestId } = render(<LoadingScreen />);

    expect(getByTestId('draft-board-loading')).toBeTruthy();
    expect(container.querySelector('.d-layout')).toBeTruthy();
    expect(container.querySelector('.d-topband')).toBeTruthy();
    expect(container.querySelector('.d-main')).toBeTruthy();
    expect(container.querySelector('.d-rail')).toBeTruthy();
  });

  it('renders topband sub-regions (status, divider, timer, slab, autopick)', () => {
    const { container } = render(<LoadingScreen />);

    expect(container.querySelector('.d-topband .d-tb-status')).toBeTruthy();
    expect(container.querySelector('.d-topband-divider')).toBeTruthy();
    expect(container.querySelector('.d-topband .d-tb-timer')).toBeTruthy();
    expect(container.querySelector('.d-topband .d-tb-clock')).toBeTruthy();
    expect(container.querySelector('.d-topband .d-tb-autopick')).toBeTruthy();
  });

  it('renders main pane skeleton card grid and a row of filter pills', () => {
    const { container } = render(<LoadingScreen />);

    const grid = container.querySelector('.d-main .d-player-grid');
    expect(grid).toBeTruthy();
    expect(grid?.querySelectorAll('.d-skel-card').length).toBeGreaterThan(0);
    expect(
      container.querySelectorAll('.d-main .d-pills .d-skel-line').length,
    ).toBeGreaterThan(0);
  });

  it('renders a stack of rail panel skeletons', () => {
    const { container } = render(<LoadingScreen />);

    const railPanels = container.querySelectorAll('.d-rail .d-rail-panel');
    expect(railPanels.length).toBeGreaterThanOrEqual(4);
  });

  it('exposes loading state to assistive tech', () => {
    const { getByTestId } = render(<LoadingScreen />);
    const root = getByTestId('draft-board-loading');

    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-busy')).toBe('true');
  });
});

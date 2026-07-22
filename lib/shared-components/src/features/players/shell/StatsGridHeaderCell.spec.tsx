/**
 * StatsGridHeaderCell.spec.tsx — unit tests for the shared sortable
 * stats-grid header cell (LS-8566), extracted verbatim from the MLB batting
 * and pitching data grids' inlined header renderers.
 */
import React from 'react';
import { StatsGridHeaderCell } from './StatsGridHeaderCell';
import { fireEvent, render, screen } from '../../../test-utils';

describe('StatsGridHeaderCell', () => {
  test('renders the column label', () => {
    render(<StatsGridHeaderCell label="HR" />);

    expect(screen.getByText('HR')).toBeInTheDocument();
  });

  test('click on a sortable inactive column sorts by the default direction (desc)', () => {
    const onSort = jest.fn();
    render(<StatsGridHeaderCell label="HR" sortable onSort={onSort} />);

    fireEvent.click(screen.getByText('HR'));

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('desc');
  });

  test('click on a sortable inactive column honors defaultDirection="asc"', () => {
    const onSort = jest.fn();
    render(
      <StatsGridHeaderCell
        label="Player"
        sortable
        defaultDirection="asc"
        onSort={onSort}
      />,
    );

    fireEvent.click(screen.getByText('Player'));

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('asc');
  });

  test('click on the active descending column flips the sort to asc', () => {
    const onSort = jest.fn();
    render(
      <StatsGridHeaderCell
        label="HR"
        sortable
        isActive
        direction="desc"
        onSort={onSort}
      />,
    );

    fireEvent.click(screen.getByText('HR'));

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('asc');
  });

  test('click on the active ascending column flips the sort to desc', () => {
    const onSort = jest.fn();
    render(
      <StatsGridHeaderCell
        label="HR"
        sortable
        isActive
        direction="asc"
        onSort={onSort}
      />,
    );

    fireEvent.click(screen.getByText('HR'));

    expect(onSort).toHaveBeenCalledTimes(1);
    expect(onSort).toHaveBeenCalledWith('desc');
  });

  test('non-sortable column ignores clicks', () => {
    const onSort = jest.fn();
    render(<StatsGridHeaderCell label="FPTS" onSort={onSort} />);

    fireEvent.click(screen.getByText('FPTS'));

    expect(onSort).not.toHaveBeenCalled();
  });

  test('direction glyph renders only when the column is active', () => {
    const { rerender } = render(<StatsGridHeaderCell label="HR" sortable />);

    // Inactive: no glyph in either direction.
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
    expect(screen.queryByText('▲')).not.toBeInTheDocument();

    // Active descending: ▼ only.
    rerender(
      <StatsGridHeaderCell label="HR" sortable isActive direction="desc" />,
    );
    expect(screen.getByText('▼')).toBeInTheDocument();
    expect(screen.queryByText('▲')).not.toBeInTheDocument();

    // Active ascending: ▲ only.
    rerender(
      <StatsGridHeaderCell label="HR" sortable isActive direction="asc" />,
    );
    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });
});

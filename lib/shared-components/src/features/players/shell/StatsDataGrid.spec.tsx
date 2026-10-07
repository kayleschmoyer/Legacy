/**
 * StatsDataGrid.spec.tsx — unit tests for the shared, sport-agnostic stats
 * grid (LS-9036) that the MLB batting/pitching and NFL grids all render
 * through. Covers rendering, sorting, pagination, row clicks, and the
 * loading/error/empty states, independent of any sport-specific adapter.
 */
import React from 'react';
import { StatsDataGrid, StatsDataGridColumn } from './StatsDataGrid';
import { fireEvent, render, screen } from '../../../test-utils';

interface TestRow {
  id: number;
  name: string;
  homeRuns: number;
}

const COLUMNS: StatsDataGridColumn<TestRow>[] = [
  {
    key: 'name',
    label: 'Player',
    sortable: true,
    align: 'left',
    formatter: (row) => row.name,
  },
  {
    key: 'homeRuns',
    label: 'HR',
    sortable: true,
    align: 'right',
    formatter: (row) => String(row.homeRuns),
  },
];

const ROWS: TestRow[] = [
  { id: 1, name: 'Player One', homeRuns: 42 },
  { id: 2, name: 'Player Two', homeRuns: 10 },
];

const makeProps = (
  overrides: Partial<React.ComponentProps<typeof StatsDataGrid<TestRow>>> = {},
) => ({
  title: 'Leaders',
  rows: ROWS,
  getRowId: (row: TestRow) => row.id,
  columns: COLUMNS,
  currentPage: 1,
  totalPages: 1,
  totalCount: ROWS.length,
  pageSize: 25,
  onPrev: jest.fn(),
  onNext: jest.fn(),
  onGoToPage: jest.fn(),
  onPageSizeChange: jest.fn(),
  ...overrides,
});

describe('StatsDataGrid', () => {
  test('renders the title, subtitle, column headers, and row data', () => {
    render(<StatsDataGrid {...makeProps({ subtitle: '2 players' })} />);

    expect(screen.getByText('Leaders')).toBeInTheDocument();
    expect(screen.getByText('2 players')).toBeInTheDocument();
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
    expect(screen.getByText('Player Two')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  test('clicking a sortable header fires onSortChange with the column key and default direction', () => {
    const onSortChange = jest.fn();
    render(<StatsDataGrid {...makeProps({ onSortChange })} />);

    fireEvent.click(screen.getByText('HR'));

    expect(onSortChange).toHaveBeenCalledTimes(1);
    expect(onSortChange).toHaveBeenCalledWith('homeRuns', 'desc');
  });

  test('clicking a row fires onRowClick with the row', () => {
    const onRowClick = jest.fn();
    render(<StatsDataGrid {...makeProps({ onRowClick })} />);

    fireEvent.click(screen.getByText('Player One'));

    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
  });

  test('rows are keyboard-focusable and Enter/Space fire onRowClick (LS-10665)', () => {
    const onRowClick = jest.fn();
    render(
      <StatsDataGrid
        {...makeProps({ onRowClick, getRowTestId: (row) => `row-${row.id}` })}
      />,
    );

    const row = screen.getByTestId('row-2');
    expect(row).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onRowClick).toHaveBeenCalledTimes(1);
    expect(onRowClick).toHaveBeenLastCalledWith(ROWS[1]);

    fireEvent.keyDown(row, { key: ' ' });
    expect(onRowClick).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(row, { key: 'a' });
    expect(onRowClick).toHaveBeenCalledTimes(2);
  });

  test('rows are not focusable when onRowClick is not provided', () => {
    render(
      <StatsDataGrid
        {...makeProps({ getRowTestId: (row) => `row-${row.id}` })}
      />,
    );

    expect(screen.getByTestId('row-1')).not.toHaveAttribute('tabindex');
  });

  test('honors a custom sortKey and defaultDirection when sorting a column', () => {
    const onSortChange = jest.fn();
    const columns: StatsDataGridColumn<TestRow>[] = [
      ...COLUMNS.slice(0, 1),
      {
        key: 'homeRuns',
        label: 'HR',
        sortable: true,
        sortKey: 'totalHomeRuns',
        defaultDirection: 'asc',
        align: 'right',
        formatter: (row) => String(row.homeRuns),
      },
    ];
    render(<StatsDataGrid {...makeProps({ columns, onSortChange })} />);

    fireEvent.click(screen.getByText('HR'));

    expect(onSortChange).toHaveBeenCalledWith('totalHomeRuns', 'asc');
  });

  test('renderCell takes precedence over formatter for rich cell content', () => {
    const columns: StatsDataGridColumn<TestRow>[] = [
      {
        key: 'name',
        label: 'Player',
        renderCell: (row) => (
          <span data-testid="rich-cell">{row.name} (rich)</span>
        ),
        formatter: () => 'should not be used',
      },
    ];
    render(<StatsDataGrid {...makeProps({ columns })} />);

    const richCells = screen.getAllByTestId('rich-cell');
    expect(richCells[0]).toHaveTextContent('Player One (rich)');
    expect(richCells[1]).toHaveTextContent('Player Two (rich)');
    expect(screen.queryByText('should not be used')).not.toBeInTheDocument();
  });

  test('sticky column still renders its header label and cell content', () => {
    const columns: StatsDataGridColumn<TestRow>[] = [
      {
        key: 'name',
        label: 'Player',
        sticky: true,
        formatter: (row) => row.name,
      },
    ];
    render(<StatsDataGrid {...makeProps({ columns })} />);

    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('Player One')).toBeInTheDocument();
  });

  test('passes accessibilityLabel through to a sortable header as its aria-label', () => {
    const columns: StatsDataGridColumn<TestRow>[] = [
      {
        key: 'name',
        label: 'Player',
        sortable: true,
        accessibilityLabel: 'Sort by player name',
        formatter: (row) => row.name,
      },
    ];
    render(<StatsDataGrid {...makeProps({ columns })} />);

    expect(
      screen.getByRole('columnheader', { name: 'Sort by player name' }),
    ).toBeInTheDocument();
  });

  test('renders the pagination footer by default and can hide it', () => {
    const { rerender } = render(
      <StatsDataGrid
        {...makeProps({ currentPage: 2, totalPages: 4, totalCount: 100 })}
      />,
    );

    expect(screen.getByText('Page 2 of 4')).toBeInTheDocument();

    rerender(
      <StatsDataGrid
        {...makeProps({ showPagination: false, totalPages: 4 })}
      />,
    );

    expect(screen.queryByText('Page 1 of 4')).not.toBeInTheDocument();
  });

  describe('loading state', () => {
    test('shows the loading skeleton in place of rows when loading with no rows yet', () => {
      render(<StatsDataGrid {...makeProps({ rows: [], loading: true })} />);

      expect(
        screen.getByTestId('player-stats-loading-skeleton'),
      ).toBeInTheDocument();
    });

    test('keeps the column headers and title visible while loading with no rows', () => {
      render(<StatsDataGrid {...makeProps({ rows: [], loading: true })} />);

      expect(screen.getByText('Leaders')).toBeInTheDocument();
      expect(screen.getByText('Player')).toBeInTheDocument();
      expect(screen.getByText('HR')).toBeInTheDocument();
    });

    test('renders rows instead of the skeleton when loading is true but stale rows are supplied', () => {
      render(<StatsDataGrid {...makeProps({ loading: true })} />);

      expect(
        screen.queryByTestId('player-stats-loading-skeleton'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Player One')).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    test('shows the empty card in place of rows when there are no rows and not loading', () => {
      render(<StatsDataGrid {...makeProps({ rows: [] })} />);

      expect(screen.getByTestId('player-stats-empty-card')).toBeInTheDocument();
      expect(screen.getByText('No players found')).toBeInTheDocument();
    });

    test('keeps the column headers and title visible when empty', () => {
      render(<StatsDataGrid {...makeProps({ rows: [] })} />);

      expect(screen.getByText('Leaders')).toBeInTheDocument();
      expect(screen.getByText('Player')).toBeInTheDocument();
      expect(screen.getByText('HR')).toBeInTheDocument();
    });

    test('empty card Clear action fires onClear', () => {
      const onClear = jest.fn();
      render(<StatsDataGrid {...makeProps({ rows: [], onClear })} />);

      fireEvent.click(screen.getByText('Clear all filters'));

      expect(onClear).toHaveBeenCalledTimes(1);
    });

    test('honors custom empty title/message overrides', () => {
      render(
        <StatsDataGrid
          {...makeProps({
            rows: [],
            emptyTitle: 'No pitchers found',
            emptyMessage: 'Try a different range.',
          })}
        />,
      );

      expect(screen.getByText('No pitchers found')).toBeInTheDocument();
      expect(screen.getByText('Try a different range.')).toBeInTheDocument();
    });
  });

  describe('error state', () => {
    test('replaces the whole grid with the error card when errored with no rows', () => {
      render(
        <StatsDataGrid
          {...makeProps({ rows: [], error: new Error('boom') })}
        />,
      );

      expect(screen.getByTestId('player-stats-error-card')).toBeInTheDocument();
      expect(screen.queryByText('Leaders')).not.toBeInTheDocument();
      expect(screen.queryByText('Player')).not.toBeInTheDocument();
    });

    test('error card Retry action fires onRetry', () => {
      const onRetry = jest.fn();
      render(
        <StatsDataGrid
          {...makeProps({ rows: [], error: new Error('boom'), onRetry })}
        />,
      );

      fireEvent.click(screen.getByText('Retry'));

      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    test('honors custom error title/message overrides', () => {
      render(
        <StatsDataGrid
          {...makeProps({
            rows: [],
            error: new Error('boom'),
            errorTitle: 'Archive unavailable',
            errorMessage: 'Please try again shortly.',
          })}
        />,
      );

      expect(screen.getByText('Archive unavailable')).toBeInTheDocument();
      expect(screen.getByText('Please try again shortly.')).toBeInTheDocument();
    });

    test('renders rows instead of the error card when errored but stale rows are supplied', () => {
      render(<StatsDataGrid {...makeProps({ error: new Error('boom') })} />);

      expect(
        screen.queryByTestId('player-stats-error-card'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Player One')).toBeInTheDocument();
    });
  });
});

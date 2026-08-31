import React from 'react';
import { act, render } from '@testing-library/react';
import {
  type FootballStatsPageProps,
  useFootballController,
} from './footballStatsConfig';
import type { SportStatsController } from '../shell/sportStatsConfig';

// The grid is Apollo/Tamagui-heavy; capture its props so the controller's sort
// wiring can be driven directly.
let mockGridProps: Record<string, unknown> = {};
jest.mock('./FootballStatsDataGrid', () => ({
  FootballStatsDataGrid: (props: Record<string, unknown>) => {
    mockGridProps = props;
    return null;
  },
}));

// Passthrough — the fade animation is irrelevant to controller behavior.
jest.mock('../shell/TabContentFade', () => ({
  TabContentFade: ({ children }: { children: React.ReactNode }) => children,
}));

const controllerRef: { current?: SportStatsController } = {};

function Harness(props: FootballStatsPageProps) {
  const controller = useFootballController(props);
  controllerRef.current = controller;
  return <>{controller.renderContent()}</>;
}

describe('useFootballController tabs + sort (LS-8566)', () => {
  beforeEach(() => {
    mockGridProps = {};
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('surfaces the seven stats-grid tabs in display order', () => {
    render(<Harness isPremium />);
    expect(controllerRef.current?.tabs).toEqual([
      { id: 'overview', label: 'Overview' },
      { id: 'passing', label: 'Passing' },
      { id: 'rushing', label: 'Rushing' },
      { id: 'receiving', label: 'Receiving' },
      { id: 'kicking', label: 'Kicking' },
      { id: 'idp', label: 'Defense' },
      { id: 'defense', label: 'DST' },
    ]);
    expect(controllerRef.current?.activeTab).toBe('overview');
  });

  it('defaults to the overview with its fantasy-points-descending sort and no category (LS-9504)', () => {
    render(<Harness isPremium />);
    expect(mockGridProps.sortField).toBe('fpts');
    expect(mockGridProps.sortDir).toBe('desc');
    expect(
      (mockGridProps.queryVars as { category?: string }).category,
    ).toBeUndefined();
  });

  it('seeds view and sort from initialFilters', () => {
    render(
      <Harness
        isPremium
        initialFilters={{
          view: 'passing',
          sortField: 'passing.td',
          sortDir: 'asc',
        }}
      />,
    );
    expect(controllerRef.current?.activeTab).toBe('passing');
    expect(mockGridProps.sortField).toBe('passing.td');
    expect(mockGridProps.sortDir).toBe('asc');
    expect((mockGridProps.queryVars as { category?: string }).category).toBe(
      'passing',
    );
  });

  it('tab change switches the category and resets to the view-default sort', () => {
    render(
      <Harness
        isPremium
        initialFilters={{ view: 'passing', sortField: 'passing.td' }}
      />,
    );
    act(() => controllerRef.current?.onTabChange('rushing'));
    expect(controllerRef.current?.activeTab).toBe('rushing');
    expect(mockGridProps.sortField).toBe('rushing.yds');
    expect(mockGridProps.sortDir).toBe('desc');
    expect((mockGridProps.queryVars as { category?: string }).category).toBe(
      'rushing',
    );
  });

  it('grid header sort commits and reaches the query vars', () => {
    render(<Harness isPremium initialFilters={{ view: 'kicking' }} />);
    const onSortChange = mockGridProps.onSortChange as (
      field: string,
      dir: 'asc' | 'desc',
    ) => void;
    act(() => onSortChange('kicking.fgPct', 'desc'));
    expect(mockGridProps.sortField).toBe('kicking.fgPct');
    const vars = mockGridProps.queryVars as {
      sortBy?: string;
      sortDir?: string;
    };
    expect(vars.sortBy).toBe('kicking.fgPct');
    expect(vars.sortDir).toBe('desc');
  });

  it('an unknown initial view normalizes to overview', () => {
    render(<Harness isPremium initialFilters={{ view: 'batting' as never }} />);
    expect(controllerRef.current?.activeTab).toBe('overview');
  });

  describe('URL-mirror effect (loop regression)', () => {
    it('fires once per committed change — a re-render with a stable callback does not re-fire it', () => {
      const onFiltersChange = jest.fn();
      const { rerender } = render(
        <Harness isPremium onFiltersChange={onFiltersChange} />,
      );
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
      expect(onFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ view: 'overview' }),
      );

      // Same callback identity re-rendered — the effect must NOT re-fire
      // (LS-8566: an unstable identity looped the page via setSearchParams).
      rerender(<Harness isPremium onFiltersChange={onFiltersChange} />);
      expect(onFiltersChange).toHaveBeenCalledTimes(1);
    });

    it('emits the active view on a tab change with the sort cleared', () => {
      type FiltersState = {
        view: string;
        pageSize: number;
        filters: { sortField?: string };
      };
      const onFiltersChange = jest.fn((state: FiltersState) => state);
      render(<Harness isPremium onFiltersChange={onFiltersChange} />);
      act(() => controllerRef.current?.onTabChange('defense'));
      expect(onFiltersChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ view: 'defense' }),
      );
      const calls = onFiltersChange.mock.calls;
      const lastState = calls[calls.length - 1][0];
      // View-default sort is treated as unset so it stays out of the URL.
      expect(lastState.filters.sortField).toBeUndefined();
    });
  });
});

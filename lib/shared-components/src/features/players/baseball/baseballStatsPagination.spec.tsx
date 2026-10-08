/**
 * LS-10658: the /players MLB grid pagers kept page and "Show: N" in grid-local
 * state, so neither reached the URL and both were lost on reload / share /
 * Back. The controller now owns both and reports them via onFiltersChange.
 * The grids are stubbed to capture the controlled props the controller passes
 * them; the URL serialization itself is covered in apps/web's
 * PlayerStatsPage.spec.ts.
 */
import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useBaseballController } from './baseballStatsConfig';
import type { PlayerStatsPageProps } from './baseballStatsConfig';
import type { SportStatsController } from '../shell/sportStatsConfig';
import { Platform } from '../../../platform-components';
import { MockedProvider } from '../../../test-utils/MockedProvider';

interface CapturedGridProps {
  page?: number;
  pageSize?: number;
  pageSizeOptions?: readonly number[];
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  onSortChange?: (sortBy: string, sortDir: 'asc' | 'desc') => void;
}

const mockBattingProps: { current: CapturedGridProps } = { current: {} };
const mockPitchingProps: { current: CapturedGridProps } = { current: {} };

jest.mock('../PlayerStatsDataGrid', () => ({
  ...jest.requireActual<Record<string, unknown>>('../PlayerStatsDataGrid'),
  PlayerStatsDataGrid: (props: CapturedGridProps) => {
    mockBattingProps.current = props;
    return null;
  },
}));

jest.mock('../PitchingStatsDataGrid', () => ({
  ...jest.requireActual<Record<string, unknown>>('../PitchingStatsDataGrid'),
  PitchingStatsDataGrid: (props: CapturedGridProps) => {
    mockPitchingProps.current = props;
    return null;
  },
}));

type FiltersChangeState = Parameters<
  NonNullable<PlayerStatsPageProps['onFiltersChange']>
>[0];

const latestController: { current: SportStatsController | null } = {
  current: null,
};

function Harness(props: PlayerStatsPageProps) {
  const controller = useBaseballController(props);
  latestController.current = controller;
  return (
    <>
      {controller.renderToolbarControls()}
      {controller.renderContent()}
    </>
  );
}

function renderController(props: Partial<PlayerStatsPageProps> = {}) {
  const onFiltersChange = jest.fn<void, [FiltersChangeState]>();
  render(
    <MockedProvider mocks={[]}>
      <Harness onFiltersChange={onFiltersChange} {...props} />
    </MockedProvider>,
  );
  const lastState = (): FiltersChangeState => {
    const calls = onFiltersChange.mock.calls;
    return calls[calls.length - 1][0];
  };
  return { onFiltersChange, lastState };
}

// The filter-commit case types into the toolbar search box; only the web jest
// harness's TextInput mock forwards onChangeText, so scope that case to web.
const itWeb = Platform.OS === 'web' ? it : it.skip;

beforeEach(() => {
  mockBattingProps.current = {};
  mockPitchingProps.current = {};
});

describe('baseball controller grid pagination (LS-10658)', () => {
  it('restores both grid pages from initial filters', () => {
    renderController({
      initialViewMode: 'combined',
      initialFilters: { page: 3, pitchingPage: 2 },
    });
    expect(mockBattingProps.current.page).toBe(3);
    expect(mockPitchingProps.current.page).toBe(2);
  });

  it('falls back to page 1 for an invalid initial page', () => {
    renderController({ initialFilters: { page: -4, pitchingPage: 1.5 } });
    expect(mockBattingProps.current.page).toBe(1);
    expect(mockPitchingProps.current.page).toBe(1);
  });

  it('reports a pager move through onFiltersChange (AC1)', () => {
    const { lastState } = renderController({ initialViewMode: 'combined' });
    expect(lastState().filters.page).toBeUndefined();

    act(() => mockBattingProps.current.onPageChange?.(3));
    expect(mockBattingProps.current.page).toBe(3);
    expect(lastState().filters.page).toBe(3);

    act(() => mockPitchingProps.current.onPageChange?.(2));
    expect(lastState().filters).toMatchObject({ page: 3, pitchingPage: 2 });
  });

  it('commits a pager "Show: N" to the applied page size (AC2)', () => {
    const { lastState } = renderController({
      initialViewMode: 'hitters',
      initialFilters: { page: 4 },
    });
    act(() => mockBattingProps.current.onPageSizeChange?.(50));
    expect(lastState().pageSize).toBe(50);
    expect(mockBattingProps.current.pageSize).toBe(50);
    // A new page size restarts at page 1.
    expect(mockBattingProps.current.page).toBe(1);
    expect(lastState().filters.page).toBeUndefined();
  });

  it('caps the Combined pager at the toolbar sizes (AC3)', () => {
    renderController({ initialViewMode: 'combined', isPremiumPageSize: true });
    expect(mockBattingProps.current.pageSizeOptions).toEqual([10, 25, 50]);
    expect(mockPitchingProps.current.pageSizeOptions).toEqual([10, 25, 50]);
    // Even a stray 100 from the pager is clamped to the Combined cap.
    act(() => mockBattingProps.current.onPageSizeChange?.(100));
    expect(mockBattingProps.current.pageSize).toBe(50);
  });

  it('resets only the sorted grid to page 1 on a sort change (AC4)', () => {
    const { lastState } = renderController({
      initialViewMode: 'combined',
      initialFilters: { page: 3, pitchingPage: 2 },
    });
    act(() => mockBattingProps.current.onSortChange?.('rbi', 'desc'));
    expect(mockBattingProps.current.page).toBe(1);
    expect(mockPitchingProps.current.page).toBe(2);

    act(() => mockPitchingProps.current.onSortChange?.('whip', 'asc'));
    expect(mockPitchingProps.current.page).toBe(1);
    expect(lastState().filters.page).toBeUndefined();
    expect(lastState().filters.pitchingPage).toBeUndefined();
  });

  itWeb('resets both grids to page 1 on a filter commit (AC4)', () => {
    const { lastState } = renderController({
      initialViewMode: 'combined',
      initialFilters: { page: 3, pitchingPage: 2 },
    });
    // Applying with no pending change keeps the page.
    act(() => latestController.current?.onApply?.());
    expect(mockBattingProps.current.page).toBe(3);

    fireEvent.change(screen.getByPlaceholderText(/Search player name/), {
      target: { value: 'Ruth' },
    });
    act(() => latestController.current?.onApply?.());
    expect(lastState().filters.searchTerm).toBe('Ruth');
    expect(mockBattingProps.current.page).toBe(1);
    expect(mockPitchingProps.current.page).toBe(1);
    expect(lastState().filters.page).toBeUndefined();
  });

  it('resets both grids to page 1 on a view-tab change', () => {
    renderController({
      initialViewMode: 'combined',
      initialFilters: { page: 3, pitchingPage: 2 },
    });
    act(() => latestController.current?.onTabChange('hitters'));
    expect(mockBattingProps.current.page).toBe(1);
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { FootballStatsDataGrid } from './FootballStatsDataGrid';
import { FOOTBALL_STAT_COLUMNS_BY_VIEW } from './footballStatsColumns';
import type { FootballQueryVars } from './footballStatsHelpers';

// Capture the variables each render passes so pagination/sort wiring can be
// asserted without a real Apollo client.
let mockQueryVariables: Record<string, unknown> | undefined;
let mockQueryResult: {
  data?: unknown;
  loading: boolean;
  error?: Error;
} = { data: undefined, loading: false };

jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayerStatsGridQuery: (options: {
    variables: Record<string, unknown>;
  }) => {
    mockQueryVariables = options.variables;
    return mockQueryResult;
  },
}));

function makePlayer(
  id: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    firstName: 'Player',
    lastName: `Number${id}`,
    position: 'QB',
    isDst: false,
    nflTeam: 'KC',
    careerStats: {
      fantasyPoints: 100 + id,
      passing: {
        g: 16,
        cmp: 300,
        att: 500,
        yds: 4000 + id,
        td: 30,
        int: 10,
        rating: 99.5,
      },
      rushing: null,
      receiving: null,
      kicking: null,
      defense: null,
      idp: null,
    },
    ...overrides,
  };
}

function setData(nodes: unknown[], totalCount: number, hasNextPage = false) {
  mockQueryResult = {
    loading: false,
    data: {
      footballPlayers: {
        nodes,
        pageInfo: { hasNextPage, endCursor: String(nodes.length) },
        totalCount,
      },
    },
  };
}

const baseVars: FootballQueryVars = {
  sortBy: 'passing.yds',
  sortDir: 'desc',
  category: 'passing',
};

function renderGrid(
  props: Partial<React.ComponentProps<typeof FootballStatsDataGrid>> = {},
) {
  const onSortChange = jest.fn();
  const onPageSizeChange = jest.fn();
  const onPlayerSelect = jest.fn();
  const utils = render(
    <FootballStatsDataGrid
      queryVars={baseVars}
      columns={FOOTBALL_STAT_COLUMNS_BY_VIEW.passing}
      title="NFL Career Passing Leaders"
      pageSize={25}
      resetKey="k1"
      sortField="passing.yds"
      sortDir="desc"
      onSortChange={onSortChange}
      onPageSizeChange={onPageSizeChange}
      onPlayerSelect={onPlayerSelect}
      {...props}
    />,
  );
  return { ...utils, onSortChange, onPageSizeChange, onPlayerSelect };
}

describe('FootballStatsDataGrid (LS-8566)', () => {
  beforeEach(() => {
    mockQueryVariables = undefined;
    mockQueryResult = { data: undefined, loading: false };
  });

  it('renders the title, count line, and per-view stat headers', () => {
    setData([makePlayer(1), makePlayer(2)], 1234);
    renderGrid();
    expect(screen.getByText('NFL Career Passing Leaders')).toBeTruthy();
    expect(screen.getByText(/1,234 players · sorted by YDS/)).toBeTruthy();
    for (const label of ['FPTS', 'FP/G', 'CMP', 'ATT', 'TD', 'INT', 'RTG']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it('renders career fantasy points and per-game fantasy points', () => {
    // fantasyPoints 101 over the passing category's 16 games → 6.3 FP/G.
    setData([makePlayer(1)], 1);
    renderGrid();
    expect(screen.getByText('101.0')).toBeTruthy();
    expect(screen.getByText('6.3')).toBeTruthy();
  });

  it('requests the first page with the committed vars', () => {
    setData([makePlayer(1)], 1);
    renderGrid();
    expect(mockQueryVariables).toMatchObject({
      sortBy: 'passing.yds',
      sortDir: 'desc',
      category: 'passing',
      first: 25,
      after: undefined,
    });
  });

  it('active header click flips direction; identity column starts ascending', () => {
    setData([makePlayer(1)], 1);
    const { onSortChange } = renderGrid();
    // Active stat column (desc) → flip to asc.
    fireEvent.click(screen.getByLabelText('Sort by YDS'));
    expect(onSortChange).toHaveBeenLastCalledWith('passing.yds', 'asc');
    // Inactive stat column → desc-first (leaders).
    fireEvent.click(screen.getByLabelText('Sort by TD'));
    expect(onSortChange).toHaveBeenLastCalledWith('passing.td', 'desc');
    // Inactive identity column → asc-first.
    fireEvent.click(screen.getByLabelText('Sort by name'));
    expect(onSortChange).toHaveBeenLastCalledWith('name', 'asc');
  });

  it('pages via the offset cursor and resets on resetKey change', () => {
    setData(
      Array.from({ length: 25 }, (_, i) => makePlayer(i + 1)),
      60,
      true,
    );
    const { rerender } = renderGrid();
    fireEvent.click(screen.getByText('Next →'));
    expect(mockQueryVariables).toMatchObject({ after: '25' });

    // Committed filters changed → back to page one.
    rerender(
      <FootballStatsDataGrid
        queryVars={baseVars}
        columns={FOOTBALL_STAT_COLUMNS_BY_VIEW.passing}
        title="NFL Career Passing Leaders"
        pageSize={25}
        resetKey="k2"
        sortField="passing.yds"
        sortDir="desc"
        onSortChange={jest.fn()}
        onPageSizeChange={jest.fn()}
        onPlayerSelect={jest.fn()}
      />,
    );
    expect(mockQueryVariables).toMatchObject({ after: undefined });
  });

  it('row click reports the player id', () => {
    setData([makePlayer(7)], 1);
    const { onPlayerSelect } = renderGrid();
    fireEvent.click(screen.getByText('Player Number7'));
    expect(onPlayerSelect).toHaveBeenCalledWith(7);
  });

  it('applies the availability filter client-side', () => {
    setData([makePlayer(1), makePlayer(2), makePlayer(3)], 3);
    renderGrid({
      availabilityFilter: 'free_agents',
      rosteredPlayerIds: new Set([2]),
    });
    expect(screen.getByText('Player Number1')).toBeTruthy();
    expect(screen.queryByText('Player Number2')).toBeNull();
    expect(screen.getByText('Player Number3')).toBeTruthy();
  });

  it('renders the page-size options and reports changes', () => {
    setData([makePlayer(1)], 1);
    const { onPageSizeChange } = renderGrid();
    fireEvent.click(screen.getByText('50'));
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});

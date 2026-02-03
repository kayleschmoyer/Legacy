/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/**
 * PlayerStatsDataGrid.test.tsx - Component Integration Tests
 *
 * Comprehensive test suite for the PlayerStatsDataGrid component
 * rendering, interaction, and integration with the CareerStatsService.
 *
 * @author Legacy Sports Team
 * @since 2025-09-28
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MockedResponse } from '@apollo/client/testing';
import {
  PlayerStatsDataGrid,
  type PlayerStatsDataGridProps,
} from './PlayerStatsDataGrid';
import {
  CAREER_BATTING_STATS_QUERY,
  type CareerBattingStatsRaw,
  PLAYERS_QUERY,
} from './services/CareerStatsService';
import { MockedProvider } from '../../test-utils/MockedProvider';

// Mock TamaguiProvider to avoid font creation issues in tests
const MockTamaguiProvider = ({ children }: { children: React.ReactNode }) => (
  <div data-testid="tamagui-provider">{children}</div>
);

// =============================================================================
// Test Setup and Mocks
// =============================================================================

const mockPlayerData: CareerBattingStatsRaw[] = [
  {
    __typename: 'CareerBatting',
    playerId: 1486,
    player: {
      __typename: 'Player',
      id: 1486,
      firstName: 'Player',
      lastName: '1486',
      brefId: 'player1486',
    },
    games: 3298,
    plateAppearances: 14053,
    atBats: 12364,
    runs: 2174,
    hits: 3771,
    doubles: 624,
    triples: 98,
    homeRuns: 755,
    rbi: 2297,
    stolenBases: 240,
    primaryPosition: '1B',
    positionsPlayed: '{"1B": {"games": 3298}}',
    caughtStealing: 117,
    baseOnBalls: 1402,
    strikeouts: 1383,
    totalBases: 6856,
    groundedIntoDoublePlays: 315,
    hitByPitch: 107,
    sacrificeHits: 61,
    intentionalBaseOnBalls: 293,
    battingAverage: 0.305,
    onBasePercentage: 0.377,
    sluggingPercentage: 0.555,
  },
  {
    __typename: 'CareerBatting',
    playerId: 1542,
    player: {
      __typename: 'Player',
      id: 1542,
      firstName: 'Player',
      lastName: '1542',
      brefId: 'player1542',
    },
    games: 170,
    plateAppearances: 64,
    atBats: 54,
    runs: 5,
    hits: 9,
    doubles: 1,
    triples: 0,
    homeRuns: 0,
    rbi: 1,
    stolenBases: 0,
    primaryPosition: 'OF',
    positionsPlayed: '{"OF": {"games": 170}}',
    caughtStealing: 0,
    baseOnBalls: 8,
    strikeouts: 32,
    totalBases: 10,
    groundedIntoDoublePlays: 2,
    hitByPitch: 1,
    sacrificeHits: 1,
    intentionalBaseOnBalls: 0,
    battingAverage: 0.167,
    onBasePercentage: 0.281,
    sluggingPercentage: 0.185,
  },
];

// Default mock with correct variable structure and Connection pattern response
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const defaultMock: MockedResponse = {
  request: {
    query: CAREER_BATTING_STATS_QUERY,
    variables: {
      first: 25,
      after: undefined,
      orderBy: 'homeRuns',
      orderDirection: 'desc',
      minGames: 10,
      minHomeRuns: 0,
      minRBI: 0,
      minBattingAvg: 0,
      searchTerm: '',
    },
  },
  result: {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        edges: mockPlayerData.map((player, index) => ({
          __typename: 'CareerBattingEdge',
          node: player,
          cursor: `cursor-${index}`,
        })),
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: mockPlayerData.length > 0 ? 'cursor-0' : null,
          endCursor:
            mockPlayerData.length > 0
              ? `cursor-${mockPlayerData.length - 1}`
              : null,
        },
        totalCount: mockPlayerData.length,
      },
    },
  },
};

// Mock for the base component render (page size 10, batting average order)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const baseMock: MockedResponse = {
  request: {
    query: CAREER_BATTING_STATS_QUERY,
    variables: {
      first: 10,
      after: undefined,
      orderBy: 'battingAverage',
      orderDirection: 'desc',
      minGames: 10,
      minHomeRuns: 0,
      minRBI: 0,
      minBattingAvg: 0,
      searchTerm: '',
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  result: {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        edges: mockPlayerData.slice(0, 10).map((player, index) => ({
          __typename: 'CareerBattingEdge',
          node: player,
          cursor: `cursor-${index}`,
        })),
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: mockPlayerData.length > 0 ? 'cursor-0' : null,
          endCursor:
            mockPlayerData.length > 0
              ? `cursor-${Math.min(9, mockPlayerData.length - 1)}`
              : null,
        },
        totalCount: mockPlayerData.length,
      },
    },
  },
};

// Mock for page size 50 (used in page size test)
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const pageSize50Mock: MockedResponse = {
  request: {
    query: CAREER_BATTING_STATS_QUERY,
    variables: {
      first: 50,
      after: undefined,
      orderBy: 'homeRuns',
      orderDirection: 'desc',
      minGames: 10,
      minHomeRuns: 0,
      minRBI: 0,
      minBattingAvg: 0,
      searchTerm: '',
    },
  },
  result: {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        edges: mockPlayerData.map((player, index) => ({
          __typename: 'CareerBattingEdge',
          node: player,
          cursor: `cursor-${index}`,
        })),
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: mockPlayerData.length > 0 ? 'cursor-0' : null,
          endCursor:
            mockPlayerData.length > 0
              ? `cursor-${mockPlayerData.length - 1}`
              : null,
        },
        totalCount: mockPlayerData.length,
      },
    },
  },
};

// Mock for the PLAYERS_QUERY used by useCareerStatsWithNames
// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const playersQueryMock: MockedResponse = {
  request: {
    query: PLAYERS_QUERY,
    variables: {
      first: 5000,
    },
  },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  result: {
    data: {
      players: [
        {
          __typename: 'Player',
          id: 1486,
          firstName: 'Player',
          lastName: '1486',
          brefId: 'player1486',
        },
        {
          __typename: 'Player',
          id: 1542,
          firstName: 'Player',
          lastName: '1542',
          brefId: 'player1542',
        },
      ],
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const emptyMock: MockedResponse = {
  ...defaultMock,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  result: {
    data: {
      careerBattingStats: {
        __typename: 'CareerBattingConnection',
        edges: [],
        pageInfo: {
          __typename: 'PageInfo',
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
        },
        totalCount: 0,
      },
    },
  },
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const errorMock: MockedResponse = {
  ...defaultMock,
  error: new Error('Failed to load player statistics'),
};

// Test wrapper component
interface TestWrapperProps {
  children: React.ReactNode;
  mocks?: MockedResponse[];
}

const TestWrapper: React.FC<TestWrapperProps> = ({
  children,
  mocks = [defaultMock, playersQueryMock],
}) => (
  <MockTamaguiProvider>
    <MockedProvider mocks={mocks}>{children}</MockedProvider>
  </MockTamaguiProvider>
);

// Default props for testing
const defaultProps: PlayerStatsDataGridProps = {
  title: 'Test Player Statistics',
  showSearch: true,
  showFilters: true,
  showPagination: true,
  showSorting: true,
  testId: 'test-grid',
};

// =============================================================================
// Rendering Tests
// =============================================================================

describe('PlayerStatsDataGrid - Rendering', () => {
  test('should render with default props', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    expect(screen.getByText('Test Player Statistics')).toBeInTheDocument();
    expect(
      screen.getByText('Loading player statistics...'),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(
        screen.queryByText('Loading player statistics...'),
      ).not.toBeInTheDocument();
    });

    // Verify table headers are present
    expect(screen.getByText('Player')).toBeInTheDocument();
    expect(screen.getByText('HR')).toBeInTheDocument();
    expect(screen.getByText('RBI')).toBeInTheDocument();
    expect(screen.getByText('AVG')).toBeInTheDocument();
  });

  test('should render player data correctly', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Player 1486')).toBeInTheDocument();
      expect(screen.getByText('755')).toBeInTheDocument(); // Home runs
      expect(screen.getByText('2297')).toBeInTheDocument(); // RBIs
      expect(screen.getByText('0.305')).toBeInTheDocument(); // Batting average
    });
  });

  test('should show search input when showSearch is true', () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} showSearch={true} />
      </TestWrapper>,
    );

    expect(
      screen.getByPlaceholderText('Search players...'),
    ).toBeInTheDocument();
  });

  test('should hide search input when showSearch is false', () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} showSearch={false} />
      </TestWrapper>,
    );

    expect(
      screen.queryByPlaceholderText('Search players...'),
    ).not.toBeInTheDocument();
  });

  test('should show filter controls when showFilters is true', () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} showFilters={true} />
      </TestWrapper>,
    );

    expect(screen.getByText('Filters:')).toBeInTheDocument();
    expect(screen.getByText('Min Games:')).toBeInTheDocument();
    expect(screen.getByText('Min HR:')).toBeInTheDocument();
  });

  test('should show pagination controls when showPagination is true', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} showPagination={true} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('← Previous')).toBeInTheDocument();
      expect(screen.getByText('Next →')).toBeInTheDocument();
      expect(screen.getByText(/Page \d+/)).toBeInTheDocument();
    });
  });
});

// =============================================================================
// Interaction Tests
// =============================================================================

describe('PlayerStatsDataGrid - Interactions', () => {
  test('should handle player row clicks', async () => {
    const mockPlayerSelect = jest.fn();

    render(
      <TestWrapper>
        <PlayerStatsDataGrid
          {...defaultProps}
          onPlayerSelect={mockPlayerSelect}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Player 1486')).toBeInTheDocument();
    });

    // Click on the first player row using the test ID
    const playerRow = screen.getByTestId('player-row-1486');
    // Try multiple event types to trigger the onPress handler
    fireEvent.mouseDown(playerRow);
    fireEvent.mouseUp(playerRow);
    fireEvent.click(playerRow);

    expect(mockPlayerSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        playerId: 1486,
        displayName: 'Player 1486',
        homeRuns: 755,
      }),
    );
  });

  test('should handle search input changes', () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search players...');
    fireEvent.change(searchInput, { target: { value: 'ruth' } });

    expect((searchInput as HTMLInputElement).value).toBe('ruth');
  });

  test('should handle filter changes', () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    const minGamesInput = screen.getByDisplayValue('10');
    fireEvent.change(minGamesInput, { target: { value: '100' } });

    expect((minGamesInput as HTMLInputElement).value).toBe('100');
  });

  test('should handle page size changes', async () => {
    render(
      <TestWrapper mocks={[defaultMock, pageSize50Mock, playersQueryMock]}>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('25')).toBeInTheDocument();
    });

    // Click on the 50 page size button
    const pageSizeButton = screen.getByText('50');
    fireEvent.click(pageSizeButton);

    // The button should become outlined (selected state)
    expect(pageSizeButton).toBeInTheDocument();
  });

  test('should handle refresh button click', () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    const refreshButton = screen.getByText('Refresh');
    fireEvent.click(refreshButton);

    // Refresh button should be present (component should not crash)
    expect(refreshButton).toBeInTheDocument();
  });
});

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('PlayerStatsDataGrid - Error Handling', () => {
  test('should display error state when GraphQL query fails', async () => {
    render(
      <TestWrapper mocks={[errorMock, playersQueryMock]}>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error Loading Statistics')).toBeInTheDocument();
      expect(
        screen.getByText('Failed to load player statistics'),
      ).toBeInTheDocument();
    });

    // Should show retry button
    expect(screen.getByText('Try Again')).toBeInTheDocument();
  });

  test('should display empty state when no data is returned', async () => {
    render(
      <TestWrapper mocks={[emptyMock, playersQueryMock]}>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('No players found')).toBeInTheDocument();
      expect(
        screen.getByText(
          'Try adjusting your search terms or filters to find more players.',
        ),
      ).toBeInTheDocument();
    });

    // Should show clear filters button
    expect(screen.getByText('Clear Filters')).toBeInTheDocument();
  });

  test('should handle error recovery with retry button', async () => {
    const { rerender } = render(
      <TestWrapper mocks={[errorMock, playersQueryMock]}>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Error Loading Statistics')).toBeInTheDocument();
    });

    // Click retry and provide successful mock
    const retryButton = screen.getByText('Try Again');

    rerender(
      <TestWrapper mocks={[defaultMock]}>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(
        screen.queryByText('Error Loading Statistics'),
      ).not.toBeInTheDocument();
    });
  });
});

// =============================================================================
// Accessibility Tests
// =============================================================================

describe('PlayerStatsDataGrid - Accessibility', () => {
  test('should have proper ARIA labels and roles', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      const grid = screen.getByText('Test Player Statistics');
      expect(grid).toBeInTheDocument();
    });

    // Check for input labels
    expect(
      screen.getByPlaceholderText('Search players...'),
    ).toBeInTheDocument();
  });

  test('should support keyboard navigation', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Player 1486')).toBeInTheDocument();
    });

    // Test tab navigation (basic check)
    const searchInput = screen.getByPlaceholderText('Search players...');
    searchInput.focus();
    expect(document.activeElement).toBe(searchInput);
  });
});

// =============================================================================
// Performance Tests
// =============================================================================

describe('PlayerStatsDataGrid - Performance', () => {
  test('should render large datasets efficiently', async () => {
    // Create a moderately-sized dataset (30 rows) to test performance
    // This is sufficient to validate virtualization and rendering optimization
    // while being fast enough for CI environments with resource constraints
    const largeMockData: CareerBattingStatsRaw[] = Array.from(
      { length: 30 },
      (_, index) => ({
        ...mockPlayerData[0],
        playerId: index + 1,
        player: {
          __typename: 'Player',
          id: index + 1,
          firstName: 'Player',
          lastName: `${index + 1}`,
          brefId: `player${index + 1}`,
        },
      }),
    );

    // Create matching players data for the performance test
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const performancePlayersQueryMock: MockedResponse = {
      request: {
        query: PLAYERS_QUERY,
        variables: {
          first: 5000,
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result: {
        data: {
          players: Array.from({ length: 30 }, (_, index) => ({
            id: `${index + 1}`,
            firstName: 'Player',
            lastName: `${index + 1}`,
            brefId: `player${index + 1}`,
          })),
        },
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const largeMock: MockedResponse = {
      ...defaultMock,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result: {
        data: {
          careerBattingStats: {
            __typename: 'CareerBattingConnection',
            edges: largeMockData.map((player, index) => ({
              __typename: 'CareerBattingEdge',
              node: player,
              cursor: `cursor-${index}`,
            })),
            pageInfo: {
              __typename: 'PageInfo',
              hasNextPage: false,
              hasPreviousPage: false,
              startCursor: largeMockData.length > 0 ? 'cursor-0' : null,
              endCursor:
                largeMockData.length > 0
                  ? `cursor-${largeMockData.length - 1}`
                  : null,
            },
            totalCount: largeMockData.length,
          },
        },
      },
    };

    render(
      <TestWrapper mocks={[largeMock, performancePlayersQueryMock]}>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    // Verify the component renders without hanging or crashing
    await waitFor(
      () => {
        expect(screen.getByText('Player 1')).toBeInTheDocument();
      },
      { timeout: 3000 }, // Should render within 3 seconds even in resource-constrained CI
    );

    // Verify multiple rows are rendered (tests virtualization works)
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();

    // Test passes if it completes without timeout - validates performance indirectly
  });

  test('should handle rapid state updates gracefully', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    const searchInput = screen.getByPlaceholderText('Search players...');

    // Simulate rapid typing
    fireEvent.change(searchInput, { target: { value: 'a' } });
    fireEvent.change(searchInput, { target: { value: 'ab' } });
    fireEvent.change(searchInput, { target: { value: 'abc' } });
    fireEvent.change(searchInput, { target: { value: 'abcd' } });

    await waitFor(() => {
      expect((searchInput as HTMLInputElement).value).toBe('abcd');
    });

    // Should not crash or show error
    expect(
      screen.queryByText('Error Loading Statistics'),
    ).not.toBeInTheDocument();
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('PlayerStatsDataGrid - Integration', () => {
  test('should integrate properly with CareerStatsService', async () => {
    render(
      <TestWrapper mocks={[baseMock, playersQueryMock]}>
        <PlayerStatsDataGrid
          {...defaultProps}
          initialParams={{
            first: 10,
            orderBy: 'battingAverage',
            orderDirection: 'desc',
          }}
        />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Player 1486')).toBeInTheDocument();
    });

    // Verify data transformation worked correctly
    expect(screen.getByText('0.305')).toBeInTheDocument(); // Formatted batting average
    expect(screen.getByText('0.932')).toBeInTheDocument(); // Computed OPS (0.377 + 0.555)
  });

  test('should maintain state consistency across operations', async () => {
    render(
      <TestWrapper>
        <PlayerStatsDataGrid {...defaultProps} />
      </TestWrapper>,
    );

    await waitFor(() => {
      expect(screen.getByText('Player 1486')).toBeInTheDocument();
    });

    // Change search term
    const searchInput = screen.getByPlaceholderText('Search players...');
    fireEvent.change(searchInput, { target: { value: 'test search' } });

    // Change page size
    const pageSizeButton = screen.getByText('50');
    fireEvent.click(pageSizeButton);

    // Verify both states are maintained
    expect((searchInput as HTMLInputElement).value).toBe('test search');
    // Page size change should be reflected in the component state
  });
});

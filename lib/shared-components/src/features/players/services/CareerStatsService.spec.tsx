/**
 * CareerStatsService.test.ts - Comprehensive Test Suite
 *
 * Tests for the CareerStatsService module including data transformation,
 * GraphQL integration, and React hooks functionality.
 *
 * @author Legacy Sports Team
 * @since 2025-09-28
 */

import { renderHook, waitFor } from '@testing-library/react';
import { MockedResponse } from '@apollo/client/testing/react';
import React from 'react';
import { MockedProvider } from '../../../test-utils/MockedProvider';
import {
  CAREER_BATTING_STATS_QUERY,
  CAREER_STATS_SORT_OPTIONS,
  type CareerBattingStatsRaw,
  type CareerStatsQueryParams,
  DEFAULT_CAREER_STATS_PARAMS,
  type PlayerCareerStats,
  transformCareerStats,
  useCareerStatsService,
} from '../services/CareerStatsService';

// =============================================================================
// Test Data Fixtures
// =============================================================================

const mockRawPlayerStats: CareerBattingStatsRaw = {
  playerId: 1486,
  primaryPosition: 'RF',
  positionsPlayed: '["RF","LF","CF"]',
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
  player: {
    id: 1486,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
    __typename: 'Player',
  },
  __typename: 'CareerBatting',
};

const mockEmptyPlayerStats: CareerBattingStatsRaw = {
  playerId: 9999,
  games: null,
  plateAppearances: null,
  atBats: null,
  runs: null,
  hits: null,
  doubles: null,
  triples: null,
  homeRuns: null,
  rbi: null,
  stolenBases: null,
  caughtStealing: null,
  baseOnBalls: null,
  strikeouts: null,
  totalBases: null,
  groundedIntoDoublePlays: null,
  hitByPitch: null,
  sacrificeHits: null,
  intentionalBaseOnBalls: null,
  battingAverage: null,
  onBasePercentage: null,
  sluggingPercentage: null,
};

const mockGraphQLResponse: MockedResponse = {
  request: {
    query: CAREER_BATTING_STATS_QUERY,
    variables: {},
  },

  result: {
    data: {
      careerBattingStats: {
        edges: [{ node: mockRawPlayerStats, __typename: 'CareerBattingEdge' }],
        pageInfo: {
          hasNextPage: false,
          hasPreviousPage: false,
          startCursor: null,
          endCursor: null,
          __typename: 'PageInfo',
        },
        totalCount: 1,
        __typename: 'CareerBattingConnection',
      },
    },
  },
};

const mockErrorResponse: MockedResponse = {
  request: {
    query: CAREER_BATTING_STATS_QUERY,
    variables: {},
  },
  error: new Error('GraphQL Network Error'),
};

// =============================================================================
// Test Helper Components
// =============================================================================

interface TestWrapperProps {
  children: React.ReactNode;
  mocks?: MockedResponse[];
}

const TestWrapper: React.FC<TestWrapperProps> = ({
  children,
  mocks = [mockGraphQLResponse],
}) => <MockedProvider mocks={mocks}>{children}</MockedProvider>;

// =============================================================================
// Data Transformation Tests
// =============================================================================

describe('CareerStatsService - Data Transformation', () => {
  describe('transformCareerStats', () => {
    test('should transform complete raw stats to enhanced player stats', () => {
      const result: PlayerCareerStats =
        transformCareerStats(mockRawPlayerStats);

      expect(result).toMatchObject({
        id: 'player-1486',
        playerId: 1486,
        displayName: 'Babe Ruth',
        firstName: 'Babe',
        lastName: 'Ruth',
        games: 3298,
        homeRuns: 755,
        rbi: 2297,
        battingAverage: 0.305,
        onBasePercentage: 0.377,
        sluggingPercentage: 0.555,
      });

      // Test computed OPS
      expect(result.ops).toBeCloseTo(0.932, 3); // 0.377 + 0.555

      // Test formatted values
      expect(result.formattedBattingAverage).toBe('0.305');
      expect(result.formattedOnBasePercentage).toBe('0.377');
      expect(result.formattedSluggingPercentage).toBe('0.555');
      expect(result.formattedOPS).toBe('0.932');
    });

    test('should handle null/undefined values gracefully', () => {
      const result: PlayerCareerStats =
        transformCareerStats(mockEmptyPlayerStats);

      expect(result).toMatchObject({
        id: 'player-9999',
        playerId: 9999,
        displayName: 'Player 9999',
        games: 0,
        homeRuns: 0,
        rbi: 0,
        battingAverage: 0,
        onBasePercentage: 0,
        sluggingPercentage: 0,
        ops: 0,
      });

      // Test formatted null values
      expect(result.formattedBattingAverage).toBe('0.000');
      expect(result.formattedOnBasePercentage).toBe('0.000');
      expect(result.formattedSluggingPercentage).toBe('0.000');
      expect(result.formattedOPS).toBe('0.000');
    });

    test('should calculate OPS correctly', () => {
      const testStats: CareerBattingStatsRaw = {
        ...mockEmptyPlayerStats,
        onBasePercentage: 0.4,
        sluggingPercentage: 0.6,
      };

      const result = transformCareerStats(testStats);
      expect(result.ops).toBeCloseTo(1.0, 3);
      expect(result.formattedOPS).toBe('1.000');
    });
  });
});

// =============================================================================
// React Hook Tests
// =============================================================================

describe('CareerStatsService - React Hooks', () => {
  describe('useCareerStatsService', () => {
    test('should return loading state initially', () => {
      const { result } = renderHook(() => useCareerStatsService(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      expect(result.current.loading).toBe(true);
      expect(result.current.data).toEqual([]);
      expect(result.current.error).toBeNull();
    });

    test('should load and transform data successfully', async () => {
      const { result } = renderHook(() => useCareerStatsService(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.data).toHaveLength(1);
      expect(result.current.data[0]).toMatchObject({
        id: 'player-1486',
        playerId: 1486,
        homeRuns: 755,
      });
      expect(result.current.error).toBeNull();
    });

    test('should handle custom query parameters', async () => {
      const customParams: CareerStatsQueryParams = {
        first: 10,
        after: 'cursor-20',
        orderBy: 'battingAverage',
        orderDirection: 'asc',
        minHomeRuns: 100,
      };

      const customMock: MockedResponse = {
        request: {
          query: CAREER_BATTING_STATS_QUERY,
          variables: customParams,
        },

        result: {
          data: {
            careerBattingStats: {
              edges: [{ node: mockRawPlayerStats }],
              pageInfo: {
                hasNextPage: false,
                hasPreviousPage: false,
                startCursor: null,
                endCursor: null,
              },
              totalCount: 1,
            },
          },
        },
      };

      const { result } = renderHook(() => useCareerStatsService(customParams), {
        wrapper: ({ children }) => (
          <TestWrapper mocks={[customMock]}>{children}</TestWrapper>
        ),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.pageSize).toBe(10);
      expect(result.current.currentPage).toBe(1); // Cursor-based pagination always starts at 1
    });

    test('should handle GraphQL errors', async () => {
      const { result } = renderHook(() => useCareerStatsService(), {
        wrapper: ({ children }) => (
          <TestWrapper mocks={[mockErrorResponse]}>{children}</TestWrapper>
        ),
      });

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.error?.message).toBe('GraphQL Network Error');
      expect(result.current.data).toEqual([]);
    });

    test('should calculate pagination metadata correctly', async () => {
      const paginationMock: MockedResponse = {
        request: {
          query: CAREER_BATTING_STATS_QUERY,
          variables: {
            first: 25,
            after: 'cursor-50',
          },
        },

        result: {
          data: {
            careerBattingStats: {
              edges: [{ node: mockRawPlayerStats }],
              pageInfo: {
                hasNextPage: true,
                hasPreviousPage: true,
                startCursor: 'cursor-50',
                endCursor: 'cursor-75',
              },
              totalCount: 100,
            },
          },
        },
      };

      const { result } = renderHook(
        () => useCareerStatsService({ first: 25, after: 'cursor-50' }),
        {
          wrapper: ({ children }) => (
            <TestWrapper mocks={[paginationMock]}>{children}</TestWrapper>
          ),
        },
      );

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.pageSize).toBe(25);
      expect(result.current.currentPage).toBe(1); // Cursor-based pagination always returns page 1
      expect(result.current.hasPreviousPage).toBe(true);
      expect(result.current.hasNextPage).toBe(true); // Matches pageInfo.hasNextPage from mock
    });
  });
});

// =============================================================================
// Configuration Tests
// =============================================================================

describe('CareerStatsService - Configuration', () => {
  describe('CAREER_STATS_SORT_OPTIONS', () => {
    test('should contain expected sort options', () => {
      expect(CAREER_STATS_SORT_OPTIONS).toHaveLength(8);

      const homeRunsOption = CAREER_STATS_SORT_OPTIONS.find(
        (option) => option.value === 'homeRuns' && option.direction === 'desc',
      );
      expect(homeRunsOption).toBeDefined();
      expect(homeRunsOption?.label).toBe('Home Runs (Most)');

      const battingAvgOption = CAREER_STATS_SORT_OPTIONS.find(
        (option) =>
          option.value === 'battingAverage' && option.direction === 'desc',
      );
      expect(battingAvgOption).toBeDefined();
      expect(battingAvgOption?.label).toBe('Batting Average (Highest)');
    });

    test('should have consistent structure for all options', () => {
      CAREER_STATS_SORT_OPTIONS.forEach((option) => {
        expect(option).toHaveProperty('label');
        expect(option).toHaveProperty('value');
        expect(option).toHaveProperty('direction');
        expect(['asc', 'desc']).toContain(option.direction);
        expect(typeof option.label).toBe('string');
        expect(typeof option.value).toBe('string');
      });
    });
  });

  describe('DEFAULT_CAREER_STATS_PARAMS', () => {
    test('should contain sensible defaults', () => {
      expect(DEFAULT_CAREER_STATS_PARAMS).toMatchObject({
        first: 25,
        orderBy: 'homeRuns',
        orderDirection: 'desc',
        minGames: 10,
        minHomeRuns: 0,
        minRBI: 0,
        minBattingAvg: 0.0,
        searchTerm: '',
      });
    });
  });
});

// =============================================================================
// Integration Tests
// =============================================================================

describe('CareerStatsService - Integration', () => {
  test('should work with real-world data patterns', () => {
    const realisticStats: CareerBattingStatsRaw = {
      playerId: 123,
      games: 1500,
      plateAppearances: 6500,
      atBats: 5800,
      runs: 950,
      hits: 1650,
      doubles: 320,
      triples: 45,
      homeRuns: 280,
      rbi: 1050,
      stolenBases: 85,
      caughtStealing: 25,
      baseOnBalls: 650,
      strikeouts: 1200,
      totalBases: 2900,
      groundedIntoDoublePlays: 125,
      hitByPitch: 35,
      sacrificeHits: 15,
      intentionalBaseOnBalls: 45,
      battingAverage: 0.284,
      onBasePercentage: 0.365,
      sluggingPercentage: 0.5,
    };

    const result = transformCareerStats(realisticStats);

    // Verify realistic computed values
    expect(result.ops).toBeCloseTo(0.865, 3);
    expect(result.battingAverage).toBeCloseTo(0.284, 3);

    // Verify all required fields are present and valid
    expect(result.id).toBe('player-123');
    expect(result.playerId).toBe(123);
    expect(result.displayName).toBe('Player 123');
    expect(result.games).toBe(1500);
    expect(result.homeRuns).toBe(280);
  });

  test('should handle edge cases in data transformation', () => {
    const edgeCaseStats: CareerBattingStatsRaw = {
      playerId: 0, // Edge case: zero player ID
      games: 1,
      plateAppearances: 1,
      atBats: 1,
      runs: 1,
      hits: 1,
      doubles: 0,
      triples: 0,
      homeRuns: 1, // Perfect home run rate
      rbi: 1,
      stolenBases: 0,
      caughtStealing: 0,
      baseOnBalls: 0,
      strikeouts: 0,
      totalBases: 4,
      groundedIntoDoublePlays: 0,
      hitByPitch: 0,
      sacrificeHits: 0,
      intentionalBaseOnBalls: 0,
      battingAverage: 1.0, // Perfect batting average
      onBasePercentage: 1.0,
      sluggingPercentage: 4.0, // Theoretical maximum for one at-bat
    };

    const result = transformCareerStats(edgeCaseStats);

    expect(result.battingAverage).toBe(1.0);
    expect(result.sluggingPercentage).toBe(4.0);
    expect(result.ops).toBe(5.0);
    expect(result.formattedBattingAverage).toBe('1.000');
    expect(result.formattedOPS).toBe('5.000');
  });
});

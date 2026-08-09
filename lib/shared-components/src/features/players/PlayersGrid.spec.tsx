/**
 * PlayersGrid.spec.tsx — LS-9073 coverage for the cards view's data-source
 * switch (GetAllPlayers -> useCareerStatsWithNames/GetCareerBattingStats).
 * List/Stats view modes are unchanged pre-existing behavior and are covered
 * only by a smoke test confirming they still render from GetAllPlayers.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MockedResponse } from '@apollo/client/testing';
import { PlayersGrid } from './PlayersGrid';
import { GET_ALL_PLAYERS } from './PlayersApi';
import {
  CAREER_BATTING_STATS_QUERY,
  type CareerBattingStatsRaw,
  type CareerStatsQueryParams,
  type CareerStatsQueryResponse,
} from './services/CareerStatsService';
import { MockedProvider } from '../../test-utils/MockedProvider';

const RUTH: CareerBattingStatsRaw = {
  __typename: 'CareerBatting',
  playerId: 1486,
  player: {
    __typename: 'Player',
    id: 1486,
    firstName: 'Babe',
    lastName: 'Ruth',
    brefId: 'ruthba01',
  },
  games: 2503,
  plateAppearances: 10617,
  atBats: 8399,
  runs: 2174,
  hits: 2873,
  doubles: 506,
  triples: 136,
  homeRuns: 714,
  rbi: 2214,
  stolenBases: 123,
  primaryPosition: 'OF',
  positionsPlayed: '{"OF": {"games": 2503}}',
  caughtStealing: 0,
  baseOnBalls: 2062,
  strikeouts: 1330,
  totalBases: 5793,
  groundedIntoDoublePlays: 0,
  hitByPitch: 43,
  sacrificeHits: 113,
  intentionalBaseOnBalls: 0,
  battingAverage: 0.342,
  onBasePercentage: 0.474,
  sluggingPercentage: 0.69,
  fantasyPoints: 13716,
  fantasyPointsPerGame: 5.48,
};

const GEHRIG: CareerBattingStatsRaw = {
  ...RUTH,
  playerId: 1493,
  player: {
    __typename: 'Player',
    id: 1493,
    firstName: 'Lou',
    lastName: 'Gehrig',
    brefId: 'gehrilo01',
  },
  primaryPosition: '1B',
  fantasyPoints: 12000,
};

function cardsPageMock(overrides: {
  after?: string;
  players: CareerBattingStatsRaw[];
  hasNextPage: boolean;
  endCursor: string | null;
}): MockedResponse<CareerStatsQueryResponse, CareerStatsQueryParams> {
  return {
    request: {
      query: CAREER_BATTING_STATS_QUERY,
      variables: {
        first: 50,
        after: overrides.after,
        orderBy: 'lastName',
        orderDirection: 'asc',
        searchTerm: undefined,
      },
    },
    result: {
      data: {
        careerBattingStats: {
          __typename: 'CareerBattingConnection',
          // Per-edge cursors aren't asserted on — only `pageInfo.endCursor`
          // drives the next `after` variable — so a plain per-page index is
          // sufficient and avoids string/number arithmetic on `overrides.after`.
          edges: overrides.players.map((player, index) => ({
            __typename: 'CareerBattingEdge',
            node: player,
            cursor: `cursor-${index}`,
          })),
          pageInfo: {
            __typename: 'PageInfo',
            hasNextPage: overrides.hasNextPage,
            hasPreviousPage: Boolean(overrides.after),
            startCursor: 'cursor-0',
            endCursor: overrides.endCursor,
          },
          totalCount: 2,
        },
      },
    },
  };
}

describe('PlayersGrid — cards view (LS-9073)', () => {
  test('renders cards from the career-stats query with real fpts/position, not GetAllPlayers placeholders', async () => {
    const mock = cardsPageMock({
      players: [RUTH],
      hasNextPage: false,
      endCursor: null,
    });

    render(
      <MockedProvider mocks={[mock]}>
        <PlayersGrid viewMode="cards" />
      </MockedProvider>,
    );

    expect(await screen.findByText('Babe Ruth')).toBeInTheDocument();
    // Real FPTS from the career-stats query — the pre-LS-9073 GetAllPlayers
    // path could only ever render the "—" placeholder here.
    expect(screen.getByText('13,716')).toBeInTheDocument();
    expect(
      screen.getByTestId('player-feed-card-player-1486'),
    ).toBeInTheDocument();
  });

  test('Load More advances the cursor and appends the next page (infinite-scroll pagination preserved)', async () => {
    const firstPage = cardsPageMock({
      players: [RUTH],
      hasNextPage: true,
      endCursor: 'cursor-0',
    });
    const secondPage = cardsPageMock({
      after: 'cursor-0',
      players: [GEHRIG],
      hasNextPage: false,
      endCursor: 'cursor-1',
    });

    render(
      <MockedProvider mocks={[firstPage, secondPage]}>
        <PlayersGrid viewMode="cards" />
      </MockedProvider>,
    );

    expect(await screen.findByText('Babe Ruth')).toBeInTheDocument();
    expect(screen.queryByText('Lou Gehrig')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Load More Players'));

    await waitFor(() => {
      expect(screen.getByText('Lou Gehrig')).toBeInTheDocument();
    });
    // The first page's card stays accumulated, not replaced.
    expect(screen.getByText('Babe Ruth')).toBeInTheDocument();
  });
});

describe('PlayersGrid — list view (unchanged, GetAllPlayers-backed)', () => {
  test('still renders from GetAllPlayers, not the career-stats query', async () => {
    const allPlayersMock: MockedResponse = {
      request: {
        query: GET_ALL_PLAYERS,
        variables: {
          limit: 50,
          offset: 0,
          orderBy: 'name',
          orderDirection: 'asc',
        },
      },
      result: {
        data: {
          players: [
            {
              __typename: 'Player',
              id: 1486,
              firstName: 'Babe',
              lastName: 'Ruth',
              brefId: 'ruthba01',
              statsLastFetchedAt: null,
              careerBatting: {
                __typename: 'CareerBatting',
                battingAverage: 0.342,
                homeRuns: 714,
                runs: 2174,
                rbi: 2214,
                stolenBases: 123,
              },
            },
          ],
        },
      },
    };

    render(
      <MockedProvider mocks={[allPlayersMock]}>
        <PlayersGrid viewMode="list" />
      </MockedProvider>,
    );

    expect(await screen.findByText(/Babe Ruth/)).toBeInTheDocument();
  });
});

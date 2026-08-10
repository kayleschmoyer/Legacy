/**
 * PlayersScreen.render.spec.tsx — LS-9074 coverage for the viewport-driven
 * default view mode. Mirrors the `(useMedia as jest.Mock).mockReturnValue`
 * override pattern from HomeScreen.spec.tsx / LeagueDetailShell.spec.tsx.
 *
 * `useMedia` is stubbed to `jest.fn(() => ({}))` by the package-wide
 * `tamagui` mock in jest-setup-web.js — every breakpoint false, i.e. the
 * "desktop" base tier — by default. This suite resets it explicitly in
 * `beforeEach` so the narrow-viewport tests can override it without leaking
 * into the wide-viewport tests (same convention as HomeScreen.spec.tsx).
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMedia } from 'tamagui';
import type { MockedResponse } from '@apollo/client/testing';
import { PlayersScreen } from './PlayersScreen';
import { GET_ALL_PLAYERS } from './PlayersApi';
import { CAREER_BATTING_STATS_QUERY } from './services/CareerStatsService';
import { MockedProvider } from '../../test-utils/MockedProvider';
import { Platform } from '../../platform-components';

const RUTH_ALL_PLAYERS = {
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
} as const;

function peekMock(): MockedResponse {
  return {
    request: {
      query: GET_ALL_PLAYERS,
      variables: {
        limit: 1,
        offset: 0,
        orderBy: 'name',
        orderDirection: 'asc',
      },
    },
    result: { data: { players: [RUTH_ALL_PLAYERS] } },
  };
}

function statsGridMock(): MockedResponse {
  return {
    request: {
      query: GET_ALL_PLAYERS,
      variables: {
        limit: 50,
        offset: 0,
        orderBy: 'name',
        orderDirection: 'asc',
      },
    },
    result: { data: { players: [RUTH_ALL_PLAYERS] } },
  };
}

function cardsGridMock(): MockedResponse {
  return {
    request: {
      query: CAREER_BATTING_STATS_QUERY,
      variables: {
        first: 50,
        after: undefined,
        orderBy: 'lastName',
        orderDirection: 'asc',
        searchTerm: undefined,
      },
    },
    result: {
      data: {
        careerBattingStats: {
          __typename: 'CareerBattingConnection',
          edges: [
            {
              __typename: 'CareerBattingEdge',
              node: {
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
              },
              cursor: 'cursor-0',
            },
          ],
          pageInfo: {
            __typename: 'PageInfo',
            hasNextPage: false,
            hasPreviousPage: false,
            startCursor: 'cursor-0',
            endCursor: 'cursor-0',
          },
          totalCount: 1,
        },
      },
    },
  };
}

function tabSelected(testId: string): boolean {
  const tab = screen.getByTestId(testId).closest('[role="tab"]');
  return tab?.getAttribute('aria-selected') === 'true';
}

describe('PlayersScreen — viewport-driven default view mode (LS-9074)', () => {
  const originalSearch = window.location.search;

  beforeEach(() => {
    jest.clearAllMocks();
    window.history.replaceState(null, '', `${window.location.pathname}`);
  });

  afterEach(() => {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${originalSearch}`,
    );
  });

  describe('base tier (unmocked useMedia — desktop)', () => {
    beforeEach(() => {
      (useMedia as jest.Mock).mockReturnValue({});
    });

    it('AC1/AC3 — defaults to the stats table, matching the base-tier convention existing specs rely on', async () => {
      render(
        <MockedProvider mocks={[peekMock(), statsGridMock()]}>
          <PlayersScreen />
        </MockedProvider>,
      );

      await screen.findAllByText(/Babe Ruth/);

      expect(tabSelected('players-view-stats')).toBe(true);
      expect(tabSelected('players-view-cards')).toBe(false);
      expect(tabSelected('players-view-list')).toBe(false);
    });
  });

  describe('narrow viewport ($sm override)', () => {
    beforeEach(() => {
      (useMedia as jest.Mock).mockReturnValue({ sm: true });
    });

    it('AC1/AC4 — defaults to cards via the useMedia narrow-viewport override', async () => {
      render(
        <MockedProvider mocks={[peekMock(), cardsGridMock()]}>
          <PlayersScreen />
        </MockedProvider>,
      );

      await screen.findByTestId('player-feed-card-player-1486');

      expect(tabSelected('players-view-cards')).toBe(true);
      expect(tabSelected('players-view-stats')).toBe(false);
    });
  });

  describe('manual toggle (AC2 — overrides the default and persists via ?view=)', () => {
    beforeEach(() => {
      (useMedia as jest.Mock).mockReturnValue({});
    });

    it('switching away from the viewport default writes an explicit ?view= param', async () => {
      render(
        <MockedProvider mocks={[peekMock(), statsGridMock(), cardsGridMock()]}>
          <PlayersScreen />
        </MockedProvider>,
      );

      await screen.findAllByText(/Babe Ruth/);
      expect(tabSelected('players-view-stats')).toBe(true);

      fireEvent.click(screen.getByTestId('players-view-cards'));

      await screen.findByTestId('player-feed-card-player-1486');
      expect(tabSelected('players-view-cards')).toBe(true);

      // URL persistence is a web-only contract (native doesn't read the
      // URL) — diverges from the current (desktop) viewport default of
      // 'stats', so the override must persist explicitly for refresh/back-nav.
      if (Platform.OS === 'web') {
        expect(window.location.search).toBe('?view=cards');
      }
    });
  });

  describe('AC5 — switching between list and stats does not refetch', () => {
    beforeEach(() => {
      (useMedia as jest.Mock).mockReturnValue({});
    });

    it('reuses the already-fetched GetAllPlayers data when toggling stats -> list', async () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => undefined);

      // A single-use MockedResponse: if toggling views issued a second
      // network request for the same operation, Apollo would have nothing
      // left to resolve it with and surface an error.
      render(
        <MockedProvider mocks={[peekMock(), statsGridMock()]}>
          <PlayersScreen />
        </MockedProvider>,
      );

      await screen.findAllByText(/Babe Ruth/);
      expect(tabSelected('players-view-stats')).toBe(true);

      fireEvent.click(screen.getByTestId('players-view-list'));

      await waitFor(() => expect(tabSelected('players-view-list')).toBe(true));
      expect(screen.getAllByText(/Babe Ruth/).length).toBeGreaterThan(0);

      const noMoreResponsesError = consoleError.mock.calls.some((call) =>
        String(call[0]).includes('No more mocked responses'),
      );
      expect(noMoreResponsesError).toBe(false);

      consoleError.mockRestore();
    });
  });
});

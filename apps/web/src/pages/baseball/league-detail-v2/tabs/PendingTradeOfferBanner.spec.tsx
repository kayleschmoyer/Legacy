/**
 * Tests for PendingTradeOfferBanner (LS-4676).
 *
 * Covers:
 *   1. No render when there are no incoming pending trade offers (AC2).
 *   2. No render when only outgoing offers exist (the banner is incoming-only).
 *   3. Banner renders with proposing team name and offered/requested player
 *      names for each incoming offer.
 *   4. Review button navigates to the league's trades tab (AC3 part 1).
 *   5. Decline button calls rejectTrade with the correct trade id (AC3 part 2).
 *   6. Decline failure is routed through LOGGER.error with the Error instance
 *      as the first non-message argument (regression guard for the bot
 *      finding on LS-4676 Cycle 1).
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-unsafe-return -- jest.mock factories return any */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need runtime require */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { PendingTradeOfferBanner } from './PendingTradeOfferBanner';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]) => {
      mockLoggerError(...args);
    },
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockRefetch = jest.fn();
const mockRejectTrade = jest.fn();
let mockTradeOffers: ReadonlyArray<Record<string, unknown>> = [];

jest.mock('../../../../api/db/graphql.generated', () => ({
  useGetTeamTradeOffersQuery: jest.fn(() => ({
    data: { teamTradeOffers: mockTradeOffers },
    refetch: mockRefetch,
  })),
  useRejectTradeMutation: jest.fn(() => [mockRejectTrade, { loading: false }]),
}));

const MY_TEAM_ID = 42;
const OTHER_TEAM_ID = 99;
const LEAGUE_ID = 7;

const makeIncomingOffer = (overrides: Record<string, unknown> = {}) => ({
  id: 1001,
  leagueId: LEAGUE_ID,
  proposingTeamId: OTHER_TEAM_ID,
  receivingTeamId: MY_TEAM_ID,
  status: 'pending',
  proposingTeamName: 'Dead Ball Legends',
  receivingTeamName: 'My Team',
  players: [
    {
      id: 1,
      playerId: 11,
      fromTeamId: OTHER_TEAM_ID,
      playerName: 'Walter Johnson',
      playerPosition: 'P',
    },
    {
      id: 2,
      playerId: 12,
      fromTeamId: MY_TEAM_ID,
      playerName: 'Randy Johnson',
      playerPosition: 'P',
    },
  ],
  ...overrides,
});

beforeEach(() => {
  mockNavigate.mockReset();
  mockRefetch.mockReset();
  mockRejectTrade.mockReset();
  mockLoggerError.mockReset();
  mockTradeOffers = [];
});

describe('PendingTradeOfferBanner', () => {
  it('renders nothing when there are no incoming pending offers (AC2)', () => {
    mockTradeOffers = [];
    const { container } = render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when only outgoing offers exist (incoming-only filter)', () => {
    mockTradeOffers = [
      makeIncomingOffer({
        proposingTeamId: MY_TEAM_ID,
        receivingTeamId: OTHER_TEAM_ID,
      }),
    ];
    const { container } = render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the banner with proposing team and player names for an incoming offer', () => {
    mockTradeOffers = [makeIncomingOffer()];
    render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );

    expect(
      screen.getByText('Pending Trade Offer from Dead Ball Legends'),
    ).toBeInTheDocument();
    // Offered (from proposing team) and requested (from receiving team)
    // player names are rendered in the sub line.
    expect(screen.getByText(/Walter Johnson/)).toBeInTheDocument();
    expect(screen.getByText(/Randy Johnson/)).toBeInTheDocument();
  });

  it('Review navigates to the league trades tab (AC3)', () => {
    mockTradeOffers = [makeIncomingOffer()];
    render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Review/i }));
    expect(mockNavigate).toHaveBeenCalledWith(
      `/baseball/league/${LEAGUE_ID}/trades`,
    );
  });

  it('Decline calls rejectTrade with the trade id (AC3)', async () => {
    mockTradeOffers = [makeIncomingOffer({ id: 2002 })];
    mockRejectTrade.mockResolvedValueOnce({ data: {} });
    render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Decline/i }));
    await waitFor(() => {
      expect(mockRejectTrade).toHaveBeenCalledWith({
        variables: { tradeId: 2002 },
      });
    });
    await waitFor(() => {
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  it('logs decline failures with the Error instance as the first non-message arg', async () => {
    mockTradeOffers = [makeIncomingOffer({ id: 3003 })];
    const declineError = new Error('network down');
    mockRejectTrade.mockRejectedValueOnce(declineError);
    render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Decline/i }));
    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalledTimes(1);
    });
    const args = mockLoggerError.mock.calls[0];
    expect(args[0]).toBe('Failed to decline trade offer');
    // Critical: the Error instance must be the second arg (not wrapped in
    // an object) so Rollbar / LogArgs can extract the stack trace.
    expect(args[1]).toBeInstanceOf(Error);
    expect((args[1] as Error).message).toBe('network down');
    expect(args[2]).toEqual({ tradeId: 3003, leagueId: LEAGUE_ID });
  });

  it('renders one banner per incoming offer when several exist', () => {
    mockTradeOffers = [
      makeIncomingOffer({ id: 1, proposingTeamName: 'Team A' }),
      makeIncomingOffer({ id: 2, proposingTeamName: 'Team B' }),
    ];
    render(
      <PendingTradeOfferBanner leagueId={LEAGUE_ID} myTeamId={MY_TEAM_ID} />,
    );
    expect(
      screen.getByText('Pending Trade Offer from Team A'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Pending Trade Offer from Team B'),
    ).toBeInTheDocument();
  });
});

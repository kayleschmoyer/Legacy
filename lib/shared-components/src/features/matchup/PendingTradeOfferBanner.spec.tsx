/**
 * Tests for the shared PendingTradeOfferBanner (LS-7817).
 *
 * Covers:
 *   1. No render when there are no incoming pending trade offers.
 *   2. No render when only outgoing offers exist (the banner is incoming-only).
 *   3. Banner renders with proposing team name and offered/requested player
 *      names for each incoming offer.
 *   4. Review delegates to the `onReview` callback with the trade id.
 *   5. Decline calls rejectTrade with the correct trade id and refetches.
 *   6. Decline failure is routed through LOGGER.error with the Error instance
 *      as the first non-message argument (so Rollbar / LogArgs can extract the
 *      stack trace).
 *   7. One banner renders per incoming offer.
 */
import React from 'react';
import { PendingTradeOfferBanner } from './PendingTradeOfferBanner';
import { fireEvent, render, waitFor } from '../../test-utils';
import type { TradeOffer } from '../../api/db/graphql.generated';

const mockRefetch = jest.fn().mockResolvedValue({});
const mockRejectTrade = jest.fn();

let mockTradeOffers: TradeOffer[] = [];

jest.mock('../../api/db/graphql.generated', () => ({
  useGetTeamTradeOffersQuery: jest.fn(() => ({
    data: { teamTradeOffers: mockTradeOffers },
    refetch: mockRefetch,
  })),
  useRejectTradeMutation: () => [mockRejectTrade, { loading: false }],
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

const MY_TEAM_ID = 42;
const OTHER_TEAM_ID = 99;

function makeIncomingOffer(
  overrides: Partial<TradeOffer> & { id: number },
): TradeOffer {
  return {
    __typename: 'TradeOffer',
    leagueId: 7,
    proposingTeamId: OTHER_TEAM_ID,
    receivingTeamId: MY_TEAM_ID,
    proposingTeamName: 'Dead Ball Legends',
    receivingTeamName: 'My Team',
    status: 'pending',
    message: null,
    expiresAt: null,
    respondedAt: null,
    vetoedAt: null,
    createdAt: '2026-03-18T14:30:00Z',
    updatedAt: '2026-03-18T14:30:00Z',
    players: [
      {
        __typename: 'TradeOfferPlayer' as const,
        id: 1,
        tradeOfferId: overrides.id,
        playerId: 11,
        fromTeamId: OTHER_TEAM_ID,
        playerName: 'Walter Johnson',
        playerPosition: 'P',
      },
      {
        __typename: 'TradeOfferPlayer' as const,
        id: 2,
        tradeOfferId: overrides.id,
        playerId: 12,
        fromTeamId: MY_TEAM_ID,
        playerName: 'Randy Johnson',
        playerPosition: 'P',
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTradeOffers = [];
});

describe('PendingTradeOfferBanner', () => {
  it('renders nothing when there are no incoming pending offers', () => {
    mockTradeOffers = [];
    const { container } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={jest.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing when only outgoing offers exist (incoming-only filter)', () => {
    mockTradeOffers = [
      makeIncomingOffer({
        id: 1,
        proposingTeamId: MY_TEAM_ID,
        receivingTeamId: OTHER_TEAM_ID,
      }),
    ];
    const { container } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={jest.fn()} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders the banner with proposing team and player names', () => {
    mockTradeOffers = [makeIncomingOffer({ id: 1001 })];
    const { getByText } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={jest.fn()} />,
    );

    expect(
      getByText('Pending Trade Offer from Dead Ball Legends'),
    ).toBeTruthy();
    expect(getByText(/Walter Johnson/)).toBeTruthy();
    expect(getByText(/Randy Johnson/)).toBeTruthy();
  });

  it('Review delegates to onReview with the trade id', () => {
    mockTradeOffers = [makeIncomingOffer({ id: 1234 })];
    const onReview = jest.fn();
    const { getByText } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={onReview} />,
    );

    fireEvent.click(getByText('Review'));
    expect(onReview).toHaveBeenCalledWith(1234);
  });

  it('Decline calls rejectTrade with the trade id and refetches', async () => {
    mockTradeOffers = [makeIncomingOffer({ id: 2002 })];
    mockRejectTrade.mockResolvedValueOnce({ data: {} });
    const { getByText } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={jest.fn()} />,
    );

    fireEvent.click(getByText('Decline'));
    await waitFor(() => {
      expect(mockRejectTrade).toHaveBeenCalledWith({
        variables: { tradeId: 2002 },
      });
    });
    await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
  });

  it('logs decline failures with the Error instance as the first non-message arg', async () => {
    mockTradeOffers = [makeIncomingOffer({ id: 3003 })];
    const declineError = new Error('network down');
    mockRejectTrade.mockRejectedValueOnce(declineError);
    const { getByText } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={jest.fn()} />,
    );

    fireEvent.click(getByText('Decline'));
    await waitFor(() => expect(mockLoggerError).toHaveBeenCalledTimes(1));

    const args = mockLoggerError.mock.calls[0] as unknown[];
    expect(args[0]).toBe('Failed to decline trade offer');
    expect(args[1]).toBeInstanceOf(Error);
    expect((args[1] as Error).message).toBe('network down');
    expect(args[2]).toEqual({ tradeId: 3003 });
  });

  it('renders one banner per incoming offer when several exist', () => {
    mockTradeOffers = [
      makeIncomingOffer({ id: 1, proposingTeamName: 'Team A' }),
      makeIncomingOffer({ id: 2, proposingTeamName: 'Team B' }),
    ];
    const { getByText } = render(
      <PendingTradeOfferBanner teamId={MY_TEAM_ID} onReview={jest.fn()} />,
    );
    expect(getByText('Pending Trade Offer from Team A')).toBeTruthy();
    expect(getByText('Pending Trade Offer from Team B')).toBeTruthy();
  });
});

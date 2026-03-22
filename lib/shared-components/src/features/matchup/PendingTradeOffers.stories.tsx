import type { ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { MockedProvider } from '@apollo/client/testing/react';
import type { MockedResponse } from '@apollo/client/testing';
import { PendingTradeOffers } from './PendingTradeOffers';
import {
  AcceptTrade,
  CancelTrade,
  GetTeamTradeOffers,
  type GetTeamTradeOffersQuery,
  RejectTrade,
} from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

type TradeOffer = NonNullable<
  GetTeamTradeOffersQuery['teamTradeOffers']
>[number];

const TEAM_ID = 1;

function makeOffer(
  overrides: Partial<TradeOffer> & { id: number },
): TradeOffer {
  return {
    __typename: 'TradeOffer',
    leagueId: 10,
    proposingTeamId: 2,
    receivingTeamId: TEAM_ID,
    proposingTeamName: 'Sluggers',
    receivingTeamName: 'Home Runners',
    status: 'pending',
    message: null,
    expiresAt: null,
    respondedAt: null,
    vetoedAt: null,
    createdAt: '2026-03-18T14:30:00Z',
    updatedAt: '2026-03-18T14:30:00Z',
    players: [],
    ...overrides,
  };
}

const incomingOffer: TradeOffer = makeOffer({
  id: 101,
  proposingTeamId: 2,
  receivingTeamId: TEAM_ID,
  proposingTeamName: 'Sluggers',
  receivingTeamName: 'Home Runners',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 1,
      tradeOfferId: 101,
      playerId: 100,
      fromTeamId: 2,
      playerName: 'Mike Trout',
      playerPosition: 'CF',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 2,
      tradeOfferId: 101,
      playerId: 200,
      fromTeamId: TEAM_ID,
      playerName: 'Mookie Betts',
      playerPosition: 'RF',
    },
  ],
});

const outgoingOffer: TradeOffer = makeOffer({
  id: 102,
  proposingTeamId: TEAM_ID,
  receivingTeamId: 3,
  proposingTeamName: 'Home Runners',
  receivingTeamName: 'Diamond Backs',
  createdAt: '2026-03-17T10:00:00Z',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 3,
      tradeOfferId: 102,
      playerId: 300,
      fromTeamId: TEAM_ID,
      playerName: 'Aaron Judge',
      playerPosition: 'RF',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 4,
      tradeOfferId: 102,
      playerId: 400,
      fromTeamId: 3,
      playerName: 'Shohei Ohtani',
      playerPosition: 'DH',
    },
  ],
});

const offerWithMessage: TradeOffer = makeOffer({
  id: 103,
  proposingTeamId: 4,
  receivingTeamId: TEAM_ID,
  proposingTeamName: 'Grand Slams',
  receivingTeamName: 'Home Runners',
  message: 'This is a fair deal — both teams get stronger at key positions!',
  players: [
    {
      __typename: 'TradeOfferPlayer',
      id: 5,
      tradeOfferId: 103,
      playerId: 500,
      fromTeamId: 4,
      playerName: 'Freddie Freeman',
      playerPosition: '1B',
    },
    {
      __typename: 'TradeOfferPlayer',
      id: 6,
      tradeOfferId: 103,
      playerId: 600,
      fromTeamId: TEAM_ID,
      playerName: 'Ronald Acuna Jr',
      playerPosition: 'CF',
    },
  ],
});

// ---------------------------------------------------------------------------
// Helpers to build MockedProvider mocks
// ---------------------------------------------------------------------------

const tradeOfferResult = (offer: TradeOffer) => ({
  __typename: 'TradeOffer' as const,
  id: offer.id,
  leagueId: offer.leagueId,
  proposingTeamId: offer.proposingTeamId,
  receivingTeamId: offer.receivingTeamId,
  status: 'accepted',
  message: offer.message,
  expiresAt: offer.expiresAt,
  respondedAt: new Date().toISOString(),
  vetoedAt: null,
  createdAt: offer.createdAt,
  updatedAt: new Date().toISOString(),
  proposingTeamName: offer.proposingTeamName,
  receivingTeamName: offer.receivingTeamName,
  players: offer.players,
});

function buildQueryMock(offers: TradeOffer[]): MockedResponse {
  return {
    request: {
      query: GetTeamTradeOffers,
      variables: { teamId: TEAM_ID, status: 'pending' },
    },
    result: {
      data: { teamTradeOffers: offers },
    },
  };
}

function buildMutationMocks(offers: TradeOffer[]): MockedResponse[] {
  return offers.flatMap((offer) => [
    {
      request: { query: AcceptTrade, variables: { tradeId: offer.id } },
      result: { data: { acceptTrade: tradeOfferResult(offer) } },
    },
    {
      request: { query: RejectTrade, variables: { tradeId: offer.id } },
      result: {
        data: {
          rejectTrade: { ...tradeOfferResult(offer), status: 'rejected' },
        },
      },
    },
    {
      request: { query: CancelTrade, variables: { tradeId: offer.id } },
      result: {
        data: {
          cancelTrade: { ...tradeOfferResult(offer), status: 'cancelled' },
        },
      },
    },
  ]);
}

function withMocks(offers: TradeOffer[]) {
  const mocks: MockedResponse[] = [
    buildQueryMock(offers),
    // Refetch mock (MockedProvider consumes each mock once)
    buildQueryMock(offers),
    ...buildMutationMocks(offers),
  ];

  return (Story: ComponentType) => (
    <MockedProvider mocks={mocks}>
      <Story />
    </MockedProvider>
  );
}

// ---------------------------------------------------------------------------
// Meta
// ---------------------------------------------------------------------------

const meta: Meta<typeof PendingTradeOffers> = {
  title: 'Features/Matchup/PendingTradeOffers',
  component: PendingTradeOffers,
  parameters: {
    docs: {
      description: {
        component:
          'Compact trade-offer summary showing incoming offers (Accept / Decline) and outgoing offers (Cancel). Filters by teamId and supports real-time refetching.',
      },
    },
  },
  tags: ['autodocs'],
  args: {
    teamId: TEAM_ID,
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

// ---------------------------------------------------------------------------
// Stories
// ---------------------------------------------------------------------------

export const IncomingOffers: Story = {
  decorators: [withMocks([incomingOffer])],
};

export const OutgoingOffers: Story = {
  decorators: [withMocks([outgoingOffer])],
};

export const MixedOffers: Story = {
  decorators: [withMocks([incomingOffer, outgoingOffer])],
};

export const WithMessage: Story = {
  decorators: [withMocks([offerWithMessage])],
};

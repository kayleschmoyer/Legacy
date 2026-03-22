import { PendingTradeOffers } from './PendingTradeOffers';
import { fireEvent, render, waitFor } from '../../test-utils';
import type { TradeOffer } from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Mock the GraphQL hooks
// ---------------------------------------------------------------------------

const mockRefetch = jest.fn().mockResolvedValue({});
const mockAcceptTrade = jest.fn().mockResolvedValue({});
const mockRejectTrade = jest.fn().mockResolvedValue({});
const mockCancelTrade = jest.fn().mockResolvedValue({});

let mockQueryReturn: {
  data: { teamTradeOffers: TradeOffer[] } | undefined;
  loading: boolean;
  refetch: jest.Mock;
};

jest.mock('../../api/db/graphql.generated', () => ({
  useGetTeamTradeOffersQuery: jest.fn(() => mockQueryReturn),
  useAcceptTradeMutation: () => [mockAcceptTrade],
  useRejectTradeMutation: () => [mockRejectTrade],
  useCancelTradeMutation: () => [mockCancelTrade],
}));

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

const incomingOffer = makeOffer({
  id: 101,
  proposingTeamId: 2,
  receivingTeamId: TEAM_ID,
  proposingTeamName: 'Sluggers',
  receivingTeamName: 'Home Runners',
  players: [
    {
      __typename: 'TradeOfferPlayer' as const,
      id: 1,
      tradeOfferId: 101,
      playerId: 100,
      fromTeamId: 2,
      playerName: 'Mike Trout',
      playerPosition: 'CF',
    },
    {
      __typename: 'TradeOfferPlayer' as const,
      id: 2,
      tradeOfferId: 101,
      playerId: 200,
      fromTeamId: TEAM_ID,
      playerName: 'Mookie Betts',
      playerPosition: 'RF',
    },
  ],
});

const outgoingOffer = makeOffer({
  id: 102,
  proposingTeamId: TEAM_ID,
  receivingTeamId: 3,
  proposingTeamName: 'Home Runners',
  receivingTeamName: 'Diamond Backs',
  players: [
    {
      __typename: 'TradeOfferPlayer' as const,
      id: 3,
      tradeOfferId: 102,
      playerId: 300,
      fromTeamId: TEAM_ID,
      playerName: 'Aaron Judge',
      playerPosition: 'RF',
    },
    {
      __typename: 'TradeOfferPlayer' as const,
      id: 4,
      tradeOfferId: 102,
      playerId: 400,
      fromTeamId: 3,
      playerName: 'Shohei Ohtani',
      playerPosition: 'DH',
    },
  ],
});

const offerWithMessage = makeOffer({
  id: 103,
  proposingTeamId: 4,
  receivingTeamId: TEAM_ID,
  proposingTeamName: 'Grand Slams',
  receivingTeamName: 'Home Runners',
  message: 'Fair deal for both sides!',
  players: [
    {
      __typename: 'TradeOfferPlayer' as const,
      id: 5,
      tradeOfferId: 103,
      playerId: 500,
      fromTeamId: 4,
      playerName: 'Freddie Freeman',
      playerPosition: '1B',
    },
    {
      __typename: 'TradeOfferPlayer' as const,
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
// Helpers
// ---------------------------------------------------------------------------

function setOffers(offers: TradeOffer[]) {
  mockQueryReturn = {
    data: { teamTradeOffers: offers },
    loading: false,
    refetch: mockRefetch,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PendingTradeOffers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders nothing when there are no offers', () => {
    setOffers([]);
    const { container } = render(<PendingTradeOffers teamId={TEAM_ID} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing while loading with no data', () => {
    mockQueryReturn = {
      data: undefined,
      loading: true,
      refetch: mockRefetch,
    };
    const { container } = render(<PendingTradeOffers teamId={TEAM_ID} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows "Pending Trades" header with count', () => {
    setOffers([incomingOffer, outgoingOffer]);
    const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

    expect(getByText('Pending Trades')).toBeTruthy();
    expect(getByText('2')).toBeTruthy();
  });

  describe('incoming offers', () => {
    it('renders incoming section with counterpart team name', () => {
      setOffers([incomingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('Incoming (1)')).toBeTruthy();
      expect(getByText('From: Sluggers')).toBeTruthy();
    });

    it('shows offered and requested players', () => {
      setOffers([incomingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('They offer')).toBeTruthy();
      expect(getByText('Mike Trout')).toBeTruthy();
      expect(getByText('They want')).toBeTruthy();
      expect(getByText('Mookie Betts')).toBeTruthy();
    });

    it('renders Accept and Decline buttons', () => {
      setOffers([incomingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('Accept')).toBeTruthy();
      expect(getByText('Decline')).toBeTruthy();
    });

    it('calls acceptTrade and refetches when Accept is pressed', async () => {
      setOffers([incomingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      fireEvent.click(getByText('Accept'));
      expect(mockAcceptTrade).toHaveBeenCalledWith({
        variables: { tradeId: 101 },
      });

      // After the mutation resolves, refetch should be called to update the list
      await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });

    it('calls rejectTrade and refetches when Decline is pressed', async () => {
      setOffers([incomingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      fireEvent.click(getByText('Decline'));
      expect(mockRejectTrade).toHaveBeenCalledWith({
        variables: { tradeId: 101 },
      });

      // After the mutation resolves, refetch should be called to update the list
      await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });
  });

  describe('outgoing offers', () => {
    it('renders outgoing section with counterpart team name', () => {
      setOffers([outgoingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('Outgoing (1)')).toBeTruthy();
      expect(getByText('To: Diamond Backs')).toBeTruthy();
    });

    it('shows offered and requested players with outgoing labels', () => {
      setOffers([outgoingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('You offer')).toBeTruthy();
      expect(getByText('Aaron Judge')).toBeTruthy();
      expect(getByText('You want')).toBeTruthy();
      expect(getByText('Shohei Ohtani')).toBeTruthy();
    });

    it('renders Cancel button', () => {
      setOffers([outgoingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('Cancel')).toBeTruthy();
    });

    it('calls cancelTrade and refetches when Cancel is pressed', async () => {
      setOffers([outgoingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      fireEvent.click(getByText('Cancel'));
      expect(mockCancelTrade).toHaveBeenCalledWith({
        variables: { tradeId: 102 },
      });

      // After the mutation resolves, refetch should be called to update the list
      await waitFor(() => expect(mockRefetch).toHaveBeenCalled());
    });
  });

  describe('mixed offers', () => {
    it('filters offers correctly into incoming and outgoing sections', () => {
      setOffers([incomingOffer, outgoingOffer]);
      const { getByText } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      expect(getByText('Incoming (1)')).toBeTruthy();
      expect(getByText('Outgoing (1)')).toBeTruthy();
    });
  });

  describe('error handling', () => {
    it('shows error banner when accept mutation fails', async () => {
      mockAcceptTrade.mockRejectedValueOnce(new Error('Network error'));
      setOffers([incomingOffer]);
      const { getByText, findByText } = render(
        <PendingTradeOffers teamId={TEAM_ID} />,
      );

      fireEvent.click(getByText('Accept'));

      expect(
        await findByText('Failed to accept trade. Please try again.'),
      ).toBeTruthy();
    });

    it('shows error banner when reject mutation fails', async () => {
      mockRejectTrade.mockRejectedValueOnce(new Error('Network error'));
      setOffers([incomingOffer]);
      const { getByText, findByText } = render(
        <PendingTradeOffers teamId={TEAM_ID} />,
      );

      fireEvent.click(getByText('Decline'));

      expect(
        await findByText('Failed to decline trade. Please try again.'),
      ).toBeTruthy();
    });

    it('shows error banner when cancel mutation fails', async () => {
      mockCancelTrade.mockRejectedValueOnce(new Error('Network error'));
      setOffers([outgoingOffer]);
      const { getByText, findByText } = render(
        <PendingTradeOffers teamId={TEAM_ID} />,
      );

      fireEvent.click(getByText('Cancel'));

      expect(
        await findByText('Failed to cancel trade. Please try again.'),
      ).toBeTruthy();
    });
  });

  describe('offer with message', () => {
    it('renders the message text', () => {
      setOffers([offerWithMessage]);
      const { container } = render(<PendingTradeOffers teamId={TEAM_ID} />);

      // The component wraps the message in smart quotes via &ldquo;/&rdquo;
      const messageText = container.textContent;
      expect(messageText).toContain('Fair deal for both sides!');
    });
  });
});

import React from 'react';
import { TradingCenter } from './TradingCenter';
import { fireEvent, render, waitFor } from '../../test-utils';
import type {
  GetLeagueTradeOffersQuery,
  GetTeamMembersQuery,
  GetTeamTradeOffersQuery,
  TradeOffer,
} from '../../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// Mutable state for GraphQL hook mocks (set per-test)
// ---------------------------------------------------------------------------

let mockPendingReturn: {
  data: GetTeamTradeOffersQuery | undefined;
  loading: boolean;
  refetch: jest.Mock;
};

let mockLeagueTradesReturn: {
  data: GetLeagueTradeOffersQuery | undefined;
  loading: boolean;
  refetch: jest.Mock;
} = {
  data: undefined,
  loading: false,
  refetch: jest.fn(),
};

let mockProposerRosterReturn: {
  data: GetTeamMembersQuery | undefined;
  error?: Error;
};

let mockTradeBlockReturn: {
  data: { leagueTradeBlock: object[] } | undefined;
  loading: boolean;
  error: Error | undefined;
};

const mockLoadProposerRoster = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue({});

jest.mock('../../api/db/graphql.generated', () => ({
  useGetLeagueByIdQuery: () => ({ data: undefined }),
  useGetTeamTradeOffersQuery: jest.fn(() => mockPendingReturn),
  useGetLeagueTradeOffersQuery: jest.fn(() => mockLeagueTradesReturn),
  useGetLeagueTeamsQuery: () => ({ data: undefined }),
  useGetTeamMembersLazyQuery: jest.fn(() => [
    mockLoadProposerRoster,
    mockProposerRosterReturn,
  ]),
  useAcceptTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useRejectTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useCancelTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useVetoTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useProposeTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useGetLeagueTradeBlockQuery: jest.fn(() => mockTradeBlockReturn),
  useSetTradeBlockMutation: () => [
    jest.fn().mockResolvedValue({}),
    { loading: false },
  ],
  GetTeamTradeOffers: 'GetTeamTradeOffers',
  GetLeagueTradeOffers: 'GetLeagueTradeOffers',
  TradeOfferFragment: 'TradeOfferFragment',
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER_TEAM_ID = 1;
const PROPOSING_TEAM_ID = 2;
const LEAGUE_ID = 10;

function makeOffer(
  overrides: Partial<TradeOffer> & { id: number },
): TradeOffer {
  return {
    __typename: 'TradeOffer',
    leagueId: LEAGUE_ID,
    proposingTeamId: PROPOSING_TEAM_ID,
    receivingTeamId: USER_TEAM_ID,
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
  players: [
    {
      __typename: 'TradeOfferPlayer' as const,
      id: 1,
      tradeOfferId: 101,
      playerId: 100,
      fromTeamId: PROPOSING_TEAM_ID,
      playerName: 'Mike Trout',
      playerPosition: 'CF',
    },
  ],
});

function setPendingOffers(offers: TradeOffer[]) {
  mockPendingReturn = {
    data: { teamTradeOffers: offers },
    loading: false,
    refetch: mockRefetch,
  };
}

function setProposerRoster(playerIds: number[]) {
  mockProposerRosterReturn = {
    data: {
      teamMembers: playerIds.map((id) => ({
        __typename: 'TeamMember' as const,
        id,
        playerId: id,
        positionId: 1,
        teamId: PROPOSING_TEAM_ID,
        leagueId: LEAGUE_ID,
        onTradeBlock: false,
        player: null,
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TradingCenter — LeagueTradeBlock integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProposerRosterReturn = { data: undefined };
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
  });

  it('renders the Trade Block section label', async () => {
    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByText('Trade Block')).toBeTruthy();
  });

  it('renders trade block players when the query returns data', async () => {
    mockTradeBlockReturn = {
      data: {
        leagueTradeBlock: [
          {
            __typename: 'TeamMember',
            id: 1,
            teamId: 2,
            playerId: 101,
            onTradeBlock: true,
            askingPrice: null,
            player: {
              __typename: 'Player',
              firstName: 'Jake',
              lastName: 'Smith',
            },
          },
        ],
      },
      loading: false,
      error: undefined,
    };

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByText('Jake Smith')).toBeTruthy();
  });

  it('shows the empty state when trade block has no players', async () => {
    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByText(/no players on the trade block/i)).toBeTruthy();
  });
});

describe('TradingCenter — PremiumTradeTools integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProposerRosterReturn = { data: undefined };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
  });

  it('renders the Premium Trade Tools section', async () => {
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByText('Premium Trade Tools')).toBeTruthy();
  });

  it('expands to show Trade Analyzer and Value Calculator tabs', async () => {
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };

    const { findByText, getByText } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        isPremium
      />,
    );

    const header = await findByText('Premium Trade Tools');
    header.click();

    expect(await findByText('Trade Analyzer')).toBeTruthy();
    expect(getByText('Value Calculator')).toBeTruthy();
  });

  it('shows empty state in Trade Analyzer when there are no pending trades', async () => {
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };

    const { findByText } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        isPremium
      />,
    );

    const header = await findByText('Premium Trade Tools');
    header.click();

    expect(
      await findByText(/no pending trade offers to analyze/i),
    ).toBeTruthy();
  });

  it('lists pending trade offers in the Trade Analyzer', async () => {
    mockPendingReturn = {
      data: { teamTradeOffers: [incomingOffer] },
      loading: false,
      refetch: mockRefetch,
    };

    const { findByText } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        isPremium
      />,
    );

    const header = await findByText('Premium Trade Tools');
    header.click();

    expect(await findByText('Sluggers')).toBeTruthy();
  });

  it('shows the Value Calculator with baseball positions when that tab is selected', async () => {
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };

    const { findByText } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        isPremium
      />,
    );

    const header = await findByText('Premium Trade Tools');
    header.click();

    const calcTab = await findByText('Value Calculator');
    calcTab.click();

    expect(await findByText('Starting Pitcher')).toBeTruthy();
  });
});

describe('TradingCenter — stale player detection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProposerRosterReturn = { data: undefined };
    mockTradeBlockReturn = {
      data: undefined,
      loading: false,
      error: undefined,
    };
  });

  it('does not show stale warning when offered player is still on the roster', async () => {
    setPendingOffers([incomingOffer]);
    // Roster still contains the offered player (playerId 100)
    setProposerRoster([100, 200]);

    const { queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    await waitFor(() => {
      expect(queryByText(/no longer on this team's roster/i)).toBeNull();
    });
  });

  it('shows stale warning when offered player was dropped from the proposing roster', async () => {
    setPendingOffers([incomingOffer]);
    // Proposing team's roster no longer includes playerId 100 (Mike Trout was dropped)
    setProposerRoster([200, 300]);

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    expect(await findByText(/no longer on this team's roster/i)).toBeTruthy();
  });

  it('disables the Accept button when stale players are detected', async () => {
    setPendingOffers([incomingOffer]);
    setProposerRoster([200, 300]);

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    // Wait for warning to appear, then check button is disabled
    await findByText(/no longer on this team's roster/i);
    const acceptBtn = (await findByText('Accept')).closest('button');
    expect(acceptBtn).toBeDisabled();
  });

  it('disables Accept and shows error banner when roster fetch fails', async () => {
    setPendingOffers([incomingOffer]);
    mockProposerRosterReturn = {
      data: undefined,
      error: new Error('Network error'),
    };

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    expect(
      await findByText(/unable to verify this team's roster/i),
    ).toBeTruthy();
    const acceptBtn = (await findByText('Accept')).closest('button');
    expect(acceptBtn).toBeDisabled();
  });

  it('renders the stale player name when the player is no longer on the roster', async () => {
    setPendingOffers([incomingOffer]);
    setProposerRoster([200, 300]);

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    // Stale player is still shown in the offer (with visual treatment)
    expect(await findByText('Mike Trout')).toBeTruthy();
  });

  it('shows stale warning when multiple offered players are all dropped from the proposing roster', async () => {
    const multiPlayerOffer = makeOffer({
      id: 103,
      players: [
        {
          __typename: 'TradeOfferPlayer' as const,
          id: 1,
          tradeOfferId: 103,
          playerId: 100,
          fromTeamId: PROPOSING_TEAM_ID,
          playerName: 'Mike Trout',
          playerPosition: 'CF',
        },
        {
          __typename: 'TradeOfferPlayer' as const,
          id: 2,
          tradeOfferId: 103,
          playerId: 101,
          fromTeamId: PROPOSING_TEAM_ID,
          playerName: 'Shohei Ohtani',
          playerPosition: 'DH',
        },
      ],
    });
    setPendingOffers([multiPlayerOffer]);
    // Both offered players (100, 101) have been dropped
    setProposerRoster([200, 300]);

    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    expect(await findByText(/no longer on this team's roster/i)).toBeTruthy();
  });

  it('fetches the proposing team roster for incoming pending offers', async () => {
    setPendingOffers([incomingOffer]);
    setProposerRoster([100]);

    render(<TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />);

    await waitFor(() => {
      expect(mockLoadProposerRoster).toHaveBeenCalledWith({
        variables: { teamId: PROPOSING_TEAM_ID },
      });
    });
  });

  it('does not fetch the roster for outgoing offers', async () => {
    const outgoingOffer = makeOffer({
      id: 102,
      proposingTeamId: USER_TEAM_ID,
      receivingTeamId: PROPOSING_TEAM_ID,
      proposingTeamName: 'Home Runners',
      receivingTeamName: 'Sluggers',
      players: [
        {
          __typename: 'TradeOfferPlayer' as const,
          id: 10,
          tradeOfferId: 102,
          playerId: 999,
          fromTeamId: USER_TEAM_ID,
          playerName: 'Aaron Judge',
          playerPosition: 'RF',
        },
      ],
    });

    setPendingOffers([outgoingOffer]);

    render(<TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />);

    // Allow effects to settle
    await new Promise((r) => setTimeout(r, 50));

    // Should NOT have fetched roster (not an incoming offer for this user)
    expect(mockLoadProposerRoster).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Completed Trade History
// ---------------------------------------------------------------------------

describe('TradingCenter — Completed Trade History', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };
    mockLeagueTradesReturn = {
      data: undefined,
      loading: false,
      refetch: jest.fn(),
    };
    mockProposerRosterReturn = { data: undefined };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
  });

  it('renders the Trade History toggle button', async () => {
    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByText('Trade History')).toBeTruthy();
  });

  it('history section is hidden by default', () => {
    const { queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(queryByText(/No trade history yet/i)).toBeNull();
  });

  it('shows trade history section when toggle is clicked', async () => {
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: [] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    expect(await findByText(/No trade history yet/i)).toBeTruthy();
  });

  it('hides trade history after clicking the toggle again', async () => {
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: [] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText, queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    // Open
    fireEvent.click(getByText('Trade History'));
    await findByText(/No trade history yet/i);
    // Close
    fireEvent.click(getByText('Trade History'));
    await waitFor(() => {
      expect(queryByText(/No trade history yet/i)).toBeNull();
    });
  });

  it('shows loading spinner while fetching history', async () => {
    mockLeagueTradesReturn = {
      data: undefined,
      loading: true,
      refetch: jest.fn(),
    };
    const { findByText, getByText, getAllByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    // Spinner mock renders as "Loading..."
    await waitFor(() => {
      expect(getAllByText('Loading...').length).toBeGreaterThan(0);
    });
  });

  it('renders accepted trade cards in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 200,
            status: 'accepted',
            respondedAt: '2026-03-20T10:00:00Z',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    // Badge renders the status in uppercase
    expect(await findByText('ACCEPTED')).toBeTruthy();
  });

  it('renders rejected trade cards in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 201,
            status: 'rejected',
            respondedAt: '2026-03-21T09:00:00Z',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    expect(await findByText('REJECTED')).toBeTruthy();
  });

  it('renders vetoed trade cards in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 202,
            status: 'vetoed',
            vetoedAt: '2026-03-22T12:00:00Z',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    expect(await findByText('VETOED')).toBeTruthy();
  });

  it('renders cancelled trade cards in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [makeOffer({ id: 203, status: 'cancelled' })],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    expect(await findByText('CANCELLED')).toBeTruthy();
  });

  it('filters out pending trades — only non-pending appear in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({ id: 210, status: 'pending' }),
          makeOffer({
            id: 211,
            status: 'accepted',
            respondedAt: '2026-03-20T10:00:00Z',
            proposingTeamName: 'Sluggers',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText, queryAllByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    // Badge for the accepted trade should appear exactly once
    await findByText('ACCEPTED');
    // Badge "PENDING" must not appear in the history section
    expect(queryAllByText('PENDING')).toHaveLength(0);
  });

  it('shows player names within completed trade cards', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 220,
            status: 'accepted',
            respondedAt: '2026-03-20T10:00:00Z',
            players: [
              {
                __typename: 'TradeOfferPlayer' as const,
                id: 1,
                tradeOfferId: 220,
                playerId: 100,
                fromTeamId: PROPOSING_TEAM_ID,
                playerName: 'Shohei Ohtani',
                playerPosition: 'DH',
              },
            ],
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    expect(await findByText('Shohei Ohtani')).toBeTruthy();
  });

  it('shows commissioner veto button on accepted trades in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 230,
            status: 'accepted',
            respondedAt: '2026-03-20T10:00:00Z',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        isCommissioner
      />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    expect(await findByText('Veto')).toBeTruthy();
  });

  it('does not show veto button for non-commissioner in history', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 231,
            status: 'accepted',
            respondedAt: '2026-03-20T10:00:00Z',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText, queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    await findByText('ACCEPTED');
    expect(queryByText('Veto')).toBeNull();
  });

  it('renders multiple completed trade cards', async () => {
    mockLeagueTradesReturn = {
      data: {
        leagueTradeOffers: [
          makeOffer({
            id: 240,
            status: 'accepted',
            respondedAt: '2026-03-18T10:00:00Z',
          }),
          makeOffer({
            id: 241,
            status: 'rejected',
            respondedAt: '2026-03-19T10:00:00Z',
          }),
          makeOffer({
            id: 242,
            status: 'vetoed',
            vetoedAt: '2026-03-20T10:00:00Z',
          }),
        ],
      },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText, getAllByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    // Wait for at least one badge to appear
    await findByText('ACCEPTED');
    // All three status badges (exact uppercase) should be present
    expect(getAllByText('ACCEPTED')).toHaveLength(1);
    expect(getAllByText('REJECTED')).toHaveLength(1);
    expect(getAllByText('VETOED')).toHaveLength(1);
  });
});

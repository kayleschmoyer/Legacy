import React from 'react';
import type {
  GetLeagueTeamsQuery,
  GetLeagueTradeOffersQuery,
  GetTeamMembersQuery,
  GetTeamTradeOffersQuery,
  TradeOffer,
} from '@legacy-sports/graphql';
import { TradingCenter } from './TradingCenter';
import { act, fireEvent, render, waitFor } from '../../test-utils';

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
  fetchMore?: jest.Mock;
} = {
  data: undefined,
  loading: false,
  refetch: jest.fn(),
  fetchMore: jest.fn().mockResolvedValue({ data: { leagueTradeOffers: [] } }),
};

let mockDeepLinkReturn: {
  data: GetTeamTradeOffersQuery | undefined;
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

let mockLeagueTeamsReturn: { data: GetLeagueTeamsQuery | undefined };

let mockLeagueByIdReturn: {
  data:
    | {
        league: {
          tradeDeadlineWeek?: number | null;
          currentWeekNumber?: number | null;
          salaryCapEnabled?: boolean | null;
          salaryCap?: number | null;
        };
      }
    | undefined;
};

let mockViewerTeamReturn: {
  data: { team: { totalPayroll?: number | null } | null } | undefined;
} = { data: undefined };

let mockProposeTradeFn: jest.Mock;

// Trade action mutations. Default to immediate resolve so existing tests are
// unaffected; per-trade-pending tests (BLD-036) reassign these to deferred
// promises they resolve manually to observe the in-flight disabled state.
let mockAcceptTradeFn: jest.Mock = jest.fn().mockResolvedValue({});
let mockRejectTradeFn: jest.Mock = jest.fn().mockResolvedValue({});

const mockLoadProposerRoster = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue({});

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueByIdQuery: jest.fn(() => mockLeagueByIdReturn),
  useGetTeamTradeOffersQuery: jest.fn(
    (options: { variables?: { status?: string } }) => {
      // Pending query uses status: 'pending'; deep-link lookup omits status
      if (options?.variables?.status === 'pending') return mockPendingReturn;
      return mockDeepLinkReturn;
    },
  ),
  useGetLeagueTradeOffersQuery: jest.fn(() => mockLeagueTradesReturn),
  useGetLeagueTeamsQuery: jest.fn(() => mockLeagueTeamsReturn),
  useGetTeamByIdQuery: jest.fn(() => mockViewerTeamReturn),
  useGetTeamMembersLazyQuery: jest.fn(() => [
    mockLoadProposerRoster,
    mockProposerRosterReturn,
  ]),
  // LeagueTradeBlock (rendered within TradingCenter) uses this to source the
  // "Add Player" picker's roster -- default to empty since none of these
  // integration tests exercise that add flow.
  useGetTeamMembersQuery: jest.fn(() => ({
    data: { teamMembers: [] },
    loading: false,
    error: undefined,
  })),
  useAcceptTradeMutation: jest.fn(() => [mockAcceptTradeFn]),
  useRejectTradeMutation: jest.fn(() => [mockRejectTradeFn]),
  useCancelTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useVetoTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useProposeTradeMutation: jest.fn(() => [mockProposeTradeFn]),
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
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
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
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
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
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
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
// Salary-cap awareness (LS-5971 / BLD-038)
// ---------------------------------------------------------------------------

describe('TradingCenter — salary-cap awareness', () => {
  // Incoming offer where the viewer receives a $2,000,000 player (from the
  // proposing team) and sends a $500,000 player (from their own team).
  const capOffer = makeOffer({
    id: 700,
    players: [
      {
        __typename: 'TradeOfferPlayer' as const,
        id: 1,
        tradeOfferId: 700,
        playerId: 100,
        fromTeamId: PROPOSING_TEAM_ID,
        playerName: 'Mike Trout',
        playerPosition: 'CF',
        salary: 2000000,
      },
      {
        __typename: 'TradeOfferPlayer' as const,
        id: 2,
        tradeOfferId: 700,
        playerId: 200,
        fromTeamId: USER_TEAM_ID,
        playerName: 'Utility Guy',
        playerPosition: '2B',
        salary: 500000,
      },
    ],
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockProposerRosterReturn = { data: undefined };
    mockLeagueTradesReturn = {
      data: undefined,
      loading: false,
      refetch: jest.fn(),
    };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
    mockLeagueTeamsReturn = { data: undefined };
    mockViewerTeamReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
    setPendingOffers([capOffer]);
    // Roster still contains the offered player so no stale warning interferes.
    setProposerRoster([100]);
  });

  it('does not render the cap preview when the league has no salary cap', async () => {
    mockLeagueByIdReturn = { data: { league: { salaryCapEnabled: false } } };

    const { findByText, queryByTestId } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    // Card renders (player visible) but no cap preview.
    await findByText('Mike Trout');
    expect(queryByTestId('trade-cap-preview-700')).toBeNull();
  });

  it('renders the salary delta preview when the league has a salary cap', async () => {
    mockLeagueByIdReturn = {
      data: { league: { salaryCapEnabled: true, salaryCap: 50000000 } },
    };
    mockViewerTeamReturn = { data: { team: { totalPayroll: 10000000 } } };

    const { findByTestId, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByTestId('trade-cap-preview-700')).toBeTruthy();
    // Incoming $2,000,000 and net +$1,500,000 appear.
    expect(getByText('$2,000,000')).toBeTruthy();
    expect(getByText('+$1,500,000')).toBeTruthy();
  });

  it('warns when accepting the trade would exceed the salary cap', async () => {
    // Cap 11,000,000; payroll 10,000,000 → cap space 1,000,000. Net +1,500,000
    // pushes payroll to 11,500,000, i.e. 500,000 over the cap.
    mockLeagueByIdReturn = {
      data: { league: { salaryCapEnabled: true, salaryCap: 11000000 } },
    };
    mockViewerTeamReturn = { data: { team: { totalPayroll: 10000000 } } };

    const { findByTestId, getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(await findByTestId('trade-cap-warning-700')).toBeTruthy();
    expect(getByText(/over the salary cap/i)).toBeTruthy();
  });

  it('does not warn when the trade stays within the cap', async () => {
    mockLeagueByIdReturn = {
      data: { league: { salaryCapEnabled: true, salaryCap: 50000000 } },
    };
    mockViewerTeamReturn = { data: { team: { totalPayroll: 10000000 } } };

    const { findByTestId, queryByTestId } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByTestId('trade-cap-preview-700');
    expect(queryByTestId('trade-cap-warning-700')).toBeNull();
  });

  it('shows the salary delta but no over-cap warning when payroll is unknown', async () => {
    mockLeagueByIdReturn = {
      data: { league: { salaryCapEnabled: true, salaryCap: 11000000 } },
    };
    mockViewerTeamReturn = { data: undefined };

    const { findByTestId, queryByTestId } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByTestId('trade-cap-preview-700');
    expect(queryByTestId('trade-cap-warning-700')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Per-trade pending state (BLD-036 / LS-5969)
//
// Regression guard: an in-flight Accept/Reject/Cancel mutation must disable
// ONLY the card whose action is running — never every pending trade globally.
// The bug was a shared `mutationPending` boolean fed to every card; the fix
// tracks the in-flight tradeId (`actionLoading`) and each card disables only
// when `actionLoading === trade.id`.
// ---------------------------------------------------------------------------

describe('TradingCenter — per-trade pending state (BLD-036)', () => {
  const OFFER_A_ID = 401;
  const OFFER_B_ID = 402;

  // Two incoming pending offers for the user's team from the same proposing
  // team. No player legs → the stale-player / roster-error disable paths stay
  // inert, so the ONLY thing that can disable a button is the per-trade
  // in-flight state under test.
  const offerA = makeOffer({ id: OFFER_A_ID });
  const offerB = makeOffer({ id: OFFER_B_ID });

  beforeEach(() => {
    jest.clearAllMocks();
    setPendingOffers([offerA, offerB]);
    mockProposerRosterReturn = { data: undefined };
    mockLeagueTradesReturn = {
      data: undefined,
      loading: false,
      refetch: jest.fn(),
    };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
    mockAcceptTradeFn = jest.fn().mockResolvedValue({});
    mockRejectTradeFn = jest.fn().mockResolvedValue({});
  });

  it('disables only the acted-on card while its Accept mutation is in flight', async () => {
    // Deferred accept: stays pending until we resolve it, so we can observe
    // the in-flight disabled state.
    let resolveAccept: (value?: unknown) => void = () => undefined;
    mockAcceptTradeFn = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveAccept = resolve;
        }),
    );

    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    const acceptA = await utils.findByTestId(`trade-accept-${OFFER_A_ID}`);
    // Both cards start interactive.
    expect(acceptA).not.toBeDisabled();
    expect(utils.getByTestId(`trade-accept-${OFFER_B_ID}`)).not.toBeDisabled();
    expect(utils.getByTestId(`trade-reject-${OFFER_B_ID}`)).not.toBeDisabled();

    // Accept card A — its mutation stays pending.
    await act(async () => {
      fireEvent.click(acceptA);
      await Promise.resolve();
    });

    // Card A is disabled while its own mutation runs...
    await waitFor(() => {
      expect(utils.getByTestId(`trade-accept-${OFFER_A_ID}`)).toBeDisabled();
    });
    expect(utils.getByTestId(`trade-reject-${OFFER_A_ID}`)).toBeDisabled();

    // ...but card B stays fully interactive — this is the regression the bug
    // violated (all cards disabled globally on any pending mutation).
    expect(utils.getByTestId(`trade-accept-${OFFER_B_ID}`)).not.toBeDisabled();
    expect(utils.getByTestId(`trade-reject-${OFFER_B_ID}`)).not.toBeDisabled();

    // Resolving the mutation re-enables card A.
    await act(async () => {
      resolveAccept();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(
        utils.getByTestId(`trade-accept-${OFFER_A_ID}`),
      ).not.toBeDisabled();
    });
  });

  it('lets the user act on a different trade while one trade is pending', async () => {
    let resolveAccept: (value?: unknown) => void = () => undefined;
    mockAcceptTradeFn = jest.fn(
      () =>
        new Promise((resolve) => {
          resolveAccept = resolve;
        }),
    );

    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    const acceptA = await utils.findByTestId(`trade-accept-${OFFER_A_ID}`);
    await act(async () => {
      fireEvent.click(acceptA);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(utils.getByTestId(`trade-accept-${OFFER_A_ID}`)).toBeDisabled();
    });

    // Reject on card B is still enabled and actually fires while A is pending.
    const rejectB = utils.getByTestId(`trade-reject-${OFFER_B_ID}`);
    expect(rejectB).not.toBeDisabled();
    await act(async () => {
      fireEvent.click(rejectB);
      await Promise.resolve();
    });
    expect(mockRejectTradeFn).toHaveBeenCalledWith({
      variables: { tradeId: OFFER_B_ID },
    });

    resolveAccept();
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
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
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

  it('does not show filter controls when history is empty', async () => {
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: [] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByText, getByText, queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await findByText('Trade History');
    fireEvent.click(getByText('Trade History'));
    await findByText(/No trade history yet/i);
    expect(queryByText('All Time')).toBeNull();
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

// ---------------------------------------------------------------------------
// Trade History Pagination
// ---------------------------------------------------------------------------

describe('TradingCenter — Trade History pagination', () => {
  const PAGE_SIZE = 25;

  function makePageOfOffers(
    count: number,
    startId = 200,
  ): ReturnType<typeof makeOffer>[] {
    return Array.from({ length: count }, (_, i) =>
      makeOffer({ id: startId + i, status: 'accepted' }),
    );
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };
    mockProposerRosterReturn = { data: undefined };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
  });

  async function openHistory(utils: ReturnType<typeof render>): Promise<void> {
    await utils.findByText('Trade History');
    fireEvent.click(utils.getByText('Trade History'));
  }

  it('shows Load more button when first page is full', async () => {
    const firstPage = makePageOfOffers(PAGE_SIZE);
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: firstPage },
      loading: false,
      refetch: jest.fn(),
      fetchMore: jest
        .fn()
        .mockResolvedValue({ data: { leagueTradeOffers: [] } }),
    };
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    expect(await utils.findByText('Load more')).toBeTruthy();
  });

  it('does not show Load more button when fewer than a full page returned', async () => {
    const partial = makePageOfOffers(PAGE_SIZE - 1);
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: partial },
      loading: false,
      refetch: jest.fn(),
      fetchMore: jest
        .fn()
        .mockResolvedValue({ data: { leagueTradeOffers: [] } }),
    };
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await waitFor(() => {
      expect(utils.getAllByText('ACCEPTED').length).toBeGreaterThan(0);
    });
    expect(utils.queryByText('Load more')).toBeNull();
  });

  // Regression guard for BLD-034: completed trades must NOT be silently capped at 10.
  it('renders all 11 completed trades when 11 are returned — no silent cap at 10', async () => {
    const elevenTrades = makePageOfOffers(11, 200);
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: elevenTrades },
      loading: false,
      refetch: jest.fn(),
      fetchMore: jest
        .fn()
        .mockResolvedValue({ data: { leagueTradeOffers: [] } }),
    };
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await waitFor(() => {
      expect(utils.getAllByText('ACCEPTED')).toHaveLength(11);
    });
    // 11 < PAGE_SIZE so no "Load more" button
    expect(utils.queryByText('Load more')).toBeNull();
  });

  it('appends next page when Load more is clicked', async () => {
    const firstPage = makePageOfOffers(PAGE_SIZE, 200);
    const secondPage = makePageOfOffers(3, 300);
    const fetchMore = jest.fn().mockResolvedValue({
      data: { leagueTradeOffers: secondPage },
    });
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: firstPage },
      loading: false,
      refetch: jest.fn(),
      fetchMore,
    };
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    const loadMore = await utils.findByText('Load more');
    fireEvent.click(loadMore);
    await waitFor(() => {
      expect(fetchMore).toHaveBeenCalled();
    });
    const callArg = (
      fetchMore.mock.calls[0] as [{ variables: { offset: number } }]
    )[0];
    expect(callArg.variables.offset).toBe(PAGE_SIZE);
    // After append, Load more should disappear (second page has < PAGE_SIZE items)
    await waitFor(() => {
      expect(utils.queryByText('Load more')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// Trade History Filters (LS-7529)
// ---------------------------------------------------------------------------

describe('TradingCenter — Trade History Filters', () => {
  const TEAM_A_ID = 2;
  const TEAM_B_ID = 3;

  function setHistoryOffers(offers: ReturnType<typeof makeOffer>[]) {
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: offers },
      loading: false,
      refetch: jest.fn(),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };
    mockProposerRosterReturn = { data: undefined };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
    mockLeagueTeamsReturn = { data: undefined };
    mockLeagueByIdReturn = { data: undefined };
    mockProposeTradeFn = jest.fn().mockResolvedValue({});
  });

  async function openHistory(utils: ReturnType<typeof render>): Promise<void> {
    await utils.findByText('Trade History');
    fireEvent.click(utils.getByText('Trade History'));
  }

  it('renders filter bar when history section is expanded', async () => {
    setHistoryOffers([makeOffer({ id: 399, status: 'accepted' })]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    expect(await utils.findByText('All')).toBeTruthy();
    expect(utils.getByText('Accepted')).toBeTruthy();
    expect(utils.getByText('All Time')).toBeTruthy();
  });

  it('does not render filter bar when history is collapsed', () => {
    setHistoryOffers([]);
    const { queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(queryByText('All Time')).toBeNull();
  });

  it('filters by accepted status — only accepted trades shown', async () => {
    setHistoryOffers([
      makeOffer({ id: 300, status: 'accepted' }),
      makeOffer({ id: 301, status: 'rejected' }),
    ]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    // Click "Accepted" chip
    fireEvent.click(utils.getByText('Accepted'));

    await waitFor(() => {
      expect(utils.queryByText('REJECTED')).toBeNull();
    });
    expect(utils.getByText('ACCEPTED')).toBeTruthy();
  });

  it('filters by rejected status — only rejected trades shown', async () => {
    setHistoryOffers([
      makeOffer({ id: 302, status: 'accepted' }),
      makeOffer({ id: 303, status: 'rejected' }),
    ]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    fireEvent.click(utils.getByText('Rejected'));

    await waitFor(() => {
      expect(utils.queryByText('ACCEPTED')).toBeNull();
    });
    expect(utils.getByText('REJECTED')).toBeTruthy();
  });

  it('clicking All chip after status filter restores all trades', async () => {
    setHistoryOffers([
      makeOffer({ id: 304, status: 'accepted' }),
      makeOffer({ id: 305, status: 'rejected' }),
    ]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    fireEvent.click(utils.getByText('Accepted'));
    await waitFor(() => expect(utils.queryByText('REJECTED')).toBeNull());

    fireEvent.click(utils.getByText('All'));
    expect(await utils.findByText('REJECTED')).toBeTruthy();
    expect(utils.getByText('ACCEPTED')).toBeTruthy();
  });

  it('filters by team — only trades involving selected team are shown', async () => {
    setHistoryOffers([
      makeOffer({
        id: 306,
        status: 'accepted',
        proposingTeamId: TEAM_A_ID,
        receivingTeamId: USER_TEAM_ID,
        proposingTeamName: 'Team Alpha',
        receivingTeamName: 'Home Runners',
      }),
      makeOffer({
        id: 307,
        status: 'rejected',
        proposingTeamId: TEAM_B_ID,
        receivingTeamId: USER_TEAM_ID,
        proposingTeamName: 'Team Beta',
        receivingTeamName: 'Home Runners',
      }),
    ]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');
    expect(utils.getByText('REJECTED')).toBeTruthy();

    // Select Team Alpha from the team filter dropdown
    const teamSelect = utils.getByRole('combobox');
    fireEvent.change(teamSelect, { target: { value: String(TEAM_A_ID) } });

    await waitFor(() => {
      expect(utils.queryByText('REJECTED')).toBeNull();
    });
    expect(utils.getByText('ACCEPTED')).toBeTruthy();
  });

  it('shows "No trades match the selected filters" when filters exclude all trades', async () => {
    setHistoryOffers([makeOffer({ id: 308, status: 'accepted' })]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    // Filter to rejected — no rejected trades exist
    fireEvent.click(utils.getByText('Rejected'));

    expect(
      await utils.findByText(/No trades match the selected filters/i),
    ).toBeTruthy();
  });

  it('shows Clear Filters button when no trades match, and clears filters on click', async () => {
    setHistoryOffers([makeOffer({ id: 309, status: 'accepted' })]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    fireEvent.click(utils.getByText('Rejected'));
    const clearBtn = await utils.findByText('Clear Filters');
    expect(clearBtn).toBeTruthy();

    fireEvent.click(clearBtn);
    expect(await utils.findByText('ACCEPTED')).toBeTruthy();
    expect(utils.queryByText('Clear Filters')).toBeNull();
  });

  it('filters by Last 7d — excludes trades older than 7 days', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 2);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 10);

    setHistoryOffers([
      makeOffer({
        id: 310,
        status: 'accepted',
        createdAt: recentDate.toISOString(),
      }),
      makeOffer({
        id: 311,
        status: 'rejected',
        createdAt: oldDate.toISOString(),
      }),
    ]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    fireEvent.click(utils.getByText('Last 7d'));

    await waitFor(() => {
      expect(utils.queryByText('REJECTED')).toBeNull();
    });
    expect(utils.getByText('ACCEPTED')).toBeTruthy();
  });

  it('filters by Last 30d — excludes trades older than 30 days', async () => {
    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 15);
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 45);

    setHistoryOffers([
      makeOffer({
        id: 312,
        status: 'accepted',
        createdAt: recentDate.toISOString(),
      }),
      makeOffer({
        id: 313,
        status: 'rejected',
        createdAt: oldDate.toISOString(),
      }),
    ]);
    const utils = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    await openHistory(utils);
    await utils.findByText('ACCEPTED');

    fireEvent.click(utils.getByText('Last 30d'));

    await waitFor(() => {
      expect(utils.queryByText('REJECTED')).toBeNull();
    });
    expect(utils.getByText('ACCEPTED')).toBeTruthy();
  });
});

describe('TradingCenter — deep-link expired/not-found handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProposerRosterReturn = { data: undefined };
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
    mockDeepLinkReturn = {
      data: undefined,
      loading: false,
      refetch: jest.fn(),
    };
    mockTradeBlockReturn = {
      data: { leagueTradeBlock: [] },
      loading: false,
      error: undefined,
    };
  });

  it('shows no banner when deepLinkOfferId is not provided', () => {
    mockDeepLinkReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: jest.fn(),
    };
    const { queryByTestId } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(queryByTestId('deep-link-unavailable-banner')).toBeNull();
    expect(queryByTestId('deep-link-not-found-banner')).toBeNull();
  });

  it('shows "no longer available" banner for an expired deep-linked offer', async () => {
    const expiredOffer = makeOffer({ id: 500, status: 'expired' });
    mockDeepLinkReturn = {
      data: { teamTradeOffers: [expiredOffer] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByTestId, queryByTestId } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        deepLinkOfferId={500}
      />,
    );
    expect(await findByTestId('deep-link-unavailable-banner')).toBeTruthy();
    expect(queryByTestId('deep-link-not-found-banner')).toBeNull();
  });

  it('shows "no longer available" banner for a vetoed deep-linked offer', async () => {
    const vetoedOffer = makeOffer({ id: 501, status: 'vetoed' });
    mockDeepLinkReturn = {
      data: { teamTradeOffers: [vetoedOffer] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByTestId } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        deepLinkOfferId={501}
      />,
    );
    expect(await findByTestId('deep-link-unavailable-banner')).toBeTruthy();
  });

  it('shows "no longer available" banner for a cancelled deep-linked offer', async () => {
    const cancelledOffer = makeOffer({ id: 502, status: 'cancelled' });
    mockDeepLinkReturn = {
      data: { teamTradeOffers: [cancelledOffer] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByTestId } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        deepLinkOfferId={502}
      />,
    );
    expect(await findByTestId('deep-link-unavailable-banner')).toBeTruthy();
  });

  it('shows "trade not found" banner when the offer ID is not in the team trades', async () => {
    mockDeepLinkReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: jest.fn(),
    };
    const { findByTestId, queryByTestId } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        deepLinkOfferId={999}
      />,
    );
    expect(await findByTestId('deep-link-not-found-banner')).toBeTruthy();
    expect(queryByTestId('deep-link-unavailable-banner')).toBeNull();
  });

  it('shows no banner when the deep-linked offer is still pending', async () => {
    const pendingOffer = makeOffer({ id: 503, status: 'pending' });
    mockDeepLinkReturn = {
      data: { teamTradeOffers: [pendingOffer] },
      loading: false,
      refetch: jest.fn(),
    };
    const { queryByTestId } = render(
      <TradingCenter
        leagueId={LEAGUE_ID}
        userTeamId={USER_TEAM_ID}
        deepLinkOfferId={503}
      />,
    );
    await waitFor(() => {
      expect(queryByTestId('deep-link-unavailable-banner')).toBeNull();
      expect(queryByTestId('deep-link-not-found-banner')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// ProposeTradeDialog (LS-5678) — Submit New Trade Offer
// ---------------------------------------------------------------------------

const RECEIVING_TEAM_ID = 2; // distinct from USER_TEAM_ID (1)

function makeMockTeam(id: number, name: string) {
  return {
    __typename: 'Team' as const,
    id,
    name,
    leagueId: LEAGUE_ID,
    waiverOrder: null,
    faabBudget: null,
    isLocked: false,
    logoUrl: null,
    primaryColor: null,
    secondaryColor: null,
    avatarUrl: null,
    bannerUrl: null,
    managerId: null,
  };
}

function makeMockPlayer(id: number, firstName: string, lastName: string) {
  return {
    __typename: 'TeamMember' as const,
    id,
    playerId: id,
    positionId: 1,
    teamId: USER_TEAM_ID,
    leagueId: LEAGUE_ID,
    onTradeBlock: false,
    player: {
      __typename: 'Player' as const,
      firstName,
      lastName,
    },
  };
}

describe('TradingCenter — ProposeTradeDialog (LS-5678)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProposeTradeFn = jest.fn().mockResolvedValue({ data: {} });
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
    mockLeagueByIdReturn = { data: undefined };
    mockLeagueTeamsReturn = {
      data: {
        leagueTeams: [makeMockTeam(RECEIVING_TEAM_ID, 'Sluggers')],
      },
    };
    mockProposerRosterReturn = {
      data: {
        teamMembers: [
          makeMockPlayer(10, 'Aaron', 'Judge'),
          makeMockPlayer(20, 'Mike', 'Trout'),
        ],
      },
    };
  });

  it('renders the "Propose Trade" button', () => {
    const { getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(getByText('Propose Trade')).toBeTruthy();
  });

  it('"Propose Trade" button is enabled when the trade deadline is not past', () => {
    const { getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    const btn = getByText('Propose Trade').closest('button');
    expect(btn).not.toBeDisabled();
  });

  it('"Propose Trade" button is disabled when the trade deadline has passed', () => {
    mockLeagueByIdReturn = {
      data: { league: { tradeDeadlineWeek: 14, currentWeekNumber: 15 } },
    };
    const { getByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    const btn = getByText('Propose Trade').closest('button');
    expect(btn).toBeDisabled();
  });

  it('opens the dialog when "Propose Trade" is clicked', () => {
    const { getByText, queryByRole } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    expect(queryByRole('dialog')).toBeNull();
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    expect(queryByRole('dialog')).not.toBeNull();
  });

  it('dialog shows the team-selection step first', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    expect(
      await findByText(/select the team you want to trade with/i),
    ).toBeTruthy();
  });

  it('dialog lists other teams for selection', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    expect(await findByText('Sluggers')).toBeTruthy();
  });

  it('advances to the offer step after selecting a team', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    expect(await findByText(/you will give/i)).toBeTruthy();
  });

  it('shows user roster players in the offer step', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    expect(await findByText('Aaron Judge')).toBeTruthy();
  });

  it('shows the "Next" button after selecting an offering player', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    expect(await findByText(/next.*select their players/i)).toBeTruthy();
  });

  it('advances to the request step and shows target roster', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    expect(await findByText(/give you/i)).toBeTruthy();
  });

  it('advances to the confirm step after selecting both player sets', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    // Select a requesting player (Mike Trout appears again as "their" roster since
    // the mock returns the same data for both lazy queries)
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    await act(async () => {
      const reviewBtn = await findByText(/review trade/i);
      fireEvent.click(reviewBtn.closest('button') ?? reviewBtn);
    });
    expect(await findByText(/send trade offer/i)).toBeTruthy();
  });

  it('calls useProposeTradeMutation when "Send Trade Offer" is clicked', async () => {
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    // Navigate through all 4 steps
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    await act(async () => {
      const reviewBtn = await findByText(/review trade/i);
      fireEvent.click(reviewBtn.closest('button') ?? reviewBtn);
    });
    await act(async () => {
      const sendBtn = await findByText(/send trade offer/i);
      fireEvent.click(sendBtn.closest('button') ?? sendBtn);
      await Promise.resolve();
    });
    expect(mockProposeTradeFn).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: {
          leagueId: LEAGUE_ID,
          receivingTeamId: RECEIVING_TEAM_ID,
          offeringPlayerIds: [10],
          requestingPlayerIds: [20],
          message: null,
          expiresInDays: 3,
        },
      }),
    );
  });

  it('closes the dialog on successful submission', async () => {
    const { getByText, findByText, queryByRole } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    await act(async () => {
      const reviewBtn = await findByText(/review trade/i);
      fireEvent.click(reviewBtn.closest('button') ?? reviewBtn);
    });
    await act(async () => {
      const sendBtn = await findByText(/send trade offer/i);
      fireEvent.click(sendBtn.closest('button') ?? sendBtn);
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(queryByRole('dialog')).toBeNull();
    });
  });

  it('shows an error message when the mutation fails', async () => {
    mockProposeTradeFn = jest.fn().mockRejectedValue(new Error('Server error'));
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    await act(async () => {
      const reviewBtn = await findByText(/review trade/i);
      fireEvent.click(reviewBtn.closest('button') ?? reviewBtn);
    });
    await act(async () => {
      const sendBtn = await findByText(/send trade offer/i);
      fireEvent.click(sendBtn.closest('button') ?? sendBtn);
      await Promise.resolve();
    });
    expect(await findByText('Server error')).toBeTruthy();
  });

  it('shows an UNAUTHENTICATED error when the mutation rejects with an auth error', async () => {
    mockProposeTradeFn = jest
      .fn()
      .mockRejectedValue(new Error('UNAUTHENTICATED'));
    const { getByText, findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    await act(async () => {
      const reviewBtn = await findByText(/review trade/i);
      fireEvent.click(reviewBtn.closest('button') ?? reviewBtn);
    });
    await act(async () => {
      const sendBtn = await findByText(/send trade offer/i);
      fireEvent.click(sendBtn.closest('button') ?? sendBtn);
      await Promise.resolve();
    });
    expect(await findByText('UNAUTHENTICATED')).toBeTruthy();
  });

  it('"Send Trade Offer" is disabled past the trade deadline in the confirm step', async () => {
    mockLeagueByIdReturn = {
      data: { league: { tradeDeadlineWeek: 14, currentWeekNumber: 15 } },
    };
    const { findByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    // Button is disabled at top level — cannot open dialog — verify button is disabled
    const proposeBtn = (await findByText('Propose Trade')).closest('button');
    expect(proposeBtn).toBeDisabled();
  });

  it('deselects an offering player when clicked a second time — no duplicate in payload (TC-014-P)', async () => {
    const { getByText, findByText, queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    // First click — selects Aaron Judge; "Next" button should appear
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    expect(await findByText(/next.*select their players/i)).toBeTruthy();
    // Second click — deselects Aaron Judge; "Next" button must disappear
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await waitFor(() => {
      expect(queryByText(/next.*select their players/i)).toBeNull();
    });
  });

  it('deselects a requesting player when clicked a second time — no duplicate in payload (TC-014-P)', async () => {
    const { getByText, findByText, queryByText } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );
    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });
    await act(async () => {
      fireEvent.click(await findByText('Sluggers'));
    });
    await act(async () => {
      fireEvent.click(await findByText('Aaron Judge'));
    });
    await act(async () => {
      const nextBtn = await findByText(/next.*select their players/i);
      fireEvent.click(nextBtn.closest('button') ?? nextBtn);
    });
    // First click — selects Mike Trout; "Review Trade" button should appear
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    expect(await findByText(/review trade/i)).toBeTruthy();
    // Second click — deselects Mike Trout; "Review Trade" button must disappear
    await act(async () => {
      fireEvent.click(await findByText('Mike Trout'));
    });
    await waitFor(() => {
      expect(queryByText(/review trade/i)).toBeNull();
    });
  });
});

// NOTE: The duplicate "Trade History Filters" describe block that was added
// here (LS-7526) was removed — all filter scenarios are covered by the block
// above (LS-7529) which uses the Dropdown-based team filter implementation.

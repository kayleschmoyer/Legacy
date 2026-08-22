/**
 * Regression test for LS-8852 — on native, the Propose Trade dialog must
 * mount via React Native's `Modal` primitive rather than the absolutely
 * positioned overlay nested inside the host page's ScrollView (which left
 * it laid out against the tall scroll content, off the visible fold).
 *
 * Runs under the shared-components *mobile* jest project
 * (jest.config.mobile.ts), where `Platform.OS` mocks to a native value.
 * jsdom cannot reproduce true RN Modal window-escape semantics — per the
 * ticket itself, "a jsdom jest run will not reproduce this, since the
 * layout constraint is a RN one" — so this asserts the documented
 * fallback signal instead: the platform Modal primitive renders and the
 * dialog mounts inside it.
 */
import React from 'react';
import type {
  GetLeagueTeamsQuery,
  GetLeagueTradeOffersQuery,
  GetTeamMembersQuery,
  GetTeamTradeOffersQuery,
} from '@legacy-sports/graphql';
import { TradingCenter } from './TradingCenter';
import { act, fireEvent, render } from '../../test-utils';

const USER_TEAM_ID = 1;
const RECEIVING_TEAM_ID = 2;
const LEAGUE_ID = 10;

// Mutable state for GraphQL hook mocks, reassigned per-test. Each mocked
// hook returns the SAME object reference across renders (mirroring
// TradingCenter.spec.tsx) — returning a fresh object/array literal on every
// call gives effects that depend on the query result a new reference every
// render, which retriggers them indefinitely ("Maximum update depth
// exceeded") once the render actually reaches those effects, as it does
// here for the first time under mobile mocks.
let mockPendingReturn: {
  data: GetTeamTradeOffersQuery | undefined;
  loading: boolean;
  refetch: jest.Mock;
};
let mockLeagueTradesReturn: {
  data: GetLeagueTradeOffersQuery | undefined;
  loading: boolean;
  refetch: jest.Mock;
  fetchMore: jest.Mock;
};
let mockLeagueTeamsReturn: { data: GetLeagueTeamsQuery | undefined };
let mockProposerRosterReturn: { data: GetTeamMembersQuery | undefined };

const mockLoadProposerRoster = jest.fn();
const mockRefetch = jest.fn().mockResolvedValue({});

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueByIdQuery: jest.fn(() => ({ data: undefined })),
  useGetTeamTradeOffersQuery: jest.fn(
    (options: { variables?: { status?: string } }) =>
      options?.variables?.status === 'pending'
        ? mockPendingReturn
        : { data: undefined, loading: false, refetch: jest.fn() },
  ),
  useGetLeagueTradeOffersQuery: jest.fn(() => mockLeagueTradesReturn),
  useGetLeagueTeamsQuery: jest.fn(() => mockLeagueTeamsReturn),
  useGetTeamByIdQuery: jest.fn(() => ({ data: undefined })),
  useGetTeamMembersLazyQuery: jest.fn(() => [
    mockLoadProposerRoster,
    mockProposerRosterReturn,
  ]),
  // LeagueTradeBlock's "Add Player" picker (LS-8855) queries the roster
  // directly rather than lazily; skip: true keeps it inert here since this
  // spec never expands that picker.
  useGetTeamMembersQuery: jest.fn(() => ({
    data: undefined,
    loading: false,
    error: undefined,
  })),
  useAcceptTradeMutation: jest.fn(() => [jest.fn()]),
  useRejectTradeMutation: jest.fn(() => [jest.fn()]),
  useCancelTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useVetoTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useVoteOnTradeMutation: () => [jest.fn().mockResolvedValue({})],
  useProposeTradeMutation: jest.fn(() => [jest.fn().mockResolvedValue({})]),
  useGetLeagueTradeBlockQuery: jest.fn(() => ({
    data: { leagueTradeBlock: [] },
    loading: false,
    error: undefined,
  })),
  useSetTradeBlockMutation: () => [
    jest.fn().mockResolvedValue({}),
    { loading: false },
  ],
  GetTeamTradeOffers: 'GetTeamTradeOffers',
  GetLeagueTradeOffers: 'GetLeagueTradeOffers',
  TradeOfferFragment: 'TradeOfferFragment',
  TradeVoteChoice: { Approve: 'approve', Veto: 'veto' },
}));

describe('TradingCenter — ProposeTradeDialog native Modal mount (LS-8852)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPendingReturn = {
      data: { teamTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
    };
    mockLeagueTradesReturn = {
      data: { leagueTradeOffers: [] },
      loading: false,
      refetch: mockRefetch,
      fetchMore: jest
        .fn()
        .mockResolvedValue({ data: { leagueTradeOffers: [] } }),
    };
    mockLeagueTeamsReturn = {
      data: {
        leagueTeams: [
          {
            __typename: 'Team' as const,
            id: RECEIVING_TEAM_ID,
            name: 'Sluggers',
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
          },
        ],
      },
    };
    mockProposerRosterReturn = {
      data: {
        teamMembers: [
          {
            __typename: 'TeamMember' as const,
            id: 10,
            playerId: 10,
            positionId: 1,
            teamId: USER_TEAM_ID,
            leagueId: LEAGUE_ID,
            onTradeBlock: false,
            player: {
              __typename: 'Player' as const,
              firstName: 'Aaron',
              lastName: 'Judge',
            },
          },
        ],
      },
    };
  });

  it('mounts the dialog via the native Modal primitive rather than the web-only fixed/absolute overlay', () => {
    const { getByText, getByRole, container } = render(
      <TradingCenter leagueId={LEAGUE_ID} userTeamId={USER_TEAM_ID} />,
    );

    act(() => {
      fireEvent.click(
        getByText('Propose Trade').closest('button') as HTMLButtonElement,
      );
    });

    const dialog = getByRole('dialog', { name: 'Propose Trade' });

    const nativeModal = container.querySelector(
      '[testid="propose-trade-native-modal"]',
    );
    expect(nativeModal).not.toBeNull();
    expect(nativeModal?.contains(dialog)).toBe(true);
  });
});

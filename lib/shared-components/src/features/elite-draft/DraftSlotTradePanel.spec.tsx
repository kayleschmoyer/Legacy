import React from 'react';
import type {
  DraftSlotTradeFragment,
  GetLeagueDraftSlotTradesQuery,
} from '@legacy-sports/graphql';
import { DraftSlotTradePanel } from './DraftSlotTradePanel';
import type { LeagueTeam } from './types';
import { fireEvent, render, waitFor } from '../../test-utils';

let mockTradesReturn: {
  data: GetLeagueDraftSlotTradesQuery | undefined;
  refetch: jest.Mock;
} = {
  data: { leagueDraftSlotTrades: [] },
  refetch: jest.fn().mockResolvedValue({}),
};

const mockProposeFn = jest.fn().mockResolvedValue({});
const mockRespondFn = jest.fn().mockResolvedValue({});
const mockApproveFn = jest.fn().mockResolvedValue({});

jest.mock('@legacy-sports/graphql', () => ({
  useGetLeagueDraftSlotTradesQuery: jest.fn(() => mockTradesReturn),
  useProposeDraftSlotTradeMutation: jest.fn(() => [
    mockProposeFn,
    { loading: false },
  ]),
  useRespondDraftSlotTradeMutation: jest.fn(() => [
    mockRespondFn,
    { loading: false },
  ]),
  useApproveDraftSlotTradeMutation: jest.fn(() => [
    mockApproveFn,
    { loading: false },
  ]),
}));

const LEAGUE_ID = 42;

const TEAMS: LeagueTeam[] = [
  { id: '1', name: 'My Squad', leagueId: LEAGUE_ID },
  { id: '2', name: 'Rival FC', leagueId: LEAGUE_ID },
  { id: '3', name: 'Third Team', leagueId: LEAGUE_ID },
];

function makeTrade(
  overrides: Partial<DraftSlotTradeFragment>,
): DraftSlotTradeFragment {
  return {
    __typename: 'DraftSlotTrade',
    id: 1,
    leagueId: LEAGUE_ID,
    proposerTeamId: 1,
    proposerTeamName: 'My Squad',
    counterpartTeamId: 2,
    counterpartTeamName: 'Rival FC',
    status: 'proposed',
    createdAt: '2026-07-27T00:00:00Z',
    updatedAt: '2026-07-27T00:00:00Z',
    ...overrides,
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    leagueId: LEAGUE_ID,
    myTeamId: 1,
    leagueTeams: TEAMS,
    canManageOwnTeam: true,
    isCommissioner: false,
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockTradesReturn = {
    data: { leagueDraftSlotTrades: [] },
    refetch: jest.fn().mockResolvedValue({}),
  };
});

describe('DraftSlotTradePanel', () => {
  it('renders a propose control listing every other team', () => {
    const { getByTestId, getByText } = render(
      <DraftSlotTradePanel {...makeProps()} />,
    );
    const select = getByTestId(
      'trade-panel-counterpart-select',
    ) as HTMLSelectElement;
    expect(getByText('Rival FC')).toBeTruthy();
    expect(getByText('Third Team')).toBeTruthy();
    expect(select.querySelector('option[value="1"]')).toBeNull();
  });

  it('proposes a trade with the selected counterpart team', async () => {
    const { getByTestId } = render(<DraftSlotTradePanel {...makeProps()} />);
    fireEvent.change(getByTestId('trade-panel-counterpart-select'), {
      target: { value: '2' },
    });
    fireEvent.click(getByTestId('trade-panel-propose-btn'));

    await waitFor(() => {
      expect(mockProposeFn).toHaveBeenCalledWith({
        variables: { leagueId: LEAGUE_ID, counterpartTeamId: 2 },
      });
    });
  });

  it('shows an incoming proposal with accept/decline actions', () => {
    mockTradesReturn = {
      data: {
        leagueDraftSlotTrades: [
          makeTrade({ id: 5, proposerTeamId: 2, counterpartTeamId: 1 }),
        ],
      },
      refetch: jest.fn().mockResolvedValue({}),
    };
    const { getByTestId } = render(<DraftSlotTradePanel {...makeProps()} />);
    expect(getByTestId('trade-incoming-5')).toBeTruthy();
    expect(getByTestId('trade-accept-5')).toBeTruthy();
    expect(getByTestId('trade-decline-5')).toBeTruthy();
  });

  it('accepting an incoming proposal calls respondDraftSlotTrade with accept=true', async () => {
    mockTradesReturn = {
      data: {
        leagueDraftSlotTrades: [
          makeTrade({ id: 5, proposerTeamId: 2, counterpartTeamId: 1 }),
        ],
      },
      refetch: jest.fn().mockResolvedValue({}),
    };
    const { getByTestId } = render(<DraftSlotTradePanel {...makeProps()} />);
    fireEvent.click(getByTestId('trade-accept-5'));

    await waitFor(() => {
      expect(mockRespondFn).toHaveBeenCalledWith({
        variables: { tradeId: 5, accept: true },
      });
    });
  });

  it('shows a commissioner approval queue and approves a trade', async () => {
    mockTradesReturn = {
      data: {
        leagueDraftSlotTrades: [
          makeTrade({
            id: 9,
            status: 'accepted',
            proposerTeamId: 2,
            counterpartTeamId: 3,
          }),
        ],
      },
      refetch: jest.fn().mockResolvedValue({}),
    };
    const onTradeExecuted = jest.fn();
    const { getByTestId } = render(
      <DraftSlotTradePanel
        {...makeProps({
          canManageOwnTeam: false,
          isCommissioner: true,
          onTradeExecuted,
        })}
      />,
    );
    expect(getByTestId('trade-approval-9')).toBeTruthy();
    fireEvent.click(getByTestId('trade-approve-9'));

    await waitFor(() => {
      expect(mockApproveFn).toHaveBeenCalledWith({ variables: { tradeId: 9 } });
      expect(onTradeExecuted).toHaveBeenCalled();
    });
  });

  it('does not render the propose control for a user without a manageable team', () => {
    const { queryByTestId } = render(
      <DraftSlotTradePanel
        {...makeProps({ canManageOwnTeam: false, isCommissioner: false })}
      />,
    );
    expect(queryByTestId('trade-panel-counterpart-select')).toBeNull();
  });

  it('does not render the propose control for a commissioner without an own team', () => {
    // canManageOwnTeam is true for the commissioner role even when they have
    // no team of their own — the backend derives proposerTeamId from team
    // membership, so proposing would fail without myTeamId.
    const { queryByTestId } = render(
      <DraftSlotTradePanel
        {...makeProps({
          myTeamId: null,
          canManageOwnTeam: true,
          isCommissioner: true,
        })}
      />,
    );
    expect(queryByTestId('trade-panel-counterpart-select')).toBeNull();
  });
});

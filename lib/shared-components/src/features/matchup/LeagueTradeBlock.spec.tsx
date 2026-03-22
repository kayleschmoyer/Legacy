import React from 'react';
import { LeagueTradeBlock } from './LeagueTradeBlock';
import { render } from '../../test-utils';
import {
  useGetLeagueTradeBlockQuery,
  useSetTradeBlockMutation,
} from '../../api/db/graphql.generated';

jest.mock('../../api/db/graphql.generated');

const mockSetTradeBlock = jest.fn();

const mockPlayers = [
  {
    id: 1,
    teamId: 1,
    playerId: 10,
    player: { firstName: 'Mike', lastName: 'Trout' },
  },
  {
    id: 2,
    teamId: 2,
    playerId: 20,
    player: { firstName: 'Shohei', lastName: 'Ohtani' },
  },
  {
    id: 3,
    teamId: 1,
    playerId: 30,
    player: { firstName: 'Mookie', lastName: 'Betts' },
  },
];

function setupMock(
  overrides: Partial<ReturnType<typeof useGetLeagueTradeBlockQuery>> = {},
) {
  jest.mocked(useGetLeagueTradeBlockQuery).mockReturnValue({
    data: { leagueTradeBlock: mockPlayers },
    loading: false,
    error: undefined,
    ...overrides,
  } as unknown as ReturnType<typeof useGetLeagueTradeBlockQuery>);

  jest
    .mocked(useSetTradeBlockMutation)
    .mockReturnValue([
      mockSetTradeBlock,
      { loading: false },
    ] as unknown as ReturnType<typeof useSetTradeBlockMutation>);
}

describe('LeagueTradeBlock', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the Trade Block header', () => {
    setupMock();
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('Trade Block')).toBeTruthy();
  });

  it('renders player names', () => {
    setupMock();
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('Mike Trout')).toBeTruthy();
    expect(getByText('Shohei Ohtani')).toBeTruthy();
    expect(getByText('Mookie Betts')).toBeTruthy();
  });

  it('shows the count badge', () => {
    setupMock();
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('3 available')).toBeTruthy();
  });

  it('shows Remove button for own-team players', () => {
    setupMock();
    const { getAllByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    // Mike Trout (teamId=1) and Mookie Betts (teamId=1) are own-team
    const removeButtons = getAllByText('Remove');
    expect(removeButtons).toHaveLength(2);
  });

  it('shows AVAILABLE badge for other-team players', () => {
    setupMock();
    const { getAllByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    // Shohei Ohtani (teamId=2) is other-team
    const availableBadges = getAllByText('AVAILABLE');
    expect(availableBadges).toHaveLength(1);
  });

  it('shows empty state when no players on trade block', () => {
    setupMock({ data: { leagueTradeBlock: [] } });
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('No players on the trade block')).toBeTruthy();
  });

  it('shows error state', () => {
    setupMock({
      data: undefined,
      error: new Error('Network error') as unknown as ReturnType<
        typeof useGetLeagueTradeBlockQuery
      >['error'],
    });
    const { getByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    expect(getByText('Failed to load trade block.')).toBeTruthy();
  });

  it('shows loading spinner', () => {
    setupMock({ data: undefined, loading: true });
    const { getByText, container } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={1} />,
    );
    // Header still renders during loading
    expect(getByText('Trade Block')).toBeTruthy();
    // No player names should appear
    expect(container.innerHTML).not.toContain('Mike Trout');
  });

  it('shows AVAILABLE for all players when userTeamId is null', () => {
    setupMock();
    const { getAllByText, queryAllByText } = render(
      <LeagueTradeBlock leagueId={1} userTeamId={null} />,
    );
    expect(getAllByText('AVAILABLE')).toHaveLength(3);
    expect(queryAllByText('Remove')).toHaveLength(0);
  });
});

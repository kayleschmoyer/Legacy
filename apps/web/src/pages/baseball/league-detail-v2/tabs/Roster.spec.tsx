/**
 * Tests for RosterTab future-week lineup editing (LS-10815).
 *
 * A lineup edit made while viewing an upcoming week must be scoped to that
 * week (the mutation carries its `weekNumber`) and the board must show that
 * week's lineup (its matchup_players rows), not the current week's
 * `team_members` lineup.
 */
import React from 'react';
import { act, render } from '@testing-library/react';

import { RosterTab } from './Roster';

// --- shared roster components: capture props ---------------------------------
interface BoardProps {
  teamPlayers: ReadonlyArray<{ id: number; positionId: number | null }>;
  onPlayerSwap: (incoming: object, target: object, displaced: object) => void;
}
let boardProps: BoardProps | null = null;
let onWeekChange: ((week: number) => void) | null = null;
jest.mock('@legacy-sports/shared-components/roster', () => ({
  RosterActionBar: () => null,
  RosterOverLimitNotice: () => null,
  RosterStatusBanners: () => null,
  RosterScoreboard: (props: { onWeekChange: (week: number) => void }) => {
    onWeekChange = props.onWeekChange;
    return null;
  },
  RosterBoard: (props: BoardProps) => {
    boardProps = props;
    return null;
  },
}));
jest.mock('@legacy-sports/shared-components/matchup', () => ({
  computeFootballMatchupTotals: () => ({}),
  PendingTradeOfferBanner: () => null,
  useFootballMatchupScores: () => ({ playerScores: [], teamScores: [] }),
}));

// --- GraphQL ----------------------------------------------------------------
const SP = { __typename: 'LeaguePosition', id: 1, positionType: 'SP' };
const NOLAN = { id: 101, playerId: 501, positionId: 1, teamId: 7 };
const LESTER = { id: 102, playerId: 502, positionId: null, teamId: 7 };

const mockSwap = jest.fn(() => Promise.resolve({}));
const mockUpdate = jest.fn(() => Promise.resolve({}));
const mockMatchupPlayers = jest.fn<
  { data: { getMatchupPlayers: object[] }; error: null; refetch: jest.Mock },
  [{ variables: { matchupId: number } }]
>();
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useGetPositionsForLeagueQuery: () => ({ data: { leaguePositions: [SP] } }),
  useGetTeamMembersQuery: () => ({
    data: { teamMembers: [NOLAN, LESTER] },
    loading: false,
    error: null,
    refetch: jest.fn(() => Promise.resolve()),
  }),
  useGetMatchupPlayersQuery: (opts: { variables: { matchupId: number } }) =>
    mockMatchupPlayers(opts),
  useGetNflTeamSeasonMetadataQuery: () => ({ data: undefined }),
  useSwapTeamMemberPositionsMutation: () => [mockSwap],
  useUpdateTeamMemberPositionMutation: () => [mockUpdate],
}));

// --- app hooks / heavy children ------------------------------------------------
jest.mock('react-router-dom', () => ({ useNavigate: () => jest.fn() }));
jest.mock('../../../../hooks/useMatchup', () => ({
  // Week 1 → matchup 11, Week 2 → matchup 12.
  useMatchupsByWeek: (_leagueId: number | null, week: number) => ({
    matchups: [{ id: 10 + week, team1Id: 7, team2Id: 8 }],
  }),
  useMatchupById: () => ({ matchup: null }),
}));
jest.mock('../../../../hooks/useIsPremium', () => ({
  useHasEntitlement: () => true,
}));
jest.mock('../../../../lib/scoring', () => ({
  useLeagueScoringSettings: () => ({ settings: null }),
}));
jest.mock('../../../../lib/scoring/mapGraphQLToScoringFormat', () => ({
  mapMatchupPlayerToSeasonStats: () => null,
}));
jest.mock('../../../../features/matchup/MatchupScoreboard', () => ({
  computeFootballMatchupPlayerStats: () => [],
  computeMatchupPlayerStats: () => [],
  computeMatchupScores: () => ({}),
}));
jest.mock('../../../../features/roster', () => ({
  PendingWaiverClaims: () => null,
}));
jest.mock('../../../../components/PremiumGate', () => ({
  PremiumGate: () => null,
}));

// No TamaguiProvider in this suite, so `useMedia` isn't callable.
jest.mock('tamagui', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => (
    <div>{children}</div>
  );
  return {
    Button: Pass,
    Text: Pass,
    XStack: Pass,
    YStack: Pass,
    useMedia: () => ({ md: false }),
  };
});

const league = {
  id: 3,
  sport: 'baseball',
  currentWeekNumber: 1,
  totalMatchups: 3,
} as unknown as React.ComponentProps<typeof RosterTab>['league'];

/** Week 2 already plans Lester at SP and Nolan on the bench. */
function matchupRowsFor(matchupId: number) {
  if (matchupId !== 12) return [];
  return [
    { playerId: 501, teamId: 7, positionId: null },
    { playerId: 502, teamId: 7, positionId: 1 },
  ];
}

beforeEach(() => {
  boardProps = null;
  onWeekChange = null;
  mockSwap.mockClear();
  mockUpdate.mockClear();
  mockMatchupPlayers.mockImplementation(({ variables }) => ({
    data: { getMatchupPlayers: matchupRowsFor(variables.matchupId) },
    error: null,
    refetch: jest.fn(() => Promise.resolve()),
  }));
});

function positionOf(playerId: number) {
  return boardProps?.teamPlayers.find((p) => p.id === playerId)?.positionId;
}

describe('RosterTab — future-week lineup scope (LS-10815)', () => {
  it('shows the current week from team_members and edits it without a week', () => {
    render(<RosterTab league={league} myTeamId={7} />);

    expect(positionOf(NOLAN.id)).toBe(1);
    expect(positionOf(LESTER.id)).toBeNull();

    act(() => boardProps?.onPlayerSwap(LESTER, SP, NOLAN));
    expect(mockSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ weekNumber: undefined }),
      }),
    );
  });

  it("shows an upcoming week's own lineup and scopes edits to that week", () => {
    render(<RosterTab league={league} myTeamId={7} />);
    act(() => onWeekChange?.(2));

    expect(positionOf(NOLAN.id)).toBeNull();
    expect(positionOf(LESTER.id)).toBe(1);

    act(() => boardProps?.onPlayerSwap(NOLAN, SP, LESTER));
    expect(mockSwap).toHaveBeenCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({
          teamMemberIdA: NOLAN.id,
          positionIdA: SP.id,
          teamMemberIdB: LESTER.id,
          weekNumber: 2,
        }),
      }),
    );
  });

  it('falls back to team_members for an upcoming week with no lineup rows', () => {
    render(<RosterTab league={league} myTeamId={7} />);
    act(() => onWeekChange?.(3));

    expect(positionOf(NOLAN.id)).toBe(1);
    expect(positionOf(LESTER.id)).toBeNull();
  });
});

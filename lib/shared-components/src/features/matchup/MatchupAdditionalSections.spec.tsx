import type { MatchupFragment } from '@legacy-sports/graphql';
import { MatchupAdditionalSections } from './MatchupAdditionalSections';
import { render } from '../../test-utils';

const mockUseMatchupScoresQuery = jest.fn<{ data: unknown }, unknown[]>();
const mockUseGetTeamMatchupHistoryQuery = jest.fn<
  { data: unknown },
  unknown[]
>();
const mockUseGetLeagueStandingsQuery = jest.fn<{ data: unknown }, unknown[]>();
const mockUseGetPlayoffProjectionsQuery = jest.fn<
  { data: unknown },
  unknown[]
>();

jest.mock('@legacy-sports/graphql', () => ({
  MatchupStatus: { Completed: 'completed' },
  useMatchupScoresQuery: (...args: unknown[]) =>
    mockUseMatchupScoresQuery(...args),
  useGetTeamMatchupHistoryQuery: (...args: unknown[]) =>
    mockUseGetTeamMatchupHistoryQuery(...args),
  useGetLeagueStandingsQuery: (...args: unknown[]) =>
    mockUseGetLeagueStandingsQuery(...args),
  useGetPlayoffProjectionsQuery: (...args: unknown[]) =>
    mockUseGetPlayoffProjectionsQuery(...args),
}));

const baseMatchup: MatchupFragment = {
  __typename: 'Matchup',
  id: '1',
  weekNumber: 3,
  leagueId: 100,
  team1Id: 10,
  team2Id: 20,
  team1Score: null,
  team2Score: null,
  status: 'scheduled',
  statsLoadingStatus: null,
  gamesPerMatchup: null,
  pitcherStartsPerMatchup: null,
  selectedGamesCount: null,
  startTime: null,
  endTime: null,
  team1: { __typename: 'Team', id: '10', name: 'Team Alpha' },
  team2: { __typename: 'Team', id: '20', name: 'Team Beta' },
} as unknown as MatchupFragment;

function football(teamId: number, teamName: string, players: unknown[]) {
  return {
    __typename: 'FootballMatchupStats',
    teamId,
    teamName,
    totalPoints: 0,
    players,
  };
}

function player(playerId: number, playerName: string, totalPoints: number) {
  return { playerId, playerName, position: 'WR', totalPoints };
}

describe('MatchupAdditionalSections', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseGetTeamMatchupHistoryQuery.mockReturnValue({
      data: { getTeamMatchupHistory: [] },
    });
    mockUseGetLeagueStandingsQuery.mockReturnValue({
      data: { getLeagueStandings: [] },
    });
    mockUseGetPlayoffProjectionsQuery.mockReturnValue({
      data: { getPlayoffProjections: [] },
    });
  });

  it('shows an empty state when no scores are loaded yet', () => {
    mockUseMatchupScoresQuery.mockReturnValue({ data: undefined });
    const { getByText } = render(
      <MatchupAdditionalSections matchup={baseMatchup} leagueId={100} />,
    );
    expect(getByText('No key player data available yet.')).toBeTruthy();
  });

  it('picks the top 2 highest-scoring players per team, not top-N combined', () => {
    mockUseMatchupScoresQuery.mockReturnValue({
      data: {
        matchupScores: [
          football(10, 'Team Alpha', [
            player(1, 'Alpha One', 30),
            player(2, 'Alpha Two', 25),
            player(3, 'Alpha Three', 20),
          ]),
          football(20, 'Team Beta', [
            player(4, 'Beta One', 15),
            player(5, 'Beta Two', 10),
          ]),
        ],
      },
    });

    const { getByText, queryByText } = render(
      <MatchupAdditionalSections matchup={baseMatchup} leagueId={100} />,
    );

    // Top 2 for Team Alpha survive, the 3rd-highest scorer does not.
    expect(getByText('Alpha One')).toBeTruthy();
    expect(getByText('Alpha Two')).toBeTruthy();
    expect(queryByText('Alpha Three')).toBeNull();

    // Both Team Beta players (only 2 available) are included.
    expect(getByText('Beta One')).toBeTruthy();
    expect(getByText('Beta Two')).toBeTruthy();
  });

  it('attaches reasoning text distinguishing the top scorer from the runner-up', () => {
    mockUseMatchupScoresQuery.mockReturnValue({
      data: {
        matchupScores: [
          football(10, 'Team Alpha', [
            player(1, 'Alpha One', 30),
            player(2, 'Alpha Two', 25),
          ]),
        ],
      },
    });

    const { getByText } = render(
      <MatchupAdditionalSections matchup={baseMatchup} leagueId={100} />,
    );

    expect(getByText("Team Alpha's top scorer this week")).toBeTruthy();
    expect(
      getByText("Team Alpha's second-highest scorer this week"),
    ).toBeTruthy();
  });

  it('shows a "Win to clinch playoffs" banner when a team can clinch by winning this matchup', () => {
    mockUseMatchupScoresQuery.mockReturnValue({ data: undefined });
    mockUseGetPlayoffProjectionsQuery.mockReturnValue({
      data: {
        getPlayoffProjections: [
          { teamId: 10, magicNumber: 1, eliminationNumber: null },
        ],
      },
    });

    const { getByText } = render(
      <MatchupAdditionalSections matchup={baseMatchup} leagueId={100} />,
    );

    expect(getByText('Win to clinch playoffs')).toBeTruthy();
  });

  it('shows a "Lose and you are eliminated" banner when a team is eliminated by losing this matchup', () => {
    mockUseMatchupScoresQuery.mockReturnValue({ data: undefined });
    mockUseGetPlayoffProjectionsQuery.mockReturnValue({
      data: {
        getPlayoffProjections: [
          { teamId: 20, magicNumber: null, eliminationNumber: 1 },
        ],
      },
    });

    const { getByText } = render(
      <MatchupAdditionalSections matchup={baseMatchup} leagueId={100} />,
    );

    expect(getByText('Lose and you are eliminated')).toBeTruthy();
  });

  it('shows no playoff implication banner when neither team is at a clinch/elimination edge', () => {
    mockUseMatchupScoresQuery.mockReturnValue({ data: undefined });

    const { queryByText } = render(
      <MatchupAdditionalSections matchup={baseMatchup} leagueId={100} />,
    );

    expect(queryByText('Win to clinch playoffs')).toBeNull();
    expect(queryByText('Lose and you are eliminated')).toBeNull();
  });

  it('does not query playoff projections once the matchup is completed', () => {
    mockUseMatchupScoresQuery.mockReturnValue({ data: undefined });

    render(
      <MatchupAdditionalSections
        matchup={{ ...baseMatchup, status: 'completed' }}
        leagueId={100}
      />,
    );

    expect(mockUseGetPlayoffProjectionsQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
  });
});

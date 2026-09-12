import React from 'react';
import {
  buildStatCategoryLines,
  FootballScoringBreakdown,
  type FootballScoringBreakdownGame,
  type FootballScoringBreakdownTeam,
  toFootballScoringBreakdownTeams,
} from './FootballScoringBreakdown';
import { fireEvent, render, screen } from '../../test-utils';

/**
 * LS-6393 (FMD-029) — mobile football matchup had no per-player box score.
 * These specs pin the two things the section is for: every stat group a
 * football player can produce reaches the expanded row, and a collapsed row
 * shows none of it.
 */

const quarterbackGame: FootballScoringBreakdownGame = {
  gameNum: 1,
  opponent: 'DAL',
  fantasyPoints: 21.4,
  passing: { cmp: 22, att: 31, yds: 254, td: 2, int: 1 },
  rushing: { att: 3, yds: 18, td: 0 },
};

const quarterback = {
  playerId: 11,
  playerName: 'Joe Burrow',
  position: 'QB',
  totalPoints: 21.4,
  projectedPoints: 19.2,
  games: [quarterbackGame],
};

const team: FootballScoringBreakdownTeam = {
  teamId: 1,
  teamName: 'Bengal Stripes',
  totalPoints: 108.6,
  players: [quarterback],
};

describe('buildStatCategoryLines', () => {
  it('formats every football stat group a player can produce', () => {
    const lines = buildStatCategoryLines({
      gameNum: 1,
      fantasyPoints: 30,
      passing: { cmp: 22, att: 31, yds: 254, td: 2, int: 1 },
      rushing: { att: 3, yds: 18, td: 1 },
      receiving: { rec: 4, tgt: 7, yds: 61, td: 1 },
      kicking: { fgm: 2, fga: 3, xpm: 4, xpa: 4 },
      defense: { sacks: 3, int: 1, fumRec: 1, ptsAllowed: 10, ydsAllowed: 280 },
      idp: { soloTkl: 6, astTkl: 2, sacks: 1, pd: 2 },
    });

    expect(lines).toEqual([
      { label: 'Pass', value: '22/31, 254 YDS, 2 TD, 1 INT' },
      { label: 'Rush', value: '3 ATT, 18 YDS, 1 TD' },
      { label: 'Rec', value: '4/7 REC, 61 YDS, 1 TD' },
      { label: 'Kick', value: '2/3 FG, 4/4 XP' },
      { label: 'Def', value: '3 SACK, 1 INT, 1 FR, 10 PA, 280 YA' },
      { label: 'IDP', value: '6 SOLO, 2 AST, 1 SACK, 2 PD' },
    ]);
  });

  it('drops a stat group whose every term is zero', () => {
    const lines = buildStatCategoryLines({
      gameNum: 1,
      fantasyPoints: 12,
      rushing: { att: 9, yds: 41, td: 0 },
      receiving: { rec: 0, tgt: 0, yds: 0, td: 0 },
    });

    expect(lines).toEqual([{ label: 'Rush', value: '9 ATT, 41 YDS' }]);
  });

  it('keeps a missed-attempt pair but not an empty one', () => {
    const lines = buildStatCategoryLines({
      gameNum: 1,
      fantasyPoints: 3,
      kicking: { fgm: 0, fga: 2, xpm: 0, xpa: 0 },
    });

    expect(lines).toEqual([{ label: 'Kick', value: '0/2 FG' }]);
  });
});

describe('toFootballScoringBreakdownTeams', () => {
  it('picks out the two matchup teams in team1-then-team2 order', () => {
    const teams = toFootballScoringBreakdownTeams(
      [
        {
          __typename: 'FootballMatchupStats',
          teamId: 7,
          teamName: 'Away',
          totalPoints: 91.2,
          players: [],
        },
        {
          __typename: 'FootballMatchupStats',
          teamId: 3,
          teamName: 'Home',
          totalPoints: 104.8,
          players: [quarterback],
        },
        {
          __typename: 'FootballMatchupStats',
          teamId: 9,
          teamName: 'Unrelated matchup',
          totalPoints: 77,
          players: [],
        },
      ],
      [3, 7],
    );

    expect(teams.map((entry) => entry.teamId)).toEqual([3, 7]);
    expect(teams[0].teamName).toBe('Home');
    expect(teams[0].players).toHaveLength(1);
  });

  it('drops teams with no stats entry yet and ignores null ids', () => {
    expect(toFootballScoringBreakdownTeams([], [1, null])).toEqual([]);
    expect(toFootballScoringBreakdownTeams(undefined, [1])).toEqual([]);
  });

  it('ignores non-football stat entries', () => {
    expect(
      toFootballScoringBreakdownTeams(
        [
          {
            __typename: 'BaseballMatchupStats',
            teamId: 1,
            teamName: 'Baseball',
            totalPoints: 5,
            players: [],
          },
        ],
        [1],
      ),
    ).toEqual([]);
  });
});

describe('FootballScoringBreakdown', () => {
  it('renders nothing until the week has any rostered players', () => {
    const { container } = render(<FootballScoringBreakdown teams={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a spinner while the scores query is in flight', () => {
    render(<FootballScoringBreakdown teams={[]} loading />);
    expect(
      screen.getByTestId('football-scoring-breakdown-loading'),
    ).toBeTruthy();
  });

  it('lists each player with their total, collapsed by default', () => {
    render(<FootballScoringBreakdown teams={[team]} />);

    expect(screen.getByText('Bengal Stripes · Box Score')).toBeTruthy();
    expect(screen.getByText('Joe Burrow')).toBeTruthy();
    expect(screen.getByText('21.4')).toBeTruthy();
    expect(screen.queryByText('22/31, 254 YDS, 2 TD, 1 INT')).toBeNull();
  });

  it('reveals the per-game stat lines when the player row is tapped', () => {
    render(<FootballScoringBreakdown teams={[team]} />);

    fireEvent.click(screen.getByTestId('breakdown-player-toggle-11'));

    expect(screen.getByText('vs DAL')).toBeTruthy();
    expect(screen.getByText('21.4 pts')).toBeTruthy();
    expect(screen.getByText('22/31, 254 YDS, 2 TD, 1 INT')).toBeTruthy();
    expect(screen.getByText('3 ATT, 18 YDS')).toBeTruthy();
  });

  it('expands from the keyboard, not just a pointer', () => {
    render(<FootballScoringBreakdown teams={[team]} />);

    const toggle = screen.getByTestId('breakdown-player-toggle-11');
    expect(toggle).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(toggle, { key: 'Enter' });

    expect(screen.getByText('vs DAL')).toBeTruthy();
  });

  it('collapses again on a second tap', () => {
    render(<FootballScoringBreakdown teams={[team]} />);

    fireEvent.click(screen.getByTestId('breakdown-player-toggle-11'));
    fireEvent.click(screen.getByTestId('breakdown-player-toggle-11'));

    expect(screen.queryByText('vs DAL')).toBeNull();
  });

  it('expands players independently of one another', () => {
    render(
      <FootballScoringBreakdown
        teams={[
          {
            ...team,
            players: [
              quarterback,
              {
                playerId: 12,
                playerName: 'Chase Brown',
                position: 'RB',
                totalPoints: 9.1,
                games: [
                  {
                    gameNum: 1,
                    opponent: 'DAL',
                    fantasyPoints: 9.1,
                    rushing: { att: 14, yds: 61, td: 0 },
                  },
                ],
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('breakdown-player-toggle-12'));

    expect(screen.getByText('14 ATT, 61 YDS')).toBeTruthy();
    expect(screen.queryByText('22/31, 254 YDS, 2 TD, 1 INT')).toBeNull();
  });

  it('explains an expanded player who logged no game this week', () => {
    render(
      <FootballScoringBreakdown
        teams={[
          {
            ...team,
            players: [{ ...quarterback, games: [] }],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('breakdown-player-toggle-11'));

    expect(screen.getByText('No games played this week')).toBeTruthy();
  });

  it('explains a game that recorded no stats at all', () => {
    render(
      <FootballScoringBreakdown
        teams={[
          {
            ...team,
            players: [
              {
                ...quarterback,
                games: [{ gameNum: 2, opponent: 'PIT', fantasyPoints: 0 }],
              },
            ],
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByTestId('breakdown-player-toggle-11'));

    expect(screen.getByText('No recorded stats')).toBeTruthy();
  });

  it('renders a card per team', () => {
    render(
      <FootballScoringBreakdown
        teams={[team, { ...team, teamId: 2, teamName: 'Steel Curtain' }]}
      />,
    );

    expect(
      screen.getByTestId('football-scoring-breakdown-team-1'),
    ).toBeTruthy();
    expect(
      screen.getByTestId('football-scoring-breakdown-team-2'),
    ).toBeTruthy();
  });
});

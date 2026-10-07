/**
 * Regression gate for LS-4268 / LS-3823 / LS-4214:
 * DraftCompleteView must render the "Draft Complete!" banner.
 *
 * After 9 incidents of the live-draft Phase 5 assertion failing because
 * "Draft Complete!" was not visible, this spec pins the component's output
 * so any removal of the banner text fails fast in CI rather than surfacing
 * as a flaky E2E timeout.
 */
import React from 'react';
import { DraftCompleteView } from './DraftCompleteView';
import type { DraftPickRecord, DraftPlayer } from './types';
import { fireEvent, render } from '../../test-utils';

function buildLargeRoster(count: number): {
  picks: DraftPickRecord[];
  players: DraftPlayer[];
  statsLookup: Map<number, DraftPlayer>;
} {
  const players: DraftPlayer[] = Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Player ${i + 1}`,
    position: 'OF',
    avg: 0.3,
    hr: 10,
    rbi: 40,
    runs: 30,
    sb: 5,
    games: 100,
    hits: 100,
    obp: 0.35,
    slg: 0.45,
  }));
  const picks: DraftPickRecord[] = players.map((player, i) => ({
    id: String(i + 1),
    draftId: 1,
    round: i + 1,
    pickNumber: 1,
    overallPick: i + 1,
    pickedAt: new Date(0).toISOString(),
    teamId: 1,
    playerId: player.id,
  }));
  const statsLookup = new Map(players.map((p) => [p.id, p]));
  return { picks, players, statsLookup };
}

const defaultProps = {
  draftSummary: { isMock: false, name: 'Test League' },
  leagueId: 1,
  sport: 'baseball' as const,
  pickHistory: [],
  myTeamId: 1,
  myTeam: [],
  myTeamPicks: [],
  leagueTeams: [],
  statsLookup: new Map(),
  onNavigate: jest.fn(),
};

describe('DraftCompleteView', () => {
  it('renders the "Draft Complete!" banner (primary regression gate)', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(getByText('Draft Complete!')).toBeTruthy();
  });

  it('shows real-draft completion message when isMock is false', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(
      getByText(/all 0 picks have been made\. your roster is set!/i),
    ).toBeTruthy();
  });

  it('shows mock-draft completion message when isMock is true', () => {
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        draftSummary={{ isMock: true, name: 'Test League' }}
      />,
    );
    expect(
      getByText(/no rosters were saved — this was a practice draft/i),
    ).toBeTruthy();
  });

  it('shows "Set My Lineup" and "Back to League" CTAs for real drafts', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(getByText('Set My Lineup')).toBeTruthy();
    expect(getByText('Back to League')).toBeTruthy();
  });

  it('shows "Practice Again" and "Go to My Leagues" CTAs for mock drafts', () => {
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        draftSummary={{ isMock: true, name: 'Test League' }}
      />,
    );
    expect(getByText('Practice Again')).toBeTruthy();
    expect(getByText('Go to My Leagues')).toBeTruthy();
  });

  it('navigates to roster when "Set My Lineup" is clicked', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <DraftCompleteView {...defaultProps} onNavigate={onNavigate} />,
    );
    getByText('Set My Lineup').click();
    expect(onNavigate).toHaveBeenCalledWith('/baseball/league/1/roster');
  });

  // Regression for LS-9240: a roster with more than 7 picks used to overflow
  // an unscrollable, clipped column and bury the "Go to My Leagues" / "Back
  // to League" CTA off the top of the screen on mobile. This can't assert
  // real layout/overflow in jsdom, but it pins that the CTA and the full
  // roster grid both still render together for a large roster — a regression
  // that dropped the ScrollView wrapper (or the CTA above a large grid)
  // would show up as a missing node here.
  it('renders the "Go to My Leagues" CTA alongside a full roster of more than 7 picks', () => {
    const { picks, players, statsLookup } = buildLargeRoster(15);
    const { getByText, getAllByText } = render(
      <DraftCompleteView
        {...defaultProps}
        draftSummary={{ isMock: true, name: 'Test League' }}
        pickHistory={picks}
        myTeam={players}
        myTeamPicks={picks}
        statsLookup={statsLookup}
      />,
    );
    expect(getByText('Go to My Leagues')).toBeTruthy();
    expect(getByText('Your Roster (15 players)')).toBeTruthy();
    expect(getAllByText(/Player \d+/)).toHaveLength(15);
  });

  // LS-10528: CTAs route by the draft's sport instead of hard-coding baseball.
  it('routes the league CTAs to football pages for a football draft', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        sport="football"
        onNavigate={onNavigate}
      />,
    );
    getByText('Set My Lineup').click();
    expect(onNavigate).toHaveBeenLastCalledWith('/football/league/1/roster');
    getByText('Back to League').click();
    expect(onNavigate).toHaveBeenLastCalledWith('/football/league/1');
  });

  it('sends a football mock draft home to /football', () => {
    const onNavigate = jest.fn();
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        sport="football"
        draftSummary={{ isMock: true, name: 'Mock' }}
        onNavigate={onNavigate}
      />,
    );
    getByText('Practice Again').click();
    expect(onNavigate).toHaveBeenLastCalledWith('/baseball/mock-draft');
    getByText('Go to My Leagues').click();
    expect(onNavigate).toHaveBeenLastCalledWith('/football');
  });
  // LS-10827: NFL Draft Complete rendered BaseballCard for every team tab —
  // AVG/HR/RBI/SB cells and a "⚾ LEGACY SPORTS ⚾" strip on football players.
  describe('roster cards by sport (LS-10827)', () => {
    const footballPlayers: DraftPlayer[] = [
      {
        id: 1,
        name: 'Josh Allen',
        position: 'QB',
        avg: 0,
        hr: 0,
        rbi: 0,
        runs: 0,
        sb: 0,
        games: 0,
        hits: 0,
        obp: 0,
        slg: 0,
        passYds: 22000,
        passTd: 150,
        rushYds: 4000,
        rushTd: 60,
      },
      {
        id: 2,
        name: 'Gary Anderson',
        position: 'K',
        avg: 0,
        hr: 0,
        rbi: 0,
        runs: 0,
        sb: 0,
        games: 0,
        hits: 0,
        obp: 0,
        slg: 0,
        fg: 538,
      },
    ];
    const footballPicks: DraftPickRecord[] = footballPlayers.map((p, i) => ({
      id: String(i + 1),
      draftId: 1,
      round: 1,
      pickNumber: i + 1,
      overallPick: i + 1,
      pickedAt: new Date(0).toISOString(),
      // One player per team so both team tabs are exercised.
      teamId: i + 1,
      playerId: p.id,
    }));
    const footballProps = {
      ...defaultProps,
      sport: 'football' as const,
      pickHistory: footballPicks,
      myTeamPicks: [footballPicks[0]],
      myTeam: [footballPlayers[0]],
      leagueTeams: [
        { id: '1', name: 'Mine', leagueId: 1 },
        { id: '2', name: 'Kayles', leagueId: 1 },
      ],
      statsLookup: new Map(footballPlayers.map((p) => [p.id, p])),
    };

    function expectNoBaseballCard(utils: ReturnType<typeof render>): void {
      for (const label of ['AVG', 'HR', 'RBI', 'SB', 'ERA']) {
        expect(utils.queryByText(label)).toBeNull();
      }
      expect(utils.queryAllByLabelText('baseball')).toHaveLength(0);
    }

    it('renders football cards with no baseball stats or emoji on every team tab', () => {
      const utils = render(<DraftCompleteView {...footballProps} />);

      expect(utils.getByText('Josh Allen')).toBeTruthy();
      expect(utils.getByText('PASS YDS')).toBeTruthy();
      expect(utils.getByText('22000')).toBeTruthy();
      expect(utils.getAllByLabelText('football').length).toBeGreaterThan(0);
      expectNoBaseballCard(utils);

      fireEvent.click(utils.getByText('Kayles'));
      expect(utils.getByText('Gary Anderson')).toBeTruthy();
      expect(utils.getByText('FG')).toBeTruthy();
      expect(utils.getByText('538')).toBeTruthy();
      expectNoBaseballCard(utils);
    });

    it('keeps the baseball card for an MLB draft', () => {
      const { picks, players, statsLookup } = buildLargeRoster(1);
      const utils = render(
        <DraftCompleteView
          {...defaultProps}
          pickHistory={picks}
          myTeam={players}
          myTeamPicks={picks}
          statsLookup={statsLookup}
        />,
      );
      expect(utils.getByText('AVG')).toBeTruthy();
      expect(utils.getByText('HR')).toBeTruthy();
      expect(utils.getAllByLabelText('baseball').length).toBeGreaterThan(0);
      expect(utils.queryByText('PASS YDS')).toBeNull();
    });
  });
});

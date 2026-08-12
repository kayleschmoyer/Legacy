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
import { render } from '../../test-utils';

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
  league: { isMockDraft: false, name: 'Test League' },
  leagueId: 1,
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

  it('shows real-draft completion message when isMockDraft is false', () => {
    const { getByText } = render(<DraftCompleteView {...defaultProps} />);
    expect(
      getByText(/all 0 picks have been made\. your roster is set!/i),
    ).toBeTruthy();
  });

  it('shows mock-draft completion message when isMockDraft is true', () => {
    const { getByText } = render(
      <DraftCompleteView
        {...defaultProps}
        league={{ isMockDraft: true, name: 'Test League' }}
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
        league={{ isMockDraft: true, name: 'Test League' }}
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
        league={{ isMockDraft: true, name: 'Test League' }}
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
});

import React from 'react';
import { DraftRoomRecap } from './DraftRoomRecap';
import type { DraftPickRecord, DraftPlayer, LeagueTeam } from './types';
import { fireEvent, render } from '../../test-utils';

function makePlayer(overrides: Partial<DraftPlayer>): DraftPlayer {
  return {
    id: 0,
    name: '',
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
    ...overrides,
  };
}

function makePick(overrides: Partial<DraftPickRecord>): DraftPickRecord {
  return {
    id: 'p',
    draftId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    pickedAt: '2026-08-01T00:00:00Z',
    teamId: 1,
    playerId: 0,
    ...overrides,
  };
}

// Draft-wide history: my two picks (playerId 10, 11) plus a rival's higher-
// projected player (playerId 20) picked second overall — this shapes the
// ADP-rank proxy (rank by projected points among every drafted player).
const MY_PICK_A = makePick({
  id: 'a',
  overallPick: 1,
  teamId: 1,
  playerId: 10,
});
const RIVAL_PICK = makePick({
  id: 'b',
  overallPick: 2,
  teamId: 2,
  playerId: 20,
});
const MY_PICK_B = makePick({
  id: 'c',
  overallPick: 9,
  round: 2,
  pickNumber: 1,
  teamId: 1,
  playerId: 11,
});

const PLAYER_10 = makePlayer({
  id: 10,
  name: 'Player Ten',
  position: 'QB',
  ppg: 20,
});
const PLAYER_11 = makePlayer({
  id: 11,
  name: 'Player Eleven',
  position: 'RB',
  ppg: 15,
});
const PLAYER_20 = makePlayer({
  id: 20,
  name: 'Player Twenty',
  position: 'WR',
  ppg: 25,
});

const PICK_HISTORY = [MY_PICK_A, RIVAL_PICK, MY_PICK_B];
const STATS_LOOKUP = new Map<number, DraftPlayer>([
  [10, PLAYER_10],
  [11, PLAYER_11],
  [20, PLAYER_20],
]);
// Roster slots for every position drafted above, so a rival's WR has a slot.
const LEAGUE_POSITIONS = [
  { positionType: 'QB' },
  { positionType: 'RB' },
  { positionType: 'WR' },
];
const LEAGUE_TEAMS: LeagueTeam[] = [
  { id: '1', name: 'My Squad', leagueId: 7 },
  { id: '2', name: 'CPU Team 2', leagueId: 7, isCpu: true },
];

function baseProps(
  overrides: Partial<React.ComponentProps<typeof DraftRoomRecap>> = {},
): React.ComponentProps<typeof DraftRoomRecap> {
  return {
    pickHistory: PICK_HISTORY,
    myTeamPicks: [MY_PICK_A, MY_PICK_B],
    myTeam: [PLAYER_10, PLAYER_11],
    statsLookup: STATS_LOOKUP,
    leaguePositions: LEAGUE_POSITIONS,
    sport: 'football',
    maxRosterSize: 3,
    isPremium: false,
    teamNameById: () => 'Some Team',
    leagueName: 'Test League',
    onDownloadPacket: jest.fn(),
    isMock: true,
    leagueId: null,
    myTeamId: 1,
    leagueTeams: LEAGUE_TEAMS,
    onNavigate: jest.fn(),
    ...overrides,
  };
}

describe('DraftRoomRecap', () => {
  it('computes DRAFT GRADE / PROJ PTS / ADP VALUE from the ADP-rank proxy', () => {
    // Rank by ppg desc among all 3 drafted players: 20(25)=1, 10(20)=2, 11(15)=3.
    // My pick A: overall 1 - rank 2 = -1. My pick B: overall 9 - rank 3 = 6.
    // total = 5, avg = 2.5 -> grade 'B'; proj pts = 20 + 15 = 35.0.
    const { getByText } = render(<DraftRoomRecap {...baseProps()} />);

    expect(getByText('B')).toBeTruthy();
    expect(getByText('35.0')).toBeTruthy();
    expect(getByText('+5')).toBeTruthy();
  });

  it('surfaces the single best-value pick in the BEST VALUE callout', () => {
    const { getByTestId } = render(<DraftRoomRecap {...baseProps()} />);

    const callout = getByTestId('draft-recap-best-value');
    expect(callout.textContent).toContain('Player Eleven');
    expect(callout.textContent).toContain('+6');
  });

  it('reuses DraftRosterSlotRow to render the full roster (not a reimplementation)', () => {
    const { getAllByText } = render(<DraftRoomRecap {...baseProps()} />);

    // "Player Ten" only appears once (roster row); "Player Eleven" appears
    // twice (BEST VALUE callout + its own roster row).
    expect(getAllByText('Player Ten')).toHaveLength(1);
    expect(getAllByText('Player Eleven')).toHaveLength(2);
  });

  // LS-10528: the recap is the only completion screen below the desktop tier
  // and on native, so it must carry the wide view's next steps.
  describe('next-step CTAs (LS-10528)', () => {
    it('offers Practice Again and My Leagues for a mock draft, routed by sport', () => {
      const onNavigate = jest.fn();
      const { getByTestId } = render(
        <DraftRoomRecap {...baseProps({ onNavigate })} />,
      );

      const practice = getByTestId('draft-recap-cta-practice-again');
      expect(practice.textContent).toContain('Practice Again');
      fireEvent.click(practice);
      expect(onNavigate).toHaveBeenLastCalledWith('/baseball/mock-draft');

      fireEvent.click(getByTestId('draft-recap-cta-my-leagues'));
      expect(onNavigate).toHaveBeenLastCalledWith('/football');
    });

    it('offers Set My Lineup and Back to League for a league draft', () => {
      const onNavigate = jest.fn();
      const { getByTestId, queryByTestId } = render(
        <DraftRoomRecap
          {...baseProps({ isMock: false, leagueId: 7, onNavigate })}
        />,
      );

      expect(queryByTestId('draft-recap-cta-practice-again')).toBeNull();
      fireEvent.click(getByTestId('draft-recap-cta-set-lineup'));
      expect(onNavigate).toHaveBeenLastCalledWith('/football/league/7/roster');
      fireEvent.click(getByTestId('draft-recap-cta-back-to-league'));
      expect(onNavigate).toHaveBeenLastCalledWith('/football/league/7');
    });

    it('renders the CTA bar outside the scrolling roster so it stays reachable', () => {
      const { getByTestId } = render(<DraftRoomRecap {...baseProps()} />);
      const bar = getByTestId('draft-recap-actions');
      expect(bar.parentElement).toBe(getByTestId('draft-room-recap'));
    });
  });

  describe('team selector (LS-10528)', () => {
    it('defaults to my roster and switches to another team on tap', () => {
      const { getByTestId, queryByText, getAllByText } = render(
        <DraftRoomRecap {...baseProps()} />,
      );

      expect(getByTestId('draft-recap-team-1').textContent).toContain(
        'My Squad (You)',
      );
      expect(queryByText('Player Twenty')).toBeNull();

      fireEvent.click(getByTestId('draft-recap-team-2'));

      expect(getAllByText('Player Twenty')).toHaveLength(1);
      // My own players leave the roster list; Player Eleven stays only in
      // the BEST VALUE callout, which always describes my draft.
      expect(queryByText('Player Ten')).toBeNull();
      expect(getAllByText('Player Eleven')).toHaveLength(1);

      fireEvent.click(getByTestId('draft-recap-team-1'));
      expect(queryByText('Player Twenty')).toBeNull();
      expect(getAllByText('Player Ten')).toHaveLength(1);
    });

    it('hides the selector when there is no other team to view', () => {
      const { queryByTestId } = render(
        <DraftRoomRecap {...baseProps({ leagueTeams: [LEAGUE_TEAMS[0]] })} />,
      );
      expect(queryByTestId('draft-recap-team-selector')).toBeNull();
    });
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EliteDraftBoardScreen } from './EliteDraftBoard';

// ---------------------------------------------------------------------------
// LeagueChatTab uses GifPicker which calls import.meta.env (Vite-only).
// Stub it out so the Jest environment can parse EliteDraftBoardScreen.
// ---------------------------------------------------------------------------
jest.mock('../features/baseball/LeagueChatTab', () => ({
  LeagueChatTab: () => null,
}));

// ---------------------------------------------------------------------------
// Apollo mock — every useQuery returns all possible top-level fields so the
// component finds the data it needs regardless of which query document was
// passed.  useMutation returns a no-op callable.
// ---------------------------------------------------------------------------

const MOCK_QUERY_DATA = {
  // GET_LEAGUE_BY_ID
  league: {
    id: 1,
    name: 'Test League',
    draftStatus: 'in-progress',
    activeDraftId: 1,
    userMembership: { permissionLevel: 'owner', teamId: 1 },
  },
  // GET_LEAGUE_TEAMS
  leagueTeams: [
    { id: '1', name: 'Team A', leagueId: 1 },
    { id: '2', name: 'Team B', leagueId: 1 },
  ],
  // GET_LEAGUE_DRAFT
  getLeagueDraft: { id: '1', draftCompletedAt: null },
  // GET_CURRENT_DRAFT_PICK
  getCurrentDraftPick: {
    draftId: 1,
    teamId: 1,
    round: 1,
    pickNumber: 1,
    overallPick: 1,
    isComplete: false,
  },
  // GET_DRAFT_PICKS
  getDraftPicks: [],
  // GET_AVAILABLE_DRAFT_PLAYERS
  getAvailableDraftPlayers: [
    { id: 1, firstName: 'Mike', lastName: 'Trout', brefId: 'troutmi01' },
    { id: 2, firstName: 'Aaron', lastName: 'Judge', brefId: 'judgeaa01' },
  ],
  // GET_DRAFT_PLAYER_STATS
  careerBattingStats: {
    edges: [
      {
        node: {
          playerId: 1,
          player: { id: 1, firstName: 'Mike', lastName: 'Trout' },
          primaryPosition: 'OF',
          games: 1500,
          hits: 1600,
          homeRuns: 360,
          rbi: 900,
          runs: 1100,
          stolenBases: 200,
          battingAverage: 0.301,
          onBasePercentage: 0.41,
          sluggingPercentage: 0.58,
          offensiveWAR: 80,
        },
        cursor: '1',
      },
      {
        node: {
          playerId: 2,
          player: { id: 2, firstName: 'Aaron', lastName: 'Judge' },
          primaryPosition: 'OF',
          games: 800,
          hits: 900,
          homeRuns: 250,
          rbi: 550,
          runs: 600,
          stolenBases: 20,
          battingAverage: 0.284,
          onBasePercentage: 0.39,
          sluggingPercentage: 0.56,
          offensiveWAR: 40,
        },
        cursor: '2',
      },
    ],
    pageInfo: { hasNextPage: false, endCursor: '2' },
  },
};

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => ({
    data: MOCK_QUERY_DATA,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  })),
  // Return a mock mutate function that resolves to {} so callers can safely
  // chain .catch() on the result.  The draft component calls
  // nudgeExpiredDraftPick(...).catch(...) and CI runners are slow enough that
  // the internal pick-timer fires during the test, triggering the nudge path.
  // Without a real Promise the `.catch` call throws a TypeError.
  useMutation: jest.fn(() => [
    jest.fn().mockResolvedValue({}),
    { loading: false, data: undefined },
  ]),
}));

/** Wrap the component with MemoryRouter so useNavigate / useParams work. */
function renderDraftBoard() {
  return render(
    <MemoryRouter initialEntries={['/baseball/league/1/draft']}>
      <Routes>
        <Route
          path="/baseball/league/:id/draft"
          element={<EliteDraftBoardScreen />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Minimal smoke + a11y semantics tests for the draft board

describe('EliteDraftBoardScreen a11y', () => {
  test('has main landmark and complementary asides', () => {
    renderDraftBoard();

    const main = screen.getByRole('main', { name: /player draft board/i });
    expect(main).toBeInTheDocument();

    const asides = screen.getAllByRole('complementary');
    // left sidebar: my team & draft controls
    expect(asides.length).toBeGreaterThanOrEqual(1);
  });

  test('exposes timer role and shows pick status', () => {
    renderDraftBoard();
    const timer = screen.getByRole('timer', {
      name: /pick timer|waiting timer/i,
    });
    expect(timer).toBeInTheDocument();
  });

  test('position filter is a radiogroup and updates aria-checked via keyboard', async () => {
    const user = userEvent.setup();
    renderDraftBoard();

    const group = screen.getByRole('radiogroup', {
      name: /filter by position/i,
    });
    expect(group).toBeInTheDocument();

    const allBtn = screen.getByRole('radio', { name: 'ALL' });
    const cBtn = screen.getByRole('radio', { name: 'C' });

    // Initial state: ALL selected
    expect(allBtn).toHaveAttribute('aria-checked', 'true');

    // Move to next with ArrowRight
    await user.click(allBtn);
    await user.keyboard('{ArrowRight}');
    expect(cBtn).toHaveAttribute('aria-checked', 'true');

    // Home should go to first (ALL)
    await user.keyboard('{Home}');
    expect(allBtn).toHaveAttribute('aria-checked', 'true');

    // End should go to last (P)
    await user.keyboard('{End}');
    const pBtn = screen.getByRole('radio', { name: 'P' });
    expect(pBtn).toHaveAttribute('aria-checked', 'true');
  });

  test('view mode is a radiogroup and toggles aria-checked', async () => {
    const user = userEvent.setup();
    renderDraftBoard();

    const group = screen.getByRole('radiogroup', { name: /view mode/i });
    expect(group).toBeInTheDocument();

    const grid = screen.getByRole('radio', { name: '⊞' });
    const list = screen.getByRole('radio', { name: '☰' });

    expect(grid).toHaveAttribute('aria-checked', 'true');
    await user.click(list);
    expect(list).toHaveAttribute('aria-checked', 'true');
  });

  test('watchlist toggle exposes aria-pressed', async () => {
    // Render with real timers so React flushes the useEffect that populates
    // allAvailablePlayers (added for pagination in LS-412). Use findAllByRole
    // so testing-library's built-in retry loop handles any async effect lag.
    renderDraftBoard();
    const watchButtons = await screen.findAllByRole('button', {
      name: /add .* to watchlist|remove .* from watchlist/i,
    });
    expect(watchButtons.length).toBeGreaterThan(0);

    // Freeze timers NOW (after buttons are in the DOM) so the 1-second
    // setInterval pick timer cannot fire and cause state-update churn
    // while userEvent.click() is settling the ARIA state change.
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const btn = watchButtons[0];
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-pressed', 'true');

    jest.useRealTimers();
  });
});

/**
 * LS-6227 — footballPlayer UNAUTHENTICATED error handling.
 * LS-6228 — back-button cold-start deep-link fallback.
 * LS-6252 — injury-status auto-refresh via Apollo pollInterval.
 *
 * Covers:
 *   1. UNAUTHENTICATED GraphQL error → storeCameFrom + navigate to /login (no error banner).
 *   2. Non-auth GraphQL error → error banner rendered, no redirect.
 *   3. Successful load → player detail rendered, no error.
 *   4. Back press with in-app history → navigate(-1).
 *   5. Back press on cold-start deep link (empty history) → navigate('/football/players').
 *   6. Detail query is polled on the shared cadence so status changes auto-refresh.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { FOOTBALL_PLAYER_DETAIL_POLL_MS } from '@legacy-sports/shared-components/football';
import { FootballPlayerDetailPage } from './FootballPlayerDetailPage';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
import { useIsPremium } from '../../hooks/useIsPremium';
import { storeCameFrom } from '../../lib/came-from';

// ── Router ───────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => ({ id: '42' }),
}));

// ── Sub-components ────────────────────────────────────────────────────────────

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('@legacy-sports/shared-components/football', () => ({
  // Sentinel value so the wiring test proves the container forwards the shared
  // constant rather than a hard-coded literal.
  FOOTBALL_PLAYER_DETAIL_POLL_MS: 54321,
  FootballPlayerDetail: ({
    error,
    player,
    onBack,
    isPremium,
    onUpgrade,
  }: {
    error?: boolean;
    player?: { firstName: string } | null;
    onBack?: () => void;
    isPremium?: boolean;
    onUpgrade?: () => void;
  }) => (
    <div>
      {error && <span>Failed to load player. Please try again.</span>}
      {player && <span>{player.firstName}</span>}
      <button onClick={onBack}>Back to Players</button>
      {!isPremium && (
        <button type="button" onClick={onUpgrade}>
          teaser-upgrade
        </button>
      )}
    </div>
  ),
}));

jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: ({ open }: { open: boolean }) =>
    open ? <span>upgrade-modal-open</span> : null,
}));

jest.mock('../../hooks/useIsPremium', () => ({ useIsPremium: jest.fn() }));

jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));

const mockUseIsPremium = useIsPremium as jest.MockedFunction<
  typeof useIsPremium
>;

// ── came-from ────────────────────────────────────────────────────────────────

jest.mock('../../lib/came-from', () => ({ storeCameFrom: jest.fn() }));

// ── GraphQL ───────────────────────────────────────────────────────────────────

jest.mock('../../api/db/graphql.generated', () => ({
  useFootballPlayerQuery: jest.fn(),
}));

const mockUseFootballPlayerQuery =
  useFootballPlayerQuery as jest.MockedFunction<typeof useFootballPlayerQuery>;
const mockStoreCameFrom = storeCameFrom as jest.MockedFunction<
  typeof storeCameFrom
>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCombinedError(code: string): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'error', extensions: { code } }],
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockUseIsPremium.mockReturnValue(false);
});

describe('FootballPlayerDetailPage', () => {
  it('redirects to /login and suppresses the error banner on UNAUTHENTICATED error', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: makeCombinedError('UNAUTHENTICATED'),
    } as ReturnType<typeof useFootballPlayerQuery>);

    render(<FootballPlayerDetailPage />);

    // storeCameFrom should have been called to preserve the deep-link
    expect(mockStoreCameFrom).toHaveBeenCalledTimes(1);
    // navigate to /login with replace so back-button doesn't loop
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    // generic error banner must NOT appear
    expect(
      screen.queryByText('Failed to load player. Please try again.'),
    ).toBeNull();
  });

  it('shows the error banner for non-auth errors and does not redirect', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: makeCombinedError('INTERNAL_SERVER_ERROR'),
    } as ReturnType<typeof useFootballPlayerQuery>);

    render(<FootballPlayerDetailPage />);

    expect(mockStoreCameFrom).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText('Failed to load player. Please try again.'),
    ).toBeTruthy();
  });

  it('renders the player on a successful load', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: {
        footballPlayer: {
          id: 1,
          firstName: 'Patrick',
          lastName: 'Mahomes',
          position: 'QB',
          nflTeam: 'KC',
          isDst: false,
        },
      },
      loading: false,
      error: undefined,
    } as ReturnType<typeof useFootballPlayerQuery>);

    render(<FootballPlayerDetailPage />);

    expect(screen.getByText('Patrick')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  // ── Back navigation (LS-6228) ──────────────────────────────────────────────

  describe('back navigation', () => {
    const realHistoryLength = window.history.length;

    function setHistoryLength(length: number): void {
      Object.defineProperty(window.history, 'length', {
        configurable: true,
        value: length,
      });
    }

    afterEach(() => {
      setHistoryLength(realHistoryLength);
    });

    function renderWithPlayer(): void {
      mockUseFootballPlayerQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: undefined,
      } as ReturnType<typeof useFootballPlayerQuery>);
      render(<FootballPlayerDetailPage />);
    }

    it('navigates back in-app when history exists', () => {
      setHistoryLength(3);
      renderWithPlayer();

      fireEvent.click(screen.getByText('Back to Players'));

      expect(mockNavigate).toHaveBeenCalledWith(-1);
    });

    it('falls back to the players list on a cold-start deep link', () => {
      setHistoryLength(1);
      renderWithPlayer();

      fireEvent.click(screen.getByText('Back to Players'));

      expect(mockNavigate).toHaveBeenCalledWith('/football/players');
    });
  });

  describe('LS-6249 — Projections premium upsell wiring', () => {
    function mockSuccessfulLoad() {
      mockUseFootballPlayerQuery.mockReturnValue({
        data: {
          footballPlayer: {
            id: 1,
            firstName: 'Patrick',
            lastName: 'Mahomes',
            position: 'QB',
            nflTeam: 'KC',
            isDst: false,
          },
        },
        loading: false,
        error: undefined,
      } as ReturnType<typeof useFootballPlayerQuery>);
    }

    it('opens the UpgradeModal when a free user presses the teaser CTA', () => {
      mockUseIsPremium.mockReturnValue(false);
      mockSuccessfulLoad();

      render(<FootballPlayerDetailPage />);

      expect(screen.queryByText('upgrade-modal-open')).toBeNull();
      fireEvent.click(screen.getByText('teaser-upgrade'));
      expect(screen.getByText('upgrade-modal-open')).toBeTruthy();
    });

    it('does not render the UpgradeModal for premium users', () => {
      mockUseIsPremium.mockReturnValue(true);
      mockSuccessfulLoad();

      render(<FootballPlayerDetailPage />);

      // Premium users get no teaser CTA and no modal in the tree.
      expect(screen.queryByText('teaser-upgrade')).toBeNull();
      expect(screen.queryByText('upgrade-modal-open')).toBeNull();
    });
  });

  it('polls the query so injury-status changes auto-refresh (LS-6252)', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
    } as ReturnType<typeof useFootballPlayerQuery>);

    render(<FootballPlayerDetailPage />);

    const options = mockUseFootballPlayerQuery.mock.calls[0][0];
    expect(options?.pollInterval).toBe(FOOTBALL_PLAYER_DETAIL_POLL_MS);
  });
});

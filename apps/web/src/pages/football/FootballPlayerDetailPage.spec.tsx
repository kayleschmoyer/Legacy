/**
 * FootballPlayerDetailPage — combined coverage.
 *
 * LS-6227 — footballPlayer UNAUTHENTICATED error handling:
 *   1. UNAUTHENTICATED GraphQL error → storeCameFrom + navigate to /login (no error banner).
 *   2. Non-auth GraphQL error → error banner rendered, no redirect.
 *   3. Successful load → player detail rendered, no error.
 * LS-8766 — no in-page back affordance: back navigation is browser/OS back.
 * LS-6249 — Projections premium upsell wiring.
 *
 * LS-6226 — Cold-load deep link to a non-numeric id silently skips the query:
 *   AC1: /football/players/abc  → query not fired, notFound=true.
 *   AC2: /football/players/0    → query not fired, notFound=true.
 *   AC3: /football/players/-5   → query not fired, notFound=true.
 *   AC4: /football/players/1.5  → query not fired (no wrong player), notFound=true.
 *   AC5: /football/players/42   → query fired with id=42; player rendered when found.
 *   AC6: valid id, server returns null → notFound=true.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { useNavigate, useParams } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
import { FootballPlayerDetail } from '@legacy-sports/shared-components/football';
import { ENTITLEMENTS } from '@legacy-sports/utils';
import { useFootballPlayerQuery } from '@legacy-sports/graphql';
import { FootballPlayerDetailPage } from './FootballPlayerDetailPage';
import { useHasEntitlement } from '../../hooks/useIsPremium';
import { storeCameFrom } from '../../lib/came-from';

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock('@legacy-sports/app-config/web', () => ({
  config: { statsApiUrl: 'https://stats.example.com' },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: jest.fn(),
  useParams: jest.fn(),
  useSearchParams: () => [new URLSearchParams(''), jest.fn()],
}));
jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('@legacy-sports/shared-components/football', () => ({
  FootballPlayerDetail: jest.fn(),
  resolveFootballPlayerTab: (raw: string | null | undefined) =>
    raw === 'overview' || raw === 'advanced' || raw === 'news'
      ? raw
      : 'overview',
}));
jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: ({ open }: { open: boolean }) =>
    open ? <span>upgrade-modal-open</span> : null,
}));
jest.mock('../../hooks/useIsPremium', () => ({ useHasEntitlement: jest.fn() }));
jest.mock('../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
}));
jest.mock('../../lib/came-from', () => ({ storeCameFrom: jest.fn() }));
jest.mock('@legacy-sports/graphql', () => ({
  useFootballPlayerQuery: jest.fn(),
}));

const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;
const mockUseNavigate = useNavigate as jest.MockedFunction<typeof useNavigate>;
const mockFootballPlayerDetail = FootballPlayerDetail as jest.MockedFunction<
  typeof FootballPlayerDetail
>;
const mockUseFootballPlayerQuery =
  useFootballPlayerQuery as jest.MockedFunction<typeof useFootballPlayerQuery>;
const mockUseHasEntitlement = useHasEntitlement as jest.MockedFunction<
  typeof useHasEntitlement
>;
const mockStoreCameFrom = storeCameFrom as jest.MockedFunction<
  typeof storeCameFrom
>;
const mockNavigate = jest.fn();

// ── Helpers ────────────────────────────────────────────────────────────────

function makeCombinedError(code: string): CombinedGraphQLErrors {
  return new CombinedGraphQLErrors({
    errors: [{ message: 'error', extensions: { code } }],
  });
}

/**
 * Default mock body for FootballPlayerDetail: renders the text/affordances the
 * LS-6227/6228/6249 DOM-query tests rely on (error banner, player name,
 * premium teaser). The LS-6226 tests override this to capture props.
 */
function renderDetailText(
  props: React.ComponentProps<typeof FootballPlayerDetail>,
) {
  return (
    <div>
      {props.error && <span>Failed to load player. Please try again.</span>}
      {props.notFound && !props.error && <span>Player not found.</span>}
      {props.player && <span>{props.player.firstName}</span>}
      {!props.isPremium && (
        <button type="button" onClick={props.onUpgrade}>
          teaser-upgrade
        </button>
      )}
    </div>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseNavigate.mockReturnValue(mockNavigate);
  // Default to a valid numeric id; LS-6226 tests override per-case.
  mockUseParams.mockReturnValue({ id: '42' });
  mockFootballPlayerDetail.mockImplementation(renderDetailText);
  mockUseHasEntitlement.mockReturnValue(false);
  mockUseFootballPlayerQuery.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
  } as ReturnType<typeof useFootballPlayerQuery>);
});

// ── LS-6227 / LS-6228 / LS-6249 / LS-6252 ────────────────────────────────────

describe('FootballPlayerDetailPage — auth error handling (LS-6227)', () => {
  it('redirects to /login and suppresses the error banner on UNAUTHENTICATED error', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: makeCombinedError('UNAUTHENTICATED'),
    } as ReturnType<typeof useFootballPlayerQuery>);

    render(<FootballPlayerDetailPage />);

    expect(mockStoreCameFrom).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
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
      mockUseHasEntitlement.mockReturnValue(false);
      mockSuccessfulLoad();

      render(<FootballPlayerDetailPage />);

      // The gate must be keyed to the football-projections entitlement.
      expect(mockUseHasEntitlement).toHaveBeenCalledWith(
        ENTITLEMENTS.football_projections,
      );
      expect(screen.queryByText('upgrade-modal-open')).toBeNull();
      fireEvent.click(screen.getByText('teaser-upgrade'));
      expect(screen.getByText('upgrade-modal-open')).toBeTruthy();
    });

    it('does not render the UpgradeModal for premium users', () => {
      mockUseHasEntitlement.mockReturnValue(true);
      mockSuccessfulLoad();

      render(<FootballPlayerDetailPage />);

      // Premium users get no teaser CTA and no modal in the tree.
      expect(screen.queryByText('teaser-upgrade')).toBeNull();
      expect(screen.queryByText('upgrade-modal-open')).toBeNull();
    });
  });
});

// ── LS-6226: deep-link id validation ─────────────────────────────────────────

describe('FootballPlayerDetailPage — deep-link id validation (LS-6226)', () => {
  function renderCapturingProps(id: string) {
    let props: React.ComponentProps<typeof FootballPlayerDetail> | null = null;
    mockFootballPlayerDetail.mockImplementation((p) => {
      props = p;
      return null;
    });
    mockUseParams.mockReturnValue({ id });
    render(<FootballPlayerDetailPage />);
    return () => {
      if (!props) throw new Error('FootballPlayerDetail was not rendered');
      return props;
    };
  }

  it('AC1: non-numeric id "abc" — does not fire query and passes notFound=true', () => {
    const props = renderCapturingProps('abc');
    expect(mockUseFootballPlayerQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(props().notFound).toBe(true);
  });

  it('AC2: id "0" — does not fire query and passes notFound=true', () => {
    const props = renderCapturingProps('0');
    expect(mockUseFootballPlayerQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(props().notFound).toBe(true);
  });

  it('AC3: negative id "-5" — does not fire query and passes notFound=true', () => {
    const props = renderCapturingProps('-5');
    expect(mockUseFootballPlayerQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(props().notFound).toBe(true);
  });

  it('AC4: decimal id "1.5" — does not fire query (no wrong player) and passes notFound=true', () => {
    const props = renderCapturingProps('1.5');
    expect(mockUseFootballPlayerQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: true }),
    );
    expect(props().notFound).toBe(true);
  });

  it('AC5: valid id "42" — fires query with correct id and passes notFound=false when player found', () => {
    const player = { id: 42, firstName: 'Patrick', lastName: 'Mahomes' };
    mockUseFootballPlayerQuery.mockReturnValue({
      data: { footballPlayer: player },
      loading: false,
      error: undefined,
    } as ReturnType<typeof useFootballPlayerQuery>);

    const props = renderCapturingProps('42');
    expect(mockUseFootballPlayerQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: false, variables: { id: 42 } }),
    );
    expect(props().notFound).toBe(false);
    expect(props().player).toBe(player);
  });

  it('AC6: valid id but server returns null — passes notFound=true', () => {
    mockUseFootballPlayerQuery.mockReturnValue({
      data: { footballPlayer: null },
      loading: false,
      error: undefined,
    } as ReturnType<typeof useFootballPlayerQuery>);

    const props = renderCapturingProps('99');
    expect(mockUseFootballPlayerQuery).toHaveBeenCalledWith(
      expect.objectContaining({ skip: false }),
    );
    expect(props().notFound).toBe(true);
  });
});

// ── LS-6456: game logs API endpoint wiring ────────────────────────────────────

describe('FootballPlayerDetailPage — game logs endpoint wiring (LS-6456)', () => {
  function renderCapturingProps(id: string) {
    let props: React.ComponentProps<typeof FootballPlayerDetail> | null = null;
    mockFootballPlayerDetail.mockImplementation((p) => {
      props = p;
      return null;
    });
    mockUseParams.mockReturnValue({ id });
    mockUseFootballPlayerQuery.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
    } as ReturnType<typeof useFootballPlayerQuery>);
    render(<FootballPlayerDetailPage />);
    return () => {
      if (!props) throw new Error('FootballPlayerDetail was not rendered');
      return props;
    };
  }

  it('passes the formatted stats-API URL as gameLogsApiEndpoint (LS-6456)', () => {
    const props = renderCapturingProps('42');
    // config.statsApiUrl is mocked to 'https://stats.example.com' (trailing slash stripped)
    expect(props().gameLogsApiEndpoint).toBe(
      'https://stats.example.com/nfl-game-logs',
    );
  });
});

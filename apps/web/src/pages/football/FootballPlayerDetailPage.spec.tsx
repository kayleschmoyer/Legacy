/**
 * LS-6227 — footballPlayer UNAUTHENTICATED error handling.
 *
 * Covers:
 *   1. UNAUTHENTICATED GraphQL error → storeCameFrom + navigate to /login (no error banner).
 *   2. Non-auth GraphQL error → error banner rendered, no redirect.
 *   3. Successful load → player detail rendered, no error.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CombinedGraphQLErrors } from '@apollo/client';
import { FootballPlayerDetailPage } from './FootballPlayerDetailPage';
import { useFootballPlayerQuery } from '../../api/db/graphql.generated';
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
  FootballPlayerDetail: ({
    error,
    player,
  }: {
    error?: boolean;
    player?: { firstName: string } | null;
  }) => (
    <div>
      {error && <span>Failed to load player. Please try again.</span>}
      {player && <span>{player.firstName}</span>}
    </div>
  ),
}));

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
});

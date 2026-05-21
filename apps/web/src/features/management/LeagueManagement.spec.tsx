/* eslint-disable @typescript-eslint/no-explicit-any -- jest mock factories use any for simplicity */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { LeagueManagement } from './LeagueManagement';

// ── Auth mock — exercises both unauthenticated and authenticated paths ────────
const mockUseAuth = jest.fn(() => ({
  isAuthenticated: false,
  isLoading: false,
  user: null,
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

// ── GraphQL mutation mock ─────────────────────────────────────────────────────
const mockMutation = jest.fn(() =>
  Promise.resolve({ data: { deleteAllLeagues: 'ok' } }),
);
jest.mock('../../api/db/graphql.generated', () => ({
  useDeleteAllLeaguesMutation: () => [
    mockMutation,
    { loading: false, error: undefined },
  ],
}));

// ── Tamagui YStack -> div passthrough ─────────────────────────────────────────
jest.mock('tamagui', () => ({
  YStack: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
}));

// ── LOGGER mock ───────────────────────────────────────────────────────────────
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── react-native Platform mock (web) ──────────────────────────────────────────
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }));

describe('LeagueManagement', () => {
  beforeEach(() => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
    });
    mockMutation.mockClear();
  });

  // Mutation-coverage rule: deleteAllLeagues UNAUTHENTICATED path is exercised at
  // the resolver level in lambdas/db/src/schema/leagues.resolver.spec.ts. This UI
  // test verifies the management page degrades to the non-admin (member) warning
  // copy when no user is present, since accessLevel is undefined.
  it('renders the non-admin / unauthenticated warning when user is null', () => {
    render(<LeagueManagement />);
    // Non-admin copy mentions "Only leagues you own will be deleted" — admin
    // copy starts "All leagues you are a member of will be deleted".
    expect(
      screen.getByText(/Only leagues you own will be deleted/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/All leagues you are a member of will be deleted/i),
    ).not.toBeInTheDocument();
  });

  it('renders the admin warning when user.accessLevel is admin', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: '1', accessLevel: 'admin' } as any,
    });
    render(<LeagueManagement />);
    expect(
      screen.getByText(/All leagues you are a member of will be deleted/i),
    ).toBeInTheDocument();
  });

  it('opens the two-step confirmation dialog when Delete All Leagues is clicked', () => {
    render(<LeagueManagement />);
    fireEvent.click(
      screen.getByRole('button', { name: /Delete All Leagues/i }),
    );
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure\?/i)).toBeInTheDocument();
  });
});

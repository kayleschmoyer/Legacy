/* eslint-disable @typescript-eslint/no-explicit-any -- jest mock factories use any for simplicity */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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

// ── GraphQL query/mutation mocks ──────────────────────────────────────────────
const mockLeagues = [
  { id: 1, name: 'Owned League', sport: 'baseball', owner: 1 },
  { id: 2, name: 'Joined League', sport: 'football', owner: 99 },
];

const mockRefetchLeagues = jest.fn(() => Promise.resolve());
const mockUseGetUserLeaguesQuery = jest.fn(() => ({
  data: { userLeagues: mockLeagues, userLeagueCount: mockLeagues.length },
  loading: false,
  refetch: mockRefetchLeagues,
}));

const mockMutation = jest.fn(() =>
  Promise.resolve({ data: { deleteLeague: 'ok' } }),
);
jest.mock('@legacy-sports/graphql', () => ({
  useDeleteLeagueMutation: () => [
    mockMutation,
    { loading: false, error: undefined },
  ],
  useGetUserLeaguesQuery: () => mockUseGetUserLeaguesQuery(),
}));

// ── Tamagui YStack -> div passthrough ─────────────────────────────────────────
jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
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
    mockUseGetUserLeaguesQuery.mockReturnValue({
      data: { userLeagues: mockLeagues, userLeagueCount: mockLeagues.length },
      loading: false,
      refetch: mockRefetchLeagues,
    });
    mockRefetchLeagues.mockClear();
    mockMutation.mockClear();
    mockMutation.mockImplementation(() =>
      Promise.resolve({ data: { deleteLeague: 'ok' } }),
    );
  });

  // Mutation-coverage rule: deleteLeague UNAUTHENTICATED path is exercised at
  // the resolver level in lambdas/db/src/schema/leagues.resolver.spec.ts. This UI
  // test verifies the management page degrades to the non-admin (member) warning
  // copy when no user is present, since accessLevel is undefined.
  it('renders the non-admin / unauthenticated warning when user is null', () => {
    render(<LeagueManagement />);
    // Non-admin copy mentions "only select and delete leagues you own" — admin
    // copy starts "As an admin, you can select any league to delete".
    expect(
      screen.getByText(/only select and delete leagues you own/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/As an admin, you can select any league to delete/i),
    ).not.toBeInTheDocument();
  });

  it('renders the admin warning when user.accessLevel is admin', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, accessLevel: 'admin' } as any,
    });
    render(<LeagueManagement />);
    expect(
      screen.getByText(/As an admin, you can select any league to delete/i),
    ).toBeInTheDocument();
  });

  it('lists each league with a checkbox and disables non-owned leagues for a non-admin', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, accessLevel: 'none' } as any,
    });
    render(<LeagueManagement />);

    expect(screen.getByText('Owned League')).toBeInTheDocument();
    expect(screen.getByText('Joined League')).toBeInTheDocument();

    const ownedCheckbox = screen.getByRole('checkbox', {
      name: /select owned league for deletion/i,
    });
    const joinedCheckbox = screen.getByRole('checkbox', {
      name: /select joined league for deletion/i,
    });
    expect(ownedCheckbox).toBeEnabled();
    expect(joinedCheckbox).toBeDisabled();
    expect(screen.getByText(/not yours to delete/i)).toBeInTheDocument();
  });

  it('keeps the delete button disabled until at least one league is selected', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, accessLevel: 'none' } as any,
    });
    render(<LeagueManagement />);

    const deleteButton = screen.getByRole('button', {
      name: /Delete Selected/i,
    });
    expect(deleteButton).toBeDisabled();

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /select owned league for deletion/i,
      }),
    );

    expect(deleteButton).toBeEnabled();
    expect(deleteButton).toHaveTextContent('Delete Selected (1)');
  });

  it('opens the two-step confirmation dialog for the selected league(s) only', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, accessLevel: 'none' } as any,
    });
    render(<LeagueManagement />);

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /select owned league for deletion/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete Selected/i }));

    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Are you sure\?/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Owned League/i)).toBeInTheDocument();
    expect(
      within(dialog).queryByText(/Joined League/i),
    ).not.toBeInTheDocument();
  });

  it('deletes only the selected league via deleteLeague, not the whole account', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, accessLevel: 'none' } as any,
    });
    render(<LeagueManagement />);

    fireEvent.click(
      screen.getByRole('checkbox', {
        name: /select owned league for deletion/i,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /Delete Selected/i }));
    fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
    fireEvent.click(
      screen.getByRole('button', { name: /Yes, Delete Selected/i }),
    );

    expect(mockMutation).toHaveBeenCalledTimes(1);
    expect(mockMutation).toHaveBeenCalledWith(
      expect.objectContaining({ variables: { leagueId: 1 } }),
    );

    // Wait for the deleteLeague promise chain to resolve and the dialog to
    // close, so the mutation's state updates are flushed inside `act` before
    // the test ends (avoids an "update not wrapped in act" warning).
    await waitFor(() =>
      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument(),
    );

    // Confirms the success path actually ran (not the catch-all error path,
    // which also closes the dialog) and that the list is refetched exactly
    // once per batch, not once per deleted league.
    expect(
      screen.getByText(/selected league has been deleted successfully/i),
    ).toBeInTheDocument();
    expect(mockRefetchLeagues).toHaveBeenCalledTimes(1);
  });

  describe('deletion timeout', () => {
    const neverResolves = <T = never,>(): Promise<T> =>
      new Promise<T>(() => undefined);
    const flushMicrotasks = () => Promise.resolve();

    beforeEach(() => {
      jest.useFakeTimers();
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 1, accessLevel: 'none' } as any,
      });
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('shows the timeout error after 30s when the mutation hangs', async () => {
      mockMutation.mockImplementation(() => neverResolves());

      render(<LeagueManagement />);

      fireEvent.click(
        screen.getByRole('checkbox', {
          name: /select owned league for deletion/i,
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Delete Selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /Yes, Delete Selected/i }),
      );

      await act(async () => {
        jest.advanceTimersByTime(30_001);
        await flushMicrotasks();
      });

      expect(
        screen.getAllByText(/Deletion timed out — please try again\./i).length,
      ).toBeGreaterThan(0);
    });

    it('clears the timeout error when the user reopens the dialog', async () => {
      mockMutation.mockImplementation(() => neverResolves());

      render(<LeagueManagement />);

      fireEvent.click(
        screen.getByRole('checkbox', {
          name: /select owned league for deletion/i,
        }),
      );
      fireEvent.click(screen.getByRole('button', { name: /Delete Selected/i }));
      fireEvent.click(screen.getByRole('button', { name: /Continue/i }));
      fireEvent.click(
        screen.getByRole('button', { name: /Yes, Delete Selected/i }),
      );

      await act(async () => {
        jest.advanceTimersByTime(30_001);
        await flushMicrotasks();
      });

      expect(
        screen.getAllByText(/Deletion timed out — please try again\./i).length,
      ).toBeGreaterThan(0);

      // The failed selection is preserved (not cleared) so the user can retry
      // without re-picking leagues — reopening the flow clears the error.
      fireEvent.click(screen.getByRole('button', { name: /Delete Selected/i }));
      expect(
        screen.queryAllByText(/Deletion timed out — please try again\./i),
      ).toHaveLength(0);
    });
  });
});

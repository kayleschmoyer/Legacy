/**
 * Regression tests for LS-1007: "Can't find variable handleSubmit"
 *
 * The original bug: during development of LS-960 the function was partially
 * renamed (definition changed to handleJoin / handleFormSubmit before all
 * call-sites were updated), leaving a reference to the non-existent
 * `handleSubmit` in the form's onSubmit and the button's onPress.  This
 * triggered a ReferenceError at runtime.  These tests verify that:
 *   1. The form's onSubmit handler is correctly wired (no ReferenceError).
 *   2. The join button's onPress handler is correctly wired (no ReferenceError).
 *   3. Validation errors are surfaced without calling the mutation.
 *   4. A successful join navigates to the league page.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks use any */
/* eslint-disable @typescript-eslint/no-unsafe-return -- mock factory spreads */
/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories need runtime require */
import React from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CombinedGraphQLErrors } from '@apollo/client';
// Static namespace import of the (jest.mock-hoisted) generated module. Using a
// static import instead of require() keeps nx's enforce-module-boundaries happy
// — a cross-project require() is treated as a lazy load and forbids the static
// imports the rest of the app uses.
import * as GraphqlApi from '@legacy-sports/graphql';

// The top-level jest.mock() below replaces every export with a jest.fn(); this
// typed alias exposes them as mocks without per-call-site casts.
const gqlMock = GraphqlApi as unknown as Record<string, jest.Mock>;

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
  useParams: () => ({ inviteCode: undefined }),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

const mockStoreCameFrom = jest.fn();
jest.mock('../../lib/came-from', () => ({
  storeCameFrom: (...args: unknown[]) => mockStoreCameFrom(...args),
}));

jest.mock('@legacy-sports/shared-components', () => ({
  Button: ({ children, onPress, disabled }: any) => (
    <button onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, ...rest }: any) => (
    <div data-testid={rest['data-testid']}>{children}</div>
  ),
  XStack: ({ children }: any) => <div>{children}</div>,
  YStack: ({ children }: any) => <div>{children}</div>,
}));

// Mock subpath entry point — JoinLeagueByCodePage now imports from /ui
jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({ children, onPress, disabled }: any) => (
    <button onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
  Card: ({ children, ...rest }: any) => (
    <div data-testid={rest['data-testid']}>{children}</div>
  ),
  XStack: ({ children }: any) => <div>{children}</div>,
  YStack: ({ children }: any) => <div>{children}</div>,
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  H1: ({ children }: any) => <h1>{children}</h1>,
  H2: ({ children }: any) => <h2>{children}</h2>,
  Input: ({ value, onChangeText, placeholder, disabled, id }: any) => (
    <input
      id={id}
      value={value ?? ''}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChangeText?.(e.target.value)}
    />
  ),
  Spinner: () => <span data-testid="spinner" />,
  Text: ({ children }: any) => <span>{children}</span>,
}));

const mockJoinLeague = jest.fn();
const mockValidateCode = jest.fn();
const mockJoinPublicLeague = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Baseball: 'baseball', Football: 'football' },
  useJoinLeagueByCodeMutation: jest.fn(() => [
    mockJoinLeague,
    { loading: false },
  ]),
  useValidateInviteCodeLazyQuery: jest.fn(() => [
    mockValidateCode,
    { data: undefined, loading: false },
  ]),
  useGetPublicLeaguesQuery: jest.fn(() => ({
    data: { publicLeagues: [] },
    loading: false,
  })),
  useJoinPublicLeagueMutation: jest.fn(() => [
    mockJoinPublicLeague,
    { loading: false },
  ]),
}));

const mockUseIsPremium = jest.fn(() => false);
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: () => mockUseIsPremium(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderPage() {
  const { useJoinLeagueByCodeMutation, useValidateInviteCodeLazyQuery } =
    gqlMock as {
      useJoinLeagueByCodeMutation: jest.Mock;
      useValidateInviteCodeLazyQuery: jest.Mock;
    };

  return {
    ...render(
      <MemoryRouter initialEntries={['/baseball/join']}>
        <Routes>
          <Route
            path="/baseball/join"
            element={
              <React.Suspense fallback={null}>
                {React.createElement(
                  require('./JoinLeagueByCodePage').JoinLeagueByCodePage,
                )}
              </React.Suspense>
            }
          />
        </Routes>
      </MemoryRouter>,
    ),
    useJoinLeagueByCodeMutation,
    useValidateInviteCodeLazyQuery,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('JoinLeagueByCodePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockJoinLeague.mockResolvedValue({ data: undefined });
    mockUseIsPremium.mockReturnValue(false);

    const {
      useJoinLeagueByCodeMutation,
      useValidateInviteCodeLazyQuery,
      useGetPublicLeaguesQuery,
      useJoinPublicLeagueMutation,
    } = gqlMock;

    useJoinLeagueByCodeMutation.mockReturnValue([
      mockJoinLeague,
      { loading: false },
    ]);
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      { data: undefined, loading: false },
    ]);
    useGetPublicLeaguesQuery.mockReturnValue({
      data: { publicLeagues: [] },
      loading: false,
    });
    useJoinPublicLeagueMutation.mockReturnValue([
      mockJoinPublicLeague,
      { loading: false },
    ]);
  });

  it('renders the join form without errors', () => {
    renderPage();
    // "Join League" appears in both the H1 and the submit button
    expect(screen.getAllByText(/Join League/i).length).toBeGreaterThanOrEqual(
      1,
    );
    expect(
      screen.getByPlaceholderText(/Enter 8-character code/i),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(/Enter your team name/i),
    ).toBeInTheDocument();
  });

  /**
   * Regression: LS-1007 — "handleSubmit is not defined"
   *
   * Submitting the HTML form must not throw a ReferenceError.  Before the fix,
   * the form's onSubmit referenced a renamed (non-existent) function.
   */
  it('submitting the form does not throw ReferenceError (LS-1007 regression)', () => {
    renderPage();

    const form = document.querySelector('form');
    expect(form).not.toBeNull();

    // Should not throw when the form submit event fires
    act(() => {
      fireEvent.submit(form as Element);
    });
    // If we reach this line the ReferenceError regression is not present
  });

  /**
   * Regression: LS-1007 — join button onPress is correctly wired
   *
   * Before the fix, the button's onPress also referenced the non-existent
   * `handleSubmit`. Clicking the button must not throw a ReferenceError.
   */
  it('clicking the Join League button does not throw ReferenceError (LS-1007 regression)', async () => {
    // The button is disabled until leagueInfo is present and both inputs are
    // filled — provide mock data so we can actually click it and verify that
    // onPress invokes handleJoin without a ReferenceError.
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    // Fill both inputs so the disabled conditions are cleared
    act(() => {
      fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
        target: { value: 'ABC12345' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Enter your team name/i), {
        target: { value: 'Test Team' },
      });
    });

    const buttons = screen.getAllByRole('button');
    const joinButton = buttons.find((b) =>
      /join league/i.test(b.textContent ?? ''),
    );
    expect(joinButton).toBeDefined();
    expect(joinButton).not.toBeDisabled();

    // Clicking must not throw a ReferenceError (LS-1007 regression check)
    act(() => {
      fireEvent.click(joinButton as Element);
    });

    // handleJoin was invoked — the mutation was called, proving onPress is
    // correctly wired to handleJoin (not the non-existent handleSubmit).
    await waitFor(() => expect(mockJoinLeague).toHaveBeenCalled());
  });

  it('shows validation error when invite code is empty and form is submitted', () => {
    // leagueInfo must be present for handleJoin to proceed past the guard.
    // This simulates: user validated a code, then cleared the code field.
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    expect(
      screen.getByText(/Please enter an invite code/i),
    ).toBeInTheDocument();
    expect(mockJoinLeague).not.toHaveBeenCalled();
  });

  it('shows validation error when team name is empty', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    const codeInput = screen.getByPlaceholderText(/Enter 8-character code/i);
    fireEvent.change(codeInput, { target: { value: 'ABC12XYZ' } });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    expect(screen.getByText(/Please enter a team name/i)).toBeInTheDocument();
    expect(mockJoinLeague).not.toHaveBeenCalled();
  });

  it('shows validation error for invalid invite code format', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    const codeInput = screen.getByPlaceholderText(/Enter 8-character code/i);
    fireEvent.change(codeInput, { target: { value: 'SHORT' } });

    const nameInput = screen.getByPlaceholderText(/Enter your team name/i);
    fireEvent.change(nameInput, { target: { value: 'My Team' } });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    expect(
      screen.getByText(/Invite code must be 8 characters/i),
    ).toBeInTheDocument();
    expect(mockJoinLeague).not.toHaveBeenCalled();
  });

  it('navigates to the league page after a successful join', async () => {
    mockJoinLeague.mockResolvedValueOnce({
      data: { joinLeagueByCode: { leagueId: 42 } },
    });

    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
      target: { value: 'ABC12XYZ' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your team name/i), {
      target: { value: 'My Team' },
    });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    await waitFor(() => {
      expect(mockJoinLeague).toHaveBeenCalledWith({
        variables: { inviteCode: 'ABC12XYZ', teamName: 'My Team' },
      });
      expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/42');
    });
  });

  it('cancel button navigates back to baseball home', () => {
    renderPage();

    fireEvent.click(screen.getByText(/Cancel/i));
    expect(mockNavigate).toHaveBeenCalledWith('/baseball');
  });

  /**
   * Regression: LS-1296 — stale invite-code validation
   *
   * After entering a valid 8-char code the league preview appears and the
   * submit button is enabled.  Deleting a character must hide the preview
   * and disable the button, even though the lazy-query still holds its
   * previous result.
   */
  it('clears league preview when the invite code is shortened below 8 chars (LS-1296 regression)', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };

    // Start with a successful validation result so leagueInfo is populated
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Stale League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    const codeInput = screen.getByPlaceholderText(/Enter 8-character code/i);
    const teamNameInput = screen.getByPlaceholderText(/Enter your team name/i);

    // Fill in a team name so invite-code gating is the only remaining blocker
    act(() => {
      fireEvent.change(teamNameInput, { target: { value: 'My Team' } });
    });

    // Enter a valid 8-char code — league preview should be visible and button enabled
    act(() => {
      fireEvent.change(codeInput, { target: { value: 'ABC12345' } });
    });
    expect(screen.getByText(/Stale League/)).toBeInTheDocument();
    const buttons = screen.getAllByRole('button');
    const joinButton = buttons.find((b) =>
      /join league/i.test(b.textContent ?? ''),
    );
    expect(joinButton).not.toBeDisabled();

    // Now delete one character — preview must disappear and button must be disabled
    act(() => {
      fireEvent.change(codeInput, { target: { value: 'ABC1234' } });
    });
    expect(screen.queryByText(/Stale League/)).not.toBeInTheDocument();

    // The join button must be disabled (no leagueInfo)
    const updatedButtons = screen.getAllByRole('button');
    const updatedJoinButton = updatedButtons.find((b) =>
      /join league/i.test(b.textContent ?? ''),
    );
    expect(updatedJoinButton).toBeDisabled();
  });

  /**
   * Regression: LS-1297 — Enter submits form while invite-code validation is
   * still pending, bypassing the disabled Join League button.
   */
  it('does not submit the join mutation while invite-code validation is pending (LS-1297 regression)', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    // Simulate validating state: loading=true, no data yet
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      { data: undefined, loading: true },
    ]);

    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
      target: { value: 'ABC12345' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your team name/i), {
      target: { value: 'Test Team' },
    });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    expect(mockJoinLeague).not.toHaveBeenCalled();
  });

  it('does not submit when league info has not been fetched yet (LS-1297 regression)', () => {
    // Default mock: no leagueInfo, not loading
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
      target: { value: 'ABC12345' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Enter your team name/i), {
      target: { value: 'Test Team' },
    });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    expect(mockJoinLeague).not.toHaveBeenCalled();
  });

  /**
   * Regression: LS-1298 — network error banner must show when validateInviteCode returns an error
   */
  it('shows network error when validateInviteCode query returns an error (LS-1298 regression)', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };

    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: undefined,
        loading: false,
        error: new Error('Network error'),
      },
    ]);

    renderPage();

    const codeInput = screen.getByPlaceholderText(/Enter 8-character code/i);

    // Enter a valid 8-char code to trigger the validateError display path
    act(() => {
      fireEvent.change(codeInput, { target: { value: 'ABC12345' } });
    });

    expect(screen.getByText(/Unable to verify code/i)).toBeInTheDocument();
  });

  /**
   * Regression: LS-1007 baseline — a genuinely bad code (server returns null,
   * no error) must still read as invalid, not as an auth problem.
   */
  it('shows invalid invite code when the server finds no matching league', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      { data: { validateInviteCode: null }, loading: false },
    ]);

    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
      target: { value: 'BADCODE1' },
    });

    expect(screen.getByText(/Invalid invite code/i)).toBeInTheDocument();
    expect(
      screen.queryByTestId('invite-validation-auth-required'),
    ).not.toBeInTheDocument();
  });

  /**
   * LS-8846 — validateInviteCode throws UNAUTHENTICATED for anonymous
   * callers; a signed-out user following a valid invite link must see a
   * sign-in prompt, never "Invalid invite code" or "Unable to verify code".
   */
  describe('anonymous invite-code validation (LS-8846)', () => {
    function mockUnauthenticatedError() {
      return new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Not authenticated',
            extensions: { code: 'UNAUTHENTICATED' },
          },
        ],
      });
    }

    it('shows a sign-in prompt, not an invalid-code or unknown-error message, for a valid code while logged out', () => {
      const { useValidateInviteCodeLazyQuery } = gqlMock as {
        useValidateInviteCodeLazyQuery: jest.Mock;
      };
      useValidateInviteCodeLazyQuery.mockReturnValue([
        mockValidateCode,
        {
          data: undefined,
          loading: false,
          error: mockUnauthenticatedError(),
        },
      ]);

      renderPage();

      fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
        target: { value: 'ABC12XYZ' },
      });

      expect(
        screen.getByTestId('invite-validation-auth-required'),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Sign in to check this invite/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/Invalid invite code/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByText(/Unable to verify code/i),
      ).not.toBeInTheDocument();
    });

    it('still reports a genuinely invalid code while logged out (not an auth prompt)', () => {
      const { useValidateInviteCodeLazyQuery } = gqlMock as {
        useValidateInviteCodeLazyQuery: jest.Mock;
      };
      // A non-existent code returns null data with no error, regardless of
      // auth state — auth is only checked once a matching league is looked up.
      useValidateInviteCodeLazyQuery.mockReturnValue([
        mockValidateCode,
        { data: { validateInviteCode: null }, loading: false },
      ]);

      renderPage();

      fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
        target: { value: 'BADCODE1' },
      });

      expect(screen.getByText(/Invalid invite code/i)).toBeInTheDocument();
      expect(
        screen.queryByTestId('invite-validation-auth-required'),
      ).not.toBeInTheDocument();
    });

    it('clicking Sign In preserves the invite code and routes to /login', () => {
      const { useValidateInviteCodeLazyQuery } = gqlMock as {
        useValidateInviteCodeLazyQuery: jest.Mock;
      };
      useValidateInviteCodeLazyQuery.mockReturnValue([
        mockValidateCode,
        {
          data: undefined,
          loading: false,
          error: mockUnauthenticatedError(),
        },
      ]);

      renderPage();

      fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
        target: { value: 'ABC12XYZ' },
      });

      fireEvent.click(screen.getByText(/^Sign In$/i));

      expect(mockStoreCameFrom).toHaveBeenCalledWith(
        '/baseball/league/join/ABC12XYZ',
      );
      expect(mockNavigate).toHaveBeenCalledWith('/login', { replace: true });
    });

    it('a network error (no GraphQL UNAUTHENTICATED code) still shows the unknown-error message, not the sign-in prompt', () => {
      const { useValidateInviteCodeLazyQuery } = gqlMock as {
        useValidateInviteCodeLazyQuery: jest.Mock;
      };
      useValidateInviteCodeLazyQuery.mockReturnValue([
        mockValidateCode,
        {
          data: undefined,
          loading: false,
          error: new Error('Network error'),
        },
      ]);

      renderPage();

      fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
        target: { value: 'ABC12XYZ' },
      });

      expect(screen.getByText(/Unable to verify code/i)).toBeInTheDocument();
      expect(
        screen.queryByTestId('invite-validation-auth-required'),
      ).not.toBeInTheDocument();
    });
  });

  /**
   * Regression: LS-1299 — invite-code field errors clear on edit, but other errors persist
   */
  it('clears invite-code error when user edits the code field (LS-1299 regression)', async () => {
    const { useJoinLeagueByCodeMutation, useValidateInviteCodeLazyQuery } =
      gqlMock as {
        useJoinLeagueByCodeMutation: jest.Mock;
        useValidateInviteCodeLazyQuery: jest.Mock;
      };

    // Provide valid leagueInfo so the form submission guard passes
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    // Use a unique message so it won't be confused with the static
    // '!leagueInfo && code.length===8' display text in the component
    mockJoinLeague.mockRejectedValueOnce(
      new Error('Invite code has already been claimed by another team'),
    );
    useJoinLeagueByCodeMutation.mockReturnValue([
      mockJoinLeague,
      { loading: false },
    ]);

    renderPage();

    const codeInput = screen.getByPlaceholderText(/Enter 8-character code/i);
    const teamInput = screen.getByPlaceholderText(/Enter your team name/i);

    act(() => {
      fireEvent.change(codeInput, { target: { value: 'BADCODE1' } });
      fireEvent.change(teamInput, { target: { value: 'My Team' } });
    });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Invite code has already been claimed/i),
      ).toBeInTheDocument();
    });

    // Editing the invite-code field should clear the invite-code-related error
    act(() => {
      fireEvent.change(codeInput, { target: { value: 'BADCODE2' } });
    });

    expect(
      screen.queryByText(/Invite code has already been claimed/i),
    ).not.toBeInTheDocument();
  });

  it('does not clear unrelated errors when user edits the invite code field (LS-1299 regression)', async () => {
    const { useJoinLeagueByCodeMutation, useValidateInviteCodeLazyQuery } =
      gqlMock as {
        useJoinLeagueByCodeMutation: jest.Mock;
        useValidateInviteCodeLazyQuery: jest.Mock;
      };

    // Provide valid leagueInfo so the form submission guard passes
    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            isFull: false,
            leagueName: 'Test League',
            totalSpots: 10,
            availableSpots: 5,
          },
        },
        loading: false,
      },
    ]);

    // Simulate a league-full error (unrelated to invite-code field)
    mockJoinLeague.mockRejectedValueOnce(
      new Error('This league is full and no longer accepting new members'),
    );
    useJoinLeagueByCodeMutation.mockReturnValue([
      mockJoinLeague,
      { loading: false },
    ]);

    renderPage();

    const codeInput = screen.getByPlaceholderText(/Enter 8-character code/i);
    const teamInput = screen.getByPlaceholderText(/Enter your team name/i);

    act(() => {
      fireEvent.change(codeInput, { target: { value: 'FULL0000' } });
      fireEvent.change(teamInput, { target: { value: 'My Team' } });
    });

    act(() => {
      fireEvent.submit(document.querySelector('form') as Element);
    });

    await waitFor(() => {
      expect(screen.getByText(/This league is full/i)).toBeInTheDocument();
    });

    // Editing the invite-code field should NOT clear a league-full error
    act(() => {
      fireEvent.change(codeInput, { target: { value: 'FULL0001' } });
    });

    expect(screen.getByText(/This league is full/i)).toBeInTheDocument();
  });

  it('shows already-member banner and disables submit when user is already in the league (LS-1301)', () => {
    const { useValidateInviteCodeLazyQuery } = gqlMock as {
      useValidateInviteCodeLazyQuery: jest.Mock;
    };

    useValidateInviteCodeLazyQuery.mockReturnValue([
      mockValidateCode,
      {
        data: {
          validateInviteCode: {
            leagueId: 42,
            leagueName: 'Test League',
            totalSpots: 0,
            availableSpots: 0,
            isFull: false,
            isAlreadyMember: true,
          },
        },
        loading: false,
      },
    ]);

    renderPage();

    // Type a valid 8-char code so isCodeComplete triggers leagueInfo derivation
    fireEvent.change(screen.getByPlaceholderText(/Enter 8-character code/i), {
      target: { value: 'ABC12345' },
    });

    // Already-member banner is shown
    expect(screen.getByTestId('alert-already-member')).toBeInTheDocument();
    expect(
      screen.getAllByText(/already in Test League/i).length,
    ).toBeGreaterThan(0);

    // Submit button is disabled
    const buttons = screen.getAllByText(/Join League/i);
    const submitButton = buttons.find(
      (el) => el.closest('button') || el.tagName === 'BUTTON',
    );
    expect(submitButton?.closest('button')).toBeDisabled();
  });

  // LS-6290: premium users get a Quick Join shortcut to open public leagues;
  // free users see the same invite-code-only experience as before.
  //
  // NOTE: this describe block must run before the "must be last" LS-1295 test
  // below — that test calls jest.resetModules(), which would otherwise leave
  // these tests rendering against a stale module registry (see its comment).
  describe('Quick Join (premium differentiation, LS-6290)', () => {
    const quickJoinLeague = {
      id: 42,
      name: 'Sunday Ballers',
      totalSpots: 10,
      availableSpots: 3,
      isFull: false,
      isAlreadyMember: false,
    };

    it('does not render Quick Join for free users', () => {
      mockUseIsPremium.mockReturnValue(false);
      gqlMock.useGetPublicLeaguesQuery.mockReturnValue({
        data: { publicLeagues: [quickJoinLeague] },
        loading: false,
      });

      renderPage();
      expect(screen.queryByTestId('quick-join-panel')).not.toBeInTheDocument();
    });

    it('renders Quick Join with open public leagues for premium users', () => {
      mockUseIsPremium.mockReturnValue(true);
      gqlMock.useGetPublicLeaguesQuery.mockReturnValue({
        data: { publicLeagues: [quickJoinLeague] },
        loading: false,
      });

      renderPage();
      expect(screen.getByTestId('quick-join-panel')).toBeInTheDocument();
      expect(screen.getByText('Sunday Ballers')).toBeInTheDocument();
    });

    it('hides Quick Join for premium users when no open public leagues exist', () => {
      mockUseIsPremium.mockReturnValue(true);
      gqlMock.useGetPublicLeaguesQuery.mockReturnValue({
        data: { publicLeagues: [] },
        loading: false,
      });

      renderPage();
      expect(screen.queryByTestId('quick-join-panel')).not.toBeInTheDocument();
    });

    it('prompts for a team name before quick-joining', () => {
      mockUseIsPremium.mockReturnValue(true);
      gqlMock.useGetPublicLeaguesQuery.mockReturnValue({
        data: { publicLeagues: [quickJoinLeague] },
        loading: false,
      });

      renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Quick Join/ }));

      expect(mockJoinPublicLeague).not.toHaveBeenCalled();
      expect(
        screen.getByText(/Please enter a team name to Quick Join/),
      ).toBeInTheDocument();
    });

    it('quick-joins the league and navigates on success', async () => {
      mockUseIsPremium.mockReturnValue(true);
      gqlMock.useGetPublicLeaguesQuery.mockReturnValue({
        data: { publicLeagues: [quickJoinLeague] },
        loading: false,
      });
      mockJoinPublicLeague.mockResolvedValue({
        data: { joinPublicLeague: { success: true, leagueId: 42 } },
      });

      renderPage();
      fireEvent.change(screen.getByPlaceholderText(/Enter your team name/i), {
        target: { value: 'My Team' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Quick Join/ }));

      await waitFor(() => {
        expect(mockJoinPublicLeague).toHaveBeenCalledWith({
          variables: { leagueId: 42, teamName: 'My Team' },
        });
      });
      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/baseball/league/42');
      });
    });

    // Project rule: every mutation call site needs coverage for an
    // UNAUTHENTICATED error — the UI must surface it gracefully, not crash
    // or silently no-op.
    it('surfaces an error without crashing when quick-join returns UNAUTHENTICATED', async () => {
      mockUseIsPremium.mockReturnValue(true);
      gqlMock.useGetPublicLeaguesQuery.mockReturnValue({
        data: { publicLeagues: [quickJoinLeague] },
        loading: false,
      });
      mockJoinPublicLeague.mockRejectedValue(
        new CombinedGraphQLErrors({
          errors: [
            {
              message: 'Not authenticated',
              extensions: { code: 'UNAUTHENTICATED' },
            },
          ],
        }),
      );

      renderPage();
      fireEvent.change(screen.getByPlaceholderText(/Enter your team name/i), {
        target: { value: 'My Team' },
      });
      fireEvent.click(screen.getByRole('button', { name: /Quick Join/ }));

      await waitFor(() => {
        expect(screen.getByText(/Not authenticated/)).toBeInTheDocument();
      });
      expect(mockNavigate).not.toHaveBeenCalledWith(
        expect.stringContaining('/league/'),
      );
    });
  });

  /**
   * Regression: LS-1295 — deep-link banner must not show for an unvalidated URL param
   *
   * The banner ("Invite code loaded from link! Ready to join.") must only appear
   * once the invite code has been validated by the server (leagueInfo is present)
   * AND the current code input still matches the validated value.
   *
   * NOTE: This test MUST be last because jest.resetModules() clears the module
   * registry, which would break subsequent tests that depend on the top-level
   * jest.mock() setup.
   */
  it('does not show deep-link banner when invite code from URL is not yet validated (LS-1295 regression)', () => {
    jest.doMock('@legacy-sports/graphql', () => ({
      Sport: { Baseball: 'baseball', Football: 'football' },
      useJoinLeagueByCodeMutation: jest.fn(() => [
        mockJoinLeague,
        { loading: false },
      ]),
      // Simulate no validation result yet
      useValidateInviteCodeLazyQuery: jest.fn(() => [
        mockValidateCode,
        { data: undefined, loading: false },
      ]),
      useGetPublicLeaguesQuery: jest.fn(() => ({
        data: { publicLeagues: [] },
        loading: false,
      })),
      useJoinPublicLeagueMutation: jest.fn(() => [
        mockJoinPublicLeague,
        { loading: false },
      ]),
    }));
    jest.doMock('react-router-dom', () => ({
      ...jest.requireActual('react-router-dom'),
      useNavigate: () => mockNavigate,
      useParams: () => ({ inviteCode: 'ABC12345' }),
    }));

    const {
      render: rtlRender,
      screen: rtlScreen,
    } = require('@testing-library/react');
    const {
      MemoryRouter: Router,
      Route: RRoute,
      Routes: RRoutes,
    } = jest.requireActual('react-router-dom');
    const { JoinLeagueByCodePage: Page } =
      require('./JoinLeagueByCodePage') as typeof import('./JoinLeagueByCodePage');

    rtlRender(
      <Router initialEntries={['/baseball/join/ABC12345']}>
        <RRoutes>
          <RRoute path="/baseball/join/:inviteCode" element={<Page />} />
        </RRoutes>
      </Router>,
    );

    expect(
      rtlScreen.queryByText(/Invite code loaded from link/i),
    ).not.toBeInTheDocument();

    jest.resetModules();
  });
});

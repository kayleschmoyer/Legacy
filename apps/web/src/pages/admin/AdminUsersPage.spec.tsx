/**
 * Tests for the impersonation flow added in LS-5741, which moved impersonate
 * from AdminPage into AdminUsersPage (the canonical user management surface).
 */
import React from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminUsersPage from './AdminUsersPage';

type ChildrenProps = { children?: React.ReactNode };

// ─── module mocks ─────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    Navigate: ({ to }: { to: string }) => (
      <div data-testid={`navigate-${to}`} />
    ),
  };
});

const mockLoggerError = jest.fn();
jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    error: (...args: unknown[]): void => {
      mockLoggerError(...args);
    },
  },
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({
    children,
    onPress,
    disabled,
  }: {
    children?: React.ReactNode;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <button onClick={onPress} disabled={disabled}>
      {children}
    </button>
  ),
  XStack: ({ children }: ChildrenProps) => <div>{children}</div>,
  YStack: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Card: ({ children }: ChildrenProps) => <div>{children}</div>,
  Dialog: Object.assign(
    ({ children, open }: { children?: React.ReactNode; open?: boolean }) =>
      open ? <div data-testid="dialog">{children}</div> : null,
    {
      Portal: ({ children }: ChildrenProps) => <div>{children}</div>,
      Overlay: () => null,
      Content: ({ children }: ChildrenProps) => <div>{children}</div>,
      Title: ({ children }: ChildrenProps) => (
        <h2 data-testid="dialog-title">{children}</h2>
      ),
      Description: ({ children }: ChildrenProps) => <p>{children}</p>,
    },
  ),
  H1: ({ children }: ChildrenProps) => <h1>{children}</h1>,
  Input: ({
    value,
    onChangeText,
    placeholder,
  }: {
    value?: string;
    onChangeText?: (v: string) => void;
    placeholder?: string;
  }) => (
    <input
      value={value}
      onChange={(e) => onChangeText?.(e.target.value)}
      placeholder={placeholder}
    />
  ),
  Paragraph: ({ children }: ChildrenProps) => <p>{children}</p>,
  Spinner: () => <span data-testid="spinner" />,
  Text: ({ children }: ChildrenProps) => <span>{children}</span>,
}));

const mockImpersonateUser = jest.fn();
const mockUseAuth = jest.fn<
  {
    user: {
      id: number;
      accessLevel: string;
      impersonatedBy?: { username: string };
    };
    isLoading: boolean;
    isAuthenticated: boolean;
    impersonateUser: jest.Mock;
  },
  []
>();
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockUseGetAllUsersQuery = jest.fn<
  {
    data: {
      users: {
        id: number;
        email: string;
        username: string;
        accessLevel: string;
      }[];
    };
    loading: boolean;
    error: undefined;
    refetch: jest.Mock;
  },
  [unknown?]
>();
const mockUseGetUsersCountQuery = jest.fn<
  { data: { usersCount: number }; loading: boolean },
  [unknown?]
>();
const mockUseUpdateUserRoleMutation = jest.fn<
  [jest.Mock, { loading: boolean }],
  []
>();
const mockGrantTemporaryPremium = jest.fn();
const mockUseGrantTemporaryPremiumMutation = jest.fn<
  [jest.Mock, { loading: boolean }],
  []
>();
const mockUseGetUserByIdQuery = jest.fn<
  { data: { user: { accessLevel: string } } | undefined; loading: boolean },
  [unknown?]
>();
jest.mock('@legacy-sports/graphql', () => ({
  useGetAllUsersQuery: (opts?: unknown) => mockUseGetAllUsersQuery(opts),
  useGetUsersCountQuery: (opts?: unknown) => mockUseGetUsersCountQuery(opts),
  useUpdateUserRoleMutation: () => mockUseUpdateUserRoleMutation(),
  useGetUserByIdQuery: (opts?: unknown) => mockUseGetUserByIdQuery(opts),
  useGrantTemporaryPremiumMutation: () =>
    mockUseGrantTemporaryPremiumMutation(),
}));

// ─── helpers ──────────────────────────────────────────────────────────────────

const ADMIN_USER = { id: 1, accessLevel: 'admin' };

const USERS = [
  {
    id: 1,
    email: 'admin@example.com',
    username: 'admin',
    accessLevel: 'admin',
  },
  { id: 2, email: 'alice@example.com', username: 'alice', accessLevel: 'none' },
  { id: 3, email: 'bob@example.com', username: 'bob', accessLevel: 'none' },
];

function setupMocks(overrides?: {
  impersonateUser?: jest.Mock;
  impersonatedBy?: { username: string };
}) {
  mockNavigate.mockReset();
  mockLoggerError.mockReset();
  mockImpersonateUser.mockReset().mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    user: overrides?.impersonatedBy
      ? { ...ADMIN_USER, impersonatedBy: overrides.impersonatedBy }
      : ADMIN_USER,
    isLoading: false,
    isAuthenticated: true,
    impersonateUser: overrides?.impersonateUser ?? mockImpersonateUser,
  });
  mockUseGetUserByIdQuery.mockReturnValue({
    data: { user: { accessLevel: 'admin' } },
    loading: false,
  });
  mockUseGetAllUsersQuery.mockReturnValue({
    data: { users: USERS },
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  });
  mockUseGetUsersCountQuery.mockReturnValue({
    data: { usersCount: USERS.length },
    loading: false,
  });
  mockUseUpdateUserRoleMutation.mockReturnValue([
    jest.fn(),
    { loading: false },
  ]);
  mockGrantTemporaryPremium.mockReset().mockResolvedValue({
    data: {
      grantTemporaryPremium: {
        stripeSubscriptionId: 'sub_test',
        expiresAt: '2026-08-16T00:00:00.000Z',
        days: 7,
      },
    },
  });
  mockUseGrantTemporaryPremiumMutation.mockReturnValue([
    mockGrantTemporaryPremium,
    { loading: false },
  ]);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminUsersPage />
    </MemoryRouter>,
  );
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe('AdminUsersPage — impersonation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('shows Impersonate button for non-admin, non-self users', () => {
    renderPage();
    // alice and bob are non-admin non-self — should have Impersonate buttons
    const buttons = screen.getAllByRole('button', { name: /impersonate/i });
    expect(buttons).toHaveLength(2);
  });

  it('does not show Impersonate button for the current admin user (self)', () => {
    renderPage();
    // admin row (id=1 = self) should not have an impersonate button
    // We have 2 impersonate buttons total (alice, bob), not 3
    const buttons = screen.getAllByRole('button', { name: /impersonate/i });
    expect(buttons).toHaveLength(2);
  });

  it('does not show Impersonate button for other admin users', () => {
    mockUseGetAllUsersQuery.mockReturnValue({
      data: {
        users: [
          ...USERS,
          {
            id: 4,
            email: 'admin2@example.com',
            username: 'admin2',
            accessLevel: 'admin',
          },
        ],
      },
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });
    renderPage();
    // admin2 is admin → no impersonate; alice + bob still get buttons
    const buttons = screen.getAllByRole('button', { name: /impersonate/i });
    expect(buttons).toHaveLength(2);
  });

  it('opens the confirmation dialog when Impersonate is clicked', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /impersonate/i,
    });
    await userEvent.click(firstButton);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent(
      /impersonate/i,
    );
  });

  it('calls auth.impersonateUser and navigates to / on confirm', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /impersonate/i,
    });
    await userEvent.click(firstButton);

    const dialog = screen.getByTestId('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: /^impersonate$/i,
    });
    await act(async () => {
      await userEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(mockImpersonateUser).toHaveBeenCalledTimes(1);
      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  it('closes the dialog and does not impersonate on cancel', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /impersonate/i,
    });
    await userEvent.click(firstButton);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByTestId('dialog')).getByRole('button', {
        name: /cancel/i,
      }),
    );

    expect(mockImpersonateUser).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });

  it('logs an error and does not navigate when impersonation fails', async () => {
    const failingImpersonate = jest
      .fn()
      .mockRejectedValue(new Error('auth failed'));
    setupMocks({ impersonateUser: failingImpersonate });

    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /impersonate/i,
    });
    await userEvent.click(firstButton);

    await act(async () => {
      await userEvent.click(
        within(screen.getByTestId('dialog')).getByRole('button', {
          name: /^impersonate$/i,
        }),
      );
    });

    await waitFor(() => {
      expect(mockLoggerError).toHaveBeenCalledWith(
        'Impersonation failed:',
        expect.any(Error),
      );
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('disables the role-toggle confirm button while impersonating', async () => {
    setupMocks({ impersonatedBy: { username: 'admin' } });
    renderPage();

    const [toggleButton] = screen.getAllByRole('button', {
      name: /make admin/i,
    });
    await userEvent.click(toggleButton);

    const dialog = screen.getByTestId('dialog');
    const confirmButton = within(dialog).getByRole('button', {
      name: /^make admin$/i,
    });

    expect(confirmButton).toBeDisabled();
  });
});

describe('AdminUsersPage — test user toggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('defaults to excluding test users on fresh load', () => {
    renderPage();

    expect(mockUseGetAllUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ includeTestUsers: false }),
      }),
    );
    expect(mockUseGetUsersCountQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ includeTestUsers: false }),
      }),
    );
  });

  it('reveals test users when the toggle is enabled', async () => {
    renderPage();

    await userEvent.click(
      screen.getByRole('button', { name: /show test users/i }),
    );

    expect(mockUseGetAllUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ includeTestUsers: true }),
      }),
    );
    expect(mockUseGetUsersCountQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ includeTestUsers: true }),
      }),
    );
  });

  it('re-hides test users when the toggle is disabled again', async () => {
    renderPage();

    const toggle = () =>
      screen.getByRole('button', { name: /(show|hide) test users/i });

    await userEvent.click(toggle());
    expect(toggle()).toHaveTextContent(/hide test users/i);

    await userEvent.click(toggle());

    expect(toggle()).toHaveTextContent(/show test users/i);
    expect(mockUseGetAllUsersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        variables: expect.objectContaining({ includeTestUsers: false }),
      }),
    );
  });
});

describe('AdminUsersPage — grant temporary premium', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setupMocks();
  });

  it('shows a Grant Temp Premium button for every user row', () => {
    renderPage();
    const buttons = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    expect(buttons).toHaveLength(USERS.length);
  });

  it('opens the confirmation dialog with a days input when clicked', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    await userEvent.click(firstButton);

    expect(screen.getByTestId('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('dialog-title')).toHaveTextContent(
      /grant temporary premium/i,
    );
  });

  it('calls grantTemporaryPremium with the selected userId and days on confirm', async () => {
    renderPage();

    const buttons = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    // alice is USERS[1], id 2
    await userEvent.click(buttons[1]);

    const dialog = screen.getByTestId('dialog');
    const daysInput = within(dialog).getByDisplayValue('7');
    await userEvent.clear(daysInput);
    await userEvent.type(daysInput, '14');

    const confirmButton = within(dialog).getByRole('button', {
      name: /^grant$/i,
    });
    await act(async () => {
      await userEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(mockGrantTemporaryPremium).toHaveBeenCalledWith({
        variables: { userId: 2, days: 14 },
      });
    });
  });

  it('disables the confirm button when days is out of range', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    await userEvent.click(firstButton);

    const dialog = screen.getByTestId('dialog');
    const daysInput = within(dialog).getByDisplayValue('7');
    await userEvent.clear(daysInput);
    await userEvent.type(daysInput, '91');

    const confirmButton = within(dialog).getByRole('button', {
      name: /^grant$/i,
    });
    expect(confirmButton).toBeDisabled();
  });

  it('shows success feedback with the expiry date after a grant', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    await userEvent.click(firstButton);

    const confirmButton = within(screen.getByTestId('dialog')).getByRole(
      'button',
      { name: /^grant$/i },
    );
    await act(async () => {
      await userEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(screen.getByText(/granted premium until/i)).toBeInTheDocument();
    });
  });

  it('shows an error message when the mutation fails', async () => {
    mockGrantTemporaryPremium.mockRejectedValueOnce(
      new Error('User already has an active subscription'),
    );
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    await userEvent.click(firstButton);

    const confirmButton = within(screen.getByTestId('dialog')).getByRole(
      'button',
      { name: /^grant$/i },
    );
    await act(async () => {
      await userEvent.click(confirmButton);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/error: user already has an active subscription/i),
      ).toBeInTheDocument();
    });
  });

  it('closes the dialog without calling the mutation on cancel', async () => {
    renderPage();

    const [firstButton] = screen.getAllByRole('button', {
      name: /grant temp premium/i,
    });
    await userEvent.click(firstButton);

    await userEvent.click(
      within(screen.getByTestId('dialog')).getByRole('button', {
        name: /cancel/i,
      }),
    );

    expect(mockGrantTemporaryPremium).not.toHaveBeenCalled();
    expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
  });
});

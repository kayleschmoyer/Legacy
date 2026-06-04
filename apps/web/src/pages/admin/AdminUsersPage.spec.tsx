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
    user: { id: number; accessLevel: string };
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
const mockUseGetUserByIdQuery = jest.fn<
  { data: { user: { accessLevel: string } } | undefined; loading: boolean },
  [unknown?]
>();
jest.mock('../../api/db/graphql.generated', () => ({
  useGetAllUsersQuery: (opts?: unknown) => mockUseGetAllUsersQuery(opts),
  useGetUsersCountQuery: (opts?: unknown) => mockUseGetUsersCountQuery(opts),
  useUpdateUserRoleMutation: () => mockUseUpdateUserRoleMutation(),
  useGetUserByIdQuery: (opts?: unknown) => mockUseGetUserByIdQuery(opts),
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

function setupMocks(overrides?: { impersonateUser?: jest.Mock }) {
  mockNavigate.mockReset();
  mockLoggerError.mockReset();
  mockImpersonateUser.mockReset().mockResolvedValue(undefined);
  mockUseAuth.mockReturnValue({
    user: ADMIN_USER,
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
});

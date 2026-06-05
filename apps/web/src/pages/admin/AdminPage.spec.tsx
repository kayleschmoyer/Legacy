/**
 * Unit tests for AdminPage auth loading and unauthorized redirect states (LS-5313).
 */
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminPage from './AdminPage';

type MockProps = { children?: React.ReactNode; [key: string]: unknown };

type AuthMock = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: { accessLevel: string; id?: number } | null;
  impersonateUser: jest.Mock;
};

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  XStack: ({ children, ...rest }: MockProps) => (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  ),
  YStack: ({ children, ...rest }: MockProps) => (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  ),
}));

jest.mock('@legacy-sports/shared-components', () => ({
  Dialog: () => null,
}));

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => ({
  ...jest.requireActual<typeof import('react-router-dom')>('react-router-dom'),
  useNavigate: () => mockNavigate,
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const mockUseAuth = jest.fn<AuthMock, []>();
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (): AuthMock => mockUseAuth(),
}));

const mockUseGetUserByIdQuery = jest.fn<
  {
    data: { user: { accessLevel: string; id: number } } | undefined;
    loading: boolean;
    error: undefined;
    refetch: jest.Mock;
  },
  [unknown?]
>();
jest.mock('../../api/db/graphql.generated', () => ({
  useAdminGetUsersQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
  useGetUserByIdQuery: (...args: unknown[]) => mockUseGetUserByIdQuery(...args),
  useGetUsersCountQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
  useGetAllUsersQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
}));

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  mockNavigate.mockClear();
  mockUseGetUserByIdQuery.mockReturnValue({
    data: undefined,
    loading: false,
    error: undefined,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AdminPage — auth loading state', () => {
  it('renders a loading spinner when auth.isLoading is true', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: true,
      user: null,
      impersonateUser: jest.fn(),
    });

    renderPage();

    expect(screen.getByTestId('admin-auth-loading')).toBeInTheDocument();
    expect(screen.queryByText('Admin Console')).not.toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});

describe('AdminPage — unauthorized redirect', () => {
  it('redirects to / when user is not authenticated', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      impersonateUser: jest.fn(),
    });

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('redirects to / when authenticated user has accessLevel "none"', async () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { accessLevel: 'none', id: 2 },
      impersonateUser: jest.fn(),
    });

    renderPage();

    act(() => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/', { replace: true });
    });
  });

  it('renders admin page content when user is admin', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { accessLevel: 'admin', id: 1 },
      impersonateUser: jest.fn(),
    });
    mockUseGetUserByIdQuery.mockReturnValue({
      data: { user: { accessLevel: 'admin', id: 1 } },
      loading: false,
      error: undefined,
      refetch: jest.fn(),
    });

    renderPage();

    expect(screen.getByText('Admin Console')).toBeInTheDocument();
    expect(mockNavigate).not.toHaveBeenCalledWith('/', expect.anything());
  });
});

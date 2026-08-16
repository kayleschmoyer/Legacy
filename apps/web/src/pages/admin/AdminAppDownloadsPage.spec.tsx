/**
 * Tests for the app-download allowlist admin page (LS-9456).
 *
 * The cases that matter here are the ones that would silently break the
 * feature's purpose: an address with no account behind it must be addable and
 * visibly marked, a duplicate must produce a message rather than a stack
 * trace, and a non-admin must see the restricted state rather than the list.
 */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminAppDownloadsPage from './AdminAppDownloadsPage';

type ChildrenProps = { children?: React.ReactNode; [key: string]: unknown };

// Declared out here rather than inline in the jest.mock factory: babel's
// mock-factory guard treats a parameter name inside an inline function type as
// an out-of-scope variable reference and refuses to compile the file.
type TextChangeHandler = (value: string) => void;

jest.mock('../../components/PageMeta', () => ({
  PageMeta: () => null,
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock('@tamagui/lucide-icons/icons/Lock', () => ({
  Lock: () => <span data-testid="lock-icon" />,
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({ children, onPress, disabled, ...props }: ChildrenProps) => (
    <button
      onClick={onPress as () => void}
      disabled={disabled as boolean}
      {...props}
    >
      {children}
    </button>
  ),
  Paragraph: ({ children }: ChildrenProps) => <p>{children}</p>,
  XStack: ({ children }: ChildrenProps) => <div>{children}</div>,
  YStack: ({ children }: ChildrenProps) => <div>{children}</div>,
}));

jest.mock('tamagui', () => ({
  Card: ({ children, ...props }: ChildrenProps) => (
    <div {...props}>{children}</div>
  ),
  H1: ({ children }: ChildrenProps) => <h1>{children}</h1>,
  Input: ({ onChangeText, value, ...props }: ChildrenProps) => (
    <input
      value={value as string}
      onChange={(e) => (onChangeText as TextChangeHandler)(e.target.value)}
      {...props}
    />
  ),
  Spinner: () => <span data-testid="spinner" />,
  Text: ({ children }: ChildrenProps) => <span>{children}</span>,
}));

type AuthMock = {
  isAuthenticated: boolean;
  isLoading: boolean;
  user?: { id: number; accessLevel?: string };
};

const mockUseAuth = jest.fn<AuthMock, []>();
jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (): AuthMock => mockUseAuth(),
}));

type AllowlistRowMock = {
  id: number;
  email: string;
  note: string | null;
  addedByEmail: string | null;
  createdAt: string;
  revokedAt: string | null;
  hasAccount: boolean;
  lastDownloadAt: string | null;
};

type ServerUserMock = {
  data?: { user: { accessLevel: string } | null };
  loading: boolean;
};

type AllowlistQueryMock = {
  data?: { appDownloadAllowlist: AllowlistRowMock[] };
  loading: boolean;
  error?: Error;
};

const mockUseGetUserByIdQuery = jest.fn<ServerUserMock, [unknown?]>();
const mockUseAllowlistQuery = jest.fn<AllowlistQueryMock, [unknown?]>();
const mockAddEntry = jest.fn();
const mockSetRevoked = jest.fn();

jest.mock('@legacy-sports/graphql', () => ({
  AppDownloadAllowlist: 'APP_DOWNLOAD_ALLOWLIST_DOCUMENT',
  useGetUserByIdQuery: (opts?: unknown): ServerUserMock =>
    mockUseGetUserByIdQuery(opts),
  useAppDownloadAllowlistQuery: (opts?: unknown): AllowlistQueryMock =>
    mockUseAllowlistQuery(opts),
  useAddAppDownloadAllowlistEntryMutation: () => [
    mockAddEntry,
    { loading: false },
  ],
  useSetAppDownloadAllowlistRevokedMutation: () => [
    mockSetRevoked,
    { loading: false },
  ],
}));

const LISTED = {
  id: 1,
  email: 'tester@example.com',
  note: 'beta group',
  addedByEmail: 'admin@example.com',
  createdAt: '2026-08-01T00:00:00.000Z',
  revokedAt: null,
  hasAccount: true,
  lastDownloadAt: '2026-08-10T00:00:00.000Z',
};

const NO_ACCOUNT = {
  ...LISTED,
  id: 2,
  email: 'invited@example.com',
  note: null,
  hasAccount: false,
  lastDownloadAt: null,
};

const REVOKED = {
  ...LISTED,
  id: 3,
  email: 'former@example.com',
  revokedAt: '2026-08-12T00:00:00.000Z',
};

function renderPage() {
  return render(
    <MemoryRouter>
      <AdminAppDownloadsPage />
    </MemoryRouter>,
  );
}

describe('AdminAppDownloadsPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, accessLevel: 'admin' },
    });
    mockUseGetUserByIdQuery.mockReturnValue({
      data: { user: { accessLevel: 'admin' } },
      loading: false,
    });
    mockUseAllowlistQuery.mockReturnValue({
      data: { appDownloadAllowlist: [LISTED, NO_ACCOUNT, REVOKED] },
      loading: false,
      error: undefined,
    });
    mockAddEntry.mockResolvedValue({
      data: {
        addAppDownloadAllowlistEntry: {
          success: true,
          message: null,
          entries: [LISTED],
        },
      },
    });
    mockSetRevoked.mockResolvedValue({
      data: {
        setAppDownloadAllowlistRevoked: {
          success: true,
          message: null,
          entries: [LISTED],
        },
      },
    });
  });

  describe('access', () => {
    it('shows the restricted state to a non-admin', () => {
      mockUseGetUserByIdQuery.mockReturnValue({
        data: { user: { accessLevel: 'none' } },
        loading: false,
      });

      renderPage();

      expect(screen.getByText('Admin Access Required')).toBeInTheDocument();
      expect(screen.queryByText('tester@example.com')).not.toBeInTheDocument();
    });

    it('does not run the allowlist query for a non-admin', () => {
      mockUseGetUserByIdQuery.mockReturnValue({
        data: { user: { accessLevel: 'none' } },
        loading: false,
      });

      renderPage();

      expect(mockUseAllowlistQuery).toHaveBeenCalledWith(
        expect.objectContaining({ skip: true }),
      );
    });

    it('restricts a user whose client-side claim says admin but whose account does not', () => {
      // The gate reads the server-verified access level, not the auth claim.
      mockUseAuth.mockReturnValue({
        isAuthenticated: true,
        isLoading: false,
        user: { id: 1, accessLevel: 'admin' },
      });
      mockUseGetUserByIdQuery.mockReturnValue({
        data: { user: { accessLevel: 'none' } },
        loading: false,
      });

      renderPage();

      expect(screen.getByText('Admin Access Required')).toBeInTheDocument();
    });
  });

  describe('the list', () => {
    it('renders every row', () => {
      renderPage();

      expect(screen.getByText('tester@example.com')).toBeInTheDocument();
      expect(screen.getByText('invited@example.com')).toBeInTheDocument();
      expect(screen.getByText('former@example.com')).toBeInTheDocument();
    });

    it('distinguishes a row whose address has no account yet', () => {
      renderPage();

      // One badge per account-less row — this is how an admin sees who has
      // not signed in, which is the state a new tester starts in.
      expect(screen.getAllByText('No account yet')).toHaveLength(1);
      expect(screen.getAllByText('Has account')).toHaveLength(2);
    });

    it('marks a revoked row', () => {
      renderPage();

      expect(screen.getByText('Revoked')).toBeInTheDocument();
    });

    it('offers Revoke on an active row and Re-instate on a revoked one', () => {
      renderPage();

      expect(screen.getAllByText('Revoke')).toHaveLength(2);
      expect(screen.getAllByText('Re-instate')).toHaveLength(1);
    });

    it('explains the empty state rather than rendering a bare list', () => {
      mockUseAllowlistQuery.mockReturnValue({
        data: { appDownloadAllowlist: [] },
        loading: false,
        error: undefined,
      });

      renderPage();

      expect(
        screen.getByText(/Nobody is on the allowlist yet/i),
      ).toBeInTheDocument();
    });
  });

  describe('adding an address', () => {
    function typeEmail(value: string) {
      fireEvent.change(screen.getByLabelText('Email address'), {
        target: { value },
      });
    }

    it('accepts an address that has no user account', async () => {
      renderPage();
      typeEmail('never-signed-up@example.com');
      fireEvent.click(screen.getByText('Add'));

      await waitFor(() => expect(mockAddEntry).toHaveBeenCalled());
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({
            email: 'never-signed-up@example.com',
          }),
        }),
      );
    });

    it('sends an omitted note as null rather than an empty string', async () => {
      renderPage();
      typeEmail('tester2@example.com');
      fireEvent.click(screen.getByText('Add'));

      await waitFor(() => expect(mockAddEntry).toHaveBeenCalled());
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({ note: null }),
        }),
      );
    });

    it('trims the address before sending it', async () => {
      renderPage();
      typeEmail('  spaced@example.com  ');
      fireEvent.click(screen.getByText('Add'));

      await waitFor(() => expect(mockAddEntry).toHaveBeenCalled());
      expect(mockAddEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          variables: expect.objectContaining({ email: 'spaced@example.com' }),
        }),
      );
    });

    it('clears the form after a successful add', async () => {
      renderPage();
      typeEmail('tester3@example.com');
      fireEvent.click(screen.getByText('Add'));

      await waitFor(() =>
        expect(screen.getByLabelText('Email address')).toHaveValue(''),
      );
    });

    it('surfaces the duplicate message instead of failing silently', async () => {
      mockAddEntry.mockResolvedValue({
        data: {
          addAppDownloadAllowlistEntry: {
            success: false,
            message: 'tester@example.com is already on the allowlist.',
            entries: [LISTED],
          },
        },
      });

      renderPage();
      typeEmail('tester@example.com');
      fireEvent.click(screen.getByText('Add'));

      expect(
        await screen.findByText(/already on the allowlist/i),
      ).toBeInTheDocument();
    });

    it('keeps the typed address when the add is rejected', async () => {
      mockAddEntry.mockResolvedValue({
        data: {
          addAppDownloadAllowlistEntry: {
            success: false,
            message: 'nope',
            entries: [LISTED],
          },
        },
      });

      renderPage();
      typeEmail('tester@example.com');
      fireEvent.click(screen.getByText('Add'));

      await screen.findByText('nope');
      expect(screen.getByLabelText('Email address')).toHaveValue(
        'tester@example.com',
      );
    });

    it('reports a thrown network error rather than swallowing it', async () => {
      mockAddEntry.mockRejectedValue(new Error('network down'));

      renderPage();
      typeEmail('tester4@example.com');
      fireEvent.click(screen.getByText('Add'));

      expect(await screen.findByText('network down')).toBeInTheDocument();
    });

    it('does not submit an empty address', () => {
      renderPage();
      fireEvent.click(screen.getByText('Add'));

      expect(mockAddEntry).not.toHaveBeenCalled();
    });
  });

  describe('revoking and re-instating', () => {
    it('revokes an active row', async () => {
      renderPage();
      fireEvent.click(screen.getAllByText('Revoke')[0]);

      await waitFor(() => expect(mockSetRevoked).toHaveBeenCalled());
      expect(mockSetRevoked).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { id: 1, revoked: true } }),
      );
    });

    it('re-instates a revoked row through the same action', async () => {
      renderPage();
      fireEvent.click(screen.getByText('Re-instate'));

      await waitFor(() => expect(mockSetRevoked).toHaveBeenCalled());
      expect(mockSetRevoked).toHaveBeenCalledWith(
        expect.objectContaining({ variables: { id: 3, revoked: false } }),
      );
    });

    it('surfaces a server-reported failure', async () => {
      mockSetRevoked.mockResolvedValue({
        data: {
          setAppDownloadAllowlistRevoked: {
            success: false,
            message: 'That allowlist entry no longer exists.',
            entries: [],
          },
        },
      });

      renderPage();
      fireEvent.click(screen.getAllByText('Revoke')[0]);

      expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    });
  });

  describe('load failures', () => {
    it('reports a query error', () => {
      mockUseAllowlistQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('boom'),
      });

      renderPage();

      expect(screen.getByText(/Could not load the allowlist/i)).toBeVisible();
    });

    it('does not claim the allowlist is empty when it merely failed to load', () => {
      // A failed load also yields zero entries. Saying "nobody is listed"
      // there would invite an admin to re-add testers who are already on it.
      mockUseAllowlistQuery.mockReturnValue({
        data: undefined,
        loading: false,
        error: new Error('boom'),
      });

      renderPage();

      expect(
        screen.queryByText(/Nobody is on the allowlist yet/i),
      ).not.toBeInTheDocument();
    });
  });
});

/**
 * LS-7668: unit coverage for the web Discord link entry point on
 * ProfileSettingsPage — the "Connect Discord" initiate path (full-page redirect
 * to the oauth-proxy authorize endpoint) and the `discord_linked=1`
 * redirect-back effect. State generation / the HttpOnly cookie are server side
 * and covered in lambdas/oauth-proxy.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import ProfileSettingsPage from './ProfileSettingsPage';

type ChildrenProps = { children?: React.ReactNode };

type AuthConfig = { oauthProxyUrl?: string; discordClientId?: string };

const mockUseAuth = jest.fn<unknown, []>();
const mockNavigate = jest.fn();
const mockRefetchUser = jest.fn();
const mockRefetchIdentities = jest.fn();
// Must be a stable instance per test so the effect (which depends on
// `searchParams`) does not re-fire on every render.
let mockSearchParams = new URLSearchParams();
let mockIdentities: Array<Record<string, unknown>> = [];

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}));

jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremiumStatus: () => ({ isPremium: false, isLoading: false }),
}));

jest.mock('@legacy-sports/shared-components/ui', () => {
  const Passthrough = ({ children, id }: ChildrenProps & { id?: string }) => (
    <div id={id}>{children}</div>
  );
  return {
    AvatarPicker: () => null,
    Dialog: () => null,
    H1: Passthrough,
    Paragraph: Passthrough,
    Separator: () => <hr />,
    XStack: Passthrough,
    YStack: ({
      children,
      onPress,
    }: ChildrenProps & { onPress?: () => void }) => (
      <div onClick={onPress}>{children}</div>
    ),
  };
});

jest.mock('./signOut', () => ({ signOut: jest.fn() }));

jest.mock('../../utils/analytics', () => ({ trackSignOut: jest.fn() }));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    getStoredTokenExpiry: () => null,
  })),
  useAuth: () => mockUseAuth(),
  useMfa: () => ({}),
}));

jest.mock('@legacy-sports/shared-components/icons', () => ({
  BrandIcon: () => null,
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  styled: <T,>(Component: T) => Component,
  Input: () => <input />,
  ScrollView: ({ children }: ChildrenProps) => <div>{children}</div>,
  Spinner: () => null,
}));

jest.mock('@legacy-sports/graphql', () => ({
  useGetUserByIdQuery: () => ({ data: undefined, refetch: mockRefetchUser }),
  useMyIdentitiesQuery: () => ({
    data: { myIdentities: mockIdentities },
    loading: false,
    refetch: mockRefetchIdentities,
  }),
  useSetCanonicalEmailMutation: () => [jest.fn(), { loading: false }],
  useUpdateUserAvatarMutation: () => [jest.fn(), { loading: false }],
  useUpdateUsernameMutation: () => [jest.fn(), { loading: false }],
  useUsernameAvailableQuery: () => ({
    data: undefined,
    loading: false,
    error: undefined,
  }),
}));

jest.mock('../../components/profile/TwoFactorSection', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

jest.mock('../../components/auth/AuthPendingFallback', () => ({
  AuthPendingFallback: () => <div data-testid="auth-pending-fallback" />,
}));

/**
 * jsdom 26 makes `window.location` unforgeable (it cannot be redefined or
 * replaced — see jestjs/jest#15674), and assigning `location.href` to a
 * cross-origin URL only logs "not implemented: navigation". To observe the
 * redirect target we spy on the `href` setter of jsdom's internal Location
 * implementation object (reached through its wrapper's `impl` symbol).
 */
function spyOnLocationHrefSetter(): jest.Mock {
  const implSymbol = Object.getOwnPropertySymbols(window.location).find(
    (symbol) => symbol.description === 'impl',
  );
  if (!implSymbol) throw new Error('jsdom Location impl symbol not found');
  const impl = (window.location as unknown as Record<symbol, object>)[
    implSymbol
  ];
  const proto = Object.getPrototypeOf(impl) as { href: string };
  const setter = jest.fn();
  jest.spyOn(proto, 'href', 'set').mockImplementation(setter);
  return setter;
}

function renderPage(config: AuthConfig) {
  mockUseAuth.mockReturnValue({
    config,
    user: {
      id: 1,
      username: 'casey',
      email: 'casey@example.com',
      picture: null,
      accessLevel: 'none',
    },
  });
  return render(<ProfileSettingsPage />);
}

let mockHrefSetter: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchParams = new URLSearchParams();
  mockIdentities = [];
  mockHrefSetter = spyOnLocationHrefSetter();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ProfileSettingsPage Connect Discord (LS-7668)', () => {
  it('redirects to the oauth-proxy authorize endpoint with link=1', () => {
    renderPage({
      oauthProxyUrl: 'https://proxy.test/oauth',
      discordClientId: 'cid',
    });

    fireEvent.click(screen.getByText('Connect Discord'));

    expect(mockHrefSetter).toHaveBeenCalledTimes(1);
    expect(mockHrefSetter).toHaveBeenCalledWith(
      'https://proxy.test/oauth/discord/authorize?link=1',
    );
    expect(
      screen.queryByText(/Unable to start Discord connection/),
    ).not.toBeInTheDocument();
  });

  it('shows an error and does not navigate when oauthProxyUrl is unset', () => {
    renderPage({ discordClientId: 'cid' });

    fireEvent.click(screen.getByText('Connect Discord'));

    expect(mockHrefSetter).not.toHaveBeenCalled();
    expect(
      screen.getByText('Unable to start Discord connection. Please try again.'),
    ).toBeInTheDocument();
  });

  it('hides the button when discordClientId is unset', () => {
    renderPage({ oauthProxyUrl: 'https://proxy.test/oauth' });

    expect(screen.queryByText('Connect Discord')).not.toBeInTheDocument();
  });

  it('hides the button when a discord identity is already linked', () => {
    mockIdentities = [
      {
        __typename: 'UserIdentity',
        id: 2,
        provider: 'discord',
        providerEmail: 'testuser@discord.example.com',
        providerEmailVerified: true,
        providerUsername: 'testuser#1234',
        providerAvatar: null,
        linkedAt: '2026-02-01T00:00:00Z',
      },
    ];
    renderPage({
      oauthProxyUrl: 'https://proxy.test/oauth',
      discordClientId: 'cid',
    });

    expect(screen.queryByText('Connect Discord')).not.toBeInTheDocument();
  });
});

describe('ProfileSettingsPage discord_linked redirect-back (LS-7668)', () => {
  it('refetches user + identities and strips the param with a replace navigation', () => {
    mockSearchParams = new URLSearchParams('discord_linked=1&foo=bar');
    renderPage({});

    expect(mockRefetchUser).toHaveBeenCalledTimes(1);
    expect(mockRefetchIdentities).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith(
      { search: 'foo=bar' },
      { replace: true },
    );
  });

  it.each(['', 'discord_linked=0', 'discordlinked=1'])(
    'does nothing for search "%s"',
    (search) => {
      mockSearchParams = new URLSearchParams(search);
      renderPage({});

      expect(mockRefetchUser).not.toHaveBeenCalled();
      expect(mockRefetchIdentities).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
    },
  );
});

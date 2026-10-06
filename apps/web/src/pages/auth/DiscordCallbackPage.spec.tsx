import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DiscordCallbackPage from './DiscordCallbackPage';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockLinkDiscordAccount = jest.fn<Promise<void>, [string, string]>();

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => ({ config: {} }),
  AuthService: class {
    linkDiscordAccount(code: string, state: string): Promise<void> {
      return mockLinkDiscordAccount(code, state);
    }
  },
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: { info: jest.fn(), error: jest.fn() },
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Paragraph: ({
    children,
    onPress,
    ...rest
  }: React.HTMLAttributes<HTMLParagraphElement> & { onPress?: () => void }) => (
    <p onClick={onPress} {...rest}>
      {children}
    </p>
  ),
  YStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...rest}>{children}</div>
  ),
}));

jest.mock('tamagui', () => ({
  createTokens: (tokens: unknown) => tokens,
  Spinner: () => <div data-testid="spinner" />,
}));

function setSearch(search: string): void {
  window.history.pushState({}, '', `/auth/discord/callback${search}`);
}

function renderPage() {
  return render(
    <MemoryRouter>
      <DiscordCallbackPage />
    </MemoryRouter>,
  );
}

describe('DiscordCallbackPage — actionable link errors (LS-6659)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    setSearch('');
  });

  it('shows friendly guidance and a contact-support link for the already-linked 409', async () => {
    // Matches the real oauth-proxy message (lowercase "discord") — see
    // lambdas/oauth-proxy/src/handlers/IdentityLink.ts.
    mockLinkDiscordAccount.mockRejectedValue(
      new Error('Could not link discord account'),
    );
    setSearch('?code=abc&state=xyz');

    renderPage();

    // Generic, friendlier headline replaces the bare server string.
    expect(
      await screen.findByText(/this discord account can’t be linked/i),
    ).toBeInTheDocument();
    // Actionable next step for the already-linked case.
    expect(
      screen.getByText(/sign(ing)? in with that discord account/i),
    ).toBeInTheDocument();
    // Contact-support affordance is present and points at support email.
    const supportLink = screen.getByRole('link', {
      name: /need help\? contact support/i,
    });
    expect(supportLink).toHaveAttribute(
      'href',
      expect.stringContaining('mailto:legacy.fantasy.support@gmail.com'),
    );
  });

  it('shows the contact-support link even for a generic link failure', async () => {
    mockLinkDiscordAccount.mockRejectedValue(
      new Error('Discord authentication failed'),
    );
    setSearch('?code=abc&state=xyz');

    renderPage();

    expect(
      await screen.findByText(/discord authentication failed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /need help\? contact support/i }),
    ).toBeInTheDocument();
    // No already-linked-specific guidance for generic failures.
    expect(
      screen.queryByText(/sign in with that discord account/i),
    ).not.toBeInTheDocument();
  });

  it('navigates to profile settings on success', async () => {
    mockLinkDiscordAccount.mockResolvedValue(undefined);
    setSearch('?code=abc&state=xyz');

    renderPage();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith(
        '/profile/settings?discord_linked=1',
        { replace: true },
      );
    });
  });

  it('matches the already-linked 409 regardless of message casing (LS-9132, LS-9133)', async () => {
    mockLinkDiscordAccount.mockRejectedValue(
      new Error('Could Not Link Discord Account'),
    );
    setSearch('?code=abc&state=xyz');

    renderPage();

    expect(
      await screen.findByText(/this discord account can’t be linked/i),
    ).toBeInTheDocument();
  });

  it('shows an error with contact support when the security check fails (missing code/state)', async () => {
    setSearch('?code=abc');

    renderPage();

    expect(
      await screen.findByText(/the security check did not pass/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /need help\? contact support/i }),
    ).toBeInTheDocument();
  });
});

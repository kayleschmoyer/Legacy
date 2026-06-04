import React from 'react';
import type { ComponentProps } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AboutPage from './AboutPage';
import { env } from '../../config/environment';

const mockNavigate = jest.fn();

jest.mock('react-router-dom', () => {
  const actual =
    jest.requireActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));

const mockUseAuth = jest.fn(() => ({
  isAuthenticated: false,
  user: null,
  isLoading: false,
}));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({
    children,
    onPress,
    ...rest
  }: ComponentProps<'button'> & { onPress?: () => void }) => (
    <button onClick={onPress} {...rest}>
      {children}
    </button>
  ),
  H1: ({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...rest}>{children}</h1>
  ),
  H2: ({ children, ...rest }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...rest}>{children}</h2>
  ),
  XStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...rest}>{children}</div>
  ),
  YStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...rest}>{children}</div>
  ),
}));

jest.mock('tamagui', () => ({
  styled:
    (Base: React.ComponentType<React.HTMLAttributes<HTMLElement>>) =>
    ({ children, ...rest }: React.HTMLAttributes<HTMLElement>) => (
      <Base {...rest}>{children}</Base>
    ),
  Text: ({ children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) => (
    <span {...rest}>{children}</span>
  ),
  XStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...rest}>{children}</div>
  ),
  YStack: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...rest}>{children}</div>
  ),
}));

jest.mock('../../constants/colors', () => ({ BRAND_GOLD_LIGHT: '#c5a55a' }));

jest.mock('../../config/environment', () => ({
  env: {
    oauthProxyUrl: 'http://localhost:5001',
    googleClientId: 'test-client-id',
    graphqlUrl: 'http://localhost:5000/graphql',
    websocketUrl: '',
    isDev: false,
    environmentName: 'production',
    authTestMode: false,
    baseUrl: '/',
    appVersion: '1.0.0',
    commitSha: 'abc123',
    buildDate: '2026-01-01',
    branch: 'main',
    repoUrl: 'https://github.com/bkrupa/legacy-sports',
    jiraProxyUrl: '',
    stripeMonthlyPriceId: '',
    stripeAnnualPriceId: '',
    vapidPublicKey: '',
    repoUrl: 'https://github.com/bkrupa/legacy-sports',
  },
}));

const mockUseIsPremium = jest.fn<boolean, []>();
jest.mock('../../hooks/useIsPremium', () => ({
  useIsPremium: (): boolean => mockUseIsPremium(),
}));

function setEnvName(name: string) {
  (env as { environmentName: string }).environmentName = name;
}

function setAppVersion(v: string) {
  (env as { appVersion: string }).appVersion = v;
}

function setCommitSha(v: string) {
  (env as { commitSha: string }).commitSha = v;
}

function setBuildDate(v: string) {
  (env as { buildDate: string }).buildDate = v;
}

function renderAbout() {
  return render(
    <MemoryRouter>
      <AboutPage />
    </MemoryRouter>,
  );
}

describe('AboutPage — appVersion coercion (LS-5713)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsPremium.mockReturnValue(false);
    setAppVersion('1.0.0');
  });

  it('renders the version string when appVersion is non-empty', () => {
    setAppVersion('2.3.4');
    renderAbout();
    expect(screen.getByTestId('build-info-version')).toHaveTextContent('2.3.4');
  });

  it('shows "—" when appVersion is an empty string', () => {
    setAppVersion('');
    renderAbout();
    expect(screen.getByTestId('build-info-version')).toHaveTextContent('—');
  });
});

describe('AboutPage — Environment label (LS-5709)', () => {
  beforeEach(() => {
    mockUseIsPremium.mockReturnValue(false);
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    });
  });

  afterEach(() => {
    setEnvName('production');
  });

  it('shows "production" when environmentName is "production"', () => {
    renderAbout();
    expect(screen.getByTestId('build-info-environment')).toHaveTextContent(
      'production',
    );
  });

  it('shows "development" when environmentName is "development"', () => {
    setEnvName('development');
    renderAbout();
    expect(screen.getByTestId('build-info-environment')).toHaveTextContent(
      'development',
    );
  });

  it('shows "staging" when environmentName is "staging"', () => {
    setEnvName('staging');
    renderAbout();
    expect(screen.getByTestId('build-info-environment')).toHaveTextContent(
      'staging',
    );
  });

  it('shows "preview" when environmentName is "preview"', () => {
    setEnvName('preview');
    renderAbout();
    expect(screen.getByTestId('build-info-environment')).toHaveTextContent(
      'preview',
    );
  });
});

describe('AboutPage — Get Started card (LS-5722)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    });
    mockUseIsPremium.mockReturnValue(false);
  });

  it('shows Get Started Free CTA for unauthenticated users', () => {
    renderAbout();
    expect(
      screen.getByRole('button', { name: /get started free/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /go to dashboard/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /upgrade to premium/i }),
    ).not.toBeInTheDocument();
  });

  it('navigates to / when unauthenticated user clicks Get Started Free', () => {
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /get started free/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('shows Go to Dashboard and Upgrade to Premium for authenticated non-premium users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1' },
      isLoading: false,
    });
    mockUseIsPremium.mockReturnValue(false);

    renderAbout();

    expect(
      screen.getByRole('button', { name: /go to dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /upgrade to premium/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get started free/i }),
    ).not.toBeInTheDocument();
  });

  it('navigates to /home when authenticated user clicks Go to Dashboard', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1' },
      isLoading: false,
    });
    mockUseIsPremium.mockReturnValue(false);

    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: /go to dashboard/i }));
    expect(mockNavigate).toHaveBeenCalledWith('/home');
  });

  it('shows only Go to Dashboard for authenticated premium users', () => {
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      user: { id: '1' },
      isLoading: false,
    });
    mockUseIsPremium.mockReturnValue(true);

    renderAbout();

    expect(
      screen.getByRole('button', { name: /go to dashboard/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /upgrade to premium/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /get started free/i }),
    ).not.toBeInTheDocument();
  });
});

describe('AboutPage — Environment Fallback Handling (LS-5307)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAuth.mockReturnValue({
      isAuthenticated: false,
      user: null,
      isLoading: false,
    });
    mockUseIsPremium.mockReturnValue(false);
  });

  afterEach(() => {
    setAppVersion('1.0.0');
    setCommitSha('abc123');
    setBuildDate('2026-01-01');
  });

  it('shows "—" for appVersion when it is "unknown"', () => {
    setAppVersion('unknown');
    renderAbout();
    expect(screen.getByTestId('build-info-version')).toHaveTextContent('—');
  });

  it('shows "—" for commitSha when it is "unknown"', () => {
    setCommitSha('unknown');
    renderAbout();
    expect(screen.getByTestId('build-info-commit-sha')).toHaveTextContent('—');
  });

  it('hides "View Current Commit" button when commitSha is "unknown"', () => {
    setCommitSha('unknown');
    renderAbout();
    expect(
      screen.queryByRole('button', { name: /view current commit/i }),
    ).not.toBeInTheDocument();
  });

  it('shows "—" for commitSha when it is "dev"', () => {
    setCommitSha('dev');
    renderAbout();
    expect(screen.getByTestId('build-info-commit-sha')).toHaveTextContent('—');
  });

  it('hides "View Current Commit" button when commitSha is "dev"', () => {
    setCommitSha('dev');
    renderAbout();
    expect(
      screen.queryByRole('button', { name: /view current commit/i }),
    ).not.toBeInTheDocument();
  });

  it('shows "—" for buildDate when it is "unknown"', () => {
    setBuildDate('unknown');
    renderAbout();
    expect(screen.getByTestId('build-info-build-date')).toHaveTextContent('—');
  });

  it('does not throw when all build env values are "unknown"', () => {
    setAppVersion('unknown');
    setCommitSha('unknown');
    setBuildDate('unknown');
    expect(() => renderAbout()).not.toThrow();
  });
});

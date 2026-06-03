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

describe('AboutPage — Get Started Free button (LS-5723)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('navigates to /pricing when non-premium user clicks Get Started Free', () => {
    mockUseIsPremium.mockReturnValue(false);
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Get Started Free'));

    expect(mockNavigate).toHaveBeenCalledWith('/pricing');
  });

  it('does not render the Get Started Free button for premium users', () => {
    mockUseIsPremium.mockReturnValue(true);
    render(
      <MemoryRouter>
        <AboutPage />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Get Started Free')).not.toBeInTheDocument();
  });
});

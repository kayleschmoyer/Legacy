/**
 * LS-5178 — MockDraft page reflects the free-tier weekly limit in the UI.
 *
 * Covers the four states driven by getMyMockDraftUsage:
 *   1. Loading            → neutral skeleton (no form, no limit card).
 *   2. Free, below cap     → setup form + "N of M free mock drafts used" helper.
 *   3. Free, at/over cap   → disabled limit-reached card (no Start button).
 *   4. Unlimited (premium) → setup form, no usage helper.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { MockDraftPage } from './MockDraftPage';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

// Minimal prop shape for the stubbed UI primitives below. `unknown`-typed
// extras keep the mocks lint-clean without file-level eslint suppressions.
type MockProps = {
  children?: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  [key: string]: unknown;
};

const asStr = (v: unknown): string | undefined =>
  typeof v === 'string' ? v : undefined;

jest.mock('../../context/GrowthBookProvider', () => ({
  useFeatureIsOn: jest.fn(() => false),
}));

jest.mock('../../components/PageMeta', () => ({ PageMeta: () => null }));
jest.mock('../../components/UpgradeModal', () => ({
  UpgradeModal: () => null,
}));

jest.mock('../../constants/colors', () => ({
  BLACK: '#000',
  BRAND_GOLD: '#C5A55A',
  BRAND_NAVY_LIGHT: '#1B3A5C',
  BRAND_SEAM_RED: '#C41E3A',
  EMERALD: '#10B981',
  GRADIENT_BOARD_BG: 'linear-gradient(#000,#000)',
  OVERLAY_WHITE_10: 'rgba(255,255,255,0.1)',
  SURFACE_CARD: '#111B2F',
  withAlpha: (c: string) => c,
}));

jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => <span data-testid="icon-lock" />,
}));

jest.mock('@legacy-sports/shared-components', () => ({
  Skeleton: () => <div data-testid="mock-draft-skeleton" />,
}));

jest.mock('@legacy-sports/shared-components/draft', () => ({
  FootballMockPoolPreview: () => <div data-testid="football-mock-pool" />,
}));

jest.mock('@legacy-sports/shared-components/ui', () => ({
  Button: ({ children, onPress, disabled, ...rest }: MockProps) => (
    <button
      data-testid={asStr(rest['data-testid'])}
      aria-label={asStr(rest['aria-label'])}
      onClick={onPress}
      disabled={disabled}
    >
      {children}
    </button>
  ),
  H1: ({ children }: MockProps) => <h1>{children}</h1>,
  Paragraph: ({ children }: MockProps) => <p>{children}</p>,
  XStack: ({ children }: MockProps) => <div>{children}</div>,
  YStack: ({ children, ...rest }: MockProps) => (
    <div data-testid={asStr(rest['data-testid'])}>{children}</div>
  ),
}));

jest.mock('tamagui', () => ({
  Text: ({ children }: MockProps) => <span>{children}</span>,
}));

type Usage = {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
} | null;

// Safe default so rendering before an explicit setUsage() can't crash the
// mocked hook (each test still sets the state it needs in its first line).
let mockUsageResult: {
  data: { getMyMockDraftUsage: Usage } | undefined;
  loading: boolean;
} = { data: undefined, loading: false };

jest.mock('../../api/db/graphql.generated', () => ({
  useGetMyMockDraftUsageQuery: () => mockUsageResult,
  useInitializeMockDraftMutation: () => [
    jest.fn(() => Promise.resolve({ data: undefined })),
    { loading: false, error: undefined },
  ],
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function setUsage(usage: Usage, loading = false): void {
  mockUsageResult = {
    data: usage == null ? undefined : { getMyMockDraftUsage: usage },
    loading,
  };
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/baseball/mock-draft']}>
      <Routes>
        <Route path="/baseball/mock-draft" element={<MockDraftPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MockDraftPage — weekly limit reflected in UI (LS-5178)', () => {
  afterEach(() => jest.clearAllMocks());

  it('shows a skeleton while usage is still loading on first load', () => {
    setUsage(null, true);
    renderPage();
    expect(screen.getAllByTestId('mock-draft-skeleton').length).toBeGreaterThan(
      0,
    );
    expect(
      screen.queryByRole('button', { name: /Start Mock Draft/i }),
    ).not.toBeInTheDocument();
  });

  it('renders the setup form with a usage helper for a free user below the cap', () => {
    setUsage({ used: 1, limit: 2, remaining: 1, isUnlimited: false });
    renderPage();
    expect(
      screen.getByRole('button', { name: /Start Mock Draft/i }),
    ).toBeEnabled();
    expect(
      screen.getByText(/1 of 2 free mock drafts used this week/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-draft-limit-reached'),
    ).not.toBeInTheDocument();
  });

  it('renders the disabled limit-reached state for a free user at the cap', () => {
    setUsage({ used: 2, limit: 2, remaining: 0, isUnlimited: false });
    renderPage();
    expect(screen.getByTestId('mock-draft-limit-reached')).toBeInTheDocument();
    expect(
      screen.getByText(/2\/2 mock drafts used this week/i),
    ).toBeInTheDocument();
    // The form's Start button must NOT be reachable when the limit is hit.
    expect(
      screen.queryByRole('button', { name: /Start Mock Draft/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /Upgrade to Premium/i }),
    ).toBeInTheDocument();
  });

  it('renders the form without a usage helper for unlimited (premium) users', () => {
    setUsage({ used: 5, limit: 2, remaining: 2, isUnlimited: true });
    renderPage();
    expect(
      screen.getByRole('button', { name: /Start Mock Draft/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/free mock drafts used this week/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('mock-draft-limit-reached'),
    ).not.toBeInTheDocument();
  });
});

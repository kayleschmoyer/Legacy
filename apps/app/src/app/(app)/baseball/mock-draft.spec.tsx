import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { formatDraftDate } from '@legacy-sports/utils';
import { MockDraftPage } from './mock-draft';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
const mockDismissTo = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    dismissTo: mockDismissTo,
    navigate: mockNavigate,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

// Tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Lucide icons use Tamagui theming internally and crash without a provider.
jest.mock('@tamagui/lucide-icons', () => ({
  Lock: () => null,
}));

// Subscription status — controlled per-test
interface SubscriptionResult {
  isPremium: boolean;
  loading: boolean;
}
const mockUseSubscription = jest.fn(
  (): SubscriptionResult => ({ isPremium: false, loading: false }),
);
// Control All Teams entitlement (LS-9253) — controlled per-test, defaults to
// not entitled so the gated-option tests exercise the locked path.
const mockUseHasEntitlement = jest.fn((): boolean => false);
jest.mock('../../../features/subscription/useSubscription', () => ({
  useSubscription: (): SubscriptionResult => mockUseSubscription(),
  useHasEntitlement: (): boolean => mockUseHasEntitlement(),
}));

// Analytics
const mockTrackClick = jest.fn();
jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackClick(name);
  },
}));

// GrowthBook football-mock-players flag — controlled per-test
const mockUseFeatureIsOn = jest.fn((): boolean => false);
jest.mock('@growthbook/growthbook-react', () => ({
  useFeatureIsOn: (): boolean => mockUseFeatureIsOn(),
}));

jest.mock('../_screenErrorBoundary', () => ({
  ScreenErrorBoundary: () => null,
}));

// GraphQL mutation + usage query. LS-10076: a mock draft no longer creates a
// league, so `createMockDraft` returns a bare `draftId`.
const mockCreateMutate = jest.fn();
let mockCreateState: { loading: boolean; error?: { message: string } } = {
  loading: false,
  error: undefined,
};
interface MockDraftUsage {
  used: number;
  limit: number;
  remaining: number;
  isUnlimited: boolean;
  resetsAt?: string | null;
}
let mockUsageData: { getMyMockDraftUsage: MockDraftUsage | null } | undefined =
  undefined;
jest.mock('@legacy-sports/graphql', () => ({
  useCreateMockDraftMutation: () => [mockCreateMutate, mockCreateState],
  useGetMyMockDraftUsageQuery: () => ({ data: mockUsageData }),
  Sport: { Baseball: 'baseball', Football: 'football' },
  MockDraftMode: { Offline: 'OFFLINE', Online: 'ONLINE' },
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MockDraftPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack = true;
    mockCreateState = { loading: false, error: undefined };
    mockUsageData = undefined;
    mockUseFeatureIsOn.mockReturnValue(false);
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    mockCreateMutate.mockResolvedValue({
      data: { createMockDraft: { draftId: 42 } },
    });
  });

  describe('rendering', () => {
    it('renders the mock draft header and description', () => {
      render(<MockDraftPage />);
      expect(screen.getByText('Mock Draft Simulator')).toBeTruthy();
      expect(
        screen.getByText(/Practice your draft strategy against AI opponents/),
      ).toBeTruthy();
    });

    it('renders all settings options', () => {
      render(<MockDraftPage />);
      expect(screen.getByText('All MLB')).toBeTruthy();
      expect(screen.getByText('NL Only')).toBeTruthy();
      expect(screen.getByText('AL Only')).toBeTruthy();
      expect(screen.getByText('Snake')).toBeTruthy();
      expect(screen.getByText('Linear')).toBeTruthy();
      expect(screen.getByText('Start Mock Draft')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });
  });

  describe('premium upsell CTA', () => {
    it('shows the premium upsell for free users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
      render(<MockDraftPage />);
      expect(
        screen.getByText('Free plan: 2 mock drafts per week'),
      ).toBeTruthy();
      expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    });

    it('hides the premium upsell for premium users', () => {
      mockUseSubscription.mockReturnValue({ isPremium: true, loading: false });
      render(<MockDraftPage />);
      expect(
        screen.queryByText('Free plan: 2 mock drafts per week'),
      ).toBeNull();
    });

    it('hides the premium upsell while the subscription is loading', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: true });
      render(<MockDraftPage />);
      expect(
        screen.queryByText('Free plan: 2 mock drafts per week'),
      ).toBeNull();
    });

    it('navigates to subscription settings and tracks the upgrade click', () => {
      mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
      render(<MockDraftPage />);
      fireEvent.press(screen.getByText('Upgrade to Premium'));
      expect(mockTrackClick).toHaveBeenCalledWith('Mock Draft Simulator');
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
    });
  });

  describe('starting a mock draft', () => {
    it('calls createMockDraft with the default settings', async () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalledWith({
          variables: {
            // No rosterSize (LS-10086) — the server always uses the sport's
            // full default roster for a mock draft.
            numTeams: 8,
            pickPosition: 1,
            pickTimeLimitSeconds: 90,
            draftOrder: 'snake',
            playerPool: 'all',
            sport: 'baseball',
            // Shared mode maps to an ONLINE lobby, private by default
            // (LS-10076).
            mode: 'ONLINE',
            controlAllTeams: false,
            isPublic: false,
          },
        });
      });
    });

    it('forwards the chosen Pick Timer for a Shared draft (LS-10466)', async () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByText('60s'));
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => expect(mockCreateMutate).toHaveBeenCalled());
      const [{ variables }] = mockCreateMutate.mock.calls[0] as [
        { variables: Record<string, unknown> },
      ];
      expect(variables).toMatchObject({
        mode: 'ONLINE',
        pickTimeLimitSeconds: 60,
      });
    });

    it('navigates to the mock draft room on success', async () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          pathname: '/mock-draft/[draftId]',
          params: { draftId: '42' },
        });
      });
    });

    it('shows an error when no draftId is returned', async () => {
      mockCreateMutate.mockResolvedValue({
        data: { createMockDraft: null },
      });
      render(<MockDraftPage />);
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => {
        expect(screen.getByText(/Couldn't start mock draft/)).toBeTruthy();
      });
    });
  });

  describe('error surfacing', () => {
    it('renders the mutation error (e.g. the 2/week limit message)', () => {
      mockCreateState = {
        loading: false,
        error: {
          message:
            'You have reached the 2 mock drafts per week limit for your current plan. Upgrade to unlock unlimited mock drafts.',
        },
      };
      render(<MockDraftPage />);
      expect(screen.getByText(/2 mock drafts per week limit/)).toBeTruthy();
    });
  });

  describe('football mock option', () => {
    it('offers the football sport option when the flag is on', () => {
      mockUseFeatureIsOn.mockReturnValue(true);
      render(<MockDraftPage />);
      expect(screen.getByText('🏈 Football')).toBeTruthy();
      expect(screen.getByText('⚾ Baseball')).toBeTruthy();
    });

    it('hides the football sport option when the flag is off', () => {
      mockUseFeatureIsOn.mockReturnValue(false);
      render(<MockDraftPage />);
      expect(screen.queryByText('🏈 Football')).toBeNull();
    });
  });

  describe('weekly usage label', () => {
    it('shows the free-tier usage label from the usage query', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 1,
          limit: 2,
          remaining: 1,
          isUnlimited: false,
        },
      };
      render(<MockDraftPage />);
      expect(
        screen.getByText('1 of 2 free mock drafts used this week'),
      ).toBeTruthy();
    });

    it('omits the usage label for unlimited users', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 5,
          limit: 2,
          remaining: 0,
          isUnlimited: true,
        },
      };
      render(<MockDraftPage />);
      expect(screen.queryByText(/free mock drafts used this week/)).toBeNull();
    });
  });

  describe('limit-reached screen (LS-5020)', () => {
    it('shows the limit-reached screen when a free user has no remaining drafts', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 2,
          limit: 2,
          remaining: 0,
          isUnlimited: false,
        },
      };
      render(<MockDraftPage />);
      expect(screen.getByTestId('mock-draft-limit-reached')).toBeTruthy();
      expect(screen.getByText('Weekly Limit Reached')).toBeTruthy();
      expect(
        screen.getByText('2 of 2 free mock drafts used this week'),
      ).toBeTruthy();
      expect(screen.getByText('Upgrade to Premium')).toBeTruthy();
    });

    it('shows when the next free draft opens (LS-10455)', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 2,
          limit: 2,
          remaining: 0,
          isUnlimited: false,
          resetsAt: '2026-10-09T16:00:00.000Z',
        },
      };
      render(<MockDraftPage />);
      expect(screen.getByTestId('mock-draft-next-free-draft')).toBeTruthy();
      expect(
        screen.getByText(
          `Next free draft opens ${formatDraftDate('2026-10-09T16:00:00.000Z')}`,
        ),
      ).toBeTruthy();
    });

    it('does not show the setup form when limit is reached', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 2,
          limit: 2,
          remaining: 0,
          isUnlimited: false,
        },
      };
      render(<MockDraftPage />);
      expect(screen.queryByText('Start Mock Draft')).toBeNull();
    });

    it('does not show the limit-reached screen for unlimited users even when remaining is 0', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 5,
          limit: 2,
          remaining: 0,
          isUnlimited: true,
        },
      };
      render(<MockDraftPage />);
      expect(screen.queryByTestId('mock-draft-limit-reached')).toBeNull();
      expect(screen.getByText('Start Mock Draft')).toBeTruthy();
    });

    it('shows the setup form (fail-open) when usage data is null', () => {
      mockUsageData = undefined;
      render(<MockDraftPage />);
      expect(screen.queryByTestId('mock-draft-limit-reached')).toBeNull();
      expect(screen.getByText('Start Mock Draft')).toBeTruthy();
    });

    it('navigates to subscription-settings on upgrade press', () => {
      mockUsageData = {
        getMyMockDraftUsage: {
          used: 2,
          limit: 2,
          remaining: 0,
          isUnlimited: false,
        },
      };
      render(<MockDraftPage />);
      fireEvent.press(screen.getByText('Upgrade to Premium'));
      expect(mockTrackClick).toHaveBeenCalledWith('Mock Draft Simulator');
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
    });
  });

  describe('Shared-mode invite pause (LS-9181)', () => {
    it('shows the invite card instead of navigating when a Shared draft returns an inviteCode', async () => {
      mockCreateMutate.mockResolvedValue({
        data: {
          createMockDraft: { draftId: 42, inviteCode: 'ABC12XYZ' },
        },
      });
      render(<MockDraftPage />);
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => {
        expect(screen.getByText('ABC12XYZ')).toBeTruthy();
      });
      expect(mockNavigate).not.toHaveBeenCalled();

      fireEvent.press(screen.getByText('Continue to Draft Room'));
      expect(mockNavigate).toHaveBeenCalledWith({
        pathname: '/mock-draft/[draftId]',
        params: { draftId: '42' },
      });
    });

    it('navigates to the join-by-code screen when "Have an invite code?" is pressed', () => {
      render(<MockDraftPage />);
      fireEvent.press(
        screen.getByText("Have an invite code? Join a friend's draft →"),
      );
      expect(mockNavigate).toHaveBeenCalledWith('/join');
    });
  });

  // LS-8823 — cancelling used to push the standalone `/baseball` home, which
  // took the user out of the tab shell onto a second home surface.
  describe('cancel', () => {
    it('returns to the screen the mock draft was opened from', () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalledWith('/baseball');
    });

    it('falls back to the Home tab when there is nothing to pop', () => {
      mockCanGoBack = false;
      render(<MockDraftPage />);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockDismissTo).toHaveBeenCalledWith('/(tabs)/(home)/home');
      expect(mockBack).not.toHaveBeenCalled();
    });
  });
});

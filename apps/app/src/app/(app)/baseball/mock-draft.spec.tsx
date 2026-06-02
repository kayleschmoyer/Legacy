import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { MockDraftPage } from './mock-draft';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockNavigate }),
}));

// Tamagui — shared mock from __test-utils__
jest.mock('tamagui', () => {
  const mocks = jest.requireActual<
    typeof import('../../../__test-utils__/tamagui-mocks')
  >('../../../__test-utils__/tamagui-mocks');
  return mocks.tamaguiMocks;
});

// Subscription status — controlled per-test
interface SubscriptionResult {
  isPremium: boolean;
  loading: boolean;
}
const mockUseSubscription = jest.fn(
  (): SubscriptionResult => ({ isPremium: false, loading: false }),
);
jest.mock('../../../features/subscription/useSubscription', () => ({
  useSubscription: (): SubscriptionResult => mockUseSubscription(),
}));

// Analytics
const mockTrackClick = jest.fn();
jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: (name: string): void => {
    mockTrackClick(name);
  },
}));

// GraphQL mutation
const mockInitMutate = jest.fn();
let mockInitState: { loading: boolean; error?: { message: string } } = {
  loading: false,
  error: undefined,
};
jest.mock('../../../api/db/graphql.generated', () => ({
  useInitializeMockDraftMutation: () => [mockInitMutate, mockInitState],
}));

// ── Tests ────────────────────────────────────────────────────────────────────

describe('MockDraftPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockInitState = { loading: false, error: undefined };
    mockUseSubscription.mockReturnValue({ isPremium: false, loading: false });
    mockInitMutate.mockResolvedValue({
      data: { initializeMockDraft: { leagueId: 42, draftId: 7 } },
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
    it('calls initializeMockDraft with the default settings', async () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => {
        expect(mockInitMutate).toHaveBeenCalledWith({
          variables: {
            numTeams: 8,
            rosterSize: 10,
            userPickPosition: 1,
            pickTimeLimitSeconds: 90,
            draftOrder: 'snake',
            playerPool: 'all',
          },
        });
      });
    });

    it('navigates to the draft board on success', async () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByRole('button', { name: 'Start Mock Draft' }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith({
          pathname: '/DraftBoardPage',
          params: { leagueId: '42' },
        });
      });
    });

    it('shows an error when no leagueId is returned', async () => {
      mockInitMutate.mockResolvedValue({
        data: { initializeMockDraft: null },
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
      mockInitState = {
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

  describe('cancel', () => {
    it('navigates back to the baseball home', () => {
      render(<MockDraftPage />);
      fireEvent.press(screen.getByText('Cancel'));
      expect(mockNavigate).toHaveBeenCalledWith('/baseball');
    });
  });
});

import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type { View as RNView } from 'react-native';
import { CombinedGraphQLErrors, ServerError } from '@apollo/client';

import CreateLeagueScreen, { buildCreateLeagueInput } from './create';

/**
 * The generic copy shown whenever the server's message is not allowlisted.
 * Spelled out rather than imported from `LEAGUE_SUBMIT_ERROR_FALLBACK` on
 * purpose: asserting against the constant the code under test already uses
 * would pass even if that constant silently changed. This pins the copy the
 * user actually sees.
 */
const SUBMIT_ERROR_FALLBACK =
  'Unable to save league. Your settings are still filled in — try again or come back later.';

// ── Mock type helpers ────────────────────────────────────────────────────────

type WizardProps = {
  sport: 'baseball' | 'football';
  initialLeagueName?: string;
  isPremium: boolean;
  premiumLoading: boolean;
  submitting?: boolean;
  submitError?: string;
  atLeagueLimit?: boolean;
  onSubmit: (form: WizardForm) => void;
  onClose: (isDirty: boolean) => void;
  onUpgrade: (featureName: string) => void;
};

type WizardForm = ReturnType<typeof makeForm>;

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockNavigate = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
let mockSearchParams: { name?: string; sport?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    navigate: mockNavigate,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockSearchParams,
}));

let mockIsPremium = false;
let mockPremiumLoading = false;
jest.mock('../../../features/subscription', () => ({
  useSubscription: () => ({
    isPremium: mockIsPremium,
    loading: mockPremiumLoading,
  }),
}));

// The wizard itself is covered by its own spec in lib/shared-components; here
// it is a prop probe so this spec stays about the data wiring this route owns.
let wizardProps: WizardProps | undefined;
jest.mock('@legacy-sports/shared-components/leagues', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<{ View: typeof RNView }>('react-native');
  const constants = jest.requireActual<
    typeof import('../../../../../../lib/shared-components/src/features/leagues/create-wizard/constants')
  >(
    '../../../../../../lib/shared-components/src/features/leagues/create-wizard/constants',
  );
  // The submit-error allowlist is the behaviour under test here (LS-8814), so
  // it stays real rather than being stubbed out with the rest of the entry.
  const submitError = jest.requireActual<
    typeof import('../../../../../../lib/shared-components/src/features/leagues/submitError')
  >('../../../../../../lib/shared-components/src/features/leagues/submitError');
  return {
    ...constants,
    ...submitError,
    LeagueCreateWizard: (props: WizardProps) => {
      wizardProps = props;
      return ReactActual.createElement(View, {
        testID: 'league-create-wizard',
      });
    },
  };
});

jest.mock('../../../utils/analytics', () => ({
  trackPremiumFeatureClick: jest.fn(),
  trackFastLaneToggled: jest.fn(),
  trackFastLaneLeagueCreated: jest.fn(),
}));

// The "League created!" interstitial (LS-6136) is a presentational shared
// component with its own coverage (Storybook); here it's a prop probe so
// this spec stays about whether the screen opens it with the right data and
// navigates on confirm/cancel, not about Dialog's own rendering.
type DialogProps = {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  children?: React.ReactNode;
};
let dialogProps: DialogProps | undefined;
jest.mock('@legacy-sports/shared-components', () => {
  const ReactActual = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<{ View: typeof RNView }>('react-native');
  return {
    Dialog: (props: DialogProps) => {
      dialogProps = props;
      if (!props.open) return null;
      return ReactActual.createElement(View, {
        testID: 'league-created-dialog',
      });
    },
  };
});

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// react-native's index re-exports `require('./Libraries/Alert/Alert').default`,
// so the mock must live on `default` for `import { Alert }` to resolve to it.
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  __esModule: true,
  default: { alert: jest.fn() },
}));

const mockCreateLeagueMutate = jest.fn();
const mockCreateLeagueState: { loading: boolean; error?: unknown } = {
  loading: false,
  error: undefined,
};
/** Overridable per test — null by default (public/no-invite-code league). */
let mockCreatedLeague: {
  id: number;
  name: string;
  inviteCode: string | null;
} = { id: 42, name: 'Test League', inviteCode: null };
/** Captured so a test can drive the mutation's `onError` handler directly. */
let mutationOptions: { onError?: (error: unknown) => void } | undefined;
let mockUserLeagueCount = 0;
/** Overridable per test — undefined by default, falls back to mockUserLeagueCount.
 * Lets pagination tests diverge the authoritative total (LS-9101) from the
 * returned `userLeagues` array length. */
let mockAuthoritativeLeagueCount: number | undefined;
/** Overridable per test — undefined by default (query succeeds). */
let mockUserLeaguesQueryError: unknown;
jest.mock('@legacy-sports/graphql', () => ({
  Sport: { Football: 'football', Baseball: 'baseball' },
  DefensiveFormat: { Dst: 'dst', Idp: 'idp' },
  useGetUserLeaguesQuery: () => ({
    data: {
      userLeagues: Array.from({ length: mockUserLeagueCount }, (_, i) => ({
        id: i,
      })),
      userLeagueCount: mockAuthoritativeLeagueCount ?? mockUserLeagueCount,
    },
    error: mockUserLeaguesQueryError,
  }),
  useCreateLeagueMutation: (options?: {
    onCompleted?: (data: unknown) => void;
    onError?: (error: unknown) => void;
  }) => {
    mutationOptions = options;
    mockCreateLeagueMutate.mockImplementation((_args: unknown) => {
      options?.onCompleted?.({
        createLeagueAndTeams: { league: mockCreatedLeague },
      });
      return Promise.resolve({
        data: { createLeagueAndTeams: { league: mockCreatedLeague } },
      });
    });
    return [mockCreateLeagueMutate, mockCreateLeagueState];
  },
}));

jest.mock('../_screenErrorBoundary', () => ({ ScreenErrorBoundary: null }));

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeForm(overrides: Record<string, unknown> = {}) {
  return {
    leagueName: '  Diamond Dynasty  ',
    numberOfTeams: 12,
    numberOfDivisions: 2,
    isPublic: true,
    schedulingStrategy: 'divisional' as const,
    maxRosterSize: 25,
    rosterSlots: {},
    playerPool: 'all',
    draftMode: 'live' as const,
    selectionMethod: 'standard' as const,
    draftOrder: 'snake' as const,
    draftDate: new Date('2030-08-08T19:00:00.000Z'),
    auctionBudget: 200,
    auctionMinBid: 1,
    allowDraftSlotTrading: false,
    baseballEraFilter: 'all',
    customEraStartYear: undefined,
    customEraEndYear: undefined,
    baseballHofOnly: false,
    waiverType: 'standard' as const,
    faabBudgetDefault: 100,
    salaryCapEnabled: false,
    salaryCap: undefined,
    scoringFormat: 'ppr' as const,
    defensiveFormat: 'dst' as const,
    ...overrides,
  };
}

/** Renders the screen and returns the props the wizard was handed. */
function renderScreen(): WizardProps {
  render(<CreateLeagueScreen />);
  if (!wizardProps) throw new Error('LeagueCreateWizard did not render');
  return wizardProps;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('CreateLeagueScreen — wizard wiring (LS-8809)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    wizardProps = undefined;
    dialogProps = undefined;
    mutationOptions = undefined;
    mockIsPremium = false;
    mockPremiumLoading = false;
    mockSearchParams = {};
    mockCanGoBack = true;
    mockCreateLeagueState.loading = false;
    mockCreateLeagueState.error = undefined;
    mockCreatedLeague = { id: 42, name: 'Test League', inviteCode: null };
    mockUserLeagueCount = 0;
    mockAuthoritativeLeagueCount = undefined;
    mockUserLeaguesQueryError = undefined;
  });

  // LS-6133 — a free user already at the 3-league cap must see this before
  // spending time in the wizard, not only on final submit.
  describe('league-cap preflight (LS-6133)', () => {
    it('flags atLeagueLimit for a free user already at 3 leagues', () => {
      mockIsPremium = false;
      mockPremiumLoading = false;
      mockUserLeagueCount = 3;
      expect(renderScreen().atLeagueLimit).toBe(true);
    });

    it('flags atLeagueLimit for a free user over the cap', () => {
      mockIsPremium = false;
      mockPremiumLoading = false;
      mockUserLeagueCount = 4;
      expect(renderScreen().atLeagueLimit).toBe(true);
    });

    it('does not flag a free user under the cap', () => {
      mockIsPremium = false;
      mockPremiumLoading = false;
      mockUserLeagueCount = 2;
      expect(renderScreen().atLeagueLimit).toBe(false);
    });

    it('never flags a premium user regardless of league count', () => {
      mockIsPremium = true;
      mockPremiumLoading = false;
      mockUserLeagueCount = 5;
      expect(renderScreen().atLeagueLimit).toBe(false);
    });

    it('does not flag while premium status is still loading', () => {
      mockIsPremium = false;
      mockPremiumLoading = true;
      mockUserLeagueCount = 5;
      expect(renderScreen().atLeagueLimit).toBe(false);
    });

    // A failed useGetUserLeaguesQuery must fail closed (treated as at-limit)
    // rather than silently defaulting leagueCount to 0 and letting a free
    // user bypass the cap on a network hiccup.
    it('flags atLeagueLimit for a free user when the league-count query errors', () => {
      mockIsPremium = false;
      mockPremiumLoading = false;
      mockUserLeagueCount = 0;
      mockUserLeaguesQueryError = new Error('network error');
      expect(renderScreen().atLeagueLimit).toBe(true);
    });

    it('does not flag a premium user when the league-count query errors', () => {
      mockIsPremium = true;
      mockPremiumLoading = false;
      mockUserLeaguesQueryError = new Error('network error');
      expect(renderScreen().atLeagueLimit).toBe(false);
    });

    it('still flags a power user whose league count exceeds the userLeagues page size (LS-9101)', () => {
      // userLeagues is server-paginated at 50; a user with 60 leagues gets
      // back an array of only 50, but userLeagueCount — the authoritative,
      // unpaginated total — is 60. The preflight check must read that total.
      mockIsPremium = false;
      mockPremiumLoading = false;
      mockUserLeagueCount = 50;
      mockAuthoritativeLeagueCount = 60;
      expect(renderScreen().atLeagueLimit).toBe(true);
    });
  });

  describe('sport routing', () => {
    it('defaults to baseball when no sport param is present', () => {
      expect(renderScreen().sport).toBe('baseball');
    });

    it('reads football from the ?sport= param', () => {
      mockSearchParams = { sport: 'football' };
      expect(renderScreen().sport).toBe('football');
    });

    it('falls back to baseball for an unrecognized sport param', () => {
      mockSearchParams = { sport: 'cricket' };
      expect(renderScreen().sport).toBe('baseball');
    });
  });

  it('passes the ?name= prefill through to the wizard', () => {
    mockSearchParams = { name: 'Diamond Dynasty' };
    expect(renderScreen().initialLeagueName).toBe('Diamond Dynasty');
  });

  it('forwards subscription state so premium controls can gate themselves', () => {
    mockIsPremium = true;
    mockPremiumLoading = true;
    const props = renderScreen();
    expect(props.isPremium).toBe(true);
    expect(props.premiumLoading).toBe(true);
  });

  it('reports mutation in-flight state to the wizard', () => {
    mockCreateLeagueState.loading = true;
    expect(renderScreen().submitting).toBe(true);
  });

  // LS-8814 — the screen must never hand raw server vocabulary to the UI. Both
  // display paths (the wizard's inline banner and the onError Alert) run the
  // error through the shared allowlist in lib/shared-components.
  describe('submit-error surfacing (LS-8814)', () => {
    const allowlisted = () =>
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'You already have a league with that name.',
            extensions: { code: 'BAD_USER_INPUT' },
          },
        ],
      });

    const notAllowlisted = () =>
      new CombinedGraphQLErrors({
        errors: [
          {
            message: 'GraphQLError: relation "leagues" does not exist',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          },
        ],
      });

    it('passes an allowlisted server message straight to the wizard', () => {
      mockCreateLeagueState.error = allowlisted();
      expect(renderScreen().submitError).toBe(
        'You already have a league with that name.',
      );
    });

    it('replaces a non-allowlisted server message with the generic fallback', () => {
      mockCreateLeagueState.error = notAllowlisted();
      expect(renderScreen().submitError).toBe(SUBMIT_ERROR_FALLBACK);
    });

    it('leaves submitError undefined while the mutation has no error', () => {
      expect(renderScreen().submitError).toBeUndefined();
    });

    it('alerts with the allowlisted message and logs the real error', () => {
      const { LOGGER } = jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
        '@legacy-sports/logging',
      );
      renderScreen();
      const error = allowlisted();

      mutationOptions?.onError?.(error);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'You already have a league with that name.',
      );
      expect(LOGGER.error).toHaveBeenCalledWith(
        'Error creating league:',
        error,
      );
    });

    it('alerts with the generic fallback for a non-allowlisted code and still logs', () => {
      const { LOGGER } = jest.requireMock<{ LOGGER: { error: jest.Mock } }>(
        '@legacy-sports/logging',
      );
      renderScreen();
      const error = notAllowlisted();

      mutationOptions?.onError?.(error);

      expect(Alert.alert).toHaveBeenCalledWith('Error', SUBMIT_ERROR_FALLBACK);
      expect(LOGGER.error).toHaveBeenCalledWith(
        'Error creating league:',
        error,
      );
    });

    // LS-9492 — transient upstream-gateway timeouts (502/503/504) should not
    // reach Rollbar the way an actionable bug would; LOGGER.warn isn't
    // forwarded to Rollbar (only error/fatal are), unlike LOGGER.error.
    it.each([502, 503, 504])(
      'logs a %d ServerError at warn (not error)',
      (statusCode) => {
        const { LOGGER } = jest.requireMock<{
          LOGGER: { error: jest.Mock; warn: jest.Mock };
        }>('@legacy-sports/logging');
        renderScreen();
        const error = new ServerError('Server error', {
          response: { status: statusCode } as Response,
          bodyText: '',
        });

        mutationOptions?.onError?.(error);

        expect(LOGGER.warn).toHaveBeenCalledWith(
          'Error creating league:',
          error,
        );
        expect(LOGGER.error).not.toHaveBeenCalled();
      },
    );

    it('still logs a 500 ServerError at error (not warn)', () => {
      const { LOGGER } = jest.requireMock<{
        LOGGER: { error: jest.Mock; warn: jest.Mock };
      }>('@legacy-sports/logging');
      renderScreen();
      const error = new ServerError('Server error', {
        response: { status: 500 } as Response,
        bodyText: '',
      });

      mutationOptions?.onError?.(error);

      expect(LOGGER.error).toHaveBeenCalledWith(
        'Error creating league:',
        error,
      );
      expect(LOGGER.warn).not.toHaveBeenCalled();
    });

    // CLF-013 — a PremiumRequiredError used to hit the same generic red
    // Alert as any other validation failure (e.g. "Draft date must be in the
    // future"), giving the user no indication that upgrading — not editing
    // the form — is what unblocks them.
    it('alerts with a dedicated upgrade prompt for a PremiumRequiredError instead of the generic banner', () => {
      renderScreen();
      const error = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Upgrade to Premium to create more than 1 league.',
            extensions: { code: 'PREMIUM_REQUIRED' },
          },
        ],
      });

      mutationOptions?.onError?.(error);

      expect(Alert.alert).toHaveBeenCalledWith(
        'Upgrade Required',
        'Upgrade to Premium to create more than 1 league.',
        expect.any(Array),
      );
      expect(Alert.alert).not.toHaveBeenCalledWith('Error', expect.any(String));
    });

    it('tracks the upgrade tap and routes to subscription settings from the premium-required alert', () => {
      const { trackPremiumFeatureClick } = jest.requireMock<{
        trackPremiumFeatureClick: jest.Mock;
      }>('../../../utils/analytics');
      renderScreen();
      const error = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'Upgrade to Premium to create more than 1 league.',
            extensions: { code: 'PREMIUM_REQUIRED' },
          },
        ],
      });

      mutationOptions?.onError?.(error);
      const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
      buttons?.find((b) => b.text === 'Upgrade')?.onPress?.();

      expect(trackPremiumFeatureClick).toHaveBeenCalledWith(
        'league-create-submit',
      );
      expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
    });

    // LS-6135 — a rejected mutation fires both Apollo's onError callback and
    // the awaited call's rejection. A try/catch around the await used to
    // show its own generic Alert on top of onError's, so a single failure
    // produced two back-to-back Alerts. Only onError should surface one.
    it('shows exactly one Alert when the mutation rejects, not a duplicate from handleSubmit', async () => {
      const error = allowlisted();
      const props = renderScreen();
      // Override the default (always-succeeds) mock set up inside
      // useCreateLeagueMutation — it must come after renderScreen() so this
      // implementation isn't clobbered by the one the hook mock installs.
      let mutatePromise: Promise<unknown> = Promise.resolve();
      mockCreateLeagueMutate.mockImplementation(() => {
        mutationOptions?.onError?.(error);
        mutatePromise = Promise.reject(error);
        return mutatePromise;
      });

      props.onSubmit(makeForm());
      await waitFor(() => expect(mockCreateLeagueMutate).toHaveBeenCalled());
      // handleSubmit attaches its own .catch to this same promise before this
      // line runs, so awaiting it here (with a no-op catch of our own) only
      // resolves once any handler handleSubmit chained has already run —
      // this is what makes the assertion below catch a reintroduced second
      // Alert instead of racing it, unlike a bare waitFor() which can
      // short-circuit on the first (onError's) Alert before a duplicate
      // fires.
      await mutatePromise.catch(() => undefined);

      expect(Alert.alert).toHaveBeenCalledTimes(1);
      expect(Alert.alert).toHaveBeenCalledWith(
        'Error',
        'You already have a league with that name.',
      );
    });

    // CLF-012 — the free-tier 3-league cap has an actual escape hatch (delete
    // an existing league) besides upgrading, so its upgrade prompt gets an
    // extra button to the leagues list alongside Not now/Upgrade.
    it('offers a Manage Leagues action when the error is the free-tier league cap', () => {
      renderScreen();
      const capError = new CombinedGraphQLErrors({
        errors: [
          {
            message:
              'You have reached the 3-league limit for your current plan. Upgrade to unlock unlimited leagues, or delete an existing league to make room.',
            extensions: { code: 'PREMIUM_REQUIRED' },
          },
        ],
      });

      mutationOptions?.onError?.(capError);

      const [, message, buttons] = jest.mocked(Alert.alert).mock.calls[0];
      expect(message).toContain('delete an existing league to make room');
      const manageButton = buttons?.find((b) => b.text === 'Manage Leagues');
      expect(manageButton).toBeDefined();

      manageButton?.onPress?.();
      expect(mockNavigate).toHaveBeenCalledWith('/home');
    });

    it('does not offer Manage Leagues for a different PREMIUM_REQUIRED upsell', () => {
      renderScreen();
      const otherPremiumError = new CombinedGraphQLErrors({
        errors: [
          {
            message: 'FAAB waiver type requires a premium subscription.',
            extensions: { code: 'PREMIUM_REQUIRED' },
          },
        ],
      });

      mutationOptions?.onError?.(otherPremiumError);

      const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
      expect(buttons?.find((b) => b.text === 'Manage Leagues')).toBeUndefined();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Upgrade Required',
        'FAAB waiver type requires a premium subscription.',
        expect.any(Array),
      );
    });
  });

  // LS-8844 — the success handler must replace the wizard, not push on top of
  // it. A push leaves the finished wizard mounted underneath the league page,
  // so swiping back lands the user on a completed, non-resubmittable "step 5"
  // instead of the Home tab the wizard was opened from.
  // LS-6136 — success no longer replaces immediately. It opens the "League
  // created!" interstitial (parity with web's post-creation dialog) so a
  // brand-new league with no teams/invites/draft date isn't dropped on the
  // user with no guidance; navigation happens once the user confirms.
  describe('submit', () => {
    it('opens the created-league dialog instead of navigating immediately', async () => {
      const props = renderScreen();
      await act(async () => {
        props.onSubmit(makeForm());
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(mockCreateLeagueMutate).toHaveBeenCalled();
        expect(dialogProps?.open).toBe(true);
      });
      expect(mockReplace).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('replaces the wizard with the new baseball league once the dialog is confirmed', async () => {
      const props = renderScreen();
      await act(async () => {
        props.onSubmit(makeForm());
        await Promise.resolve();
      });

      await waitFor(() => expect(dialogProps?.open).toBe(true));
      await act(() => dialogProps?.onConfirm?.());

      expect(mockReplace).toHaveBeenCalledWith('/baseball/league/42');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('replaces with the football league when entered from the football wrapper', async () => {
      mockSearchParams = { sport: 'football' };
      const props = renderScreen();
      await act(async () => {
        props.onSubmit(makeForm());
        await Promise.resolve();
      });

      await waitFor(() => expect(dialogProps?.open).toBe(true));
      await act(() => dialogProps?.onConfirm?.());

      expect(mockReplace).toHaveBeenCalledWith('/football/league/42');
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('also navigates when the dialog is dismissed via "Got it" (no invite code)', async () => {
      const props = renderScreen();
      await act(async () => {
        props.onSubmit(makeForm());
        await Promise.resolve();
      });

      await waitFor(() => expect(dialogProps?.open).toBe(true));
      expect(dialogProps?.description).toBe('Test League is ready.');
      expect(dialogProps?.cancelLabel).toBe('Got it');

      await act(() => dialogProps?.onCancel?.());

      expect(mockReplace).toHaveBeenCalledWith('/baseball/league/42');
    });

    it('shows the invite code and share copy when the league has one', async () => {
      mockCreatedLeague = {
        id: 99,
        name: 'Diamond Dynasty',
        inviteCode: 'ABC123',
      };
      const props = renderScreen();
      await act(async () => {
        props.onSubmit(makeForm());
        await Promise.resolve();
      });

      await waitFor(() => expect(dialogProps?.open).toBe(true));
      expect(dialogProps?.description).toBe(
        'Share this invite code so managers can join Diamond Dynasty.',
      );

      await act(() => dialogProps?.onConfirm?.());
      expect(mockReplace).toHaveBeenCalledWith('/baseball/league/99');
    });
  });

  // LS-8823 — cancelling used to `navigate('/${sport}')`, pushing the
  // standalone sport home and stranding the user on a tab-bar-less screen that
  // looked like a second home page. Closing now unwinds to whatever the user
  // came from, and only falls back to the Home tab with no history to pop.
  describe('close', () => {
    const discard = () => {
      const buttons = jest.mocked(Alert.alert).mock.calls[0][2];
      buttons?.find((b) => b.text === 'Discard')?.onPress?.();
    };

    it('leaves immediately when nothing has been edited', () => {
      renderScreen().onClose(false);
      expect(Alert.alert).not.toHaveBeenCalled();
      expect(mockBack).toHaveBeenCalledTimes(1);
    });

    it('confirms before discarding unsaved edits', () => {
      renderScreen().onClose(true);
      expect(mockBack).not.toHaveBeenCalled();
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(Alert.alert).toHaveBeenCalledWith(
        'Discard league setup?',
        'Your settings will be lost.',
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('returns to the screen the wizard was opened from once discard is confirmed', () => {
      renderScreen().onClose(true);
      discard();
      expect(mockBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('falls back to the Home tab when the wizard was the entry point', () => {
      mockCanGoBack = false;
      renderScreen().onClose(false);
      expect(mockNavigate).toHaveBeenCalledWith('/home');
      expect(mockBack).not.toHaveBeenCalled();
    });

    it.each(['baseball', 'football'])(
      'never pushes the standalone /%s home when entered from that sport',
      (sport) => {
        mockSearchParams = { sport };
        renderScreen().onClose(true);
        discard();
        expect(mockNavigate).not.toHaveBeenCalledWith(`/${sport}`);
        expect(mockPush).not.toHaveBeenCalledWith(`/${sport}`);
        expect(mockBack).toHaveBeenCalledTimes(1);
      },
    );
  });

  it('tracks a premium tap then routes to subscription settings', () => {
    const { trackPremiumFeatureClick } = jest.requireMock<{
      trackPremiumFeatureClick: jest.Mock;
    }>('../../../utils/analytics');

    renderScreen().onUpgrade('Salary Cap');

    expect(trackPremiumFeatureClick).toHaveBeenCalledWith('Salary Cap');
    expect(mockNavigate).toHaveBeenCalledWith('subscription-settings');
  });
});

describe('buildCreateLeagueInput', () => {
  it('trims the league name and sends the five new parity fields', () => {
    const input = buildCreateLeagueInput(makeForm(), 'baseball');
    expect(input.leagueName).toBe('Diamond Dynasty');
    expect(input.numberOfDivisions).toBe(2);
    expect(input.isPublic).toBe(true);
    expect(input.schedulingStrategy).toBe('divisional');
    expect(input.baseballHofOnly).toBe(false);
  });

  it('sends auction budget and minimum bid only for an auction draft', () => {
    const standard = buildCreateLeagueInput(makeForm(), 'baseball');
    expect(standard.auctionBudget).toBeUndefined();
    expect(standard.auctionMinBid).toBeUndefined();

    const auction = buildCreateLeagueInput(
      makeForm({
        selectionMethod: 'auction',
        auctionBudget: 300,
        auctionMinBid: 5,
      }),
      'baseball',
    );
    expect(auction.auctionBudget).toBe(300);
    expect(auction.auctionMinBid).toBe(5);
  });

  it('never sends draft-slot trading for an auction league (LS-8675)', () => {
    const input = buildCreateLeagueInput(
      makeForm({ selectionMethod: 'auction', allowDraftSlotTrading: true }),
      'baseball',
    );
    expect(input.allowDraftSlotTrading).toBeUndefined();
  });

  it('sends draft-slot trading when enabled on a non-auction league', () => {
    const input = buildCreateLeagueInput(
      makeForm({ allowDraftSlotTrading: true }),
      'baseball',
    );
    expect(input.allowDraftSlotTrading).toBe(true);
  });

  it('sends custom-era bounds only when the custom era is selected', () => {
    const preset = buildCreateLeagueInput(
      makeForm({ customEraStartYear: 1940, customEraEndYear: 1950 }),
      'baseball',
    );
    expect(preset.customEraStartYear).toBeUndefined();

    const custom = buildCreateLeagueInput(
      makeForm({
        baseballEraFilter: 'custom',
        customEraStartYear: 1940,
        customEraEndYear: 1950,
      }),
      'baseball',
    );
    expect(custom.customEraStartYear).toBe(1940);
    expect(custom.customEraEndYear).toBe(1950);
  });

  it('sends the FAAB budget only for FAAB waivers', () => {
    expect(
      buildCreateLeagueInput(makeForm(), 'baseball').faabBudgetDefault,
    ).toBeUndefined();
    expect(
      buildCreateLeagueInput(makeForm({ waiverType: 'faab' }), 'baseball')
        .faabBudgetDefault,
    ).toBe(100);
  });

  it('sends the salary cap amount only when the cap is enabled', () => {
    expect(
      buildCreateLeagueInput(
        makeForm({ salaryCapEnabled: false, salaryCap: 5_000_000 }),
        'baseball',
      ).salaryCap,
    ).toBeUndefined();
    expect(
      buildCreateLeagueInput(
        makeForm({ salaryCapEnabled: true, salaryCap: 5_000_000 }),
        'baseball',
      ).salaryCap,
    ).toBe(5_000_000);
  });

  it('sends football scoring fields alongside the premium fields (LS-6138)', () => {
    const input = buildCreateLeagueInput(
      makeForm({
        defensiveFormat: 'idp',
        baseballEraFilter: 'pioneer',
        baseballHofOnly: true,
        waiverType: 'faab',
        salaryCapEnabled: true,
        salaryCap: 5_000_000,
      }),
      'football',
    );
    expect(input.sport).toBe('football');
    expect(input.scoringFormat).toBe('ppr');
    expect(input.defensiveFormat).toBe('idp');
    expect(input.eraFilter).toBe('pioneer');
    expect(input.baseballHofOnly).toBe(true);
    expect(input.waiverType).toBe('faab');
    expect(input.faabBudgetDefault).toBe(100);
    expect(input.salaryCapEnabled).toBe(true);
    expect(input.salaryCap).toBe(5_000_000);
  });

  it('omits baseball-only fields (sport, scoring/defensive format) for baseball', () => {
    const input = buildCreateLeagueInput(makeForm(), 'baseball');
    expect(input.sport).toBeUndefined();
    expect(input.scoringFormat).toBeUndefined();
    expect(input.defensiveFormat).toBeUndefined();
  });

  it('serializes the draft date as an ISO start date', () => {
    expect(buildCreateLeagueInput(makeForm(), 'baseball').startDate).toBe(
      '2030-08-08T19:00:00.000Z',
    );
  });
});

import { renderHook, waitFor } from '@testing-library/react-native';
import { ClientNotificationType } from '@legacy-sports/utils';

// ── Module under test ─────────────────────────────────────────────────────────

import { useSubscription } from './useSubscription';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

let mockWebsocketUrl: string | undefined = undefined;
jest.mock('@legacy-sports/app-config/native', () => ({
  get config() {
    return { websocketUrl: mockWebsocketUrl };
  },
}));

// At runtime Expo Metro aliases `@legacy-sports/utils` to lib/utils/src/index.ts
// (via tsconfig paths), so ClientNotificationType resolves. Under jest the app's
// moduleNameMapper + `native.ts` extension priority resolves the barrel to
// index.native.ts, which omits notification-types. Pull the real constant from
// its canonical source so this spec exercises the actual event name.
jest.mock('@legacy-sports/utils', () => ({
  ClientNotificationType: jest.requireActual<
    typeof import('../../../../../lib/utils/src/lib/notification-types')
  >('../../../../../lib/utils/src/lib/notification-types')
    .ClientNotificationType,
}));

const mockUseGetMySubscriptionQuery = jest.fn();
jest.mock('../../api/db/graphql.generated', () => ({
  useGetMySubscriptionQuery: (...args: unknown[]): unknown =>
    mockUseGetMySubscriptionQuery(...args),
  useCreateBillingPortalSessionMutation: jest.fn(() => [jest.fn(), {}]),
  useCreateCheckoutSessionMutation: jest.fn(() => [jest.fn(), {}]),
}));

const mockReadKeychainValue = jest.fn();
jest.mock('../../common/auth/AuthHooks', () => ({
  readKeychainValue: (...args: unknown[]): unknown =>
    mockReadKeychainValue(...args),
  Secret: { INTERNAL_JWT: 'INTERNAL_JWT' },
}));

const mockCaptureError = jest.fn();
jest.mock('@legacy-sports/rollbar/native', () => ({
  captureError: (...args: unknown[]): unknown => mockCaptureError(...args),
}));

// Capture the constructor options and the per-event handlers in typed
// module-scope state so tests can assert connection params and simulate an
// incoming SUBSCRIPTION_UPDATED notification without touching untyped
// `jest.fn().mock.calls`.
let mockCtorOpts: Record<string, unknown> | null = null;
const mockRegisteredHandlers = new Map<string, (n: unknown) => void>();
const mockClientDispose = jest.fn();
jest.mock('@legacy-sports/websocket-client', () => ({
  WebSocketClient: class {
    constructor(opts: Record<string, unknown>) {
      mockCtorOpts = opts;
    }
    on(type: string, handler: (n: unknown) => void): () => void {
      mockRegisteredHandlers.set(type, handler);
      return () => undefined;
    }
    dispose(): void {
      mockClientDispose();
    }
  },
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeQueryResult(
  subscription: {
    status: string;
    tier: string;
    currentPeriodEnd?: string | null;
    cancelAtPeriodEnd?: boolean | null;
    gracePeriodEndsAt?: string | null;
  } | null,
  opts: { loading?: boolean; error?: unknown; refetch?: jest.Mock } = {},
) {
  return {
    data: subscription
      ? { mySubscription: subscription }
      : { mySubscription: null },
    loading: opts.loading ?? false,
    error: opts.error,
    refetch: opts.refetch ?? jest.fn().mockResolvedValue(undefined),
  };
}

/** Invoke the handler the hook registered for a given notification type. */
function emitNotification(type: string, payload: Record<string, unknown>) {
  const handler = mockRegisteredHandlers.get(type);
  if (!handler) throw new Error(`No handler registered for ${type}`);
  handler({ type, ...payload });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useSubscription — isPremium', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockCtorOpts = null;
    mockRegisteredHandlers.clear();
    // Default: no token available so the WebSocket effect short-circuits and
    // existing isPremium tests stay isolated from the socket machinery.
    mockReadKeychainValue.mockResolvedValue(null);
  });

  it('AC1: returns isPremium=true during grace period (status=past_due, tier=premium)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'past_due', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(true);
  });

  it('AC2: returns isPremium=true for active premium users (status=active, tier=premium)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(true);
  });

  it('AC2: returns isPremium=true for trialing premium users (status=trialing, tier=premium)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'trialing', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(true);
  });

  it('AC3: returns isPremium=false for free-tier users (status=active, tier=free)', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'free' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(false);
  });

  it('AC3: returns isPremium=false when subscription is null', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(makeQueryResult(null));

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(false);
  });

  it('returns isPremium=false for canceled subscriptions with free tier', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'canceled', tier: 'free' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.isPremium).toBe(false);
  });

  it('exposes tier from the subscription', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    const { result } = renderHook(() => useSubscription());

    expect(result.current.tier).toBe('premium');
  });

  it('defaults tier to free when subscription is null', () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(makeQueryResult(null));

    const { result } = renderHook(() => useSubscription());

    expect(result.current.tier).toBe('free');
  });
});

describe('useSubscription — real-time SUBSCRIPTION_UPDATED listener', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockCtorOpts = null;
    mockRegisteredHandlers.clear();
    mockWebsocketUrl = 'wss://example.com/ws';
    mockReadKeychainValue.mockResolvedValue('jwt-token');
  });

  afterEach(() => {
    mockWebsocketUrl = undefined;
  });

  it('refetches the subscription when a SUBSCRIPTION_UPDATED notification arrives', async () => {
    const refetch = jest.fn().mockResolvedValue(undefined);
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }, { refetch }),
    );

    renderHook(() => useSubscription());

    // The socket connects asynchronously after reading the keychain token.
    await waitFor(() => {
      expect(
        mockRegisteredHandlers.has(ClientNotificationType.SUBSCRIPTION_UPDATED),
      ).toBe(true);
    });

    emitNotification(ClientNotificationType.SUBSCRIPTION_UPDATED, {
      tier: 'free',
      status: 'canceled',
    });

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('connects with the user-scoped general view context (no leagueId)', async () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    renderHook(() => useSubscription());

    await waitFor(() => {
      expect(mockCtorOpts).not.toBeNull();
    });
    expect(mockCtorOpts?.viewContext).toBe('general');
    expect(mockCtorOpts?.leagueId).toBeUndefined();
    expect(mockCtorOpts?.token).toBe('jwt-token');
  });

  it('does not connect when no auth token is available', async () => {
    mockReadKeychainValue.mockResolvedValue(null);
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    renderHook(() => useSubscription());

    await waitFor(() => {
      expect(mockReadKeychainValue).toHaveBeenCalled();
    });
    expect(mockCtorOpts).toBeNull();
  });

  it('disposes the WebSocket client on unmount', async () => {
    mockUseGetMySubscriptionQuery.mockReturnValue(
      makeQueryResult({ status: 'active', tier: 'premium' }),
    );

    const { unmount } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(mockCtorOpts).not.toBeNull();
    });

    unmount();

    expect(mockClientDispose).toHaveBeenCalledTimes(1);
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';

import { useWebPushRegistration } from './useWebPushRegistration';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRegisterToken = jest.fn().mockResolvedValue({});
const AUTHED_USER = { id: 42 };
const mockUseAuth = jest.fn<
  { isAuthenticated: boolean; user: { id: number } | null },
  []
>(() => ({ isAuthenticated: true, user: AUTHED_USER }));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useRegisterDeviceTokenMutation: () => [mockRegisterToken],
}));

const mockLoggerDebug = jest.fn();

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: (...args: unknown[]) => {
      mockLoggerDebug(...args);
    },
    error: jest.fn(),
  },
}));

jest.mock('../config/environment', () => ({
  env: { vapidPublicKey: 'test-vapid-key' },
}));

// ── ServiceWorker / PushManager stubs ────────────────────────────────────────

const mockSubscribe = jest.fn();
const mockGetSubscription = jest.fn();
const mockSwRegister = jest.fn();
const swMessageListeners: Array<(event: MessageEvent) => void> = [];

const mockSubscriptionPayload = {
  endpoint: 'https://push.example.com/sub',
  keys: { p256dh: 'key', auth: 'auth' },
};
const mockSubscriptionJson = JSON.stringify(mockSubscriptionPayload);

const mockPushSubscription = {
  toJSON: () => mockSubscriptionPayload,
};

const mockRegistration = {
  scope: 'http://localhost/',
  pushManager: {
    getSubscription: () =>
      mockGetSubscription() as Promise<PushSubscription | null>,
    subscribe: (opts: unknown) =>
      mockSubscribe(opts) as Promise<PushSubscription>,
  },
};

const mockServiceWorker = {
  register: (path: string) =>
    mockSwRegister(path) as Promise<ServiceWorkerRegistration>,
  addEventListener: (_event: string, cb: (e: MessageEvent) => void) => {
    swMessageListeners.push(cb);
  },
  removeEventListener: (_event: string, cb: (e: MessageEvent) => void) => {
    const idx = swMessageListeners.indexOf(cb);
    if (idx !== -1) swMessageListeners.splice(idx, 1);
  },
};

function fireSwMessage(data: unknown) {
  const event = { data } as MessageEvent;
  swMessageListeners.forEach((cb) => cb(event));
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeAll(() => {
  // Inject serviceWorker stub into jsdom's navigator (non-destructively)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: mockServiceWorker,
  });
  // Inject PushManager into window so the feature-detect passes
  Object.defineProperty(window, 'PushManager', {
    configurable: true,
    value: class PushManager {},
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  swMessageListeners.length = 0;
  mockUseAuth.mockReturnValue({ isAuthenticated: true, user: AUTHED_USER });
  mockSwRegister.mockResolvedValue(mockRegistration);
  mockGetSubscription.mockResolvedValue(null);
  mockSubscribe.mockResolvedValue(mockPushSubscription);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useWebPushRegistration — initial registration', () => {
  it('subscribes and registers device token when authenticated', async () => {
    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalled());

    expect(mockSwRegister).toHaveBeenCalledWith('/sw.js');
    expect(mockSubscribe).toHaveBeenCalled();
    expect(mockRegisterToken).toHaveBeenCalledWith({
      variables: {
        input: { deviceToken: mockSubscriptionJson, platform: 'web' },
      },
    });
  });

  it('reuses existing subscription instead of creating a new one', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);

    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalled());

    expect(mockSubscribe).not.toHaveBeenCalled();
    expect(mockRegisterToken).toHaveBeenCalledWith({
      variables: {
        input: { deviceToken: mockSubscriptionJson, platform: 'web' },
      },
    });
  });
});

describe('useWebPushRegistration — token refresh / invalidation', () => {
  it('re-registers when service worker posts PUSH_SUBSCRIPTION_CHANGED', async () => {
    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));

    const newSubscriptionJson = JSON.stringify({
      endpoint: 'https://push.example.com/new-sub',
      keys: { p256dh: 'new-key', auth: 'new-auth' },
    });

    act(() => {
      fireSwMessage({
        type: 'PUSH_SUBSCRIPTION_CHANGED',
        subscription: newSubscriptionJson,
      });
    });

    expect(mockRegisterToken).toHaveBeenLastCalledWith({
      variables: {
        input: { deviceToken: newSubscriptionJson, platform: 'web' },
      },
    });
  });

  it('ignores service worker messages with unknown type', async () => {
    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));

    act(() => {
      fireSwMessage({ type: 'SOME_OTHER_MESSAGE', subscription: 'x' });
    });

    expect(mockRegisterToken).toHaveBeenCalledTimes(1);
  });

  it('resets registered flag on logout so re-login triggers re-registration', async () => {
    const { rerender } = renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));

    // Simulate logout
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
    rerender();

    // Simulate re-login
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: AUTHED_USER });
    rerender();

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(2));
  });
});

describe('useWebPushRegistration — unchanged-subscription skip (LS-9541)', () => {
  const STORAGE_KEY = 'ls.webpush.lastRegistration';

  it('issues no mutation on a second page load when the subscription is unchanged', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);

    // First page load: registers and persists the fingerprint.
    const first = renderHook(() => useWebPushRegistration());
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
    first.unmount();

    // Second page load: a fresh hook instance (in-memory refs gone) but the
    // same localStorage — exactly what a browser reload looks like.
    mockRegisterToken.mockClear();
    mockLoggerDebug.mockClear();
    const second = renderHook(() => useWebPushRegistration());

    await waitFor(() =>
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Subscription unchanged'),
      ),
    );
    expect(mockRegisterToken).not.toHaveBeenCalled();
    second.unmount();

    // Third load, still unchanged — still silent.
    mockLoggerDebug.mockClear();
    renderHook(() => useWebPushRegistration());
    await waitFor(() =>
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Subscription unchanged'),
      ),
    );
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('registers again when the stored subscription differs', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: AUTHED_USER.id,
        subscription: JSON.stringify({
          endpoint: 'https://push.example.com/old',
        }),
        registeredAt: Date.now(),
      }),
    );

    renderHook(() => useWebPushRegistration());

    await waitFor(() =>
      expect(mockRegisterToken).toHaveBeenCalledWith({
        variables: {
          input: { deviceToken: mockSubscriptionJson, platform: 'web' },
        },
      }),
    );
  });

  it('registers again when the fingerprint belongs to a different user', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: AUTHED_USER.id + 1,
        subscription: mockSubscriptionJson,
        registeredAt: Date.now(),
      }),
    );

    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
  });

  it('re-asserts the registration once the stored fingerprint ages past its TTL', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: AUTHED_USER.id,
        subscription: mockSubscriptionJson,
        registeredAt: eightDaysAgo,
      }),
    );

    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
  });

  it('registers when the stored fingerprint is corrupt', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);
    window.localStorage.setItem(STORAGE_KEY, 'not-json');

    renderHook(() => useWebPushRegistration());

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
  });

  it('clears the fingerprint on logout so re-login re-registers on a later load', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);

    const { rerender, unmount } = renderHook(() => useWebPushRegistration());
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
    rerender();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
    unmount();

    // A fresh load while signed in registers again, because the fingerprint
    // went away with the logout.
    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: AUTHED_USER });
    mockRegisterToken.mockClear();
    renderHook(() => useWebPushRegistration());
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));
  });

  it('does not clear the fingerprint on the unauthenticated first paint of a page load', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        userId: AUTHED_USER.id,
        subscription: mockSubscriptionJson,
        registeredAt: Date.now(),
      }),
    );

    // Auth resolves asynchronously, so the hook first renders signed out.
    mockUseAuth.mockReturnValue({ isAuthenticated: false, user: null });
    const { rerender } = renderHook(() => useWebPushRegistration());

    expect(window.localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    mockUseAuth.mockReturnValue({ isAuthenticated: true, user: AUTHED_USER });
    rerender();

    await waitFor(() =>
      expect(mockLoggerDebug).toHaveBeenCalledWith(
        expect.stringContaining('Subscription unchanged'),
      ),
    );
    expect(mockRegisterToken).not.toHaveBeenCalled();
  });

  it('records the rotated subscription after a PUSH_SUBSCRIPTION_CHANGED re-register', async () => {
    mockGetSubscription.mockResolvedValue(mockPushSubscription);

    renderHook(() => useWebPushRegistration());
    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(1));

    const newSubscriptionJson = JSON.stringify({
      endpoint: 'https://push.example.com/rotated',
    });

    await act(async () => {
      fireSwMessage({
        type: 'PUSH_SUBSCRIPTION_CHANGED',
        subscription: newSubscriptionJson,
      });
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(window.localStorage.getItem(STORAGE_KEY)).toContain('rotated'),
    );
  });
});

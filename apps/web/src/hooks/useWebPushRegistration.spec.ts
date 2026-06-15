import { act, renderHook, waitFor } from '@testing-library/react';

import { useWebPushRegistration } from './useWebPushRegistration';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockRegisterToken = jest.fn().mockResolvedValue({});
const mockUseAuth = jest.fn(() => ({ isAuthenticated: true }));

jest.mock('@legacy-sports/shared-components/auth', () => ({
  useAuth: (...args: unknown[]) => mockUseAuth(...args),
}));

jest.mock('@legacy-sports/graphql', () => ({
  useRegisterDeviceTokenMutation: () => [mockRegisterToken],
}));

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
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
  swMessageListeners.length = 0;
  mockUseAuth.mockReturnValue({ isAuthenticated: true });
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
    mockUseAuth.mockReturnValue({ isAuthenticated: false });
    rerender();

    // Simulate re-login
    mockUseAuth.mockReturnValue({ isAuthenticated: true });
    rerender();

    await waitFor(() => expect(mockRegisterToken).toHaveBeenCalledTimes(2));
  });
});

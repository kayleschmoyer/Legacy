import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useIAP } from './useIAP';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

const mockGetAvailablePurchases = jest.fn();
jest.mock('react-native-iap', () => ({
  fetchProducts: jest.fn().mockResolvedValue([]),
  finishTransaction: jest.fn(),
  getAvailablePurchases: (...args: unknown[]): unknown =>
    mockGetAvailablePurchases(...args),
  initConnection: jest.fn().mockResolvedValue(undefined),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  requestPurchase: jest.fn(),
}));

const mockRefetchSubscription = jest.fn();
const mockRestoreMutation = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetMySubscriptionQuery: () => ({ refetch: mockRefetchSubscription }),
  useRestoreApplePurchasesMutation: () => [mockRestoreMutation],
  useVerifyApplePurchaseMutation: () => [jest.fn()],
}));

const MONTHLY = 'com.legacysports.app.premium.monthly';
const TIMEOUT_MS = 30_000;

describe('useIAP — restorePurchases (LS-7413)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Only the timeout tests need fake timers. setImmediate/nextTick/queueMicrotask
  // stay real so React Native's Promise polyfill keeps flushing.
  const useFakeTimers = (): void => {
    jest.useFakeTimers({
      doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'],
    });
  };

  // Kick off a restore inside act() without awaiting it; assertions use waitFor
  // (awaiting the promise inside an async act() hangs under the RN Promise polyfill).
  const startRestore = (result: {
    current: ReturnType<typeof useIAP>;
  }): void => {
    void act(() => {
      void result.current.restorePurchases();
    });
  };

  it('times out, clears loading, and surfaces a retryable error when StoreKit never responds', async () => {
    useFakeTimers();
    mockGetAvailablePurchases.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useIAP());

    startRestore(result);
    expect(result.current.loading).toBe(true);

    void act(() => {
      jest.advanceTimersByTime(TIMEOUT_MS);
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Restore timed out. Please try again.');
    });
    expect(result.current.loading).toBe(false);
    expect(mockRestoreMutation).not.toHaveBeenCalled();
  });

  it('does not time out before the deadline', () => {
    useFakeTimers();
    mockGetAvailablePurchases.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useIAP());

    startRestore(result);
    void act(() => {
      jest.advanceTimersByTime(TIMEOUT_MS - 1);
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('clears the timer when the restore resolves normally', async () => {
    useFakeTimers();
    mockGetAvailablePurchases.mockResolvedValue([]);
    const { result } = renderHook(() => useIAP());

    startRestore(result);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it('reports no previous purchases when StoreKit returns none', async () => {
    mockGetAvailablePurchases.mockResolvedValue([]);
    const { result } = renderHook(() => useIAP());

    startRestore(result);

    await waitFor(() => {
      expect(result.current.error).toBe(
        'No previous purchases found for this Apple ID.',
      );
    });
    expect(result.current.loading).toBe(false);
  });

  it('restores successfully and marks the user subscribed', async () => {
    mockGetAvailablePurchases.mockResolvedValue([
      { productId: MONTHLY, transactionDate: 1, purchaseToken: 'jws' },
    ]);
    mockRestoreMutation.mockResolvedValue({
      data: { restoreApplePurchases: true },
    });
    const { result } = renderHook(() => useIAP());

    startRestore(result);

    await waitFor(() => {
      expect(result.current.isSubscribed).toBe(true);
    });
    expect(mockRestoreMutation).toHaveBeenCalledWith({
      variables: { jwsTransaction: 'jws' },
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockRefetchSubscription).toHaveBeenCalled();
  });

  it('keeps the generic error message when the native call rejects', async () => {
    useFakeTimers();
    mockGetAvailablePurchases.mockRejectedValue(new Error('StoreKit down'));
    const { result } = renderHook(() => useIAP());

    startRestore(result);

    await waitFor(() => {
      expect(result.current.error).toBe(
        'Restore failed. Please try again or contact support.',
      );
    });
    expect(result.current.loading).toBe(false);
    expect(jest.getTimerCount()).toBe(0);
  });
});

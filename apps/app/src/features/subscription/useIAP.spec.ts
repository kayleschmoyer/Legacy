import { act, renderHook, waitFor } from '@testing-library/react-native';

import { useIAP } from './useIAP';

// ── Mocks (hoisted before imports) ───────────────────────────────────────────

const mockGetAvailablePurchases = jest.fn();
const mockFinishTransaction = jest.fn();
const mockPurchaseUpdatedListener = jest.fn();
jest.mock('react-native-iap', () => ({
  fetchProducts: jest.fn().mockResolvedValue([]),
  finishTransaction: (...args: unknown[]): unknown =>
    mockFinishTransaction(...args),
  getAvailablePurchases: (...args: unknown[]): unknown =>
    mockGetAvailablePurchases(...args),
  initConnection: jest.fn().mockResolvedValue(undefined),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseUpdatedListener: (...args: unknown[]): unknown =>
    mockPurchaseUpdatedListener(...args),
  requestPurchase: jest.fn(),
}));

const mockRefetchSubscription = jest.fn();
const mockRestoreMutation = jest.fn();
const mockVerifyMutation = jest.fn();
jest.mock('@legacy-sports/graphql', () => ({
  useGetMySubscriptionQuery: () => ({ refetch: mockRefetchSubscription }),
  useRestoreApplePurchasesMutation: () => [mockRestoreMutation],
  useVerifyApplePurchaseMutation: () => [mockVerifyMutation],
}));

const MONTHLY = 'com.legacysports.app.premium.monthly';
const TIMEOUT_MS = 30_000;

describe('useIAP — restorePurchases (LS-7413)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPurchaseUpdatedListener.mockReturnValue({ remove: jest.fn() });
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

describe('useIAP — purchase-updated dedup across instances (LS-7419)', () => {
  type PurchaseCb = (purchase: unknown) => void;
  const purchase = { purchaseToken: 'jws-1', productId: MONTHLY };
  let listeners: PurchaseCb[];
  let removers: jest.Mock[];

  beforeEach(() => {
    jest.clearAllMocks();
    listeners = [];
    removers = [];
    mockPurchaseUpdatedListener.mockImplementation((cb: PurchaseCb) => {
      const remove = jest.fn();
      listeners.push(cb);
      removers.push(remove);
      return { remove };
    });
    mockVerifyMutation.mockResolvedValue({
      data: { verifyApplePurchase: { success: true } },
    });
    mockFinishTransaction.mockResolvedValue(undefined);
  });

  // The library invokes every registered listener for each native event.
  const fireEvent = (): void => {
    void act(() => {
      listeners.forEach((cb) => cb(purchase));
    });
  };

  it('verifies and finishes once when two instances are mounted, and settles both', async () => {
    const first = renderHook(() => useIAP());
    const second = renderHook(() => useIAP());
    expect(listeners).toHaveLength(2);

    fireEvent();

    await waitFor(() => {
      expect(first.result.current.isSubscribed).toBe(true);
      expect(second.result.current.isSubscribed).toBe(true);
    });
    expect(mockVerifyMutation).toHaveBeenCalledTimes(1);
    expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
    expect(first.result.current.loading).toBe(false);
    expect(second.result.current.loading).toBe(false);
  });

  it('surfaces a failed verification in every mounted instance', async () => {
    mockVerifyMutation.mockResolvedValue({
      data: { verifyApplePurchase: { success: false } },
    });
    const first = renderHook(() => useIAP());
    const second = renderHook(() => useIAP());

    fireEvent();

    await waitFor(() => {
      expect(first.result.current.error).toBe(
        'Purchase verification failed. Please contact support.',
      );
      expect(second.result.current.error).toBe(
        'Purchase verification failed. Please contact support.',
      );
    });
    expect(mockVerifyMutation).toHaveBeenCalledTimes(1);
  });

  it('keeps handling purchases in the remaining instance after the other unmounts', async () => {
    const first = renderHook(() => useIAP());
    const second = renderHook(() => useIAP());

    first.unmount();
    expect(removers[0]).toHaveBeenCalledTimes(1);
    expect(removers[1]).not.toHaveBeenCalled();

    void act(() => {
      listeners[1]?.(purchase);
    });

    await waitFor(() => {
      expect(second.result.current.isSubscribed).toBe(true);
    });
    expect(mockVerifyMutation).toHaveBeenCalledTimes(1);
    expect(mockFinishTransaction).toHaveBeenCalledTimes(1);
  });

  it('verifies again for a later, distinct transaction', async () => {
    const { result } = renderHook(() => useIAP());

    fireEvent();
    await waitFor(() => {
      expect(result.current.isSubscribed).toBe(true);
    });

    void act(() => {
      listeners[0]?.({ purchaseToken: 'jws-2', productId: MONTHLY });
    });
    await waitFor(() => {
      expect(mockVerifyMutation).toHaveBeenCalledTimes(2);
    });
  });
});

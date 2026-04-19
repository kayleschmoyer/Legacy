/**
 * useIAP � React Native hook for iOS StoreKit 2 in-app purchases.
 *
 * Wraps react-native-iap v14 (NitroModules) to provide a clean API for:
 * - Fetching available subscription products from the App Store
 * - Initiating a purchase
 * - Restoring previous purchases
 * - Listening for purchase updates
 *
 * After a successful purchase the hook verifies the transaction server-side
 * via the `verifyApplePurchase` GraphQL mutation before finishing the
 * StoreKit transaction. This prevents fraudulent receipts from granting premium.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import type { Purchase } from 'react-native-iap';
import {
  useRestoreApplePurchasesMutation,
  useVerifyApplePurchaseMutation,
} from '../../api/db/graphql.generated';

/**
 * Minimal interface for the subscription handle returned by react-native-iap
 * listener functions whose types may not fully resolve in this project.
 */
interface PurchaseListenerHandle {
  remove: () => void;
}

/** Properties of an iOS subscription product returned by fetchProducts. */
interface AppleSubscriptionProduct {
  id: string;
  title: string;
  description: string;
  displayPrice: string;
  currency: string;
}

/** Subset of PurchaseError fields we rely on. */
interface IAPPurchaseError {
  code: string;
  message?: string;
}

/** Subset of Purchase event fields we rely on. */
interface IAPPurchaseEvent {
  purchaseToken: string | null;
  productId: string;
}

/** Subset of available-purchase record fields we rely on. */
interface IAPAvailablePurchase {
  productId: string;
  transactionDate: number;
  purchaseToken: string | undefined;
}

// ErrorCode enum value used for cancellation detection — use the string
// value directly to avoid unsafe-member-access on the library's any-typed enum.
const IAP_USER_CANCELLED_CODE = 'E_USER_CANCELLED';

// Typed aliases for react-native-iap functions whose NitroModules type
// definitions may not fully resolve (typed as `any`) in this project.
// Casting here keeps call sites clean and passes @typescript-eslint rules.
const iapInit = initConnection as unknown as () => Promise<void>;
const iapFetch = fetchProducts as unknown as (p: {
  skus: string[];
  type: string;
}) => Promise<unknown>;
const iapRequest = requestPurchase as unknown as (p: {
  type: string;
  request: { apple: { sku: string } };
}) => Promise<void>;
const iapRestore = getAvailablePurchases as unknown as () => Promise<unknown>;
const iapFinish = finishTransaction as unknown as (p: {
  purchase: IAPPurchaseEvent;
  isConsumable: boolean;
}) => Promise<void>;
const iapUpdateListener = purchaseUpdatedListener as unknown as (
  cb: (e: Purchase) => void,
) => PurchaseListenerHandle;
const iapErrorListener = purchaseErrorListener as unknown as (
  cb: (e: IAPPurchaseError) => void,
) => PurchaseListenerHandle;

// Product IDs as configured in App Store Connect
export const IAP_PRODUCTS = {
  MONTHLY: 'com.legacysports.app.premium.monthly',
  ANNUAL: 'com.legacysports.app.premium.annual',
} as const;

export type IAPProductId = (typeof IAP_PRODUCTS)[keyof typeof IAP_PRODUCTS];

export interface IAPProduct {
  productId: IAPProductId;
  title: string;
  description: string;
  displayPrice: string;
  currency: string;
}

export interface UseIAPResult {
  /** Available subscription products from the App Store */
  products: IAPProduct[];
  /** True while loading products or processing a purchase */
  loading: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Whether the user currently has an active Apple subscription */
  isSubscribed: boolean;
  /** Initiate a subscription purchase */
  purchase: (productId: IAPProductId) => Promise<void>;
  /** Restore previously purchased subscriptions */
  restorePurchases: () => Promise<void>;
  /** Clear any error state */
  clearError: () => void;
}

export function useIAP(): UseIAPResult {
  const [products, setProducts] = useState<IAPProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [verifyApplePurchase] = useVerifyApplePurchaseMutation();
  const [restoreApplePurchasesMutation] = useRestoreApplePurchasesMutation();

  const purchaseUpdateSubscriptionRef = useRef<PurchaseListenerHandle | null>(
    null,
  );
  const purchaseErrorSubscriptionRef = useRef<PurchaseListenerHandle | null>(
    null,
  );

  const handlePurchaseUpdate = useCallback(
    async (purchaseEvent: Purchase): Promise<void> => {
      if (Platform.OS !== 'ios') return;

      // purchaseToken is the JWS transaction info on iOS (StoreKit 2).
      // Cast to our local interface to avoid unsafe-member-access on the
      // library's potentially-any Purchase type.
      const event = purchaseEvent as unknown as IAPPurchaseEvent;
      const { purchaseToken, productId } = event;
      if (!purchaseToken || !productId) return;

      try {
        setLoading(true);

        const result = await verifyApplePurchase({
          variables: { jwsTransaction: purchaseToken },
        });

        // Always finish the StoreKit transaction regardless of verification
        // result. Leaving it unfinished causes repeated re-delivery on every
        // app launch (Apple) and auto-refunds after 3 days (Google Play).
        // Premium access is only granted when the server confirms success.
        await iapFinish({
          purchase: event,
          isConsumable: false,
        });

        if (result.data?.verifyApplePurchase?.success) {
          setIsSubscribed(true);
        } else {
          setError('Purchase verification failed. Please contact support.');
        }
      } catch (_err) {
        setError('Purchase verification failed. Please try again.');
      } finally {
        setLoading(false);
      }
    },
    [verifyApplePurchase],
  );

  useEffect(() => {
    if (Platform.OS !== 'ios') return;

    let mounted = true;

    const setup = async (): Promise<void> => {
      try {
        await iapInit();

        if (!mounted) return;

        const rawSubs = await iapFetch({
          skus: Object.values(IAP_PRODUCTS),
          type: 'subs',
        });
        const subs = rawSubs as AppleSubscriptionProduct[];

        if (mounted) {
          setProducts(
            subs.map((sub) => ({
              productId: sub.id as IAPProductId,
              title: sub.title,
              description: sub.description,
              displayPrice: sub.displayPrice,
              currency: sub.currency,
            })),
          );
        }
      } catch (_err) {
        if (mounted) {
          setError('Failed to load subscription products. Please try again.');
        }
      }
    };

    void setup();

    purchaseUpdateSubscriptionRef.current = iapUpdateListener(
      (purchaseEvent: Purchase) => {
        void handlePurchaseUpdate(purchaseEvent);
      },
    );

    purchaseErrorSubscriptionRef.current = iapErrorListener(
      (purchaseError: IAPPurchaseError) => {
        if (purchaseError.code !== IAP_USER_CANCELLED_CODE) {
          setError(
            purchaseError.message ?? 'Purchase failed. Please try again.',
          );
        }
        setLoading(false);
      },
    );

    return () => {
      mounted = false;
      purchaseUpdateSubscriptionRef.current?.remove();
      purchaseErrorSubscriptionRef.current?.remove();
    };
  }, [handlePurchaseUpdate]);

  const purchase = async (productId: IAPProductId): Promise<void> => {
    if (Platform.OS !== 'ios') return;

    setLoading(true);
    setError(null);

    try {
      await iapRequest({
        type: 'subs',
        request: { apple: { sku: productId } },
      });
      // The purchaseUpdatedListener handles completion
    } catch (purchaseErr) {
      const err = purchaseErr as IAPPurchaseError;
      if (err.code !== IAP_USER_CANCELLED_CODE) {
        setError(err.message ?? 'Purchase failed. Please try again.');
      }
      setLoading(false);
    }
  };

  const restorePurchases = async (): Promise<void> => {
    if (Platform.OS !== 'ios') return;

    setLoading(true);
    setError(null);

    try {
      const rawPurchases = await iapRestore();
      const purchases = rawPurchases as IAPAvailablePurchase[];

      const subscriptionPurchases = purchases.filter((p) =>
        (Object.values(IAP_PRODUCTS) as string[]).includes(p.productId),
      );

      if (subscriptionPurchases.length === 0) {
        setError('No previous purchases found for this Apple ID.');
        setLoading(false);
        return;
      }

      const mostRecent = [...subscriptionPurchases].sort(
        (a, b) => b.transactionDate - a.transactionDate,
      )[0];

      const token = mostRecent?.purchaseToken;
      if (!token) {
        setError('Could not retrieve purchase token. Please try again.');
        setLoading(false);
        return;
      }

      await restoreApplePurchasesMutation({
        variables: { jwsTransaction: token },
      });

      setIsSubscribed(true);
    } catch (_err) {
      setError('Restore failed. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return {
    products,
    loading,
    error,
    isSubscribed,
    purchase,
    restorePurchases,
    clearError,
  };
}

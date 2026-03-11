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
import {
  ErrorCode,
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'react-native-iap';
import type {
  ProductSubscription,
  Purchase,
  PurchaseError,
} from 'react-native-iap';
import { Platform } from 'react-native';
import {
  useRestoreApplePurchasesMutation,
  useVerifyApplePurchaseMutation,
} from '../../api/db/graphql.generated';

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

  const purchaseUpdateSubscriptionRef = useRef<ReturnType<
    typeof purchaseUpdatedListener
  > | null>(null);
  const purchaseErrorSubscriptionRef = useRef<ReturnType<
    typeof purchaseErrorListener
  > | null>(null);

  const handlePurchaseUpdate = useCallback(
    async (purchaseEvent: Purchase): Promise<void> => {
      if (Platform.OS !== 'ios') return;

      // purchaseToken is the JWS transaction info on iOS (StoreKit 2)
      const { purchaseToken, productId } = purchaseEvent;
      if (!purchaseToken || !productId) return;

      try {
        setLoading(true);

        const result = await verifyApplePurchase({
          variables: { jwsTransaction: purchaseToken },
        });

        if (result.data?.verifyApplePurchase?.success) {
          setIsSubscribed(true);
          await finishTransaction({
            purchase: purchaseEvent,
            isConsumable: false,
          });
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
        await initConnection();

        if (!mounted) return;

        const subs = await fetchProducts({
          skus: Object.values(IAP_PRODUCTS),
          type: 'subs',
        });

        if (mounted) {
          setProducts(
            (subs as ProductSubscription[]).map((sub) => ({
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

    purchaseUpdateSubscriptionRef.current = purchaseUpdatedListener(
      (purchaseEvent: Purchase) => {
        void handlePurchaseUpdate(purchaseEvent);
      },
    );

    purchaseErrorSubscriptionRef.current = purchaseErrorListener(
      (purchaseError: PurchaseError) => {
        if (purchaseError.code !== ErrorCode.UserCancelled) {
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
      await requestPurchase({
        type: 'subs',
        request: { apple: { sku: productId } },
      });
      // The purchaseUpdatedListener handles completion
    } catch (purchaseErr) {
      const err = purchaseErr as PurchaseError;
      if (err.code !== ErrorCode.UserCancelled) {
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
      const purchases = await getAvailablePurchases();

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

/**
 * useGooglePlayBilling — React Native hook for Android Google Play Billing
 * in-app purchases.
 *
 * Uses react-native-iap v14 (Nitro-based API).
 *
 * Wraps react-native-iap to provide a clean API for:
 * - Fetching available subscription products from Google Play
 * - Initiating a subscription purchase
 * - Restoring previous purchases
 * - Listening for purchase updates
 *
 * After a successful purchase the hook verifies the transaction server-side
 * via the `verifyGooglePurchase` GraphQL mutation before finishing the
 * Google Play transaction. This prevents fraudulent tokens from granting
 * premium access.
 */
import { useEffect, useRef, useState } from 'react';
import {
  endConnection,
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
  useRestoreGooglePurchasesMutation,
  useVerifyGooglePurchaseMutation,
} from '../../api/db/graphql.generated';

// Product IDs as configured in Google Play Console
export const GOOGLE_PLAY_PRODUCTS = {
  MONTHLY: 'com.legacysports.app.premium.monthly',
  ANNUAL: 'com.legacysports.app.premium.annual',
} as const;

export type GooglePlayProductId =
  (typeof GOOGLE_PLAY_PRODUCTS)[keyof typeof GOOGLE_PLAY_PRODUCTS];

export interface GooglePlayProduct {
  productId: GooglePlayProductId;
  title: string;
  description: string;
  localizedPrice: string;
  currency: string;
}

export interface UseGooglePlayBillingResult {
  /** Available subscription products from Google Play */
  products: GooglePlayProduct[];
  /** True while loading products or processing a purchase */
  loading: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Whether the user currently has an active Google Play subscription */
  isSubscribed: boolean;
  /** Initiate a subscription purchase */
  purchase: (productId: GooglePlayProductId) => Promise<void>;
  /** Restore previously purchased subscriptions */
  restorePurchases: () => Promise<void>;
  /** Clear any error state */
  clearError: () => void;
}

export function useGooglePlayBilling(): UseGooglePlayBillingResult {
  const [products, setProducts] = useState<GooglePlayProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const [verifyGooglePurchase] = useVerifyGooglePurchaseMutation();
  const [restoreGooglePurchasesMutation] = useRestoreGooglePurchasesMutation();

  // Subscription refs to properly clean up listeners
  const purchaseUpdateSubscriptionRef = useRef<ReturnType<
    typeof purchaseUpdatedListener
  > | null>(null);
  const purchaseErrorSubscriptionRef = useRef<ReturnType<
    typeof purchaseErrorListener
  > | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let mounted = true;

    const handlePurchaseUpdate = async (
      purchaseItem: Purchase,
    ): Promise<void> => {
      const { purchaseToken, productId } = purchaseItem;
      if (!purchaseToken || !productId) return;

      try {
        setLoading(true);

        // Server-side verification via GraphQL mutation
        const result = await verifyGooglePurchase({
          variables: { purchaseToken, productId },
        });

        // Always acknowledge the purchase regardless of verification result
        // or mounted state. Unacknowledged Google Play purchases are
        // auto-refunded after 3 days, causing revenue loss even when the
        // billing itself succeeded. Premium access is only granted when the
        // server confirms success.
        await finishTransaction({
          purchase: purchaseItem,
          isConsumable: false,
        });

        if (!mounted) return;

        if (result.data?.verifyGooglePurchase?.success) {
          setIsSubscribed(true);
        } else {
          setError('Purchase verification failed. Please contact support.');
        }
      } catch (_err) {
        if (mounted) {
          setError('Purchase verification failed. Please try again.');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    const setup = async () => {
      try {
        await initConnection();

        if (!mounted) return;

        // Fetch subscription products from Google Play
        const result = await fetchProducts({
          skus: Object.values(GOOGLE_PLAY_PRODUCTS),
          type: 'subs',
        });

        if (mounted) {
          const subs = (result ?? []) as unknown as ProductSubscription[];
          setProducts(
            subs.map((sub) => ({
              productId: sub.id as GooglePlayProductId,
              title: sub.title,
              description: sub.description,
              localizedPrice: sub.displayPrice,
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

    // Listen for purchase updates (successful transactions).
    // The callback must be synchronous; async work is dispatched via void IIFE.
    purchaseUpdateSubscriptionRef.current = purchaseUpdatedListener(
      (purchaseItem: Purchase) => {
        void handlePurchaseUpdate(purchaseItem);
      },
    );

    // Listen for purchase errors
    purchaseErrorSubscriptionRef.current = purchaseErrorListener(
      (err: PurchaseError) => {
        if (err.code !== ErrorCode.UserCancelled) {
          setError(err.message ?? 'Purchase failed. Please try again.');
        }
        setLoading(false);
      },
    );

    return () => {
      mounted = false;
      purchaseUpdateSubscriptionRef.current?.remove();
      purchaseErrorSubscriptionRef.current?.remove();
      void endConnection();
    };
  }, [verifyGooglePurchase]);

  const purchase = async (productId: GooglePlayProductId): Promise<void> => {
    if (Platform.OS !== 'android') return;

    setLoading(true);
    setError(null);

    try {
      await requestPurchase({
        type: 'subs',
        request: { google: { skus: [productId] } },
      });
      // The purchaseUpdatedListener handles the successful result
    } catch (err) {
      const purchaseErr = err as PurchaseError;
      if (purchaseErr.code !== ErrorCode.UserCancelled) {
        setError(purchaseErr.message ?? 'Purchase failed. Please try again.');
      }
      setLoading(false);
    }
  };

  const restorePurchases = async (): Promise<void> => {
    if (Platform.OS !== 'android') return;

    setLoading(true);
    setError(null);

    try {
      const purchases = await getAvailablePurchases();

      const subscription = purchases.find((p) =>
        Object.values(GOOGLE_PLAY_PRODUCTS).includes(
          p.productId as GooglePlayProductId,
        ),
      );

      if (!subscription) {
        setError('No previous purchases found for this Google account.');
        setLoading(false);
        return;
      }

      const { purchaseToken, productId } = subscription;
      if (!purchaseToken || !productId) {
        setError('Could not retrieve purchase token. Please try again.');
        setLoading(false);
        return;
      }

      const result = await restoreGooglePurchasesMutation({
        variables: { purchaseToken, productId },
      });

      if (result.data?.restoreGooglePurchases === true) {
        setIsSubscribed(true);
      } else {
        setError('Restore failed. Please try again or contact support.');
      }
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

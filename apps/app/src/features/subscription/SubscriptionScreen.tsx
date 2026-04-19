/**
 * SubscriptionScreen — iOS in-app purchase subscription UI.
 *
 * Displays available subscription plans (Monthly / Annual) with pricing
 * fetched live from the App Store, allows the user to subscribe, and
 * provides a "Restore Purchases" option for existing subscribers.
 */
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { Button, Card, Text, XStack, YStack } from 'tamagui';
import { useIAP } from './useIAP';
import type { IAPProductId } from './useIAP';

interface SubscriptionScreenProps {
  onSubscriptionComplete?: () => void;
}

export function SubscriptionScreen({
  onSubscriptionComplete,
}: SubscriptionScreenProps) {
  const {
    products,
    loading,
    error,
    isSubscribed,
    purchase,
    restorePurchases,
    clearError,
  } = useIAP();

  // Track whether the current isSubscribed=true transition was triggered by a
  // purchase or restore initiated in this component instance. isSubscribed is
  // set asynchronously (purchase: via purchaseUpdatedListener after server
  // verification; restore: via setIsSubscribed inside restorePurchases), so
  // checking it synchronously after await always reads the stale closure value.
  const purchaseInitiated = useRef(false);
  const restoreInitiated = useRef(false);

  useEffect(() => {
    if (!isSubscribed) return;
    if (purchaseInitiated.current) {
      purchaseInitiated.current = false;
      onSubscriptionComplete?.();
    } else if (restoreInitiated.current) {
      restoreInitiated.current = false;
      Alert.alert(
        'Purchases Restored',
        'Your subscription has been restored successfully.',
        [{ text: 'OK', onPress: () => onSubscriptionComplete?.() }],
      );
    }
  }, [isSubscribed, onSubscriptionComplete]);

  const handlePurchase = async (productId: IAPProductId) => {
    clearError();
    purchaseInitiated.current = true;
    await purchase(productId);
  };

  const handleRestore = async () => {
    clearError();
    restoreInitiated.current = true;
    await restorePurchases();
  };

  if (Platform.OS !== 'ios') {
    return null;
  }

  if (isSubscribed) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" padding="$4">
        <Text
          fontSize="$6"
          fontWeight="bold"
          color="$green10"
          textAlign="center"
        >
          You're subscribed!
        </Text>
        <Text fontSize="$4" color="$color11" marginTop="$2" textAlign="center">
          Thank you for your Legacy Sports Premium membership.
        </Text>
      </YStack>
    );
  }

  return (
    <YStack flex={1} padding="$4" gap="$4">
      <YStack gap="$2">
        <Text fontSize="$7" fontWeight="bold" textAlign="center">
          Upgrade to Premium
        </Text>
        <Text fontSize="$4" color="$color11" textAlign="center">
          Unlock unlimited leagues and premium features.
        </Text>
      </YStack>

      {error ? (
        <Card
          backgroundColor="$red2"
          borderColor="$red8"
          borderWidth={1}
          padding="$3"
        >
          <Text color="$red11" textAlign="center">
            {error}
          </Text>
        </Card>
      ) : null}

      {loading ? (
        <YStack flex={1} alignItems="center" justifyContent="center">
          <ActivityIndicator size="large" />
          <Text marginTop="$2" color="$color11">
            {products.length === 0 ? 'Loading products…' : 'Processing…'}
          </Text>
        </YStack>
      ) : (
        <YStack gap="$3" flex={1} justifyContent="center">
          {products.map((product) => {
            const isAnnual = product.productId.includes('annual');
            return (
              <Card
                key={product.productId}
                borderWidth={2}
                borderColor={isAnnual ? '$blue8' : '$color8'}
                backgroundColor={isAnnual ? '$blue1' : '$background'}
                padding="$4"
                pressStyle={{ opacity: 0.8 }}
                onPress={() => void handlePurchase(product.productId)}
              >
                <YStack gap="$1">
                  <XStack justifyContent="space-between" alignItems="center">
                    <Text fontWeight="bold" fontSize="$5">
                      {isAnnual ? 'Annual Plan' : 'Monthly Plan'}
                    </Text>
                    {isAnnual ? (
                      <Card
                        backgroundColor="$blue9"
                        paddingHorizontal="$2"
                        paddingVertical="$1"
                        borderRadius="$2"
                      >
                        <Text color="white" fontSize="$2" fontWeight="bold">
                          BEST VALUE
                        </Text>
                      </Card>
                    ) : null}
                  </XStack>
                  <Text fontSize="$6" fontWeight="bold" color="$blue10">
                    {product.displayPrice}
                    <Text fontSize="$3" fontWeight="normal" color="$color11">
                      {isAnnual ? '/year' : '/month'}
                    </Text>
                  </Text>
                  {product.description ? (
                    <Text fontSize="$3" color="$color11">
                      {product.description}
                    </Text>
                  ) : null}
                </YStack>
              </Card>
            );
          })}

          {products.length === 0 ? (
            <Card backgroundColor="$color2" padding="$4">
              <Text textAlign="center" color="$color11">
                Unable to load subscription options from the App Store.
                {'\n'}Please check your internet connection and try again.
              </Text>
            </Card>
          ) : null}
        </YStack>
      )}

      <YStack gap="$2" marginBottom="$4">
        <Button
          theme="alt1"
          disabled={loading}
          onPress={() => void handleRestore()}
        >
          Restore Purchases
        </Button>
        <Text fontSize="$2" color="$color10" textAlign="center">
          Subscriptions auto-renew unless cancelled at least 24 hours before the
          end of the current period. Manage your subscription in your Apple ID
          settings.
        </Text>
      </YStack>
    </YStack>
  );
}

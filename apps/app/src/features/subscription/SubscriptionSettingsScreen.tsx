import React, { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Platform, ScrollView } from 'react-native';
import {
  Button,
  H1,
  Paragraph,
  Separator,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import {
  useBillingPortalSession,
  useCheckoutSession,
  useSubscription,
} from './useSubscription';
import { BillingCycle, PREMIUM_FEATURES } from './constants';
import { useStripePrices } from './useStripePrices';
import { useIAP } from './useIAP';

// Custom URL scheme registered in app.json (scheme: "legacysports").
const APP_SCHEME = 'legacysports';
const CHECKOUT_SUCCESS_URL = `${APP_SCHEME}://subscription/success`;
const CHECKOUT_CANCEL_URL = `${APP_SCHEME}://subscription/cancel`;
const BILLING_PORTAL_RETURN_URL = `${APP_SCHEME}://subscription/portal-return`;

// Apple subscription management deep link.
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

const BRAND_GOLD = '#B8962E';
const BRAND_GOLD_LIGHT = '#C5A55A';
const BRAND_NAVY_LIGHT = '#2C4A7C';
const BRAND_SEAM_RED = '#C41E3A';

function tierLabel(tier: string | null): string {
  switch (tier) {
    case 'monthly':
      return 'Premium (Monthly)';
    case 'annual':
      return 'Premium (Annual)';
    default:
      return 'Free';
  }
}

function statusBadgeColor(status: string | null): string {
  switch (status) {
    case 'active':
    case 'trialing':
      return 'rgb(34,197,94)';
    case 'past_due':
      return BRAND_SEAM_RED;
    case 'canceled':
    case 'inactive':
      return '$color10';
    default:
      return '$color10';
  }
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

interface BillingToggleProps {
  value: BillingCycle;
  onChange: (v: BillingCycle) => void;
  monthlyPriceDisplay: string;
  annualMonthlyEquivalent: string;
  annualSavingsPct: string;
}

function BillingToggle({
  value,
  onChange,
  monthlyPriceDisplay,
  annualMonthlyEquivalent,
  annualSavingsPct,
}: BillingToggleProps) {
  return (
    <XStack
      borderRadius="$4"
      borderWidth={1}
      borderColor="$borderColor"
      overflow="hidden"
    >
      <YStack
        flex={1}
        alignItems="center"
        paddingVertical="$2"
        backgroundColor={value === 'monthly' ? BRAND_GOLD : '$background'}
        onPress={() => onChange('monthly')}
        pressStyle={{ opacity: 0.85 }}
      >
        <Text
          fontWeight={value === 'monthly' ? '600' : '400'}
          color={value === 'monthly' ? BRAND_NAVY_LIGHT : '$color'}
          fontSize="$3"
        >
          Monthly
        </Text>
        <Text
          fontSize="$2"
          color={value === 'monthly' ? BRAND_NAVY_LIGHT : '$colorSubtle'}
        >
          {monthlyPriceDisplay}/mo
        </Text>
      </YStack>
      <YStack
        flex={1}
        alignItems="center"
        paddingVertical="$2"
        backgroundColor={value === 'annual' ? BRAND_GOLD : '$background'}
        onPress={() => onChange('annual')}
        pressStyle={{ opacity: 0.85 }}
      >
        <XStack alignItems="center" gap="$1">
          <Text
            fontWeight={value === 'annual' ? '600' : '400'}
            color={value === 'annual' ? BRAND_NAVY_LIGHT : '$color'}
            fontSize="$3"
          >
            Annual
          </Text>
          <YStack
            backgroundColor={value === 'annual' ? BRAND_NAVY_LIGHT : BRAND_GOLD}
            borderRadius="$2"
            paddingHorizontal="$1"
          >
            <Text fontSize="$1" color="white" fontWeight="bold">
              -{annualSavingsPct}
            </Text>
          </YStack>
        </XStack>
        <Text
          fontSize="$2"
          color={value === 'annual' ? BRAND_NAVY_LIGHT : '$colorSubtle'}
        >
          {annualMonthlyEquivalent}/mo
        </Text>
      </YStack>
    </XStack>
  );
}

export default function SubscriptionSettingsScreen(): React.JSX.Element {
  const {
    subscription,
    isPremium,
    tier,
    loading: subLoading,
  } = useSubscription();
  const [createCheckoutSession, { loading: checkoutLoading }] =
    useCheckoutSession();
  const [createBillingPortalSession, { loading: portalLoading }] =
    useBillingPortalSession();

  const {
    restorePurchases,
    loading: restoreLoading,
    error: restoreError,
    isSubscribed: restoreSubscribed,
    clearError: clearRestoreError,
  } = useIAP();

  // isSubscribed and error are set asynchronously inside restorePurchases, so
  // reading them synchronously after the await always sees the stale closure
  // value. Track whether a restore was initiated here and surface the outcome
  // via an effect once the hook state settles (mirrors SubscriptionScreen).
  const restoreInitiated = useRef(false);

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual');

  useEffect(() => {
    if (restoreSubscribed && restoreInitiated.current) {
      restoreInitiated.current = false;
      Alert.alert(
        'Purchases Restored',
        'Your subscription has been restored successfully.',
      );
    }
  }, [restoreSubscribed]);

  useEffect(() => {
    if (restoreError && restoreInitiated.current) {
      restoreInitiated.current = false;
      Alert.alert('Restore Purchases', restoreError);
      clearRestoreError();
    }
  }, [restoreError, clearRestoreError]);

  const {
    monthlyPriceDisplay,
    annualPriceDisplay,
    annualMonthlyEquivalent,
    annualSavingsPct,
    monthlyPriceId: stripeMonthlyPriceId,
    annualPriceId: stripeAnnualPriceId,
  } = useStripePrices();

  // Resolve the price ID for the currently selected billing cycle.
  // Used to guard the upgrade flow — null means both the live query and the
  // env-var fallbacks are unavailable, so checkout cannot proceed.
  const selectedPriceId =
    billingCycle === 'annual' ? stripeAnnualPriceId : stripeMonthlyPriceId;

  // The loading state from useStripePrices() is intentionally excluded:
  // useStripePrices returns fallback display values immediately, so there is
  // no need to block the whole UI while the background refetch completes.
  // The selectedPriceId guard in handleUpgrade handles the case where price
  // IDs are genuinely unavailable.
  const isLoading = subLoading || checkoutLoading || portalLoading;

  const handleUpgrade = async () => {
    if (!selectedPriceId) {
      Alert.alert(
        'Subscription unavailable',
        'We could not load the selected subscription price yet. Please try again in a moment.',
      );
      return;
    }

    // iOS: Platform-aware purchase flow.
    if (Platform.OS === 'ios') {
      Alert.alert(
        'Subscribe via App Store',
        "In-App Purchase through the App Store is coming soon. For now, you'll be taken to our website to complete your subscription.",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Continue', onPress: () => void handleStripeCheckout() },
        ],
      );
      return;
    }

    await handleStripeCheckout();
  };

  const handleStripeCheckout = async () => {
    const priceId = selectedPriceId;

    if (!priceId) {
      Alert.alert(
        'Unavailable',
        'Subscription purchase is not available right now. Please try again later.',
      );
      return;
    }

    try {
      const result = await createCheckoutSession({
        variables: {
          priceId,
          successUrl: CHECKOUT_SUCCESS_URL,
          cancelUrl: CHECKOUT_CANCEL_URL,
        },
      });
      const url = result.data?.createCheckoutSession?.url;
      if (url) {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Error', 'Unable to start checkout. Please try again.');
    }
  };

  const handleManageSubscription = async () => {
    // For iOS subscribers with an Apple IAP subscription, open Apple's
    // subscription management page. For Stripe subscribers, open the billing
    // portal.
    if (Platform.OS === 'ios') {
      try {
        const result = await createBillingPortalSession({
          variables: { returnUrl: BILLING_PORTAL_RETURN_URL },
        });
        const url = result.data?.createBillingPortalSession?.url;
        if (url) {
          await Linking.openURL(url);
          return;
        }
      } catch {
        // Fall through to Apple subscriptions page for iOS users who may have
        // subscribed through the App Store (LS-835).
      }
      await Linking.openURL(APPLE_SUBSCRIPTIONS_URL);
      return;
    }

    try {
      const result = await createBillingPortalSession({
        variables: { returnUrl: BILLING_PORTAL_RETURN_URL },
      });
      const url = result.data?.createBillingPortalSession?.url;
      if (url) {
        await Linking.openURL(url);
      }
    } catch {
      Alert.alert('Error', 'Unable to open billing portal. Please try again.');
    }
  };

  const handleRestorePurchases = async () => {
    if (Platform.OS !== 'ios') {
      Alert.alert(
        'Restore Purchases',
        'Purchase restoration is only available on iOS. On other platforms, your subscription is automatically linked to your account.',
      );
      return;
    }
    // Restore via StoreKit and sync the receipt server-side through the
    // restoreApplePurchases mutation. Opening the Apple subscriptions website
    // (the previous behavior) never restored premium access on this account.
    clearRestoreError();
    restoreInitiated.current = true;
    await restorePurchases();
  };

  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$6"
        backgroundColor="$background"
        minHeight="100%"
      >
        {/* Header */}
        <YStack gap="$2" paddingVertical="$4">
          <H1
            style={{ fontSize: 32, fontWeight: '700', color: BRAND_GOLD_LIGHT }}
          >
            Subscription & Billing
          </H1>
          <Paragraph size="$4" color="$colorPress">
            Manage your Legacy Sports Premium membership.
          </Paragraph>
        </YStack>

        {/* Current Status Card */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={16}>💎</Text>
            </YStack>
            <YStack flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="600">
                Current Plan
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                Your active subscription tier
              </Paragraph>
            </YStack>
          </XStack>

          <YStack padding="$5" gap="$4">
            <XStack alignItems="center" justifyContent="space-between">
              <Text fontSize="$5" fontWeight="700" color={BRAND_GOLD_LIGHT}>
                {tierLabel(tier)}
              </Text>
              {subscription?.status ? (
                <XStack
                  alignItems="center"
                  gap="$2"
                  paddingHorizontal="$3"
                  paddingVertical="$1"
                  borderRadius="$10"
                  borderWidth={1}
                  borderColor={`${statusBadgeColor(subscription.status)}44`}
                  backgroundColor={`${statusBadgeColor(subscription.status)}1A`}
                >
                  <YStack
                    width={8}
                    height={8}
                    borderRadius={4}
                    backgroundColor={statusBadgeColor(subscription.status)}
                  />
                  <Paragraph
                    size="$2"
                    fontWeight="600"
                    textTransform="capitalize"
                  >
                    {subscription.status.replace('_', ' ')}
                  </Paragraph>
                </XStack>
              ) : null}
            </XStack>

            {subscription?.currentPeriodEnd ? (
              <XStack alignItems="center" gap="$4">
                <Paragraph
                  size="$3"
                  color="$colorPress"
                  fontWeight="500"
                  width={120}
                >
                  {subscription.cancelAtPeriodEnd ? 'Cancels on' : 'Renews on'}
                </Paragraph>
                <Paragraph size="$4" color="$color" flex={1}>
                  {formatDate(subscription.currentPeriodEnd)}
                </Paragraph>
              </XStack>
            ) : null}

            {subscription?.cancelAtPeriodEnd ? (
              <XStack
                alignItems="flex-start"
                gap="$3"
                padding="$3"
                borderRadius="$4"
                borderWidth={1}
                borderColor={`${BRAND_SEAM_RED}44`}
                backgroundColor={`${BRAND_SEAM_RED}1A`}
              >
                <Text fontSize={14}>⚠️</Text>
                <Paragraph size="$3" color={BRAND_SEAM_RED} flex={1}>
                  Your subscription is set to cancel at the end of the current
                  billing period.
                </Paragraph>
              </XStack>
            ) : null}

            {subscription?.gracePeriodEndsAt ? (
              <XStack
                alignItems="flex-start"
                gap="$3"
                padding="$3"
                borderRadius="$4"
                borderWidth={1}
                borderColor={`${BRAND_SEAM_RED}44`}
                backgroundColor={`${BRAND_SEAM_RED}1A`}
              >
                <Text fontSize={14}>⚠️</Text>
                <Paragraph size="$3" color={BRAND_SEAM_RED} flex={1}>
                  Payment issue detected. Access continues until{' '}
                  {formatDate(subscription.gracePeriodEndsAt)}. Please update
                  your payment method.
                </Paragraph>
              </XStack>
            ) : null}

            {/* Action buttons */}
            {isPremium ? (
              <Button
                theme="alt1"
                disabled={isLoading}
                onPress={() => void handleManageSubscription()}
                borderRadius="$4"
              >
                {portalLoading ? 'Opening…' : 'Manage Subscription'}
              </Button>
            ) : null}
          </YStack>
        </YStack>

        {/* Upgrade Section (free users only) */}
        {!isPremium ? (
          <YStack
            borderRadius="$6"
            borderWidth={1}
            borderColor={`${BRAND_GOLD}4D`}
            overflow="hidden"
          >
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$4"
              alignItems="center"
              gap="$3"
              borderBottomWidth={1}
              borderBottomColor={`${BRAND_GOLD}33`}
              backgroundColor={`${BRAND_GOLD}14`}
            >
              <YStack
                width={36}
                height={36}
                borderRadius="$4"
                alignItems="center"
                justifyContent="center"
                backgroundColor={`${BRAND_GOLD}33`}
              >
                <Text fontSize={16}>⭐</Text>
              </YStack>
              <YStack flex={1}>
                <Paragraph size="$4" color={BRAND_GOLD} fontWeight="600">
                  Upgrade to Premium
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Unlock unlimited leagues and advanced features
                </Paragraph>
              </YStack>
            </XStack>

            <YStack padding="$5" gap="$4">
              <BillingToggle
                value={billingCycle}
                onChange={setBillingCycle}
                monthlyPriceDisplay={monthlyPriceDisplay}
                annualMonthlyEquivalent={annualMonthlyEquivalent}
                annualSavingsPct={annualSavingsPct}
              />

              {billingCycle === 'annual' ? (
                <YStack alignItems="center" gap="$1">
                  <Text fontSize="$7" fontWeight="700" color={BRAND_GOLD}>
                    {annualPriceDisplay}
                    <Text fontSize="$4" fontWeight="400" color="$colorSubtle">
                      /yr
                    </Text>
                  </Text>
                  <Text fontSize="$3" color="$colorSubtle">
                    {annualMonthlyEquivalent}/mo · Save {annualSavingsPct}
                  </Text>
                </YStack>
              ) : (
                <YStack alignItems="center">
                  <Text fontSize="$7" fontWeight="700" color={BRAND_GOLD}>
                    {monthlyPriceDisplay}
                    <Text fontSize="$4" fontWeight="400" color="$colorSubtle">
                      /mo
                    </Text>
                  </Text>
                </YStack>
              )}

              <Button
                disabled={isLoading}
                onPress={() => void handleUpgrade()}
                backgroundColor={BRAND_GOLD}
                borderRadius="$4"
                pressStyle={{ opacity: 0.85, scale: 0.98 }}
              >
                <Text color={BRAND_NAVY_LIGHT} fontWeight="700" fontSize="$4">
                  {checkoutLoading
                    ? 'Opening…'
                    : `Upgrade — ${billingCycle === 'annual' ? annualPriceDisplay + '/yr' : monthlyPriceDisplay + '/mo'}`}
                </Text>
              </Button>

              <Text fontSize="$2" color="$colorSubtle" textAlign="center">
                Cancel anytime. No commitment required.
              </Text>
            </YStack>
          </YStack>
        ) : null}

        {/* Feature Comparison */}
        <YStack
          borderRadius="$6"
          borderWidth={1}
          borderColor="$borderColor"
          overflow="hidden"
        >
          <XStack
            paddingHorizontal="$5"
            paddingVertical="$4"
            alignItems="center"
            gap="$3"
            borderBottomWidth={1}
            borderBottomColor="$borderColor"
          >
            <YStack
              width={36}
              height={36}
              borderRadius="$4"
              alignItems="center"
              justifyContent="center"
              backgroundColor="$color2"
            >
              <Text fontSize={16}>📊</Text>
            </YStack>
            <YStack flex={1}>
              <Paragraph size="$4" color="$color" fontWeight="600">
                What's Included
              </Paragraph>
              <Paragraph size="$2" color="$colorPress">
                Free vs Premium feature comparison
              </Paragraph>
            </YStack>
          </XStack>

          <YStack padding="$5" gap="$1">
            <XStack paddingHorizontal="$2" paddingBottom="$3">
              <Text flex={1} fontSize="$3" color="$colorSubtle" />
              <Text
                width={60}
                textAlign="center"
                fontSize="$3"
                color="$colorSubtle"
                fontWeight="600"
              >
                Free
              </Text>
              <Text
                width={80}
                textAlign="center"
                fontSize="$3"
                color={BRAND_GOLD}
                fontWeight="600"
              >
                Premium
              </Text>
            </XStack>
            {PREMIUM_FEATURES.map((feature, i) => (
              <React.Fragment key={feature.label}>
                {i > 0 ? <Separator /> : null}
                <XStack
                  paddingVertical="$3"
                  paddingHorizontal="$2"
                  alignItems="center"
                >
                  <Text flex={1} fontSize="$3" color="$color">
                    {feature.label}
                  </Text>
                  <Text width={60} textAlign="center" fontSize="$4">
                    {feature.free ? '✓' : '—'}
                  </Text>
                  <Text
                    width={80}
                    textAlign="center"
                    fontSize="$4"
                    color={BRAND_GOLD}
                  >
                    {feature.premium ? '✓' : '—'}
                  </Text>
                </XStack>
              </React.Fragment>
            ))}
          </YStack>
        </YStack>

        {/* Restore Purchases (iOS only) */}
        {Platform.OS === 'ios' ? (
          <YStack
            borderRadius="$6"
            borderWidth={1}
            borderColor="$borderColor"
            overflow="hidden"
          >
            <XStack
              paddingHorizontal="$5"
              paddingVertical="$4"
              alignItems="center"
              gap="$3"
              borderBottomWidth={1}
              borderBottomColor="$borderColor"
            >
              <YStack
                width={36}
                height={36}
                borderRadius="$4"
                alignItems="center"
                justifyContent="center"
                backgroundColor="$color2"
              >
                <Text fontSize={16}>🔄</Text>
              </YStack>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Restore Purchases
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Recover a subscription purchased on another device
                </Paragraph>
              </YStack>
            </XStack>

            <YStack padding="$5" gap="$3">
              <Paragraph size="$3" color="$colorPress">
                If you previously subscribed via the App Store on another
                device, tap below to restore your access.
              </Paragraph>
              <Button
                theme="alt1"
                disabled={restoreLoading}
                onPress={() => void handleRestorePurchases()}
                borderRadius="$4"
              >
                {restoreLoading ? 'Restoring…' : 'Restore Purchases'}
              </Button>
              <Text fontSize="$2" color="$color10" textAlign="center">
                Subscriptions auto-renew unless canceled at least 24 hours
                before the end of the billing period. Manage in your Apple ID
                settings.
              </Text>
            </YStack>
          </YStack>
        ) : null}
      </YStack>
    </ScrollView>
  );
}

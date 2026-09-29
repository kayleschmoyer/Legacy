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
import { useLocalSearchParams } from 'expo-router';
import { useStepUpGate } from '@legacy-sports/shared-components/auth';
import { brand } from '@legacy-sports/design-tokens';
import {
  useBillingPortalSession,
  useCheckoutSession,
  useSubscription,
} from './useSubscription';
import {
  ACTIVATION_MAX_POLLS,
  ACTIVATION_POLL_INTERVAL_MS,
  BillingCycle,
  PREMIUM_FEATURES,
} from './constants';
import { useStripePrices } from './useStripePrices';
import { useIAP } from './useIAP';
import { StepUpModal } from './StepUpModal';
import { useCurrentUserInfo } from '../../common/auth/AuthHooks';

// Custom URL scheme registered in app.json (scheme: "legacysports").
const APP_SCHEME = 'legacysports';
const CHECKOUT_SUCCESS_URL = `${APP_SCHEME}://subscription/success`;
const CHECKOUT_CANCEL_URL = `${APP_SCHEME}://subscription/cancel`;
const BILLING_PORTAL_RETURN_URL = `${APP_SCHEME}://subscription/portal-return`;

// Apple subscription management deep link.
const APPLE_SUBSCRIPTIONS_URL = 'https://apps.apple.com/account/subscriptions';

function tierLabel(tier: string | null): string {
  switch (tier) {
    case 'premium':
      return 'Premium';
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
      return brand.seamRed;
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
        backgroundColor={value === 'monthly' ? brand.gold : '$background'}
        onPress={() => onChange('monthly')}
        pressStyle={{ opacity: 0.85 }}
      >
        <Text
          fontWeight={value === 'monthly' ? '600' : '400'}
          color={value === 'monthly' ? brand.navyLight : '$color'}
          fontSize="$3"
        >
          Monthly
        </Text>
        <Text
          fontSize="$2"
          color={value === 'monthly' ? brand.navyLight : '$colorSubtle'}
        >
          {monthlyPriceDisplay}/mo
        </Text>
      </YStack>
      <YStack
        flex={1}
        alignItems="center"
        paddingVertical="$2"
        backgroundColor={value === 'annual' ? brand.gold : '$background'}
        onPress={() => onChange('annual')}
        pressStyle={{ opacity: 0.85 }}
      >
        <XStack alignItems="center" gap="$1">
          <Text
            fontWeight={value === 'annual' ? '600' : '400'}
            color={value === 'annual' ? brand.navyLight : '$color'}
            fontSize="$3"
          >
            Annual
          </Text>
          <YStack
            backgroundColor={value === 'annual' ? brand.navyLight : brand.gold}
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
          color={value === 'annual' ? brand.navyLight : '$colorSubtle'}
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
    refetch,
  } = useSubscription();
  const [createCheckoutSession, { loading: checkoutLoading }] =
    useCheckoutSession();
  const [createBillingPortalSession, { loading: portalLoading }] =
    useBillingPortalSession();

  const { data: currentUser } = useCurrentUserInfo();
  const {
    isPrompting: isStepUpPrompting,
    requireStepUp,
    onVerified: onStepUpVerified,
    onDismiss: onStepUpDismiss,
  } = useStepUpGate();

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

  // `checkoutLoading` only flips after Apollo starts the mutation, so a second
  // tap (or a double-tap on the iOS Alert's "Continue") can slip in before the
  // Upgrade button is disabled. This ref is a synchronous re-entrancy lock.
  const checkoutSubmittingRef = useRef(false);

  const [billingCycle, setBillingCycle] = useState<BillingCycle>('annual');

  // `checkout` is set by the `+native-intent` rewrite of the Stripe return deep
  // links (`legacysports://subscription/success|cancel|portal-return`).
  const { checkout } = useLocalSearchParams<{ checkout?: string }>();

  // Post-checkout activation window: the Stripe webhook that flips the tier to
  // premium lands seconds after the redirect, so poll instead of rendering the
  // stale "Free" plan the first query returns.
  const [activating, setActivating] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  // The param survives re-renders, so guard against restarting the window (or
  // re-refetching) every time this screen re-renders.
  const checkoutHandled = useRef(false);

  useEffect(() => {
    if (checkoutHandled.current) return;
    if (checkout === 'success') {
      checkoutHandled.current = true;
      setActivating(true);
      setPollAttempt(0);
      void refetch();
    } else if (checkout === 'portal-return') {
      // Returning from the billing portal: the plan may have changed there, so
      // refetch once. No activation window — nothing is pending server-side.
      checkoutHandled.current = true;
      void refetch();
    }
  }, [checkout, refetch]);

  useEffect(() => {
    if (!activating) return;
    // The webhook landed — close the window and show the premium plan.
    if (isPremium) {
      setActivating(false);
      return;
    }
    // Retry budget exhausted: stop polling and fall back to the normal view
    // rather than spinning forever.
    if (pollAttempt >= ACTIVATION_MAX_POLLS) {
      setActivating(false);
      return;
    }
    const timer = setTimeout(() => {
      void refetch();
      // Bumping the attempt re-runs this effect, which schedules the next poll.
      setPollAttempt((attempt) => attempt + 1);
    }, ACTIVATION_POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [activating, isPremium, pollAttempt, refetch]);

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

  const handleUpgradeAction = async () => {
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

  const handleUpgrade = () => {
    requireStepUp(() => void handleUpgradeAction());
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

    if (checkoutSubmittingRef.current) return;
    checkoutSubmittingRef.current = true;

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
    } finally {
      checkoutSubmittingRef.current = false;
    }
  };

  const handleManageSubscriptionAction = async () => {
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

  const handleManageSubscription = () => {
    requireStepUp(() => void handleManageSubscriptionAction());
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
    <>
      {isStepUpPrompting && (
        <StepUpModal
          onSuccess={onStepUpVerified}
          onDismiss={onStepUpDismiss}
          mfaEnabled={currentUser?.mfaEnabled ?? false}
          hasPassword={currentUser?.hasPassword ?? true}
        />
      )}
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
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: brand.goldLight,
              }}
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
                <Text fontSize="$5" fontWeight="700" color={brand.goldLight}>
                  {activating ? 'Activating…' : tierLabel(tier)}
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

              {subscription?.trialEndsAt ? (
                <XStack alignItems="center" gap="$4">
                  <Paragraph
                    size="$3"
                    color="$colorPress"
                    fontWeight="500"
                    width={120}
                  >
                    Trial ends on
                  </Paragraph>
                  <Paragraph size="$4" color="$color" flex={1}>
                    {formatDate(subscription.trialEndsAt)}
                  </Paragraph>
                </XStack>
              ) : null}

              {subscription?.currentPeriodEnd ? (
                <XStack alignItems="center" gap="$4">
                  <Paragraph
                    size="$3"
                    color="$colorPress"
                    fontWeight="500"
                    width={120}
                  >
                    {subscription.cancelAtPeriodEnd
                      ? 'Cancels on'
                      : 'Renews on'}
                  </Paragraph>
                  <Paragraph size="$4" color="$color" flex={1}>
                    {formatDate(subscription.currentPeriodEnd)}
                  </Paragraph>
                </XStack>
              ) : null}

              {subscription?.cancelAtPeriodEnd ||
              subscription?.gracePeriodEndsAt ? (
                <XStack
                  alignItems="flex-start"
                  gap="$3"
                  padding="$3"
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor={`${brand.seamRed}44`}
                  backgroundColor={`${brand.seamRed}1A`}
                >
                  <Text fontSize={14}>⚠️</Text>
                  <Paragraph size="$3" color={brand.seamRed} flex={1}>
                    {subscription.cancelAtPeriodEnd &&
                    subscription.gracePeriodEndsAt ? (
                      <>
                        Subscription is past due and set to cancel — update your
                        payment to renew, or it will be canceled on{' '}
                        {formatDate(subscription.currentPeriodEnd)}.
                      </>
                    ) : subscription.cancelAtPeriodEnd ? (
                      <>
                        Your subscription is set to cancel at the end of the
                        current billing period.
                      </>
                    ) : (
                      <>
                        Payment issue detected. Access continues until{' '}
                        {formatDate(subscription.gracePeriodEndsAt)}. Please
                        update your payment method.
                      </>
                    )}
                  </Paragraph>
                </XStack>
              ) : null}

              {activating ? (
                <XStack
                  alignItems="flex-start"
                  gap="$3"
                  padding="$3"
                  borderRadius="$4"
                  borderWidth={1}
                  borderColor={`${brand.gold}44`}
                  backgroundColor={`${brand.gold}1A`}
                >
                  <Text fontSize={14}>⏳</Text>
                  <Paragraph size="$3" color={brand.gold} flex={1}>
                    Payment received. Activating your Premium membership — this
                    usually takes a few seconds.
                  </Paragraph>
                </XStack>
              ) : null}

              {/* Action buttons */}
              {isPremium ? (
                <Button
                  theme="alt1"
                  disabled={isLoading}
                  onPress={handleManageSubscription}
                  borderRadius="$4"
                >
                  {portalLoading ? 'Opening…' : 'Manage Subscription'}
                </Button>
              ) : null}
            </YStack>
          </YStack>

          {/* Upgrade Section (free users only) — hidden during the activation
              window so a buyer who just paid is not prompted to pay again. */}
          {!isPremium && !activating ? (
            <YStack
              borderRadius="$6"
              borderWidth={1}
              borderColor={`${brand.gold}4D`}
              overflow="hidden"
            >
              <XStack
                paddingHorizontal="$5"
                paddingVertical="$4"
                alignItems="center"
                gap="$3"
                borderBottomWidth={1}
                borderBottomColor={`${brand.gold}33`}
                backgroundColor={`${brand.gold}14`}
              >
                <YStack
                  width={36}
                  height={36}
                  borderRadius="$4"
                  alignItems="center"
                  justifyContent="center"
                  backgroundColor={`${brand.gold}33`}
                >
                  <Text fontSize={16}>⭐</Text>
                </YStack>
                <YStack flex={1}>
                  <Paragraph size="$4" color={brand.gold} fontWeight="600">
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
                    <Text fontSize="$7" fontWeight="700" color={brand.gold}>
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
                    <Text fontSize="$7" fontWeight="700" color={brand.gold}>
                      {monthlyPriceDisplay}
                      <Text fontSize="$4" fontWeight="400" color="$colorSubtle">
                        /mo
                      </Text>
                    </Text>
                  </YStack>
                )}

                <Button
                  disabled={isLoading}
                  onPress={handleUpgrade}
                  backgroundColor={brand.gold}
                  borderRadius="$4"
                  pressStyle={{ opacity: 0.85, scale: 0.98 }}
                >
                  <Text color={brand.navyLight} fontWeight="700" fontSize="$4">
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

          {/* Feature Comparison (non-Premium only) */}
          {!isPremium ? (
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
                    color={brand.gold}
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
                      <Text
                        width={60}
                        textAlign="center"
                        fontSize="$4"
                        accessibilityRole="text"
                        accessibilityLabel={`${feature.label}: ${feature.free ? 'Included' : 'Not included'} on Free`}
                      >
                        {feature.free ? '✓' : '—'}
                      </Text>
                      <Text
                        width={80}
                        textAlign="center"
                        fontSize="$4"
                        color={brand.gold}
                        accessibilityRole="text"
                        accessibilityLabel={`${feature.label}: ${feature.premium ? 'Included' : 'Not included'} on Premium`}
                      >
                        {feature.premium ? '✓' : '—'}
                      </Text>
                    </XStack>
                  </React.Fragment>
                ))}
              </YStack>
            </YStack>
          ) : null}

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
    </>
  );
}

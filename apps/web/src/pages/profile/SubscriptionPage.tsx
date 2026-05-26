import React, { useEffect, useState } from 'react';
import {
  H1,
  Paragraph,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { Button, ScrollView, Separator, styled } from 'tamagui';
import {
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Crown,
  RefreshCw,
  Zap,
} from '@tamagui/lucide-icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { LOGGER } from '@legacy-sports/logging';
import { PageMeta } from '../../components/PageMeta';
import {
  useCreateBillingPortalSessionMutation,
  useCreateCheckoutSessionMutation,
  useGetMySubscriptionQuery,
} from '../../api/db/graphql.generated';
import {
  AMBER,
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_GOLD_PRESS,
  BRAND_NAVY,
  BRAND_NAVY_LIGHT,
  EMERALD,
  GREEN,
  RED,
  SURFACE_PANEL,
  withAlpha,
} from '../../constants/colors';
import { useStripePrices } from '../../hooks/useStripePrices';
import {
  trackBeginCheckout,
  trackPurchase,
  trackSubscriptionStarted,
} from '../../utils/analytics';

const PREMIUM_FEATURES: { label: string; free: boolean; premium: boolean }[] = [
  { label: 'Join up to 3 leagues', free: true, premium: true },
  { label: 'Unlimited active leagues', free: false, premium: true },
  { label: 'Salary cap leagues', free: false, premium: true },
  {
    label: 'Advanced playoff formats (6-team, 8-team)',
    free: false,
    premium: true,
  },
  { label: 'Unlimited mock drafts', free: false, premium: true },
  { label: 'FAAB waivers', free: false, premium: true },
  { label: 'Historical era filters', free: false, premium: true },
];

/* ─── Styled Components ─── */

const PageContainer = styled(YStack, {
  flex: 1,
  minHeight: '100vh',
  backgroundColor: '$background',
  paddingBottom: '$10',
});

const ContentContainer = styled(YStack, {
  maxWidth: 800,
  width: '100%',
  alignSelf: 'center',
  paddingHorizontal: '$5',
  gap: '$6',
  $sm: {
    paddingHorizontal: '$3',
    gap: '$4',
  },
});

const PageHeader = styled(YStack, {
  paddingVertical: '$8',
  gap: '$2',
  $sm: { paddingVertical: '$6' },
});

const SectionCard = styled(YStack, {
  borderRadius: '$6',
  borderWidth: 1,
  borderColor: '$glassBorder',
  overflow: 'hidden',
});

const SectionHeader = styled(XStack, {
  paddingHorizontal: '$5',
  paddingVertical: '$4',
  alignItems: 'center',
  gap: '$3',
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

const SectionIconBox = styled(YStack, {
  width: 36,
  height: 36,
  borderRadius: '$4',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '$color2',
});

const SectionBody = styled(YStack, {
  padding: '$5',
  gap: '$4',
  $sm: { padding: '$4' },
});

const PlanToggleButton = styled(Button, {
  flex: 1,
  size: '$3',
  borderRadius: '$4',
  borderWidth: 1,
  borderColor: 'transparent',
  backgroundColor: 'transparent',
  variants: {
    active: {
      true: {
        borderColor: BRAND_GOLD,
        backgroundColor: withAlpha(BRAND_GOLD, 0.12),
      },
    },
  } as const,
});

const FeatureRow = styled(XStack, {
  alignItems: 'center',
  paddingVertical: '$2',
  gap: '$3',
  borderBottomWidth: 1,
  borderBottomColor: '$glassBorder',
});

const CtaButton = styled(Button, {
  borderRadius: '$5',
  size: '$4',
  fontWeight: '600',
  pressStyle: { scale: 0.98 },
  hoverStyle: { opacity: 0.9 },
});

const BadgeTag = styled(XStack, {
  alignItems: 'center',
  paddingHorizontal: '$3',
  paddingVertical: '$1',
  borderRadius: '$10',
  borderWidth: 1,
  gap: '$2',
});

/* ─── Page Background ─── */

const pageBackgroundStyle: React.CSSProperties = {
  background: `
    radial-gradient(ellipse at 15% 0%, ${withAlpha(BRAND_NAVY, 0.16)} 0%, transparent 50%),
    radial-gradient(ellipse at 85% 5%, ${withAlpha(BRAND_GOLD, 0.06)} 0%, transparent 45%)
  `,
  backgroundAttachment: 'fixed',
};

const cardPanelStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 100%)`,
};

const goldCardStyle: React.CSSProperties = {
  background: `linear-gradient(135deg, ${withAlpha(BRAND_GOLD, 0.08)} 0%, ${withAlpha(BRAND_GOLD_PRESS, 0.04)} 100%)`,
  backgroundColor: SURFACE_PANEL,
};

/* ─── Helpers ─── */

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'past_due':
      return 'Past Due';
    case 'canceled':
      return 'Canceled';
    case 'trialing':
      return 'Trial';
    default:
      return status;
  }
}

function getTierLabel(tier: string): string {
  switch (tier) {
    case 'monthly':
      return 'Premium (Monthly)';
    case 'annual':
      return 'Premium (Annual)';
    default:
      return 'Premium';
  }
}

/* ─── Sub-Components ─── */

function PastDueBanner({
  onRetry,
  loading,
}: {
  onRetry: () => void;
  loading: boolean;
}) {
  return (
    <SectionCard
      style={{
        background: withAlpha(AMBER, 0.08),
        borderColor: withAlpha(AMBER, 0.35),
      }}
    >
      <XStack
        padding="$4"
        gap="$3"
        alignItems="flex-start"
        $sm={{ flexDirection: 'column', gap: '$3' }}
      >
        <AlertTriangle size={20} color={AMBER} flexShrink={0} marginTop={2} />
        <YStack flex={1} gap="$1">
          <Paragraph
            size="$4"
            fontWeight="600"
            style={{ color: AMBER } as React.CSSProperties}
          >
            Payment Past Due
          </Paragraph>
          <Paragraph size="$3" color="$colorPress">
            Your payment failed. Please update your payment method to keep your
            Premium access.
          </Paragraph>
        </YStack>
        <CtaButton
          backgroundColor={AMBER}
          color="white"
          onPress={onRetry}
          disabled={loading}
          icon={loading ? <RefreshCw size={16} /> : undefined}
          flexShrink={0}
        >
          {loading ? 'Loading...' : 'Fix Payment'}
        </CtaButton>
      </XStack>
    </SectionCard>
  );
}

function PricingToggle({
  billingCycle,
  onChange,
  annualSavingsPct,
}: {
  billingCycle: 'monthly' | 'annual';
  onChange: (cycle: 'monthly' | 'annual') => void;
  annualSavingsPct: string;
}) {
  return (
    <YStack alignItems="center" gap="$3">
      <XStack
        borderWidth={1}
        borderColor="$glassBorder"
        borderRadius="$5"
        padding="$1"
        gap="$1"
        backgroundColor="$color2"
        width={280}
      >
        <PlanToggleButton
          active={billingCycle === 'monthly'}
          onPress={() => onChange('monthly')}
        >
          <Paragraph
            size="$3"
            fontWeight={billingCycle === 'monthly' ? '600' : '400'}
            style={
              billingCycle === 'monthly'
                ? ({ color: BRAND_GOLD_LIGHT } as React.CSSProperties)
                : undefined
            }
          >
            Monthly
          </Paragraph>
        </PlanToggleButton>
        <PlanToggleButton
          active={billingCycle === 'annual'}
          onPress={() => onChange('annual')}
        >
          <XStack alignItems="center" gap="$2">
            <Paragraph
              size="$3"
              fontWeight={billingCycle === 'annual' ? '600' : '400'}
              style={
                billingCycle === 'annual'
                  ? ({ color: BRAND_GOLD_LIGHT } as React.CSSProperties)
                  : undefined
              }
            >
              Annual
            </Paragraph>
            <BadgeTag
              backgroundColor={withAlpha(GREEN, 0.15)}
              borderColor={withAlpha(GREEN, 0.35)}
              paddingHorizontal="$2"
              paddingVertical={2}
            >
              <Paragraph
                size="$1"
                fontWeight="600"
                style={{ color: GREEN } as React.CSSProperties}
              >
                Save {annualSavingsPct}
              </Paragraph>
            </BadgeTag>
          </XStack>
        </PlanToggleButton>
      </XStack>
    </YStack>
  );
}

function FeatureComparisonTable() {
  return (
    <YStack>
      {/* Header row */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        gap="$3"
        borderBottomWidth={1}
        borderBottomColor="$glassBorder"
        backgroundColor={withAlpha(BRAND_NAVY, 0.15)}
      >
        <Paragraph size="$3" color="$colorPress" fontWeight="600" flex={1}>
          Feature
        </Paragraph>
        <Paragraph
          size="$3"
          color="$colorPress"
          fontWeight="600"
          width={70}
          textAlign="center"
        >
          Free
        </Paragraph>
        <Paragraph
          size="$3"
          fontWeight="700"
          width={80}
          textAlign="center"
          style={{ color: BRAND_GOLD_LIGHT } as React.CSSProperties}
        >
          Premium
        </Paragraph>
      </XStack>

      {/* Feature rows */}
      {PREMIUM_FEATURES.map((feature, idx) => (
        <FeatureRow
          key={feature.label}
          paddingHorizontal="$4"
          backgroundColor={
            idx % 2 === 0 ? 'transparent' : withAlpha(BRAND_NAVY, 0.06)
          }
        >
          <Paragraph size="$3" color="$color" flex={1}>
            {feature.label}
          </Paragraph>
          <YStack width={70} alignItems="center">
            {feature.free ? (
              <CheckCircle2 size={18} color={EMERALD} />
            ) : (
              <Paragraph size="$4" color="$glassBorder">
                —
              </Paragraph>
            )}
          </YStack>
          <YStack width={80} alignItems="center">
            {feature.premium ? (
              <CheckCircle2 size={18} color={BRAND_GOLD} />
            ) : (
              <Paragraph size="$4" color="$glassBorder">
                —
              </Paragraph>
            )}
          </YStack>
        </FeatureRow>
      ))}
    </YStack>
  );
}

/* ─── Cancel Confirm Dialog ─── */

function CancelConfirmDialog({
  onConfirm,
  onDismiss,
  loading,
}: {
  onConfirm: () => void;
  onDismiss: () => void;
  loading: boolean;
}) {
  return (
    <YStack
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      alignItems="center"
      justifyContent="center"
      zIndex={1000}
      style={{ backgroundColor: 'rgba(0,0,0,0.6)' } as React.CSSProperties}
    >
      <SectionCard
        maxWidth={480}
        width="90%"
        style={{
          background: `linear-gradient(135deg, ${BG_DARK} 0%, ${BRAND_NAVY} 100%)`,
        }}
      >
        <SectionHeader>
          <SectionIconBox
            backgroundColor={withAlpha(RED, 0.12)}
            style={{ borderColor: withAlpha(RED, 0.25) } as React.CSSProperties}
          >
            <AlertTriangle size={18} color={RED} />
          </SectionIconBox>
          <YStack flex={1}>
            <Paragraph size="$4" color="$color" fontWeight="600">
              Cancel Subscription?
            </Paragraph>
            <Paragraph size="$2" color="$colorPress">
              Your access will end at the current billing period
            </Paragraph>
          </YStack>
        </SectionHeader>
        <SectionBody gap="$5">
          <YStack gap="$3">
            <Paragraph size="$3" color="$colorPress">
              If you cancel, you&apos;ll lose access to:
            </Paragraph>
            <YStack gap="$2">
              {PREMIUM_FEATURES.filter((f) => !f.free).map((feature) => (
                <XStack key={feature.label} alignItems="center" gap="$2">
                  <AlertTriangle size={14} color={AMBER} />
                  <Paragraph size="$3" color="$color">
                    {feature.label}
                  </Paragraph>
                </XStack>
              ))}
            </YStack>
            <Paragraph size="$3" color="$colorPress">
              You can resubscribe at any time to restore access.
            </Paragraph>
          </YStack>

          <Separator />

          <XStack gap="$3" justifyContent="flex-end">
            <CtaButton
              backgroundColor="$color3"
              color="$color"
              onPress={onDismiss}
              disabled={loading}
            >
              Keep Premium
            </CtaButton>
            <CtaButton
              backgroundColor={withAlpha(RED, 0.15)}
              borderWidth={1}
              borderColor={withAlpha(RED, 0.35)}
              onPress={onConfirm}
              disabled={loading}
              style={{ color: RED } as React.CSSProperties}
            >
              {loading ? 'Processing...' : 'Confirm Cancel'}
            </CtaButton>
          </XStack>
        </SectionBody>
      </SectionCard>
    </YStack>
  );
}

/* ─── Main Component ─── */

const SubscriptionPage: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>(
    'annual',
  );
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const {
    monthlyPrice: MONTHLY_PRICE,
    annualTotal: ANNUAL_TOTAL,
    monthlyPriceDisplay: MONTHLY_PRICE_DISPLAY,
    annualPriceDisplay: ANNUAL_PRICE_DISPLAY,
    annualMonthlyEquivalent: ANNUAL_MONTHLY_EQUIVALENT,
    annualSavingsPct: ANNUAL_SAVINGS_PCT,
    monthlyPriceId,
    annualPriceId,
  } = useStripePrices();

  const { data, loading, refetch } = useGetMySubscriptionQuery();
  const subscription = data?.mySubscription ?? null;

  // Track whether this page load was a successful checkout return so the
  // refetch effect below survives the searchParams change caused by navigate().
  const [checkoutJustCompleted, setCheckoutJustCompleted] = useState(false);

  useEffect(() => {
    const checkoutStatus = searchParams.get('checkout');
    if (checkoutStatus !== 'success') return;

    const sessionId = searchParams.get('session_id') ?? `client_${Date.now()}`;
    const alreadyTracked =
      sessionStorage.getItem('tracked_purchase_session_id') === sessionId;
    if (!alreadyTracked) {
      const storedCycle = (sessionStorage.getItem('upgrade_billing_cycle') ??
        'monthly') as 'monthly' | 'annual';
      const value = storedCycle === 'annual' ? ANNUAL_TOTAL : MONTHLY_PRICE;
      trackPurchase(storedCycle, value, sessionId);
      trackSubscriptionStarted('premium');
      sessionStorage.setItem('tracked_purchase_session_id', sessionId);
      sessionStorage.removeItem('upgrade_billing_cycle');
    }
    // Remove query params to prevent re-tracking on refresh/back/forward.
    // This changes searchParams, which would re-trigger this effect — but the
    // next run exits early because checkout !== 'success', so it's safe.
    navigate('/profile/subscription', { replace: true });
    setCheckoutJustCompleted(true);
  }, [searchParams, navigate, ANNUAL_TOTAL, MONTHLY_PRICE]);

  // Separated from the searchParams effect so navigate() doesn't cancel the
  // delayed retry: when searchParams changes, only the effect above re-runs.
  useEffect(() => {
    if (!checkoutJustCompleted) return;
    // Refetch immediately, then again after 3 s — Stripe webhooks are async so
    // the DB may not have updated by the time the redirect lands.
    void refetch();
    const timer = setTimeout(() => void refetch(), 3000);
    return () => clearTimeout(timer);
  }, [checkoutJustCompleted, refetch]);

  const [createCheckoutSession, { loading: checkoutLoading }] =
    useCreateCheckoutSessionMutation();
  const [createBillingPortalSession, { loading: portalLoading }] =
    useCreateBillingPortalSessionMutation();

  const isPremium =
    subscription?.status === 'active' || subscription?.status === 'trialing';
  const isPastDue = subscription?.status === 'past_due';
  const isCanceled = subscription?.status === 'canceled';
  const isFree = !subscription || subscription.status === null;
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd ?? false;

  const handleUpgrade = async () => {
    setCheckoutError(null);
    const priceId = billingCycle === 'annual' ? annualPriceId : monthlyPriceId;

    if (!priceId || !priceId.startsWith('price_')) {
      setCheckoutError(
        'Upgrade is temporarily unavailable. Please try again later or contact support.',
      );
      return;
    }

    const value = billingCycle === 'annual' ? ANNUAL_TOTAL : MONTHLY_PRICE;
    trackBeginCheckout(billingCycle, value);
    sessionStorage.setItem('upgrade_billing_cycle', billingCycle);

    const origin = window.location.origin;
    try {
      const result = await createCheckoutSession({
        variables: {
          priceId,
          successUrl: `${origin}/profile/subscription?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${origin}/profile/subscription?checkout=canceled`,
        },
      });

      const url = result.data?.createCheckoutSession?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      setCheckoutError(
        'Could not start checkout — please try again or contact support.',
      );
    } catch (error) {
      LOGGER.error(
        'Failed to create checkout session',
        error instanceof Error ? error : new Error(String(error)),
      );
      setCheckoutError(
        'Could not start checkout — please try again or contact support.',
      );
    }
  };

  const handleManageSubscription = async () => {
    const result = await createBillingPortalSession({
      variables: {
        returnUrl: window.location.href,
      },
    });

    const url = result.data?.createBillingPortalSession?.url;
    if (url) {
      window.location.href = url;
    }
  };

  const handleCancelConfirm = async () => {
    // Opens billing portal to complete cancellation on Stripe side
    setShowCancelDialog(false);
    await handleManageSubscription();
  };

  return (
    <PageContainer style={pageBackgroundStyle}>
      <PageMeta
        title="Subscription"
        description="Manage your Legacy Sports subscription and billing."
      />

      {showCancelDialog && (
        <CancelConfirmDialog
          onConfirm={() => void handleCancelConfirm()}
          onDismiss={() => setShowCancelDialog(false)}
          loading={portalLoading}
        />
      )}

      <ScrollView>
        <ContentContainer>
          {/* ── Page Header ── */}
          <PageHeader>
            <H1
              style={{
                fontSize: 32,
                fontWeight: '700',
                color: BRAND_GOLD_LIGHT,
                letterSpacing: -0.5,
              }}
            >
              Subscription
            </H1>
            <Paragraph size="$4" color="$colorPress">
              Manage your plan, billing, and Premium features.
            </Paragraph>
          </PageHeader>

          {/* ── Past Due Warning Banner ── */}
          {isPastDue && (
            <PastDueBanner
              onRetry={() => void handleManageSubscription()}
              loading={portalLoading}
            />
          )}

          {/* ── Current Plan Card ── */}
          <SectionCard style={cardPanelStyle}>
            <SectionHeader>
              <SectionIconBox
                style={
                  {
                    backgroundColor: withAlpha(BRAND_GOLD, 0.12),
                    borderColor: withAlpha(BRAND_GOLD, 0.25),
                    borderWidth: 1,
                  } as React.CSSProperties
                }
              >
                <CreditCard size={18} color={BRAND_GOLD} />
              </SectionIconBox>
              <YStack flex={1}>
                <Paragraph size="$4" color="$color" fontWeight="600">
                  Current Plan
                </Paragraph>
                <Paragraph size="$2" color="$colorPress">
                  Your active subscription details
                </Paragraph>
              </YStack>
            </SectionHeader>

            <SectionBody>
              {loading ? (
                <Paragraph size="$3" color="$colorPress">
                  Loading subscription details…
                </Paragraph>
              ) : isPremium || isPastDue || isCanceled ? (
                <YStack gap="$4">
                  {/* Plan + Status Row */}
                  <XStack
                    alignItems="center"
                    gap="$3"
                    $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
                  >
                    <YStack flex={1} gap="$1">
                      <XStack
                        data-testid="subscription-tier-badge"
                        data-tier={subscription?.tier ?? ''}
                        data-status={subscription?.status ?? ''}
                        alignItems="center"
                        gap="$2"
                      >
                        <Crown size={20} color={BRAND_GOLD} />
                        <Paragraph
                          size="$5"
                          fontWeight="700"
                          style={
                            { color: BRAND_GOLD_LIGHT } as React.CSSProperties
                          }
                        >
                          {getTierLabel(subscription?.tier ?? '')}
                        </Paragraph>
                      </XStack>
                    </YStack>

                    <BadgeTag
                      backgroundColor={
                        isPremium
                          ? withAlpha(EMERALD, 0.12)
                          : isPastDue
                            ? withAlpha(AMBER, 0.12)
                            : withAlpha(RED, 0.1)
                      }
                      borderColor={
                        isPremium
                          ? withAlpha(EMERALD, 0.35)
                          : isPastDue
                            ? withAlpha(AMBER, 0.35)
                            : withAlpha(RED, 0.3)
                      }
                    >
                      <YStack
                        width={8}
                        height={8}
                        borderRadius={4}
                        backgroundColor={
                          isPremium ? EMERALD : isPastDue ? AMBER : RED
                        }
                        flexShrink={0}
                      />
                      <Paragraph
                        size="$3"
                        fontWeight="600"
                        style={
                          {
                            color: isPremium
                              ? EMERALD
                              : isPastDue
                                ? AMBER
                                : RED,
                          } as React.CSSProperties
                        }
                      >
                        {getStatusLabel(subscription?.status ?? '')}
                      </Paragraph>
                    </BadgeTag>
                  </XStack>

                  <Separator />

                  {/* Billing Details */}
                  <YStack gap="$3">
                    {subscription?.currentPeriodEnd && (
                      <XStack
                        alignItems="center"
                        justifyContent="space-between"
                        $sm={{
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '$1',
                        }}
                      >
                        <Paragraph size="$3" color="$colorPress">
                          {cancelAtPeriodEnd ? 'Access ends' : 'Next renewal'}
                        </Paragraph>
                        <Paragraph size="$3" color="$color" fontWeight="500">
                          {formatDate(subscription.currentPeriodEnd)}
                        </Paragraph>
                      </XStack>
                    )}

                    {cancelAtPeriodEnd && (
                      <XStack
                        alignItems="flex-start"
                        gap="$2"
                        padding="$3"
                        borderRadius="$4"
                        style={
                          {
                            backgroundColor: withAlpha(AMBER, 0.08),
                            borderWidth: 1,
                            borderColor: withAlpha(AMBER, 0.3),
                          } as React.CSSProperties
                        }
                      >
                        <AlertTriangle
                          size={16}
                          color={AMBER}
                          flexShrink={0}
                          marginTop={2}
                        />
                        <Paragraph size="$3" color="$colorPress">
                          Your subscription is set to cancel at the end of the
                          current billing period. You can renew at any time from
                          the billing portal.
                        </Paragraph>
                      </XStack>
                    )}
                  </YStack>

                  <Separator />

                  {/* Actions */}
                  <XStack
                    gap="$3"
                    flexWrap="wrap"
                    $sm={{ flexDirection: 'column' }}
                  >
                    <CtaButton
                      onPress={() => void handleManageSubscription()}
                      disabled={portalLoading}
                      style={
                        {
                          background: `linear-gradient(135deg, ${BRAND_NAVY_LIGHT} 0%, ${BRAND_NAVY} 100%)`,
                          borderWidth: 1,
                          borderColor: withAlpha(BRAND_GOLD, 0.3),
                          color: 'white',
                        } as React.CSSProperties
                      }
                    >
                      {portalLoading ? 'Loading…' : 'Manage Subscription'}
                    </CtaButton>

                    {!cancelAtPeriodEnd && (isPremium || isPastDue) && (
                      <CtaButton
                        onPress={() => setShowCancelDialog(true)}
                        backgroundColor="transparent"
                        borderWidth={1}
                        borderColor={withAlpha(RED, 0.35)}
                        style={{ color: RED } as React.CSSProperties}
                      >
                        Cancel Subscription
                      </CtaButton>
                    )}
                  </XStack>
                </YStack>
              ) : (
                /* Free Plan */
                <XStack
                  alignItems="center"
                  gap="$4"
                  $sm={{ flexDirection: 'column', alignItems: 'flex-start' }}
                >
                  <YStack flex={1} gap="$1">
                    <Paragraph size="$5" color="$color" fontWeight="700">
                      Free Plan
                    </Paragraph>
                    <Paragraph size="$3" color="$colorPress">
                      You have access to core features. Upgrade to Premium for
                      the full experience.
                    </Paragraph>
                  </YStack>
                  <BadgeTag
                    backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.15)}
                    borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.4)}
                  >
                    <Paragraph size="$3" color="$colorPress" fontWeight="600">
                      Free
                    </Paragraph>
                  </BadgeTag>
                </XStack>
              )}
            </SectionBody>
          </SectionCard>

          {/* ── Upgrade Section (free users only) ── */}
          {(isFree || isCanceled) && (
            <SectionCard style={goldCardStyle}>
              <SectionHeader
                style={
                  {
                    borderBottomColor: withAlpha(BRAND_GOLD, 0.2),
                  } as React.CSSProperties
                }
              >
                <SectionIconBox
                  style={
                    {
                      backgroundColor: withAlpha(BRAND_GOLD, 0.15),
                      borderWidth: 1,
                      borderColor: withAlpha(BRAND_GOLD, 0.3),
                    } as React.CSSProperties
                  }
                >
                  <Crown size={18} color={BRAND_GOLD} />
                </SectionIconBox>
                <YStack flex={1}>
                  <Paragraph size="$4" color="$color" fontWeight="600">
                    Upgrade to Premium
                  </Paragraph>
                  <Paragraph size="$2" color="$colorPress">
                    Unlock all features and take your game to the next level
                  </Paragraph>
                </YStack>
              </SectionHeader>

              <SectionBody gap="$5">
                {/* Billing cycle toggle */}
                <PricingToggle
                  billingCycle={billingCycle}
                  onChange={setBillingCycle}
                  annualSavingsPct={ANNUAL_SAVINGS_PCT}
                />

                {/* Price display */}
                <YStack alignItems="center" gap="$1">
                  <XStack alignItems="flex-end" gap="$1">
                    <Paragraph
                      size="$10"
                      fontWeight="800"
                      style={
                        {
                          fontSize: 48,
                          lineHeight: 52,
                          color: BRAND_GOLD_LIGHT,
                        } as React.CSSProperties
                      }
                    >
                      {billingCycle === 'annual'
                        ? ANNUAL_PRICE_DISPLAY
                        : MONTHLY_PRICE_DISPLAY}
                    </Paragraph>
                    <Paragraph size="$3" color="$colorPress" paddingBottom="$2">
                      {billingCycle === 'annual' ? '/year' : '/month'}
                    </Paragraph>
                  </XStack>
                  {billingCycle === 'annual' && (
                    <Paragraph
                      size="$3"
                      style={{ color: GREEN } as React.CSSProperties}
                    >
                      {ANNUAL_MONTHLY_EQUIVALENT}/month — save{' '}
                      {ANNUAL_SAVINGS_PCT} vs monthly
                    </Paragraph>
                  )}
                </YStack>

                {/* Feature comparison table */}
                <SectionCard
                  style={
                    {
                      borderColor: withAlpha(BRAND_GOLD, 0.2),
                      overflow: 'hidden',
                    } as React.CSSProperties
                  }
                >
                  <FeatureComparisonTable />
                </SectionCard>

                {/* Checkout error */}
                {checkoutError && (
                  <XStack
                    alignItems="flex-start"
                    gap="$2"
                    padding="$3"
                    borderRadius="$4"
                    style={
                      {
                        backgroundColor: withAlpha(RED, 0.08),
                        borderWidth: 1,
                        borderColor: withAlpha(RED, 0.3),
                      } as React.CSSProperties
                    }
                  >
                    <AlertTriangle
                      size={16}
                      color={RED}
                      flexShrink={0}
                      marginTop={2}
                    />
                    <Paragraph
                      size="$3"
                      style={{ color: RED } as React.CSSProperties}
                    >
                      {checkoutError}
                    </Paragraph>
                  </XStack>
                )}

                {/* CTA */}
                <CtaButton
                  onPress={() => void handleUpgrade()}
                  disabled={checkoutLoading}
                  size="$5"
                  icon={<Zap size={18} />}
                  style={
                    {
                      background: `linear-gradient(135deg, ${BRAND_GOLD} 0%, ${BRAND_GOLD_PRESS} 100%)`,
                      color: '#0A0F1A',
                      fontWeight: '700',
                      fontSize: 16,
                    } as React.CSSProperties
                  }
                >
                  {checkoutLoading
                    ? 'Loading…'
                    : `Upgrade to Premium — ${billingCycle === 'annual' ? `${ANNUAL_PRICE_DISPLAY}/yr` : `${MONTHLY_PRICE_DISPLAY}/mo`}`}
                </CtaButton>

                <Paragraph size="$2" color="$colorPress" textAlign="center">
                  Secure payment via Stripe. Cancel anytime.
                </Paragraph>
              </SectionBody>
            </SectionCard>
          )}
        </ContentContainer>
      </ScrollView>
    </PageContainer>
  );
};

export default SubscriptionPage;

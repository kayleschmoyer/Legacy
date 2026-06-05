import React from 'react';
import { ScrollView } from 'react-native';
import {
  H1,
  H3,
  Paragraph,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Redirect } from 'expo-router';
import { ScreenErrorBoundary } from './_screenErrorBoundary';
import { useAdminRevenueStatsQuery } from '../../api/db/graphql.generated';
import { useCurrentUserInfo } from '../../common/auth/AuthHooks';

const BRAND_GOLD_LIGHT = '#C5A55A';
const BRAND_SEAM_RED = '#C41E3A';
const TEXT_MUTED = '#7B8FA6';

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'Active',
  trialing: 'Trialing',
  past_due: 'Past Due',
  inactive: 'Inactive',
  canceled: 'Canceled',
};

interface StatRowProps {
  label: string;
  value: string;
  sub?: string;
}

function StatRow({ label, value, sub }: StatRowProps) {
  return (
    <XStack
      justifyContent="space-between"
      alignItems="center"
      paddingVertical="$3"
      borderBottomWidth={1}
      borderBottomColor="$borderColor"
    >
      <YStack gap="$0.5">
        <Text fontSize="$4" color="$color" fontWeight="600">
          {label}
        </Text>
        {sub != null && (
          <Text fontSize="$2" color={TEXT_MUTED}>
            {sub}
          </Text>
        )}
      </YStack>
      <Text
        fontSize="$5"
        fontWeight="700"
        color={BRAND_GOLD_LIGHT}
        fontVariant={['tabular-nums']}
      >
        {value}
      </Text>
    </XStack>
  );
}

export default function AdminRevenueScreen(): React.JSX.Element | null {
  const { data: currentUser, loading: authLoading } = useCurrentUserInfo();
  const { data, loading, error } = useAdminRevenueStatsQuery({
    skip: currentUser == null,
  });

  if (authLoading) return null;

  if (!currentUser?.isAdmin) {
    return <Redirect href="/" />;
  }

  const stats = data?.adminRevenueStats;

  return (
    <ScrollView>
      <YStack
        padding="$5"
        gap="$5"
        backgroundColor="$background"
        minHeight="100%"
      >
        <YStack gap="$1">
          <H1>Revenue Analytics</H1>
          <Paragraph color={TEXT_MUTED} fontSize="$4">
            Subscription metrics and growth trends
          </Paragraph>
        </YStack>

        <Separator />

        {loading && (
          <YStack alignItems="center" padding="$8">
            <Spinner size="large" />
          </YStack>
        )}

        {error != null && (
          <YStack
            padding="$4"
            borderRadius="$4"
            borderWidth={1}
            backgroundColor="rgba(196,30,58,0.1)"
            borderColor={BRAND_SEAM_RED}
          >
            <Text color={BRAND_SEAM_RED} fontSize="$4">
              Failed to load revenue data.
            </Text>
          </YStack>
        )}

        {!loading && error == null && stats == null && currentUser != null && (
          <YStack
            padding="$4"
            borderRadius="$4"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$background"
            gap="$2"
          >
            <Text fontSize="$5" fontWeight="600" color="$color">
              No revenue data available
            </Text>
            <Text fontSize="$3" color={TEXT_MUTED}>
              Revenue statistics could not be loaded. There may be no
              subscription activity yet, or the metrics service is temporarily
              unavailable.
            </Text>
          </YStack>
        )}

        {stats != null && (
          <>
            {/* KPI Summary */}
            <YStack
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$4"
              padding="$4"
              gap="$1"
            >
              <H3 marginBottom="$2">Key Metrics</H3>
              <StatRow
                label="Total Subscribers"
                value={fmt(stats.totalSubscribers ?? 0)}
                sub="Active + trialing"
              />
              <StatRow
                label="Premium Users"
                value={fmt(stats.totalPremiumUsers ?? 0)}
                sub={`${fmt(stats.totalFreeUsers ?? 0)} free users`}
              />
              <StatRow
                label="Conversion Rate"
                value={pct(stats.conversionRate ?? 0)}
                sub="Free → Premium"
              />
              <StatRow
                label="New This Month"
                value={fmt(stats.newSubscribersThisMonth ?? 0)}
                sub="New premium subscriptions"
              />
              <StatRow
                label="Total Users"
                value={fmt(stats.totalUsers ?? 0)}
                sub="Registered accounts"
              />
            </YStack>

            {/* Status Breakdown */}
            {(stats.statusBreakdown ?? []).length > 0 && (
              <YStack
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
                padding="$4"
                gap="$1"
              >
                <H3 marginBottom="$2">Subscription Status</H3>
                {(stats.statusBreakdown ?? []).map((item) => {
                  const key = item.status ?? '';
                  return (
                    <XStack
                      key={key}
                      justifyContent="space-between"
                      alignItems="center"
                      paddingVertical="$3"
                      borderBottomWidth={1}
                      borderBottomColor="$borderColor"
                    >
                      <Text fontSize="$4" color="$color">
                        {STATUS_LABELS[key] ?? key}
                      </Text>
                      <Text
                        fontSize="$4"
                        fontWeight="700"
                        color="$color"
                        fontVariant={['tabular-nums']}
                      >
                        {fmt(item.count ?? 0)}
                      </Text>
                    </XStack>
                  );
                })}
              </YStack>
            )}

            {/* Subscriber Growth Table */}
            {(stats.subscriberGrowth ?? []).length > 0 && (
              <YStack
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$4"
                padding="$4"
                gap="$1"
              >
                <H3 marginBottom="$2">Subscriber Growth</H3>
                <Paragraph fontSize="$3" color={TEXT_MUTED} marginBottom="$2">
                  New premium subscriptions per month (last 12 months)
                </Paragraph>
                <XStack
                  justifyContent="space-between"
                  paddingVertical="$2"
                  borderBottomWidth={1}
                  borderBottomColor="$borderColor"
                >
                  <Text fontSize="$3" color={TEXT_MUTED} fontWeight="600">
                    Month
                  </Text>
                  <Text fontSize="$3" color={TEXT_MUTED} fontWeight="600">
                    New Subscribers
                  </Text>
                </XStack>
                {(stats.subscriberGrowth ?? []).map((pt) => (
                  <XStack
                    key={pt.month ?? ''}
                    justifyContent="space-between"
                    alignItems="center"
                    paddingVertical="$2"
                    borderBottomWidth={1}
                    borderBottomColor="$borderColor"
                  >
                    <Text fontSize="$3" color="$color">
                      {pt.month ?? ''}
                    </Text>
                    <Text
                      fontSize="$3"
                      fontWeight="700"
                      color={BRAND_GOLD_LIGHT}
                      fontVariant={['tabular-nums']}
                    >
                      {fmt(pt.newSubscribers ?? 0)}
                    </Text>
                  </XStack>
                ))}
              </YStack>
            )}

            {/* Revenue by Platform */}
            <YStack
              borderWidth={1}
              borderColor="$borderColor"
              borderRadius="$4"
              padding="$4"
              gap="$2"
            >
              <H3>Revenue by Platform</H3>
              <Paragraph fontSize="$3" color={TEXT_MUTED}>
                Platform-level revenue breakdown requires Stripe API aggregation
                and IAP reporting integration.
              </Paragraph>
              <XStack
                justifyContent="space-between"
                alignItems="center"
                paddingVertical="$3"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
              >
                <Text fontSize="$4" color="$color">
                  Web (Stripe)
                </Text>
                <Text
                  fontSize="$4"
                  fontWeight="700"
                  color={BRAND_GOLD_LIGHT}
                  fontVariant={['tabular-nums']}
                >
                  {fmt(stats.stripeSubscribers ?? 0)} subscribers
                </Text>
              </XStack>
              <XStack
                justifyContent="space-between"
                alignItems="center"
                paddingVertical="$3"
                borderBottomWidth={1}
                borderBottomColor="$borderColor"
              >
                <Text fontSize="$4" color={TEXT_MUTED}>
                  iOS IAP
                </Text>
                <Text fontSize="$4" color={TEXT_MUTED}>
                  Coming soon
                </Text>
              </XStack>
              <XStack
                justifyContent="space-between"
                alignItems="center"
                paddingVertical="$3"
              >
                <Text fontSize="$4" color={TEXT_MUTED}>
                  Android Play
                </Text>
                <Text fontSize="$4" color={TEXT_MUTED}>
                  Coming soon
                </Text>
              </XStack>
            </YStack>
          </>
        )}
      </YStack>
    </ScrollView>
  );
}

export { ScreenErrorBoundary as ErrorBoundary };

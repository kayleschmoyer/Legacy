import React from 'react';
import {
  Paragraph,
  Separator,
  XStack,
  YStack,
} from '@legacy-sports/shared-components/ui';
import { Card, Spinner, Text } from 'tamagui';
import { Navigate } from 'react-router-dom';
import { styled } from 'tamagui';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { PageMeta } from '../../components/PageMeta';
import { useAdminRevenueStatsQuery } from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  BRAND_SEAM_RED,
  EMERALD_LIGHT,
  OUTLINE_SUBTLE,
  SURFACE_CARD,
  SURFACE_PANEL,
  TEXT_MUTED,
  withAlpha,
} from '../../constants/colors';

// ─── Styled Components ────────────────────────────────────────────────────────

const PageContainer = styled(YStack, {
  padding: '$5',
  maxWidth: 1100,
  width: '100%',
  alignSelf: 'center',
  gap: '$5',
});

const StatCard = styled(Card, {
  padding: '$4',
  borderRadius: '$4',
  borderWidth: 1,
  flex: 1,
  minWidth: 160,
});

const ChartCard = styled(Card, {
  padding: '$4',
  borderRadius: '$4',
  borderWidth: 1,
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

const STATUS_COLORS: Record<string, string> = {
  active: EMERALD_LIGHT,
  trialing: BRAND_GOLD_LIGHT,
  past_due: '#F59E0B',
  inactive: TEXT_MUTED,
  canceled: BRAND_SEAM_RED,
};

// ─── Sub-components ──────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}

function MetricCard({
  label,
  value,
  sub,
  accent = BRAND_GOLD_LIGHT,
}: MetricCardProps) {
  return (
    <StatCard
      style={{
        background: SURFACE_PANEL,
        borderColor: OUTLINE_SUBTLE,
      }}
    >
      <YStack gap="$1">
        <Paragraph
          size="$2"
          fontWeight="600"
          style={{
            color: TEXT_MUTED,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
          }}
        >
          {label}
        </Paragraph>
        <Paragraph
          size="$8"
          fontWeight="700"
          style={{ color: accent, lineHeight: 36 }}
        >
          {value}
        </Paragraph>
        {sub != null && (
          <Paragraph size="$2" style={{ color: TEXT_MUTED }}>
            {sub}
          </Paragraph>
        )}
      </YStack>
    </StatCard>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdminRevenuePage(): React.JSX.Element | null {
  const auth = useAuth();

  const { data, loading, error } = useAdminRevenueStatsQuery({
    skip: !auth.isAuthenticated,
  });

  if (auth.isLoading) return null;

  if (auth.user?.accessLevel !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const stats = data?.adminRevenueStats;

  return (
    <PageContainer>
      <PageMeta
        title="Revenue Analytics"
        description="Admin revenue and subscription metrics for Legacy Sports."
      />

      {/* Header */}
      <YStack gap="$2">
        <Paragraph
          size="$8"
          fontWeight="700"
          style={{ color: BRAND_GOLD_LIGHT }}
        >
          Revenue Analytics
        </Paragraph>
        <Paragraph size="$4" color="$colorPress">
          Subscription metrics and growth trends across the platform.
        </Paragraph>
      </YStack>

      <Separator />

      {loading && (
        <YStack alignItems="center" padding="$8">
          <Spinner size="large" />
        </YStack>
      )}

      {error != null && (
        <Card
          padding="$4"
          style={{
            background: withAlpha(BRAND_SEAM_RED, 0.15),
            borderColor: BRAND_SEAM_RED,
          }}
        >
          <Paragraph color="$color">Failed to load revenue data.</Paragraph>
        </Card>
      )}

      {!loading && error == null && stats == null && auth.isAuthenticated && (
        <Card
          padding="$4"
          style={{
            background: SURFACE_PANEL,
            borderColor: OUTLINE_SUBTLE,
          }}
        >
          <YStack gap="$2">
            <Paragraph size="$5" fontWeight="600" color="$color">
              No revenue data available
            </Paragraph>
            <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
              Revenue statistics could not be loaded. There may be no
              subscription activity yet, or the metrics service is temporarily
              unavailable. Try refreshing in a few minutes.
            </Paragraph>
          </YStack>
        </Card>
      )}

      {stats != null && (
        <>
          {/* KPI Row */}
          <XStack gap="$3" flexWrap="wrap">
            <MetricCard
              label="Total Subscribers"
              value={fmt(stats.totalSubscribers ?? 0)}
              sub="Active + trialing"
              accent={EMERALD_LIGHT}
            />
            <MetricCard
              label="Premium Users"
              value={fmt(stats.totalPremiumUsers ?? 0)}
              sub={`${fmt(stats.totalFreeUsers ?? 0)} free`}
              accent={BRAND_GOLD_LIGHT}
            />
            <MetricCard
              label="Conversion Rate"
              value={pct(stats.conversionRate ?? 0)}
              sub="Free → Premium"
              accent={BRAND_NAVY_LIGHT}
            />
            <MetricCard
              label="New This Month"
              value={fmt(stats.newSubscribersThisMonth ?? 0)}
              sub="New premium subscriptions"
              accent={BRAND_GOLD_LIGHT}
            />
            <MetricCard
              label="Total Users"
              value={fmt(stats.totalUsers ?? 0)}
              sub="Registered accounts"
            />
          </XStack>

          {/* Status Breakdown */}
          <ChartCard
            style={{
              background: SURFACE_CARD,
              borderColor: OUTLINE_SUBTLE,
            }}
          >
            <YStack gap="$3">
              <YStack gap="$1">
                <Paragraph size="$6" fontWeight="600" color="$color">
                  Subscription Status Breakdown
                </Paragraph>
                <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                  Distribution of subscriptions by current status
                </Paragraph>
              </YStack>

              <XStack gap="$2" flexWrap="wrap">
                {(stats.statusBreakdown ?? []).map((item) => {
                  const statusKey = item.status ?? '';
                  return (
                    <XStack
                      key={statusKey}
                      gap="$2"
                      alignItems="center"
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      borderRadius="$3"
                      style={{
                        background: withAlpha(
                          STATUS_COLORS[statusKey] ?? TEXT_MUTED,
                          0.15,
                        ),
                        border: `1px solid ${withAlpha(STATUS_COLORS[statusKey] ?? TEXT_MUTED, 0.3)}`,
                      }}
                    >
                      <Text
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: STATUS_COLORS[statusKey] ?? TEXT_MUTED,
                          display: 'inline-block',
                        }}
                      />
                      <Paragraph size="$3" color="$color">
                        {STATUS_LABELS[statusKey] ?? statusKey}
                      </Paragraph>
                      <Paragraph size="$3" fontWeight="700" color="$color">
                        {fmt(item.count ?? 0)}
                      </Paragraph>
                    </XStack>
                  );
                })}
              </XStack>

              {(stats.statusBreakdown ?? []).length > 0 && (
                <YStack style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={(stats.statusBreakdown ?? []).map((item) => {
                        const statusKey = item.status ?? '';
                        return {
                          name: STATUS_LABELS[statusKey] ?? statusKey,
                          count: item.count ?? 0,
                        };
                      })}
                      margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={withAlpha(TEXT_MUTED, 0.2)}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fill: TEXT_MUTED, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: TEXT_MUTED, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: SURFACE_CARD,
                          border: `1px solid ${OUTLINE_SUBTLE}`,
                          borderRadius: 8,
                          color: '#F8FAFC',
                        }}
                        cursor={{ fill: withAlpha(TEXT_MUTED, 0.05) }}
                      />
                      <Bar
                        dataKey="count"
                        fill={BRAND_GOLD_LIGHT}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </YStack>
              )}
            </YStack>
          </ChartCard>

          {/* Subscriber Growth */}
          <ChartCard
            style={{
              background: SURFACE_CARD,
              borderColor: OUTLINE_SUBTLE,
            }}
          >
            <YStack gap="$3">
              <YStack gap="$1">
                <Paragraph size="$6" fontWeight="600" color="$color">
                  Subscriber Growth
                </Paragraph>
                <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                  New premium subscriptions per month (last 12 months)
                </Paragraph>
              </YStack>

              {(stats.subscriberGrowth ?? []).length > 0 ? (
                <YStack style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={(stats.subscriberGrowth ?? []).map((pt) => ({
                        month: pt.month ?? '',
                        newSubscribers: pt.newSubscribers ?? 0,
                      }))}
                      margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                    >
                      <defs>
                        <linearGradient
                          id="goldGrad"
                          x1="0"
                          y1="0"
                          x2="0"
                          y2="1"
                        >
                          <stop
                            offset="5%"
                            stopColor={BRAND_GOLD_LIGHT}
                            stopOpacity={0.4}
                          />
                          <stop
                            offset="95%"
                            stopColor={BRAND_GOLD_LIGHT}
                            stopOpacity={0.02}
                          />
                        </linearGradient>
                      </defs>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke={withAlpha(TEXT_MUTED, 0.2)}
                        vertical={false}
                      />
                      <XAxis
                        dataKey="month"
                        tick={{ fill: TEXT_MUTED, fontSize: 11 }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: TEXT_MUTED, fontSize: 12 }}
                        axisLine={false}
                        tickLine={false}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: SURFACE_CARD,
                          border: `1px solid ${OUTLINE_SUBTLE}`,
                          borderRadius: 8,
                          color: '#F8FAFC',
                        }}
                        formatter={(value) => [
                          fmt(Number(value)),
                          'New Subscribers',
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="newSubscribers"
                        stroke={BRAND_GOLD_LIGHT}
                        strokeWidth={2}
                        fill="url(#goldGrad)"
                        dot={{ fill: BRAND_GOLD_LIGHT, r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </YStack>
              ) : (
                <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                  No subscription data for the last 12 months.
                </Paragraph>
              )}
            </YStack>
          </ChartCard>

          {/* Revenue by Platform (informational placeholder) */}
          <ChartCard
            style={{
              background: SURFACE_CARD,
              borderColor: OUTLINE_SUBTLE,
            }}
          >
            <YStack gap="$2">
              <Paragraph size="$6" fontWeight="600" color="$color">
                Revenue by Platform
              </Paragraph>
              <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                Platform-level revenue breakdown requires Stripe API aggregation
                and IAP reporting integration.
              </Paragraph>
              <XStack gap="$3" flexWrap="wrap" paddingTop="$2">
                <XStack
                  gap="$2"
                  alignItems="center"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$3"
                  style={{
                    background: withAlpha(BRAND_NAVY_LIGHT, 0.2),
                    border: `1px solid ${withAlpha(BRAND_NAVY_LIGHT, 0.4)}`,
                  }}
                >
                  <Paragraph size="$3" color="$color">
                    Web (Stripe)
                  </Paragraph>
                  <Paragraph
                    size="$3"
                    fontWeight="700"
                    style={{ color: BRAND_GOLD_LIGHT }}
                  >
                    {fmt(stats.totalSubscribers ?? 0)} subscribers
                  </Paragraph>
                </XStack>
                <XStack
                  gap="$2"
                  alignItems="center"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$3"
                  style={{
                    background: withAlpha(TEXT_MUTED, 0.1),
                    border: `1px solid ${withAlpha(TEXT_MUTED, 0.2)}`,
                  }}
                >
                  <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                    iOS IAP — Coming soon
                  </Paragraph>
                </XStack>
                <XStack
                  gap="$2"
                  alignItems="center"
                  paddingHorizontal="$3"
                  paddingVertical="$2"
                  borderRadius="$3"
                  style={{
                    background: withAlpha(TEXT_MUTED, 0.1),
                    border: `1px solid ${withAlpha(TEXT_MUTED, 0.2)}`,
                  }}
                >
                  <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                    Android Play — Coming soon
                  </Paragraph>
                </XStack>
              </XStack>
            </YStack>
          </ChartCard>

          {/* Analytics Events Note */}
          <ChartCard
            style={{
              background: SURFACE_CARD,
              borderColor: OUTLINE_SUBTLE,
            }}
          >
            <YStack gap="$2">
              <Paragraph size="$6" fontWeight="600" color="$color">
                Premium Feature Analytics
              </Paragraph>
              <Paragraph size="$3" style={{ color: TEXT_MUTED }}>
                Feature click events (
                <Text
                  style={{ fontFamily: 'monospace', color: BRAND_GOLD_LIGHT }}
                >
                  premium_feature_click
                </Text>
                ) are tracked via Google Analytics 4. View detailed feature
                usage in the{' '}
                <a
                  href="https://analytics.google.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: BRAND_GOLD_LIGHT }}
                >
                  GA4 dashboard
                </a>
                .
              </Paragraph>
            </YStack>
          </ChartCard>
        </>
      )}
    </PageContainer>
  );
}

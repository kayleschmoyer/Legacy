import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  WHITE,
  withAlpha,
} from '../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatRowData {
  /** Human-readable label (e.g. "Home Runs") */
  label: string;
  /** Display value */
  value: string | number;
  /** When true, value renders in gold accent color */
  accent?: boolean;
}

export interface StatCardProps {
  /** Section heading (e.g. "Career Batting") */
  title: string;
  /** Ordered list of stat rows */
  rows: StatRowData[];
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function StatRow({ label, value, accent = false }: StatRowData) {
  const metricSlug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (
    <XStack
      data-testid={`stat-${metricSlug}`}
      justifyContent="space-between"
      paddingVertical="$2"
      paddingHorizontal="$4"
      borderBottomWidth={1}
      borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
    >
      <Text fontSize="$3" color="$textMuted">
        {label}
      </Text>
      <Text
        fontSize="$3"
        fontWeight="700"
        color={accent ? BRAND_GOLD_LIGHT : WHITE}
      >
        {value}
      </Text>
    </XStack>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StatCard — Card with a branded header bar and a list of label → value rows.
 *
 * Used in player detail modals to display career summary totals.
 * Follows UI Standards: interactive card with hover feedback.
 *
 * ```tsx
 * <StatCard title="Career Batting" rows={[{ label: 'AVG', value: '.305', accent: true }]} />
 * ```
 */
export function StatCard({ title, rows }: StatCardProps) {
  return (
    <YStack
      backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
      borderRadius="$4"
      borderWidth={1}
      borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
      overflow="hidden"
      animation="quick"
      hoverStyle={{
        borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.5),
        backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.16),
      }}
      pressStyle={{ scale: 0.99 }}
    >
      {/* Header bar */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$2"
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
      >
        <Text fontSize="$3" fontWeight="700" color={BRAND_GOLD_LIGHT}>
          {title}
        </Text>
      </XStack>

      {/* Stat rows */}
      {rows.map((row) => (
        <StatRow
          key={row.label}
          label={row.label}
          value={row.value}
          accent={row.accent}
        />
      ))}
    </YStack>
  );
}

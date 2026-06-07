import React from 'react';
import { H4, Text, XStack, YStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  WHITE,
  withAlpha,
} from '../utils/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StatTableProps {
  /** Section title displayed above the table (e.g. "Batting by Season") */
  title: string;
  /** Column header labels — first column usually "YEAR" */
  headers: string[];
  /** 2-D array of cell values, one inner array per row */
  rows: (string | number)[][];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * StatTable — Branded data table with a title, column headers, and
 * alternating-row striping.
 *
 * First column is given extra flex weight and left-aligned; remaining
 * columns are right-aligned. Used for season-by-season player stats.
 *
 * ```tsx
 * <StatTable
 *   title="Batting by Season"
 *   headers={['YEAR', 'G', 'AVG']}
 *   rows={[[2024, 140, '.310'], [2023, 155, '.295']]}
 * />
 * ```
 */
export function StatTable({ title, headers, rows }: StatTableProps) {
  return (
    <YStack marginBottom="$4">
      <H4 color={BRAND_GOLD} marginBottom="$2" fontSize="$5">
        {title}
      </H4>

      <YStack
        backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.08)}
        borderRadius="$3"
        borderWidth={1}
        borderColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
        overflow="hidden"
        hoverStyle={{
          borderColor: withAlpha(BRAND_NAVY_LIGHT, 0.4),
        }}
      >
        {/* ── Header row ── */}
        <XStack
          backgroundColor={withAlpha(BRAND_NAVY_LIGHT, 0.18)}
          paddingVertical="$2"
          paddingHorizontal="$3"
          borderBottomWidth={1}
          borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.25)}
        >
          {headers.map((h) => (
            <Text
              key={h}
              flex={h === 'YEAR' ? 1.2 : 1}
              minWidth={0}
              numberOfLines={1}
              fontSize="$2"
              fontWeight="bold"
              color={BRAND_GOLD_LIGHT}
              textAlign={h === 'YEAR' ? 'left' : 'right'}
            >
              {h}
            </Text>
          ))}
        </XStack>

        {/* ── Data rows ── */}
        {rows.map((cells, idx) => (
          <XStack
            key={String(cells[0])}
            paddingVertical="$2"
            paddingHorizontal="$3"
            backgroundColor={
              idx % 2 === 0 ? 'transparent' : withAlpha(BRAND_NAVY_LIGHT, 0.06)
            }
            borderBottomWidth={idx < rows.length - 1 ? 1 : 0}
            borderBottomColor={withAlpha(BRAND_NAVY_LIGHT, 0.12)}
          >
            {cells.map((cell, ci) => (
              <Text
                key={`${cells[0]}-${headers[ci]}`}
                flex={ci === 0 ? 1.2 : 1}
                minWidth={0}
                numberOfLines={1}
                fontSize="$2"
                fontWeight={ci === 0 ? '600' : '400'}
                color={ci === 0 ? BRAND_GOLD_LIGHT : WHITE}
                textAlign={ci === 0 ? 'left' : 'right'}
              >
                {cell}
              </Text>
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

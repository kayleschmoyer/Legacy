/**
 * Sortable stats-grid header cell (LS-8566).
 *
 * Extracted verbatim from the header renderers the batting and pitching grids
 * each inlined (PlayerStatsDataGrid / PitchingStatsDataGrid) so all three
 * sport grids (batting, pitching, football) share one implementation: gold
 * active-sort highlight, ▲/▼ direction glyph (Text, native-safe), hover/press
 * affordances, and the optional web-only sticky first column.
 */
import React from 'react';
import { Text, XStack } from 'tamagui';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_DARK,
  TEXT_MUTED,
} from '../../../utils/colors';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";

export type StatsGridSortDirection = 'asc' | 'desc';

export interface StatsGridHeaderCellProps {
  label: string;
  sortable?: boolean;
  /** Whether this column is the active sort column. */
  isActive?: boolean;
  /** Active sort direction (only meaningful when isActive). */
  direction?: StatsGridSortDirection;
  /**
   * Direction a click applies when the column is not yet active. Active
   * columns always flip. Defaults to 'desc' (the MLB grids' historical
   * behavior — leaders first); identity columns (name/team) pass 'asc'.
   */
  defaultDirection?: StatsGridSortDirection;
  /** Called with the next direction on click (sortable columns only). */
  onSort?: (nextDirection: StatsGridSortDirection) => void;
  align?: 'left' | 'center' | 'right';
  width?: number | string;
  minWidth?: number;
  flexGrow?: number;
  /** Tamagui horizontal padding token ('$1' compact, '$2' default). */
  paddingHorizontal?: '$1' | '$2';
  /** Web-only: stick the cell to the left edge over a dark backdrop. */
  sticky?: boolean;
  /**
   * Opt-in a11y affordance (button role + label) for sortable cells. Off by
   * default so the MLB grids' retrofit is DOM-neutral; the football grid
   * opts in.
   */
  accessibilityLabel?: string;
}

export function StatsGridHeaderCell({
  label,
  sortable = false,
  isActive = false,
  direction = 'asc',
  defaultDirection = 'desc',
  onSort,
  align = 'left',
  width,
  minWidth,
  flexGrow = 1,
  paddingHorizontal = '$2',
  sticky = false,
  accessibilityLabel,
}: StatsGridHeaderCellProps) {
  const isDescending = isActive && direction === 'desc';

  return (
    <XStack
      width={width || 'auto'}
      minWidth={minWidth}
      flexGrow={flexGrow}
      flexShrink={0}
      justifyContent={
        align === 'center'
          ? 'center'
          : align === 'right'
            ? 'flex-end'
            : 'flex-start'
      }
      alignItems="center"
      paddingHorizontal={paddingHorizontal}
      paddingVertical="$1"
      borderRadius="$2"
      style={{
        background: isActive
          ? 'rgba(196,165,90,0.18)'
          : sticky
            ? BRAND_NAVY_DARK
            : 'transparent',
        transition: 'background 0.15s ease',
        ...(sticky
          ? {
              position: 'sticky',
              left: 0,
              zIndex: 2,
            }
          : {}),
      }}
      hoverStyle={
        sortable
          ? {
              backgroundColor: isActive
                ? ('rgba(196,165,90,0.25)' as never)
                : ('rgba(255,255,255,0.07)' as never),
            }
          : undefined
      }
      pressStyle={sortable ? { scale: 0.97 } : undefined}
      cursor={sortable ? 'pointer' : 'default'}
      {...(sortable && accessibilityLabel
        ? {
            // Both spellings: RN surfaces accessibilityLabel natively while
            // react-native-web needs the explicit aria-label passthrough.
            accessibilityRole: 'button' as const,
            accessibilityLabel,
            'aria-label': accessibilityLabel,
          }
        : {})}
      onPress={
        sortable && onSort
          ? () => {
              onSort(
                isActive ? (isDescending ? 'asc' : 'desc') : defaultDirection,
              );
            }
          : undefined
      }
    >
      <XStack gap="$1" alignItems="center">
        <Text
          numberOfLines={1}
          userSelect="none"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: 'uppercase',
            color: isActive ? BRAND_GOLD_LIGHT : TEXT_MUTED,
            transition: 'color 0.15s ease',
          }}
        >
          {label}
        </Text>
        {sortable && isActive && (
          <Text
            style={{
              fontSize: 10,
              color: BRAND_GOLD,
            }}
          >
            {isDescending ? '▼' : '▲'}
          </Text>
        )}
      </XStack>
    </XStack>
  );
}

export default StatsGridHeaderCell;

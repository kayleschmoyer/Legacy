import React from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { BG_ELEVATED, FG4, FONT_BODY, FONT_DISPLAY } from './tokens';
import { Platform } from '../../../platform-components';
import {
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  STATS_BORDER,
  TEXT_MUTED,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../../utils/colors';
import { csp } from '../crossPlatformStyle';

/**
 * Shell-level conditional state. When omitted, the data grid renders and
 * handles its own internal loading/error/empty fallbacks. Setting this
 * (e.g. from an integrator that fetches above the shell) replaces the grid
 * with the design-spec state card.
 */
export type PlayerStatsShellState = 'loading' | 'error' | 'empty';

export const STATE_ANNOUNCEMENTS: Record<PlayerStatsShellState, string> = {
  loading: 'Loading player statistics.',
  error: 'Unable to load player statistics.',
  empty: 'No players match the current filters.',
};

const SKELETON_ROWS = 8;

export interface LoadingSkeletonProps {
  /** Number of stat columns to render as shimmer bars (sport/view specific). */
  columnCount: number;
}

/**
 * Shimmer placeholder shown while the grid data loads. The stat-column count is
 * supplied by the caller (baseball derives it from the active view mode;
 * football passes its own column count) so this card is sport-neutral.
 */
export function LoadingSkeleton({ columnCount }: LoadingSkeletonProps) {
  return (
    <YStack
      testID="player-stats-loading-skeleton"
      role="presentation"
      aria-hidden={true}
      style={csp({
        background: BG_ELEVATED,
        border: `1px solid ${STATS_BORDER}`,
        borderRadius: 12,
        padding: 18,
        gap: 14,
      })}
    >
      <XStack justifyContent="space-between" alignItems="center">
        <YStack gap={6}>
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 11,
              letterSpacing: 1.76,
              textTransform: 'uppercase',
              color: BRAND_GOLD_LIGHT,
            })}
          >
            Loading
          </Text>
          <Text
            style={csp({ fontFamily: FONT_BODY, fontSize: 13, color: FG4 })}
          >
            Fetching archived seasons…
          </Text>
        </YStack>
      </XStack>
      <YStack gap={10}>
        {Array.from({ length: SKELETON_ROWS }).map((_, r) => (
          <XStack
            key={r}
            alignItems="center"
            style={csp({
              gap: 12,
              padding: '10px 8px',
              borderBottom: `1px solid ${withAlpha(BRAND_GOLD, 0.06)}`,
            })}
          >
            <SkeletonBar width={140} />
            <SkeletonBar width={40} />
            <SkeletonBar width={40} />
            {Array.from({ length: columnCount }).map((_, c) => (
              <SkeletonBar key={c} width={48} />
            ))}
          </XStack>
        ))}
      </YStack>
    </YStack>
  );
}

function SkeletonBar({ width }: { width: number }) {
  if (Platform.OS === 'web') {
    return <span className="ps-sk-bar" style={{ width, flex: '0 0 auto' }} />;
  }
  return (
    <YStack
      style={csp({
        width,
        height: 10,
        borderRadius: 3,
        backgroundColor: withAlpha(WHITE, 0.08),
      })}
    />
  );
}

export interface ErrorCardProps {
  onRetry?: () => void;
  /** Overrides the default "Unable to load player stats" heading. */
  title?: string;
  /** Overrides the default archive-service explanation body copy. */
  message?: string;
}

export function ErrorCard({
  onRetry,
  title = 'Unable to load player stats',
  message = "We couldn't reach the archive service. Your filters are safe — we'll restore them when the connection returns.",
}: ErrorCardProps) {
  return (
    <YStack
      testID="player-stats-error-card"
      role="alert"
      aria-live="assertive"
      style={csp({
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        border: `1px solid ${BRAND_SEAM_RED}`,
        borderRadius: 12,
        alignItems: 'center',
        gap: 12,
      })}
    >
      {Platform.OS === 'web' && (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND_SEAM_RED}
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      )}
      <Text
        tag="h3"
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        })}
      >
        {title}
      </Text>
      <Text
        style={csp({
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        })}
      >
        {message}
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading player statistics"
          style={csp({
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          })}
        >
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: 0.96,
              textTransform: 'uppercase',
              color: WHITE,
            })}
          >
            Retry
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

export interface EmptyCardProps {
  onClear?: () => void;
  /** Overrides the default "No players found" heading. */
  title?: string;
  /** Overrides the default filter-adjustment guidance body copy. */
  message?: string;
}

export function EmptyCard({
  onClear,
  title = 'No players found',
  message = 'No players match the current filters. Try widening your search, relaxing a range, or clearing filters entirely.',
}: EmptyCardProps) {
  return (
    <YStack
      testID="player-stats-empty-card"
      role="status"
      style={csp({
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        border: `1px solid ${STATS_BORDER}`,
        borderRadius: 12,
        alignItems: 'center',
        gap: 12,
      })}
    >
      {Platform.OS === 'web' && (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={FG4}
          strokeWidth="1.4"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
          <line x1="8" y1="11" x2="14" y2="11" />
        </svg>
      )}
      <Text
        tag="h3"
        style={csp({
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        })}
      >
        {title}
      </Text>
      <Text
        style={csp({
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        })}
      >
        {message}
      </Text>
      {onClear && (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          style={csp({
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          })}
        >
          <Text
            style={csp({
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: 0.96,
              textTransform: 'uppercase',
              color: WHITE,
            })}
          >
            Clear all filters
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

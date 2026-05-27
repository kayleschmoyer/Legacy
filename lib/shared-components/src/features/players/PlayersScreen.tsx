import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { PlayersGrid } from './PlayersGrid';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';
import { Platform } from '../../platform-components';
import {
  BG_DARK,
  BRAND_GOLD,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  OUTLINE_SUBTLE,
  OVERLAY_WHITE_05,
  POS_UTILITY,
  STATS_PAGE_TOKENS,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_NEUTRAL_FG3,
  TEXT_PRIMARY,
  WHITE,
  withAlpha,
} from '../../utils/colors';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

// LS-4613 token — same BG_ELEVATED used by the Stats Page state cards.
const BG_ELEVATED = STATS_PAGE_TOKENS.BG_ELEVATED;

// `as unknown as number` is the project's documented workaround for passing
// raw CSS strings (clamp(), unitless line-height) through Tamagui's numeric
// fontSize / lineHeight typings on web. See
// .agents/skills/standards/references/tamagui-web-pitfalls.md and the same
// pattern in PlayerStatsPage.tsx (LS-4613). Native branches always supply
// real numbers, so the cast only takes effect under Platform.OS === 'web'.

/**
 * Shell-level conditional state for the Players Page. When omitted, the page
 * derives state from the peek Apollo query (loading / error / empty) — see
 * {@link deriveShellState}. Setting this prop forces the corresponding state
 * card and replaces the populated content (Featured + grid).
 */
export type PlayersShellState = 'loading' | 'error' | 'empty';

/** Skeleton geometry to render when state === 'loading'. Mirrors design's view modes. */
export type PlayersViewMode = 'cards' | 'list' | 'stats';

export interface PlayersScreenProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  title?: string;
  /** Render the Featured player spotlight above the grid. Default: true. */
  showFeatured?: boolean;
  /**
   * Force a shell-level state card (loading / error / empty) instead of the
   * Featured + grid layout. When omitted, the page derives state from the
   * peek Apollo query result.
   */
  state?: PlayersShellState;
  /** Active view mode — controls loading-skeleton geometry. Default: 'cards'. */
  viewMode?: PlayersViewMode;
  /** Whether any filters are currently active. Used by the derived empty state. */
  hasActiveFilters?: boolean;
  /** Retry handler invoked from the ErrorState card. Defaults to Apollo refetch. */
  onRetry?: () => void;
  /** Clear-all-filters handler invoked from the EmptyState card. */
  onClearFilters?: () => void;
}

/**
 * Derive the shell state from peek-query flags + filter activity.
 *
 * - `loading` while the peek query is in flight and no data has arrived yet
 * - `error` when the peek query failed with no usable partial data
 * - `empty` when the query returned successfully but the player set is empty
 *   AND filters are active (so the host can clear them); without filters, an
 *   empty archive is a populated-but-empty state, not an action-needed empty
 *   card — defer to the grid's own messaging.
 * - otherwise `undefined`, meaning render the populated Featured + grid.
 *
 * Exported for direct unit testing — see PlayersScreen.spec.tsx.
 */
export function deriveShellState({
  loading,
  error,
  playerCount,
  hasActiveFilters,
}: {
  loading: boolean;
  error: boolean;
  playerCount: number;
  hasActiveFilters: boolean;
}): PlayersShellState | undefined {
  if (loading && playerCount === 0) return 'loading';
  if (error && playerCount === 0) return 'error';
  if (!loading && !error && playerCount === 0 && hasActiveFilters) {
    return 'empty';
  }
  return undefined;
}

const STATE_ANNOUNCEMENTS: Record<PlayersShellState, string> = {
  loading: 'Loading players.',
  error: 'Unable to load players.',
  empty: 'No players match the current filters.',
};

/** Exported for direct unit testing — see PlayersScreen.spec.tsx. */
export function initialsOf(player: PlayerFragment): string {
  const first = player.firstName?.trim()?.[0] ?? '';
  const last = player.lastName?.trim()?.[0] ?? '';
  return (first + last).toUpperCase() || '—';
}

/** Exported for direct unit testing — see PlayersScreen.spec.tsx. */
export function fullName(player: PlayerFragment): string {
  return [player.firstName, player.lastName].filter(Boolean).join(' ').trim();
}

function PlayersScreen({
  onPlayerSelect,
  pageSize = 50,
  title = 'All Players',
  showFeatured = true,
  state,
  viewMode = 'cards',
  hasActiveFilters = false,
  onRetry,
  onClearFilters,
}: PlayersScreenProps) {
  const handlePlayerSelect = useCallback(
    (player: PlayerFragment) => {
      LOGGER.debug('Selected player:', player);
      onPlayerSelect?.(player);
    },
    [onPlayerSelect],
  );

  // Lightweight peek query for the Featured spotlight + count chip. The main
  // grid runs its own paginated query inside PlayersGrid; this one stays at
  // limit:1 so the shell doesn't double-fetch a full page.
  const { data, error, loading, refetch } = useGetAllPlayersQuery({
    variables: {
      limit: 1,
      offset: 0,
      orderBy: 'name',
      orderDirection: 'asc',
    },
    errorPolicy: 'all',
  });

  // Surface partial/full GraphQL errors so the empty spotlight isn't silent.
  useEffect(() => {
    if (error) {
      LOGGER.error('PlayersScreen featured spotlight query failed', error);
    }
  }, [error]);

  const featuredPlayer = useMemo<PlayerFragment | null>(() => {
    const players = data?.players ?? [];
    return players.find((p): p is PlayerFragment => p !== null) ?? null;
  }, [data?.players]);

  // Derive state from peek query when host did not force one explicitly.
  const peekPlayerCount = data?.players?.length ?? 0;
  const derivedState = useMemo(
    () =>
      deriveShellState({
        loading,
        error: !!error,
        playerCount: peekPlayerCount,
        hasActiveFilters,
      }),
    [loading, error, peekPlayerCount, hasActiveFilters],
  );
  const activeState: PlayersShellState | undefined = state ?? derivedState;

  const handleRetry = useCallback(() => {
    if (onRetry) {
      onRetry();
      return;
    }
    refetch().catch((err: unknown) => {
      LOGGER.error(
        'PlayersScreen refetch failed',
        err instanceof Error ? err : String(err),
      );
    });
  }, [onRetry, refetch]);

  // Static placeholder until Slice 2 wires filter-aware counts.
  const totalPlayers = pageSize;
  const matchedPlayers = pageSize;

  return (
    <YStack flex={1} className="pp-screen" style={{ backgroundColor: BG_DARK }}>
      {/* Mobile readability tweaks (LS-4809): tighten outer padding, stack the
          featured spotlight, scale typography. Mirrors the inline-<style>
          responsive pattern used by PlayerStatsPage.tsx. */}
      {Platform.OS === 'web' && (
        <style>{`
          .pp-screen-inner { padding: 32px 24px 80px; gap: 28px; }
          @keyframes pp-shimmer { 0% { background-position: -480px 0; } 100% { background-position: 480px 0; } }
          .pp-sk-bar {
            display: inline-block;
            background: linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.14) 50%, rgba(255,255,255,0.04) 100%);
            background-size: 480px 100%;
            animation: pp-shimmer 1.4s linear infinite;
            border-radius: 4px;
          }
          @media (prefers-reduced-motion: reduce) {
            .pp-sk-bar { animation: none; background: rgba(255,255,255,0.08); }
          }
          .pp-sk-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
            gap: 16px;
          }
          @media (max-width: 640px) {
            .pp-screen-inner { padding: 20px 16px 56px; gap: 20px; }
            .pp-head { gap: 12px; }
            .pp-head-eyebrow { font-size: 10px; letter-spacing: 0.14em; }
            .pp-head-title { font-size: 34px !important; line-height: 1 !important; }
            .pp-head-lede { font-size: 15px; }
            .pp-head-sub { font-size: 13px; }
            .pp-head-count { align-self: flex-start; }
            .pp-featured { padding: 18px 18px !important; gap: 16px !important; }
            .pp-featured-mug { width: 64px !important; height: 64px !important; border-radius: 32px !important; }
            .pp-featured-mug-text { font-size: 22px !important; }
            .pp-featured-name { font-size: 26px !important; }
            .pp-featured-stats {
              padding-left: 0 !important;
              border-left-width: 0 !important;
              border-top-width: 1px;
              border-top-style: solid;
              border-top-color: rgba(255,255,255,0.08);
              padding-top: 14px;
              gap: 20px !important;
              width: 100%;
            }
            .pp-featured-stat-value { font-size: 24px !important; }
          }
        `}</style>
      )}
      <YStack
        className="pp-screen-inner"
        style={{
          maxWidth: 1280,
          width: '100%',
          margin: '0 auto',
        }}
      >
        {/* Editorial header — mirrors .pp-head from design players.css */}
        <XStack
          className="pp-head"
          justifyContent="space-between"
          alignItems="flex-end"
          gap="$6"
          flexWrap="wrap"
        >
          <YStack gap="$2" style={{ flex: 1, minWidth: 240 }}>
            <Text
              className="pp-head-eyebrow"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 11,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND_GOLD_LIGHT,
              }}
            >
              Players · The Roster Room
            </Text>
            <Text
              tag="h1"
              className="pp-head-title"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '800',
                fontSize:
                  Platform.OS === 'web'
                    ? ('clamp(38px, 4.4vw, 56px)' as unknown as number)
                    : 48,
                lineHeight:
                  Platform.OS === 'web' ? ('0.95' as unknown as number) : 48,
                letterSpacing: '-0.02em',
                color: TEXT_PRIMARY,
                margin: 0,
              }}
            >
              {title}
            </Text>
            <Text
              className="pp-head-lede"
              style={{
                fontFamily: FONT_BODY,
                fontStyle: 'italic',
                fontSize: 17,
                lineHeight:
                  Platform.OS === 'web' ? ('1.5' as unknown as number) : 26,
                color: TEXT_NEUTRAL_FG3,
                maxWidth: '56ch',
                margin: 0,
              }}
            >
              Scout every name on the wire — from cornerstone keepers to the
              waiver-wire dart throws that decide a season.
            </Text>
            <Text
              className="pp-head-sub"
              style={{
                fontFamily: FONT_BODY,
                fontSize: 14,
                lineHeight:
                  Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
                color: TEXT_NEUTRAL_FG3,
                maxWidth: '56ch',
                marginTop: 4,
              }}
            >
              Filter by position, sort by the numbers that matter, and pull up
              the card on anyone worth a deeper look.
            </Text>
          </YStack>

          {/* Count chip — right-aligned "N of M matched" indicator */}
          <XStack className="pp-head-count" alignItems="center" gap="$2">
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 13,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: TEXT_NEUTRAL_FG3,
              }}
            >
              <Text
                tag="strong"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '800',
                  color: BRAND_GOLD_LIGHT,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 16,
                }}
              >
                {matchedPlayers}
              </Text>{' '}
              of{' '}
              <Text
                tag="strong"
                style={{
                  fontFamily: FONT_DISPLAY,
                  fontWeight: '800',
                  color: BRAND_GOLD_LIGHT,
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 16,
                }}
              >
                {totalPlayers}
              </Text>{' '}
              matched
            </Text>
          </XStack>
        </XStack>

        {/* ARIA live region — announces shell state transitions to screen
            readers. Mirrors PlayerStatsPage.tsx (LS-4613). Off-screen via
            standard sr-only clip pattern. */}
        {Platform.OS === 'web' && (
          <div
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: 'hidden',
              clip: 'rect(0,0,0,0)',
              whiteSpace: 'nowrap',
              border: 0,
            }}
          >
            {activeState ? STATE_ANNOUNCEMENTS[activeState] : ''}
          </div>
        )}

        {/* Body — state card or populated Featured + grid. */}
        {activeState === 'loading' ? (
          <LoadingSkeleton viewMode={viewMode} />
        ) : activeState === 'error' ? (
          <ErrorState onRetry={handleRetry} />
        ) : activeState === 'empty' ? (
          <EmptyState onClear={onClearFilters} />
        ) : (
          <>
            {/* Featured spotlight — mirrors .pp-featured */}
            {showFeatured && featuredPlayer && (
              <FeaturedSpotlight player={featuredPlayer} />
            )}

            {/* Grid (filter rail / view toggle delivered in Slices 2-4).
                The editorial header above is the single h1 — pass an inner
                title distinct from `title` so PlayersGrid's H2 doesn't shadow
                the page heading and trip Playwright strict-mode lookups
                (LS-3497 / auth-flows.spec.ts:575). */}
            <PlayersGrid
              onPlayerSelect={handlePlayerSelect}
              pageSize={pageSize}
              showSearch={true}
              showSorting={true}
              title="Roster"
            />
          </>
        )}
      </YStack>
    </YStack>
  );
}

interface FeaturedSpotlightProps {
  player: PlayerFragment;
}

function FeaturedSpotlight({ player }: FeaturedSpotlightProps) {
  // No position data on the base Player fragment — fall back to the
  // utility/heritage gold accent so the 1px stripe still reads as branded.
  const stripeColor = POS_UTILITY;

  return (
    <XStack
      role="region"
      aria-label="Player spotlight"
      className="pp-featured"
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '28px 32px',
        gap: 32,
        alignItems: 'center',
        flexWrap: 'wrap',
        backgroundColor: SURFACE_CARD,
        backgroundImage:
          Platform.OS === 'web'
            ? `linear-gradient(110deg, ${withAlpha(
                BRAND_SEAM_RED,
                0.18,
              )} 0%, ${withAlpha(BRAND_NAVY, 0.45)} 38%, ${withAlpha(
                BG_DARK,
                0.95,
              )} 78%)`
            : undefined,
        borderWidth: 1,
        borderStyle: 'solid',
        borderColor: withAlpha(stripeColor, 0.28),
        borderRadius: 14,
      }}
    >
      {/* Position color stripe — exactly 1px per design + AGENTS.md rules */}
      <YStack
        aria-hidden={true}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 1,
          backgroundColor: stripeColor,
        }}
      />

      {/* Initials mug */}
      <YStack
        className="pp-featured-mug"
        style={{
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: withAlpha(stripeColor, 0.18),
          borderWidth: 2,
          borderStyle: 'solid',
          borderColor: withAlpha(stripeColor, 0.5),
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Text
          className="pp-featured-mug-text"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 32,
            color: TEXT_PRIMARY,
            letterSpacing: '0.02em',
          }}
        >
          {initialsOf(player)}
        </Text>
      </YStack>

      {/* Body */}
      <YStack style={{ flex: 1, minWidth: 220, gap: 6 }}>
        <Text
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '700',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: BRAND_GOLD_LIGHT,
          }}
        >
          Player Spotlight · This Week
        </Text>
        <Text
          tag="h2"
          className="pp-featured-name"
          style={{
            fontFamily: FONT_DISPLAY,
            fontWeight: '800',
            fontSize: 38,
            lineHeight: Platform.OS === 'web' ? ('1' as unknown as number) : 40,
            letterSpacing: '-0.01em',
            color: TEXT_PRIMARY,
            margin: 0,
          }}
        >
          {fullName(player) || 'Unknown Player'}
        </Text>
        {player.brefId && (
          <Text
            style={{
              fontFamily: FONT_BODY,
              fontStyle: 'italic',
              fontSize: 14,
              color: TEXT_NEUTRAL_FG3,
            }}
          >
            Baseball Reference · {player.brefId}
          </Text>
        )}
      </YStack>

      {/* Stats triplet — tabular nums. Until per-player batting/pitching
          stats flow through the Featured fragment, render the design's
          slot scaffold with em-dashes so spacing + typography still match. */}
      <XStack
        className="pp-featured-stats"
        style={{
          paddingLeft: 24,
          gap: 28,
          borderLeftWidth: 1,
          borderLeftStyle: 'solid',
          borderLeftColor: 'rgba(255,255,255,0.08)',
          flexWrap: 'wrap',
        }}
      >
        {(['AVG', 'HR', 'RBI'] as const).map((label, i) => (
          <YStack key={label} style={{ gap: 4 }}>
            <Text
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '700',
                fontSize: 10,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: TEXT_MUTED,
              }}
            >
              {label}
            </Text>
            <Text
              className="pp-featured-stat-value"
              style={{
                fontFamily: FONT_DISPLAY,
                fontWeight: '800',
                fontSize: 30,
                lineHeight:
                  Platform.OS === 'web' ? ('1' as unknown as number) : 32,
                color: i === 0 ? BRAND_GOLD_LIGHT : TEXT_PRIMARY,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              —
            </Text>
          </YStack>
        ))}
      </XStack>
    </XStack>
  );
}

// ── Conditional state primitives ───────────────────────────────────────────────

interface SkeletonBarProps {
  width: number | string;
  height?: number;
  radius?: number | string;
}

/** Shimmer bar (web) or static dim fill (native). Honors prefers-reduced-motion via CSS. */
function SkeletonBar({ width, height = 12, radius = 4 }: SkeletonBarProps) {
  if (Platform.OS === 'web') {
    return (
      <span
        className="pp-sk-bar"
        style={
          {
            width,
            height,
            borderRadius: radius,
            flex: '0 0 auto',
          } as React.CSSProperties
        }
      />
    );
  }
  return (
    <YStack
      style={{
        width: typeof width === 'string' ? undefined : width,
        height,
        borderRadius: typeof radius === 'string' ? 4 : radius,
        backgroundColor: 'rgba(255,255,255,0.08)',
      }}
    />
  );
}

/** Card-shaped skeleton matching the populated PlayerCard footprint. */
function CardSkeleton() {
  return (
    <YStack
      style={{
        padding: 18,
        background: SURFACE_CARD,
        border: `1px solid ${OVERLAY_WHITE_05}`,
        borderRadius: 14,
        gap: 12,
        minHeight: 198,
      }}
    >
      <XStack alignItems="center" style={{ gap: 12 }}>
        <SkeletonBar width={48} height={48} radius="50%" />
        <YStack style={{ flex: 1, gap: 6 }}>
          <SkeletonBar width="70%" height={18} />
          <SkeletonBar width="45%" height={12} />
        </YStack>
        <SkeletonBar width={30} height={18} />
      </XStack>
      <SkeletonBar width="100%" height={54} radius={6} />
      <XStack justifyContent="space-between" alignItems="center">
        <SkeletonBar width="40%" height={12} />
        <SkeletonBar width={80} height={18} radius={9999} />
      </XStack>
    </YStack>
  );
}

interface LoadingSkeletonProps {
  viewMode: PlayersViewMode;
}

/** Geometry-matching skeleton for the active view mode. */
function LoadingSkeleton({ viewMode }: LoadingSkeletonProps) {
  if (viewMode === 'list') {
    return (
      <YStack
        testID="players-loading-skeleton"
        role="presentation"
        aria-hidden={true}
        style={{ gap: 8 }}
      >
        {Array.from({ length: 6 }).map((_, i) => (
          <XStack
            key={i}
            alignItems="center"
            style={{
              gap: 12,
              padding: 12,
              background: SURFACE_CARD,
              border: `1px solid ${OUTLINE_SUBTLE}`,
              borderRadius: 8,
            }}
          >
            <SkeletonBar width={36} height={36} radius="50%" />
            <YStack style={{ flex: 1, gap: 6 }}>
              <SkeletonBar width={160} height={16} />
              <SkeletonBar width={220} height={12} />
            </YStack>
            <SkeletonBar width={50} height={24} />
            <SkeletonBar width={50} height={24} />
            <SkeletonBar width={50} height={24} />
          </XStack>
        ))}
      </YStack>
    );
  }

  if (viewMode === 'stats') {
    return (
      <YStack
        testID="players-loading-skeleton"
        role="presentation"
        aria-hidden={true}
        style={{
          background: BG_ELEVATED,
          border: `1px solid ${OUTLINE_SUBTLE}`,
          borderRadius: 12,
          padding: 18,
          gap: 10,
        }}
      >
        {Array.from({ length: 8 }).map((_, r) => (
          <XStack
            key={r}
            alignItems="center"
            style={{
              gap: 12,
              padding: '10px 8px',
              borderBottom: `1px solid ${withAlpha(BRAND_GOLD, 0.06)}`,
            }}
          >
            <SkeletonBar width={180} height={14} />
            {Array.from({ length: 8 }).map((__, c) => (
              <SkeletonBar key={c} width={42} height={12} />
            ))}
          </XStack>
        ))}
      </YStack>
    );
  }

  // cards (default)
  return (
    <YStack
      testID="players-loading-skeleton"
      role="presentation"
      aria-hidden={true}
      className={Platform.OS === 'web' ? 'pp-sk-grid' : undefined}
      style={
        Platform.OS === 'web' ? undefined : { gap: 16, flexDirection: 'column' }
      }
    >
      {Array.from({ length: 8 }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </YStack>
  );
}

interface ErrorStateProps {
  onRetry?: () => void;
}

function ErrorState({ onRetry }: ErrorStateProps) {
  return (
    <YStack
      testID="players-error-state"
      role="alert"
      aria-live="assertive"
      style={{
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        // BRAND_SEAM_RED border per AC1 — same treatment as the Stats Page
        // ErrorCard so the two pages read as a single design system.
        border: `1px solid ${BRAND_SEAM_RED}`,
        borderRadius: 14,
        alignItems: 'center',
        gap: 12,
      }}
    >
      {Platform.OS === 'web' && (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={BRAND_SEAM_RED}
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
      <Text
        tag="h3"
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        }}
      >
        Connection lost
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        }}
      >
        The archive didn't respond. Check your connection or try again — most
        roster queries take only a moment.
      </Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading players"
          style={{
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: WHITE,
            }}
          >
            Retry
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

interface EmptyStateProps {
  onClear?: () => void;
}

function EmptyState({ onClear }: EmptyStateProps) {
  return (
    <YStack
      testID="players-empty-state"
      role="status"
      style={{
        alignSelf: 'center',
        maxWidth: 520,
        width: '100%',
        margin: '32px auto',
        padding: '40px 28px',
        background: BG_ELEVATED,
        border: `1px solid ${OUTLINE_SUBTLE}`,
        borderRadius: 14,
        alignItems: 'center',
        gap: 12,
      }}
    >
      {Platform.OS === 'web' && (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke={TEXT_MUTED}
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
        style={{
          fontFamily: FONT_DISPLAY,
          fontWeight: '800',
          fontSize: 24,
          color: TEXT_PRIMARY,
          margin: 0,
          textAlign: 'center',
        }}
      >
        Nothing to show with those filters
      </Text>
      <Text
        style={{
          fontFamily: FONT_BODY,
          fontSize: 14,
          color: TEXT_MUTED,
          textAlign: 'center',
          maxWidth: '60ch',
          lineHeight:
            Platform.OS === 'web' ? ('1.55' as unknown as number) : 22,
          margin: 0,
        }}
      >
        No players match the current filters. Try widening your search, relaxing
        a range, or clearing filters entirely.
      </Text>
      {onClear && (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          style={{
            marginTop: 8,
            paddingVertical: 10,
            paddingHorizontal: 22,
            borderRadius: 9999,
            backgroundColor: BRAND_NAVY,
            minHeight: 44,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: FONT_DISPLAY,
              fontWeight: '700',
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: WHITE,
            }}
          >
            Clear all filters
          </Text>
        </Pressable>
      )}
    </YStack>
  );
}

export { PlayersScreen };

import React, { useCallback, useEffect, useMemo } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { PlayersGrid } from './PlayersGrid';
import { PlayerFragment, useGetAllPlayersQuery } from './PlayersApi';
import { Platform } from '../../platform-components';
import {
  BG_DARK,
  BRAND_GOLD_LIGHT,
  BRAND_NAVY,
  BRAND_SEAM_RED,
  POS_UTILITY,
  SURFACE_CARD,
  TEXT_MUTED,
  TEXT_NEUTRAL_FG3,
  TEXT_PRIMARY,
  withAlpha,
} from '../../utils/colors';

const FONT_DISPLAY = "'Big Shoulders Display', sans-serif";
const FONT_BODY = "'Literata', serif";

// `as unknown as number` is the project's documented workaround for passing
// raw CSS strings (clamp(), unitless line-height) through Tamagui's numeric
// fontSize / lineHeight typings on web. See
// .agents/skills/standards/references/tamagui-web-pitfalls.md and the same
// pattern in PlayerStatsPage.tsx (LS-4613). Native branches always supply
// real numbers, so the cast only takes effect under Platform.OS === 'web'.

export interface PlayersScreenProps {
  onPlayerSelect?: (player: PlayerFragment) => void;
  pageSize?: number;
  title?: string;
  /** Render the Featured player spotlight above the grid. Default: true. */
  showFeatured?: boolean;
}

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
  const { data, error } = useGetAllPlayersQuery({
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

  // Static placeholder until Slice 2 wires filter-aware counts.
  const totalPlayers = pageSize;
  const matchedPlayers = pageSize;

  return (
    <YStack flex={1} style={{ backgroundColor: BG_DARK }}>
      <YStack
        style={{
          maxWidth: 1280,
          width: '100%',
          margin: '0 auto',
          padding: '32px 24px 80px',
          gap: 28,
        }}
      >
        {/* Editorial header — mirrors .pp-head from design players.css */}
        <XStack
          justifyContent="space-between"
          alignItems="flex-end"
          gap="$6"
          flexWrap="wrap"
        >
          <YStack gap="$2" style={{ flex: 1, minWidth: 240 }}>
            <Text
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
          <XStack alignItems="center" gap="$2">
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

        {/* Featured spotlight — mirrors .pp-featured */}
        {showFeatured && featuredPlayer && (
          <FeaturedSpotlight player={featuredPlayer} />
        )}

        {/* Grid (filter rail / view toggle / state cards delivered in Slices 2-5).
            The editorial header above is the single h1 — pass an inner title
            distinct from `title` so PlayersGrid's H2 doesn't shadow the page
            heading and trip Playwright strict-mode `name: /all players/i`
            lookups (LS-3497 / auth-flows.spec.ts:575). */}
        <PlayersGrid
          onPlayerSelect={handlePlayerSelect}
          pageSize={pageSize}
          showSearch={true}
          showSorting={true}
          title="Roster"
        />
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

export { PlayersScreen };

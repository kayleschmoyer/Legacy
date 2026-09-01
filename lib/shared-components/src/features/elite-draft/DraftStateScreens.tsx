import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';
import { brand, scaleDark, withAlpha } from '@legacy-sports/design-tokens';
import { SkeletonCard } from './SkeletonCard';
import { Skeleton } from '../../components/Skeleton';
import { csp } from '../players/crossPlatformStyle';

// Matches the sticky nav height the live draft board root also sits below,
// so these full-screen states stay flush with the nav bar.
const NAV_HEIGHT_PX = 75;
const NAV_Z_INDEX = 200;

// Fixed "night stadium" bloom — deliberately not theme-adaptive (matches the
// original decorative background layer, which was also a static dark wash
// regardless of light/dark mode). Colors resolved via `withAlpha` from named
// design tokens rather than literal hex/rgba (theme-compliance ratchet).
const BG_FX_IMAGE = [
  `radial-gradient(ellipse 80% 50% at 15% 15%, ${withAlpha(brand.gold, 0.06)} 0%, transparent 60%)`,
  `radial-gradient(ellipse 60% 40% at 85% 80%, ${withAlpha(brand.navy, 0.08)} 0%, transparent 60%)`,
  `radial-gradient(ellipse 40% 30% at 50% 50%, ${withAlpha(scaleDark.blue9, 0.04)} 0%, transparent 60%)`,
].join(', ');

/**
 * Shared full-screen root for every draft-board state screen. `position:
 * fixed` has no Tamagui/RN prop — the `style` escape hatch is a web-only
 * capability shim (this file has no `.native` counterpart), not a layout
 * branch.
 */
function DraftRootShell({
  children,
  testID,
  role,
  'aria-live': ariaLive,
  'aria-busy': ariaBusy,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  testID?: string;
  role?: 'status';
  'aria-live'?: 'polite' | 'assertive' | 'off';
  'aria-busy'?: boolean;
  'aria-label'?: string;
}): React.JSX.Element {
  return (
    <YStack
      testID={testID}
      role={role}
      aria-live={ariaLive}
      aria-busy={ariaBusy}
      aria-label={ariaLabel}
      style={{
        position: 'fixed',
        top: NAV_HEIGHT_PX,
        right: 0,
        bottom: 0,
        left: 0,
      }}
      zIndex={NAV_Z_INDEX - 2}
      backgroundColor="$background"
      overflow="hidden"
      animation="quick"
      enterStyle={{ opacity: 0, y: 12 }}
      opacity={1}
      y={0}
    >
      <YStack
        position="absolute"
        inset={0}
        pointerEvents="none"
        style={{ backgroundImage: BG_FX_IMAGE }}
      />
      {children}
    </YStack>
  );
}

interface StateScreenProps {
  icon: string;
  iconLabel: string;
  title: string;
  description: string;
  buttonText?: string;
  onButtonClick?: () => void;
}

function StateScreen({
  icon,
  iconLabel,
  title,
  description,
  buttonText,
  onButtonClick,
}: StateScreenProps): React.JSX.Element {
  return (
    <DraftRootShell>
      <YStack
        flex={1}
        alignItems="center"
        justifyContent="center"
        gap="$4"
        padding="$8"
        position="relative"
        zIndex={1}
      >
        <Text fontSize={56} lineHeight={56} role="img" aria-label={iconLabel}>
          {icon}
        </Text>
        <Text
          fontFamily="$heading"
          fontWeight="800"
          fontSize={36}
          color="$brandGold"
          letterSpacing={0.7}
          textAlign="center"
        >
          {title}
        </Text>
        <Text
          fontSize={14}
          color="$textMuted"
          maxWidth={380}
          lineHeight={21}
          textAlign="center"
        >
          {description}
        </Text>
        {buttonText && onButtonClick && (
          <Button
            onPress={onButtonClick}
            backgroundColor="$brandGold"
            color="white"
            fontWeight="700"
            fontSize={14}
            height={44}
            paddingHorizontal={28}
            borderRadius="$4"
            pressStyle={{ scale: 0.98 }}
            hoverStyle={{ backgroundColor: '$brandGoldDark' }}
          >
            {buttonText}
          </Button>
        )}
      </YStack>
    </DraftRootShell>
  );
}

export function NoLeagueScreen({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon="⚾"
      iconLabel="baseball"
      title="Live Draft Board"
      description="Navigate to a league and start a live draft from the commissioner panel."
      buttonText="Go to Leagues"
      onButtonClick={() => onNavigate('/baseball')}
    />
  );
}

const RAIL_PANELS = [
  { title: 160, subtitle: 220, rows: [56, 56, 56] },
  { title: 120, subtitle: null, rows: [28, 28, 28] },
  { title: 110, subtitle: null, rows: [14, 14, 14, 14, 14, 14, 14, 14] },
  { title: 120, subtitle: null, rows: [36, 36, 36, 36, 36] },
] as const;

const PILL_WIDTHS = [72, 48, 52, 52, 52, 52, 56, 48] as const;

export function LoadingScreen(): React.JSX.Element {
  return (
    <DraftRootShell
      testID="draft-board-loading"
      role="status"
      aria-live="polite"
      aria-busy
      aria-label="Loading draft board"
    >
      <YStack
        testID="draft-loading-layout"
        flex={1}
        position="relative"
        zIndex={1}
        overflow="hidden"
      >
        {/* TOPBAND skeleton — mirrors DraftTopBand's 5-column layout: status ·
            divider · timer · current-pick slab · autopick toggle. */}
        <XStack
          testID="draft-loading-topband"
          aria-hidden
          flexShrink={0}
          backgroundColor="$surfaceSubtle"
          borderBottomWidth={1}
          borderBottomColor="$borderColor"
          paddingHorizontal="$5"
          paddingVertical="$3"
          gap="$4"
          alignItems="center"
        >
          <YStack testID="draft-loading-tb-status" gap="$1">
            <Skeleton width={76} height={11} />
            <Skeleton width={90} height={20} />
            <Skeleton width={130} height={11} />
          </YStack>
          <YStack width={1} height={52} backgroundColor="$borderColor" />
          <XStack testID="draft-loading-tb-timer" alignItems="center" gap="$3">
            <Skeleton width={58} height={58} radius={29} />
            <YStack gap="$2">
              <Skeleton width={64} height={10} />
              <Skeleton width={48} height={10} />
            </YStack>
          </XStack>
          <XStack
            testID="draft-loading-tb-clock"
            flex={1}
            alignItems="center"
            gap="$3"
            backgroundColor="$surfacePanel"
            borderWidth={1}
            borderColor="$borderColor"
            borderRadius="$4"
            paddingHorizontal="$3"
            paddingVertical="$2"
          >
            <YStack flex={1} gap="$2">
              <Skeleton width={92} height={10} />
              <Skeleton width={170} height={20} />
              <Skeleton width={140} height={11} />
            </YStack>
          </XStack>
          <YStack testID="draft-loading-tb-autopick" gap="$2">
            <Skeleton width={110} height={10} />
            <XStack alignItems="center" gap="$2">
              <Skeleton width={34} height={20} radius={9999} />
              <Skeleton width={26} height={12} />
            </XStack>
            <Skeleton width={118} height={10} />
          </YStack>
        </XStack>

        <XStack flex={1} overflow="hidden">
          {/* MAIN skeleton — view tabs, controls toolbar, filter pills, card grid. */}
          <YStack
            testID="draft-loading-main"
            flex={1}
            padding="$4"
            gap="$3"
            overflow="hidden"
          >
            <XStack gap="$5">
              <Skeleton width={90} height={14} />
              <Skeleton width={110} height={14} />
              <Skeleton width={108} height={14} />
              <Skeleton width={118} height={14} />
            </XStack>
            <XStack gap="$3">
              <Skeleton width="100%" height={36} />
              <Skeleton width={180} height={36} />
            </XStack>
            <XStack gap="$2" flexWrap="wrap">
              {PILL_WIDTHS.map((w, i) => (
                <Skeleton key={i} width={w} height={32} radius={9999} />
              ))}
            </XStack>
            {/* Same CSS Grid the real player-pool grid uses (DraftPlayerBoard's
                `gridCols` for viewMode 'grid': `repeat(auto-fill,
                minmax(320px, 1fr))`, gap 14) — LS-9364. SkeletonCard's own
                bars are percentage-widths, which need a definite-width
                parent to resolve against; the previous `flexWrap` XStack gave
                each card no explicit width, so it collapsed to ~34px instead
                of the ~320-390px real cards render at, and swapping the
                skeleton for real data visibly reflowed the whole grid. */}
            <YStack
              testID="draft-loading-player-grid"
              style={csp({
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                gap: 14,
              })}
            >
              {Array.from({ length: 9 }).map((_, i) => (
                <SkeletonCard key={i} delay={i * 0.06} />
              ))}
            </YStack>
          </YStack>

          {/* RIGHT RAIL skeleton — intel · queue · roster · history panels. */}
          <YStack
            testID="draft-loading-rail"
            aria-hidden
            width={320}
            flexShrink={0}
            borderLeftWidth={1}
            borderLeftColor="$borderColor"
            backgroundColor="$surfaceSubtle"
            padding="$3"
            gap="$3"
            overflow="hidden"
          >
            {RAIL_PANELS.map((panel, i) => (
              <YStack
                key={i}
                testID="draft-loading-rail-panel"
                backgroundColor="$surfacePanel"
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$5"
                padding="$3"
                gap="$2"
              >
                <Skeleton width={panel.title} height={12} />
                {panel.subtitle && (
                  <Skeleton width={panel.subtitle} height={10} />
                )}
                <YStack gap="$2">
                  {panel.rows.map((h, ri) => (
                    <Skeleton key={ri} height={h} />
                  ))}
                </YStack>
              </YStack>
            ))}
          </YStack>
        </XStack>
      </YStack>

      {/* Visually hidden status text so screen readers announce the loading
          state without disturbing the skeleton geometry. */}
      <Text
        position="absolute"
        width={1}
        height={1}
        padding={0}
        margin={-1}
        overflow="hidden"
        whiteSpace="nowrap"
        borderWidth={0}
        style={{ clip: 'rect(0,0,0,0)' }}
      >
        Loading draft board...
      </Text>
    </DraftRootShell>
  );
}

export function LeagueErrorScreen({
  isUnauthorized,
  onNavigate,
}: {
  isUnauthorized: boolean;
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon={isUnauthorized ? '🔒' : '⚠️'}
      iconLabel={isUnauthorized ? 'lock' : 'warning'}
      title={isUnauthorized ? 'Access Denied' : 'League Not Found'}
      description={
        isUnauthorized
          ? "You don't have access to this draft room."
          : "This league doesn't exist or the draft room is unavailable."
      }
      buttonText="Back to Leagues"
      onButtonClick={() => onNavigate('/baseball')}
    />
  );
}

export function PlayersErrorScreen({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon="⚠️"
      iconLabel="warning"
      title="Failed to Load Players"
      description={message || 'An error occurred while fetching player data.'}
      buttonText="Try Again"
      onButtonClick={onRetry}
    />
  );
}

export function AutomatedDraftScreen(): React.JSX.Element {
  return (
    <StateScreen
      icon="⚙️"
      iconLabel="gear"
      title="Draft in Progress"
      description="Results will appear when the automated draft is complete."
    />
  );
}

/**
 * Shown in the compact/narrow-viewport branch when the draft is an auction —
 * AuctionDraftRoom is wide-layout-only for now (LS-9207). Whether to build a
 * compact auction UI is a deferred product decision (tracked as AC6 on the
 * original LS-9066), not a capability gap, so this is a viewport-gated state
 * screen rather than a platform check.
 */
export function AuctionNotSupportedScreen({
  leagueId,
  onNavigate,
}: {
  leagueId: number | null;
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  return (
    <StateScreen
      icon="🏷️"
      iconLabel="auction tag"
      title="Auction Draft"
      description="Auction drafts aren't available on this screen size yet. Widen your browser window or use a larger device to participate."
      buttonText="Back to League"
      onButtonClick={() =>
        onNavigate(leagueId ? `/baseball/league/${leagueId}` : '/baseball')
      }
    />
  );
}

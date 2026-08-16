/**
 * DraftMyPickSplash — the my-pick splash overlay for the Draft Room v2
 * (LS-9402) README "My-pick splash (overlay)". Renders the front item of
 * LS-9397's pickSplashQueue state: full-screen scrim, bottom-anchored card,
 * confetti burst (gated on the same `celebrate` flag DraftPickAnnouncement
 * already consumes — AC3), auto-dismiss ~2.8s or tap.
 *
 * Cross-platform in one file (unlike DraftPickAnnouncement's native/web
 * split): only the confetti piece needs a capability shim, so the card/scrim
 * markup below sticks to plain Tamagui primitives that already work on both
 * platforms.
 */
import React, { useEffect } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { PickSplashQueueItem } from './hooks/useDraftUIState';
import { DraftPickSplashConfetti } from './DraftPickSplashConfetti';
import { initialsOf } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor, withAlpha } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

const SPLASH_DISMISS_MS = 2800;

function nameOf(item: PickSplashQueueItem): string {
  const { player } = item;
  return 'name' in player
    ? player.name
    : `${player.firstName} ${player.lastName}`.trim();
}

function positionOf(item: PickSplashQueueItem): string | null {
  const { player } = item;
  return 'position' in player
    ? player.position
    : (player.eligiblePositions?.[0] ?? null);
}

/** Projected points — `ppg` on a resolved DraftPlayer, or the socket-payload
 *  equivalent field on the leaner AvailableDraftPlayer shape. */
function projPtsOf(item: PickSplashQueueItem): number | null {
  const { player } = item;
  // Discriminate on `name` (a required field on DraftPlayer, absent from
  // AvailableDraftPlayer) rather than the optional `ppg` — `in` narrowing
  // can't rule DraftPlayer out of the else branch when the checked key is
  // itself optional on that type (TS2339 on `projectedMatchupPoints`).
  return 'name' in player
    ? (player.ppg ?? null)
    : (player.projectedMatchupPoints ?? null);
}

export interface DraftMyPickSplashProps {
  /** LS-9397's splash queue — only the front item renders. */
  queue: readonly PickSplashQueueItem[];
  /** Dequeues the front item — called on auto-dismiss or tap. */
  onDismiss: () => void;
  sport: SportKind;
  /** Confetti on/off — the same flag DraftPickAnnouncement's `celebrate` prop consumes (AC3). */
  celebrate: boolean;
}

export function DraftMyPickSplash({
  queue,
  onDismiss,
  sport,
  celebrate,
}: DraftMyPickSplashProps): React.JSX.Element | null {
  const palette = useDraftPalette();
  const item = queue[0];

  useEffect(() => {
    if (!item) return undefined;
    const timer = setTimeout(onDismiss, SPLASH_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  if (!item) return null;

  const name = nameOf(item);
  const position = positionOf(item);
  const projPts = projPtsOf(item);
  const positionColor = position
    ? getPositionColor(sport, position)
    : palette.gold.gold;
  const meta = position
    ? projPts != null
      ? `${position} · PROJ ${projPts.toFixed(1)}`
      : position
    : null;

  return (
    <YStack
      testID="draft-my-pick-splash"
      role="button"
      tabIndex={0}
      accessibilityRole="button"
      aria-label={`With pick number ${item.pickNumber}, you select ${name}. Tap to dismiss.`}
      accessibilityLabel={`With pick number ${item.pickNumber}, you select ${name}. Tap to dismiss.`}
      onPress={onDismiss}
      cursor="pointer"
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={95}
    >
      <YStack
        flex={1}
        backgroundColor={palette.scrim}
        justifyContent="flex-end"
        alignItems="center"
        padding="$5"
      >
        <YStack
          width="100%"
          marginBottom={30}
          backgroundColor="$surfaceRaised"
          borderWidth={1}
          borderColor="$brandGold"
          borderRadius={18}
          padding="$5"
          alignItems="center"
          animation="quick"
          enterStyle={{ opacity: 0, y: 48 }}
        >
          <YStack
            width={64}
            height={64}
            borderRadius={32}
            borderWidth={2}
            borderColor={positionColor}
            backgroundColor={withAlpha(positionColor, 0.18)}
            alignItems="center"
            justifyContent="center"
            marginBottom={10}
          >
            <Text
              fontFamily="$heading"
              fontSize={22}
              fontWeight="800"
              color={positionColor}
            >
              {initialsOf(name)}
            </Text>
          </YStack>

          <Text
            fontSize={10}
            fontWeight="700"
            letterSpacing={2.5}
            textTransform="uppercase"
            color="$brandGoldLight"
            textAlign="center"
          >
            {`WITH PICK #${item.pickNumber}, YOU SELECT`}
          </Text>
          <Text
            fontFamily="$heading"
            fontSize={30}
            fontWeight="800"
            color="$color"
            marginTop={4}
            textAlign="center"
          >
            {name}
          </Text>
          {meta && (
            <XStack marginTop={4}>
              <Text fontSize={13} color="$textMuted" textAlign="center">
                {meta}
              </Text>
            </XStack>
          )}
        </YStack>
      </YStack>

      {celebrate && <DraftPickSplashConfetti seed={item.pickNumber} />}
    </YStack>
  );
}

export default DraftMyPickSplash;

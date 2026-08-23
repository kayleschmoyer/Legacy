/**
 * DraftPickToast — the AI-pick toast overlay for the Draft Room v2 (LS-9402)
 * README "AI-pick toast (overlay)". Renders the front item of LS-9397's
 * pickToastQueue state: slide-down card, auto-dismisses after ~1.9s (or the
 * next queued toast takes its place once dequeued).
 */
import React, { useEffect } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { PickToastQueueItem } from './hooks/useDraftUIState';
import { getPickQuality } from './draftUtils';
import { PositionBadge } from '../../components/PositionBadge';
import { StatusBadge } from '../../components/StatusBadge';
import { getPositionColor } from '../../utils/colors';
import type { SportKind } from '../../config/sports';

const TOAST_DISMISS_MS = 1900;

function nameOf(item: PickToastQueueItem): string {
  const { player } = item;
  return 'name' in player
    ? player.name
    : `${player.firstName} ${player.lastName}`.trim();
}

function positionOf(item: PickToastQueueItem): string | null {
  const { player } = item;
  return 'position' in player
    ? player.position
    : (player.eligiblePositions?.[0] ?? null);
}

export interface DraftPickToastProps {
  /** LS-9397's toast queue — only the front item renders. */
  queue: readonly PickToastQueueItem[];
  /** Dequeues the front item — called on auto-dismiss. */
  onDismiss: () => void;
  sport: SportKind;
}

export function DraftPickToast({
  queue,
  onDismiss,
  sport,
}: DraftPickToastProps): React.JSX.Element | null {
  const item = queue[0];

  useEffect(() => {
    if (!item) return undefined;
    const timer = setTimeout(onDismiss, TOAST_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  if (!item) return null;

  const position = positionOf(item);
  const positionColor = position
    ? getPositionColor(sport, position)
    : undefined;
  // README "AI-pick toast": eyebrow reads "PICK r.p · TEAM" for a regular
  // pick, or "AUTO PICK ·" for an auto-pick — matches LS-9402 AC1 verbatim.
  const eyebrow = item.isAuto
    ? 'AUTO PICK ·'
    : `PICK ${item.round}.${item.roundPickNumber} · ${item.teamName}`;
  const pickQuality = getPickQuality(item.pickNumber, item.player.adp);

  return (
    <YStack
      testID="draft-pick-toast"
      position="absolute"
      top={104}
      left={12}
      right={12}
      zIndex={90}
      backgroundColor="$surfaceRaised"
      borderWidth={1}
      borderColor="$outlineDefault"
      borderRadius={14}
      paddingVertical={10}
      paddingHorizontal={12}
      animation="quick"
      enterStyle={{ opacity: 0, y: -20 }}
      shadowColor="$shadowColor"
      shadowOffset={{ width: 0, height: 12 }}
      shadowRadius={20}
    >
      <XStack alignItems="center" gap={10}>
        {position && (
          <PositionBadge
            position={position}
            color={positionColor}
            shape="circle"
            size={34}
            variant="alpha"
          />
        )}
        <YStack flex={1} minWidth={0}>
          <Text
            fontSize={9}
            fontWeight="700"
            letterSpacing={1}
            textTransform="uppercase"
            color="$fg4"
            numberOfLines={1}
          >
            {eyebrow}
          </Text>
          <XStack alignItems="center" gap={6}>
            <Text
              fontSize={14}
              fontWeight="700"
              color="$color"
              numberOfLines={1}
            >
              {nameOf(item)}
            </Text>
            {pickQuality && (
              <StatusBadge
                label={pickQuality.label}
                variant={pickQuality.variant}
                size="xs"
              />
            )}
          </XStack>
        </YStack>
        <Text
          fontFamily="$heading"
          fontSize={16}
          fontWeight="800"
          color="$brandGold"
        >
          {`#${item.pickNumber}`}
        </Text>
      </XStack>
    </YStack>
  );
}

export default DraftPickToast;

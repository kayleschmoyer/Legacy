import React, { useEffect, useMemo, useState } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { Text, YStack } from 'tamagui';
import { colors, semantic, withAlpha } from '@legacy-sports/design-tokens';
import { type DraftPlayer } from './types';
import { CONFETTI_COLORS } from './constants';
import { getPositionColor } from './utils';
import { BaseballCard } from './BaseballCard';

// ---------------------------------------------------------------------------
// Pick Announcement Sub-component
// ---------------------------------------------------------------------------

const CONFETTI_PIECES = 24;
const FALL_DISTANCE = 120;

// Semantic status colors from the shared token set — a warning/success/info
// triplet reads the same "auto-pick / your pick / opponent pick" intent as
// the original amber/green/blue palette without hardcoding hex/rgba here
// (theme-compliance ratchet).
const LABEL_COLORS = {
  auto: {
    bg: semantic.warningSoft,
    fg: semantic.warningFg,
    border: semantic.warningBorder,
  },
  mine: {
    bg: semantic.successSoft,
    fg: semantic.successFg,
    border: semantic.successBorder,
  },
  opp: {
    bg: semantic.infoSoft,
    fg: semantic.infoFg,
    border: semantic.infoBorder,
  },
} as const;

interface ConfettiPiece {
  key: string;
  left: `${number}%`;
  color: string;
  delayMs: number;
  size: number;
  radius: number;
  spin: number;
}

/** Deterministic-per-mount confetti geometry; regenerated on each new pick. */
function useConfettiGeometry(seed: number): ConfettiPiece[] {
  return useMemo(
    () =>
      Array.from(
        { length: CONFETTI_PIECES },
        (_, i): ConfettiPiece => ({
          key: `${seed}-${i}`,
          left: `${Math.round(4 + Math.random() * 92)}%`,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          delayMs: Math.random() * 600,
          size: 4 + Math.random() * 4,
          radius: Math.random() > 0.5 ? 50 : 10,
          spin: 720,
        }),
      ),
    [seed],
  );
}

/** A single falling/spinning/fading piece, driven by Tamagui's `animation`
 * prop rather than react-native's `Animated` — the latter needs a native
 * runtime that this web-only file's jsdom test environment doesn't provide. */
function ConfettiPieceView({
  piece,
}: {
  piece: ConfettiPiece;
}): React.JSX.Element {
  const [fallen, setFallen] = useState(false);

  useEffect(() => {
    setFallen(false);
    const timer = setTimeout(() => setFallen(true), piece.delayMs);
    return () => clearTimeout(timer);
  }, [piece.delayMs, piece.key]);

  return (
    <YStack
      position="absolute"
      left={piece.left}
      top={-8}
      width={piece.size}
      height={piece.size}
      borderRadius={piece.radius}
      backgroundColor={piece.color}
      animation="slow"
      opacity={fallen ? 0 : 1}
      y={fallen ? FALL_DISTANCE : 0}
      rotate={fallen ? `${piece.spin}deg` : '0deg'}
    />
  );
}

function Confetti({ seed }: { seed: number }): React.JSX.Element {
  const pieces = useConfettiGeometry(seed);

  return (
    <YStack
      testID="draft-announce-confetti"
      position="absolute"
      top={0}
      left={0}
      right={0}
      height="100%"
      overflow="hidden"
      pointerEvents="none"
    >
      {pieces.map((piece) => (
        <ConfettiPieceView key={piece.key} piece={piece} />
      ))}
    </YStack>
  );
}

export function PickAnnouncement({
  player,
  pickNumber,
  round,
  roundPickNumber,
  isMyPick,
  isAuto,
  autoPickReason,
  leaving,
  onDismiss,
  commentary,
  header,
  footer,
}: {
  player: DraftPlayer;
  pickNumber: number;
  round: number;
  roundPickNumber: number;
  isMyPick: boolean;
  isAuto: boolean;
  autoPickReason?: string | null;
  leaving: boolean;
  onDismiss: () => void;
  commentary?: string;
  /**
   * Rendered in the card's flow above the pick label — the spectator splash's
   * headshot + drafting team (LS-10593). It used to be a separate fixed
   * overlay pinned on top of this card, which covered the label and the
   * card's banner.
   */
  header?: React.ReactNode;
  /**
   * Rendered in the card's flow under the commentary — the spectator's
   * highlight video / stat graphic and catch-up badge. In-flow so nothing is
   * ever layered over the YouTube player (LS-9113 RMF rules).
   */
  footer?: React.ReactNode;
}): React.JSX.Element {
  const posColor = getPositionColor('baseball', player.position);
  const labelColor = isAuto
    ? LABEL_COLORS.auto
    : isMyPick
      ? LABEL_COLORS.mine
      : LABEL_COLORS.opp;
  const labelText = isAuto
    ? '⏱ AUTO-DRAFTED'
    : isMyPick
      ? '🎉 YOUR PICK'
      : '📋 OPPONENT PICK';

  return (
    <YStack
      testID="draft-announce-overlay"
      role="alert"
      aria-live="assertive"
      onPress={onDismiss}
      // `position: fixed` has no Tamagui/RN prop — this file is web-only
      // (no `.native` counterpart), so the raw style escape hatch is a
      // capability shim, not a layout branch.
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backdropFilter: 'blur(6px)',
        // Spectator splash with media can outgrow short viewports.
        overflowY: 'auto',
      }}
      zIndex={9999}
      alignItems="center"
      justifyContent="flex-start"
      paddingTop={header || footer ? 24 : 60}
      paddingBottom={24}
      backgroundColor={withAlpha(colors.dark.surface.bg, 0.45)}
      animation="quick"
      opacity={leaving ? 0 : 1}
      pointerEvents={leaving ? 'none' : 'auto'}
    >
      <YStack
        onPress={(e: GestureResponderEvent) => e.stopPropagation()}
        testID="draft-announce"
        position="relative"
        // Wider when hosting the spectator's media footer (480px video).
        width={footer ? 560 : 440}
        maxWidth="92%"
        overflow="hidden"
        borderRadius="$8"
        borderWidth={1}
        borderColor="$borderColor"
        backgroundColor="$surfaceRaised"
        animation="quick"
        enterStyle={{ opacity: 0, y: -40, scale: 0.92 }}
        opacity={leaving ? 0 : 1}
        y={leaving ? -30 : 0}
        scale={leaving ? 0.95 : 1}
      >
        <Confetti seed={pickNumber} />

        <YStack
          height={4}
          width="100%"
          style={{
            backgroundImage: `linear-gradient(90deg, ${posColor}, ${posColor}88, ${posColor})`,
          }}
        />

        <YStack
          padding="$5"
          paddingBottom="$4"
          alignItems="center"
          gap="$2"
          position="relative"
        >
          {header}
          <YStack
            alignItems="center"
            paddingHorizontal="$3"
            paddingVertical="$1"
            borderRadius="$10"
            backgroundColor={labelColor.bg}
            borderWidth={1}
            borderColor={labelColor.border}
          >
            <Text
              fontSize={11}
              fontWeight="700"
              letterSpacing={2}
              textTransform="uppercase"
              color={labelColor.fg}
            >
              {labelText}
            </Text>
          </YStack>

          {isAuto && autoPickReason && (
            <Text
              fontSize={11}
              color={semantic.warningFg}
              fontWeight="500"
              maxWidth={320}
              lineHeight={14}
              textAlign="center"
            >
              {autoPickReason}
            </Text>
          )}

          <YStack width={220} marginTop="$1">
            <BaseballCard
              player={player}
              round={round}
              pickNumber={roundPickNumber}
              overallPick={pickNumber}
            />
          </YStack>

          {commentary && (
            <Text
              fontSize={12}
              fontStyle="italic"
              color="$textMuted"
              textAlign="center"
            >
              {commentary}
            </Text>
          )}
          {footer}
        </YStack>
      </YStack>
    </YStack>
  );
}

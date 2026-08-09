/**
 * DraftPickAnnouncement (native) — the full-bleed "with the Nth pick" card that
 * rises over the board whenever a pick lands, plus the confetti burst reserved
 * for the viewer's own picks.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import type { AnnouncementData } from './hooks/useDraftUIState';
import type { NotablePlaySummary } from './types';
import { PickSplashStatGraphic } from './PickSplashStatGraphic.native';
import { initialsOf, statLineFor } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor } from './utils';
import { CONFETTI_COLORS } from './constants';
import { withAlpha } from '../../utils/colors';

const CONFETTI_PIECES = 28;
const CONFETTI_DURATION = 2100;
const FALL_DISTANCE = 620;

interface ConfettiPiece {
  key: string;
  /** Horizontal start, as the percentage string RN's ViewStyle requires. */
  left: `${number}%`;
  color: string;
  /** Fraction of the burst to wait before this piece starts falling. */
  delay: number;
  /** Total rotation over the fall, in degrees. */
  spin: number;
}

/** Deterministic-per-mount confetti geometry; regenerated on each burst. */
function useConfettiGeometry(seed: number): ConfettiPiece[] {
  return useMemo(
    () =>
      Array.from(
        { length: CONFETTI_PIECES },
        (_, i): ConfettiPiece => ({
          key: `${seed}-${i}`,
          left: `${Math.round(Math.random() * 100)}%`,
          color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          // Stagger starts across the first third of the burst so the fall
          // reads as a scatter rather than a curtain.
          delay: Math.random() * 0.35,
          spin: 360 + Math.random() * 360,
        }),
      ),
    [seed],
  );
}

function Confetti({ seed }: { seed: number }): React.JSX.Element {
  const progress = useRef(new Animated.Value(0)).current;
  const pieces = useConfettiGeometry(seed);

  useEffect(() => {
    progress.setValue(0);
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: CONFETTI_DURATION,
      easing: Easing.in(Easing.quad),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, seed]);

  return (
    <YStack
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={60}
      overflow="hidden"
      pointerEvents="none"
    >
      {pieces.map((piece) => {
        // Each piece runs over [delay, 1]; before its delay the interpolation
        // clamps, holding it off-screen at the top.
        const range = [piece.delay, 1];
        return (
          <Animated.View
            key={piece.key}
            style={{
              position: 'absolute',
              left: piece.left,
              top: -14,
              width: 7,
              height: 11,
              borderRadius: 2,
              backgroundColor: piece.color,
              opacity: progress.interpolate({
                inputRange: [0, 0.75, 1],
                outputRange: [0.95, 0.95, 0.3],
              }),
              transform: [
                {
                  translateY: progress.interpolate({
                    inputRange: range,
                    outputRange: [0, FALL_DISTANCE],
                    extrapolate: 'clamp',
                  }),
                },
                {
                  rotate: progress.interpolate({
                    inputRange: range,
                    outputRange: ['0deg', `${piece.spin}deg`],
                    extrapolate: 'clamp',
                  }),
                },
              ],
            }}
          />
        );
      })}
    </YStack>
  );
}

export interface DraftPickAnnouncementProps {
  announcement: AnnouncementData | null;
  /** Play a confetti burst (viewer's own pick, unless the user muted it). */
  celebrate: boolean;
  onDismiss: () => void;
  /**
   * Cached notable play for the drafted player, rendered as the stat graphic
   * under the pick card (LS-9112). Spectator splash only — the member draft
   * room omits it.
   */
  notablePlay?: NotablePlaySummary | null;
}

export function DraftPickAnnouncement({
  announcement,
  celebrate,
  onDismiss,
  notablePlay,
}: DraftPickAnnouncementProps): React.JSX.Element | null {
  const palette = useDraftPalette();

  if (!announcement) return null;

  // `player` is a DraftPlayer for board picks and an AvailableDraftPlayer for
  // socket pushes that arrive before the stats map catches up.
  const player = announcement.player;
  const name =
    'name' in player
      ? player.name
      : `${player.firstName} ${player.lastName}`.trim();
  const position = 'position' in player ? player.position : null;
  const positionColor = position
    ? getPositionColor('baseball', position)
    : palette.gold.gold;
  const subtitle =
    'position' in player
      ? `${player.position} · ${statLineFor(player)}`
      : 'Pick is in';

  const eyebrow = announcement.isAuto
    ? `AUTO-PICK #${announcement.pickNumber} · ${announcement.teamName}`
    : announcement.isMyPick
      ? `WITH PICK #${announcement.pickNumber}, YOU SELECT`
      : `PICK #${announcement.pickNumber} · ${announcement.teamName}`;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${eyebrow}. ${name}. Tap to dismiss.`}
        onPress={onDismiss}
        style={overlayStyle}
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
            borderColor={
              announcement.isMyPick ? '$brandGold' : '$outlineDefault'
            }
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
              {eyebrow}
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
            <XStack marginTop={4}>
              <Text fontSize={13} color="$textMuted" textAlign="center">
                {subtitle}
              </Text>
            </XStack>
            <PickSplashStatGraphic play={notablePlay ?? null} />
          </YStack>
        </YStack>
      </Pressable>

      {celebrate && announcement.isMyPick && (
        <Confetti seed={announcement.pickNumber} />
      )}
    </>
  );
}

const overlayStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 30,
} as const;

export default DraftPickAnnouncement;

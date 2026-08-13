import React, { useEffect, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { formatPickClock } from './pickClock';
import { useDraftPalette } from './nativeDraftPalette';
import { GradientSurface } from '../home/GradientSurface';
import { ACCENT_INK, withAlpha } from '../../utils/colors';

export interface DraftHeaderBandProps {
  isMyPick: boolean;
  draftPaused: boolean;
  /** Offline mock draft mode (LS-9144): no clock, no pressure. */
  untimed: boolean;
  round: number;
  /** Pick number within the round — the "PICK n" half of "RD n · PICK n". */
  roundPickNumber: number;
  timeRemaining: number;
  pickTimeLimitSeconds: number;
  onClockTeamName: string | null;
  /**
   * Top queued player, for the auto-pick hint strip. `null` hides the strip
   * (also hidden when it isn't the viewer's pick).
   */
  topQueuedPlayerName: string | null;
}

/** Pulses `true`/`false` on a 1s cycle while `active` — the header's
 *  `clockBreath` effect at <=10s on my pick (README "Header band"). */
function useClockBreath(active: boolean): boolean {
  const [pulse, setPulse] = useState(false);
  useEffect(() => {
    if (!active) {
      setPulse(false);
      return undefined;
    }
    const id = setInterval(() => setPulse((v) => !v), 500);
    return () => clearInterval(id);
  }, [active]);
  return active ? pulse : false;
}

/**
 * Persistent on-the-clock header for the Draft Room v2 shell (LS-9397) —
 * README "Header band (persistent)". Colors come exclusively from
 * `useDraftPalette()` / `@legacy-sports/design-tokens` (no raw hex literals).
 */
export function DraftHeaderBand({
  isMyPick,
  draftPaused,
  untimed,
  round,
  roundPickNumber,
  timeRemaining,
  pickTimeLimitSeconds,
  onClockTeamName,
  topQueuedPlayerName,
}: DraftHeaderBandProps): React.JSX.Element {
  const palette = useDraftPalette();
  const breathing = useClockBreath(
    isMyPick && !draftPaused && !untimed && timeRemaining <= 10,
  );

  const eyebrowText = draftPaused
    ? 'Draft paused'
    : untimed && isMyPick
      ? 'Your pick — take your time'
      : isMyPick
        ? "YOU'RE ON THE CLOCK!"
        : 'On the clock';

  const primaryColor = isMyPick ? ACCENT_INK : palette.text.fg1;
  const secondaryColor = isMyPick
    ? withAlpha(ACCENT_INK, 0.65)
    : palette.text.fg4;

  const showHint = isMyPick && topQueuedPlayerName != null;

  const content = (
    <YStack
      testID="draft-header-band"
      paddingVertical={10}
      paddingHorizontal={14}
    >
      <XStack alignItems="center" justifyContent="space-between" gap={10}>
        <YStack flex={1} minWidth={0} alignItems="center">
          <Text
            fontSize={9.5}
            fontWeight="700"
            letterSpacing={2}
            textTransform="uppercase"
            color={secondaryColor}
          >
            {eyebrowText}
          </Text>
          {!untimed && (
            <Text
              fontFamily="$heading"
              fontSize={26}
              fontWeight="800"
              color={primaryColor}
              scale={breathing ? 1.08 : 1}
              animation="quick"
            >
              {formatPickClock(timeRemaining, pickTimeLimitSeconds)}
            </Text>
          )}
        </YStack>

        <YStack alignItems="flex-end" flexShrink={0}>
          <Text fontSize={9.5} color={secondaryColor}>
            RD {round} · PICK {roundPickNumber}
          </Text>
          <Text
            fontFamily="$heading"
            fontSize={14}
            fontWeight="800"
            color={primaryColor}
            numberOfLines={1}
            maxWidth={110}
          >
            {onClockTeamName ?? 'Waiting…'}
          </Text>
        </YStack>
      </XStack>

      {showHint && (
        <XStack
          testID="draft-header-band-autopick-hint"
          marginTop={8}
          alignSelf="center"
          borderRadius={6}
          paddingVertical={4}
          paddingHorizontal={10}
          backgroundColor={withAlpha(ACCENT_INK, 0.14)}
        >
          <Text fontSize={11} color={primaryColor}>
            {`Auto pick would be ${topQueuedPlayerName} · queue drafts first`}
          </Text>
        </XStack>
      )}
    </YStack>
  );

  if (isMyPick) {
    return (
      <YStack borderBottomWidth={1} borderBottomColor="$brandGoldLight">
        <GradientSurface colors={[palette.gold.gold, palette.gold.goldDark]}>
          {content}
        </GradientSurface>
      </YStack>
    );
  }

  return (
    <YStack
      backgroundColor="$surfacePanel"
      borderBottomWidth={1}
      borderBottomColor="$outlineSubtle"
    >
      {content}
    </YStack>
  );
}

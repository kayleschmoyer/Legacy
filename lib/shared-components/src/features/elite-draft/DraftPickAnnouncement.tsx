/**
 * DraftPickAnnouncement (web) — the full-bleed "with the Nth pick" card that
 * rises over the board whenever a pick lands. This is a capability shim of
 * ./DraftPickAnnouncement.native.tsx: the card itself uses Tamagui's
 * `animation`/`enterStyle`, which is cross-platform and unchanged from the
 * native version. Simplification: the confetti burst reserved for the
 * viewer's own picks is omitted — it's built on react-native's Animated API,
 * which has no equivalent-effort DOM primitive in scope for this ticket
 * (LS-9206); the announcement card itself still renders identically.
 */
import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import type { AnnouncementData } from './hooks/useDraftUIState';
import type { NotablePlaySummary } from './types';
import { PickSplashStatGraphic } from './PickSplashStatGraphic';
import { initialsOf, statLineFor } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';
import { getPositionColor } from './utils';
import { withAlpha } from '../../utils/colors';

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
    <YStack
      role="button"
      aria-label={`${eyebrow}. ${name}. Tap to dismiss.`}
      onPress={onDismiss}
      cursor="pointer"
      position="fixed"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={30}
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
          borderColor={announcement.isMyPick ? '$brandGold' : '$outlineDefault'}
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
    </YStack>
  );
}

export default DraftPickAnnouncement;

/**
 * DraftMyPickAnnouncement — the phone draft room's my-pick moment, per the
 * Draft Board design (LS-10205): DraftRoomMobile.html `.mob-announce`,
 * styles/mobile.css `.mob-announce*`, scripts/draft.js (auto-closes after 5s,
 * tap to dismiss). Replaces v2's confetti DraftMyPickSplash.
 *
 * Renders the front item of useDraftUIState's pickSplashQueue: centered card
 * over a dark scrim with initials, "Pick #N · Round R" eyebrow, name, a
 * "POS · CLUB — to <team>" meta line and an italic quip.
 */
import React, { useEffect } from 'react';
import { Text, YStack } from 'tamagui';
import { getDraftCommentary } from './draftUtils';
import type { PickSplashQueueItem } from './hooks/useDraftUIState';
import { initialsOf } from './nativeDraftBoard';
import { useDraftPalette } from './nativeDraftPalette';

export const MY_PICK_ANNOUNCEMENT_DISMISS_MS = 5000;

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

/** The design's pun line. getDraftCommentary needs the resolved DraftPlayer
 *  stats; its lines lead with an emoji token the design's quip doesn't carry. */
function quipOf(item: PickSplashQueueItem): string | null {
  const { player } = item;
  if (!('name' in player)) return null;
  return getDraftCommentary(player, item.round, true, false).replace(
    /^\S+\s+/,
    '',
  );
}

export interface DraftMyPickAnnouncementProps {
  /** useDraftUIState's pickSplashQueue — only the front item renders. */
  queue: readonly PickSplashQueueItem[];
  /** Dequeues the front item — called on auto-dismiss or tap. */
  onDismiss: () => void;
  /** The viewer's fantasy team — the meta line's "to <team>". */
  teamName: string;
}

export function DraftMyPickAnnouncement({
  queue,
  onDismiss,
  teamName,
}: DraftMyPickAnnouncementProps): React.JSX.Element | null {
  const palette = useDraftPalette();
  const item = queue[0];

  useEffect(() => {
    if (!item) return undefined;
    const timer = setTimeout(onDismiss, MY_PICK_ANNOUNCEMENT_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [item, onDismiss]);

  if (!item) return null;

  const name = nameOf(item);
  const club = item.player.club ?? null;
  const proLine = [positionOf(item), club].filter(Boolean).join(' · ');
  const meta = teamName
    ? proLine
      ? `${proLine} — to ${teamName}`
      : `To ${teamName}`
    : proLine;
  const quip = quipOf(item);
  const label = `Pick ${item.pickNumber}, round ${item.round}: ${name}. Tap to dismiss.`;

  return (
    <YStack
      testID="draft-my-pick-announcement"
      role="button"
      tabIndex={0}
      accessibilityRole="button"
      aria-label={label}
      accessibilityLabel={label}
      onPress={onDismiss}
      cursor="pointer"
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      zIndex={95}
      backgroundColor={palette.scrim}
      alignItems="center"
      justifyContent="center"
      padding={26}
    >
      <YStack
        width="100%"
        paddingTop={26}
        paddingHorizontal={20}
        paddingBottom={22}
        alignItems="center"
        borderWidth={1}
        borderColor={palette.gold.goldDark}
        borderRadius={16}
        backgroundColor="$surfaceRaised"
        animation="quick"
        enterStyle={{ opacity: 0 }}
      >
        <YStack
          width={92}
          height={92}
          borderRadius={9999}
          borderWidth={1}
          borderColor={palette.gold.gold}
          backgroundColor="$background"
          alignItems="center"
          justifyContent="center"
          marginBottom={16}
        >
          <Text
            fontFamily="$heading"
            fontSize={26}
            fontWeight="800"
            color={palette.gold.goldDark}
          >
            {initialsOf(name)}
          </Text>
        </YStack>

        <Text
          fontSize={10}
          fontWeight="700"
          letterSpacing={2}
          textTransform="uppercase"
          color={palette.gold.gold}
          textAlign="center"
        >
          {`Pick #${item.pickNumber} · Round ${item.round}`}
        </Text>
        <Text
          fontFamily="$heading"
          fontSize={28}
          fontWeight="800"
          color="$color"
          marginTop={8}
          marginBottom={4}
          textAlign="center"
        >
          {name}
        </Text>
        {meta ? (
          <Text fontSize={12} color="$textMuted" textAlign="center">
            {meta}
          </Text>
        ) : null}
        {quip ? (
          <Text
            testID="draft-my-pick-announcement-quip"
            fontSize={13}
            fontStyle="italic"
            color="$textMuted"
            textAlign="center"
            marginTop={14}
            maxWidth={300}
          >
            {quip}
          </Text>
        ) : null}
      </YStack>
    </YStack>
  );
}

export default DraftMyPickAnnouncement;

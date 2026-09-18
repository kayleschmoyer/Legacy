import React from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { MessageCircle } from '@tamagui/lucide-icons';
import { DraftClockRing } from './DraftClockRing';
import { useDraftPalette } from './nativeDraftPalette';
import { handleKeyActivate } from '../../utils/keyboardActivation';

export interface DraftClockBarProps {
  isMyPick: boolean;
  draftPaused: boolean;
  /** Offline mock draft mode (LS-9144): no clock, no pressure. */
  untimed: boolean;
  round: number;
  /** Pick number within the round — the "P n" half of "R n · P n". */
  roundPickNumber: number;
  timeRemaining: number;
  pickTimeLimitSeconds: number;
  /**
   * True while the live socket is down (LS-9856). The clock keeps ticking
   * off the last known deadline, so dim it and swap the eyebrow rather than
   * letting a stale countdown read as live.
   */
  connectionStale?: boolean;
  onClockTeamName: string | null;
  /**
   * Opens the phone chat panel (LS-10165). Chat lives in the clock bar rather
   * than a draft-owned nav bar so nothing stacks with the app's own header or
   * bottom bar. Omitted → no chat control.
   */
  onOpenChat?: () => void;
  /** Seam-red dot on the chat control while a message is unread (LS-9401). */
  unreadChat?: boolean;
}

/** Keyboard-focusable button semantics for a pressable stack. */
const BUTTON_A11Y = { role: 'button' as const, tabIndex: 0 };

/** Touch-target floor for the chat control. */
const CHAT_BUTTON_SIZE = 44;
/** `.mob-ring` — 54px. */
const RING_SIZE = 54;

/**
 * Phone clock bar (LS-10204) — who is on the clock and how long they have,
 * in one line: DraftRoomMobile.html's `.mob-clock` (styles/mobile.css).
 * Replaces the Draft Room v2 DraftHeaderBand. The full hero is a desktop-frame
 * element (DraftHero); a phone needs the fact, not the frame.
 */
export function DraftClockBar({
  isMyPick,
  draftPaused,
  untimed,
  round,
  roundPickNumber,
  timeRemaining,
  pickTimeLimitSeconds,
  connectionStale = false,
  onClockTeamName,
  onOpenChat,
  unreadChat = false,
}: DraftClockBarProps): React.JSX.Element {
  const palette = useDraftPalette();

  const slot = `R${round} · P${roundPickNumber}`;
  const eyebrowText = connectionStale
    ? 'Reconnecting — clock may be out of date'
    : draftPaused
      ? `Draft paused · ${slot}`
      : isMyPick
        ? `You're on the clock · ${slot}`
        : `On the clock · ${slot}`;

  // `.mob-clock.mine` — only the eyebrow and the chat control turn gold.
  const eyebrowColor = isMyPick ? palette.gold.gold : palette.text.fg4;
  const chatColor = isMyPick ? palette.gold.gold : palette.text.fg1;
  const chatLabel = unreadChat ? 'Open chat, unread messages' : 'Open chat';

  return (
    <XStack
      testID="draft-clock-bar"
      alignItems="center"
      gap={12}
      paddingTop={14}
      paddingHorizontal={14}
      paddingBottom={12}
    >
      <YStack flex={1} minWidth={0}>
        <Text
          fontSize={10}
          fontWeight="700"
          letterSpacing={1.6}
          textTransform="uppercase"
          color={eyebrowColor}
          numberOfLines={1}
        >
          {eyebrowText}
        </Text>
        <Text
          fontFamily="$heading"
          fontSize={23}
          lineHeight={24}
          fontWeight="800"
          marginTop={2}
          color={palette.text.fg1}
          numberOfLines={1}
        >
          {onClockTeamName ?? 'Waiting…'}
        </Text>
      </YStack>

      {!untimed && (
        <YStack opacity={connectionStale ? 0.45 : 1} flexShrink={0}>
          <DraftClockRing
            size={RING_SIZE}
            secondsRemaining={timeRemaining}
            totalSeconds={pickTimeLimitSeconds}
            emphasize={isMyPick && !draftPaused && !connectionStale}
            paused={draftPaused}
          />
        </YStack>
      )}

      {onOpenChat && (
        <YStack
          testID="draft-clock-bar-chat"
          width={CHAT_BUTTON_SIZE}
          height={CHAT_BUTTON_SIZE}
          flexShrink={0}
          alignItems="center"
          justifyContent="center"
          borderRadius={CHAT_BUTTON_SIZE / 2}
          borderWidth={1}
          borderColor={
            isMyPick ? palette.gold.goldDark : palette.surface.outlineStrong
          }
          onPress={onOpenChat}
          pressStyle={{ opacity: 0.7 }}
          cursor="pointer"
          {...BUTTON_A11Y}
          accessibilityRole="button"
          onKeyDown={handleKeyActivate(onOpenChat)}
          aria-haspopup="dialog"
          aria-label={chatLabel}
          accessibilityLabel={chatLabel}
        >
          <MessageCircle size={18} color={chatColor} />
          {unreadChat && (
            <YStack
              testID="draft-clock-bar-chat-unread-dot"
              position="absolute"
              top={9}
              right={9}
              width={7}
              height={7}
              borderRadius={4}
              backgroundColor="$brandSeamRed"
            />
          )}
        </YStack>
      )}
    </XStack>
  );
}

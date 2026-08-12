/**
 * MockDraftInviteCard — shown right after creating a Shared mock draft
 * (LS-9181). Surfaces the invite code so the creator can share it with real
 * friends before entering the draft room, since `EliteDraftBoardScreen`'s
 * `PreDraftLobby` (intentionally left unmodified by this ticket) has no
 * invite-code display of its own.
 *
 * Pure presentational, cross-platform (Tamagui only) — consumers own the
 * `initializeMockDraft` call and navigation via `onContinue`.
 */
import React from 'react';
import { Button, Text, XStack, YStack } from 'tamagui';

export interface MockDraftInviteCardProps {
  inviteCode: string;
  /** Invoked when the creator is ready to enter the draft room lobby. */
  onContinue: () => void;
}

export function MockDraftInviteCard({
  inviteCode,
  onContinue,
}: MockDraftInviteCardProps): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = React.useCallback(() => {
    // navigator.clipboard is undefined in non-secure contexts and on React
    // Native — bail safely rather than throw (same guard as the real-league
    // invite-code copy affordance in LeagueDetailShell).
    const writeText =
      typeof navigator !== 'undefined' &&
      navigator.clipboard?.writeText.bind(navigator.clipboard);
    if (!writeText) return;
    void writeText(inviteCode).then(
      () => {
        setCopied(true);
        if (resetTimer.current) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => setCopied(false), 1500);
      },
      () => undefined,
    );
  }, [inviteCode]);

  return (
    <YStack alignItems="center" gap="$4">
      <Text fontSize={40} lineHeight={40} role="img" accessibilityLabel="party">
        {'\u{1F389}'}
      </Text>
      <YStack alignItems="center" gap="$1.5">
        <Text
          fontFamily="$heading"
          fontSize={24}
          fontWeight="800"
          color="$brandGold"
          textAlign="center"
        >
          Invite Friends to Draft
        </Text>
        <Text
          color="$textMuted"
          fontSize={14}
          textAlign="center"
          maxWidth={360}
        >
          Share this code with real players. Anyone who joins before you start
          takes an open slot instead of AI. Unfilled slots still get an AI
          opponent when you start.
        </Text>
      </YStack>

      {/* Native <button> via tag="button" — no explicit role needed, it's
          already keyboard-focusable and announced as a button. */}
      <XStack
        tag="button"
        tabIndex={0}
        alignItems="center"
        justifyContent="center"
        gap="$2"
        paddingHorizontal="$5"
        paddingVertical="$3"
        borderRadius="$4"
        backgroundColor="$surfacePanel"
        borderWidth={1}
        borderColor="$surfacePanelBorder"
        cursor="pointer"
        hoverStyle={{ opacity: 0.85 }}
        pressStyle={{ opacity: 0.7 }}
        onPress={handleCopy}
        aria-label={
          copied ? 'Invite code copied' : `Copy invite code ${inviteCode}`
        }
      >
        <Text
          fontFamily="$mono"
          fontSize={28}
          fontWeight="700"
          letterSpacing={3}
          color="$brandGoldLight"
        >
          {inviteCode}
        </Text>
      </XStack>
      <Text fontSize={12} color={copied ? '$brandGold' : '$textMuted'}>
        {copied ? 'Copied!' : 'Tap the code to copy'}
      </Text>

      <Button
        size="$5"
        marginTop="$2"
        backgroundColor="$brandGold"
        color="$textOnAccent"
        pressStyle={{ scale: 0.98 }}
        onPress={onContinue}
      >
        <Text fontWeight="700" fontSize={14} color="$textOnAccent">
          Continue to Draft Room
        </Text>
      </Button>
    </YStack>
  );
}

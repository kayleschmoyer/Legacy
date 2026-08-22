import React, { useState } from 'react';
import { Input, ScrollView, Spinner, Text, XStack, YStack } from 'tamagui';
import { useDraftPalette } from './nativeDraftPalette';
import { ACCENT_INK, withAlpha } from '../../utils/colors';

/** One chat message as rendered by the Chat tab — the shape both platforms'
 *  `useLeagueChat` hooks (the same data source `LeagueChatTab` reads from)
 *  already produce, mapped down to what the bubble list needs. */
export interface DraftChatBubbleMessage {
  id: number | string;
  userId: number;
  username: string;
  messageText: string;
  /** True for a message still in flight (offline queue / pending send). */
  pending?: boolean;
}

export interface DraftChatTabProps {
  currentUserId: number;
  messages: DraftChatBubbleMessage[];
  loading: boolean;
  sending: boolean;
  onSend: (text: string) => void;
}

/**
 * Data-source render prop for the Chat tab body (LS-9401) — distinct from
 * `DraftChatRenderer` (the wide-viewport chat overlay, LS-9207/LS-4568)
 * because the tab renders its own bubble/input markup per the v2 spec
 * rather than an opaque pre-rendered `LeagueChatTab` node, so it needs raw
 * message data instead. `onNewMessage` fires once per newly-arrived message
 * so the screen can drive the unread-chat flag while another tab is active;
 * the caller must keep the renderer mounted regardless of `activeTab` for
 * that to work (see EliteDraftBoardScreen's display:none rendering of it).
 */
export interface DraftChatTabRenderProps {
  leagueId: number;
  userId: number;
  onNewMessage: () => void;
}
export type DraftChatTabRenderer = (
  props: DraftChatTabRenderProps,
) => React.ReactNode;

const handleKeyActivate =
  (fn: () => void) => (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

/**
 * Draft Room v2 Chat tab (LS-9401) — README "Chat tab". Bubbles: mine
 * right-aligned gold-tinted, others card-styled, sender label above each.
 * Pill input + gold SEND pill; Enter sends. Rendered against the same
 * league-chat data source `LeagueChatTab` uses (supplied by the caller via
 * `DraftChatTabRenderer`) — this component owns presentation only, no
 * chat backend/GraphQL wiring of its own.
 */
export function DraftChatTab({
  currentUserId,
  messages,
  loading,
  sending,
  onSend,
}: DraftChatTabProps): React.JSX.Element {
  const palette = useDraftPalette();
  const [inputText, setInputText] = useState('');

  const handleSend = () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    onSend(text);
  };

  // Explicit key handler rather than relying solely on `onSubmitEditing` —
  // react-native-web's TextInput normally wires Enter to onSubmitEditing
  // itself, but that wiring isn't reliably reachable in every host
  // environment this component renders in, so send-on-Enter is also handled
  // here directly (same `onKeyPress` convention as PlayerComparison's search
  // combobox). The event shape differs by platform (RN wraps it under
  // `nativeEvent`; plain DOM exposes `key` directly), so both are checked.
  const handleInputKeyPress = (e: unknown) => {
    const event = e as { nativeEvent?: { key?: string }; key?: string };
    const key = event.nativeEvent?.key ?? event.key;
    if (key === 'Enter') handleSend();
  };

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center">
        <Spinner size="large" />
      </YStack>
    );
  }

  return (
    <YStack flex={1} testID="draft-chat-tab">
      <ScrollView flex={1}>
        <YStack paddingVertical={10}>
          {messages.length === 0 ? (
            <YStack alignItems="center" justifyContent="center" padding="$6">
              <Text color={palette.text.fg4} textAlign="center">
                No messages yet. Say hello!
              </Text>
            </YStack>
          ) : (
            messages.map((msg) => {
              const isMe = msg.userId === currentUserId;
              return (
                <YStack
                  key={msg.id}
                  alignItems={isMe ? 'flex-end' : 'flex-start'}
                  paddingHorizontal={12}
                  marginBottom={8}
                >
                  {!isMe && (
                    <Text
                      fontSize={9}
                      color={palette.text.fg4}
                      marginBottom={2}
                    >
                      {msg.username}
                    </Text>
                  )}
                  <YStack
                    maxWidth="75%"
                    borderRadius={14}
                    borderWidth={1}
                    paddingHorizontal={12}
                    paddingVertical={8}
                    opacity={msg.pending ? 0.6 : 1}
                    backgroundColor={
                      isMe ? withAlpha(palette.gold.gold, 0.18) : '$surfaceCard'
                    }
                    borderColor={
                      isMe
                        ? withAlpha(palette.gold.gold, 0.45)
                        : '$surfacePanelBorder'
                    }
                  >
                    <Text fontSize={13} color={palette.text.fg1}>
                      {msg.messageText}
                    </Text>
                  </YStack>
                </YStack>
              );
            })
          )}
        </YStack>
      </ScrollView>

      <XStack
        padding={10}
        gap={8}
        alignItems="center"
        borderTopWidth={1}
        borderTopColor="$surfacePanelBorder"
      >
        <Input
          flex={1}
          size="$3"
          borderRadius={999}
          backgroundColor="$surfacePanel"
          borderColor="$surfacePanelBorder"
          color="$color"
          placeholder="Message the league…"
          placeholderTextColor={palette.text.fg4}
          value={inputText}
          onChangeText={setInputText}
          returnKeyType="send"
          blurOnSubmit={false}
          onSubmitEditing={handleSend}
          onKeyPress={handleInputKeyPress}
        />
        <XStack
          testID="draft-chat-send"
          role="button"
          tabIndex={0}
          accessibilityRole="button"
          aria-label="Send"
          accessibilityLabel="Send"
          onPress={handleSend}
          onKeyDown={handleKeyActivate(handleSend)}
          alignItems="center"
          justifyContent="center"
          paddingHorizontal={16}
          paddingVertical={10}
          borderRadius={999}
          backgroundColor="$brandGold"
          cursor="pointer"
          opacity={!inputText.trim() || sending ? 0.5 : 1}
        >
          <Text fontSize={12} fontWeight="800" color={ACCENT_INK}>
            {sending ? '…' : 'SEND'}
          </Text>
        </XStack>
      </XStack>
    </YStack>
  );
}

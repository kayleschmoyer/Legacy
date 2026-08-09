import React, { useCallback, useRef, useState } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputSelectionChangeEventData,
} from 'react-native';
import {
  Image,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { GifPicker } from '@legacy-sports/shared-components';
import { config } from '@legacy-sports/app-config/native';
import { colors } from '@legacy-sports/design-tokens';
import { useLeagueChat } from './hooks/useLeagueChat';
import { formatTime } from './formatTime';
import { applyMention, getMentionQuery, splitMentions } from './mentions';
import type { MentionCandidate } from './mentions';
import { useThemeContext } from '../../context/ThemeContext';
import type { LegacySportsJwt } from '../../common/auth/AuthHooks';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeagueChatTabProps {
  leagueId: number;
  userInfo: LegacySportsJwt;
}

/**
 * `messageType` values that render as a centered system notice instead of a
 * chat bubble. `'text'`/`'gif'` are user-authored; the rest are structured
 * league-event cards (trades/waivers/draft updates) — see
 * `lib/db-client/migrations/20260226_120000_add_league_message_type.ts`.
 */
const SYSTEM_MESSAGE_TYPES = new Set([
  'system',
  'trade',
  'waiver',
  'draft_settings',
]);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LeagueChatTab({
  leagueId,
  userInfo,
}: LeagueChatTabProps): React.JSX.Element {
  const {
    messages,
    loading,
    sending,
    wsError,
    sendMessage,
    mentionCandidates = [],
  } = useLeagueChat(leagueId);
  // Raw RN <TextInput> styling can't consume Tamagui `$token` props, so pull
  // resolved values from the design-token package — the same source of
  // truth the Tamagui themes mirror — keyed by the active light/dark theme.
  const { resolvedTheme } = useThemeContext();
  const palette = colors[resolvedTheme];
  const [inputText, setInputText] = useState('');
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [showGifPicker, setShowGifPicker] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const giphyApiKey = config.giphyApiKey ?? '';
  const mentionLabels = mentionCandidates.map((c) => c.label);

  const handleSelectionChange = useCallback(
    (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => {
      setSelection(event.nativeEvent.selection);
    },
    [],
  );

  const mentionQuery = getMentionQuery(inputText, selection.start);
  const mentionSuggestions: MentionCandidate[] =
    mentionQuery === null
      ? []
      : mentionCandidates
          .filter((c) =>
            c.label.toLowerCase().startsWith(mentionQuery.toLowerCase()),
          )
          .slice(0, 5);

  const handleSelectMention = useCallback(
    (candidate: MentionCandidate) => {
      const applied = applyMention(inputText, selection.start, candidate.label);
      setInputText(applied.text);
      setSelection({ start: applied.cursor, end: applied.cursor });
    },
    [inputText, selection],
  );

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    await sendMessage(text);
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [inputText, sending, sendMessage]);

  const handleSendGif = useCallback(
    async (gifUrl: string) => {
      setShowGifPicker(false);
      await sendMessage('', gifUrl);
      scrollViewRef.current?.scrollToEnd({ animated: true });
    },
    [sendMessage],
  );

  if (loading) {
    return (
      <YStack flex={1} justifyContent="center" alignItems="center">
        <Spinner size="large" />
        <Text marginTop="$2" color="$gray10">
          Loading messages…
        </Text>
      </YStack>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
      keyboardVerticalOffset={80}
    >
      <YStack flex={1}>
        {/* Real-time connection error banner */}
        {wsError && (
          <XStack
            testID="ws-error-banner"
            backgroundColor="$red4"
            paddingHorizontal="$3"
            paddingVertical="$2"
            alignItems="center"
          >
            <Text color="$red11" fontSize="$3">
              Could not connect to live chat. Messages may be delayed.
            </Text>
          </XStack>
        )}

        {/* Message list */}
        <ScrollView
          ref={scrollViewRef}
          style={styles.messageList}
          contentContainerStyle={styles.messageListContent}
          onContentSizeChange={() =>
            scrollViewRef.current?.scrollToEnd({ animated: true })
          }
          keyboardShouldPersistTaps="handled"
        >
          {messages.length === 0 ? (
            <YStack
              flex={1}
              justifyContent="center"
              alignItems="center"
              padding="$6"
            >
              <Text color="$gray9" fontSize="$4" textAlign="center">
                No messages yet.{'\n'}Be the first to say something!
              </Text>
            </YStack>
          ) : (
            messages.map((msg) => {
              const isSystemMessage =
                !!msg.messageType && SYSTEM_MESSAGE_TYPES.has(msg.messageType);

              // System-event cards (trades/waivers/draft updates) render as
              // a centered notice, not a directional chat bubble.
              if (isSystemMessage) {
                return (
                  <YStack
                    key={msg.id}
                    testID="system-message"
                    alignItems="center"
                    marginBottom="$2"
                    paddingHorizontal="$3"
                  >
                    <YStack
                      backgroundColor="$gray3"
                      borderRadius="$10"
                      paddingHorizontal="$3"
                      paddingVertical="$1"
                      maxWidth="90%"
                    >
                      <Text
                        color="$gray10"
                        fontSize="$2"
                        textAlign="center"
                        fontStyle="italic"
                      >
                        {msg.messageText}
                      </Text>
                    </YStack>
                    <Text fontSize="$1" color="$gray9" marginTop="$1">
                      {formatTime(msg.createdAt)}
                    </Text>
                  </YStack>
                );
              }

              const isMe = !!msg.pending || msg.userId === userInfo.id;
              const isGif = msg.messageType === 'gif' && !!msg.gifUrl;
              return (
                <YStack
                  key={msg.id}
                  alignItems={isMe ? 'flex-end' : 'flex-start'}
                  marginBottom="$2"
                  paddingHorizontal="$3"
                >
                  {/* Sender label */}
                  {!isMe && (
                    <Text fontSize="$2" color="$gray10" marginBottom="$1">
                      {msg.username}
                    </Text>
                  )}

                  {/* GIF message */}
                  {isGif ? (
                    <Image
                      source={{ uri: msg.gifUrl }}
                      style={styles.gifImage}
                      resizeMode="contain"
                    />
                  ) : (
                    /* Text bubble */
                    <YStack
                      backgroundColor={isMe ? '$brandNavyLight' : '$gray3'}
                      borderRadius="$4"
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      maxWidth="80%"
                      opacity={msg.pending ? 0.6 : 1}
                    >
                      <Text
                        color={isMe ? 'white' : '$gray12'}
                        fontSize="$4"
                        flexShrink={1}
                      >
                        {splitMentions(msg.messageText, mentionLabels).map(
                          (segment, index) => (
                            <Text
                              key={index}
                              fontWeight={segment.isMention ? '700' : undefined}
                            >
                              {segment.text}
                            </Text>
                          ),
                        )}
                      </Text>
                    </YStack>
                  )}

                  {/* Timestamp */}
                  <Text fontSize="$1" color="$gray9" marginTop="$1">
                    {formatTime(msg.createdAt)}
                    {msg.pending ? ' · Sending…' : ''}
                  </Text>
                </YStack>
              );
            })
          )}
        </ScrollView>

        {/* GIF Picker */}
        {showGifPicker && giphyApiKey && (
          <GifPicker
            giphyApiKey={giphyApiKey}
            onSelect={(url) => void handleSendGif(url)}
            onClose={() => setShowGifPicker(false)}
          />
        )}

        {/* @mention suggestions */}
        {mentionSuggestions.length > 0 && (
          <YStack
            testID="mention-suggestions"
            borderTopWidth={1}
            borderTopColor="$gray4"
            backgroundColor="$surfacePanel"
            maxHeight={160}
          >
            {mentionSuggestions.map((candidate) => (
              <Text
                key={candidate.userId}
                testID={`mention-suggestion-${candidate.userId}`}
                fontSize="$4"
                paddingHorizontal="$3"
                paddingVertical="$2"
                onPress={() => handleSelectMention(candidate)}
              >
                @{candidate.label}
              </Text>
            ))}
          </YStack>
        )}

        {/* Input row */}
        <XStack
          paddingHorizontal="$3"
          paddingVertical="$2"
          borderTopWidth={1}
          borderTopColor="$gray4"
          backgroundColor="$background"
          alignItems="flex-end"
          space="$2"
        >
          {giphyApiKey ? (
            <Button
              size="$3"
              chromeless
              onPress={() => setShowGifPicker(!showGifPicker)}
              opacity={showGifPicker ? 1 : 0.6}
              paddingHorizontal="$2"
            >
              GIF
            </Button>
          ) : null}
          <TextInput
            style={[
              styles.input,
              {
                borderColor: palette.surface.outlineDefault,
                backgroundColor: palette.surface.surfacePanel,
                color: palette.text.fg1,
              },
            ]}
            value={inputText}
            onChangeText={setInputText}
            onSelectionChange={handleSelectionChange}
            placeholder="Message the league…"
            placeholderTextColor={palette.text.fg3}
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => void handleSend()}
          />
          <Button
            size="$3"
            backgroundColor="$brandNavyLight"
            color="white"
            onPress={() => void handleSend()}
            disabled={!inputText.trim() || sending}
            opacity={!inputText.trim() || sending ? 0.5 : 1}
            minWidth={64}
          >
            {sending ? '…' : 'Send'}
          </Button>
        </XStack>
      </YStack>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  messageList: {
    flex: 1,
  },
  messageListContent: {
    flexGrow: 1,
    paddingTop: 12,
    paddingBottom: 8,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
  },
  gifImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
});

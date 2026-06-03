import React, { useCallback, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { GifPicker } from '@legacy-sports/shared-components';
import { config } from '@legacy-sports/app-config/native';
import { useLeagueChat } from './hooks/useLeagueChat';
import { formatTime } from './formatTime';
import type { LegacySportsJwt } from '../../common/auth/AuthHooks';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LeagueChatTabProps {
  leagueId: number;
  userInfo: LegacySportsJwt;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LeagueChatTab({
  leagueId,
  userInfo,
}: LeagueChatTabProps): React.JSX.Element {
  const { messages, loading, sending, wsError, sendMessage } =
    useLeagueChat(leagueId);
  const [inputText, setInputText] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);

  const giphyApiKey = config.giphyApiKey ?? '';

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
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
              const isMe = msg.userId === userInfo.id;
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
                      backgroundColor={isMe ? '$blue9' : '$gray3'}
                      borderRadius="$4"
                      paddingHorizontal="$3"
                      paddingVertical="$2"
                      maxWidth="80%"
                    >
                      <Text
                        color={isMe ? 'white' : '$gray12'}
                        fontSize="$4"
                        flexShrink={1}
                      >
                        {msg.messageText}
                      </Text>
                    </YStack>
                  )}

                  {/* Timestamp */}
                  <Text fontSize="$1" color="$gray9" marginTop="$1">
                    {formatTime(msg.createdAt)}
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
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message the league…"
            placeholderTextColor="#9CAAC5"
            multiline
            maxLength={2000}
            returnKeyType="send"
            blurOnSubmit={false}
            onSubmitEditing={() => void handleSend()}
          />
          <Button
            size="$3"
            backgroundColor="$blue9"
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
    borderColor: '#2F3B53',
    backgroundColor: '#111B2F',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#F8FAFC',
  },
  gifImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
  },
});

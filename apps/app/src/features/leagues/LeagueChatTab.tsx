import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
} from 'react-native';
import { Button, Spinner, Text, XStack, YStack } from 'tamagui';
import { useLeagueChat } from './hooks/useLeagueChat';
import type { LegacySportsJwt } from '../../common/auth/AuthHooks';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

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
  const { messages, loading, sending, sendMessage } = useLeagueChat(leagueId);
  const [inputText, setInputText] = useState('');
  const scrollViewRef = useRef<ScrollView>(null);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    await sendMessage(text);
    // Scroll to bottom after send
    scrollViewRef.current?.scrollToEnd({ animated: true });
  }, [inputText, sending, sendMessage]);

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

                  {/* Bubble */}
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

                  {/* Timestamp */}
                  <Text fontSize="$1" color="$gray9" marginTop="$1">
                    {formatTime(msg.createdAt)}
                  </Text>
                </YStack>
              );
            })
          )}
        </ScrollView>

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
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message the league…"
            placeholderTextColor="#9ca3af"
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
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#111827',
  },
});

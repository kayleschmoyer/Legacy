import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, styled, Text, XStack, YStack } from 'tamagui';
import { MessageSquare } from '@tamagui/lucide-icons';
import { SystemMessageCard } from './SystemMessageCard';
import { useLeagueChat } from '../../hooks/useLeagueChat';

// ---------------------------------------------------------------------------
// Styled helpers
// ---------------------------------------------------------------------------
const Bubble = styled(YStack, {
  borderRadius: '$4',
  paddingHorizontal: '$3',
  paddingVertical: '$2',
  maxWidth: '75%',

  variants: {
    mine: {
      true: { backgroundColor: '$blue9' },
      false: { backgroundColor: '$gray3' },
    },
  } as const,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface LeagueChatTabProps {
  leagueId: number;
  userId: number;
  /** Optional callback to navigate to another tab by ID (for system message cards) */
  onNavigate?: (tabId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LeagueChatTab({
  leagueId,
  userId,
  onNavigate,
}: LeagueChatTabProps): React.JSX.Element {
  const { messages, loading, sending, sendMessage } = useLeagueChat(leagueId);
  const [inputText, setInputText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setInputText('');
    await sendMessage(text);
  }, [inputText, sending, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter or Cmd+Enter sends
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color="$blue10" />
        <Text color="$textMuted" fontSize="$4">
          Loading messages…
        </Text>
      </YStack>
    );
  }

  return (
    <YStack
      flex={1}
      height="100%"
      style={{ display: 'flex', flexDirection: 'column', minHeight: 400 }}
    >
      {/* Message list */}
      <div
        ref={listRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          minHeight: 0,
        }}
      >
        {messages.length === 0 ? (
          <YStack
            flex={1}
            alignItems="center"
            justifyContent="center"
            padding="$8"
            gap="$3"
          >
            <MessageSquare size={40} color="var(--textMuted)" />
            <Text color="$textMuted" fontSize="$5" fontWeight="600">
              No messages yet
            </Text>
            <Text color="$textMuted" fontSize="$3" textAlign="center">
              Be the first to send a message to the league!
            </Text>
          </YStack>
        ) : (
          messages.map((msg) => {
            const isSystemMessage =
              msg.messageType === 'trade' ||
              msg.messageType === 'waiver' ||
              msg.messageType === 'draft_settings';

            if (isSystemMessage) {
              return (
                <SystemMessageCard
                  key={msg.id}
                  message={msg}
                  onNavigate={onNavigate}
                  formatTime={formatTime}
                />
              );
            }

            const isMe = msg.userId === userId;
            return (
              <YStack
                key={msg.id}
                alignItems={isMe ? 'flex-end' : 'flex-start'}
                paddingHorizontal="$4"
              >
                {!isMe && (
                  <Text
                    fontSize="$2"
                    color="$textMuted"
                    fontWeight="600"
                    marginBottom="$1"
                  >
                    {msg.username}
                  </Text>
                )}
                <Bubble mine={isMe}>
                  <Text
                    color={isMe ? 'white' : '$color'}
                    fontSize="$4"
                    style={{ wordBreak: 'break-word' }}
                  >
                    {msg.messageText}
                  </Text>
                </Bubble>
                <Text fontSize="$1" color="$textMuted" marginTop="$1">
                  {formatTime(msg.createdAt)}
                </Text>
              </YStack>
            );
          })
        )}
      </div>

      {/* Input area */}
      <XStack
        paddingHorizontal="$4"
        paddingVertical="$3"
        borderTopWidth={1}
        borderTopColor="$borderColor"
        backgroundColor="$background"
        alignItems="flex-end"
        gap="$2"
      >
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message the league… (Ctrl+Enter to send)"
          maxLength={2000}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid var(--borderColor)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: 14,
            fontFamily: 'inherit',
            backgroundColor: 'var(--surfaceSubtle, #f9fafb)',
            color: 'var(--color)',
            outline: 'none',
            lineHeight: 1.5,
          }}
        />
        <Button
          size="$3"
          backgroundColor="$blue9"
          color="white"
          onPress={() => void handleSend()}
          disabled={!inputText.trim() || sending}
          opacity={!inputText.trim() || sending ? 0.5 : 1}
          minWidth={80}
          aria-label="Send message"
        >
          <Text fontSize="$3" fontWeight="600" color="white">
            {sending ? '…' : 'Send'}
          </Text>
        </Button>
      </XStack>
    </YStack>
  );
}

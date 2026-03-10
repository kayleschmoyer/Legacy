import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Spinner, styled, Text, XStack, YStack } from 'tamagui';
import { MessageSquare } from '@tamagui/lucide-icons';
import { SystemMessageCard } from './SystemMessageCard';
import { GifPicker } from './GifPicker';
import { useLeagueChat } from '../../hooks/useLeagueChat';
import { BRAND_NAVY_LIGHT, GRAY_50 } from '../../constants/colors';
import { AvatarImage } from '../../components/common';

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
      true: { backgroundColor: BRAND_NAVY_LIGHT },
      false: { backgroundColor: '$gray3' },
    },
  } as const,
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatTime(isoString: string): string {
  // Defensively normalize to ISO 8601 UTC before parsing.  PostgreSQL
  // TIMESTAMP strings may arrive without a timezone designator; appending 'Z'
  // ensures the browser treats the value as UTC and toLocaleTimeString() then
  // converts it to the viewer's local timezone instead of displaying UTC.
  const normalized =
    isoString.includes('Z') || isoString.includes('+')
      ? isoString
      : isoString.replace(' ', 'T') + 'Z';
  return new Date(normalized).toLocaleTimeString([], {
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
  const { messages, loading, sending, sendError, sendMessage } =
    useLeagueChat(leagueId);
  const [inputText, setInputText] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
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

  const handleSendGif = useCallback(
    async (gifUrl: string) => {
      setShowGifPicker(false);
      await sendMessage('', gifUrl);
    },
    [sendMessage],
  );

  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void handleSend();
    },
    [handleSend],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter sends; Shift+Enter inserts a newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [handleSend],
  );

  if (loading) {
    return (
      <YStack flex={1} alignItems="center" justifyContent="center" gap="$3">
        <Spinner size="large" color={BRAND_NAVY_LIGHT} />
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
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
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
                  <XStack gap="$2" alignItems="center" marginBottom="$1">
                    <AvatarImage
                      url={msg.avatarUrl}
                      username={msg.username}
                      size={20}
                    />
                    <Text fontSize="$2" color="$textMuted" fontWeight="600">
                      {msg.username}
                    </Text>
                  </XStack>
                )}
                {msg.messageType === 'gif' && msg.gifUrl ? (
                  <YStack
                    borderRadius="$3"
                    overflow="hidden"
                    maxWidth={240}
                    style={{ cursor: 'pointer' }}
                    onPress={() => {
                      window.open(msg.gifUrl ?? '', '_blank', 'noopener');
                    }}
                  >
                    <img
                      src={msg.gifUrl}
                      alt={`GIF sent by ${msg.username}`}
                      style={{
                        maxWidth: 240,
                        borderRadius: 8,
                        display: 'block',
                      }}
                    />
                  </YStack>
                ) : (
                  <Bubble mine={isMe}>
                    <Text
                      color={isMe ? 'white' : '$color'}
                      fontSize="$4"
                      style={{ wordBreak: 'break-word' }}
                    >
                      {msg.messageText}
                    </Text>
                  </Bubble>
                )}
                <Text fontSize="$1" color="$textMuted" marginTop="$1">
                  {formatTime(msg.createdAt)}
                </Text>
              </YStack>
            );
          })
        )}
      </div>

      {/* GIF Picker — shown above input when active */}
      {showGifPicker && (
        <YStack
          paddingHorizontal="$2"
          paddingBottom="$2"
          borderTopWidth={1}
          borderTopColor="$borderColor"
        >
          <GifPicker
            onSelect={(url) => void handleSendGif(url)}
            onClose={() => setShowGifPicker(false)}
          />
        </YStack>
      )}

      {/* Send error */}
      {sendError != null && (
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$2"
          backgroundColor="$red2"
          borderTopWidth={1}
          borderTopColor="$red6"
        >
          <Text color="$red10" fontSize="$3">
            {sendError}
          </Text>
        </XStack>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} style={{ display: 'contents' }}>
        <XStack
          paddingHorizontal="$4"
          paddingVertical="$3"
          borderTopWidth={1}
          borderTopColor="$borderColor"
          backgroundColor="$background"
          alignItems="flex-end"
          gap="$2"
        >
          {/* GIF button */}
          <Button
            size="$3"
            backgroundColor={showGifPicker ? BRAND_NAVY_LIGHT : '$gray5'}
            color={showGifPicker ? 'white' : '$color'}
            onPress={() => setShowGifPicker((v) => !v)}
            paddingHorizontal="$2"
            aria-label="Open GIF picker"
            aria-pressed={showGifPicker}
          >
            <Text
              fontSize="$2"
              fontWeight="700"
              color={showGifPicker ? 'white' : '$color'}
            >
              GIF
            </Text>
          </Button>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message the league… (Shift+Enter for newline)"
            aria-label="Message the league"
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
              backgroundColor: `var(--surfaceSubtle, ${GRAY_50})`,
              color: 'var(--color)',
              outline: 'none',
              lineHeight: 1.5,
            }}
          />
          <Button
            tag="button"
            type="submit"
            size="$3"
            backgroundColor={BRAND_NAVY_LIGHT}
            color="white"
            disabled={!inputText.trim() || sending}
            opacity={!inputText.trim() || sending ? 0.5 : 1}
            minWidth={80}
            aria-label="Send message"
          >
            <Text fontSize="$3" fontWeight="600" color="white">
              {sending ? '\u2026' : 'Send'}
            </Text>
          </Button>
        </XStack>
      </form>
    </YStack>
  );
}

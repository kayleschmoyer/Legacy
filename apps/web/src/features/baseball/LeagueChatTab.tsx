import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
export interface MentionableTeam {
  id: number;
  name: string;
}

interface LeagueChatTabProps {
  leagueId: number;
  userId: number;
  /** Teams available for @mention autocomplete */
  mentionableTeams?: MentionableTeam[];
  /** Optional callback to navigate to another tab by ID (for system message cards) */
  onNavigate?: (tabId: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function LeagueChatTab({
  leagueId,
  userId,
  mentionableTeams,
  onNavigate,
}: LeagueChatTabProps): React.JSX.Element {
  const { messages, loading, sending, sendError, sendMessage } =
    useLeagueChat(leagueId);
  const [inputText, setInputText] = useState('');
  const [showGifPicker, setShowGifPicker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ---------------------------------------------------------------------------
  // @mention autocomplete state
  // ---------------------------------------------------------------------------
  const [mentionInfo, setMentionInfo] = useState<{
    start: number;
    query: string;
  } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);

  const filteredMentionTeams = useMemo(() => {
    if (!mentionInfo || !mentionableTeams?.length) return [];
    const q = mentionInfo.query.toLowerCase();
    return mentionableTeams
      .filter((t) => t.name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [mentionInfo, mentionableTeams]);

  // Dismiss dropdown when filter produces no results
  useEffect(() => {
    if (mentionInfo !== null && filteredMentionTeams.length === 0) {
      setMentionInfo(null);
    }
  }, [mentionInfo, filteredMentionTeams.length]);

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
    setMentionInfo(null);
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

  const handleMentionSelect = useCallback(
    (team: MentionableTeam) => {
      if (!mentionInfo) return;
      const cursorPos = textareaRef.current?.selectionStart ?? inputText.length;
      const before = inputText.slice(0, mentionInfo.start);
      const after = inputText.slice(cursorPos);
      const newText = `${before}@${team.name} ${after}`;
      setInputText(newText);
      setMentionInfo(null);
      // Restore focus and move cursor after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          const newCursorPos = before.length + team.name.length + 2; // '@' + name + ' '
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
    },
    [mentionInfo, inputText],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      const cursorPos = e.target.selectionStart ?? value.length;
      setInputText(value);

      if (!mentionableTeams?.length) return;

      // Detect an active @mention: @ must be at start of text or after whitespace,
      // and no whitespace between @ and the cursor.
      const beforeCursor = value.slice(0, cursorPos);
      const atIdx = beforeCursor.lastIndexOf('@');
      if (atIdx !== -1 && (atIdx === 0 || /\s/.test(value[atIdx - 1]))) {
        const query = beforeCursor.slice(atIdx + 1);
        if (!/\s/.test(query)) {
          setMentionInfo({ start: atIdx, query });
          setMentionIndex(0);
          return;
        }
      }
      setMentionInfo(null);
    },
    [mentionableTeams],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Handle mention dropdown navigation first
      if (mentionInfo !== null && filteredMentionTeams.length > 0) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setMentionIndex((i) =>
            Math.min(i + 1, filteredMentionTeams.length - 1),
          );
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setMentionIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          handleMentionSelect(filteredMentionTeams[mentionIndex]);
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setMentionInfo(null);
          return;
        }
      }

      // Enter sends; Shift+Enter inserts a newline
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSend();
      }
    },
    [
      mentionInfo,
      filteredMentionTeams,
      mentionIndex,
      handleMentionSelect,
      handleSend,
    ],
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
          <div style={{ flex: 1, position: 'relative' }}>
            {/* @mention autocomplete dropdown */}
            {mentionInfo !== null && filteredMentionTeams.length > 0 && (
              <div
                role="listbox"
                aria-label="Team mentions"
                style={{
                  position: 'absolute',
                  bottom: '100%',
                  left: 0,
                  right: 0,
                  backgroundColor: 'var(--background)',
                  border: '1px solid var(--borderColor)',
                  borderRadius: 8,
                  boxShadow: '0 -4px 16px rgba(0,0,0,0.18)',
                  zIndex: 100,
                  maxHeight: 220,
                  overflowY: 'auto',
                  marginBottom: 4,
                }}
              >
                {filteredMentionTeams.map((team, idx) => (
                  <div
                    key={team.id}
                    role="option"
                    aria-selected={idx === mentionIndex}
                    style={{
                      padding: '8px 14px',
                      cursor: 'pointer',
                      fontSize: 14,
                      fontFamily: 'inherit',
                      backgroundColor:
                        idx === mentionIndex ? 'var(--color2)' : 'transparent',
                      borderRadius: idx === mentionIndex ? 6 : 0,
                    }}
                    onMouseDown={(e) => {
                      // Prevent textarea blur before selection
                      e.preventDefault();
                      handleMentionSelect(team);
                    }}
                    onMouseEnter={() => setMentionIndex(idx)}
                  >
                    <span style={{ color: 'var(--color)', fontWeight: 600 }}>
                      @{team.name}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <textarea
              ref={textareaRef}
              value={inputText}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Message the league… (Shift+Enter for newline)"
              aria-label="Message the league"
              aria-autocomplete="list"
              aria-controls={
                mentionInfo !== null && filteredMentionTeams.length > 0
                  ? 'mention-listbox'
                  : undefined
              }
              maxLength={2000}
              rows={2}
              style={{
                width: '100%',
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
          </div>
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

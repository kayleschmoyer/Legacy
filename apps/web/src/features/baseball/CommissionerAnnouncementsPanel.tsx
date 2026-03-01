import React, { useCallback, useState } from 'react';
import {
  Button,
  Card,
  Separator,
  Spinner,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import { Megaphone, Plus, Send, X } from '@tamagui/lucide-icons';
import {
  GetLeagueAnnouncements,
  type GetLeagueAnnouncementsQuery,
  useGetLeagueAnnouncementsQuery,
  usePostLeagueAnnouncementMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Announcement {
  id: string;
  messageText: string;
  timestamp: string | null;
  sender: { username: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(isoString: string | null): string {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function mapAnnouncements(
  data: GetLeagueAnnouncementsQuery | undefined,
): Announcement[] {
  return (data?.getLeagueAnnouncements ?? []).map((a) => ({
    id: String(a.id),
    messageText: a.messageText ?? '',
    timestamp: a.timestamp ?? null,
    sender: a.sender ? { username: a.sender.username ?? 'Commissioner' } : null,
  }));
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------
interface CommissionerAnnouncementsPanelProps {
  leagueId: number;
  isCommissioner: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function CommissionerAnnouncementsPanel({
  leagueId,
  isCommissioner,
}: CommissionerAnnouncementsPanelProps): React.JSX.Element | null {
  const [showCompose, setShowCompose] = useState(false);
  const [inputText, setInputText] = useState('');
  const [postError, setPostError] = useState<string | null>(null);

  const { data, loading, refetch } = useGetLeagueAnnouncementsQuery({
    variables: { leagueId },
    skip: isNaN(leagueId),
    fetchPolicy: 'cache-and-network',
  });

  const [postAnnouncement, { loading: posting }] =
    usePostLeagueAnnouncementMutation();

  const announcements = mapAnnouncements(data);

  const handlePost = useCallback(async () => {
    const text = inputText.trim();
    if (!text || posting) return;
    setPostError(null);
    try {
      await postAnnouncement({
        variables: { leagueId, messageText: text },
        awaitRefetchQueries: true,
        refetchQueries: [
          {
            query: GetLeagueAnnouncements,
            variables: { leagueId },
          },
        ],
      });
      setInputText('');
      setShowCompose(false);
      void refetch();
    } catch (err: unknown) {
      setPostError(
        err instanceof Error ? err.message : 'Failed to post announcement',
      );
    }
  }, [inputText, posting, postAnnouncement, leagueId, refetch]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handlePost();
      }
    },
    [handlePost],
  );

  // Don't render the panel if there are no announcements and the user is not
  // the commissioner (no reason to show an empty section to regular members).
  if (!isCommissioner && announcements.length === 0 && !loading) {
    return null;
  }

  return (
    <Card
      backgroundColor="$surfacePanel"
      borderColor="$surfacePanelBorder"
      borderWidth={1}
      borderRadius="$6"
      overflow="hidden"
    >
      {/* Header */}
      <XStack
        alignItems="center"
        justifyContent="space-between"
        paddingHorizontal="$5"
        paddingVertical="$4"
        style={{
          background: `linear-gradient(90deg, ${withAlpha(BRAND_NAVY_LIGHT, 0.25)} 0%, transparent 100%)`,
          borderBottom: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.2)}`,
        }}
      >
        <XStack alignItems="center" gap="$2">
          <Megaphone size={18} color={BRAND_GOLD_LIGHT} />
          <Text fontSize="$5" fontWeight="700" color="$color">
            Commissioner Announcements
          </Text>
          {announcements.length > 0 && (
            <XStack
              backgroundColor={withAlpha(BRAND_GOLD_LIGHT, 0.15)}
              borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.4)}
              borderWidth={1}
              borderRadius={99}
              paddingHorizontal="$2"
              paddingVertical="$0.5"
            >
              <Text fontSize="$1" color={BRAND_GOLD_LIGHT} fontWeight="700">
                {announcements.length}
              </Text>
            </XStack>
          )}
        </XStack>

        {isCommissioner && !showCompose && (
          <Button
            size="$2"
            icon={<Plus size={14} />}
            onPress={() => {
              setShowCompose(true);
            }}
            backgroundColor={withAlpha(BRAND_GOLD_LIGHT, 0.15)}
            borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.4)}
            borderWidth={1}
            color={BRAND_GOLD_LIGHT}
            hoverStyle={{
              backgroundColor: withAlpha(BRAND_GOLD_LIGHT, 0.25),
            }}
          >
            New Announcement
          </Button>
        )}
      </XStack>

      {/* Compose area */}
      {isCommissioner && showCompose && (
        <YStack
          padding="$4"
          gap="$3"
          style={{
            borderBottom: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.15)}`,
            backgroundColor: withAlpha(BRAND_NAVY_LIGHT, 0.1),
          }}
        >
          <textarea
            value={inputText}
            onChange={(e) => {
              setInputText(e.target.value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Write an announcement for all league members… (Ctrl+Enter to post)"
            maxLength={2000}
            rows={3}
            style={{
              width: '100%',
              resize: 'vertical',
              padding: '10px 12px',
              borderRadius: 8,
              border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.3)}`,
              backgroundColor: 'var(--background)',
              color: 'var(--color)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {postError && (
            <Text fontSize="$2" color="$red10">
              {postError}
            </Text>
          )}
          <XStack gap="$2" justifyContent="flex-end">
            <Button
              size="$2"
              icon={<X size={14} />}
              onPress={() => {
                setShowCompose(false);
                setInputText('');
                setPostError(null);
              }}
              chromeless
              color="$textMuted"
            >
              Cancel
            </Button>
            <Button
              size="$2"
              icon={posting ? <Spinner size="small" /> : <Send size={14} />}
              onPress={() => {
                void handlePost();
              }}
              disabled={!inputText.trim() || posting}
              backgroundColor={BRAND_NAVY_LIGHT}
              color="white"
              hoverStyle={{ opacity: 0.85 }}
            >
              Post Announcement
            </Button>
          </XStack>
        </YStack>
      )}

      {/* Announcement list */}
      {loading && announcements.length === 0 ? (
        <YStack alignItems="center" padding="$5">
          <Spinner size="small" color={BRAND_GOLD_LIGHT} />
        </YStack>
      ) : announcements.length === 0 ? (
        <YStack alignItems="center" padding="$6" gap="$2">
          <Text color="$textMuted" fontSize="$3" textAlign="center">
            No announcements yet.
          </Text>
          {isCommissioner && (
            <Text color="$textMuted" fontSize="$2" textAlign="center">
              Post an announcement to notify all league members.
            </Text>
          )}
        </YStack>
      ) : (
        <YStack>
          {announcements.map((announcement, idx) => (
            <React.Fragment key={announcement.id}>
              <XStack
                gap="$3"
                paddingHorizontal="$5"
                paddingVertical="$4"
                alignItems="flex-start"
              >
                {/* Icon avatar */}
                <YStack
                  width={36}
                  height={36}
                  borderRadius={18}
                  alignItems="center"
                  justifyContent="center"
                  flexShrink={0}
                  style={{
                    background: `linear-gradient(135deg, ${withAlpha(BRAND_GOLD_LIGHT, 0.3)}, ${withAlpha(BRAND_NAVY_LIGHT, 0.3)})`,
                    border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.3)}`,
                  }}
                >
                  <Megaphone size={16} color={BRAND_GOLD_LIGHT} />
                </YStack>

                {/* Content */}
                <YStack flex={1} gap="$1">
                  <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    gap="$2"
                    flexWrap="wrap"
                  >
                    <XStack alignItems="center" gap="$2">
                      <Text fontSize="$3" fontWeight="700" color="$color">
                        {announcement.sender?.username ?? 'Commissioner'}
                      </Text>
                      <XStack
                        backgroundColor={withAlpha(BRAND_GOLD_LIGHT, 0.12)}
                        borderColor={withAlpha(BRAND_GOLD_LIGHT, 0.35)}
                        borderWidth={1}
                        borderRadius={99}
                        paddingHorizontal="$2"
                        paddingVertical={2}
                      >
                        <Text
                          fontSize={10}
                          color={BRAND_GOLD_LIGHT}
                          fontWeight="700"
                          textTransform="uppercase"
                          letterSpacing={0.5}
                        >
                          Commissioner
                        </Text>
                      </XStack>
                    </XStack>
                    <Text fontSize="$1" color="$textMuted">
                      {formatDate(announcement.timestamp)}
                    </Text>
                  </XStack>
                  <Text
                    fontSize="$4"
                    color="$color"
                    lineHeight="$5"
                    style={{ wordBreak: 'break-word' } as React.CSSProperties}
                  >
                    {announcement.messageText}
                  </Text>
                </YStack>
              </XStack>
              {idx < announcements.length - 1 && (
                <Separator borderColor="$outlineSubtle" marginLeft={61} />
              )}
            </React.Fragment>
          ))}
        </YStack>
      )}
    </Card>
  );
}

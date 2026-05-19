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
import { Edit3, Megaphone, Plus, Send, Trash2, X } from '@tamagui/lucide-icons';
import {
  GetLeagueAnnouncements,
  type GetLeagueAnnouncementsQuery,
  useDeleteLeagueAnnouncementMutation,
  useGetLeagueAnnouncementsQuery,
  usePostLeagueAnnouncementMutation,
  useUpdateLeagueAnnouncementMutation,
} from '../../api/db/graphql.generated';
import {
  BRAND_GOLD_LIGHT,
  BRAND_NAVY_LIGHT,
  withAlpha,
} from '../../constants/colors';
import { FONT_DISPLAY } from '../../constants/typography';

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

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editError, setEditError] = useState<string | null>(null);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data, loading } = useGetLeagueAnnouncementsQuery({
    variables: { leagueId },
    skip: isNaN(leagueId),
    fetchPolicy: 'cache-and-network',
  });

  const [postAnnouncement, { loading: posting }] =
    usePostLeagueAnnouncementMutation();

  const [updateAnnouncement, { loading: updating }] =
    useUpdateLeagueAnnouncementMutation();

  const [deleteAnnouncement] = useDeleteLeagueAnnouncementMutation();

  const announcements = mapAnnouncements(data);

  const handlePost = useCallback(async () => {
    const text = inputText.trim();
    if (!text || posting) return;
    setPostError(null);
    try {
      await postAnnouncement({
        variables: { leagueId, messageText: text },
        // The mutation returns the new LeagueChatMessage entity (handled by
        // the normalized cache), but the league activity feed renders a
        // separate LeagueActivity event type that the server derives from
        // announcements. Refetch both list queries — GetLeagueActivity is
        // passed by name so every active observer refetches regardless of
        // its (leagueId, limit, eventTypes) variables (LS-3769).
        // Refetches fire in the background; do not block the form reset on
        // them — awaiting could leave the compose textarea visible past
        // assertion timeouts when a refetch runs slowly against the live
        // backend (LS-4533).
        refetchQueries: [
          {
            query: GetLeagueAnnouncements,
            variables: { leagueId },
          },
          'GetLeagueActivity',
        ],
      });
      setInputText('');
      setShowCompose(false);
    } catch (err: unknown) {
      setPostError(
        err instanceof Error ? err.message : 'Failed to post announcement',
      );
    }
  }, [inputText, posting, postAnnouncement, leagueId]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handlePost();
      }
    },
    [handlePost],
  );

  const handleEditStart = useCallback((id: string, currentText: string) => {
    setEditingId(id);
    setEditText(currentText);
    setEditError(null);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingId(null);
    setEditText('');
    setEditError(null);
  }, []);

  const handleEditSave = useCallback(
    async (id: string) => {
      const text = editText.trim();
      if (!text || updating) return;
      setEditError(null);
      try {
        await updateAnnouncement({
          variables: { id: Number(id), leagueId, messageText: text },
          awaitRefetchQueries: true,
          refetchQueries: [
            { query: GetLeagueAnnouncements, variables: { leagueId } },
          ],
        });
        setEditingId(null);
        setEditText('');
      } catch (err: unknown) {
        setEditError(
          err instanceof Error ? err.message : 'Failed to update announcement',
        );
      }
    },
    [editText, updating, updateAnnouncement, leagueId],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      setDeletingId(id);
      try {
        await deleteAnnouncement({
          variables: { id: Number(id), leagueId },
          awaitRefetchQueries: true,
          refetchQueries: [
            { query: GetLeagueAnnouncements, variables: { leagueId } },
          ],
        });
      } finally {
        setDeletingId(null);
      }
    },
    [deleteAnnouncement, leagueId],
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
          <Text
            fontSize="$5"
            fontWeight="700"
            color="$color"
            fontFamily={FONT_DISPLAY}
            textTransform="uppercase"
            letterSpacing={0.8}
          >
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
                data-testid={`announcement-row-${announcement.id}`}
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
                    <XStack alignItems="center" gap="$2">
                      <Text fontSize="$1" color="$textMuted">
                        {formatDate(announcement.timestamp)}
                      </Text>
                      {isCommissioner && editingId !== announcement.id && (
                        <>
                          <Button
                            size="$1"
                            circular
                            chromeless
                            icon={<Edit3 size={12} />}
                            color="$textMuted"
                            aria-label="Edit announcement"
                            onPress={() => {
                              handleEditStart(
                                announcement.id,
                                announcement.messageText,
                              );
                            }}
                            hoverStyle={{ color: BRAND_GOLD_LIGHT }}
                          />
                          <Button
                            size="$1"
                            circular
                            chromeless
                            icon={
                              deletingId === announcement.id ? (
                                <Spinner size="small" />
                              ) : (
                                <Trash2 size={12} />
                              )
                            }
                            color="$textMuted"
                            aria-label="Delete announcement"
                            disabled={deletingId === announcement.id}
                            onPress={() => {
                              void handleDelete(announcement.id);
                            }}
                            hoverStyle={{ color: '$red10' }}
                          />
                        </>
                      )}
                    </XStack>
                  </XStack>

                  {/* Inline edit form */}
                  {isCommissioner && editingId === announcement.id ? (
                    <YStack gap="$2">
                      <textarea
                        value={editText}
                        onChange={(e) => {
                          setEditText(e.target.value);
                        }}
                        maxLength={2000}
                        rows={3}
                        style={{
                          width: '100%',
                          resize: 'vertical',
                          padding: '8px 10px',
                          borderRadius: 6,
                          border: `1px solid ${withAlpha(BRAND_GOLD_LIGHT, 0.3)}`,
                          backgroundColor: 'var(--background)',
                          color: 'var(--color)',
                          fontSize: 14,
                          fontFamily: 'inherit',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      {editError && (
                        <Text fontSize="$2" color="$red10">
                          {editError}
                        </Text>
                      )}
                      <XStack gap="$2">
                        <Button
                          size="$2"
                          icon={<X size={14} />}
                          onPress={handleEditCancel}
                          chromeless
                          color="$textMuted"
                        >
                          Cancel
                        </Button>
                        <Button
                          size="$2"
                          icon={
                            updating ? (
                              <Spinner size="small" />
                            ) : (
                              <Send size={14} />
                            )
                          }
                          onPress={() => {
                            void handleEditSave(announcement.id);
                          }}
                          disabled={!editText.trim() || updating}
                          backgroundColor={BRAND_NAVY_LIGHT}
                          color="white"
                          hoverStyle={{ opacity: 0.85 }}
                        >
                          Save
                        </Button>
                      </XStack>
                    </YStack>
                  ) : (
                    <Text
                      fontSize="$4"
                      color="$color"
                      lineHeight="$5"
                      style={{ wordBreak: 'break-word' } as React.CSSProperties}
                    >
                      {announcement.messageText}
                    </Text>
                  )}
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

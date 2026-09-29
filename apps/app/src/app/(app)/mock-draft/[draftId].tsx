/**
 * Mock draft room route (LS-10076) — `(app)/mock-draft/[draftId]`.
 *
 * `DraftBoardPage` is the league equivalent and takes a leagueId; a mock draft
 * has no league, so this route carries the draft id and the board loads
 * `draftRoom(draftId)` directly. Chat comes from the draft's own
 * `draft_messages` rather than league chat.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Share } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';
import { LOGGER } from '@legacy-sports/logging';
import { useMutation, useQuery } from '@apollo/client/react';
import {
  GetDraftMessages as GET_DRAFT_MESSAGES,
  type GetDraftMessagesQuery,
  type GetDraftMessagesQueryVariables,
  SendDraftMessage as SEND_DRAFT_MESSAGE,
  type SendDraftMessageMutation,
  type SendDraftMessageMutationVariables,
} from '@legacy-sports/graphql';
import {
  DraftChatTab,
  EliteDraftBoardScreen,
} from '@legacy-sports/shared-components/elite-draft';
import type { DraftChatTabRenderProps } from '@legacy-sports/shared-components/elite-draft';

import { config } from '@legacy-sports/app-config/native';
import { closeToHomeTab, toIntId } from '../../../common/utilities/RouteUtils';

function DraftChatConnector({
  draftId,
  userId,
  onNewMessage,
}: DraftChatTabRenderProps & { draftId: number }): React.JSX.Element {
  const { data, loading, refetch } = useQuery<
    GetDraftMessagesQuery,
    GetDraftMessagesQueryVariables
  >(GET_DRAFT_MESSAGES, {
    variables: { draftId },
    fetchPolicy: 'cache-and-network',
  });
  const [sendDraftMessage, { loading: sending }] = useMutation<
    SendDraftMessageMutation,
    SendDraftMessageMutationVariables
  >(SEND_DRAFT_MESSAGE);

  const messages = data?.draftMessages ?? [];
  const prevCountRef = useRef<number | null>(null);

  useEffect(() => {
    if (
      prevCountRef.current !== null &&
      messages.length > prevCountRef.current
    ) {
      onNewMessage();
    }
    prevCountRef.current = messages.length;
  }, [messages.length, onNewMessage]);

  const handleSend = useCallback(
    async (messageText: string) => {
      await sendDraftMessage({ variables: { draftId, messageText } });
      await refetch();
    },
    [draftId, sendDraftMessage, refetch],
  );

  return (
    <DraftChatTab
      currentUserId={userId}
      loading={loading}
      sending={sending}
      messages={messages.map((m) => ({
        id: m.id ?? 0,
        userId: m.userId ?? 0,
        username: m.user?.username ?? 'Manager',
        messageText: m.messageText ?? '',
      }))}
      onSend={(text) => void handleSend(text)}
    />
  );
}

export default function MockDraftRoomPage(): React.JSX.Element {
  const { draftId: draftIdParam } = useLocalSearchParams();
  const router = useRouter();
  const draftId = toIntId(draftIdParam);
  const websocketUrl = config.websocketUrl;
  const { bottom: bottomInset } = useSafeAreaInsets();

  useEffect(() => {
    if (!websocketUrl) {
      LOGGER.error(
        'EXPO_PUBLIC_WEBSOCKET_URL is not configured — falling back to polling for live draft updates',
      );
    }
  }, [websocketUrl]);

  const renderChatTab = useCallback(
    (props: DraftChatTabRenderProps) =>
      props.draftId == null ? null : (
        <DraftChatConnector {...props} draftId={props.draftId} />
      ),
    [],
  );

  const handleDownloadDraftPacket = async (
    contents: string,
    filename: string,
  ) => {
    try {
      const result = await Share.share({ message: contents, title: filename });
      if (result.action === Share.dismissedAction) {
        LOGGER.debug('Draft packet share dismissed by user');
      }
    } catch (error: unknown) {
      LOGGER.error(
        'Error while sharing draft packet',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  };

  return (
    // Same Maestro landing anchor as the league draft route (LS-8446).
    <YStack flex={1} testID="elite-draft-board-screen">
      {!websocketUrl && (
        <YStack backgroundColor="$yellow4" padding="$2">
          <Text color="$yellow11" textAlign="center" fontSize="$2">
            Real-time updates unavailable — polling for picks every 5s
          </Text>
        </YStack>
      )}
      <EliteDraftBoardScreen
        leagueId={null}
        draftId={draftId}
        onNavigate={(path) => router.navigate(path)}
        websocketUrl={websocketUrl ?? ''}
        renderChatTab={renderChatTab}
        bottomInset={bottomInset}
        onExitDraft={() => closeToHomeTab(router)}
        onDownloadDraftPacket={(contents, filename) =>
          void handleDownloadDraftPacket(contents, filename)
        }
      />
    </YStack>
  );
}

export { ScreenErrorBoundary as ErrorBoundary } from '../_screenErrorBoundary';

/**
 * Mock draft room route component (LS-10076) — mounted at both
 * `/baseball/mock-draft/:draftId` and `/football/mock-draft/:draftId`.
 *
 * The league draft route (`EliteDraftBoard.tsx`) resolves a league and lets
 * the board find its draft; a mock draft has no league, so this route carries
 * the draft id and the board loads `draftRoom(draftId)` directly. Chat comes
 * from the draft's own `draft_messages` rather than league chat.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useMatch, useNavigate, useParams } from 'react-router-dom';
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

import { env } from '../config/environment';
import { downloadCsvFile } from '../utils/draftPacketDownload';

/** The draft's own chat, in the shape `DraftChatTab` renders. */
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
  // null until the first sync, so loading history never counts as "new".
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

export function MockDraftBoardScreen(): React.JSX.Element {
  const { draftId: draftIdParam } = useParams<{ draftId: string }>();
  // The routes are static per sport (no `:sport` param), so derive the sport
  // from the matched path — an explicit `sport` overrides the draft's own, and
  // this keeps the board correct before `draftRoom` loads (LS-10489).
  const isFootball = useMatch('/football/mock-draft/:draftId') !== null;
  const navigate = useNavigate();
  const draftId = draftIdParam ? parseInt(draftIdParam, 10) : null;
  const [, setIsDraftActive] = useState(false);

  const renderChatTab = useCallback(
    (props: DraftChatTabRenderProps) =>
      props.draftId == null ? null : (
        <DraftChatConnector {...props} draftId={props.draftId} />
      ),
    [],
  );

  return (
    <EliteDraftBoardScreen
      leagueId={null}
      draftId={Number.isFinite(draftId) ? draftId : null}
      sport={isFootball ? 'football' : 'baseball'}
      onNavigate={(path) => navigate(path)}
      websocketUrl={env.websocketUrl}
      renderChatTab={renderChatTab}
      onActiveDraftChange={setIsDraftActive}
      onDownloadDraftPacket={(contents, filename) =>
        downloadCsvFile(filename, contents)
      }
    />
  );
}

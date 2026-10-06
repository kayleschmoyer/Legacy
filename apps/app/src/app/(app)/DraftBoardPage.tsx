import React, { useEffect, useState } from 'react';
import { useKeepAwake } from 'expo-keep-awake';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';
import {
  DraftChatTab,
  EliteDraftBoardScreen,
} from '@legacy-sports/shared-components/elite-draft';
import type { DraftChatTabRenderProps } from '@legacy-sports/shared-components/elite-draft';
import { LOGGER } from '@legacy-sports/logging';
import { config } from '@legacy-sports/app-config/native';
import { readKeychainValue, Secret } from '../../common/auth/AuthHooks';
import {
  closeToHomeTab,
  navigateFromModal,
  toIntId,
} from '../../common/utilities/RouteUtils';
import { LeagueWebSocketContext } from '../../context/LeagueWebSocketContext';
import { useLeagueChat } from '../../features/leagues/hooks/useLeagueChat';
import { useDraftChatUnread } from '../../hooks/useDraftChatUnread';
import { useLeagueWebSocketLifecycle } from '../../hooks/useLeagueWebSocketLifecycle';

/**
 * Chat tab data connector (LS-9401) — same `useLeagueChat` data source
 * `LeagueChatTab` uses elsewhere in the app, feeding the v2-styled
 * `DraftChatTab` presentational component. Kept mounted by the caller
 * regardless of which tab is active (see EliteDraftBoardScreen's
 * display:none rendering) so `onNewMessage` can fire while the viewer is on
 * another tab.
 *
 * Deliberately not shared with `apps/web`'s near-identical connector: each
 * platform's `useLeagueChat` hook has a different `userId` type (native:
 * `number`; web: `number | null`), so the message-mapping step would need
 * a platform-supplied transform either way — collapsing two ~15-line
 * components behind an indirection layer isn't a net simplification here.
 */
function renderChatTab({
  leagueId,
  userId,
  onNewMessage,
  chatOpen,
}: DraftChatTabRenderProps) {
  return (
    <ChatTabConnector
      leagueId={leagueId}
      userId={userId}
      onNewMessage={onNewMessage}
      chatOpen={chatOpen}
    />
  );
}

function ChatTabConnector({
  leagueId,
  userId,
  onNewMessage,
  chatOpen,
}: DraftChatTabRenderProps): React.JSX.Element {
  // League drafts always carry a league id; the mock-draft room has its own
  // chat connector ((app)/mock-draft/[draftId].tsx) and never mounts this
  // one (LS-10076).
  const { messages, loading, sending, sendError, sendMessage } = useLeagueChat(
    leagueId ?? 0,
  );
  // Unread dot keyed on a persisted last-read id (same key as League Home's
  // chat badge) rather than a per-mount message count, so loading history on
  // re-entry never re-raises it (LS-10593).
  useDraftChatUnread({
    storageKey: leagueId ?? 0,
    messages,
    currentUserId: userId,
    chatOpen,
    onNewMessage,
  });

  return (
    <DraftChatTab
      currentUserId={userId}
      loading={loading}
      sending={sending}
      messages={messages.map((m) => ({
        id: m.id,
        userId: m.userId,
        username: m.username,
        messageText: m.messageText,
        pending: m.pending,
      }))}
      onSend={(text) => void sendMessage(text)}
      sendError={sendError}
    />
  );
}

// Deliberately no pull-to-refresh here (LS-8847): the board is WebSocket-driven
// and already live-updates via `EliteDraftBoardScreen`'s socket connection, and
// a pull gesture stacked on the board's own drag/tap interactions for picks
// would compete with them rather than help — see the ticket's Open Questions.
export default function DraftBoardPage() {
  const { leagueId: leagueIdParam } = useLocalSearchParams();
  const router = useRouter();
  const leagueId = toIntId(leagueIdParam);
  const websocketUrl = config.websocketUrl;
  // This route is pushed on top of the root Stack, outside the `(tabs)` group,
  // so nothing above it reserves the Android edge-to-edge navigation-bar inset
  // the way React Navigation's tab bar does for the tab shell — the draft
  // room's own bottom nav has to reserve it itself (LS-9444). `(app)/_layout`
  // already supplies the matching top inset via the Stack's `contentStyle`.
  const { top: topInset, bottom: bottomInset } = useSafeAreaInsets();
  // Keep the phone awake for the live draft room, matching DraftWatchPage
  // (LS-10593).
  useKeepAwake('draft-board');

  // League chat broadcasts only reach sockets registered under the league id
  // (LeagueIdIndex); the board's own draft socket registers the draft id, so
  // without a league socket here `useLeagueChat` saw `connected: false`,
  // queued every send offline forever, and never received anyone else's
  // messages. Give the draft room its own league socket, read the token the
  // same way the league screens do (LS-10593).
  const [wsToken, setWsToken] = useState<string | undefined>();
  useEffect(() => {
    let active = true;
    void readKeychainValue(Secret.INTERNAL_JWT).then((token: string | null) => {
      if (active && token) setWsToken(token);
    });
    return () => {
      active = false;
    };
  }, []);
  const { client: wsClient, connected: wsConnected } =
    useLeagueWebSocketLifecycle({
      leagueId: leagueId ?? undefined,
      url: websocketUrl,
      token: wsToken,
    });

  useEffect(() => {
    if (!websocketUrl) {
      LOGGER.error(
        'EXPO_PUBLIC_WEBSOCKET_URL is not configured — falling back to polling for live draft updates',
      );
    }
  }, [websocketUrl]);

  // Mobile has no filesystem "download" affordance without a new native
  // dependency, so the draft packet CSV is handed to the native share sheet
  // (Save to Files, email, etc.) instead — same pattern as
  // PlayerStats.tsx's handleShare (LS-9750).
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
    // Mandatory navigation-landing anchor for the Maestro live-draft-board flow
    // (LS-8446): a stable container present across every draft state so tapping
    // the draft-status chip fails the flow loudly if the board never mounts.
    <LeagueWebSocketContext.Provider
      value={{ client: wsClient, connected: wsConnected }}
    >
      <YStack flex={1} testID="elite-draft-board-screen">
        {!websocketUrl && (
          <YStack backgroundColor="$yellow4" padding="$2">
            <Text color="$yellow11" textAlign="center" fontSize="$2">
              Real-time updates unavailable — polling for picks every 5s
            </Text>
          </YStack>
        )}
        <EliteDraftBoardScreen
          leagueId={leagueId}
          onNavigate={(path) => navigateFromModal(router, path)}
          websocketUrl={websocketUrl ?? ''}
          renderChatTab={renderChatTab}
          bottomInset={bottomInset}
          topInset={topInset}
          onExitDraft={() => closeToHomeTab(router)}
          onDownloadDraftPacket={(contents, filename) =>
            void handleDownloadDraftPacket(contents, filename)
          }
        />
      </YStack>
    </LeagueWebSocketContext.Provider>
  );
}
export { ScreenErrorBoundary as ErrorBoundary } from './_screenErrorBoundary';

/**
 * EliteDraftBoard — web wrapper
 *
 * The implementation lives in @legacy-sports/shared-components. This wrapper
 * provides web-specific navigation (react-router-dom) and environment config.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@legacy-sports/shared-components/auth';
import {
  DraftChatTab,
  EliteDraftBoardScreen,
  LEAVES_DRAFT_ATTRIBUTE,
} from '@legacy-sports/shared-components/elite-draft';
import type {
  DraftChatProps,
  DraftChatTabRenderProps,
} from '@legacy-sports/shared-components/elite-draft';
import { LeagueChatTab } from '../features/baseball/LeagueChatTab';
import { LeagueWebSocketContext } from '../context/LeagueWebSocketContext';
import { useDraftChatUnread } from '../hooks/useDraftChatUnread';
import { useLeagueChat } from '../hooks/useLeagueChat';
import { useLeagueWebSocketLifecycle } from '../hooks/useLeagueWebSocketLifecycle';
import { env } from '../config/environment';
import { trackPlayerSelected } from '../utils/analytics';
import { downloadCsvFile } from '../utils/draftPacketDownload';

/**
 * Heartbeat cadence for the draft room's league socket — matches the draft
 * socket's 15s (DRAFT_HEARTBEAT_MS, LS-8880) so a zombie league socket stops
 * silently swallowing chat for minutes (LS-10630).
 */
const DRAFT_LEAGUE_SOCKET_HEARTBEAT_MS = 15 * 1000;

function renderChat({ leagueId, userId, mentionableTeams }: DraftChatProps) {
  return (
    <LeagueChatTab
      leagueId={leagueId}
      userId={userId}
      mentionableTeams={mentionableTeams}
    />
  );
}

/**
 * Chat tab data connector (LS-9401) — calls the same `useLeagueChat` data
 * source `LeagueChatTab`/`renderChat` above use, and hands the raw messages
 * to the v2-styled `DraftChatTab` presentational component. Kept mounted by
 * the caller regardless of which tab is active (see
 * EliteDraftBoardScreen's display:none rendering) so `onNewMessage` can
 * still fire while the viewer is on another tab.
 *
 * Deliberately not shared with `apps/app`'s near-identical connector: each
 * platform's `useLeagueChat` hook has a different `userId` type (web:
 * `number | null`; native: `number`), so the message-mapping step would
 * need a platform-supplied transform either way — collapsing two ~15-line
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
  // chat connector (MockDraftBoard.tsx) and never mounts this one (LS-10076).
  const { messages, loading, sending, sendError, sendMessage } = useLeagueChat(
    leagueId ?? 0,
  );
  // Unread dot keyed on a persisted last-read id rather than a per-mount
  // message count, so loading history on re-entry never re-raises it
  // (LS-10593). Only the compact layout mounts this connector; the wide
  // layout's `renderChat` overlay has no unread dot.
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
        userId: m.userId ?? 0,
        username: m.username,
        messageText: m.messageText,
      }))}
      onSend={(text) => void sendMessage(text)}
      sendError={sendError}
    />
  );
}

export function EliteDraftBoardScreenWrapper(): React.JSX.Element {
  const { id: leagueIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;
  const [isDraftActive, setIsDraftActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const { user, isLoading: authLoading, token: authToken } = useAuth();

  // League chat broadcasts only reach sockets registered under the league id
  // (LeagueIdIndex); the board's own draft socket registers the draft id, so
  // without a league socket here `useLeagueChat` (both the compact Chat tab
  // and the wide `renderChat` overlay) never received anyone else's
  // messages live. Give the draft room its own league socket, the same way
  // LeagueDetailPageV2 does (LS-10593).
  const { client: wsClient, connected: wsConnected } =
    useLeagueWebSocketLifecycle({
      leagueId: leagueId ?? NaN,
      isAuthenticated: !authLoading && !!user,
      authToken,
      heartbeatMs: DRAFT_LEAGUE_SOCKET_HEARTBEAT_MS,
    });

  // Warn before leaving an active draft (LS-4986).
  //
  // Implementation note: react-router-dom v6's `useBlocker` only works under a
  // Data Router (`createBrowserRouter` + `RouterProvider`). This app mounts a
  // classic `<BrowserRouter>` (see apps/web/src/main.tsx), so `useBlocker`
  // throws "must be used within a data router" and crashes the whole draft
  // board. We therefore guard navigation with window/document listeners
  // instead — the same pattern used by LeagueScoringEditor (LS-4104).
  useEffect(() => {
    if (!isDraftActive) return;

    const promptMessage =
      'Your draft is still in progress. Leave now? Auto-pick will fill in ' +
      'while you’re away, but you may miss your turn.';

    // 1. Browser-level: refresh, tab close, typed-URL / external navigation.
    //    The browser supplies its own dialog text; `returnValue` is required
    //    for the prompt to appear at all but its value is ignored.
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // 2. SPA-level: in-app clicks that would trigger a route change (header
    //    tabs, nav links). Capture-phase so we run before any onClick that
    //    calls `navigate()`. Clicks inside the draft board itself are draft
    //    interactions, never navigations, so they're excluded via containerRef.
    const handleNavClick = (event: MouseEvent) => {
      // Only primary clicks without modifiers; cmd/ctrl/shift-click opens a new
      // tab and doesn't lose the current page's state.
      if (
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;

      // Clicks within the draft board are draft interactions — let them through.
      // The exception is the board's own way out (the hero's back link,
      // LS-10204), which marks itself as leaving the draft.
      if (
        containerRef.current?.contains(target) &&
        !target.closest(`[${LEAVES_DRAFT_ATTRIBUTE}]`)
      ) {
        return;
      }

      const navTarget = target.closest('[role="tab"], a[href]');
      if (!navTarget) return;

      // The phone pick sheet (Players / Queue / History tabs, LS-10165) is a
      // Tamagui modal portaled to <body>, so containerRef can't see it. A tab
      // inside a dialog switches the dialog's own content — it never changes
      // the route. Links inside dialogs still get the prompt.
      if (
        navTarget.getAttribute('role') === 'tab' &&
        navTarget.closest('[role="dialog"]')
      ) {
        return;
      }

      // Re-selecting the current tab is a no-op route-wise.
      if (navTarget.getAttribute('aria-selected') === 'true') return;

      // External / new-window links bypass the SPA — beforeunload covers those.
      if (navTarget instanceof HTMLAnchorElement) {
        if (navTarget.target === '_blank') return;
        const href = navTarget.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('?')) return;
      }

      if (!window.confirm(promptMessage)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    document.addEventListener('click', handleNavClick, { capture: true });

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('click', handleNavClick, { capture: true });
    };
  }, [isDraftActive]);

  // `display: contents` so this guard wrapper adds no box of its own and the
  // draft board's layout is unchanged; DOM containment (containerRef) still
  // works regardless of the display value.
  return (
    <LeagueWebSocketContext.Provider
      value={{ client: wsClient, connected: wsConnected }}
    >
      <div ref={containerRef} style={{ display: 'contents' }}>
        <EliteDraftBoardScreen
          leagueId={leagueId}
          onNavigate={(path) => navigate(path)}
          websocketUrl={env.websocketUrl}
          renderChat={renderChat}
          renderChatTab={renderChatTab}
          onPlayerDrafted={trackPlayerSelected}
          onActiveDraftChange={setIsDraftActive}
          onDownloadDraftPacket={(contents, filename) =>
            downloadCsvFile(filename, contents)
          }
        />
      </div>
    </LeagueWebSocketContext.Provider>
  );
}

// Re-export as the original name for backwards compatibility
export { EliteDraftBoardScreenWrapper as EliteDraftBoardScreen };

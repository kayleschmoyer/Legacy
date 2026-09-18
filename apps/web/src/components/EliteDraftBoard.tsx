/**
 * EliteDraftBoard — web wrapper
 *
 * The implementation lives in @legacy-sports/shared-components. This wrapper
 * provides web-specific navigation (react-router-dom) and environment config.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import { useLeagueChat } from '../hooks/useLeagueChat';
import { env } from '../config/environment';
import { trackPlayerSelected } from '../utils/analytics';
import { downloadCsvFile } from '../utils/draftPacketDownload';

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
}: DraftChatTabRenderProps) {
  return (
    <ChatTabConnector
      leagueId={leagueId}
      userId={userId}
      onNewMessage={onNewMessage}
    />
  );
}

function ChatTabConnector({
  leagueId,
  userId,
  onNewMessage,
}: DraftChatTabRenderProps): React.JSX.Element {
  const { messages, loading, sending, sendMessage } = useLeagueChat(leagueId);
  // null until the first sync so loading the existing message history never
  // counts as a "new" message for the unread dot — only counts up from there.
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
    />
  );
}

export function EliteDraftBoardScreenWrapper(): React.JSX.Element {
  const { id: leagueIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;
  const [isDraftActive, setIsDraftActive] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
  );
}

// Re-export as the original name for backwards compatibility
export { EliteDraftBoardScreenWrapper as EliteDraftBoardScreen };

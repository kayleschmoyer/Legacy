import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvailableDraftPlayer, DraftPlayer } from '../types';
import { DEFAULT_PICK_TIME } from '../constants';

// A flood of rapid auto-picks (e.g. the commissioner auto-drafting the rest
// of the league) would otherwise queue every pick and re-trigger the toast
// every ~1.9s long after those picks actually happened — stuttery,
// back-to-back popups. Cap the backlog and keep only the newest entries,
// same flood-control shape as the spectator SplashQueue (LS-8942).
const TOAST_FLOOD_QUEUE_LENGTH = 5;
const TOAST_FLOOD_KEEP_NEWEST = 2;

export interface AnnouncementData {
  player: DraftPlayer | AvailableDraftPlayer;
  pickNumber: number;
  round: number;
  roundPickNumber: number;
  isMyPick: boolean;
  isAuto: boolean;
  /** Team that made the announced pick. */
  teamName: string;
}

export interface ToastMessage {
  text: string;
  type: 'error' | 'warning' | 'info' | 'success';
}

/**
 * Phone pick-sheet tabs (LS-10165). The board is the page itself, not a tab,
 * and Chat opens from the clock bar — the draft room owns no nav bar of its
 * own, so nothing stacks with the app's header or bottom bar. No `team` tab:
 * LS-10001 moved the roster into the persistent squad strip, which expands
 * into the squad sheet. `selectedTeamId` below still drives that sheet's team
 * switcher.
 */
export type DraftRoomTab = 'players' | 'queue' | 'history';

/** One queued AI-pick toast (Draft Room v2 header/overlay chrome, LS-9397). Rendering
 *  and dequeue-on-dismiss timing belong to the overlay ticket (child 6) — this hook
 *  only owns the queue's shape and mutation. */
export interface PickToastQueueItem {
  id: string;
  player: DraftPlayer | AvailableDraftPlayer;
  pickNumber: number;
  round: number;
  roundPickNumber: number;
  teamName: string;
  isAuto: boolean;
}

/** One queued my-pick splash (Draft Room v2, LS-9397) — see {@link PickToastQueueItem}. */
export interface PickSplashQueueItem {
  id: string;
  player: DraftPlayer | AvailableDraftPlayer;
  pickNumber: number;
  round: number;
  roundPickNumber: number;
}

export function useDraftUIState() {
  const [selectedPosition, setSelectedPosition] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<
    'grid' | 'list' | 'compact' | 'board' | 'table' | 'depth'
  >('grid');
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [draftPaused, setDraftPaused] = useState(false);
  const [pickDeadline, setPickDeadline] = useState<Date | null>(null);
  const [pickTimeLimitSeconds, setPickTimeLimitSeconds] =
    useState(DEFAULT_PICK_TIME);
  const [commPickMode, setCommPickMode] = useState(false);
  const [autoPickDisabled, setAutoPickDisabled] = useState(false);
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const [draftOrderMissing, setDraftOrderMissing] = useState(false);
  const [currentPickLoadError, setCurrentPickLoadError] = useState<
    string | null
  >(null);
  const [customDraftOrder, setCustomDraftOrder] = useState<string[] | null>(
    null,
  );

  // Announcement state
  const [announcement, setAnnouncement] = useState<AnnouncementData | null>(
    null,
  );
  const [announcementLeaving, setAnnouncementLeaving] = useState(false);
  const announcementTimerRef = useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const showAnnouncement = useCallback(
    (
      player: DraftPlayer | AvailableDraftPlayer,
      pickNumber: number,
      round: number,
      roundPickNumber: number,
      myPick: boolean,
      auto: boolean,
      teamName: string,
    ) => {
      if (announcementTimerRef.current)
        clearTimeout(announcementTimerRef.current);
      setAnnouncementLeaving(false);
      setAnnouncement({
        player,
        pickNumber,
        round,
        roundPickNumber,
        isMyPick: myPick,
        isAuto: auto,
        teamName,
      });
      announcementTimerRef.current = setTimeout(() => {
        setAnnouncementLeaving(true);
        // Chained onto the same ref (rather than a bare, untracked setTimeout)
        // so a pick that lands mid-fade-out can still clear this stage — else
        // it fires 400ms later and wipes out the newer announcement it raced
        // with (LS-8845).
        announcementTimerRef.current = setTimeout(() => {
          setAnnouncement(null);
          setAnnouncementLeaving(false);
        }, 400);
      }, 3200);
    },
    [],
  );

  const dismissAnnouncement = useCallback(() => {
    if (announcementTimerRef.current)
      clearTimeout(announcementTimerRef.current);
    setAnnouncementLeaving(true);
    announcementTimerRef.current = setTimeout(() => {
      setAnnouncement(null);
      setAnnouncementLeaving(false);
    }, 400);
  }, []);

  // Screen reader live regions
  const [liveMessage, setLiveMessage] = useState('');
  const [urgentMessage, setUrgentMessage] = useState('');

  // Auto-dismiss the visible urgent-error toast so a transient failure
  // (e.g. "Draft pick failed: …") doesn't leave a permanent banner — on
  // mobile the toast was unreachable behind the bottom nav bar (LS-4827).
  const urgentTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (!urgentMessage) return undefined;
    if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
    urgentTimerRef.current = setTimeout(() => setUrgentMessage(''), 6000);
    return () => {
      if (urgentTimerRef.current) clearTimeout(urgentTimerRef.current);
    };
  }, [urgentMessage]);

  // Toast auto-dismiss
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const showToast = useCallback(
    (
      text: string,
      type: 'error' | 'warning' | 'info' | 'success' = 'error',
    ) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage({ text, type });
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 5000);
    },
    [],
  );

  // Clear pending timers on unmount
  useEffect(() => {
    return () => {
      if (announcementTimerRef.current)
        clearTimeout(announcementTimerRef.current);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // Notification dedup
  const notifiedPicksRef = useRef<Set<number>>(new Set());

  // Debounced player search
  const [playerSearch, setPlayerSearch] = useState('');

  // ---------------------------------------------------------------------
  // Draft Room v2 shell (LS-9397) — additive UI state the persistent chrome
  // (header band, ticker, bottom nav) and the tab bodies siblings 2-6 add
  // share. Every field here is new and optional to callers: nothing above
  // this block changed, so existing consumers (spectator screen, auction
  // room, LS-8790's native draft screen if it shares this hook) are
  // unaffected whether or not they read these fields.
  // ---------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<DraftRoomTab>('players');
  /** Team whose roster the Team tab is showing — null means "my team". */
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [unreadChat, setUnreadChat] = useState(false);

  const [pickToastQueue, setPickToastQueue] = useState<PickToastQueueItem[]>(
    [],
  );
  const enqueuePickToast = useCallback((item: PickToastQueueItem) => {
    setPickToastQueue((queue) => {
      const next = [...queue, item];
      return next.length > TOAST_FLOOD_QUEUE_LENGTH
        ? next.slice(-TOAST_FLOOD_KEEP_NEWEST)
        : next;
    });
  }, []);
  const dequeuePickToast = useCallback(() => {
    setPickToastQueue((queue) => queue.slice(1));
  }, []);

  const [pickSplashQueue, setPickSplashQueue] = useState<PickSplashQueueItem[]>(
    [],
  );
  const enqueuePickSplash = useCallback((item: PickSplashQueueItem) => {
    setPickSplashQueue((queue) => {
      const next = [...queue, item];
      return next.length > TOAST_FLOOD_QUEUE_LENGTH
        ? next.slice(-TOAST_FLOOD_KEEP_NEWEST)
        : next;
    });
  }, []);
  const dequeuePickSplash = useCallback(() => {
    setPickSplashQueue((queue) => queue.slice(1));
  }, []);

  return {
    // Position/search/view
    selectedPosition,
    setSelectedPosition,
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    watchlist,
    setWatchlist,
    chatOpen,
    setChatOpen,
    // Draft status
    draftComplete,
    setDraftComplete,
    initError,
    setInitError,
    draftPaused,
    setDraftPaused,
    pickDeadline,
    setPickDeadline,
    pickTimeLimitSeconds,
    setPickTimeLimitSeconds,
    commPickMode,
    setCommPickMode,
    autoPickDisabled,
    setAutoPickDisabled,
    // Toast
    toastMessage,
    setToastMessage,
    showToast,
    // Online presence
    onlineUserIds,
    setOnlineUserIds,
    // Draft order
    draftOrderMissing,
    setDraftOrderMissing,
    currentPickLoadError,
    setCurrentPickLoadError,
    customDraftOrder,
    setCustomDraftOrder,
    // Announcement
    announcement,
    announcementLeaving,
    showAnnouncement,
    dismissAnnouncement,
    // A11y
    liveMessage,
    setLiveMessage,
    urgentMessage,
    setUrgentMessage,
    // Notification dedup
    notifiedPicksRef,
    // Player search
    playerSearch,
    setPlayerSearch,
    // Draft Room v2 shell (LS-9397)
    activeTab,
    setActiveTab,
    selectedTeamId,
    setSelectedTeamId,
    unreadChat,
    setUnreadChat,
    pickToastQueue,
    enqueuePickToast,
    dequeuePickToast,
    pickSplashQueue,
    enqueuePickSplash,
    dequeuePickSplash,
  } as const;
}

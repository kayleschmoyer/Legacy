import { useCallback, useEffect, useRef, useState } from 'react';
import type { AvailableDraftPlayer, DraftPlayer } from '../types';
import { DEFAULT_PICK_TIME } from '../constants';

export interface AnnouncementData {
  player: DraftPlayer | AvailableDraftPlayer;
  pickNumber: number;
  round: number;
  roundPickNumber: number;
  isMyPick: boolean;
  isAuto: boolean;
}

export interface ToastMessage {
  text: string;
  type: 'error' | 'warning' | 'info' | 'success';
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
      });
      announcementTimerRef.current = setTimeout(() => {
        setAnnouncementLeaving(true);
        setTimeout(() => {
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
    setTimeout(() => {
      setAnnouncement(null);
      setAnnouncementLeaving(false);
    }, 400);
  }, []);

  // Screen reader live regions
  const [liveMessage, setLiveMessage] = useState('');
  const [urgentMessage, setUrgentMessage] = useState('');

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

  // WebSocket connection state — drives polling suppression in useDraftQueries
  const [wsConnected, setWsConnected] = useState(false);

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
    // WebSocket connection
    wsConnected,
    setWsConnected,
  } as const;
}

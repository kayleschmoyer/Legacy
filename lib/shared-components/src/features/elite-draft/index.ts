// ---------------------------------------------------------------------------
// EliteDraftBoard – public surface (shared-components)
// ---------------------------------------------------------------------------

export {
  EliteDraftBoardScreen,
  type EliteDraftBoardScreenProps,
} from './EliteDraftBoardScreen';

// Read-only spectator surface (LS-8942)
export { SpectatorScreen, type SpectatorScreenProps } from './SpectatorScreen';
export {
  SplashQueue,
  useSplashQueue,
  type SplashPick,
  type SplashQueueOptions,
  type SplashQueueProps,
} from './SplashQueue';
export { SpectatorDepthChart } from './SpectatorDepthChart';
export { useSpectatorDraftData } from './hooks';

// Sub-components (exported in case consumers need them directly)
export { CircularTimer } from './CircularTimer';
export { DraftGrid } from './DraftGrid';
export { DraftBoardTimeline } from './DraftBoardTimeline';
export {
  buildTimelineRounds,
  defaultOpenRound,
  timelinePickMeta,
  type TimelinePick,
  type TimelinePickState,
  type TimelineRound,
} from './draftTimeline';
export { DraftPlayerDock } from './DraftPlayerDock';
export {
  dockPickLabel,
  dockRowColumns,
  formatAvailableCount,
  formatOpenSlots,
  openSlotPositions,
  playerFitsOpenSlot,
  type DockRowColumns,
  type DockSlotBucket,
} from './draftDock';
export { PickAnnouncement } from './PickAnnouncement';
export { SkeletonCard as DraftSkeletonCard } from './SkeletonCard';

// Draft Room v2 Queue/Team tabs (LS-9400). DraftRosterSlotRow is exported
// standalone so the draft-complete recap (LS-9402) can reuse the same row.
export {
  DraftRosterSlotRow,
  type DraftRosterSlotRowProps,
} from './DraftRosterSlotRow';
export { DraftTeamTab, type DraftTeamTabProps } from './DraftTeamTab';

// Positions-drafted slot strip + its chip (LS-10004). The chip is exported
// standalone because the phone squad strip (LS-10001) renders the same chip at
// `size="sm"` rather than forking it.
export {
  DraftSlotChip,
  slotAccentColor,
  slotChipLabel,
  type DraftSlotChipProps,
  type DraftSlotChipSize,
  type DraftSlotChipState,
} from './DraftSlotChip';
export { DraftSlotStrip, type DraftSlotStripProps } from './DraftSlotStrip';
export {
  buildRosterSlotInstances,
  nextPrioritySlotKey,
  rosterSlotFillCounts,
  type RosterSlotInstance,
} from './rosterSlots';

// Draft Details settings summary (LS-9857) — rendered in the wide branch's
// rail and the compact branch's Team tab.
export {
  DraftDetailsPanel,
  type DraftDetailsPanelProps,
} from './DraftDetailsPanel';
export {
  buildDraftDetailRows,
  type DraftDetailRow,
  type DraftDetailsSettings,
} from './draftDetails';
export { DraftQueueTab, type DraftQueueTabProps } from './DraftQueueTab';

// Connection-state surface (LS-9856)
export {
  DraftConnectionBanner,
  type DraftConnectionBannerProps,
} from './DraftConnectionBanner';
export { ConnectionLostScreen } from './DraftStateScreens';
export {
  DRAFT_CONNECTION_LOST_DELAY_MS,
  DRAFT_RECONNECTING_DELAY_MS,
  type DraftConnectionStatus,
} from './hooks';

// Chat overlay types for render prop
export type { DraftChatProps, DraftChatRenderer } from './DraftChatOverlay';

// Chat tab (LS-9401): presentational bubble/input UI + its data-source render prop
export { DraftChatTab } from './DraftChatTab';
export type {
  DraftChatBubbleMessage,
  DraftChatTabProps,
  DraftChatTabRenderProps,
  DraftChatTabRenderer,
} from './DraftChatTab';

// Shared types (prefixed to avoid collisions with existing exports)
export type {
  AvailableDraftPlayer,
  CurrentDraftPickInfo,
  DraftPickRecord,
  DraftPlayer,
  LeagueTeam as DraftLeagueTeam,
  PlayerStatsEntry,
} from './types';

// Constants & utilities (non-conflicting names only; POSITION_COLORS and
// getPositionColor already exported by utils/colors)
export { DEFAULT_NUM_TEAMS, DEFAULT_PICK_TIME } from './constants';
export { normalizeTeamId } from './utils';
export {
  getDraftCommentary,
  getMlbHeadshotUrl,
  getPickQuality,
  type PickQuality,
  type PickQualityTier,
} from './draftUtils';

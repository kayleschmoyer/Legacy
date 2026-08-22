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
export { PickAnnouncement } from './PickAnnouncement';
export { SkeletonCard as DraftSkeletonCard } from './SkeletonCard';

// Draft Room v2 Queue/Team tabs (LS-9400). DraftRosterSlotRow is exported
// standalone so the draft-complete recap (LS-9402) can reuse the same row.
export {
  DraftRosterSlotRow,
  type DraftRosterSlotRowProps,
} from './DraftRosterSlotRow';
export { DraftTeamTab, type DraftTeamTabProps } from './DraftTeamTab';
export { DraftQueueTab, type DraftQueueTabProps } from './DraftQueueTab';

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
export { getDraftCommentary, getMlbHeadshotUrl } from './draftUtils';

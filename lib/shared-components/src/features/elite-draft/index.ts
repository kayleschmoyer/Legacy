// ---------------------------------------------------------------------------
// EliteDraftBoard – public surface (shared-components)
// ---------------------------------------------------------------------------

export {
  EliteDraftBoardScreen,
  type EliteDraftBoardScreenProps,
} from './EliteDraftBoardScreen';

// Sub-components (exported in case consumers need them directly)
export { CircularTimer } from './CircularTimer';
export { DraftGrid } from './DraftGrid';
export { PickAnnouncement } from './PickAnnouncement';
export { PlayerCard as DraftPlayerCard } from './PlayerCard';
export { SkeletonCard as DraftSkeletonCard } from './SkeletonCard';

// Chat overlay types for render prop
export type { DraftChatProps, DraftChatRenderer } from './DraftChatOverlay';

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
export { getDraftCommentary } from './draftUtils';

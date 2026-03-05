/**
 * PlayerSeasonStatsModal â€” Thin wrapper around PlayerDetailModal.
 *
 * Preserves the existing import path (`./PlayerSeasonStatsModal`) used by
 * MatchupRosterComparison while delegating all rendering to the shared
 * PlayerDetailModal component.
 */
export {
  PlayerDetailModal as PlayerSeasonStatsModal,
  type PlayerDetailModalProps as PlayerSeasonStatsModalProps,
} from '../../components/PlayerDetailModal';

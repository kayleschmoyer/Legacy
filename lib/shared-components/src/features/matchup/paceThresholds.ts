// Pace-target tint thresholds shared by every "actual vs. projected pace"
// color indicator (MatchupScoreboardHero, league-detail-v2 Shared.tsx,
// LeagueRosterManagement). A single source of truth keeps the ±10% bands in
// sync across web and shared-components consumers.
export const PACE_TINT_THRESHOLDS = {
  good: 1.1,
  bad: 0.9,
} as const;

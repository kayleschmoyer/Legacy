import type React from 'react';
import type { AvailabilityValue } from './AvailabilityFilter';
import type { LeagueOption } from './LeaguePicker';
import type { PlayerStatsShellState } from './StateCards';
import type { StatsTabDef } from './StatsViewTabs';
import type { ToggleableColumn } from '../columnVisibility';

/**
 * Everything the generic {@link PlayerStatsShell} needs to render one sport's
 * stats browser. Each sport supplies a `useController` hook that owns all of its
 * divergent filter-state + data wiring (baseball's draft→Apply state machine,
 * football's live-debounce + cursor pagination) and returns this common,
 * sport-neutral surface. The shell reads only from here — it never sees a
 * baseball or football type — so the same chrome renders both sports.
 */
export interface SportStatsController {
  // ── Header ──────────────────────────────────────────────────────────
  header: { eyebrow: string; title: string; description: string };
  /** Shareable query-string preview shown in the header's URL chip. */
  urlPreview: string;

  // ── Header actions (share / export) ─────────────────────────────────
  onShare: () => void;
  canExport: boolean;
  exportFormats: readonly string[];
  onExport: (format: string) => void;

  // ── View tabs ───────────────────────────────────────────────────────
  /** `[]` or a single tab hides the tab strip (football). */
  tabs: readonly StatsTabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tablistAriaLabel?: string;

  // ── Toolbar ─────────────────────────────────────────────────────────
  /** Search field + the sport's filter controls (selects/pills). */
  renderToolbarControls: () => React.ReactNode;
  /** Web CSS grid-template class for the toolbar frame. */
  toolbarGridClassName?: string;
  /** Baseball drives the Apply button; football leaves this false. */
  hasPendingChanges: boolean;
  /** When undefined, no Apply button renders (football's live model). */
  onApply?: () => void;

  // ── Column visibility (premium) ─────────────────────────────────────
  canCustomizeColumns: boolean;
  isColumnCustomized: boolean;
  toggleableColumns: ToggleableColumn[];
  effectiveVisibleKeys: ReadonlySet<string>;
  onToggleColumn: (key: string) => void;
  onResetColumns: () => void;

  // ── Availability filter ─────────────────────────────────────────────
  showAvailability: boolean;
  availabilityValue: AvailabilityValue;
  onAvailabilityChange: (v: AvailabilityValue) => void;
  /**
   * Leagues for the availability-filter league picker (LS-9158), ported from
   * the standalone `/players` page (LS-7044). Omitted or empty hides the
   * picker even when the availability filter isn't "All" — the shell then
   * behaves as it did before the picker existed (single-league scoping only).
   */
  leagues?: ReadonlyArray<LeagueOption>;
  /** Selected league id scoping the availability filter's rostered-players data. */
  leagueId?: number | null;
  onLeagueChange?: (id: number | null) => void;

  // ── Advanced filters panel ──────────────────────────────────────────
  /** The full advanced panel (sliders vs projected/ADP), or null. */
  renderAdvancedPanel: () => React.ReactNode;

  // ── Content ─────────────────────────────────────────────────────────
  /** When set, a state card replaces the grid(s). */
  shellState?: PlayerStatsShellState;
  onRetry?: () => void;
  onClearFilters?: () => void;
  /** Stat-column count for the loading skeleton shimmer rows. */
  loadingColumnCount: number;
  /** The data grid(s), self-fetching. */
  renderContent: () => React.ReactNode;
}

/**
 * A per-sport binding of a controller hook. Kept lightweight — the shell renders
 * from the controller instance, but this object lets callers dispatch by sport.
 */
export interface SportStatsConfig<TProps = unknown> {
  sport: 'mlb' | 'nfl';
  useController: (props: TProps) => SportStatsController;
}

export type {
  AvailabilityValue,
  LeagueOption,
  PlayerStatsShellState,
  StatsTabDef,
};

// ---------------------------------------------------------------------------
// Component-scoped CSS for EliteDraftBoard
// ---------------------------------------------------------------------------

import { breakpoints } from '@legacy-sports/design-tokens';
import { DRAFT_SLOT_STRIP_HEIGHT_PX } from './constants';

const NAV_HEIGHT_PX = 75;
const NAV_Z_INDEX = 200;

// Responsive breakpoints, interpolated from the design-token scale rather
// than written as ad-hoc pixel literals, so this stylesheet and
// `hooks/useDraftViewport.ts` cannot drift apart (LS-9860). Each
// `breakpoints.*` value is the *lower bound* of its band, so a `max-width`
// query stops one pixel short of the next band.
//
// The bands map onto the mock's `vp-group` tiers as follows (docs/design/
// B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/scratch/mockups/
// draft.html, `@container vp (...)` block at the end of its stylesheet):
//
//   ≤799   $xxs/$xs  phone   — `CompactLiveDraftBoard` replaces this layout
//   ≤979   $sm/$md   tablet  — rail stacks under main as a shelf
//   ≤1119  $lg       land    — side rail returns, narrower; 3-col depth
//   1120+  $xl/$xxl  desktop — full-width rail, 4-col depth
const BP_PHONE_MAX = breakpoints.sm - 1; // 799
const BP_TABLET_MAX = breakpoints.lg - 1; // 979
const BP_LAND_MAX = breakpoints.xl - 1; // 1119

export const CSS = `
/* ===== Custom Properties (aligned with Legacy Sports theme) ===== */
:root {
  --d-bg: var(--background, #0A0F1A);
  --d-surface: var(--surfaceInteractive, rgba(27, 58, 92, 0.22));
  --d-surface-hover: var(--backgroundHover, #0E1624);
  --d-surface-active: var(--backgroundPress, #0B1220);
  --d-border: var(--glassBorder, rgba(255, 255, 255, 0.08));
  --d-border-hover: var(--glassBorderHover, rgba(255, 255, 255, 0.14));
  --d-accent: var(--brandGold, #C5A55A);
  --d-accent-dim: rgba(197, 165, 90, 0.15);
  --d-accent-dark: var(--brandGoldDark, #A68B3E);
  --d-accent-light: var(--brandGoldLight, #D4BB78);
  --d-success: var(--green8, #22C55E);
  --d-danger: var(--statusDangerFg, #ef4444);
  --d-warning: var(--amber9, #F59E0B);
  --d-text: var(--color, #F8FAFC);
  --d-text-secondary: var(--textMuted, #9CAAC5);
  --d-text-muted: var(--glassTextMuted, rgba(248, 250, 252, 0.45));
  --d-panel: var(--surfacePanel, #111B2F);
  --d-panel-border: var(--surfacePanelBorder, #1F2D48);
  --d-card: var(--surfaceCard, #16223A);
  --d-navy: var(--brandNavy, #1B3A5C);
  --d-navy-light: var(--brandNavyLight, #2C4A7C);
  --d-seam-red: var(--brandSeamRed, #C41E3A);
  --d-panel-shadow: 0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
  --d-radius-sm: 8px;
  --d-radius-md: 12px;
  --d-radius-lg: 16px;
  --d-radius-xl: 20px;
  --d-radius-pill: 100px;

  /* ===== Mockup-aligned tokens (B8P9BQz8s6NZ9Q-FqWI_yA) =====
     Foundation tokens consumed by sibling Draft Board children
     (LS-4640 grid, LS-4642 PlayerCard, LS-4647 skeleton). Names
     match docs/design/.../mockups/draft.html 1:1. */
  --f-display: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  --f-body: 'Literata', Georgia, 'Times New Roman', serif;
}

/* ===== Typography recipes (mockup-aligned) =====
   Class-prefixed to avoid leaking into the app-wide heading scale.
   Sizes/weights/letter-spacing taken verbatim from the mockup. */
.d-eyebrow {
  font-family: var(--f-display);
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--d-text-secondary);
}
.d-h1, .d-h2, .d-h3, .d-h4 {
  font-family: var(--f-display);
  margin: 0;
  color: var(--d-text);
  letter-spacing: -0.005em;
}
.d-h1 {
  font-weight: 800;
  font-size: 40px;
  line-height: 1.02;
  letter-spacing: -0.015em;
}
.d-h2 {
  font-weight: 800;
  font-size: 26px;
  line-height: 1.1;
}
.d-h3 {
  font-weight: 700;
  font-size: 18px;
  line-height: 1.15;
}
.d-h4 {
  font-weight: 700;
  font-size: 14px;
  line-height: 1.2;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--d-text-secondary);
}
/* Generic stat-row helper — apply to any numeric cell that needs to
   line up on the decimal. Sibling tickets will consume this. */
.d-tnum {
  font-variant-numeric: tabular-nums;
}

/* ===== Animations ===== */
@keyframes fadeSlideUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
@keyframes liveDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.7); }
}
@keyframes timerWarn {
  0%, 100% { transform: scale(1); }
  50%      { transform: scale(1.04); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes announceIn {
  0%   { opacity: 0; transform: translateY(-40px) scale(0.92); }
  60%  { opacity: 1; transform: translateY(8px) scale(1.02); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes announceOut {
  0%   { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-30px) scale(0.95); }
}
@keyframes confettiDrift {
  0%   { opacity: 1; transform: translateY(0) rotate(0deg); }
  100% { opacity: 0; transform: translateY(120px) rotate(720deg); }
}
@keyframes shineSlide {
  0%   { left: -40%; }
  100% { left: 120%; }
}
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(12px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes pickPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(197, 165, 90, 0.35); }
  50%      { box-shadow: 0 0 0 12px rgba(197, 165, 90, 0); }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 15px rgba(197, 165, 90, 0.1), 0 0 30px rgba(27, 58, 92, 0.08); }
  50%      { box-shadow: 0 0 25px rgba(197, 165, 90, 0.25), 0 0 50px rgba(27, 58, 92, 0.15); }
}
@keyframes draftBtnGlow {
  0%, 100% { box-shadow: 0 4px 16px rgba(5, 150, 105, 0.25), 0 0 0 0 rgba(5, 150, 105, 0.3); }
  50%      { box-shadow: 0 6px 24px rgba(5, 150, 105, 0.4), 0 0 0 8px rgba(5, 150, 105, 0); }
}
@keyframes draftBtnPing {
  0%        { transform: scale(1); opacity: 0.5; }
  80%, 100% { transform: scale(1.2); opacity: 0; }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ===== Layout ===== */
.d-root {
  /* Use fixed positioning to escape any padded layout wrappers (e.g. nav +
     YStack padding) so the draft board fills the viewport below the sticky
     nav bar without causing a page-level scrollbar. z-index sits BELOW the
     nav so dropdown menus that open from the nav header (e.g. Help & Support
     "Report a bug") remain tappable when they extend past the nav into the
     draft area. The fixed-position element doesn't visually overlap the nav
     itself (top is NAV_HEIGHT_PX), so a lower z-index is safe. */
  position: fixed;
  top: ${NAV_HEIGHT_PX}px;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: ${NAV_Z_INDEX - 2};
  background: var(--d-bg);
  color: var(--d-text);
  font-family: 'Literata', Georgia, 'Times New Roman', serif;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  animation: 0.25s ease 0s 1 normal forwards running fadeSlideIn;
}
/* Subtle noise texture overlay for depth */
.d-root::after {
  content: '';
  position: absolute; inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.015'/%3E%3C/svg%3E");
  pointer-events: none; z-index: 0;
}
.d-bg-fx {
  position: absolute; inset: 0; pointer-events: none;
  background:
    radial-gradient(ellipse 80% 50% at 15% 15%, rgba(197, 165, 90, 0.06) 0%, transparent 60%),
    radial-gradient(ellipse 60% 40% at 85% 80%, rgba(27, 58, 92, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 40% 30% at 50% 50%, rgba(59, 130, 246, 0.04) 0%, transparent 60%);
}
.d-layout {
  position: relative; z-index: 1;
  display: grid;
  grid-template-columns: 1fr 320px;
  grid-template-rows: auto 1fr;
  grid-template-areas: "topband topband" "main rail";
  /* Shortened by exactly the slot strip's height so the bottom-pinned strip
     overlays nothing (LS-10004): the board's own scroll containers end above
     it rather than running underneath. */
  height: calc(100% - ${DRAFT_SLOT_STRIP_HEIGHT_PX}px);
  overflow: hidden;
}

/* ===== Positions-drafted slot strip (LS-10004) =====
   Design styles/board.css .slotbar — pinned to the bottom of the board,
   above the layout grid. The chrome (surface, border, padding) lives in the
   Tamagui component; this wrapper only positions it. */
.d-slotbar {
  position: absolute;
  left: 0; right: 0; bottom: 0;
  z-index: 5;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

/* ===== Top Status Band ===== */
.d-topband {
  grid-area: topband;
  background: var(--surfaceSubtle, #0D1526);
  border-bottom: 1px solid rgba(255,255,255,0.06);
  padding: 10px 20px;
  display: grid;
  grid-template-columns: auto auto 1fr auto auto;
  gap: 14px;
  align-items: center;
  z-index: 10;
  flex-shrink: 0;
}
.d-topband-divider {
  width: 1px; height: 52px; background: rgba(255,255,255,0.06); flex-shrink: 0;
}
/* Pick status block */
.d-tb-status { display: flex; flex-direction: column; gap: 2px; }
.d-tb-live {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 11px; letter-spacing: 0.16em;
  text-transform: uppercase; color: var(--brandSeamRedLight, #E63950);
}
.d-tb-live .d-live-dot { background: var(--brandSeamRedLight, #E63950); box-shadow: 0 0 6px rgba(230,57,80,0.6); }
.d-tb-pick-num {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 22px; line-height: 1;
  font-variant-numeric: tabular-nums;
}
.d-tb-round-meta { font-size: 11px; color: var(--d-text-secondary); }
/* Inline ring timer */
.d-tb-timer { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.d-tb-ring { width: 58px; height: 58px; position: relative; display: grid; place-items: center; flex-shrink: 0; }
.d-tb-ring svg { transform: rotate(-90deg); position: absolute; inset: 0; }
.d-tb-ring-time {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 16px; font-variant-numeric: tabular-nums;
  line-height: 1; z-index: 1;
}
.d-tb-ring-time.safe  { color: var(--d-text); }
.d-tb-ring-time.warn  { color: var(--d-accent); }
.d-tb-ring-time.crit  { color: var(--brandSeamRedLight, #E63950); }
.d-tb-ring-time.paused { color: var(--d-text-secondary); font-size: 18px; }
.d-tb-timer-info .d-tb-timer-cap {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--d-text-secondary);
}
.d-tb-timer-info .d-tb-timer-of {
  font-size: 10px; color: var(--d-text-muted); font-variant-numeric: tabular-nums;
}
/* On-the-clock slab */
.d-tb-clock {
  display: flex; align-items: center; gap: 12px;
  background: linear-gradient(135deg, rgba(197,165,90,0.10) 0%, rgba(22,34,58,0.9) 70%);
  border: 1px solid rgba(197,165,90,0.3);
  border-radius: 12px; padding: 10px 14px;
  min-width: 0;
}
.d-tb-clock.my-pick {
  background: linear-gradient(135deg, rgba(197,165,90,0.20) 0%, rgba(22,34,58,0.9) 70%);
  border-color: rgba(197,165,90,0.5);
  box-shadow: 0 0 0 1px rgba(197,165,90,0.25), 0 4px 16px rgba(197,165,90,0.18);
}
.d-tb-clock-eyebrow {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--d-text-secondary);
}
.d-tb-clock-who {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 18px; line-height: 1.1; color: var(--d-text);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.d-tb-clock-mgr {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: var(--d-text-secondary); margin-top: 3px;
}
/* Auto-pick toggle */
.d-tb-autopick {
  display: flex; flex-direction: column; gap: 4px;
  padding: 8px 12px; border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; background: var(--d-panel); min-width: 152px; flex-shrink: 0;
}
.d-tb-autopick-label {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--d-text-secondary);
}
.d-tb-autopick-ctrl { display: flex; align-items: center; gap: 8px; }
.d-tb-sw {
  width: 34px; height: 20px; border-radius: 9999px;
  background: rgba(255,255,255,0.06); position: relative;
  cursor: pointer; border: 1px solid rgba(255,255,255,0.1);
  transition: background 140ms, border-color 140ms; flex-shrink: 0;
}
.d-tb-sw::after {
  content: ""; position: absolute; top: 1px; left: 1px;
  width: 16px; height: 16px; border-radius: 9999px;
  background: var(--d-text-muted); transition: transform 140ms, background 140ms;
}
.d-tb-autopick.on .d-tb-sw { background: var(--d-navy); border-color: var(--d-navy-light); }
.d-tb-autopick.on .d-tb-sw::after { transform: translateX(14px); background: var(--d-text); }
.d-tb-autopick-state {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 13px; color: var(--d-text); letter-spacing: 0.04em;
}
.d-tb-autopick.on .d-tb-autopick-state { color: var(--statusSuccessFg, #6FD39A); }
.d-tb-autopick-sub { font-size: 10px; color: var(--d-text-muted); font-style: italic; }
/* Commissioner compact */
.d-tb-commish { display: flex; flex-direction: column; gap: 4px; flex-shrink: 0; }
.d-tb-btn {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
  border-radius: 8px; padding: 7px 10px; border: 1px solid rgba(255,255,255,0.1);
  background: rgba(255,255,255,0.04); color: var(--d-text);
  cursor: pointer; transition: background 140ms, border-color 140ms, transform 120ms;
  white-space: nowrap;
}
.d-tb-btn:hover { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.16); }
.d-tb-btn:active { transform: translateY(1px); }
.d-tb-btn.danger { background: rgba(196,30,58,0.12); border-color: rgba(196,30,58,0.3); color: var(--brandSeamRedLight, #E63950); }
.d-tb-btn.danger:hover { background: rgba(196,30,58,0.2); }

/* ===== Right Rail ===== */
.d-rail {
  grid-area: rail;
  background: var(--surfaceSubtle, #0D1526);
  border-left: 1px solid rgba(255,255,255,0.06);
  padding: 14px;
  display: flex; flex-direction: column; gap: 12px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.06) transparent;
}
.d-rail::-webkit-scrollbar { width: 3px; }
.d-rail::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.06); border-radius: 2px; }
.d-rail-content {
  display: flex; flex-direction: column; gap: 12px;
  min-height: 0; flex: 1;
}
/* Mobile-only collapse toggle — hidden on desktop (LS-4824). */
.d-rail-mobile-toggle { display: none; }

/* ===== View Tabs (4-tab system) ===== */
.d-view-tabs {
  display: flex; gap: 0; border-bottom: 1px solid rgba(255,255,255,0.06);
  margin-bottom: 14px; flex-shrink: 0;
}
.d-view-tab {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
  border: 0; background: transparent; color: var(--d-text-secondary);
  cursor: pointer; padding: 10px 16px;
  border-bottom: 2px solid transparent; margin-bottom: -1px;
  display: inline-flex; align-items: center; gap: 7px;
  transition: color 140ms, border-color 140ms; white-space: nowrap;
}
.d-view-tab:hover { color: var(--d-text); }
.d-view-tab.active { color: var(--d-accent); border-color: var(--d-accent); }
.d-view-tab .d-tab-glyph { font-size: 13px; opacity: 0.85; }
.d-view-tab .d-tab-ct {
  font-size: 10px; color: inherit; opacity: 0.55;
  font-variant-numeric: tabular-nums; font-weight: 600;
}

/* ===== Data Table View ===== */
.d-data-table-wrap {
  background: var(--d-panel); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 10px; overflow: hidden; overflow-x: auto;
}
.d-data-table { width: 100%; border-collapse: collapse; }
.d-data-table th {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--d-text-secondary); text-align: left; padding: 9px 12px;
  background: rgba(13,21,38,0.8); border-bottom: 1px solid rgba(255,255,255,0.06);
  cursor: pointer; user-select: none; white-space: nowrap;
}
.d-data-table th:hover { color: var(--d-text); }
.d-data-table th.sort-active { color: var(--d-accent); }
.d-data-table th.sort-active:hover { color: var(--d-accent); }
.d-sort-arrow { font-style: normal; }
.d-data-table th.num, .d-data-table td.num { text-align: right; font-variant-numeric: tabular-nums; }
.d-data-table td {
  font-size: 12px; color: var(--d-text); padding: 8px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.d-data-table tr:last-child td { border-bottom: 0; }
.d-data-table tr:hover td { background: rgba(255,255,255,0.025); }
.d-data-table tr.taken td { opacity: 0.4; }

/* ===== Depth Chart View ===== */
.d-depth-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
}
.d-depth-slot {
  background: var(--d-panel); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 8px; padding: 12px;
}
.d-depth-slot-head {
  display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
}
.d-depth-slot-pos {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 13px; letter-spacing: 0.1em;
}
.d-depth-slot-ct { font-size: 11px; color: var(--d-text-secondary); font-variant-numeric: tabular-nums; }
.d-depth-slot.complete .d-depth-slot-ct { color: var(--statusSuccessFg, #6FD39A); }
.d-depth-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 5px 8px; background: rgba(13,21,38,0.6); border-radius: 4px;
  font-size: 12px; color: var(--d-text); margin-bottom: 3px;
}
.d-depth-row.empty {
  border: 1px dashed rgba(255,255,255,0.08); background: transparent;
  color: var(--d-text-muted); font-style: italic; justify-content: center;
}
.d-depth-row.need { border-color: rgba(196,30,58,0.4); color: var(--brandSeamRedLight, #E63950); font-style: normal; }

/* ===== Roster Progress Bars (right rail) ===== */
.d-rail-panel {
  background: var(--d-panel); border: 1px solid rgba(255,255,255,0.06);
  border-radius: 12px; padding: 12px 14px; flex-shrink: 0;
}
.d-rail-panel-head {
  display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px;
}
.d-rail-panel-title {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 11px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--d-text-secondary); margin: 0;
}
.d-rail-panel-count {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-size: 11px; color: var(--d-text-secondary); letter-spacing: 0.12em;
  font-variant-numeric: tabular-nums;
}
.d-pos-progress-list { display: flex; flex-direction: column; gap: 2px; }
.d-pos-progress-row {
  display: grid; grid-template-columns: 36px 1fr 36px;
  align-items: center; gap: 8px; padding: 4px 2px;
}
.d-pos-progress-label {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 11px; letter-spacing: 0.08em;
  color: var(--d-text-secondary);
}
.d-pos-progress-row.filled .d-pos-progress-label { color: var(--d-text); }
.d-pos-progress-bar {
  position: relative; height: 4px; border-radius: 9999px;
  background: rgba(255,255,255,0.05); overflow: hidden;
}
.d-pos-progress-fill {
  position: absolute; left: 0; top: 0; bottom: 0;
  border-radius: 9999px; transition: width 0.4s ease;
}
.d-pos-progress-count {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 700; font-size: 10px; color: var(--d-text-secondary);
  font-variant-numeric: tabular-nums; text-align: right;
}
.d-pos-progress-row.filled .d-pos-progress-count { color: var(--d-text); }
.d-pos-progress-row.complete .d-pos-progress-count { color: var(--statusSuccessFg, #6FD39A); }
/* Drag-to-draft drop targets (LS-8068) */
.d-pos-progress-row.drop-eligible {
  border-radius: 6px;
  outline: 1px dashed rgba(111, 211, 154, 0.7);
  background: rgba(111, 211, 154, 0.08);
}
.d-pos-progress-row.drop-ineligible { opacity: 0.4; }

/* Pick history rows */
.d-pick-row {
  display: grid; grid-template-columns: 44px auto 1fr auto;
  align-items: center; gap: 8px;
  padding: 6px 4px; border-bottom: 1px solid rgba(255,255,255,0.04);
  font-size: 11px;
}
.d-pick-row:last-child { border-bottom: 0; }
.d-pick-num {
  font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
  font-weight: 800; font-size: 12px; color: var(--d-accent);
  font-variant-numeric: tabular-nums;
}
.d-pick-row.mine .d-pick-name { color: var(--d-accent); }

.d-live-dot {
  width: 7px; height: 7px; flex-shrink: 0;
  background: #fff; border-radius: 50%;
  animation: liveDot 1.5s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(255,255,255,0.6);
}

/* ===== Circular Timer ===== */
.d-timer-wrap {
  display: flex; justify-content: center; margin-bottom: 20px;
  position: relative;
}
.d-timer-wrap::before {
  content: '';
  position: absolute; top: 50%; left: 50%;
  width: 160px; height: 160px;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, rgba(16, 185, 129, 0.08) 0%, transparent 70%);
  transition: all 0.5s ease;
  pointer-events: none;
}
.d-timer-wrap.my-pick::before {
  background: radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, transparent 70%);
  animation: glowPulse 3s ease-in-out infinite;
}
.d-timer-svg { filter: drop-shadow(0 4px 24px rgba(0,0,0,0.35)); }
.d-timer-track { fill: none; stroke: rgba(255,255,255,0.06); stroke-width: 5; }
.d-timer-fill {
  fill: none; stroke-width: 5; stroke-linecap: round;
  transition: stroke-dashoffset 1s linear, stroke 0.5s ease;
}
.d-timer-text {
  fill: white; font-size: 26px; font-weight: 800;
  font-family: 'Big Shoulders Display', sans-serif; text-anchor: middle;
  font-variant-numeric: tabular-nums;
}
.d-timer-label {
  fill: rgba(255,255,255,0.65); font-size: 8px; font-weight: 700;
  letter-spacing: 2.5px; text-anchor: middle; text-transform: uppercase;
}
.d-timer-wrap.warn { animation: timerWarn 0.6s ease-in-out infinite; }

/* ===== Panel ===== */
.d-panel {
  background: var(--d-panel, #111B2F);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--d-radius-lg);
  padding: 16px;
  margin-bottom: 14px;
  transition: border-color 0.4s ease, box-shadow 0.4s ease;
}
.d-panel:hover {
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
}
.d-panel-title {
  margin: 0 0 12px; font-size: 11px; font-weight: 700;
  letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--d-text-secondary);
}
.d-panel-title.a-orange { color: var(--d-accent); }
.d-panel-title.a-green { color: var(--d-success); }
.d-panel-title.a-amber { color: var(--d-warning); }

/* ===== Glass Button ===== */
.d-btn-glass {
  display: block; width: 100%;
  background: rgba(27, 58, 92, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--d-radius-md); padding: 11px 14px;
  color: var(--d-text); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); text-align: left;
  font-family: inherit; margin-bottom: 8px;
  position: relative; overflow: hidden;
}
.d-btn-glass::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(135deg, transparent 0%, rgba(255,255,255,0.03) 100%);
  opacity: 0; transition: opacity 0.3s ease;
  pointer-events: none;
}
.d-btn-glass:hover::before { opacity: 1; }
.d-btn-glass:hover {
  background: rgba(27, 58, 92, 0.28);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}
.d-btn-glass:active {
  transform: translateY(0) scale(0.98);
}

/* ===== Main Content ===== */
.d-main {
  grid-area: main;
  padding: 16px 22px; overflow-y: auto;
  display: flex; flex-direction: column;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.08) transparent;
}
.d-main::-webkit-scrollbar { width: 4px; }
.d-main::-webkit-scrollbar-track { background: transparent; }
.d-main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

/* ===== Controls Bar ===== */
.d-controls {
  background: var(--surfacePanel, #111B2F);
  border: 1px solid rgba(255, 255, 255, 0.07);
  padding: 14px 18px;
  border-radius: var(--d-radius-lg);
  margin-bottom: 18px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  box-shadow: 0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
  position: relative;
  overflow: hidden;
  /* d-main is a flex column with a constrained height; without flex-shrink:0
     a tall player grid compresses this bar and overflow:hidden clips the
     search input + position pills (LS-8106). Matches .d-view-tabs. */
  flex-shrink: 0;
}
.d-controls::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 100% at 10% 50%, rgba(197, 165, 90, 0.03) 0%, transparent 60%);
  pointer-events: none;
}
.d-search-wrap {
  flex: 1; min-width: 180px; position: relative;
}
.d-search-icon {
  position: absolute; left: 12px; top: 50%;
  transform: translateY(-50%); color: var(--d-text-muted);
  width: 15px; height: 15px; pointer-events: none;
}
.d-search-input {
  width: 100%;
  padding: 9px 14px 9px 38px;
  border-radius: var(--d-radius-md);
  border: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(13, 21, 38, 0.9);
  color: var(--d-text); font-size: 13px;
  outline: none; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  font-family: inherit;
}
.d-search-input:focus {
  border-color: var(--d-accent);
  box-shadow: 0 0 0 3px var(--d-accent-dim), 0 0 20px rgba(197, 165, 90, 0.1);
  background: rgba(13, 21, 38, 0.95);
}
.d-search-input::placeholder { color: var(--d-text-muted); }
.d-search-clear {
  position: absolute; right: 8px; top: 50%;
  transform: translateY(-50%);
  background: none; border: none; padding: 4px;
  cursor: pointer; color: var(--d-text-muted);
  display: flex; align-items: center; justify-content: center;
  border-radius: 50%; transition: color 0.15s, background 0.15s;
  line-height: 0;
}
.d-search-clear:hover { color: var(--d-text); background: rgba(255,255,255,0.06); }

/* ===== Filter Pills ===== */
.d-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.d-pill {
  padding: 6px 13px; border-radius: var(--d-radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(27, 58, 92, 0.18);
  color: var(--d-text-secondary); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  font-family: inherit; position: relative; overflow: hidden;
}
.d-pill:hover {
  background: rgba(27, 58, 92, 0.32); color: var(--d-text);
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
}
.d-pill.active {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  color: white; border-color: rgba(197, 165, 90, 0.4);
  box-shadow: 0 2px 16px rgba(197, 165, 90, 0.35), inset 0 1px 0 rgba(255,255,255,0.15);
}
.d-pill.active::after {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: shimmer 3s ease-in-out infinite;
}

/* ===== View Modes ===== */
.d-views {
  display: flex; gap: 2px;
  background: rgba(13, 21, 38, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--d-radius-sm); padding: 2px;
}
.d-view-btn {
  padding: 6px 10px; border-radius: 6px; border: none;
  background: transparent; color: var(--d-text-muted);
  font-size: 14px; cursor: pointer; transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
  font-family: inherit; line-height: 1;
}
.d-view-btn:hover { color: var(--d-text); background: rgba(255,255,255,0.04); }
.d-view-btn.active {
  background: linear-gradient(135deg, rgba(197, 165, 90, 0.2) 0%, rgba(197, 165, 90, 0.1) 100%);
  color: var(--d-accent);
  box-shadow: 0 1px 4px rgba(197, 165, 90, 0.15);
}

/* ===== Player Grid ===== */
.d-player-grid { display: grid; gap: 14px; }

/* ===== Player Card ===== */
.d-card {
  position: relative; border-radius: var(--d-radius-lg); overflow: hidden;
  background: #16223A;
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition: transform 0.4s cubic-bezier(0.4,0,0.2,1), box-shadow 0.4s cubic-bezier(0.4,0,0.2,1), border-color 0.4s cubic-bezier(0.4,0,0.2,1);
  animation: fadeSlideUp 0.45s ease-out both;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
}
.d-card.draggable { cursor: grab; }
.d-card.draggable:active { cursor: grabbing; }
.d-card::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 20% 0%, rgba(197, 165, 90, 0.06) 0%, transparent 60%);
  opacity: 0; transition: opacity 0.4s ease;
  pointer-events: none; z-index: 0;
}
.d-card:hover::before { opacity: 1; }
.d-card:hover {
  transform: translateY(-4px) scale(1.005);
  border-color: rgba(197, 165, 90, 0.2);
  box-shadow:
    0 20px 60px rgba(0,0,0,0.4),
    0 0 0 1px rgba(197, 165, 90, 0.08),
    0 0 30px rgba(197, 165, 90, 0.06);
}
.d-card-accent {
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
  box-shadow: 2px 0 12px rgba(var(--accent-rgb, 0,0,0), 0.2);
}
.d-card-body { padding: 16px 16px 16px 20px; position: relative; z-index: 1; }
.d-card-header {
  display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 12px;
}
.d-card-name {
  margin: 0; font-size: 15px; font-weight: 700;
  color: var(--d-text); line-height: 1.25;
}
.d-card-meta {
  font-size: 12px; color: var(--d-text-muted); margin-top: 3px; font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.d-card-career {
  font-size: 11px; color: var(--d-text-muted); margin-top: 2px;
  font-weight: 500; letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}
.d-card-career-years { color: var(--d-text-secondary, var(--d-text-muted)); }
.d-card-badges { display: flex; align-items: baseline; gap: 6px; flex-shrink: 0; }
.d-pos-alt {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: var(--d-text-muted); text-transform: uppercase;
}
.d-rank-badge {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  color: white; padding: 2px 8px; border-radius: var(--d-radius-sm);
  font-size: 11px; font-weight: 700;
  box-shadow: 0 2px 8px rgba(197, 165, 90, 0.25);
  position: relative; overflow: hidden;
}
.d-rank-badge::after {
  content: none;
}
.d-pos-badge {
  padding: 2px 8px; border-radius: var(--d-radius-sm);
  font-size: 11px; font-weight: 700; color: white;
  box-shadow: 0 2px 6px rgba(0,0,0,0.2);
  position: relative;
}
.d-trend { font-size: 15px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }

/* Stats strip */
.d-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px;
  background: rgba(13, 21, 38, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--d-radius-md); padding: 10px; margin-bottom: 10px;
  position: relative; overflow: hidden;
}
.d-stats::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.02), transparent);
  pointer-events: none;
}
.d-stat { text-align: center; }
.d-stat-val {
  display: block; font-size: 15px; font-weight: 700; line-height: 1.3;
  font-variant-numeric: tabular-nums;
}
.d-stat-lbl {
  display: block; font-size: 9px; color: var(--d-text-muted);
  font-weight: 600; margin-top: 1px; letter-spacing: 0.5px;
}

/* News */
.d-news {
  background: rgba(13, 21, 38, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.03);
  padding: 8px 10px;
  border-radius: var(--d-radius-sm); margin-bottom: 12px;
  font-size: 11px; color: var(--d-text-secondary);
  font-style: italic; line-height: 1.4;
}

/* Card actions */
.d-ppg-bar {
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(135deg, rgba(197, 165, 90, 0.08) 0%, rgba(197, 165, 90, 0.04) 100%);
  border: 1px solid rgba(197, 165, 90, 0.18);
  border-radius: var(--d-radius-sm); padding: 5px 10px;
  margin-bottom: 10px;
}
.d-ppg-label { font-size: 9px; font-weight: 700; letter-spacing: 0.8px; color: var(--d-accent); text-transform: uppercase; }
.d-ppg-value { font-size: 13px; font-weight: 800; color: var(--d-accent); }

.d-card-actions { display: flex; gap: 6px; position: relative; z-index: 1; }
.d-draft-btn {
  flex: 1; padding: 9px 14px;
  border-radius: var(--d-radius-md); border: none;
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease, opacity 0.2s ease;
  font-family: inherit; letter-spacing: 0.5px;
  position: relative; overflow: hidden;
}
.d-draft-btn.can-draft {
  background: linear-gradient(135deg, #059669 0%, #047857 60%, #065f46 100%);
  color: white;
  box-shadow: 0 4px 16px rgba(5,150,105,0.3);
  will-change: transform;
}
.d-draft-btn.can-draft::before {
  content: '';
  position: absolute; top: 0; left: -40%; width: 40%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  transition: left 0.5s ease;
}
.d-draft-btn.can-draft::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: inherit;
  border: 2px solid rgba(5, 150, 105, 0.5);
  animation: draftBtnPing 2s ease-out infinite;
  pointer-events: none;
}
.d-draft-btn.can-draft:hover::before { left: 120%; }
.d-draft-btn.can-draft:hover {
  box-shadow: 0 8px 32px rgba(5,150,105,0.45);
  transform: translateY(-2px);
}
.d-draft-btn.can-draft:active {
  transform: translateY(0) scale(0.97);
  box-shadow: 0 2px 8px rgba(5,150,105,0.3);
}
.d-draft-btn.force-pick {
  background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 60%, #5b21b6 100%);
  color: white;
  box-shadow: 0 4px 16px rgba(124,58,237,0.35);
  will-change: transform;
}
.d-draft-btn.force-pick::before {
  content: '';
  position: absolute; top: 0; left: -40%; width: 40%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  transition: left 0.5s ease;
}
.d-draft-btn.force-pick::after {
  content: '';
  position: absolute; inset: 0;
  border-radius: inherit;
  box-shadow: 0 0 0 0 rgba(124,58,237,0.5);
  animation: draftBtnPing 2s ease-out infinite;
  pointer-events: none;
}
.d-draft-btn.force-pick:hover::before { left: 120%; }
.d-draft-btn.force-pick:hover {
  box-shadow: 0 8px 32px rgba(124,58,237,0.5);
  transform: translateY(-2px);
}
.d-draft-btn.force-pick:active {
  transform: translateY(0) scale(0.97);
  box-shadow: 0 2px 8px rgba(124,58,237,0.35);
}
.d-draft-btn.drafting {
  background: linear-gradient(135deg, rgba(5,150,105,0.4) 0%, rgba(4,120,87,0.4) 100%);
  color: rgba(255,255,255,0.6);
  cursor: wait;
}
.d-draft-btn.drafting::after { content: none; }
.d-draft-btn.waiting {
  background: rgba(107,114,128,0.2);
  border: 1px solid rgba(107,114,128,0.15);
  color: var(--d-text-muted);
  cursor: not-allowed;
}
.d-watch-btn {
  padding: 9px 12px; border-radius: var(--d-radius-md); border: none;
  background: rgba(27, 58, 92, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--d-text);
  font-size: 15px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  min-width: 42px; display: flex; align-items: center; justify-content: center;
}
.d-watch-btn:hover {
  background: rgba(27, 58, 92, 0.32);
  border-color: rgba(255, 255, 255, 0.1);
  transform: scale(1.05);
}
.d-watch-btn.active {
  background: linear-gradient(135deg, var(--d-warning) 0%, #d97706 100%);
  color: white; border-color: rgba(245, 158, 11, 0.4);
  box-shadow: 0 2px 12px rgba(245, 158, 11, 0.3);
}

/* ===== Skeleton Loading ===== */
.d-skeleton-wrap {
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: 100vh; padding: 40px;
  position: relative; z-index: 1;
}
.d-skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 16px; width: 100%; max-width: 1100px;
}
.d-skel-card {
  background: rgba(27, 58, 92, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--d-radius-lg); padding: 20px;
  animation: fadeSlideUp 0.5s ease-out both;
}
.d-skel-line {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.02) 25%,
    rgba(255,255,255,0.06) 50%,
    rgba(255,255,255,0.02) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: 6px;
}

/* ===== Empty & Error States ===== */
.d-state-center {
  min-height: 100vh; display: flex; align-items: center;
  justify-content: center; flex-direction: column; gap: 16px;
  padding: 40px; text-align: center; position: relative; z-index: 1;
}
.d-state-icon {
  font-size: 56px; line-height: 1;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,0.4));
  animation: fadeSlideUp 0.5s ease-out both;
}
.d-state-title {
  font-size: 36px; font-weight: 800;
  color: var(--d-accent);
  font-family: 'Big Shoulders Display', sans-serif;
  letter-spacing: 0.02em;
}
.d-state-desc {
  font-size: 14px; color: var(--d-text-secondary);
  max-width: 380px; line-height: 1.5;
}
.d-state-btn {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  background-size: 200% 200%;
  border: none; padding: 12px 28px; border-radius: var(--d-radius-md);
  color: white; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1); font-family: inherit;
  box-shadow: 0 4px 20px rgba(197, 165, 90, 0.3), inset 0 1px 0 rgba(255,255,255,0.15);
  position: relative; overflow: hidden;
}
.d-state-btn::before {
  content: '';
  position: absolute; top: 0; left: -40%; width: 40%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  transition: left 0.5s ease;
}
.d-state-btn:hover::before { left: 120%; }
.d-state-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(197, 165, 90, 0.35);
}
.d-state-btn.force-pick {
  background: linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%);
  box-shadow: 0 4px 16px rgba(124,58,237,0.35);
}
.d-state-btn.force-pick:hover {
  box-shadow: 0 8px 24px rgba(124,58,237,0.5);
}

/* ===== Responsive ===== */
/* $lg — tablet landscape. Effective band 980–1119: this is a max-width
   query, so it also matches below 980, where the tablet block that follows
   overrides the rules it sets. The side rail is still a column here, but
   narrower, and the depth chart drops to three. Was \`max-width: 1200px\`:
   moved onto the token boundary so 1120–1199 keeps the wide-desktop rail the
   mock specifies for its $xl band rather than the narrow one (LS-9860). */
@media (max-width: ${BP_LAND_MAX}px) {
  .d-layout { grid-template-columns: 1fr 280px; }
  .d-depth-grid { grid-template-columns: repeat(3, 1fr); }
}
/* $sm/$md — tablet (800–979). The rail stops being a column and becomes a
   collapsible shelf above the player pool. Was \`max-width: 900px\`, which
   left 901–979 rendering the desktop side-rail layout where the mock's
   \`@container vp (max-width: 979px)\` block specifies the stacked
   treatment — the defect LS-9860 exists to fix. */
@media (max-width: ${BP_TABLET_MAX}px) {
  .d-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto auto 1fr;
    grid-template-areas: "topband" "rail" "main";
  }
  .d-rail {
    border-left: none;
    border-top: 1px solid rgba(255,255,255,0.06);
    max-height: 280px;
    padding: 8px 14px;
  }
  /* LS-4824: collapse the rail to just the toggle on mobile so the player
     pool isn't pushed below the fold. Desktop layout is unaffected. */
  .d-rail-mobile-toggle {
    display: flex; align-items: center; justify-content: space-between;
    width: 100%;
    min-height: 36px;
    padding: 8px 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 6px;
    color: var(--d-text);
    font-family: 'Big Shoulders Display', 'Arial Narrow', sans-serif;
    font-weight: 700;
    font-size: 12px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    cursor: pointer;
  }
  .d-rail-mobile-toggle:hover { background: rgba(255,255,255,0.08); }
  .d-rail.collapsed { max-height: none; overflow: visible; }
  .d-rail.collapsed .d-rail-content { display: none; }
  .d-depth-grid { grid-template-columns: repeat(2, 1fr); }
  .d-topband { grid-template-columns: 1fr auto; grid-template-rows: auto auto; }
}
/* $xxs/$xs — phone (≤799). \`EliteDraftBoardScreen\` swaps the whole board
   for \`CompactLiveDraftBoard\` at this tier, so these rules only bite for
   consumers that mount the wide board's controls outside that gate (e.g.
   \`apps/web/src/components/EliteDraftBoard.a11y.spec.tsx\` renders
   \`DraftPlayerBoard\` bare). Kept as a safety net, retargeted from the
   ad-hoc 768px onto the token boundary. */
@media (max-width: ${BP_PHONE_MAX}px) {
  .d-main { padding: 12px 14px; }
  .d-controls { flex-direction: column; align-items: stretch; padding: 12px; }
  .d-search-wrap { min-width: 0; }
  /* Horizontal scroll for tabs/pills: children must not shrink, or the
     flex row collapses (LS-4851 — pills rendered ~4px tall with text gone). */
  .d-view-tabs {
    overflow-x: auto; -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .d-view-tabs::-webkit-scrollbar { display: none; }
  .d-view-tab { flex-shrink: 0; padding: 12px 14px; font-size: 13px; }
  .d-pills {
    overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px;
    -webkit-overflow-scrolling: touch; scrollbar-width: none;
  }
  .d-pills::-webkit-scrollbar { display: none; }
  .d-pill {
    flex-shrink: 0; min-height: 36px; padding: 8px 14px;
    display: inline-flex; align-items: center;
  }
}

/* ===== Pick Announcement ===== */
.d-announce-overlay {
  position: fixed; top: 0; left: 0; right: 0; bottom: 0;
  z-index: 9999; display: flex; align-items: flex-start;
  justify-content: center; padding-top: 60px;
  background: rgba(0,0,0,0.45);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  animation: fadeSlideUp 0.2s ease-out;
}
.d-announce-overlay.leaving {
  animation: announceOut 0.4s ease-in forwards;
  /* LS-4449: stop intercepting clicks during the fade-out so the underlying
     player grid / Draft Now button is interactive the instant dismissal
     starts. Without this, the overlay still blocks pointer events for the
     full 0.4s leave animation. */
  pointer-events: none;
}
.d-announce {
  position: relative; width: 440px; max-width: 92vw;
  background: linear-gradient(165deg, rgba(22, 34, 58, 0.95) 0%, rgba(10, 15, 26, 0.97) 100%);
  backdrop-filter: blur(32px) saturate(1.5);
  -webkit-backdrop-filter: blur(32px) saturate(1.5);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--d-radius-xl);
  overflow: hidden;
  animation: announceIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
  box-shadow: 0 32px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05), 0 0 60px rgba(197, 165, 90, 0.08);
}
.d-announce.leaving {
  animation: announceOut 0.35s ease-in forwards;
}
.d-announce-shine {
  position: absolute; top: 0; width: 40%; height: 100%;
  background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%);
  animation: shineSlide 1.2s ease-out 0.3s;
  pointer-events: none;
}
.d-announce-accent {
  height: 4px; width: 100%;
}
.d-announce-body {
  padding: 24px 28px 22px;
  display: flex; flex-direction: column; align-items: center; gap: 10px;
  text-align: center;
}
.d-announce-label {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; padding: 4px 14px;
  border-radius: var(--d-radius-pill);
  animation: pickPulse 1.5s ease-in-out infinite;
}
.d-announce-label.my-pick {
  background: rgba(16,185,129,0.15); color: #10b981;
  border: 1px solid rgba(16,185,129,0.25);
}
.d-announce-label.opp-pick {
  background: rgba(59,130,246,0.15); color: #60a5fa;
  border: 1px solid rgba(59,130,246,0.25);
}
.d-announce-label.auto-pick {
  background: rgba(245,158,11,0.15); color: #f59e0b;
  border: 1px solid rgba(245,158,11,0.25);
}
.d-announce-reason {
  font-size: 11px; color: rgba(245,158,11,0.75); font-weight: 500;
  max-width: 320px; line-height: 1.3;
  padding: 2px 0;
}
.d-announce-pick {
  font-size: 13px; color: var(--d-text-secondary); font-weight: 600;
}
.d-announce-name {
  font-size: 28px; font-weight: 800; color: #fff; line-height: 1.15;
  text-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.d-announce-details {
  display: flex; align-items: center; gap: 10px;
  margin-top: 2px;
}
.d-announce-pos {
  padding: 3px 10px; border-radius: var(--d-radius-sm);
  font-size: 12px; font-weight: 700; color: #fff;
}
.d-announce-team {
  font-size: 13px; color: var(--d-text-secondary); font-weight: 500;
}
.d-announce-stats {
  display: flex; gap: 20px; margin-top: 6px;
  padding: 12px 20px;
  background: rgba(13, 21, 38, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--d-radius-md);
}
.d-announce-stat-val {
  font-size: 16px; font-weight: 700; display: block; line-height: 1.2;
  font-variant-numeric: tabular-nums;
}
.d-announce-stat-lbl {
  font-size: 9px; font-weight: 600; color: var(--d-text-muted);
  letter-spacing: 0.5px; display: block;
}
/* Confetti particles */
.d-confetti {
  position: absolute; top: 0; left: 0; right: 0; height: 100%;
  overflow: hidden; pointer-events: none;
}
.d-confetti-bit {
  position: absolute; top: -8px;
  width: 6px; height: 6px; border-radius: 1px;
  animation: confettiDrift 1.8s ease-out forwards;
}

/* ===== Reduced Motion ===== */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ===== Paused Overlay ===== */
.d-paused-overlay {
  position: fixed; inset: 0; z-index: 5000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6);
  backdrop-filter: blur(12px) saturate(0.8); -webkit-backdrop-filter: blur(12px) saturate(0.8);
  animation: fadeSlideUp 0.3s ease-out;
}
.d-paused-card {
  background: linear-gradient(165deg, rgba(22, 34, 58, 0.95) 0%, rgba(10, 15, 26, 0.98) 100%);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(245,158,11,0.25);
  border-radius: var(--d-radius-xl);
  padding: 40px 48px;
  text-align: center;
  box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 80px rgba(245,158,11,0.08), inset 0 1px 0 rgba(255,255,255,0.06);
  animation: announceIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
}
.d-paused-icon { font-size: 56px; margin-bottom: 12px; }
.d-paused-title {
  font-size: 24px; font-weight: 800; color: #f59e0b;
  margin-bottom: 8px; letter-spacing: 1px;
}
.d-paused-desc {
  font-size: 14px; color: var(--d-text-secondary);
  max-width: 320px; margin: 0 auto 20px;
}
.d-paused-resume-btn {
  margin-top: 20px;
  padding: 12px 32px;
  background: var(--d-accent-primary, #1B3A5C);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: var(--d-radius-md);
  color: #fff; font-size: 14px; font-weight: 700;
  letter-spacing: 0.5px; cursor: pointer;
  transition: background 0.2s ease, transform 0.15s ease;
  font-family: inherit;
}
.d-paused-resume-btn:hover:not(:disabled) {
  background: rgba(27, 58, 92, 0.9);
  transform: translateY(-1px);
}
.d-paused-resume-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
.d-paused-resume-btn:disabled { opacity: 0.55; cursor: not-allowed; }

/* ===== Draft Grid (Team Columns) ===== */
.d-draft-grid-view {
  overflow-x: auto; padding-bottom: 8px;
}
.d-draft-grid-table {
  display: grid; gap: 2px; min-width: 100%;
}
.d-draft-grid-header {
  font-size: 11px; font-weight: 700; text-align: center;
  padding: 8px 6px;
  background: rgba(255,255,255,0.04);
  border-radius: var(--d-radius-sm) var(--d-radius-sm) 0 0;
  color: var(--d-text-secondary); letter-spacing: 0.5px;
  border-bottom: 2px solid var(--d-border);
  transition: all 0.3s ease;
}
.d-draft-grid-header.on-clock {
  background: linear-gradient(180deg, rgba(197, 165, 90, 0.15) 0%, rgba(197, 165, 90, 0.06) 100%);
  color: var(--d-accent);
  border-bottom-color: var(--d-accent);
  box-shadow: 0 2px 8px rgba(197, 165, 90, 0.1);
}
.d-draft-grid-cell {
  position: relative;
  overflow: hidden;
  font-size: 10px; text-align: center;
  padding: 5px 4px;
  background: rgba(255,255,255,0.015);
  border: 1px solid rgba(255,255,255,0.03);
  min-height: 28px;
  display: flex; align-items: center; justify-content: center;
  color: var(--d-text-muted);
  transition: all 0.25s ease;
}
.d-draft-grid-cell.round-label {
  font-weight: 700;
  color: var(--d-text-secondary);
  font-size: 11px;
}
.d-draft-grid-cell.filled {
  background: rgba(255,255,255,0.04);
  color: var(--d-text);
  font-weight: 600;
}
.d-draft-grid-cell.filled:hover {
  background: rgba(255,255,255,0.07);
}
.d-draft-grid-cell.current {
  background: linear-gradient(135deg, rgba(197, 165, 90, 0.12) 0%, rgba(197, 165, 90, 0.06) 100%);
  border-color: rgba(197, 165, 90, 0.3);
  animation: pickPulse 2s ease-in-out infinite;
  box-shadow: inset 0 0 12px rgba(197, 165, 90, 0.08);
}

/* Position color accent on filled cells — 3px left stripe + faint
   position-tinted background, computed inline per-cell via
   getPositionColor(sport, position) (LS-8784) so both baseball and
   football position codes render correct colors. */

/* Lower-right position glyph — display-font, large, low-opacity reinforcement. */
.d-draft-grid-cell-pos {
  position: absolute;
  bottom: 1px;
  right: 4px;
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 16px;
  line-height: 1;
  letter-spacing: 0.04em;
  opacity: 0.22;
  pointer-events: none;
  color: var(--d-text);
}

/* My-team override — gold border replaces position stripe (loudest signal). */
.d-draft-grid-cell.me-team {
  border-color: rgba(197, 165, 90, 0.4);
  border-left-color: var(--d-accent);
}
.d-draft-grid-cell-name {
  display: block;
  position: relative;
  z-index: 1;
  font-size: 10px;
}

/* ===== Draft Board Timeline (LS-10003) =====
   Below the 'desktop' tier the Draft Board view swaps the rounds x teams
   grid for this round-by-round timeline. The swap itself is a React fork in
   DraftPlayerBoard driven by useDraftViewportTier() (a design-token
   boundary), NOT a media query here — these rules only dress whichever
   projection that fork mounted. Ported from the mock's .board-timeline /
   .tl-* rules in
   docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/
   styles/adaptive.css. */
.d-tl-view { padding-bottom: 8px; }
.d-tl-clock {
  position: sticky; top: 0; z-index: 3;
  display: grid; grid-template-columns: 1fr auto;
  align-items: center; gap: 14px;
  padding: 14px 16px; margin-bottom: 12px;
  background: linear-gradient(180deg, var(--d-surface) 0%, var(--d-panel) 100%);
  border: 1px solid var(--d-accent-dim);
  border-radius: var(--d-radius-md);
}
.d-tl-clock-eyebrow {
  font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
  text-transform: uppercase; color: var(--d-accent);
}
.d-tl-clock-team {
  font-family: var(--f-display); font-weight: 800;
  font-size: 24px; line-height: 1.05;
  color: var(--d-text); margin-top: 3px;
}
.d-tl-clock-sub { font-size: 12px; color: var(--d-text-secondary); margin-top: 3px; }
.d-tl-ring {
  width: 46px; height: 46px; position: relative;
  display: grid; place-items: center; flex: none;
}
.d-tl-ring svg { position: absolute; inset: 0; }
.d-tl-ring-time {
  font-family: var(--f-display); font-weight: 800; font-size: 13px;
  color: var(--d-accent); font-variant-numeric: tabular-nums;
}
.d-tl-round {
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
  background: var(--d-panel);
  margin-bottom: 8px;
  overflow: hidden;
}
.d-tl-round-head {
  width: 100%; min-height: 48px;
  display: grid; grid-template-columns: 1fr auto auto;
  align-items: center; gap: 12px;
  padding: 12px 14px;
  background: transparent; border: 0;
  cursor: pointer; text-align: left;
  font-family: inherit; color: inherit;
}
.d-tl-round-head:hover { background: var(--d-surface-hover); }
.d-tl-round-label {
  font-family: var(--f-display); font-weight: 800; font-size: 15px;
  letter-spacing: 0.06em; text-transform: uppercase; color: var(--d-text);
}
.d-tl-round-count { font-size: 12px; color: var(--d-text-secondary); }
.d-tl-round-chev { color: var(--d-text-muted); font-size: 12px; }
.d-tl-round.open .d-tl-round-head { border-bottom: 1px solid var(--d-border); }
.d-tl-picks { display: flex; flex-direction: column; }
.d-tl-pick {
  display: grid; grid-template-columns: 42px 34px 1fr auto;
  gap: 12px; align-items: center;
  min-height: 56px; padding: 9px 14px;
  border-bottom: 1px solid var(--d-border);
  border-left: 3px solid transparent;
}
.d-tl-picks .d-tl-pick:last-child { border-bottom: 0; }
.d-tl-pick-num {
  font-family: var(--f-display); font-weight: 700; font-size: 12px;
  color: var(--d-text-muted); font-variant-numeric: tabular-nums;
}
.d-tl-pick-team {
  font-family: var(--f-display); font-weight: 700; font-size: 11px;
  letter-spacing: 0.08em; color: var(--d-text-secondary);
}
.d-tl-pick-body { min-width: 0; }
.d-tl-pick-name {
  font-family: var(--f-display); font-weight: 700; font-size: 16px;
  color: var(--d-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-tl-pick-meta {
  font-size: 11px; color: var(--d-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-tl-pick-pos {
  font-family: var(--f-display); font-weight: 700; font-size: 11px;
  letter-spacing: 0.08em; color: var(--d-text-secondary);
}
/* My team — gold rail + gold monogram, matching the grid cell's .me-team
   loudest-signal rule. No background wash: the theme-compliance ratchet
   (LS-8518) admits no new raw rgba, and the only gold wash token,
   --d-accent-dim, is spent on .now below, which must stay the louder of the
   two. Declared before .now / .up so an on-the-clock row of mine still reads
   as on the clock. */
.d-tl-pick.me-team { border-left-color: var(--d-accent); }
.d-tl-pick.me-team .d-tl-pick-team { color: var(--d-accent); }
.d-tl-pick.now {
  background: var(--d-accent-dim);
  border-left-color: var(--d-accent);
}
.d-tl-pick.now .d-tl-pick-name { color: var(--d-accent); font-style: italic; }
.d-tl-pick.up .d-tl-pick-name { color: var(--d-text-muted); }

/* ===== Draft Board player dock (LS-10005) =====
   The player list pinned to the bottom of the board pane under whichever
   projection is mounted, collapsed to a bar until opened. Ported from the
   mock's .bd-dock rules in
   docs/design/B8P9BQz8s6NZ9Q-FqWI_yA/legacy-sports-draft-board/project/
   styles/mobile.css. Deliberately NOT width-gated: the mock shows the dock at
   every tier of its desktop frame, and the rows-per-line split (1/2/3-up) is
   a React decision on the design-token tier, set here via data-cols rather
   than a media query. Raw rgba washes in the mock map onto --d-* tokens (the
   LS-8518 theme-compliance ratchet admits no new literals). */
.d-dock {
  position: sticky; bottom: 0; z-index: 5;
  margin: 12px -2px 0;
  background: var(--d-panel);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  border: 1px solid var(--d-accent-dark);
  border-bottom: 0;
  border-radius: var(--d-radius-md) var(--d-radius-md) 0 0;
  box-shadow: var(--d-panel-shadow);
}
.d-dock-bar { display: flex; align-items: center; gap: 14px; padding: 11px 14px; }
.d-dock-bar-text { flex: 1; min-width: 0; }
.d-dock-label {
  font-family: var(--f-display); font-weight: 800; font-size: 11px;
  letter-spacing: 0.16em; text-transform: uppercase; color: var(--d-accent);
}
.d-dock-sub {
  font-size: 11px; color: var(--d-text-secondary);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-dock-cta {
  min-height: 40px; padding: 0 18px; flex: none;
  border-radius: var(--d-radius-sm);
  border: 1px solid var(--d-accent); background: var(--d-accent);
  color: var(--d-bg);
  font-family: var(--f-display); font-weight: 800; font-size: 13px;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
}
.d-dock-chev {
  min-width: 36px; min-height: 36px; flex: none;
  border-radius: var(--d-radius-sm);
  border: 1px solid var(--d-border); background: var(--d-panel);
  color: var(--d-text-secondary); font-size: 13px; cursor: pointer;
  transition: transform 200ms ease, color 140ms;
}
.d-dock[data-open="true"] .d-dock-chev { transform: rotate(180deg); color: var(--d-accent); }
.d-dock-cta:focus-visible, .d-dock-chev:focus-visible, .d-dock-go:focus-visible, .d-dock-more:focus-visible {
  outline: 2px solid var(--d-accent); outline-offset: 2px;
}
/* Collapses by max-height, never display:none or unmount, so the rows keep
   their scroll position across a close/open. */
.d-dock-body {
  max-height: 0; overflow: hidden;
  transition: max-height 260ms cubic-bezier(.22,.7,.2,1);
}
.d-dock[data-open="true"] .d-dock-body { max-height: 340px; }
.d-dock-inner { border-top: 1px solid var(--d-border); padding: 12px 14px 14px; }
.d-dock-tools { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
.d-dock-rows {
  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px; max-height: 232px; overflow-y: auto;
}
.d-dock-rows[data-cols="1"] { grid-template-columns: minmax(0, 1fr); }
.d-dock-rows[data-cols="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.d-dock-prow {
  display: grid; grid-template-columns: 26px 1fr auto;
  gap: 10px; align-items: center;
  padding: 8px 10px;
  background: var(--d-card);
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
}
.d-dock-prow.fits { border-color: var(--d-accent-dark); }
.d-dock-rk {
  font-family: var(--f-display); font-weight: 800; font-size: 11px;
  color: var(--d-text-muted); text-align: center; font-variant-numeric: tabular-nums;
}
.d-dock-prow-body { min-width: 0; }
.d-dock-nm {
  font-family: var(--f-display); font-weight: 700; font-size: 15px; line-height: 1.1;
  color: var(--d-text);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-dock-mt {
  font-size: 10px; color: var(--d-text-secondary); margin-top: 1px;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.d-dock-go {
  min-height: 32px; padding: 6px 11px;
  border-radius: 6px; border: 1px solid var(--d-accent-dark);
  background: var(--d-accent-dim); color: var(--d-accent);
  font-family: var(--f-display); font-weight: 800; font-size: 10px;
  letter-spacing: 0.08em; cursor: pointer;
}
.d-dock-go:hover { border-color: var(--d-accent); }
.d-dock-go:disabled { opacity: 0.5; cursor: default; }
.d-dock-empty {
  grid-column: 1 / -1; padding: 18px; text-align: center;
  font-size: 12px; font-style: italic; color: var(--d-text-muted);
}
.d-dock-more {
  grid-column: 1 / -1; min-height: 36px;
  border-radius: var(--d-radius-sm); border: 1px solid var(--d-border);
  background: var(--d-panel); color: var(--d-text-secondary);
  font-family: var(--f-display); font-weight: 700; font-size: 12px;
  letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer;
}
.d-dock-more:hover { color: var(--d-text); border-color: var(--d-border-hover); }

/* ===== Toast Notifications ===== */
.d-toast {
  position: fixed; bottom: 20px; right: 20px; z-index: 2000;
  max-width: 480px; padding: 12px 16px; border-radius: 12px;
  font-size: 13px; font-weight: 600;
  backdrop-filter: blur(16px) saturate(1.4);
  -webkit-backdrop-filter: blur(16px) saturate(1.4);
  animation: fadeSlideUp 0.3s ease-out;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.d-toast.error {
  border: 1px solid rgba(239,68,68,0.3);
  background: linear-gradient(135deg, rgba(127,29,29,0.88) 0%, rgba(153,27,27,0.82) 100%);
  color: #fecaca;
}
.d-toast.warning {
  border: 1px solid rgba(245,158,11,0.3);
  background: linear-gradient(135deg, rgba(120,53,15,0.88) 0%, rgba(146,64,14,0.82) 100%);
  color: #fde68a;
}
.d-toast.info {
  border: 1px solid rgba(59,130,246,0.3);
  background: linear-gradient(135deg, rgba(30,58,138,0.88) 0%, rgba(37,99,235,0.82) 100%);
  color: #bfdbfe;
}

/* ===== Chat Overlay Panel ===== */
.d-chat-overlay {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 320px;
  z-index: 200;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #0e1829 0%, #111b2f 100%);
  border-left: 1px solid var(--d-border);
  box-shadow: -4px 0 32px rgba(0,0,0,0.4);
  animation: slideInRight 0.2s ease;
}
@keyframes slideInRight {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}

/* ===== Screen Reader ===== */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0;
  margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
  white-space: nowrap; border-width: 0;
}

/* ===== Draft Intelligence Panel ===== */
@keyframes intelItemIn {
  from { opacity: 0; transform: translateX(-10px); }
  to   { opacity: 1; transform: translateX(0); }
}
.d-intel-panel {
  background: linear-gradient(165deg, rgba(197, 165, 90, 0.07) 0%, rgba(22, 34, 58, 0.6) 100%);
  border: 1px solid rgba(197, 165, 90, 0.18);
  border-radius: var(--d-radius-lg);
  padding: 14px;
  margin-bottom: 14px;
}
.d-intel-title {
  font-size: 11px; font-weight: 800; letter-spacing: 1.5px;
  text-transform: uppercase; color: var(--d-accent);
  margin-bottom: 10px;
}
.d-intel-list {
  display: flex; flex-direction: column; gap: 6px;
}
.d-intel-item {
  background: linear-gradient(135deg, rgba(13, 21, 38, 0.55) 0%, rgba(10, 15, 26, 0.4) 100%);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--d-radius-sm);
  padding: 8px 10px;
  animation: intelItemIn 0.25s ease-out both;
  transition: border-color 0.2s, background 0.2s;
}
.d-intel-item:hover {
  border-color: rgba(197, 165, 90, 0.2);
  background: rgba(27, 58, 92, 0.2);
}
.d-intel-header-row {
  display: flex; align-items: center; gap: 6px; margin-bottom: 5px;
}
.d-intel-rank {
  font-size: 10px; font-weight: 800; color: var(--d-accent);
  min-width: 22px; flex-shrink: 0;
}
.d-intel-name {
  font-size: 12px; font-weight: 700; color: var(--d-text);
  flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.d-intel-pos {
  font-size: 9px; font-weight: 700; color: #fff;
  padding: 1px 5px; border-radius: 4px; flex-shrink: 0;
}
.d-intel-stats-row {
  display: flex; align-items: center; gap: 5px; margin-bottom: 4px;
}
.d-intel-stat-pill {
  display: flex; align-items: baseline; gap: 2px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 4px; padding: 2px 5px; flex-shrink: 0;
}
.d-intel-stat-val {
  font-size: 11px; font-weight: 700; color: var(--d-text);
  font-variant-numeric: tabular-nums;
}
.d-intel-stat-lbl {
  font-size: 9px; font-weight: 600; color: var(--d-text-muted); letter-spacing: 0.3px;
}
.d-intel-score-bar-wrap {
  flex: 1; height: 3px; background: rgba(255, 255, 255, 0.07);
  border-radius: 2px; overflow: hidden;
}
.d-intel-score-bar {
  height: 100%;
  background: linear-gradient(90deg, var(--d-accent) 0%, var(--d-accent-light, #D4BB78) 100%);
  border-radius: 2px;
  transition: width 0.4s ease;
}
.d-intel-reason {
  font-size: 10px; color: var(--d-text-secondary);
  font-style: italic; line-height: 1.3;
}
.d-intel-draft-btn {
  margin-top: 6px; width: 100%; padding: 5px 10px;
  border-radius: var(--d-radius-sm); border: none;
  font-size: 11px; font-weight: 700; letter-spacing: 0.4px;
  cursor: pointer; font-family: inherit;
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: #fff;
  transition: opacity 0.15s, transform 0.15s;
}
.d-intel-draft-btn:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}
.d-intel-draft-btn:focus-visible {
  outline: 2px solid var(--d-success);
  outline-offset: 2px;
}
.d-intel-draft-btn:active {
  transform: translateY(0) scale(0.97);
}

/* ===== Pick Announcement Commentary ===== */
.d-announce-commentary {
  font-size: 12px; font-style: italic;
  color: var(--d-text-secondary);
  text-align: center;
  padding: 8px 12px;
  border-top: 1px solid rgba(197, 165, 90, 0.15);
  line-height: 1.4; width: 100%;
  animation: fadeSlideUp 0.35s ease-out 0.3s both;
}

/* ===== Draft Queue Panel ===== */
.d-queue-panel {
  border: 1px solid rgba(197, 165, 90, 0.18);
}
.d-queue-empty {
  text-align: center;
  padding: 18px 8px;
  color: var(--d-text-muted);
  font-size: 12px;
  line-height: 1.5;
}
.d-queue-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 4px;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  animation: fadeSlideIn 0.2s ease both;
}
.d-queue-row:last-of-type {
  border-bottom: none;
}
.d-queue-row.dragging {
  background: var(--d-surface-hover);
  border-radius: 6px;
}
.d-queue-drag {
  cursor: grab;
  color: var(--d-text-muted);
  font-size: 14px;
  line-height: 0.8;
  padding: 0 2px;
  letter-spacing: -2px;
  user-select: none;
  flex-shrink: 0;
}
.d-queue-drag:active {
  cursor: grabbing;
}
.d-queue-row:hover .d-queue-drag {
  color: var(--d-text-secondary);
}
.d-queue-rank {
  min-width: 18px;
  font-size: 10px;
  font-weight: 700;
  color: var(--d-accent);
  text-align: center;
}
.d-queue-name {
  flex: 1;
  font-size: 12px;
  font-weight: 600;
  color: var(--d-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-queue-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.d-queue-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  color: var(--d-text-secondary);
  cursor: pointer;
  font-size: 10px;
  padding: 2px 5px;
  font-family: inherit;
  line-height: 1;
  transition: background 0.15s, color 0.15s;
}
.d-queue-btn:hover:not(:disabled) {
  background: rgba(197, 165, 90, 0.15);
  color: var(--d-accent);
  border-color: rgba(197, 165, 90, 0.3);
}
.d-queue-btn:disabled {
  opacity: 0.25;
  cursor: default;
}
.d-queue-btn.d-queue-remove:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  border-color: rgba(239, 68, 68, 0.3);
}
.d-queue-hint {
  margin-top: 8px;
  font-size: 10px;
  color: var(--d-text-muted);
  text-align: center;
  font-style: italic;
  padding-top: 6px;
  border-top: 1px solid rgba(255,255,255,0.04);
}

/* ===== Queue button on player cards ===== */
.d-queue-card-btn {
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  color: var(--d-text-secondary);
  cursor: pointer;
  font-size: 14px;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  font-family: inherit;
  flex-shrink: 0;
}
.d-queue-card-btn:hover {
  background: rgba(197, 165, 90, 0.12);
  color: var(--d-accent);
  border-color: rgba(197, 165, 90, 0.35);
}
.d-queue-card-btn.active {
  background: rgba(197, 165, 90, 0.18);
  color: var(--d-accent);
  border-color: rgba(197, 165, 90, 0.5);
}

/* ===== Baseball Card (LS-628) ===== */

/* Wrapper that centers the baseball card inside the announcement popup */
.bc-announce-wrapper {
  width: 220px;
  margin: 4px auto 0;
}

/* 2-col grid for sidebar panel */
.bc-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding-top: 4px;
}

/* 3-col grid for wider contexts (e.g. post-draft screen) */
.bc-wide-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  padding-top: 4px;
}

.bc-card {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  background: var(--d-card);
  border: 1px solid var(--d-border);
  display: flex;
  flex-direction: column;
  cursor: default;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.25s ease;
}

.bc-card:hover {
  transform: translateY(-4px) rotate(0.6deg);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.5),
    0 0 0 1px rgba(197, 165, 90, 0.3);
  z-index: 2;
}

/* Shine sweep on hover */
.bc-shine {
  position: absolute;
  top: 0;
  left: -40%;
  width: 40%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.06) 50%,
    rgba(197, 165, 90, 0.03) 75%,
    transparent 100%
  );
  pointer-events: none;
  transform: skewX(-12deg);
}
.bc-card:hover .bc-shine {
  animation: shineSlide 0.65s ease-out forwards;
}

/* Header band – position-colored */
.bc-header {
  padding: 6px 7px 5px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  position: relative;
}
.bc-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: rgba(0, 0, 0, 0.25);
}

.bc-pos-badge {
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.5px;
  background: rgba(0, 0, 0, 0.28);
  padding: 2px 5px;
  border-radius: 3px;
}

.bc-pick-badge {
  font-size: 8px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 700;
  text-align: right;
  line-height: 1.3;
  font-family: 'Big Shoulders Display', sans-serif;
  font-variant-numeric: tabular-nums;
}

/* Brand micro-text */
.bc-brand {
  text-align: center;
  font-size: 6.5px;
  letter-spacing: 1.2px;
  color: rgba(248, 250, 252, 0.4);
  font-weight: 700;
  text-transform: uppercase;
  padding: 2px 6px 3px;
  background: rgba(0, 0, 0, 0.2);
  flex-shrink: 0;
}

/* Body */
.bc-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 5px 7px 6px;
}

.bc-overall {
  font-size: 8px;
  color: var(--d-accent);
  font-weight: 700;
  letter-spacing: 0.3px;
  margin-bottom: 1px;
  font-family: 'Big Shoulders Display', sans-serif;
  font-variant-numeric: tabular-nums;
}

.bc-name {
  font-size: 11px;
  font-weight: 800;
  color: var(--d-text);
  margin: 0 0 3px;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Big Shoulders Display', sans-serif;
}

.bc-elig {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: rgba(248, 250, 252, 0.55);
  text-transform: uppercase;
  margin-bottom: 3px;
  font-variant-numeric: tabular-nums;
}

.bc-career {
  font-size: 8px;
  color: rgba(248, 250, 252, 0.45);
  font-weight: 600;
  letter-spacing: 0.3px;
  margin-bottom: 3px;
  font-variant-numeric: tabular-nums;
}

.bc-career-years {
  color: rgba(248, 250, 252, 0.7);
}

.bc-divider {
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent,
    var(--d-border),
    transparent
  );
  margin: 3px -7px 4px;
}

/* Stats 2×2 grid */
.bc-stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 3px;
  margin-bottom: 4px;
}

.bc-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(0, 0, 0, 0.22);
  border-radius: 4px;
  padding: 3px 2px;
}

.bc-stat-val {
  font-size: 10px;
  font-weight: 800;
  color: var(--d-text);
  line-height: 1;
  font-family: 'Big Shoulders Display', sans-serif;
  font-variant-numeric: tabular-nums;
}

.bc-stat-lbl {
  font-size: 7.5px;
  color: var(--d-text-muted);
  margin-top: 1px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

/* PPG footer */
.bc-ppg {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--d-accent-dim);
  border: 1px solid rgba(197, 165, 90, 0.2);
  border-radius: 4px;
  padding: 3px 5px;
  margin-top: auto;
}

.bc-ppg-lbl {
  font-size: 8px;
  color: var(--d-accent-light);
  font-weight: 600;
  letter-spacing: 0.5px;
}

.bc-ppg-val {
  font-size: 10px;
  font-weight: 800;
  color: var(--d-accent);
  font-family: 'Big Shoulders Display', sans-serif;
  font-variant-numeric: tabular-nums;
}

/* ===== Spectator screen (LS-8942) =====
   Big-screen-first layout: slim top band, dominant board, on-the-clock rail.
   Rail stacks below the board on narrow viewports. */
.d-spec-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  grid-template-rows: auto 1fr;
  grid-template-areas:
    'topband topband'
    'board rail';
  gap: 14px;
  padding: 14px;
  min-height: 100vh;
  position: relative;
  z-index: 1;
}
/* Spectator board stacks on the same tablet boundary as \`.d-layout\`. */
@media (max-width: ${BP_TABLET_MAX}px) {
  .d-spec-layout {
    grid-template-columns: 1fr;
    grid-template-areas:
      'topband'
      'board'
      'rail';
  }
}
.d-spec-topband {
  grid-area: topband;
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 10px 18px;
  background: var(--d-panel);
  border: 1px solid var(--d-panel-border);
  border-radius: var(--d-radius-lg);
}
.d-spec-league {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.d-spec-league-name {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 24px;
  color: var(--d-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-spec-live-dot {
  width: 10px; height: 10px; border-radius: 50%;
  background: var(--d-success);
  animation: liveDot 1.6s ease-in-out infinite;
  flex-shrink: 0;
}
.d-spec-live-dot.paused {
  background: var(--d-warning);
  animation: none;
}
.d-spec-live-label {
  font-family: var(--f-display);
  font-weight: 700;
  font-size: 12px;
  letter-spacing: 0.14em;
  color: var(--d-text-secondary);
}
.d-spec-pickinfo {
  font-family: var(--f-display);
  font-weight: 700;
  font-size: 18px;
  color: var(--d-text);
  white-space: nowrap;
}
.d-spec-onclock {
  margin-left: auto;
  min-width: 0;
  text-align: right;
}
.d-spec-onclock-team {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 28px;
  color: var(--d-accent-light);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-spec-board {
  grid-area: board;
  min-width: 0;
  overflow: auto;
}
/* TV-distance legibility: bump the grid's cell type on the spectator board. */
.d-spec-board .d-draft-grid-cell-name { font-size: 13px; }
.d-spec-rail {
  grid-area: rail;
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}
.d-spec-depth-team {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 20px;
  color: var(--d-text);
  margin: 4px 0 10px;
}
.d-spec-depth-bucket {
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
  padding: 6px 0;
  border-bottom: 1px solid var(--d-border);
}
.d-spec-depth-bucket:last-child { border-bottom: none; }
.d-spec-depth-pos {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 13px;
  min-width: 34px;
}
.d-spec-depth-fill {
  font-size: 11px;
  color: var(--d-text-secondary);
}
.d-spec-depth-players {
  flex: 1 1 100%;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.d-spec-depth-player {
  font-size: 12px;
  color: var(--d-text);
}
.d-spec-depth-open {
  font-size: 11px;
  color: var(--d-accent-light);
  font-style: italic;
}
.d-spec-recent-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 0;
  border-bottom: 1px solid var(--d-border);
  min-width: 0;
}
.d-spec-recent-row:last-child { border-bottom: none; }
.d-spec-recent-num {
  font-size: 11px;
  color: var(--d-text-muted);
  min-width: 28px;
}
.d-spec-recent-pos {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 11px;
}
.d-spec-recent-name {
  font-size: 12.5px;
  color: var(--d-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.d-spec-recent-team {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--d-text-secondary);
  white-space: nowrap;
}
.d-spec-recent-empty {
  font-size: 12px;
  color: var(--d-text-muted);
  padding: 6px 0;
}
.d-spec-lobby-order {
  margin: 8px 0 0;
  padding: 0 0 0 20px;
  text-align: left;
  color: var(--d-text-secondary);
  font-size: 14px;
  columns: 2;
  column-gap: 32px;
}
/* Splash chrome sits above the reused announcement overlay (z-index 9999). */
.d-splash-chrome {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  animation: fadeSlideUp 0.3s ease-out;
}
.d-splash-chrome.leaving {
  animation: announceOut 0.4s ease-in forwards;
}
.d-splash-headshot {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  object-fit: cover;
  border: 2px solid var(--d-accent);
  background: var(--d-card);
}
.d-splash-headshot-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 40px;
}
.d-splash-team {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 16px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--d-accent-light);
  text-shadow: 0 1px 8px var(--d-bg);
}
.d-splash-queue-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--d-text-secondary);
  background: var(--d-panel);
  border: 1px solid var(--d-panel-border);
  border-radius: var(--d-radius-pill);
  padding: 3px 10px;
}
/* Pick-splash notable-play stat graphic (LS-9095). All intro animation
   completes within ~2s so it reads fully even in the 4s catch-up window. */
.d-splash-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  width: 300px;
  padding: 8px 10px 10px;
  background: var(--d-panel);
  border: 1px solid var(--d-panel-border);
  border-radius: var(--d-radius);
  animation: fadeSlideUp 0.3s ease-out;
}
.d-stat-event {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 14px;
  letter-spacing: 0.12em;
  color: var(--d-accent-light);
}
.d-stat-svg {
  width: 280px;
  height: 120px;
}
.d-stat-ground {
  stroke: var(--d-panel-border);
  stroke-width: 2;
  stroke-linecap: round;
}
.d-stat-traj {
  fill: none;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-dasharray: 320;
  stroke-dashoffset: 320;
  animation: statTrajDraw 1.1s ease-out 0.2s forwards;
}
.d-stat-ball {
  fill: var(--d-accent-light);
  opacity: 0;
  animation: statBallPop 0.4s ease-out 1.2s forwards;
}
.d-stat-chips {
  display: flex;
  gap: 8px;
}
.d-stat-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  opacity: 0;
  animation: fadeSlideUp 0.35s ease-out forwards;
}
.d-stat-chip-value {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 16px;
  color: var(--d-text);
}
.d-stat-chip-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--d-text-secondary);
}
.d-stat-pitch {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 6px 0 2px;
}
.d-stat-pitch-k {
  font-family: var(--f-display);
  font-weight: 800;
  font-size: 44px;
  line-height: 1;
  color: var(--d-danger);
  animation: statBallPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.d-stat-desc {
  font-size: 12px;
  color: var(--d-text-secondary);
  text-align: center;
}
.d-stat-filmroom {
  pointer-events: auto;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--d-accent-light);
  text-decoration: none;
  border: 1px solid var(--d-panel-border);
  border-radius: var(--d-radius-pill);
  padding: 3px 10px;
  opacity: 0;
  animation: fadeSlideUp 0.35s ease-out 1.8s forwards;
}
.d-stat-filmroom:hover {
  border-color: var(--d-accent);
  color: var(--d-accent);
}
@keyframes statTrajDraw {
  to { stroke-dashoffset: 0; }
}
@keyframes statBallPop {
  from { opacity: 0; transform: scale(0.4); transform-origin: center; transform-box: fill-box; }
  to { opacity: 1; transform: scale(1); transform-origin: center; transform-box: fill-box; }
}
@keyframes statBallPopIn {
  from { opacity: 0; transform: scale(0.3); }
  to { opacity: 1; transform: scale(1); }
}
`;

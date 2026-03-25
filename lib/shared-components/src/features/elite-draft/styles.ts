// ---------------------------------------------------------------------------
// Component-scoped CSS for EliteDraftBoard
// ---------------------------------------------------------------------------

const NAV_HEIGHT_PX = 75;
const NAV_Z_INDEX = 200;

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
  --d-danger: #ef4444;
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
  --d-radius-sm: 8px;
  --d-radius-md: 12px;
  --d-radius-lg: 16px;
  --d-radius-xl: 20px;
  --d-radius-pill: 100px;
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
@keyframes pulseGlow {
  0%, 100% { box-shadow: 0 0 20px rgba(197, 165, 90, 0.12); }
  50%      { box-shadow: 0 0 40px rgba(197, 165, 90, 0.28); }
}
@keyframes liveDot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%      { opacity: 0.4; transform: scale(0.7); }
}
@keyframes floatOrb {
  0%, 100% { transform: translate(0,0) scale(1); }
  33%      { transform: translate(30px,-20px) scale(1.05); }
  66%      { transform: translate(-20px,15px) scale(0.95); }
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
@keyframes gradientShift {
  0%   { background-position: 0% 50%; }
  50%  { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 15px rgba(197, 165, 90, 0.1), 0 0 30px rgba(27, 58, 92, 0.08); }
  50%      { box-shadow: 0 0 25px rgba(197, 165, 90, 0.25), 0 0 50px rgba(27, 58, 92, 0.15); }
}
@keyframes borderGlow {
  0%, 100% { border-color: rgba(255, 255, 255, 0.06); }
  50%      { border-color: rgba(197, 165, 90, 0.2); }
}
@keyframes draftBtnGlow {
  0%, 100% { box-shadow: 0 4px 16px rgba(5, 150, 105, 0.25), 0 0 0 0 rgba(5, 150, 105, 0.3); }
  50%      { box-shadow: 0 6px 24px rgba(5, 150, 105, 0.4), 0 0 0 8px rgba(5, 150, 105, 0); }
}
@keyframes statShine {
  0%   { opacity: 0; left: -30%; }
  50%  { opacity: 1; }
  100% { opacity: 0; left: 130%; }
}
@keyframes slideInLeft {
  from { opacity: 0; transform: translateX(-16px); }
  to   { opacity: 1; transform: translateX(0); }
}

/* ===== Layout ===== */
.d-root {
  /* Use fixed positioning to escape any padded layout wrappers (e.g. nav +
     YStack padding) so the draft board fills the viewport below the sticky
     nav bar without causing a page-level scrollbar. */
  position: fixed;
  top: ${NAV_HEIGHT_PX}px;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: ${NAV_Z_INDEX + 1};
  background: var(--d-bg);
  color: var(--d-text);
  font-family: 'Playfair Display', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
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
  animation: floatOrb 25s ease-in-out infinite;
}
.d-layout {
  position: relative; z-index: 1;
  display: grid;
  grid-template-columns: 310px 1fr;
  /* 100% fills the fixed .d-root parent which is already viewport-sized */
  height: 100%;
}

/* ===== Sidebar ===== */
.d-side {
  background: linear-gradient(180deg, rgba(17, 27, 47, 0.92) 0%, rgba(10, 15, 26, 0.96) 100%);
  backdrop-filter: blur(32px) saturate(1.4);
  -webkit-backdrop-filter: blur(32px) saturate(1.4);
  padding: 20px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.08) transparent;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  position: relative;
}
.d-side::before {
  content: '';
  position: absolute; top: 0; left: 0; right: 0; height: 120px;
  background: linear-gradient(180deg, rgba(197, 165, 90, 0.04) 0%, transparent 100%);
  pointer-events: none;
}
.d-side::-webkit-scrollbar { width: 4px; }
.d-side::-webkit-scrollbar-track { background: transparent; }
.d-side::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

/* ===== Draft Status Card ===== */
.d-status {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 60%, var(--d-navy, #1B3A5C) 100%);
  background-size: 200% 200%;
  animation: gradientShift 6s ease-in-out infinite;
  padding: 14px 16px;
  border-radius: var(--d-radius-md);
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  display: flex; align-items: center; gap: 10px;
  box-shadow: 0 4px 20px rgba(197, 165, 90, 0.2), inset 0 1px 0 rgba(255,255,255,0.15);
}
.d-status::before {
  content: '';
  position: absolute; inset: 0;
  background: linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.12) 50%, transparent 70%);
  background-size: 200% 100%;
  animation: shimmer 4s ease-in-out infinite;
}
.d-live-dot {
  width: 7px; height: 7px; flex-shrink: 0;
  background: #fff; border-radius: 50%;
  animation: liveDot 1.5s ease-in-out infinite;
  box-shadow: 0 0 6px rgba(255,255,255,0.6);
}
.d-status-info {
  position: relative; line-height: 1.3;
}
.d-status-title {
  font-size: 12px; font-weight: 800; letter-spacing: 1px;
  text-shadow: 0 1px 4px rgba(0,0,0,0.25);
}
.d-status-sub {
  font-size: 11px; opacity: 0.85; font-weight: 500;
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
  font-family: 'Inter', monospace; text-anchor: middle;
}
.d-timer-label {
  fill: rgba(255,255,255,0.65); font-size: 8px; font-weight: 700;
  letter-spacing: 2.5px; text-anchor: middle; text-transform: uppercase;
}
.d-timer-wrap.warn { animation: timerWarn 0.6s ease-in-out infinite; }

/* ===== Panel ===== */
.d-panel {
  background: linear-gradient(165deg, rgba(22, 34, 58, 0.7) 0%, rgba(17, 27, 47, 0.5) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--d-radius-lg);
  padding: 16px;
  margin-bottom: 14px;
  transition: border-color 0.4s ease, box-shadow 0.4s ease;
  animation: borderGlow 8s ease-in-out infinite;
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

/* ===== Roster ===== */
.d-roster-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
  gap: 5px; margin-bottom: 12px;
}
.d-roster-cell {
  background: linear-gradient(165deg, rgba(13, 21, 38, 0.6) 0%, rgba(10, 15, 26, 0.4) 100%);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--d-radius-sm);
  padding: 7px 5px; text-align: center; font-size: 11px;
  transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
}
.d-roster-cell:hover {
  background: rgba(27, 58, 92, 0.2);
  border-color: rgba(197, 165, 90, 0.15);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  transform: translateY(-1px);
}
.d-roster-player {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px;
  background: linear-gradient(165deg, rgba(13, 21, 38, 0.5) 0%, rgba(10, 15, 26, 0.3) 100%);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: var(--d-radius-sm);
  margin-bottom: 5px;
  transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
  animation: slideInLeft 0.3s ease-out both;
}
.d-roster-player:hover {
  background: rgba(27, 58, 92, 0.15);
  border-color: rgba(255, 255, 255, 0.08);
  transform: translateX(3px);
}

/* ===== Glass Button ===== */
.d-btn-glass {
  display: block; width: 100%;
  background: linear-gradient(135deg, rgba(27, 58, 92, 0.18) 0%, rgba(27, 58, 92, 0.12) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
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
  padding: 20px; overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.08) transparent;
}
.d-main::-webkit-scrollbar { width: 4px; }
.d-main::-webkit-scrollbar-track { background: transparent; }
.d-main::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }

/* ===== Controls Bar ===== */
.d-controls {
  background: linear-gradient(135deg, rgba(22, 34, 58, 0.7) 0%, rgba(17, 27, 47, 0.5) 100%);
  backdrop-filter: blur(24px) saturate(1.3);
  -webkit-backdrop-filter: blur(24px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.07);
  padding: 14px 18px;
  border-radius: var(--d-radius-lg);
  margin-bottom: 18px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
  box-shadow: 0 4px 24px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
  position: relative;
  overflow: hidden;
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
  background: linear-gradient(135deg, rgba(13, 21, 38, 0.8) 0%, rgba(10, 15, 26, 0.6) 100%);
  backdrop-filter: blur(8px);
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

/* ===== Filter Pills ===== */
.d-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.d-pill {
  padding: 6px 13px; border-radius: var(--d-radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.06); background: rgba(27, 58, 92, 0.18);
  color: var(--d-text-secondary); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.3s cubic-bezier(0.4,0,0.2,1);
  font-family: inherit; position: relative; overflow: hidden;
  backdrop-filter: blur(8px);
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
  background: rgba(13, 21, 38, 0.5);
  backdrop-filter: blur(8px);
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
  background: linear-gradient(165deg, rgba(22, 34, 58, 0.85) 0%, rgba(17, 27, 47, 0.6) 100%);
  backdrop-filter: blur(16px) saturate(1.2);
  -webkit-backdrop-filter: blur(16px) saturate(1.2);
  border: 1px solid rgba(255, 255, 255, 0.07);
  transition: all 0.4s cubic-bezier(0.4,0,0.2,1);
  animation: fadeSlideUp 0.45s ease-out both;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.04);
}
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
}
.d-card-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
.d-rank-badge {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  color: white; padding: 2px 8px; border-radius: var(--d-radius-sm);
  font-size: 11px; font-weight: 700;
  box-shadow: 0 2px 8px rgba(197, 165, 90, 0.25);
  position: relative; overflow: hidden;
}
.d-rank-badge::after {
  content: '';
  position: absolute; top: 0; left: -30%; width: 30%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
  animation: statShine 3s ease-in-out infinite;
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
  background: linear-gradient(135deg, rgba(13, 21, 38, 0.65) 0%, rgba(10, 15, 26, 0.5) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
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
}
.d-stat-lbl {
  display: block; font-size: 9px; color: var(--d-text-muted);
  font-weight: 600; margin-top: 1px; letter-spacing: 0.5px;
}

/* News */
.d-news {
  background: linear-gradient(135deg, rgba(13, 21, 38, 0.5) 0%, rgba(10, 15, 26, 0.3) 100%);
  backdrop-filter: blur(4px);
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
  transition: all 0.3s cubic-bezier(0.4,0,0.2,1); font-family: inherit; letter-spacing: 0.5px;
  position: relative; overflow: hidden;
}
.d-draft-btn.can-draft {
  background: linear-gradient(135deg, #059669 0%, #047857 60%, #065f46 100%);
  background-size: 200% 200%;
  color: white;
  animation: draftBtnGlow 2s ease-in-out infinite, gradientShift 4s ease-in-out infinite;
  box-shadow: 0 4px 16px rgba(5,150,105,0.3);
}
.d-draft-btn.can-draft::before {
  content: '';
  position: absolute; top: 0; left: -40%; width: 40%; height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent);
  transition: left 0.5s ease;
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
.d-draft-btn.waiting {
  background: rgba(107,114,128,0.2);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(107,114,128,0.15);
  color: var(--d-text-muted);
  cursor: not-allowed;
}
.d-watch-btn {
  padding: 9px 12px; border-radius: var(--d-radius-md); border: none;
  background: rgba(27, 58, 92, 0.18);
  backdrop-filter: blur(8px);
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
  background: linear-gradient(165deg, rgba(27, 58, 92, 0.15) 0%, rgba(17, 27, 47, 0.1) 100%);
  backdrop-filter: blur(8px);
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
  font-size: 22px; font-weight: 700;
  background: linear-gradient(135deg, var(--d-text) 0%, var(--d-accent-light, #D4BB78) 100%);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
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

/* ===== Mobile Draft Banner (visible only on small screens) ===== */
.d-mobile-banner {
  display: none;
}
@media (max-width: 768px) {
  .d-mobile-banner {
    display: flex; align-items: center; gap: 12px;
    position: sticky; top: 0; z-index: 100;
    background: linear-gradient(135deg, rgba(17,27,47,0.96) 0%, rgba(10,15,26,0.98) 100%);
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    border-bottom: 1px solid rgba(255,255,255,0.08);
    padding: 10px 14px;
  }
  .d-mobile-timer {
    flex-shrink: 0; width: 48px; height: 48px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%;
    font-size: 16px; font-weight: 800; font-family: 'Inter', monospace;
    color: #fff;
  }
  .d-mobile-timer.safe  { background: linear-gradient(135deg,#10b981,#059669); }
  .d-mobile-timer.warn  { background: linear-gradient(135deg,#f59e0b,#d97706); }
  .d-mobile-timer.danger{ background: linear-gradient(135deg,#ef4444,#dc2626); animation: timerWarn 0.6s ease-in-out infinite; }
  .d-mobile-timer.paused{ background: rgba(245,158,11,0.25); color: #f59e0b; font-size: 20px; }
  .d-mobile-pick-info { flex: 1; min-width: 0; }
  .d-mobile-pick-team {
    font-size: 14px; font-weight: 700; color: #f1f5f9;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .d-mobile-pick-team.my-turn { color: #10b981; }
  .d-mobile-pick-detail {
    font-size: 11px; color: var(--d-text-muted); margin-top: 1px;
  }
}

/* ===== Responsive ===== */
@media (max-width: 1200px) {
  .d-layout { grid-template-columns: 280px 1fr; }
}
@media (max-width: 768px) {
  .d-layout { grid-template-columns: 1fr; }
  .d-side-l { display: none; }
  .d-controls { flex-direction: column; align-items: stretch; }
  .d-pills { overflow-x: auto; flex-wrap: nowrap; padding-bottom: 4px; }
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
}
.d-announce {
  position: relative; width: 440px; max-width: 92vw;
  background: linear-gradient(165deg, rgba(22, 34, 58, 0.95) 0%, rgba(10, 15, 26, 0.97) 100%);
  backdrop-filter: blur(32px) saturate(1.5);
  -webkit-backdrop-filter: blur(32px) saturate(1.5);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--d-radius-xl);
  overflow: hidden;
  animation: announceIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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
  background: linear-gradient(135deg, rgba(13, 21, 38, 0.65) 0%, rgba(10, 15, 26, 0.5) 100%);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: var(--d-radius-md);
}
.d-announce-stat-val {
  font-size: 16px; font-weight: 700; display: block; line-height: 1.2;
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
  animation: announceIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
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

/* ===== Commissioner Controls ===== */
.d-comm-controls {
  background: linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.04) 100%);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(139,92,246,0.15);
  border-radius: var(--d-radius-md);
  padding: 12px;
  margin-bottom: 14px;
  position: relative;
  overflow: hidden;
}
.d-comm-controls::before {
  content: '';
  position: absolute; inset: 0;
  background: radial-gradient(ellipse at 0% 0%, rgba(139,92,246,0.06) 0%, transparent 60%);
  pointer-events: none;
}
.d-comm-title {
  font-size: 10px; font-weight: 700; letter-spacing: 1.5px;
  text-transform: uppercase; color: #a78bfa;
  margin-bottom: 8px;
}
.d-comm-btn {
  display: block; width: 100%;
  padding: 8px 12px; border-radius: var(--d-radius-sm);
  border: 1px solid rgba(139,92,246,0.25);
  background: rgba(139,92,246,0.1);
  color: #c4b5fd; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.2s;
  font-family: inherit; margin-bottom: 6px; text-align: left;
}
.d-comm-btn:hover {
  background: rgba(139,92,246,0.2);
  border-color: rgba(139,92,246,0.4);
}
.d-comm-btn:disabled {
  opacity: 0.5; cursor: not-allowed;
}
.d-comm-btn.danger {
  border-color: rgba(239,68,68,0.25);
  background: rgba(239,68,68,0.1);
  color: #fca5a5;
}
.d-comm-btn.danger:hover {
  background: rgba(239,68,68,0.2);
  border-color: rgba(239,68,68,0.4);
}
.d-comm-btn.success {
  border-color: rgba(16,185,129,0.25);
  background: rgba(16,185,129,0.1);
  color: #6ee7b7;
}
.d-comm-btn.success:hover {
  background: rgba(16,185,129,0.2);
  border-color: rgba(16,185,129,0.4);
}

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
  background: linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%);
  backdrop-filter: blur(4px);
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
  font-size: 10px; text-align: center;
  padding: 5px 4px;
  background: rgba(255,255,255,0.015);
  border: 1px solid rgba(255,255,255,0.03);
  min-height: 28px;
  display: flex; align-items: center; justify-content: center;
  color: var(--d-text-muted);
  transition: all 0.25s ease;
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
}

.bc-elig {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.bc-elig-badge {
  font-size: 7.5px;
  font-weight: 700;
  color: #fff;
  padding: 1px 3px;
  border-radius: 2px;
  opacity: 0.7;
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
}
`;

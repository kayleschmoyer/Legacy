import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  type DraftCompletedNotification,
  type DraftPausedNotification,
  type DraftPickNotification,
  type DraftResumedNotification,
  type DraftStartedNotification,
  useWebSocket,
} from '@legacy-sports/shared-components';
import {
  CommissionerPick as COMMISSIONER_PICK,
  GetAvailableDraftPlayers as GET_AVAILABLE_DRAFT_PLAYERS,
  GetCurrentDraftPick as GET_CURRENT_DRAFT_PICK,
  GetDraftPicks as GET_DRAFT_PICKS,
  GetDraftPlayerStats as GET_DRAFT_PLAYER_STATS,
  GetLeagueById as GET_LEAGUE_BY_ID,
  GetLiveDraftLeagueDraft as GET_LEAGUE_DRAFT,
  GetLeagueTeams as GET_LEAGUE_TEAMS,
  type GetAvailableDraftPlayersQuery,
  type GetAvailableDraftPlayersQueryVariables,
  type GetCurrentDraftPickQuery,
  type GetCurrentDraftPickQueryVariables,
  type GetDraftPicksQuery,
  type GetDraftPicksQueryVariables,
  InitializeLiveDraft as INITIALIZE_LIVE_DRAFT,
  MakeDraftPick as MAKE_DRAFT_PICK,
  PauseDraft as PAUSE_DRAFT,
  ResumeDraft as RESUME_DRAFT,
} from '../api/db/graphql.generated';

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DraftPlayer {
  id: number;
  name: string;
  position: string;
  avg: number;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
  games: number;
  hits: number;
  obp: number;
  slg: number;
}

interface AvailableDraftPlayer {
  id: number;
  firstName: string;
  lastName: string;
  brefId: string;
}

/** Stats lookup entry built from careerBattingStats connection */
interface PlayerStatsEntry {
  playerId: number;
  firstName: string;
  lastName: string;
  position: string;
  games: number;
  hits: number;
  hr: number;
  rbi: number;
  runs: number;
  sb: number;
  avg: number;
  obp: number;
  slg: number;
  war: number;
}

interface CurrentDraftPickInfo {
  draftId: number;
  teamId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  isComplete: boolean;
}

interface DraftPickRecord {
  id: string;
  draftId: number;
  round: number;
  pickNumber: number;
  overallPick: number;
  pickedAt: string;
  teamId: number;
  playerId: number;
}

interface LeagueTeam {
  id: string;
  name: string;
  leagueId: number;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const POSITION_COLORS: Record<string, string> = {
  C: '#ef4444',
  '1B': '#f97316',
  '2B': '#eab308',
  '3B': '#22c55e',
  SS: '#3b82f6',
  OF: '#8b5cf6',
  P: '#06b6d4',
  SP: '#06b6d4',
  RP: '#14b8a6',
  DH: '#ec4899',
};

const getPositionColor = (position: string): string =>
  POSITION_COLORS[position] || '#6b7280';

const normalizeTeamId = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

// ---------------------------------------------------------------------------
// CSS – comprehensive design system
// ---------------------------------------------------------------------------

const CSS = `
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

/* ===== Layout ===== */
.d-root {
  min-height: 100vh;
  background: var(--d-bg);
  color: var(--d-text);
  font-family: 'Playfair Display', 'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  position: relative;
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
  animation: 0.25s ease 0s 1 normal forwards running fadeSlideIn;
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
  height: 100vh;
}

/* ===== Sidebar ===== */
.d-side {
  background: var(--d-panel, rgba(17, 27, 47, 0.95));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  padding: 20px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.08) transparent;
}
.d-side::-webkit-scrollbar { width: 4px; }
.d-side::-webkit-scrollbar-track { background: transparent; }
.d-side::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 2px; }
.d-side-l { border-right: 1px solid var(--d-border); }

/* ===== Draft Status Card ===== */
.d-status {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  padding: 12px 14px;
  border-radius: var(--d-radius-md);
  margin-bottom: 16px;
  position: relative;
  overflow: hidden;
  display: flex; align-items: center; gap: 10px;
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
}
.d-timer-svg { filter: drop-shadow(0 4px 20px rgba(0,0,0,0.3)); }
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
  background: var(--d-card, #16223A);
  border: 1px solid var(--d-panel-border, var(--d-border));
  border-radius: var(--d-radius-lg);
  padding: 16px;
  margin-bottom: 14px;
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
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 5px; margin-bottom: 12px;
}
.d-roster-cell {
  background: var(--surfaceSubtle, rgba(13, 21, 38, 0.6));
  border: 1px solid var(--d-border);
  border-radius: var(--d-radius-sm);
  padding: 7px 5px; text-align: center; font-size: 11px;
  transition: background 0.2s, border-color 0.2s;
}
.d-roster-cell:hover {
  background: var(--d-surface-hover);
  border-color: var(--d-border-hover);
}
.d-roster-player {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px; background: var(--surfaceSubtle, rgba(13, 21, 38, 0.5));
  border: 1px solid var(--d-border); border-radius: var(--d-radius-sm);
  margin-bottom: 5px; transition: background 0.2s;
}
.d-roster-player:hover { background: var(--d-surface-hover); }

/* ===== Glass Button ===== */
.d-btn-glass {
  display: block; width: 100%;
  background: var(--surfaceInteractive, rgba(27, 58, 92, 0.22)); border: 1px solid var(--d-border);
  border-radius: var(--d-radius-md); padding: 11px 14px;
  color: var(--d-text); font-size: 13px; font-weight: 600;
  cursor: pointer; transition: all 0.2s; text-align: left;
  font-family: inherit; margin-bottom: 8px;
}
.d-btn-glass:hover {
  background: var(--d-surface-hover); border-color: var(--d-border-hover);
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
  background: var(--d-card, #16223A);
  backdrop-filter: blur(12px);
  border: 1px solid var(--d-panel-border, var(--d-border));
  padding: 12px 16px;
  border-radius: var(--d-radius-lg);
  margin-bottom: 18px;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
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
  border: 1px solid var(--d-border);
  background: var(--surfaceSubtle, rgba(13, 21, 38, 0.8));
  color: var(--d-text); font-size: 13px;
  outline: none; transition: border-color 0.2s, box-shadow 0.2s;
  font-family: inherit;
}
.d-search-input:focus {
  border-color: var(--d-accent);
  box-shadow: 0 0 0 3px var(--d-accent-dim);
}
.d-search-input::placeholder { color: var(--d-text-muted); }

/* ===== Filter Pills ===== */
.d-pills { display: flex; gap: 4px; flex-wrap: wrap; }
.d-pill {
  padding: 6px 13px; border-radius: var(--d-radius-pill);
  border: 1px solid transparent; background: var(--surfaceInteractive, rgba(27, 58, 92, 0.22));
  color: var(--d-text-secondary); font-size: 12px; font-weight: 600;
  cursor: pointer; transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
  font-family: inherit;
}
.d-pill:hover { background: var(--accentMuted, rgba(27, 58, 92, 0.30)); color: var(--d-text); }
.d-pill.active {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  color: white; box-shadow: 0 2px 12px rgba(197, 165, 90, 0.3);
}

/* ===== View Modes ===== */
.d-views {
  display: flex; gap: 2px;
  background: var(--surfaceSubtle, rgba(13, 21, 38, 0.6)); border-radius: var(--d-radius-sm); padding: 2px;
}
.d-view-btn {
  padding: 6px 10px; border-radius: 6px; border: none;
  background: transparent; color: var(--d-text-muted);
  font-size: 14px; cursor: pointer; transition: all 0.2s;
  font-family: inherit; line-height: 1;
}
.d-view-btn:hover { color: var(--d-text); }
.d-view-btn.active { background: rgba(197, 165, 90, 0.18); color: var(--d-accent); }

/* ===== Player Grid ===== */
.d-player-grid { display: grid; gap: 14px; }

/* ===== Player Card ===== */
.d-card {
  position: relative; border-radius: var(--d-radius-lg); overflow: hidden;
  background: linear-gradient(165deg, var(--d-card, rgba(22, 34, 58, 0.9)) 0%, var(--d-panel, rgba(17, 27, 47, 0.7)) 100%);
  border: 1px solid var(--d-border);
  transition: all 0.35s cubic-bezier(0.4,0,0.2,1);
  animation: fadeSlideUp 0.45s ease-out both;
}
.d-card:hover {
  transform: translateY(-3px);
  border-color: var(--d-border-hover);
  box-shadow:
    0 16px 48px rgba(0,0,0,0.35),
    0 0 0 1px rgba(255,255,255,0.04);
}
.d-card-accent {
  position: absolute; left: 0; top: 0; bottom: 0; width: 3px;
}
.d-card-body { padding: 16px 16px 16px 20px; }
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
  color: white; padding: 2px 7px; border-radius: var(--d-radius-sm);
  font-size: 11px; font-weight: 700;
}
.d-pos-badge {
  padding: 2px 7px; border-radius: var(--d-radius-sm);
  font-size: 11px; font-weight: 700; color: white;
}
.d-trend { font-size: 15px; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3)); }

/* Stats strip */
.d-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 6px; background: var(--surfaceSubtle, rgba(13, 21, 38, 0.6));
  border-radius: var(--d-radius-md); padding: 10px; margin-bottom: 10px;
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
  background: var(--surfaceSubtle, rgba(13, 21, 38, 0.5)); padding: 8px 10px;
  border-radius: var(--d-radius-sm); margin-bottom: 12px;
  font-size: 11px; color: var(--d-text-secondary);
  font-style: italic; line-height: 1.4;
}

/* Card actions */
.d-card-actions { display: flex; gap: 6px; }
.d-draft-btn {
  flex: 1; padding: 9px 14px;
  border-radius: var(--d-radius-md); border: none;
  font-size: 12px; font-weight: 700; cursor: pointer;
  transition: all 0.25s; font-family: inherit; letter-spacing: 0.5px;
}
.d-draft-btn.can-draft {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  color: white; box-shadow: 0 4px 16px rgba(5,150,105,0.25);
}
.d-draft-btn.can-draft:hover {
  box-shadow: 0 6px 24px rgba(5,150,105,0.35);
  transform: translateY(-1px);
}
.d-draft-btn.waiting {
  background: rgba(107,114,128,0.25); color: var(--d-text-muted);
  cursor: not-allowed;
}
.d-watch-btn {
  padding: 9px 12px; border-radius: var(--d-radius-md); border: none;
  background: var(--surfaceInteractive, rgba(27, 58, 92, 0.22)); color: var(--d-text);
  font-size: 15px; cursor: pointer; transition: all 0.2s;
  min-width: 42px; display: flex; align-items: center; justify-content: center;
}
.d-watch-btn:hover { background: var(--accentMuted, rgba(27, 58, 92, 0.30)); }
.d-watch-btn.active {
  background: linear-gradient(135deg, var(--d-warning) 0%, #d97706 100%);
  color: white;
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
  background: var(--d-surface); border: 1px solid var(--d-border);
  border-radius: var(--d-radius-lg); padding: 20px;
  animation: fadeSlideUp 0.5s ease-out both;
}
.d-skel-line {
  background: linear-gradient(90deg,
    rgba(255,255,255,0.025) 25%,
    rgba(255,255,255,0.055) 50%,
    rgba(255,255,255,0.025) 75%);
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
  filter: drop-shadow(0 4px 12px rgba(0,0,0,0.3));
}
.d-state-title { font-size: 22px; font-weight: 700; }
.d-state-desc {
  font-size: 14px; color: var(--d-text-secondary);
  max-width: 380px; line-height: 1.5;
}
.d-state-btn {
  background: linear-gradient(135deg, var(--d-accent) 0%, var(--d-accent-dark, #A68B3E) 100%);
  border: none; padding: 12px 28px; border-radius: var(--d-radius-md);
  color: white; font-size: 14px; font-weight: 700;
  cursor: pointer; transition: all 0.25s; font-family: inherit;
  box-shadow: 0 4px 16px rgba(197, 165, 90, 0.25);
}
.d-state-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(197, 165, 90, 0.35);
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
  background: linear-gradient(165deg, var(--d-card, rgba(22, 34, 58, 0.97)) 0%, var(--d-bg, rgba(10, 15, 26, 0.98)) 100%);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: var(--d-radius-xl);
  overflow: hidden;
  animation: announceIn 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  box-shadow: 0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05);
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
  padding: 10px 18px; background: var(--surfaceSubtle, rgba(13, 21, 38, 0.6));
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
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  animation: fadeSlideUp 0.3s ease-out;
}
.d-paused-card {
  background: linear-gradient(165deg, var(--d-card, rgba(22, 34, 58, 0.98)) 0%, var(--d-bg, rgba(10, 15, 26, 0.99)) 100%);
  border: 1px solid rgba(245,158,11,0.3);
  border-radius: var(--d-radius-xl);
  padding: 40px 48px;
  text-align: center;
  box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 60px rgba(245,158,11,0.1);
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
  background: linear-gradient(135deg, rgba(139,92,246,0.08) 0%, rgba(59,130,246,0.06) 100%);
  border: 1px solid rgba(139,92,246,0.2);
  border-radius: var(--d-radius-md);
  padding: 12px;
  margin-bottom: 14px;
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
  padding: 8px 6px; background: rgba(255,255,255,0.04);
  border-radius: var(--d-radius-sm) var(--d-radius-sm) 0 0;
  color: var(--d-text-secondary); letter-spacing: 0.5px;
  border-bottom: 2px solid var(--d-border);
}
.d-draft-grid-header.on-clock {
  background: rgba(197, 165, 90, 0.12);
  color: var(--d-accent);
  border-bottom-color: var(--d-accent);
}
.d-draft-grid-cell {
  font-size: 10px; text-align: center;
  padding: 5px 4px;
  background: rgba(255,255,255,0.015);
  border: 1px solid rgba(255,255,255,0.03);
  min-height: 28px;
  display: flex; align-items: center; justify-content: center;
  color: var(--d-text-muted);
  transition: background 0.2s;
}
.d-draft-grid-cell.filled {
  background: rgba(255,255,255,0.04);
  color: var(--d-text);
  font-weight: 600;
}
.d-draft-grid-cell.current {
  background: rgba(197, 165, 90, 0.1);
  border-color: rgba(197, 165, 90, 0.3);
  animation: pickPulse 2s ease-in-out infinite;
}

/* ===== Toast Notifications ===== */
.d-toast {
  position: fixed; bottom: 20px; right: 20px; z-index: 2000;
  max-width: 480px; padding: 10px 14px; border-radius: 10px;
  font-size: 13px; font-weight: 600;
  animation: fadeSlideUp 0.3s ease-out;
}
.d-toast.error {
  border: 1px solid rgba(239,68,68,0.35);
  background: rgba(127,29,29,0.92);
  color: #fecaca;
}
.d-toast.warning {
  border: 1px solid rgba(245,158,11,0.35);
  background: rgba(120,53,15,0.92);
  color: #fde68a;
}
.d-toast.info {
  border: 1px solid rgba(59,130,246,0.35);
  background: rgba(30,58,138,0.92);
  color: #bfdbfe;
}

/* ===== Screen Reader ===== */
.sr-only {
  position: absolute; width: 1px; height: 1px; padding: 0;
  margin: -1px; overflow: hidden; clip: rect(0,0,0,0);
  white-space: nowrap; border-width: 0;
}
`;

// ---------------------------------------------------------------------------
// Circular Timer Sub-component
// ---------------------------------------------------------------------------

const TIMER_RADIUS = 50;
const TIMER_CIRCUMFERENCE = 2 * Math.PI * TIMER_RADIUS;
const MAX_TIME = 90;

function CircularTimer({
  seconds,
  isMyPick,
}: {
  seconds: number;
  isMyPick: boolean;
}) {
  const progress = seconds / MAX_TIME;
  const offset = TIMER_CIRCUMFERENCE * (1 - progress);
  const stroke =
    seconds <= 10
      ? 'url(#timerDanger)'
      : seconds <= 30
        ? 'url(#timerWarn)'
        : 'url(#timerSafe)';
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div className={`d-timer-wrap${seconds <= 10 ? ' warn' : ''}`}>
      <svg
        viewBox="0 0 120 120"
        width="140"
        height="140"
        className="d-timer-svg"
        role="timer"
        aria-label={
          isMyPick ? 'Your pick timer' : 'Waiting for other teams timer'
        }
      >
        <defs>
          <linearGradient id="timerSafe" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#059669" />
          </linearGradient>
          <linearGradient id="timerWarn" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d97706" />
          </linearGradient>
          <linearGradient id="timerDanger" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#dc2626" />
          </linearGradient>
        </defs>
        <circle className="d-timer-track" cx="60" cy="60" r={TIMER_RADIUS} />
        <circle
          className="d-timer-fill"
          cx="60"
          cy="60"
          r={TIMER_RADIUS}
          stroke={stroke}
          strokeDasharray={TIMER_CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
        />
        <text className="d-timer-text" x="60" y="56">
          {mins}:{secs.toString().padStart(2, '0')}
        </text>
        <text className="d-timer-label" x="60" y="74">
          {isMyPick ? 'YOUR PICK' : 'WAITING'}
        </text>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pick Announcement Sub-component
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = [
  '#C5A55A',
  '#22C55E',
  '#3B82F6',
  '#F59E0B',
  '#8b5cf6',
  '#C41E3A',
  '#1B3A5C',
  '#D4BB78',
];

function PickAnnouncement({
  player,
  pickNumber,
  isMyPick,
  isAuto,
  leaving,
  onDismiss,
}: {
  player: DraftPlayer;
  pickNumber: number;
  isMyPick: boolean;
  isAuto: boolean;
  leaving: boolean;
  onDismiss: () => void;
}) {
  const posColor = getPositionColor(player.position);
  const labelClass = isAuto ? 'auto-pick' : isMyPick ? 'my-pick' : 'opp-pick';
  const labelText = isAuto
    ? '⏱ AUTO-DRAFTED'
    : isMyPick
      ? '🎉 YOUR PICK'
      : '📋 OPPONENT PICK';

  return (
    <div
      className={`d-announce-overlay${leaving ? ' leaving' : ''}`}
      onClick={onDismiss}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={`d-announce${leaving ? ' leaving' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Confetti */}
        <div className="d-confetti">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="d-confetti-bit"
              style={{
                left: `${4 + Math.random() * 92}%`,
                background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${Math.random() * 0.6}s`,
                animationDuration: `${1.4 + Math.random() * 1}s`,
                width: 4 + Math.random() * 4,
                height: 4 + Math.random() * 4,
                borderRadius: Math.random() > 0.5 ? '50%' : '1px',
                transform: `rotate(${Math.random() * 360}deg)`,
              }}
            />
          ))}
        </div>

        {/* Top accent bar */}
        <div
          className="d-announce-accent"
          style={{
            background: `linear-gradient(90deg, ${posColor}, ${posColor}88, ${posColor})`,
          }}
        />
        <div className="d-announce-shine" />

        <div className="d-announce-body">
          <span className={`d-announce-label ${labelClass}`}>{labelText}</span>
          <div className="d-announce-pick">
            Pick #{pickNumber} &middot; Round {Math.ceil(pickNumber / 12)}
          </div>
          <div className="d-announce-name">{player.name}</div>
          <div className="d-announce-details">
            <span className="d-announce-pos" style={{ background: posColor }}>
              {player.position}
            </span>
            <span className="d-announce-team">
              {player.games} G &middot; {player.hits} H
            </span>
          </div>
          <div className="d-announce-stats">
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#10b981' }}
              >
                {player.avg.toFixed(3)}
              </span>
              <span className="d-announce-stat-lbl">AVG</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#f59e0b' }}
              >
                {player.hr}
              </span>
              <span className="d-announce-stat-lbl">HR</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#3b82f6' }}
              >
                {player.rbi}
              </span>
              <span className="d-announce-stat-lbl">RBI</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <span
                className="d-announce-stat-val"
                style={{ color: '#8b5cf6' }}
              >
                {player.sb}
              </span>
              <span className="d-announce-stat-lbl">SB</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Player Card Sub-component
// ---------------------------------------------------------------------------

function PlayerCard({
  player,
  index,
  isMyPick,
  isWatched,
  onDraft,
  onToggleWatch,
}: {
  player: DraftPlayer;
  index: number;
  isMyPick: boolean;
  isWatched: boolean;
  onDraft: () => void;
  onToggleWatch: () => void;
}) {
  const posColor = getPositionColor(player.position);

  return (
    <div
      className="d-card"
      style={{ animationDelay: `${index * 0.04}s` }}
      role="group"
      aria-labelledby={`pn-${player.id}`}
    >
      <div className="d-card-accent" style={{ background: posColor }} />
      <div className="d-card-body">
        {/* Header */}
        <div className="d-card-header">
          <div>
            <h3 className="d-card-name" id={`pn-${player.id}`}>
              {player.name}
            </h3>
            <div className="d-card-meta">
              {player.games > 0
                ? `${player.games} G · ${player.hits} H`
                : 'Career stats pending'}
            </div>
          </div>
          <div className="d-card-badges">
            <span className="d-pos-badge" style={{ background: posColor }}>
              {player.position}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="d-stats">
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#10b981' }}>
              {player.avg.toFixed(3)}
            </span>
            <span className="d-stat-lbl">AVG</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#f59e0b' }}>
              {player.hr}
            </span>
            <span className="d-stat-lbl">HR</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#3b82f6' }}>
              {player.rbi}
            </span>
            <span className="d-stat-lbl">RBI</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#8b5cf6' }}>
              {player.sb}
            </span>
            <span className="d-stat-lbl">SB</span>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="d-stats" style={{ marginTop: 4 }}>
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#06b6d4' }}>
              {player.obp.toFixed(3)}
            </span>
            <span className="d-stat-lbl">OBP</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#ec4899' }}>
              {player.slg.toFixed(3)}
            </span>
            <span className="d-stat-lbl">SLG</span>
          </div>
          <div className="d-stat">
            <span className="d-stat-val" style={{ color: '#f97316' }}>
              {player.runs}
            </span>
            <span className="d-stat-lbl">R</span>
          </div>
        </div>

        {/* Actions */}
        <div className="d-card-actions">
          <button
            className={`d-draft-btn ${isMyPick ? 'can-draft' : 'waiting'}`}
            onClick={onDraft}
            disabled={!isMyPick}
            aria-disabled={!isMyPick}
            aria-label={
              isMyPick
                ? `Draft ${player.name} now`
                : `Waiting for your turn to draft ${player.name}`
            }
          >
            {isMyPick ? '⚡ DRAFT NOW' : '⏳ WAITING'}
          </button>
          <button
            className={`d-watch-btn ${isWatched ? 'active' : ''}`}
            onClick={onToggleWatch}
            aria-pressed={isWatched}
            aria-label={
              isWatched
                ? `Remove ${player.name} from watchlist`
                : `Add ${player.name} to watchlist`
            }
          >
            {isWatched ? '★' : '☆'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton Card (loading)
// ---------------------------------------------------------------------------

function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div className="d-skel-card" style={{ animationDelay: `${delay}s` }}>
      <div
        className="d-skel-line"
        style={{ width: '55%', height: 18, marginBottom: 8 }}
      />
      <div
        className="d-skel-line"
        style={{ width: '35%', height: 13, marginBottom: 16 }}
      />
      <div
        className="d-skel-line"
        style={{ width: '100%', height: 54, marginBottom: 10 }}
      />
      <div
        className="d-skel-line"
        style={{ width: '100%', height: 30, marginBottom: 10 }}
      />
      <div className="d-skel-line" style={{ width: '100%', height: 36 }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Draft Grid Sub-component (team columns view)
// ---------------------------------------------------------------------------

function DraftGrid({
  teams,
  picks,
  currentPickInfo,
  myTeamId,
  statsLookup,
  maxRounds,
}: {
  teams: LeagueTeam[];
  picks: DraftPickRecord[];
  currentPickInfo: CurrentDraftPickInfo | null;
  myTeamId: number | null;
  statsLookup: Map<number, DraftPlayer>;
  maxRounds: number;
}) {
  // Build a grid: rows = rounds, cols = teams
  const pickGrid = useMemo(() => {
    const grid: Record<string, DraftPickRecord | null> = {};
    for (const pick of picks) {
      const key = `${pick.round}-${pick.teamId}`;
      grid[key] = pick;
    }
    return grid;
  }, [picks]);

  const rounds = Array.from({ length: maxRounds }, (_, i) => i + 1);
  const currentTeamId = normalizeTeamId(currentPickInfo?.teamId);

  return (
    <div className="d-draft-grid-view">
      <div
        className="d-draft-grid-table"
        style={{
          gridTemplateColumns: `60px repeat(${teams.length}, minmax(100px, 1fr))`,
        }}
      >
        {/* Header row */}
        <div
          className="d-draft-grid-header"
          style={{ background: 'transparent' }}
        >
          Round
        </div>
        {teams.map((team) => (
          <div
            key={team.id}
            className={`d-draft-grid-header${
              currentTeamId !== null &&
              String(team.id) === String(currentTeamId)
                ? ' on-clock'
                : ''
            }`}
            style={
              String(team.id) === String(myTeamId)
                ? { borderBottomColor: '#10b981' }
                : undefined
            }
          >
            {team.name}
            {String(team.id) === String(myTeamId) && (
              <span style={{ fontSize: 8, display: 'block', color: '#10b981' }}>
                YOU
              </span>
            )}
          </div>
        ))}

        {/* Round rows */}
        {rounds.map((round) => (
          <React.Fragment key={round}>
            <div
              className="d-draft-grid-cell"
              style={{
                fontWeight: 700,
                color: 'var(--d-text-secondary)',
                fontSize: 11,
              }}
            >
              R{round}
            </div>
            {teams.map((team) => {
              const key = `${round}-${team.id}`;
              const pick = pickGrid[key];
              const isCurrent =
                currentPickInfo &&
                currentPickInfo.round === round &&
                currentTeamId !== null &&
                String(team.id) === String(currentTeamId);

              if (pick) {
                const player = statsLookup.get(pick.playerId);
                const playerName = player ? player.name : `#${pick.playerId}`;
                return (
                  <div
                    key={team.id}
                    className="d-draft-grid-cell filled"
                    title={`Pick #${pick.overallPick}: ${playerName}`}
                    style={
                      pick.teamId === myTeamId
                        ? { borderColor: 'rgba(16,185,129,0.2)' }
                        : undefined
                    }
                  >
                    <span style={{ fontSize: 10 }}>{playerName}</span>
                  </div>
                );
              }

              return (
                <div
                  key={team.id}
                  className={`d-draft-grid-cell${isCurrent ? ' current' : ''}`}
                >
                  {isCurrent ? '🎯' : '—'}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

// ===========================================================================
// Main Component
// ===========================================================================

export function EliteDraftBoardScreen(): React.JSX.Element {
  // ---- Routing ----
  const { id: leagueIdParam } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const leagueId = leagueIdParam ? parseInt(leagueIdParam, 10) : null;

  // ---- UI State ----
  const [selectedPosition, setSelectedPosition] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<
    'grid' | 'list' | 'compact' | 'board'
  >('grid');
  const [watchlist, setWatchlist] = useState<number[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [draftComplete, setDraftComplete] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [draftPaused, setDraftPaused] = useState(false);
  const [commPickMode, setCommPickMode] = useState(false);
  const [toastMessage, setToastMessage] = useState<{
    text: string;
    type: 'error' | 'warning' | 'info';
  } | null>(null);

  // Pick announcement
  const [announcement, setAnnouncement] = useState<{
    player: DraftPlayer | AvailableDraftPlayer;
    pickNumber: number;
    isMyPick: boolean;
    isAuto: boolean;
  } | null>(null);
  const [announcementLeaving, setAnnouncementLeaving] = useState(false);
  const announcementTimerRef = React.useRef<
    ReturnType<typeof setTimeout> | undefined
  >(undefined);

  const showAnnouncement = useCallback(
    (
      player: DraftPlayer | AvailableDraftPlayer,
      pickNumber: number,
      myPick: boolean,
      auto: boolean,
    ) => {
      if (announcementTimerRef.current)
        clearTimeout(announcementTimerRef.current);
      setAnnouncementLeaving(false);
      setAnnouncement({ player, pickNumber, isMyPick: myPick, isAuto: auto });
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

  // Screen reader live regions
  const [liveMessage, setLiveMessage] = useState('');
  const [urgentMessage, setUrgentMessage] = useState('');

  // Toast auto-dismiss
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const showToast = useCallback(
    (text: string, type: 'error' | 'warning' | 'info' = 'error') => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setToastMessage({ text, type });
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
      }, 5000);
    },
    [],
  );

  const positions = ['ALL', 'C', '1B', '2B', '3B', 'SS', 'OF', 'P'];
  const viewModes: Array<'grid' | 'list' | 'compact' | 'board'> = [
    'grid',
    'list',
    'compact',
    'board',
  ];

  // ---- Auth ----
  const token = useMemo(() => {
    try {
      return typeof localStorage !== 'undefined'
        ? localStorage.getItem('auth_jwt')
        : null;
    } catch {
      return null;
    }
  }, []);

  // ---- League Data ----
  const {
    data: leagueData,
    loading: leagueLoading,
    refetch: refetchLeague,
  } = useQuery(GET_LEAGUE_BY_ID, {
    variables: { id: leagueId },
    skip: !leagueId,
  });

  const { data: teamsData } = useQuery(GET_LEAGUE_TEAMS, {
    variables: { leagueId },
    skip: !leagueId,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const league = (leagueData as any)?.league;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueTeams: LeagueTeam[] = (teamsData as any)?.leagueTeams ?? [];
  const permLevel = league?.userMembership?.permissionLevel as
    | string
    | undefined;
  const isOwner =
    permLevel === 'owner' ||
    permLevel === 'commissioner' ||
    permLevel === 'general_manager';
  const myTeamId = normalizeTeamId(league?.userMembership?.teamId);

  // Helper: resolve team name from leagueTeams by numeric ID
  const teamNameById = useCallback(
    (teamId: number | null | undefined): string => {
      if (teamId == null) return 'Unknown Team';
      const t = leagueTeams.find((lt) => String(lt.id) === String(teamId));
      return t?.name ?? `Team #${teamId}`;
    },
    [leagueTeams],
  );

  // ---- Draft Data ----
  const {
    data: draftData,
    error: draftError,
    refetch: refetchDraft,
  } = useQuery(GET_LEAGUE_DRAFT, {
    variables: { leagueId },
    skip: !leagueId,
    errorPolicy: 'all',
  });

  // Derive draftId directly from the league query (keyed off leagueId in the URL)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const leagueDraft = (draftData as any)?.getLeagueDraft;
  const draftId: number | null = leagueDraft?.id
    ? Number(leagueDraft.id)
    : null;

  // Log draft errors (debug logging removed for production)
  useEffect(() => {
    if (draftError) console.error('[Draft] getLeagueDraft error:', draftError);
  }, [draftError]);

  // Mark draft complete when server data indicates it
  useEffect(() => {
    if (leagueDraft?.draftCompletedAt) {
      setDraftComplete(true);
    }
  }, [leagueDraft?.draftCompletedAt]);

  // Detect paused status from league data
  useEffect(() => {
    if (league?.draftStatus === 'paused') {
      setDraftPaused(true);
    } else if (league?.draftStatus === 'in-progress') {
      setDraftPaused(false);
    }
  }, [league?.draftStatus]);

  // ---- Current Pick ----
  const [draftOrderMissing, setDraftOrderMissing] = useState(false);
  const {
    data: currentPickData,
    error: currentPickError,
    refetch: refetchCurrentPick,
  } = useQuery<GetCurrentDraftPickQuery, GetCurrentDraftPickQueryVariables>(
    GET_CURRENT_DRAFT_PICK,
    {
      variables: { draftId: draftId ?? 0 },
      skip: !draftId,
      pollInterval: !draftId || draftOrderMissing ? 0 : 5000, // Poll every 5s as a fallback to WebSocket
      errorPolicy: 'all',
    },
  );

  const currentPickInfo: CurrentDraftPickInfo | null =
    (currentPickData?.getCurrentDraftPick ??
      null) as unknown as CurrentDraftPickInfo | null;
  const currentPickTeamId = normalizeTeamId(currentPickInfo?.teamId);
  const isMyPick = Boolean(
    currentPickInfo &&
    currentPickTeamId !== null &&
    myTeamId !== null &&
    currentPickTeamId === myTeamId &&
    !currentPickInfo.isComplete,
  );

  const currentPickErrorMessage = currentPickError?.message ?? '';

  // Draft/pick diagnostics
  useEffect(() => {
    if (!currentPickErrorMessage) return;

    if (
      currentPickErrorMessage.includes('No teams configured for this draft')
    ) {
      setDraftOrderMissing(true);
      setInitError(
        'Draft order has not been generated yet. Re-start the live draft to assign teams to draft slots.',
      );
      setUrgentMessage('');
      return;
    }

    setDraftOrderMissing(false);
  }, [currentPickErrorMessage]);

  useEffect(() => {
    if (currentPickInfo) {
      setDraftOrderMissing(false);
      setInitError(null);
    }
  }, [currentPickInfo]);

  // ---- Pick History ----
  const { data: picksData, refetch: refetchPickHistory } = useQuery<
    GetDraftPicksQuery,
    GetDraftPicksQueryVariables
  >(GET_DRAFT_PICKS, {
    variables: { draftId: draftId ?? 0 },
    skip: !draftId,
  });

  const pickHistory: DraftPickRecord[] = (picksData?.getDraftPicks ??
    []) as unknown as DraftPickRecord[];

  // ---- Available Players (server-side search) ----
  const [playerSearch, setPlayerSearch] = useState('');
  const {
    data: availablePlayersData,
    loading: availablePlayersLoading,
    error: availablePlayersError,
    refetch: refetchAvailablePlayers,
  } = useQuery<
    GetAvailableDraftPlayersQuery,
    GetAvailableDraftPlayersQueryVariables
  >(GET_AVAILABLE_DRAFT_PLAYERS, {
    variables: {
      draftId: draftId ?? 0,
      search: playerSearch || null,
      limit: 200,
    },
    skip: !draftId,
    errorPolicy: 'all',
  });

  const availablePlayers: AvailableDraftPlayer[] = (
    availablePlayersData?.getAvailableDraftPlayers ?? []
  )
    .filter(
      (
        p,
      ): p is {
        id: number;
        firstName: string;
        lastName: string;
        brefId: string;
      } =>
        p.id != null &&
        p.firstName != null &&
        p.lastName != null &&
        p.brefId != null,
    )
    .map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      brefId: p.brefId,
    }));

  // ---- Career Batting Stats (uses existing careerBattingStats connection) ----
  const { data: statsData } = useQuery(GET_DRAFT_PLAYER_STATS, {
    variables: { first: 5000, minGames: 1 },
    errorPolicy: 'all',
  });

  // Build a playerId → stats map from the careerBattingStats connection
  const playerStatsMap = useMemo(() => {
    const map = new Map<number, PlayerStatsEntry>();
    const edges = (statsData as Record<string, unknown>)?.careerBattingStats as
      | { edges?: Array<{ node?: Record<string, unknown> } | null> | null }
      | undefined;
    if (!edges?.edges) return map;
    for (const edge of edges.edges) {
      if (!edge?.node) continue;
      const n = edge.node;
      const pid = n.playerId as number | null | undefined;
      if (pid == null) continue;
      const playerObj = n.player as
        | { id?: number; firstName?: string; lastName?: string }
        | null
        | undefined;
      map.set(pid, {
        playerId: pid,
        firstName: (playerObj?.firstName as string) ?? '',
        lastName: (playerObj?.lastName as string) ?? '',
        position: (n.primaryPosition as string) ?? 'UTIL',
        games: (n.games as number) ?? 0,
        hits: (n.hits as number) ?? 0,
        hr: (n.homeRuns as number) ?? 0,
        rbi: (n.rbi as number) ?? 0,
        runs: (n.runs as number) ?? 0,
        sb: (n.stolenBases as number) ?? 0,
        avg: (n.battingAverage as number) ?? 0,
        obp: (n.onBasePercentage as number) ?? 0,
        slg: (n.sluggingPercentage as number) ?? 0,
        war: (n.offensiveWAR as number) ?? 0,
      });
    }
    return map;
  }, [statsData]);

  // Debounced search for available players
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPlayerSearch(searchTerm.trim());
    }, 350);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [searchTerm]);

  // Build a lookup map by player ID for displaying player names in history/board.
  // Includes ALL players from stats (not just available), so drafted players
  // still appear with their real name instead of "Player #123".
  const statsLookup = useMemo(() => {
    const map = new Map<number, DraftPlayer>();
    // Seed from playerStatsMap (covers both drafted and available players)
    for (const [pid, s] of playerStatsMap) {
      map.set(pid, {
        id: pid,
        name: `${s.firstName} ${s.lastName}`.trim() || `Player #${pid}`,
        position: s.position,
        avg: s.avg,
        hr: s.hr,
        rbi: s.rbi,
        runs: s.runs,
        sb: s.sb,
        games: s.games,
        hits: s.hits,
        obp: s.obp,
        slg: s.slg,
      });
    }
    // Override with available players (which have authoritative firstName/lastName)
    for (const ap of availablePlayers) {
      const s = playerStatsMap.get(ap.id);
      map.set(ap.id, {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: s?.position ?? 'UTIL',
        avg: s?.avg ?? 0,
        hr: s?.hr ?? 0,
        rbi: s?.rbi ?? 0,
        runs: s?.runs ?? 0,
        sb: s?.sb ?? 0,
        games: s?.games ?? 0,
        hits: s?.hits ?? 0,
        obp: s?.obp ?? 0,
        slg: s?.slg ?? 0,
      });
    }
    return map;
  }, [availablePlayers, playerStatsMap]);

  // Merge available players with stats data for rich card display
  const enrichedPlayers: DraftPlayer[] = useMemo(() => {
    return availablePlayers.map((ap) => {
      const s = playerStatsMap.get(ap.id);
      return {
        id: ap.id,
        name: `${ap.firstName} ${ap.lastName}`.trim(),
        position: s?.position ?? 'UTIL',
        avg: s?.avg ?? 0,
        hr: s?.hr ?? 0,
        rbi: s?.rbi ?? 0,
        runs: s?.runs ?? 0,
        sb: s?.sb ?? 0,
        games: s?.games ?? 0,
        hits: s?.hits ?? 0,
        obp: s?.obp ?? 0,
        slg: s?.slg ?? 0,
      };
    });
  }, [availablePlayers, playerStatsMap]);

  // Apply client-side position filter
  const filteredPlayers = useMemo(
    () =>
      enrichedPlayers.filter((p) => {
        const posMatch =
          selectedPosition === 'ALL' || p.position === selectedPosition;
        return posMatch;
      }),
    [enrichedPlayers, selectedPosition],
  );

  // ---- Mutations ----
  const [initializeLiveDraft, { loading: initDraftLoading }] = useMutation(
    INITIALIZE_LIVE_DRAFT,
  );
  const [makeDraftPick, { loading: pickLoading }] =
    useMutation(MAKE_DRAFT_PICK);
  const [pauseDraftMutation, { loading: pauseLoading }] =
    useMutation(PAUSE_DRAFT);
  const [resumeDraftMutation, { loading: resumeLoading }] =
    useMutation(RESUME_DRAFT);
  const [commissionerPickMutation, { loading: commPickLoading }] =
    useMutation(COMMISSIONER_PICK);

  // ---- WebSocket ----
  const handleDraftStarted = useCallback(
    (notification: DraftStartedNotification) => {
      setLiveMessage('Draft has started!');
      void refetchDraft();
      void refetchCurrentPick({ draftId: notification.draftId });
    },
    [refetchDraft, refetchCurrentPick],
  );

  const handleDraftPickMade = useCallback(
    (notification: DraftPickNotification) => {
      const pickTeamId = normalizeTeamId(notification.teamId);
      const isMyTeamPick = pickTeamId !== null && pickTeamId === myTeamId;
      // Find the player in our list for announcements
      const pickedPlayer = enrichedPlayers.find(
        (p) => p.id === notification.playerId,
      );
      if (pickedPlayer) {
        showAnnouncement(
          pickedPlayer,
          notification.overallPick,
          isMyTeamPick,
          false,
        );
      }
      setLiveMessage(
        `Pick #${notification.overallPick}: Round ${notification.round}, Pick ${notification.pickNumber}`,
      );

      // Use nextPick info from notification if available
      if (notification.nextPick) {
        const nextTeamIdRaw = notification.nextPick.teamId;
        const nextTeamId = normalizeTeamId(
          typeof nextTeamIdRaw === 'number'
            ? nextTeamIdRaw
            : Number(nextTeamIdRaw),
        );
        if (nextTeamId !== null && nextTeamId === myTeamId) {
          showToast('🎯 Your turn to pick!', 'info');
        }
      } else if (!notification.nextPick) {
        // No nextPick means draft may be complete
        setDraftComplete(true);
      }

      void refetchCurrentPick({ draftId: notification.draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
    },
    [
      myTeamId,
      enrichedPlayers,
      showAnnouncement,
      showToast,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
    ],
  );

  const handleDraftCompleted = useCallback(
    (_notification: DraftCompletedNotification) => {
      setDraftComplete(true);
      setDraftPaused(false);
      setLiveMessage('Draft is complete!');
      void refetchLeague();
    },
    [refetchLeague],
  );

  const handleDraftPaused = useCallback(
    (notification?: DraftPausedNotification) => {
      setDraftPaused(true);
      setLiveMessage(
        notification?.pausedAt
          ? `Draft paused at ${new Date(notification.pausedAt).toLocaleTimeString()}`
          : 'Draft has been paused by the commissioner.',
      );
      showToast('⏸️ Draft paused by commissioner', 'warning');
    },
    [showToast],
  );

  const handleDraftResumed = useCallback(
    (notification?: DraftResumedNotification) => {
      setDraftPaused(false);
      setLiveMessage(
        notification?.resumedAt
          ? `Draft resumed at ${new Date(notification.resumedAt).toLocaleTimeString()}`
          : 'Draft has been resumed!',
      );
      showToast('▶️ Draft resumed!', 'info');
      if (draftId) void refetchCurrentPick({ draftId });
    },
    [draftId, showToast, refetchCurrentPick],
  );

  const { connected: wsConnected } = useWebSocket({
    leagueId: leagueId ?? undefined,
    token: token ?? undefined,
    viewContext: 'league',
    autoConnect: !!leagueId && !!token,
    onDraftStarted: handleDraftStarted,
    onDraftPickMade: handleDraftPickMade,
    onDraftCompleted: handleDraftCompleted,
    onDraftPaused: handleDraftPaused,
    onDraftResumed: handleDraftResumed,
  });

  // ---- WebSocket reconnection recovery (docs §8) ----
  // When WS reconnects after a disconnect, refetch critical state to
  // reconcile any picks/events missed while disconnected.
  const wsWasConnected = useRef(false);
  useEffect(() => {
    if (wsConnected && wsWasConnected.current && draftId) {
      // Reconnected — reconcile missed events
      void refetchCurrentPick({ draftId });
      void refetchPickHistory();
      void refetchAvailablePlayers();
      void refetchDraft();
    }
    wsWasConnected.current = wsConnected;
  }, [
    wsConnected,
    draftId,
    refetchCurrentPick,
    refetchPickHistory,
    refetchAvailablePlayers,
    refetchDraft,
  ]);

  // ---- Draft Actions ----
  const handleInitializeDraft = useCallback(
    async (
      draftOrder: 'snake' | 'linear' = 'snake',
      draftMode: 'live' | 'automated' = 'live',
      selectionMethod: 'standard' | 'auction' | 'random' = 'standard',
    ) => {
      if (!leagueId) return;
      setInitError(null);
      try {
        const result = await initializeLiveDraft({
          variables: { leagueId, draftOrder, draftMode, selectionMethod },
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = (result.data as any)?.initializeDraft;
        if (draft?.id) {
          const newDraftId = Number(draft.id);
          setDraftOrderMissing(false);
          setInitError(null);
          void refetchDraft();
          void refetchLeague();
          void refetchCurrentPick({ draftId: newDraftId });
        }
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Failed to initialize draft';
        setInitError(msg);
      }
    },
    [
      leagueId,
      initializeLiveDraft,
      refetchDraft,
      refetchLeague,
      refetchCurrentPick,
    ],
  );

  const handleMakePick = useCallback(
    async (playerId: number, isAutoPick = false) => {
      if (!draftId || !isMyPick || pickLoading || draftPaused) return;
      try {
        setUrgentMessage('');
        await makeDraftPick({
          variables: { draftId, playerId },
        });
        // WebSocket event will handle UI updates for all clients
        void refetchCurrentPick({ draftId });
        void refetchPickHistory();
        void refetchAvailablePlayers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to make pick';
        // Handle specific error cases per the integration guide
        if (msg.includes('Player has already been drafted')) {
          showToast('Player already drafted — refreshing list', 'warning');
          void refetchAvailablePlayers();
        } else if (
          msg.includes('not your turn') ||
          msg.includes('Not authorized')
        ) {
          showToast('Not your turn to pick', 'warning');
          void refetchCurrentPick({ draftId });
        } else if (msg.includes('paused')) {
          showToast('Draft is currently paused', 'warning');
          setDraftPaused(true);
        } else if (msg.includes('not in progress')) {
          showToast('Draft is not in progress', 'error');
          void refetchLeague();
        } else if (
          msg.includes('roster is full') ||
          msg.includes('Team roster is full')
        ) {
          showToast('Your roster is full!', 'error');
        } else if (msg.includes('player pool')) {
          showToast('Player is not in the allowed player pool', 'warning');
          void refetchAvailablePlayers();
        } else {
          setUrgentMessage(
            isAutoPick
              ? `Auto-pick failed: ${msg}`
              : `Draft pick failed: ${msg}`,
          );
        }
      }
    },
    [
      draftId,
      isMyPick,
      pickLoading,
      draftPaused,
      makeDraftPick,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchLeague,
      showToast,
    ],
  );

  // ---- Pause/Resume Draft ----
  const handlePauseDraft = useCallback(async () => {
    if (!leagueId || pauseLoading) return;
    try {
      await pauseDraftMutation({ variables: { leagueId } });
      setDraftPaused(true);
      void refetchLeague();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pause draft';
      showToast(msg, 'error');
    }
  }, [leagueId, pauseLoading, pauseDraftMutation, refetchLeague, showToast]);

  const handleResumeDraft = useCallback(async () => {
    if (!leagueId || resumeLoading) return;
    try {
      await resumeDraftMutation({ variables: { leagueId } });
      setDraftPaused(false);
      void refetchLeague();
      if (draftId) void refetchCurrentPick({ draftId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to resume draft';
      showToast(msg, 'error');
    }
  }, [
    leagueId,
    draftId,
    resumeLoading,
    resumeDraftMutation,
    refetchLeague,
    refetchCurrentPick,
    showToast,
  ]);

  // ---- Commissioner Pick ----
  const handleCommissionerPick = useCallback(
    async (playerId: number) => {
      if (!draftId || commPickLoading) return;
      try {
        await commissionerPickMutation({
          variables: { draftId, playerId },
        });
        setCommPickMode(false);
        void refetchCurrentPick({ draftId });
        void refetchPickHistory();
        void refetchAvailablePlayers();
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : 'Commissioner pick failed';
        if (msg.includes('Player has already been drafted')) {
          showToast('Player already drafted — refreshing list', 'warning');
          void refetchAvailablePlayers();
        } else {
          showToast(msg, 'error');
        }
      }
    },
    [
      draftId,
      commPickLoading,
      commissionerPickMutation,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      showToast,
    ],
  );

  // ---- Timer (client-side countdown for UX, not authoritative) ----
  const [timeRemaining, setTimeRemaining] = useState(MAX_TIME);
  useEffect(() => {
    // Reset timer when the current pick changes
    setTimeRemaining(MAX_TIME);
  }, [
    currentPickInfo?.overallPick,
    currentPickInfo?.teamId,
    draftOrderMissing,
  ]);

  useEffect(() => {
    if (
      !draftId ||
      draftComplete ||
      draftOrderMissing ||
      draftPaused ||
      !currentPickInfo ||
      currentPickInfo.isComplete
    ) {
      return;
    }
    const timer = setInterval(() => {
      setTimeRemaining((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [draftId, draftComplete, draftOrderMissing, currentPickInfo, draftPaused]);

  const autoPickAttemptRef = useRef<number | null>(null);
  useEffect(() => {
    autoPickAttemptRef.current = null;
  }, [currentPickInfo?.overallPick]);

  useEffect(() => {
    if (!draftId || !isMyPick || draftComplete || draftPaused || pickLoading)
      return;
    if (timeRemaining > 0) return;

    const pickNumber = currentPickInfo?.overallPick ?? null;
    if (pickNumber === null || autoPickAttemptRef.current === pickNumber)
      return;

    const topAvailablePlayer = enrichedPlayers[0];
    if (!topAvailablePlayer) {
      setUrgentMessage('Auto-pick failed: no available players for this turn.');
      autoPickAttemptRef.current = pickNumber;
      return;
    }

    autoPickAttemptRef.current = pickNumber;
    void handleMakePick(topAvailablePlayer.id, true);
  }, [
    draftId,
    isMyPick,
    draftComplete,
    draftPaused,
    pickLoading,
    timeRemaining,
    currentPickInfo?.overallPick,
    enrichedPlayers,
    handleMakePick,
  ]);

  // ---- A11y announcements ----
  useEffect(() => {
    if (currentPickInfo) {
      if (isMyPick) {
        setLiveMessage(
          `It's your turn to pick! Round ${currentPickInfo.round}, Pick ${currentPickInfo.pickNumber}.`,
        );
      } else {
        setLiveMessage(
          `Waiting for ${teamNameById(currentPickTeamId)} to pick.`,
        );
      }
    } else if (draftOrderMissing) {
      setLiveMessage(
        'Draft order is still being prepared. Waiting for the commissioner to start the pick order.',
      );
    }
  }, [
    currentPickInfo,
    isMyPick,
    draftOrderMissing,
    currentPickTeamId,
    teamNameById,
  ]);

  // =========================================================================
  // Render helpers
  // =========================================================================

  const round =
    currentPickInfo?.round ??
    Math.ceil(
      (currentPickInfo?.overallPick ?? 1) / Math.max(leagueTeams.length, 1),
    );
  const currentPick = currentPickInfo?.overallPick ?? pickHistory.length + 1;

  const gridCols =
    viewMode === 'grid' ? 'repeat(auto-fill, minmax(320px, 1fr))' : '1fr';

  // My team picks from history
  const myTeamPicks = useMemo(
    () => pickHistory.filter((p) => p.teamId === myTeamId),
    [pickHistory, myTeamId],
  );

  // My drafted players mapped to DraftPlayer for roster display
  const myTeam: DraftPlayer[] = useMemo(
    () =>
      myTeamPicks.map((pick) => {
        const player = statsLookup.get(pick.playerId);
        if (player) return player;
        return {
          id: pick.playerId,
          name: `Player #${pick.playerId}`,
          position: 'UTIL',
          avg: 0,
          hr: 0,
          rbi: 0,
          runs: 0,
          sb: 0,
          games: 0,
          hits: 0,
          obp: 0,
          slg: 0,
        };
      }),
    [myTeamPicks, statsLookup],
  );

  // =========================================================================
  // No leagueId — show prompt
  // =========================================================================

  if (!leagueId) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="baseball">
              ⚾
            </span>
          </div>
          <div className="d-state-title">Live Draft Board</div>
          <div className="d-state-desc">
            Navigate to a league and start a live draft from the commissioner
            panel.
          </div>
          <button className="d-state-btn" onClick={() => navigate('/baseball')}>
            Go to Leagues
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Loading
  // =========================================================================

  if (
    (leagueLoading || availablePlayersLoading) &&
    !availablePlayersData &&
    !leagueData
  ) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-skeleton-wrap">
          <div style={{ marginBottom: 28, textAlign: 'center' }}>
            <div
              style={{
                width: 48,
                height: 48,
                border: '3px solid rgba(197, 165, 90, 0.2)',
                borderTopColor: '#C5A55A',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 16px',
              }}
            />
            <div
              style={{
                fontSize: 15,
                fontWeight: 500,
                color: 'var(--d-text-secondary)',
              }}
            >
              Loading draft board...
            </div>
          </div>
          <div className="d-skeleton-grid">
            {Array.from({ length: 9 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 0.08} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Error
  // =========================================================================

  if (availablePlayersError) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="warning">
              ⚠️
            </span>
          </div>
          <div className="d-state-title">Failed to Load Players</div>
          <div className="d-state-desc">
            {availablePlayersError.message ||
              'An error occurred while fetching player data.'}
          </div>
          <button
            className="d-state-btn"
            onClick={() => {
              void refetchAvailablePlayers();
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Draft Complete
  // =========================================================================

  if (draftComplete || currentPickInfo?.isComplete) {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="trophy">
              🏆
            </span>
          </div>
          <div className="d-state-title">Draft Complete!</div>
          <div className="d-state-desc">
            All {pickHistory.length} picks have been made. Your roster is set!
          </div>
          {myTeam.length > 0 && (
            <div style={{ maxWidth: 400, width: '100%', marginTop: 16 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  marginBottom: 12,
                  color: 'var(--d-accent)',
                  letterSpacing: 1,
                  textTransform: 'uppercase',
                }}
              >
                Your Roster ({myTeam.length} players)
              </div>
              {myTeam.map((p) => (
                <div key={p.id} className="d-roster-player">
                  <div>
                    <div
                      style={{ fontWeight: 600, fontSize: 13, color: '#fff' }}
                    >
                      {p.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--d-text-muted)' }}>
                      {p.position}
                    </div>
                  </div>
                  <span
                    style={{
                      background: getPositionColor(p.position),
                      padding: '2px 6px',
                      borderRadius: 5,
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                    }}
                  >
                    {p.position}
                  </span>
                </div>
              ))}
            </div>
          )}
          <button
            className="d-state-btn"
            onClick={() => navigate(`/baseball/league/${leagueId}`)}
          >
            Back to League
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Pre-Draft Lobby (draft not started yet)
  // =========================================================================

  const draftStatus = league?.draftStatus;

  if (!draftId && draftStatus !== 'in-progress') {
    return (
      <div className="d-root">
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center">
          <div className="d-state-icon">
            <span role="img" aria-label="baseball">
              ⚾
            </span>
          </div>
          <div className="d-state-title">
            {league?.name ? `${league.name} — Live Draft` : 'Live Draft Lobby'}
          </div>
          <div className="d-state-desc">
            {leagueTeams.length < 2
              ? 'At least 2 teams are required to start a draft. Invite more teams to your league.'
              : isOwner
                ? 'As the commissioner, you can start the live draft when all teams are ready.'
                : 'Waiting for the commissioner to start the live draft.'}
          </div>

          {/* Team list */}
          {leagueTeams.length > 0 && (
            <div style={{ maxWidth: 320, width: '100%', marginTop: 8 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  color: 'var(--d-text-secondary)',
                  marginBottom: 8,
                }}
              >
                Teams ({leagueTeams.length})
              </div>
              {leagueTeams.map((team) => (
                <div
                  key={team.id}
                  style={{
                    padding: '8px 12px',
                    background: 'var(--d-surface)',
                    border: '1px solid var(--d-border)',
                    borderRadius: 8,
                    marginBottom: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    color:
                      String(team.id) === String(myTeamId)
                        ? 'var(--d-accent)'
                        : 'var(--d-text)',
                  }}
                >
                  {team.name}{' '}
                  {String(team.id) === String(myTeamId) ? '(You)' : ''}
                </div>
              ))}
            </div>
          )}

          {/* Error */}
          {initError && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: 'rgba(239,68,68,0.12)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: 8,
                color: '#ef4444',
                fontSize: 13,
                maxWidth: 400,
              }}
            >
              {initError}
            </div>
          )}

          {/* Start Draft button (owner only) */}
          {isOwner && leagueTeams.length >= 2 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                className="d-state-btn"
                onClick={() => {
                  void handleInitializeDraft('snake');
                }}
                disabled={initDraftLoading}
                style={{ opacity: initDraftLoading ? 0.6 : 1 }}
              >
                {initDraftLoading ? '⏳ Starting...' : '🐍 Start Snake Draft'}
              </button>
              <button
                className="d-state-btn"
                onClick={() => {
                  void handleInitializeDraft('linear');
                }}
                disabled={initDraftLoading}
                style={{
                  opacity: initDraftLoading ? 0.6 : 1,
                  background:
                    'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                }}
              >
                {initDraftLoading ? '⏳ Starting...' : '📋 Start Normal Draft'}
              </button>
            </div>
          )}

          {!isOwner && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 16px',
                background: 'rgba(59,130,246,0.1)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 8,
                color: '#60a5fa',
                fontSize: 13,
              }}
            >
              You'll be notified when the commissioner starts the draft.
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // Main Live Draft UI
  // =========================================================================

  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />

      <div className="d-layout">
        {/* ============================================================== */}
        {/* LEFT SIDEBAR                                                    */}
        {/* ============================================================== */}
        <aside
          className="d-side d-side-l"
          aria-label="My team and draft controls"
        >
          {/* Draft status */}
          <div
            className="d-status"
            style={
              draftPaused
                ? {
                    background:
                      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  }
                : undefined
            }
          >
            <span
              className="d-live-dot"
              style={
                draftPaused ? { animation: 'none', opacity: 0.5 } : undefined
              }
            />
            <div className="d-status-info">
              <div className="d-status-title">
                {draftPaused ? (
                  <>
                    <span role="img" aria-label="paused">
                      ⏸️
                    </span>{' '}
                    DRAFT PAUSED
                  </>
                ) : (
                  'LIVE DRAFT'
                )}
              </div>
              <div className="d-status-sub">
                Pick #{currentPick} &middot; Round {round}
              </div>
            </div>
          </div>

          {/* Timer */}
          {!draftPaused && (
            <CircularTimer seconds={timeRemaining} isMyPick={isMyPick} />
          )}
          {draftPaused && (
            <div
              style={{
                textAlign: 'center',
                padding: '16px 0',
                marginBottom: 20,
                color: '#f59e0b',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span role="img" aria-label="paused">
                ⏸️
              </span>{' '}
              Timer paused
            </div>
          )}

          {/* Commissioner Controls */}
          {isOwner && draftId && (
            <div className="d-comm-controls">
              <div className="d-comm-title">
                <span role="img" aria-label="crown">
                  👑
                </span>{' '}
                Commissioner
              </div>
              {!draftPaused ? (
                <button
                  className="d-comm-btn danger"
                  onClick={() => void handlePauseDraft()}
                  disabled={pauseLoading}
                >
                  {pauseLoading ? '⏳ Pausing...' : '⏸ Pause Draft'}
                </button>
              ) : (
                <button
                  className="d-comm-btn success"
                  onClick={() => void handleResumeDraft()}
                  disabled={resumeLoading}
                >
                  {resumeLoading ? '⏳ Resuming...' : '▶ Resume Draft'}
                </button>
              )}
              <button
                className={`d-comm-btn${commPickMode ? ' success' : ''}`}
                onClick={() => setCommPickMode(!commPickMode)}
                disabled={commPickLoading}
              >
                {commPickMode
                  ? '✓ Commissioner Pick ON'
                  : '👤 Commissioner Pick'}
              </button>
              {commPickMode && (
                <div
                  style={{
                    fontSize: 10,
                    color: '#a78bfa',
                    margin: '-2px 0 4px',
                    padding: '4px 8px',
                    background: 'rgba(139,92,246,0.08)',
                    borderRadius: 4,
                  }}
                >
                  Click any player&apos;s Draft button to pick on behalf of the
                  current team
                </div>
              )}
            </div>
          )}

          {/* Whose Turn */}
          {currentPickInfo ? (
            <div className="d-panel" style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  color: isMyPick
                    ? 'var(--d-success)'
                    : 'var(--d-text-secondary)',
                }}
              >
                {isMyPick ? '🎯 YOUR PICK' : '⏳ ON THE CLOCK'}
              </div>
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: isMyPick ? '#10b981' : '#f1f5f9',
                }}
              >
                {teamNameById(currentPickTeamId)}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--d-text-muted)',
                  marginTop: 4,
                }}
              >
                Round {currentPickInfo.round} &middot; Pick{' '}
                {currentPickInfo.pickNumber}
              </div>
              {/* Diagnostic — explains why button is or isn't active */}
              {myTeamId === null && (
                <div
                  style={{
                    marginTop: 8,
                    padding: '6px 10px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 6,
                    fontSize: 11,
                    color: '#f87171',
                    lineHeight: 1.4,
                  }}
                >
                  <span role="img" aria-label="Warning">
                    ⚠️
                  </span>{' '}
                  Your league membership has no team assigned. Commissioner Pick
                  can be used as a workaround.
                </div>
              )}
              {myTeamId !== null &&
                !isMyPick &&
                !currentPickInfo.isComplete && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 10,
                      color: 'var(--d-text-muted)',
                      lineHeight: 1.4,
                    }}
                  >
                    Your team ID: {myTeamId} &middot; On clock:{' '}
                    {currentPickTeamId}
                  </div>
                )}
            </div>
          ) : (
            <div className="d-panel" style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 6,
                  color: 'var(--d-warning)',
                }}
              >
                Draft Order Pending
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc' }}>
                Waiting for pick order setup
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--d-text-muted)',
                  marginTop: 6,
                }}
              >
                We can&apos;t determine whose turn it is yet.
              </div>
              {isOwner && pickHistory.length === 0 && (
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  <button
                    className="d-state-btn"
                    onClick={() => {
                      void handleInitializeDraft('snake');
                    }}
                    disabled={initDraftLoading}
                    style={{ opacity: initDraftLoading ? 0.6 : 1 }}
                  >
                    {initDraftLoading ? 'Starting...' : 'Generate Snake Order'}
                  </button>
                  <button
                    className="d-state-btn"
                    onClick={() => {
                      void handleInitializeDraft('linear');
                    }}
                    disabled={initDraftLoading}
                    style={{
                      opacity: initDraftLoading ? 0.6 : 1,
                      background:
                        'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      boxShadow: '0 4px 16px rgba(59,130,246,0.25)',
                    }}
                  >
                    {initDraftLoading ? 'Starting...' : 'Generate Linear Order'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* My Roster */}
          <div className="d-panel">
            <h3 className="d-panel-title a-orange" id="my-roster-heading">
              <span role="img" aria-label="trophy">
                🏆
              </span>{' '}
              MY ROSTER ({myTeam.length})
            </h3>

            {/* Position needs */}
            <div className="d-roster-grid">
              {['C', '1B', '2B', '3B', 'SS', 'OF'].map((pos) => {
                const count = myTeam.filter((p) => p.position === pos).length;
                return (
                  <div className="d-roster-cell" key={pos}>
                    <span
                      style={{
                        display: 'inline-block',
                        background: getPositionColor(pos),
                        borderRadius: 4,
                        padding: '1px 5px',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#fff',
                        marginBottom: 3,
                      }}
                    >
                      {pos}
                    </span>
                    <div
                      style={{
                        fontWeight: 600,
                        color: count > 0 ? '#10b981' : 'var(--d-text-muted)',
                      }}
                    >
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Drafted list */}
            {myTeam.length > 0 ? (
              <div
                role="region"
                aria-labelledby="my-roster-heading"
                style={{ maxHeight: 260, overflowY: 'auto' }}
              >
                <div role="list">
                  {myTeam.map((p) => (
                    <div className="d-roster-player" role="listitem" key={p.id}>
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 13,
                            color: '#fff',
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: 'var(--d-text-muted)',
                          }}
                        >
                          {p.position} &middot; {p.games} G
                        </div>
                      </div>
                      <span
                        style={{
                          background: getPositionColor(p.position),
                          padding: '2px 6px',
                          borderRadius: 5,
                          fontSize: 10,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {p.position}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div
                style={{
                  textAlign: 'center',
                  padding: '24px 12px',
                  color: 'var(--d-text-muted)',
                  fontSize: 13,
                }}
              >
                Draft players to build your roster
              </div>
            )}
          </div>

          {/* Pick History */}
          {pickHistory.length > 0 && (
            <div className="d-panel">
              <h3 className="d-panel-title a-green" id="pick-history-heading">
                <span role="img" aria-label="clipboard">
                  📋
                </span>{' '}
                PICK HISTORY ({pickHistory.length})
              </h3>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {pickHistory
                  .slice()
                  .reverse()
                  .map((pick) => {
                    const player = statsLookup.get(pick.playerId);
                    return (
                      <div
                        key={pick.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 8px',
                          fontSize: 11,
                          borderBottom: '1px solid var(--d-border)',
                          color:
                            pick.teamId === myTeamId
                              ? '#10b981'
                              : 'var(--d-text-secondary)',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          #{pick.overallPick} —{' '}
                          {player?.name ?? `Player #${pick.playerId}`}
                        </span>
                        <span
                          style={{ color: 'var(--d-text-muted)', fontSize: 10 }}
                        >
                          {teamNameById(pick.teamId)}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Actions */}
          <button
            className="d-btn-glass"
            onClick={() => setChatOpen(!chatOpen)}
            aria-pressed={chatOpen}
            aria-label={`League chat ${chatOpen ? 'open' : 'closed'}`}
          >
            <span role="img" aria-label="chat">
              💬
            </span>
            &ensp;League Chat
          </button>
          <button
            className="d-btn-glass"
            onClick={() => {
              void refetchAvailablePlayers();
              if (draftId) void refetchCurrentPick({ draftId });
              void refetchPickHistory();
              void refetchLeague();
            }}
          >
            <span role="img" aria-label="refresh">
              🔄
            </span>
            &ensp;Refresh
          </button>
        </aside>

        {/* ============================================================== */}
        {/* CENTER – PLAYER BOARD                                          */}
        {/* ============================================================== */}
        <div className="d-main" role="main" aria-label="Player draft board">
          {/* Controls */}
          <div className="d-controls">
            {/* Search */}
            <div className="d-search-wrap">
              <svg
                className="d-search-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                className="d-search-input"
                type="text"
                placeholder="Search available players..."
                aria-label="Search players"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {availablePlayersLoading && (
                <span
                  style={{
                    position: 'absolute',
                    right: 12,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    display: 'inline-block',
                    width: 14,
                    height: 14,
                    border: '2px solid rgba(197, 165, 90, 0.2)',
                    borderTopColor: 'var(--d-accent)',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
              )}
            </div>

            {/* Position filters */}
            <div
              className="d-pills"
              role="radiogroup"
              aria-label="Filter by position"
              onKeyDown={(e) => {
                const idx = positions.indexOf(selectedPosition);
                let next = idx;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  next = (idx + 1) % positions.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  next = (idx - 1 + positions.length) % positions.length;
                } else if (e.key === 'Home') {
                  e.preventDefault();
                  next = 0;
                } else if (e.key === 'End') {
                  e.preventDefault();
                  next = positions.length - 1;
                }
                if (next !== idx) {
                  setSelectedPosition(positions[next]);
                  // Move focus to the newly selected radio button
                  const container = e.currentTarget;
                  const buttons =
                    container.querySelectorAll<HTMLButtonElement>(
                      '[role="radio"]',
                    );
                  buttons[next]?.focus();
                }
              }}
            >
              {positions.map((pos) => (
                <button
                  key={pos}
                  className={`d-pill${selectedPosition === pos ? ' active' : ''}`}
                  onClick={() => setSelectedPosition(pos)}
                  role="radio"
                  aria-checked={selectedPosition === pos}
                  tabIndex={selectedPosition === pos ? 0 : -1}
                >
                  {pos}
                </button>
              ))}
            </div>

            {/* View mode */}
            <div className="d-views" role="radiogroup" aria-label="View mode">
              {viewModes.map((mode) => (
                <button
                  key={mode}
                  className={`d-view-btn${viewMode === mode ? ' active' : ''}`}
                  onClick={() => setViewMode(mode)}
                  role="radio"
                  aria-checked={viewMode === mode}
                >
                  {mode === 'grid'
                    ? '⊞'
                    : mode === 'list'
                      ? '☰'
                      : mode === 'compact'
                        ? '⋯'
                        : '▦'}
                </button>
              ))}
            </div>
          </div>

          {/* Board View (Team Columns) */}
          {viewMode === 'board' && (
            <DraftGrid
              teams={leagueTeams}
              picks={pickHistory}
              currentPickInfo={currentPickInfo}
              myTeamId={myTeamId}
              statsLookup={statsLookup}
              maxRounds={
                leagueTeams.length > 0
                  ? Math.max(
                      Math.ceil(
                        (pickHistory.length + leagueTeams.length) /
                          leagueTeams.length,
                      ),
                      currentPickInfo?.round ?? 1,
                      ...pickHistory.map((p) => p.round),
                      20,
                    )
                  : 20
              }
            />
          )}

          {/* Player Grid */}
          {viewMode !== 'board' && (
            <div
              className="d-player-grid"
              style={{ gridTemplateColumns: gridCols }}
            >
              {filteredPlayers.map((player, idx) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  index={idx}
                  isMyPick={commPickMode ? isOwner : isMyPick}
                  isWatched={watchlist.includes(player.id)}
                  onDraft={() => {
                    if (commPickMode && isOwner) {
                      void handleCommissionerPick(player.id);
                    } else {
                      void handleMakePick(player.id);
                    }
                  }}
                  onToggleWatch={() =>
                    setWatchlist((prev) =>
                      prev.includes(player.id)
                        ? prev.filter((id) => id !== player.id)
                        : [...prev, player.id],
                    )
                  }
                />
              ))}

              {filteredPlayers.length === 0 && !availablePlayersLoading && (
                <div
                  style={{
                    gridColumn: '1 / -1',
                    textAlign: 'center',
                    padding: '60px 20px',
                    color: 'var(--d-text-muted)',
                  }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>
                    <span role="img" aria-label="search">
                      🔍
                    </span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>
                    No players found
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>
                    {searchTerm
                      ? 'Try a different search term'
                      : 'All available players have been drafted'}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Paused Overlay */}
      {draftPaused && !isOwner && (
        <div className="d-paused-overlay" role="alert" aria-live="assertive">
          <div className="d-paused-card">
            <div className="d-paused-icon">
              <span role="img" aria-label="paused">
                ⏸️
              </span>
            </div>
            <div className="d-paused-title">DRAFT PAUSED</div>
            <div className="d-paused-desc">
              The commissioner has paused the draft. You&apos;ll be notified
              when it resumes.
            </div>
          </div>
        </div>
      )}

      {/* Pick Announcement */}
      {announcement && 'name' in announcement.player && (
        <PickAnnouncement
          player={announcement.player}
          pickNumber={announcement.pickNumber}
          isMyPick={announcement.isMyPick}
          isAuto={announcement.isAuto}
          leaving={announcementLeaving}
          onDismiss={() => {
            if (announcementTimerRef.current)
              clearTimeout(announcementTimerRef.current);
            setAnnouncementLeaving(true);
            setTimeout(() => {
              setAnnouncement(null);
              setAnnouncementLeaving(false);
            }, 400);
          }}
        />
      )}

      {/* Toast notifications */}
      {toastMessage && (
        <div
          className={`d-toast ${toastMessage.type}`}
          role="alert"
          aria-live="assertive"
          onClick={() => setToastMessage(null)}
        >
          {toastMessage.text}
        </div>
      )}

      {urgentMessage && !toastMessage && (
        <div className="d-toast error" role="alert" aria-live="assertive">
          {urgentMessage}
        </div>
      )}

      {/* Screen reader announcements */}
      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>
      <div className="sr-only" aria-live="assertive">
        {urgentMessage}
      </div>
    </div>
  );
}

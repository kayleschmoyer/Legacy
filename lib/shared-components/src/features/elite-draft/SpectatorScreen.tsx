import React, { useCallback, useEffect } from 'react';
import { Sport } from '@legacy-sports/graphql';
import { CSS } from './styles';
import { CircularTimer } from './CircularTimer';
import { DraftGrid } from './DraftGrid';
import { DraftCompleteView } from './DraftCompleteView';
import {
  LeagueErrorScreen,
  LoadingScreen,
  NoLeagueScreen,
} from './DraftStateScreens';
import { preloadYouTubeIframeApi } from './PickSplashHighlightVideo';
import { SpectatorDepthChart } from './SpectatorDepthChart';
import { type SplashPick, SplashQueue } from './SplashQueue';
import { getDraftCommentary } from './draftUtils';
import { getPositionColor } from './utils';
import { useSpectatorScreenState } from './hooks';
import { useScreenWakeLock } from '../../hooks/useScreenWakeLock';
import type { SportKind } from '../../config/sports';
import { hasErrorCode } from '../../utils/graphql-errors';

/** Pre-draft lobby icon per sport — mirrors PreDraftLobby.tsx's LOBBY_CHROME. */
const LOBBY_ICON: Record<SportKind, { emoji: string; label: string }> = {
  baseball: { emoji: '⚾', label: 'baseball' },
  football: { emoji: '🏈', label: 'football' },
};

// ---------------------------------------------------------------------------
// SpectatorScreen (web) — read-only, big-screen-first live draft view
// (LS-8942). No interactive draft controls of any kind: no search, no queue,
// no draft buttons, no commissioner tools, no chat, and no mutations
// (including nudgeExpiredDraftPick — the clock waits at 0:00 for the server).
//
// Renders its own DOM/CSS tree rather than Tamagui (LS-9056): the broadcast
// visual language (glow pulses, shimmer sweeps, gradient bg-fx, keyframe
// animations — see styles.ts) is built on DOM-only CSS that Tamagui/React
// Native has no equivalent for, mirroring the identical, pre-existing split
// on EliteDraftBoardScreen.tsx/.native.tsx for the same feature area. All
// non-render wiring (draft data, WebSocket, timer, splash queue, derived
// pick/round state) lives in the shared `useSpectatorScreenState` hook so
// only the genuinely platform-divergent rendering is duplicated.
// ---------------------------------------------------------------------------

/**
 * Minimum rounds the web board grid renders, matching the member room's
 * DraftGrid floor (DraftPlayerBoard.tsx board view). This is a visual floor,
 * not a cap — the Math.max below always extends past it for deeper drafts.
 * The native screen intentionally differs: its compact DraftMiniBoard sizes
 * via resolveBoardRounds (MIN_BOARD_ROUNDS) because phone screens can't fit
 * a 20-row grid.
 */
const MIN_GRID_ROUNDS = 20;

export interface SpectatorScreenProps {
  /** League ID to watch. */
  leagueId: number | null;
  /** Navigation callback (replaces react-router useNavigate). */
  onNavigate: (path: string) => void;
  /** WebSocket URL for live draft updates. */
  websocketUrl: string;
  /** Optional auth token for the draft WebSocket. */
  token?: string;
  /** Active sport for this league. */
  sport?: SportKind;
  /** Hold duration per pick splash — prop-tunable, defaults to ~8s. */
  minSplashMs?: number;
}

/** "This draft is private" — shown to signed-in non-members of a private
 *  league. Deliberately leaks no league details. */
function PrivateDraftScreen({
  onNavigate,
}: {
  onNavigate: (path: string) => void;
}): React.JSX.Element {
  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-state-center">
        <div className="d-state-icon">
          <span role="img" aria-label="lock">
            🔒
          </span>
        </div>
        <div className="d-state-title">This draft is private</div>
        <div className="d-state-desc">
          Only league members can watch this draft.
        </div>
        <button className="d-state-btn" onClick={() => onNavigate('/')}>
          Back to Home
        </button>
      </div>
    </div>
  );
}

export function SpectatorScreen({
  leagueId,
  onNavigate,
  websocketUrl,
  token,
  sport: sportOverride,
  minSplashMs,
}: SpectatorScreenProps): React.JSX.Element {
  const {
    data,
    draftComplete,
    draftPaused,
    pickDeadline,
    liveMessage,
    splash,
    timeRemaining,
    round,
    currentPick,
    onClockTeamName,
    recentPicks,
    pickTimeLimitSeconds,
  } = useSpectatorScreenState({ leagueId, websocketUrl, token, minSplashMs });

  useEffect(() => {
    preloadYouTubeIframeApi();
  }, []);
  // The watch screen is meant to sit on a TV/monitor — never let it sleep.
  useScreenWakeLock(true);

  // The league itself is the source of truth for the spectator's sport, same
  // as EliteDraftBoardScreen — neither web nor native route passes a `sport`
  // prop, so before this every league watched here rendered baseball
  // position colors/copy even when `league.sport === 'football'` (LS-9684).
  // The explicit prop still wins when a caller supplies one.
  const sport: SportKind =
    sportOverride ??
    (data.league?.sport === Sport.Football ? 'football' : 'baseball');

  const commentaryFor = useCallback((pick: SplashPick) => {
    if (!('name' in pick.player)) return undefined;
    return getDraftCommentary(pick.player, pick.round, false, pick.isAuto);
  }, []);

  // ---- Early returns for special states ----
  if (!leagueId) return <NoLeagueScreen onNavigate={onNavigate} />;

  if (data.leagueLoading && !data.leagueData) {
    return <LoadingScreen />;
  }

  // Private league + non-member: the league (or draft) query comes back
  // FORBIDDEN. Spectator access to public leagues was opened in LS-8939.
  if (
    hasErrorCode(data.leagueError, 'FORBIDDEN') ||
    hasErrorCode(data.draftError, 'FORBIDDEN')
  ) {
    return <PrivateDraftScreen onNavigate={onNavigate} />;
  }

  if (!data.leagueLoading && !data.league) {
    return (
      <LeagueErrorScreen
        isUnauthorized={hasErrorCode(data.leagueError, 'UNAUTHENTICATED')}
        onNavigate={onNavigate}
      />
    );
  }

  // Draft complete — final-board celebration state.
  if (
    draftComplete ||
    data.leagueDraft?.draftCompletedAt ||
    data.currentPickInfo?.isComplete
  ) {
    return (
      <DraftCompleteView
        draftSummary={
          data.league ? { name: data.league.name ?? undefined } : null
        }
        leagueId={leagueId}
        sport={sport}
        pickHistory={data.pickHistory}
        myTeamId={null}
        myTeam={[]}
        myTeamPicks={[]}
        leagueTeams={data.leagueTeams}
        statsLookup={data.statsLookup}
        onNavigate={onNavigate}
      />
    );
  }

  // Pre-draft countdown/lobby (not started or scheduled).
  if (
    data.league?.draftStatus !== 'in-progress' &&
    data.league?.draftStatus !== 'paused'
  ) {
    const scheduledAt = data.leagueDraft?.scheduledAt
      ? new Date(data.leagueDraft.scheduledAt)
      : null;
    return (
      <div className="d-root" data-sport={sport}>
        <style>{CSS}</style>
        <div className="d-bg-fx" />
        <div className="d-state-center" data-testid="spectator-lobby">
          <div className="d-state-icon">
            <span role="img" aria-label={LOBBY_ICON[sport].label}>
              {LOBBY_ICON[sport].emoji}
            </span>
          </div>
          <div className="d-state-title">
            {data.league?.name ?? 'Draft Day'}
          </div>
          <div className="d-state-desc">
            {scheduledAt
              ? `Draft scheduled for ${scheduledAt.toLocaleString()}`
              : 'The draft has not started yet. Hang tight — the board goes live the moment the first clock starts.'}
          </div>
          {data.boardOrderedTeams.length > 0 && (
            <ol className="d-spec-lobby-order">
              {data.boardOrderedTeams.map((team) => (
                <li key={team.id}>{team.name}</li>
              ))}
            </ol>
          )}
        </div>
      </div>
    );
  }

  // ---- Main live spectator layout ----
  const maxRounds =
    data.leagueTeams.length > 0
      ? Math.max(
          Math.ceil(
            (data.pickHistory.length + data.leagueTeams.length) /
              data.leagueTeams.length,
          ),
          data.currentPickInfo?.round ?? 1,
          ...data.pickHistory.map((p) => p.round),
          MIN_GRID_ROUNDS,
        )
      : MIN_GRID_ROUNDS;

  return (
    <div className="d-root" data-sport={sport} data-testid="spectator-screen">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-spec-layout">
        {/* ---- Slim top band ---- */}
        <div className="d-spec-topband" data-testid="spectator-top-band">
          <div className="d-spec-league">
            <span
              className={`d-spec-live-dot${draftPaused ? ' paused' : ''}`}
              aria-hidden="true"
            />
            <span className="d-spec-league-name">{data.league?.name}</span>
            <span className="d-spec-live-label">
              {draftPaused ? 'PAUSED' : 'LIVE'}
            </span>
          </div>
          <div className="d-spec-pickinfo d-tnum">
            Pick #{currentPick} · Round {round}
          </div>
          <CircularTimer
            seconds={timeRemaining}
            isMyPick={false}
            pickTimeLimitSeconds={pickTimeLimitSeconds}
            hasDeadline={pickDeadline !== null && !draftPaused}
          />
          <div className="d-spec-onclock">
            <div className="d-eyebrow">On the clock</div>
            <div className="d-spec-onclock-team">{onClockTeamName}</div>
          </div>
        </div>

        {/* ---- Draft board (the star of the page) ---- */}
        <section className="d-spec-board">
          <DraftGrid
            teams={data.boardOrderedTeams}
            picks={data.pickHistory}
            currentPickInfo={data.currentPickInfo}
            myTeamId={null}
            statsLookup={data.statsLookup}
            maxRounds={maxRounds}
            sport={sport}
            draftOrder={data.leagueDraft?.draftOrder}
          />
        </section>

        {/* ---- On-the-clock rail ---- */}
        <aside className="d-spec-rail">
          <SpectatorDepthChart
            teamName={onClockTeamName}
            players={data.onClockTeamPlayers}
            leaguePositions={data.leaguePositions}
            sport={sport}
            maxRosterSize={data.league?.maxRosterSize ?? null}
          />
          <div className="d-rail-panel" data-testid="spectator-recent-picks">
            <div className="d-eyebrow">Recent picks</div>
            {recentPicks.length === 0 && (
              <div className="d-spec-recent-empty">No picks yet</div>
            )}
            {recentPicks.map((pick) => {
              const player = data.statsLookup.get(pick.playerId);
              const name = player
                ? player.name
                : pick.player
                  ? `${pick.player.firstName} ${pick.player.lastName}`.trim()
                  : `Player #${pick.playerId}`;
              const position = player?.position;
              return (
                <div className="d-spec-recent-row" key={pick.id}>
                  <span className="d-spec-recent-num d-tnum">
                    #{pick.overallPick}
                  </span>
                  {position && (
                    <span
                      className="d-spec-recent-pos"
                      style={{ color: getPositionColor(sport, position) }}
                    >
                      {position}
                    </span>
                  )}
                  <span className="d-spec-recent-name">{name}</span>
                  <span className="d-spec-recent-team">
                    {data.teamNameById(pick.teamId)}
                  </span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      {/* ---- Overlays ---- */}
      {draftPaused && (
        <div className="d-paused-overlay" role="alert" aria-live="assertive">
          <div className="d-paused-card">
            <div className="d-paused-icon">
              <span role="img" aria-label="paused">
                ⏸️
              </span>
            </div>
            <div className="d-paused-title">DRAFT PAUSED</div>
            <div className="d-paused-desc">
              The commissioner has paused the draft.
            </div>
          </div>
        </div>
      )}

      <SplashQueue
        active={splash.active}
        leaving={splash.leaving}
        pendingCount={splash.pendingCount}
        onDismiss={splash.dismiss}
        commentaryFor={commentaryFor}
        mlbPlayerIdFor={data.mlbPlayerIdFor}
        notablePlayFor={data.notablePlayFor}
        highlightVideoFor={data.highlightVideoFor}
      />

      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>
    </div>
  );
}

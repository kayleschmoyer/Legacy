import React, { useCallback, useRef, useState } from 'react';
import { CSS } from './styles';
import { CircularTimer } from './CircularTimer';
import { DraftGrid } from './DraftGrid';
import { DraftCompleteView } from './DraftCompleteView';
import {
  LeagueErrorScreen,
  LoadingScreen,
  NoLeagueScreen,
} from './DraftStateScreens';
import { SpectatorDepthChart } from './SpectatorDepthChart';
import { type SplashPick, SplashQueue, useSplashQueue } from './SplashQueue';
import { getDraftCommentary } from './draftUtils';
import { getPositionColor } from './utils';
import { DEFAULT_PICK_TIME } from './constants';
import {
  useDraftTimer,
  useDraftWebSocket,
  useSpectatorDraftData,
} from './hooks';
import type { AvailableDraftPlayer, DraftPlayer } from './types';
import { useAuth } from '../../features/auth';
import type { SportKind } from '../../config/sports';
import { hasErrorCode } from '../../utils/graphql-errors';

// ---------------------------------------------------------------------------
// SpectatorScreen (web) — read-only, big-screen-first live draft view
// (LS-8942). No interactive draft controls of any kind: no search, no queue,
// no draft buttons, no commissioner tools, no chat, and no mutations
// (including nudgeExpiredDraftPick — the clock waits at 0:00 for the server).
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
  sport = 'baseball',
  minSplashMs,
}: SpectatorScreenProps): React.JSX.Element {
  const { user, token: authToken } = useAuth();
  const isAuthenticated = !!user;

  const data = useSpectatorDraftData({ leagueId });

  // ---- Read-only realtime state (slim replacement for useDraftUIState) ----
  const [draftComplete, setDraftComplete] = useState(false);
  const [draftPaused, setDraftPaused] = useState(false);
  const [pickDeadline, setPickDeadline] = useState<Date | null>(null);
  const [pickTimeLimitSeconds, setPickTimeLimitSeconds] =
    useState(DEFAULT_PICK_TIME);
  const [liveMessage, setLiveMessage] = useState('');
  const notifiedPicksRef = useRef<Set<number>>(new Set());

  const splash = useSplashQueue({ minSplashMs });
  const { enqueue, removePick } = splash;

  // Adapter: the WS hook's announcement callback feeds the splash queue.
  // Only live socket events reach this — historical picks are never enqueued.
  const showAnnouncement = useCallback(
    (
      player: DraftPlayer | AvailableDraftPlayer,
      pickNumber: number,
      round: number,
      roundPickNumber: number,
      _myPick: boolean,
      auto: boolean,
      teamName: string,
    ) => {
      enqueue({
        player,
        overallPick: pickNumber,
        round,
        roundPickNumber,
        isAuto: auto,
        teamName,
      });
    },
    [enqueue],
  );

  // Spectators surface no toasts and no presence — quiet no-ops.
  const noop = useCallback(() => undefined, []);
  const asyncNoop = useCallback(() => Promise.resolve(undefined), []);

  useDraftWebSocket({
    leagueId,
    draftId: data.draftId,
    isAuthenticated,
    isAuctionDraft: data.isAuctionDraft,
    myTeamId: null,
    enrichedPlayers: [],
    statsLookup: data.statsLookup,
    teamNameById: data.teamNameById,
    notifiedPicksRef,
    showAnnouncement,
    showToast: noop,
    setDraftComplete,
    setDraftPaused,
    setPickDeadline,
    setPickTimeLimitSeconds,
    setLiveMessage,
    setOnlineUserIds: noop,
    refetchDraft: data.refetchDraft,
    refetchLeague: data.refetchLeague,
    refetchCurrentPick: data.refetchCurrentPick,
    refetchPickHistory: data.refetchPickHistory,
    refetchAvailablePlayers: asyncNoop,
    refetchQueue: asyncNoop,
    refetchAutoPickStatuses: asyncNoop,
    websocketUrl,
    token: token ?? authToken ?? undefined,
    onPickUndone: removePick,
  });

  const { timeRemaining } = useDraftTimer({
    draftId: data.draftId,
    leagueId,
    draftComplete,
    draftOrderMissing: false,
    draftPaused,
    currentPickInfo: data.currentPickInfo,
    pickDeadline,
    leagueDraft: data.leagueDraft,
    setPickDeadline,
    setPickTimeLimitSeconds,
    setAutoPickDisabled: noop,
    readOnly: true,
    refetchDraft: data.refetchDraft,
    refetchCurrentPick: data.refetchCurrentPick,
    refetchPickHistory: data.refetchPickHistory,
    refetchAvailablePlayers: asyncNoop,
  });

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
        league={
          data.league
            ? {
                isMockDraft: data.league.isMockDraft ?? undefined,
                name: data.league.name ?? undefined,
              }
            : null
        }
        leagueId={leagueId}
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
            <span role="img" aria-label="baseball">
              ⚾
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
  const round =
    data.currentPickInfo?.round ??
    Math.ceil(
      (data.currentPickInfo?.overallPick ?? 1) /
        Math.max(data.leagueTeams.length, 1),
    );
  const currentPick =
    data.currentPickInfo?.overallPick ?? data.pickHistory.length + 1;
  const onClockTeamName = data.teamNameById(data.currentPickTeamId);
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
  const recentPicks = [...data.pickHistory]
    .sort((a, b) => b.overallPick - a.overallPick)
    .slice(0, 5);

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
      />

      <div className="sr-only" aria-live="polite">
        {liveMessage}
      </div>
    </div>
  );
}

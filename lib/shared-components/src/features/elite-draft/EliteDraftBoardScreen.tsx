import React, { useCallback, useMemo } from 'react';
import { CSS } from './styles';
import { DraftCompleteView } from './DraftCompleteView';
import { DraftPlayerBoard } from './DraftPlayerBoard';
import { PickAnnouncement } from './PickAnnouncement';
import { getDraftCommentary } from './draftUtils';
import { AuctionDraftRoom } from './auction/AuctionDraftRoom';
import { PreDraftLobby } from './PreDraftLobby';
import { DraftTopBand } from './DraftTopBand';
import { DraftRail } from './DraftRail';
import {
  LeagueErrorScreen,
  LoadingScreen,
  NoLeagueScreen,
  PlayersErrorScreen,
} from './DraftStateScreens';
import {
  useDraftActions,
  useDraftEffects,
  useDraftQueries,
  useDraftTimer,
  useDraftUIState,
  useDraftWebSocket,
  usePlayerData,
} from './hooks';
import { DraftChatOverlay } from './DraftChatOverlay';
import { DEFAULT_NUM_TEAMS } from './constants';
import type { DraftChatRenderer } from './DraftChatOverlay';
import { useAuth } from '../../features/auth';

export interface EliteDraftBoardScreenProps {
  /** League ID to load (replaces route param). */
  leagueId: number | null;
  /** Navigation callback (replaces react-router useNavigate). */
  onNavigate: (path: string) => void;
  /** WebSocket URL for live draft updates. */
  websocketUrl: string;
  /** Optional auth token for the draft WebSocket. When omitted the socket defers until a token becomes available. */
  token?: string;
  /** Optional render prop for the chat overlay. If omitted, chat is disabled. */
  renderChat?: DraftChatRenderer;
  /** Optional callback fired when a player is drafted (for analytics). */
  onPlayerDrafted?: (playerId: number, position: string) => void;
}

export function EliteDraftBoardScreen({
  leagueId,
  onNavigate,
  websocketUrl,
  token,
  renderChat,
  onPlayerDrafted,
}: EliteDraftBoardScreenProps): React.JSX.Element {
  const { user } = useAuth();
  const userId = user?.id ?? 0;
  const isPremium = user?.accessLevel === 'admin';
  const isAuthenticated = !!user;

  const ui = useDraftUIState();

  const queries = useDraftQueries({
    leagueId,
    draftOrderMissing: ui.draftOrderMissing,
    playerSearch: ui.playerSearch,
    selectedPosition: ui.selectedPosition,
    viewMode: ui.viewMode,
    wsConnected: ui.wsConnected,
  });

  const isMyPick = Boolean(
    queries.currentPickInfo &&
    queries.currentPickTeamId !== null &&
    queries.myTeamId !== null &&
    queries.currentPickTeamId === queries.myTeamId &&
    !queries.currentPickInfo.isComplete,
  );

  const playerData = usePlayerData({
    availablePlayers: queries.availablePlayers,
    pickHistory: queries.pickHistory,
    playerStatsMap: queries.playerStatsMap,
    pitchingStatsMap: queries.pitchingStatsMap,
    myTeamId: queries.myTeamId,
  });

  const actions = useDraftActions({
    leagueId,
    draftId: queries.draftId,
    myTeamId: queries.myTeamId,
    isMyPick,
    draftPaused: ui.draftPaused,
    autoPickDisabled: ui.autoPickDisabled,
    leagueTeams: queries.leagueTeams,
    customDraftOrder: ui.customDraftOrder,
    queuedPlayerIds: queries.queuedPlayerIds,
    showToast: ui.showToast,
    setDraftPaused: ui.setDraftPaused,
    setDraftOrderMissing: ui.setDraftOrderMissing,
    setInitError: ui.setInitError,
    setAutoPickDisabled: ui.setAutoPickDisabled,
    setCommPickMode: ui.setCommPickMode,
    setUrgentMessage: ui.setUrgentMessage,
    refetchDraft: queries.refetchDraft,
    refetchLeague: queries.refetchLeague,
    refetchCurrentPick: queries.refetchCurrentPick,
    refetchPickHistory: queries.refetchPickHistory,
    refetchAvailablePlayers: queries.refetchAvailablePlayers,
    refetchQueue: queries.refetchQueue,
    refetchAutoPickStatuses: queries.refetchAutoPickStatuses,
    autoPickTeamIds: queries.autoPickTeamIds,
  });

  useDraftWebSocket({
    leagueId,
    draftId: queries.draftId,
    isAuthenticated,
    isAuctionDraft: queries.isAuctionDraft,
    myTeamId: queries.myTeamId,
    enrichedPlayers: playerData.enrichedPlayers,
    statsLookup: playerData.statsLookup,
    teamNameById: queries.teamNameById,
    notifiedPicksRef: ui.notifiedPicksRef,
    showAnnouncement: ui.showAnnouncement,
    showToast: ui.showToast,
    setDraftComplete: ui.setDraftComplete,
    setDraftPaused: ui.setDraftPaused,
    setPickDeadline: ui.setPickDeadline,
    setPickTimeLimitSeconds: ui.setPickTimeLimitSeconds,
    setLiveMessage: ui.setLiveMessage,
    setOnlineUserIds: ui.setOnlineUserIds,
    refetchDraft: queries.refetchDraft,
    refetchLeague: queries.refetchLeague,
    refetchCurrentPick: queries.refetchCurrentPick,
    refetchPickHistory: queries.refetchPickHistory,
    refetchAvailablePlayers: queries.refetchAvailablePlayers,
    refetchQueue: queries.refetchQueue,
    refetchAutoPickStatuses: queries.refetchAutoPickStatuses,
    websocketUrl,
    token,
    onPlayerDrafted,
    setWsConnected: ui.setWsConnected,
  });

  const { timeRemaining } = useDraftTimer({
    draftId: queries.draftId,
    leagueId,
    draftComplete: ui.draftComplete,
    draftOrderMissing: ui.draftOrderMissing,
    draftPaused: ui.draftPaused,
    currentPickInfo: queries.currentPickInfo,
    pickDeadline: ui.pickDeadline,
    leagueDraft: queries.leagueDraft,
    setPickDeadline: ui.setPickDeadline,
    setPickTimeLimitSeconds: ui.setPickTimeLimitSeconds,
    setAutoPickDisabled: ui.setAutoPickDisabled,
    nudgeExpiredDraftPick: actions.nudgeExpiredDraftPick,
    refetchDraft: queries.refetchDraft,
    refetchCurrentPick: queries.refetchCurrentPick,
    refetchPickHistory: queries.refetchPickHistory,
    refetchAvailablePlayers: queries.refetchAvailablePlayers,
  });

  useDraftEffects({
    league: queries.league,
    leagueDraft: queries.leagueDraft,
    currentPickInfo: queries.currentPickInfo,
    currentPickErrorMessage: queries.currentPickErrorMessage,
    currentPickTeamId: queries.currentPickTeamId,
    isMyPick,
    draftOrderMissing: ui.draftOrderMissing,
    searchTerm: ui.searchTerm,
    teamNameById: queries.teamNameById,
    setDraftComplete: ui.setDraftComplete,
    setDraftPaused: ui.setDraftPaused,
    setDraftOrderMissing: ui.setDraftOrderMissing,
    setCurrentPickLoadError: ui.setCurrentPickLoadError,
    setInitError: ui.setInitError,
    setUrgentMessage: ui.setUrgentMessage,
    setLiveMessage: ui.setLiveMessage,
    setPlayerSearch: ui.setPlayerSearch,
  });

  // ---- Derived values ----
  const onlineTeamIds = useMemo<ReadonlySet<string>>(() => {
    const set = new Set<string>();
    for (const team of queries.leagueTeams) {
      if (team.managerId != null && ui.onlineUserIds.has(team.managerId)) {
        set.add(String(team.id));
      }
    }
    return set;
  }, [queries.leagueTeams, ui.onlineUserIds]);

  const announcementCommentary = useMemo(() => {
    if (!ui.announcement || !('name' in ui.announcement.player))
      return undefined;
    const player = ui.announcement.player;
    const teamCount =
      queries.leagueTeams.length > 0
        ? queries.leagueTeams.length
        : DEFAULT_NUM_TEAMS;
    const announcementRound = Math.ceil(ui.announcement.pickNumber / teamCount);
    return getDraftCommentary(
      player,
      announcementRound,
      ui.announcement.isMyPick,
      ui.announcement.isAuto,
    );
  }, [ui.announcement, queries.leagueTeams.length]);

  const round =
    queries.currentPickInfo?.round ??
    Math.ceil(
      (queries.currentPickInfo?.overallPick ?? 1) /
        Math.max(queries.leagueTeams.length, 1),
    );
  const currentPick =
    queries.currentPickInfo?.overallPick ?? queries.pickHistory.length + 1;
  const filteredPlayers = playerData.enrichedPlayers;

  // ---- Stable callbacks for DraftPlayerBoard (prevent re-renders on each timer tick) ----
  // Destructure stable useCallback refs before using them as hook deps — the actions/queries
  // objects are recreated each render, but the individual methods inside are stable.
  const {
    handleMakePick,
    handleCommissionerPick: commissionerPick,
    handleToggleQueue,
  } = actions;
  const { handleLoadMorePlayers } = queries;

  const handleDraftPlayer = useCallback(
    (id: number) => {
      void handleMakePick(id);
    },
    [handleMakePick],
  );
  const handleCommissionerPick = useCallback(
    (id: number) => {
      void commissionerPick(id);
    },
    [commissionerPick],
  );
  const handleToggleQueuePlayer = useCallback(
    (id: number) => {
      void handleToggleQueue(id);
    },
    [handleToggleQueue],
  );
  const handleLoadMore = useCallback(() => {
    void handleLoadMorePlayers();
  }, [handleLoadMorePlayers]);

  // ---- Early returns for special states ----
  if (!leagueId) return <NoLeagueScreen onNavigate={onNavigate} />;

  if (
    (queries.leagueLoading || queries.availablePlayersLoading) &&
    !queries.availablePlayersData &&
    !queries.leagueData
  ) {
    return <LoadingScreen />;
  }

  if (
    !queries.leagueLoading &&
    !queries.league &&
    (queries.leagueError || queries.leagueData !== undefined)
  ) {
    const graphQLErrors =
      queries.leagueError && 'graphQLErrors' in queries.leagueError
        ? (queries.leagueError.graphQLErrors as ReadonlyArray<{
            extensions?: Record<string, unknown>;
          }>)
        : [];
    const isUnauthorized = graphQLErrors.some(
      (e) =>
        e.extensions?.['code'] === 'UNAUTHENTICATED' ||
        e.extensions?.['code'] === 'FORBIDDEN',
    );
    return (
      <LeagueErrorScreen
        isUnauthorized={isUnauthorized}
        onNavigate={onNavigate}
      />
    );
  }

  if (queries.availablePlayersError) {
    return (
      <PlayersErrorScreen
        message={queries.availablePlayersError.message}
        onRetry={() => {
          void queries.refetchAvailablePlayers();
        }}
      />
    );
  }

  if (ui.draftComplete || queries.currentPickInfo?.isComplete) {
    return (
      <DraftCompleteView
        league={
          queries.league
            ? {
                isMockDraft: queries.league.isMockDraft ?? undefined,
                name: queries.league.name ?? undefined,
              }
            : null
        }
        leagueId={leagueId}
        pickHistory={queries.pickHistory}
        myTeamId={queries.myTeamId}
        myTeam={playerData.myTeam}
        myTeamPicks={playerData.myTeamPicks}
        leagueTeams={queries.leagueTeams}
        statsLookup={playerData.statsLookup}
        onNavigate={onNavigate}
      />
    );
  }

  if (!queries.draftId && queries.league?.draftStatus !== 'in-progress') {
    return (
      <PreDraftLobby
        league={queries.league}
        leagueTeams={queries.leagueTeams}
        myTeamId={queries.myTeamId}
        isOwner={queries.isOwner}
        onlineTeamIds={onlineTeamIds}
        customDraftOrder={ui.customDraftOrder}
        setCustomDraftOrder={ui.setCustomDraftOrder}
        initError={ui.initError}
        initDraftLoading={actions.initDraftLoading}
        onInitializeDraft={actions.handleInitializeDraft}
      />
    );
  }

  if (
    queries.leagueDraft?.selectionMethod === 'auction' &&
    queries.draftId != null
  ) {
    return (
      <AuctionDraftRoom
        draftId={queries.draftId}
        myTeamId={queries.myTeamId ?? undefined}
      />
    );
  }

  // ---- Main Live Draft UI ----
  return (
    <div className="d-root">
      <style>{CSS}</style>
      <div className="d-bg-fx" />
      <div className="d-layout">
        <DraftTopBand
          draftPaused={ui.draftPaused}
          currentPick={currentPick}
          round={round}
          timeRemaining={timeRemaining}
          pickTimeLimitSeconds={ui.pickTimeLimitSeconds}
          isMyPick={isMyPick}
          currentPickInfo={queries.currentPickInfo}
          isCommissioner={queries.isCommissioner}
          isOwner={queries.isOwner}
          draftId={queries.draftId}
          commPickMode={ui.commPickMode}
          autoPickDisabled={ui.autoPickDisabled}
          pauseLoading={actions.pauseLoading}
          resumeLoading={actions.resumeLoading}
          autoPickDisabledLoading={actions.autoPickDisabledLoading}
          isMyTeamAutoPick={actions.isMyTeamAutoPick}
          toggleAutoPickLoading={actions.toggleAutoPickLoading}
          myTeamId={queries.myTeamId}
          teamNameById={queries.teamNameById}
          onPauseDraft={() => void actions.handlePauseDraft()}
          onResumeDraft={() => void actions.handleResumeDraft()}
          onToggleCommPickMode={() => ui.setCommPickMode(!ui.commPickMode)}
          onToggleAutoPickDisabled={() =>
            void actions.handleToggleAutoPickDisabled()
          }
          onToggleUserAutoPick={() => void actions.handleToggleUserAutoPick()}
        />

        <DraftPlayerBoard
          viewMode={ui.viewMode}
          selectedPosition={ui.selectedPosition}
          searchTerm={ui.searchTerm}
          availablePlayersLoading={queries.availablePlayersLoading}
          commPickMode={ui.commPickMode}
          isOwner={queries.isOwner}
          isMyPick={isMyPick}
          pickLoading={actions.pickLoading}
          myTeamId={queries.myTeamId}
          draftId={queries.draftId}
          filteredPlayers={filteredPlayers}
          watchlist={ui.watchlist}
          queuedPlayerIds={queries.queuedPlayerIds}
          autoPickTeamIds={queries.autoPickTeamIds}
          boardOrderedTeams={queries.boardOrderedTeams}
          pickHistory={queries.pickHistory}
          currentPickInfo={queries.currentPickInfo}
          statsLookup={playerData.statsLookup}
          leagueTeamsLength={queries.leagueTeams.length}
          hasMorePlayers={queries.hasMorePlayers}
          loadingMore={queries.loadingMore}
          onlineTeamIds={onlineTeamIds}
          myTeam={playerData.myTeam}
          positionCounts={playerData.positionCounts}
          onSetSearchTerm={ui.setSearchTerm}
          onSetSelectedPosition={ui.setSelectedPosition}
          onSetViewMode={ui.setViewMode}
          onSetWatchlist={ui.setWatchlist}
          onDraftPlayer={handleDraftPlayer}
          onCommissionerPick={handleCommissionerPick}
          onToggleQueue={handleToggleQueuePlayer}
          onLoadMore={handleLoadMore}
        />

        <DraftRail
          isPremium={isPremium}
          isMyPick={isMyPick}
          commPickMode={ui.commPickMode}
          isOwner={queries.isOwner}
          draftId={queries.draftId}
          myTeamId={queries.myTeamId}
          currentOverallPick={queries.currentPickInfo?.overallPick ?? 0}
          autoPickDisabled={ui.autoPickDisabled}
          myTeam={playerData.myTeam}
          positionCounts={playerData.positionCounts}
          pickHistory={queries.pickHistory}
          statsLookup={playerData.statsLookup}
          teamNameById={queries.teamNameById}
          onShowToast={ui.showToast}
          onDraftPlayer={handleDraftPlayer}
          onCommissionerPick={handleCommissionerPick}
        />
      </div>

      {/* Overlays */}
      {ui.draftPaused && !queries.isOwner && (
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

      {ui.announcement && 'name' in ui.announcement.player && (
        <PickAnnouncement
          player={ui.announcement.player}
          pickNumber={ui.announcement.pickNumber}
          round={ui.announcement.round}
          roundPickNumber={ui.announcement.roundPickNumber}
          isMyPick={ui.announcement.isMyPick}
          isAuto={ui.announcement.isAuto}
          leaving={ui.announcementLeaving}
          commentary={announcementCommentary}
          onDismiss={ui.dismissAnnouncement}
        />
      )}

      {ui.toastMessage && (
        <div
          className={`d-toast ${ui.toastMessage.type}`}
          role="alert"
          aria-live="assertive"
          onClick={() => ui.setToastMessage(null)}
        >
          {ui.toastMessage.text}
        </div>
      )}
      {ui.urgentMessage && !ui.toastMessage && (
        <div className="d-toast error" role="alert" aria-live="assertive">
          {ui.urgentMessage}
        </div>
      )}
      <div className="sr-only" aria-live="polite">
        {ui.liveMessage}
      </div>
      <div className="sr-only" aria-live="assertive">
        {ui.urgentMessage}
      </div>

      {ui.chatOpen && leagueId !== null && renderChat && (
        <DraftChatOverlay
          leagueId={leagueId}
          userId={userId}
          leagueTeams={queries.leagueTeams}
          onClose={() => ui.setChatOpen(false)}
          renderChat={renderChat}
        />
      )}
    </div>
  );
}

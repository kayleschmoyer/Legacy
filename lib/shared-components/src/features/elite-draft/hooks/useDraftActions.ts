import { useCallback, useRef } from 'react';
import { LOGGER } from '@legacy-sports/logging';
import { useMutation } from '@apollo/client/react';
import type { LeagueTeam } from '../types';
import {
  AddToDraftQueue as ADD_TO_DRAFT_QUEUE,
  CommissionerPick as COMMISSIONER_PICK,
  CommissionerSetDraftAutoPickDisabled as COMMISSIONER_SET_AUTOPICK_DISABLED,
  InitializeLiveDraft as INITIALIZE_LIVE_DRAFT,
  type InitializeLiveDraftMutation,
  type InitializeLiveDraftMutationVariables,
  MakeDraftPick as MAKE_DRAFT_PICK,
  NudgeExpiredDraftPick as NUDGE_EXPIRED_DRAFT_PICK,
  PauseDraft as PAUSE_DRAFT,
  RemoveFromDraftQueue as REMOVE_FROM_DRAFT_QUEUE,
  ResumeDraft as RESUME_DRAFT,
  SetDraftOrder as SET_DRAFT_ORDER,
  ToggleDraftAutoPick as TOGGLE_DRAFT_AUTO_PICK,
} from '../../../api/db/graphql.generated';

interface UseDraftActionsParams {
  leagueId: number | null;
  draftId: number | null;
  myTeamId: number | null;
  isMyPick: boolean;
  draftPaused: boolean;
  autoPickDisabled: boolean;
  leagueTeams: LeagueTeam[];
  customDraftOrder: string[] | null;
  queuedPlayerIds: ReadonlySet<number>;
  showToast: (text: string, type?: 'error' | 'warning' | 'info') => void;
  setDraftPaused: (v: boolean) => void;
  setDraftOrderMissing: (v: boolean) => void;
  setInitError: (v: string | null) => void;
  setAutoPickDisabled: (v: boolean) => void;
  setCommPickMode: (v: boolean) => void;
  setUrgentMessage: (v: string) => void;
  refetchDraft: () => unknown;
  refetchLeague: () => unknown;
  refetchCurrentPick: (vars: { draftId: number }) => unknown;
  refetchPickHistory: () => unknown;
  refetchAvailablePlayers: () => unknown;
  refetchQueue: () => Promise<unknown>;
  refetchAutoPickStatuses: () => unknown;
  autoPickTeamIds: ReadonlySet<string>;
}

export function useDraftActions({
  leagueId,
  draftId,
  myTeamId,
  isMyPick,
  draftPaused,
  autoPickDisabled,
  leagueTeams,
  customDraftOrder,
  queuedPlayerIds,
  showToast,
  setDraftPaused: _setDraftPaused,
  setDraftOrderMissing,
  setInitError,
  setAutoPickDisabled,
  setCommPickMode,
  setUrgentMessage,
  refetchDraft,
  refetchLeague,
  refetchCurrentPick,
  refetchPickHistory,
  refetchAvailablePlayers,
  refetchQueue,
  refetchAutoPickStatuses,
  autoPickTeamIds,
}: UseDraftActionsParams) {
  const [initializeLiveDraft, { loading: initDraftLoading }] = useMutation<
    InitializeLiveDraftMutation,
    InitializeLiveDraftMutationVariables
  >(INITIALIZE_LIVE_DRAFT);
  const [makeDraftPick, { loading: pickLoading }] =
    useMutation(MAKE_DRAFT_PICK);
  const [pauseDraftMutation, { loading: pauseLoading }] =
    useMutation(PAUSE_DRAFT);
  const [resumeDraftMutation, { loading: resumeLoading }] =
    useMutation(RESUME_DRAFT);
  const [commissionerPickMutation, { loading: commPickLoading }] =
    useMutation(COMMISSIONER_PICK);
  const [
    setDraftAutoPickDisabledMutation,
    { loading: autoPickDisabledLoading },
  ] = useMutation(COMMISSIONER_SET_AUTOPICK_DISABLED);
  const [nudgeExpiredDraftPick] = useMutation(NUDGE_EXPIRED_DRAFT_PICK);
  const [setDraftOrderMutation] = useMutation(SET_DRAFT_ORDER);
  const [addToQueueMutation] = useMutation(ADD_TO_DRAFT_QUEUE);
  const [removeFromQueueMutation] = useMutation(REMOVE_FROM_DRAFT_QUEUE);
  const [toggleAutoPickMutation, { loading: toggleAutoPickLoading }] =
    useMutation(TOGGLE_DRAFT_AUTO_PICK);

  // Synchronous re-entry guards. Apollo's `loading` flag only flips on the
  // next render, so a rapid second click (or a timer/websocket-driven
  // auto-pick racing a manual click) can pass a `pickLoading`-based check
  // and fire the mutation twice with different `playerId`s. Refs update
  // same-tick and close the race.
  const isPickingRef = useRef(false);
  const isCommPickingRef = useRef(false);

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
        const draft = result.data?.initializeDraft;
        if (draft?.id) {
          const newDraftId = Number(draft.id);
          let customOrderFailed = false;
          if (customDraftOrder && customDraftOrder.length > 0) {
            const validTeamIds = new Set(leagueTeams.map((t) => String(t.id)));
            const seen = new Set<string>();
            const normalized: string[] = [];
            for (const id of customDraftOrder) {
              if (validTeamIds.has(id) && !seen.has(id)) {
                seen.add(id);
                normalized.push(id);
              }
            }
            for (const t of leagueTeams) {
              const id = String(t.id);
              if (!seen.has(id)) {
                normalized.push(id);
              }
            }
            try {
              await setDraftOrderMutation({
                variables: {
                  draftId: newDraftId,
                  teamIds: normalized.map(Number),
                },
              });
            } catch (orderErr) {
              LOGGER.warn('[Draft] Failed to apply custom draft order', {
                error: orderErr,
              });
              customOrderFailed = true;
              setInitError(
                'Draft started but custom team order could not be applied.',
              );
            }
          }
          setDraftOrderMissing(false);
          if (!customOrderFailed) {
            setInitError(null);
          }
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
      leagueTeams,
      customDraftOrder,
      initializeLiveDraft,
      setDraftOrderMutation,
      setDraftOrderMissing,
      setInitError,
      refetchDraft,
      refetchLeague,
      refetchCurrentPick,
    ],
  );

  const handleMakePick = useCallback(
    async (playerId: number, isAutoPick = false) => {
      if (!draftId || !isMyPick || isPickingRef.current || draftPaused) return;
      isPickingRef.current = true;
      try {
        setUrgentMessage('');
        await makeDraftPick({
          variables: { draftId, playerId },
        });
        void refetchCurrentPick({ draftId });
        void refetchPickHistory();
        void refetchAvailablePlayers();
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to make pick';
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
          _setDraftPaused(true);
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
      } finally {
        isPickingRef.current = false;
      }
    },
    [
      draftId,
      isMyPick,
      draftPaused,
      makeDraftPick,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      refetchLeague,
      showToast,
      setUrgentMessage,
      _setDraftPaused,
    ],
  );

  const handlePauseDraft = useCallback(async () => {
    if (!leagueId || pauseLoading) return;
    try {
      await pauseDraftMutation({ variables: { leagueId } });
      _setDraftPaused(true);
      void refetchLeague();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to pause draft';
      showToast(msg, 'error');
    }
  }, [
    leagueId,
    pauseLoading,
    pauseDraftMutation,
    refetchLeague,
    showToast,
    _setDraftPaused,
  ]);

  const handleResumeDraft = useCallback(async () => {
    if (!leagueId || resumeLoading) return;
    try {
      await resumeDraftMutation({ variables: { leagueId } });
      _setDraftPaused(false);
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
    _setDraftPaused,
  ]);

  const handleToggleAutoPickDisabled = useCallback(async () => {
    if (!draftId || autoPickDisabledLoading) return;
    const newDisabled = !autoPickDisabled;
    try {
      await setDraftAutoPickDisabledMutation({
        variables: { draftId, disabled: newDisabled },
      });
      setAutoPickDisabled(newDisabled);
      showToast(
        newDisabled
          ? 'Auto-pick disabled for this draft'
          : 'Auto-pick enabled for this draft',
        'info',
      );
      void refetchDraft();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Failed to update auto-pick setting';
      showToast(msg, 'error');
    }
  }, [
    draftId,
    autoPickDisabled,
    autoPickDisabledLoading,
    setDraftAutoPickDisabledMutation,
    showToast,
    setAutoPickDisabled,
    refetchDraft,
  ]);

  const handleCommissionerPick = useCallback(
    async (playerId: number) => {
      if (!draftId || isCommPickingRef.current) return;
      isCommPickingRef.current = true;
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
      } finally {
        isCommPickingRef.current = false;
      }
    },
    [
      draftId,
      commissionerPickMutation,
      refetchCurrentPick,
      refetchPickHistory,
      refetchAvailablePlayers,
      showToast,
      setCommPickMode,
    ],
  );

  const handleToggleQueue = useCallback(
    async (playerId: number) => {
      if (!draftId) return;
      const isQueued = queuedPlayerIds.has(playerId);
      try {
        if (isQueued) {
          await removeFromQueueMutation({ variables: { draftId, playerId } });
        } else {
          await addToQueueMutation({ variables: { draftId, playerId } });
        }
        void refetchQueue().catch((e: unknown) =>
          LOGGER.warn('Queue refetch failed:', String(e)),
        );
      } catch {
        showToast(
          isQueued
            ? 'Failed to remove player from queue. Please try again.'
            : 'Failed to add player to queue. Please try again.',
        );
      }
    },
    [
      draftId,
      queuedPlayerIds,
      addToQueueMutation,
      removeFromQueueMutation,
      refetchQueue,
      showToast,
    ],
  );

  // LS-1339: Toggle the current user's own auto-pick for their team
  const isMyTeamAutoPick =
    myTeamId !== null && autoPickTeamIds.has(String(myTeamId));

  const handleToggleUserAutoPick = useCallback(async () => {
    if (!draftId || toggleAutoPickLoading) return;
    const enable = !isMyTeamAutoPick;
    try {
      await toggleAutoPickMutation({ variables: { draftId, enable } });
      void refetchAutoPickStatuses();
      showToast(
        enable
          ? 'Auto-pick enabled — the system will pick for you when your turn arrives'
          : 'Auto-pick disabled — you will make your own picks',
        'info',
      );
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Failed to update auto-pick';
      showToast(msg, 'error');
    }
  }, [
    draftId,
    toggleAutoPickLoading,
    isMyTeamAutoPick,
    toggleAutoPickMutation,
    refetchAutoPickStatuses,
    showToast,
  ]);

  return {
    handleInitializeDraft,
    handleMakePick,
    handlePauseDraft,
    handleResumeDraft,
    handleToggleAutoPickDisabled,
    handleToggleUserAutoPick,
    handleCommissionerPick,
    handleToggleQueue,
    nudgeExpiredDraftPick,
    isMyTeamAutoPick,
    initDraftLoading,
    pickLoading,
    pauseLoading,
    resumeLoading,
    commPickLoading,
    autoPickDisabledLoading,
    toggleAutoPickLoading,
  } as const;
}

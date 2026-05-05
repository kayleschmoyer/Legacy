import { useEffect, useRef } from 'react';
import type { CurrentDraftPickInfo } from '../types';
import type {
  GetLeagueByIdQuery,
  GetLiveDraftLeagueDraftQuery,
} from '../../../api/db/graphql.generated';

interface UseDraftEffectsParams {
  league: GetLeagueByIdQuery['league'];
  leagueDraft: GetLiveDraftLeagueDraftQuery['getLeagueDraft'];
  currentPickInfo: CurrentDraftPickInfo | null;
  currentPickErrorMessage: string;
  currentPickTeamId: number | null;
  isMyPick: boolean;
  draftOrderMissing: boolean;
  searchTerm: string;
  teamNameById: (teamId: number | null | undefined) => string;
  setDraftComplete: (v: boolean) => void;
  setDraftPaused: (v: boolean) => void;
  setDraftOrderMissing: (v: boolean) => void;
  setCurrentPickLoadError: (v: string | null) => void;
  setInitError: (v: string | null) => void;
  setUrgentMessage: (v: string) => void;
  setLiveMessage: (v: string) => void;
  setPlayerSearch: (v: string) => void;
}

export function useDraftEffects({
  league,
  leagueDraft,
  currentPickInfo,
  currentPickErrorMessage,
  currentPickTeamId,
  isMyPick,
  draftOrderMissing,
  searchTerm,
  teamNameById,
  setDraftComplete,
  setDraftPaused,
  setDraftOrderMissing,
  setCurrentPickLoadError,
  setInitError,
  setUrgentMessage,
  setLiveMessage,
  setPlayerSearch,
}: UseDraftEffectsParams) {
  // Mark draft complete when server data indicates it (either source)
  useEffect(() => {
    if (leagueDraft?.draftCompletedAt) {
      setDraftComplete(true);
    }
  }, [leagueDraft?.draftCompletedAt, setDraftComplete]);

  // Mark draft complete when the current-pick poll signals completion.
  // getCurrentDraftPickInfo returns isComplete:true once draftCompletedAt is set
  // in the DB, so this fires within one 5-second poll cycle even if the
  // DraftCompletedNotification WebSocket event was missed (LS-4191).
  useEffect(() => {
    if (currentPickInfo?.isComplete) {
      setDraftComplete(true);
    }
  }, [currentPickInfo?.isComplete, setDraftComplete]);

  // Detect paused status from league data
  useEffect(() => {
    if (league?.draftStatus === 'paused') {
      setDraftPaused(true);
    } else if (league?.draftStatus === 'in-progress') {
      setDraftPaused(false);
    }
  }, [league?.draftStatus, setDraftPaused]);

  // Draft/pick diagnostics
  useEffect(() => {
    if (!currentPickErrorMessage) {
      setCurrentPickLoadError(null);
      return;
    }

    if (
      currentPickErrorMessage.includes('No teams configured for this draft')
    ) {
      setDraftOrderMissing(true);
      setCurrentPickLoadError(null);
      setInitError(
        'Draft order has not been generated yet. Re-start the live draft to assign teams to draft slots.',
      );
      setUrgentMessage('');
      return;
    }

    setDraftOrderMissing(false);
    setCurrentPickLoadError(currentPickErrorMessage);
  }, [
    currentPickErrorMessage,
    setCurrentPickLoadError,
    setDraftOrderMissing,
    setInitError,
    setUrgentMessage,
  ]);

  useEffect(() => {
    if (currentPickInfo) {
      setDraftOrderMissing(false);
      setCurrentPickLoadError(null);
      setInitError(null);
    }
  }, [
    currentPickInfo,
    setDraftOrderMissing,
    setCurrentPickLoadError,
    setInitError,
  ]);

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
  }, [searchTerm, setPlayerSearch]);

  // A11y announcements
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
    setLiveMessage,
  ]);
}

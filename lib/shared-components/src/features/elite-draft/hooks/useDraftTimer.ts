import { useEffect, useRef, useState } from 'react';
import type { CurrentDraftPickInfo } from '../types';
import type { GetLiveDraftLeagueDraftQuery } from '../../../api/db/graphql.generated';

interface UseDraftTimerParams {
  draftId: number | null;
  leagueId: number | null;
  draftComplete: boolean;
  draftOrderMissing: boolean;
  draftPaused: boolean;
  currentPickInfo: CurrentDraftPickInfo | null;
  pickDeadline: Date | null;
  leagueDraft: GetLiveDraftLeagueDraftQuery['getLeagueDraft'];
  setPickDeadline: (v: Date | null) => void;
  setPickTimeLimitSeconds: (v: number) => void;
  setAutoPickDisabled: (v: boolean) => void;
  nudgeExpiredDraftPick: (opts: {
    variables: { leagueId: number };
  }) => Promise<unknown>;
  refetchDraft: () => unknown;
  refetchCurrentPick: (vars: { draftId: number }) => unknown;
  refetchPickHistory: () => unknown;
  refetchAvailablePlayers: () => unknown;
}

export function useDraftTimer({
  draftId,
  leagueId,
  draftComplete,
  draftOrderMissing,
  draftPaused,
  currentPickInfo,
  pickDeadline,
  leagueDraft,
  setPickDeadline,
  setPickTimeLimitSeconds,
  setAutoPickDisabled,
  nudgeExpiredDraftPick,
  refetchDraft,
  refetchCurrentPick,
  refetchPickHistory,
  refetchAvailablePlayers,
}: UseDraftTimerParams) {
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Sync deadline + time-limit from query result
  useEffect(() => {
    if (leagueDraft?.pickTimeLimitSeconds != null) {
      setPickTimeLimitSeconds(leagueDraft.pickTimeLimitSeconds);
    }
    if (leagueDraft?.currentPickDeadline) {
      setPickDeadline(new Date(leagueDraft.currentPickDeadline));
    }
    if (leagueDraft?.autoPickDisabled != null) {
      setAutoPickDisabled(leagueDraft.autoPickDisabled);
    }
  }, [
    leagueDraft?.currentPickDeadline,
    leagueDraft?.pickTimeLimitSeconds,
    leagueDraft?.autoPickDisabled,
    setPickDeadline,
    setPickTimeLimitSeconds,
    setAutoPickDisabled,
  ]);

  // Client-side countdown
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
    const tick = () => {
      if (pickDeadline) {
        const secs = Math.max(
          0,
          Math.round((pickDeadline.getTime() - Date.now()) / 1000),
        );
        setTimeRemaining(secs);
      }
    };
    tick();
    const timer = setInterval(tick, 500);
    return () => clearInterval(timer);
  }, [
    draftId,
    draftComplete,
    draftOrderMissing,
    currentPickInfo,
    draftPaused,
    pickDeadline,
  ]);

  // Sync deadline when the current pick advances (poll fallback)
  const prevOverallPickRef = useRef<number | null>(null);
  useEffect(() => {
    const current = currentPickInfo?.overallPick ?? null;
    if (
      current !== null &&
      prevOverallPickRef.current !== null &&
      current !== prevOverallPickRef.current
    ) {
      void refetchDraft();
    }
    prevOverallPickRef.current = current;
  }, [currentPickInfo?.overallPick, refetchDraft]);

  // Server-side auto-pick nudge
  const nudgeAttemptRef = useRef<number | null>(null);
  useEffect(() => {
    nudgeAttemptRef.current = null;
  }, [currentPickInfo?.overallPick]);

  useEffect(() => {
    if (!leagueId || !draftId || draftComplete || draftPaused) return;
    if (timeRemaining > 0) return;

    const pickNumber = currentPickInfo?.overallPick ?? null;
    if (pickNumber === null || nudgeAttemptRef.current === pickNumber) return;

    const timer = setTimeout(() => {
      if (nudgeAttemptRef.current === pickNumber) return;
      nudgeAttemptRef.current = pickNumber;
      void nudgeExpiredDraftPick({ variables: { leagueId } })
        .then(() => {
          void refetchDraft();
          if (draftId) void refetchCurrentPick({ draftId });
          void refetchPickHistory();
          void refetchAvailablePlayers();
        })
        .catch(() => {
          void refetchDraft();
          if (draftId) void refetchCurrentPick({ draftId });
        });
    }, 2000);

    return () => clearTimeout(timer);
  }, [
    leagueId,
    draftId,
    draftComplete,
    draftPaused,
    timeRemaining,
    currentPickInfo?.overallPick,
    nudgeExpiredDraftPick,
    refetchDraft,
    refetchCurrentPick,
    refetchPickHistory,
    refetchAvailablePlayers,
  ]);

  return { timeRemaining } as const;
}

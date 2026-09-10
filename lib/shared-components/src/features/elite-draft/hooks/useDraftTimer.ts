import { useEffect, useRef, useState } from 'react';
import type { GetLiveDraftLeagueDraftQuery } from '@legacy-sports/graphql';
import type { CurrentDraftPickInfo } from '../types';

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
  /**
   * Offline mock draft mode (LS-9144): the pick clock never counts down and
   * the expiry nudge never fires, so the drafter can take as long as they
   * want on their own turn. Defaults to false, preserving existing timed
   * behavior for shared drafts and real leagues.
   */
  untimed?: boolean;
  /**
   * Read-only mode for spectator surfaces (LS-8942): the countdown still
   * runs, but the clock never calls `nudgeExpiredDraftPick` — at 0:00 it
   * simply waits for the server to advance the pick. Defaults to false,
   * preserving the member draft room's nudge timing exactly.
   */
  readOnly?: boolean;
  /** Required unless `readOnly` is true — spectators mount no mutations. */
  nudgeExpiredDraftPick?: (opts: {
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
  untimed = false,
  readOnly = false,
  nudgeExpiredDraftPick,
  refetchDraft,
  refetchCurrentPick,
  refetchPickHistory,
  refetchAvailablePlayers,
}: UseDraftTimerParams) {
  const [timeRemaining, setTimeRemaining] = useState(0);

  // Tracks whether a real pickDeadline has ever been observed, so the nudge
  // effect below can tell "clock genuinely hit zero" apart from "we never
  // received a deadline" — both otherwise present identically as
  // timeRemaining === 0.
  const deadlineEverObservedRef = useRef(false);
  useEffect(() => {
    if (pickDeadline) {
      deadlineEverObservedRef.current = true;
    }
  }, [pickDeadline]);

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
      untimed ||
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
    untimed,
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
    if (untimed || readOnly || !nudgeExpiredDraftPick) return;
    if (!leagueId || !draftId || draftComplete || draftPaused) return;
    if (!deadlineEverObservedRef.current) return;
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
    untimed,
    leagueId,
    draftId,
    draftComplete,
    draftPaused,
    timeRemaining,
    currentPickInfo?.overallPick,
    readOnly,
    nudgeExpiredDraftPick,
    refetchDraft,
    refetchCurrentPick,
    refetchPickHistory,
    refetchAvailablePlayers,
  ]);

  return { timeRemaining } as const;
}

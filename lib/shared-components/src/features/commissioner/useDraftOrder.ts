import { useEffect, useState } from 'react';
import {
  useGetDraftTeamOrderQuery,
  useGetLeagueDraftQuery,
  useRandomizeDraftOrderMutation,
  useSetDraftOrderMutation,
} from '@legacy-sports/graphql';

export type DraftTeam = {
  teamId: number;
  teamName: string;
  draftOrder: number;
};

export interface UseDraftOrderParams {
  leagueId: number;
  draftStatus: string | null | undefined;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface DraftOrderControlProps {
  leagueId: number;
  draftStatus: string | null | undefined;
  /** Whether the current user has premium access. When false, the control is
   * replaced with a locked upgrade prompt. Defaults to true when omitted. */
  isPremium?: boolean;
  onSuccess?: (message: string) => void;
  onError?: (error: Error) => void;
}

function sortedTeams(
  entries: ReadonlyArray<{
    teamId?: number | null;
    teamName?: string | null;
    draftOrder?: number | null;
  }>,
): DraftTeam[] {
  return [...entries]
    .filter(
      (e): e is DraftTeam =>
        e.teamId != null && e.teamName != null && e.draftOrder != null,
    )
    .sort((a, b) => a.draftOrder - b.draftOrder);
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item);
  return copy;
}

/**
 * Shared query/mutation logic behind DraftOrderControl — platform-agnostic
 * so the web (drag-and-drop) and native (up/down reorder) variants render
 * from the same data and mutation flow. See LS-8850.
 */
export function useDraftOrder({
  leagueId,
  draftStatus,
  onSuccess,
  onError,
}: UseDraftOrderParams) {
  // Fetch the draft to get draftId (skip only when completed — not needed post-season)
  const { data: draftData } = useGetLeagueDraftQuery({
    variables: { leagueId },
    fetchPolicy: 'cache-and-network',
    skip: draftStatus === 'completed',
  });

  const draftId = draftData?.getLeagueDraft?.id ?? null;

  // Order is only editable before the draft starts (not-started or queued).
  // Once in-progress, picks may begin at any time — the order is locked.
  const isOrderLocked =
    draftStatus !== 'not-started' && draftStatus !== 'queued';

  // Fetch current draft team order (whenever we have a draftId)
  const { data, loading, refetch } = useGetDraftTeamOrderQuery({
    variables: { draftId: draftId ?? 0 },
    fetchPolicy: 'cache-and-network',
    skip: !draftId,
  });

  const [setDraftOrder, { loading: settingOrder }] = useSetDraftOrderMutation();
  const [randomizeDraftOrder, { loading: randomizing }] =
    useRandomizeDraftOrderMutation();

  // Local ordered list for reordering (drag-to-reorder on web, up/down on native)
  const [localOrder, setLocalOrder] = useState<DraftTeam[]>([]);
  const [hasCustomOrder, setHasCustomOrder] = useState(false);

  // Sync local state from server
  useEffect(() => {
    if (data?.getDraftTeamOrder) {
      setLocalOrder(sortedTeams(data.getDraftTeamOrder));
      setHasCustomOrder(false);
    }
  }, [data]);

  const moveTeam = (fromIndex: number, toIndex: number) => {
    setLocalOrder((prev) => arrayMove(prev, fromIndex, toIndex));
    setHasCustomOrder(true);
  };

  const handleSaveOrder = async () => {
    if (!draftId) return;
    try {
      await setDraftOrder({
        variables: {
          draftId,
          teamIds: localOrder.map((t) => t.teamId),
        },
        refetchQueries: ['GetDraftTeamOrder', 'GetLiveDraftLeagueDraft'],
        awaitRefetchQueries: true,
      });
      setHasCustomOrder(false);
      onSuccess?.('Draft order saved successfully!');
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onError?.(new Error(msg));
    }
  };

  const handleRandomize = async () => {
    if (!draftId) return;
    try {
      await randomizeDraftOrder({
        variables: { draftId },
        refetchQueries: ['GetDraftTeamOrder', 'GetLiveDraftLeagueDraft'],
        awaitRefetchQueries: true,
      });
      setHasCustomOrder(false);
      onSuccess?.('Draft order randomized!');
      void refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      onError?.(new Error(msg));
    }
  };

  const handleReset = () => {
    if (data?.getDraftTeamOrder) {
      setLocalOrder(sortedTeams(data.getDraftTeamOrder));
      setHasCustomOrder(false);
    }
  };

  return {
    draftId,
    isOrderLocked,
    loading,
    localOrder,
    hasCustomOrder,
    settingOrder,
    randomizing,
    isBusy: settingOrder || randomizing,
    moveTeam,
    handleSaveOrder,
    handleRandomize,
    handleReset,
  };
}

import { useCallback, useEffect, useRef, useState } from 'react';

interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  rank: number;
  adp: number;
}

interface DraftTeam {
  id: string;
  name: string;
  picks: string[];
}

interface DraftDataResponse {
  players: Player[];
  draftOrder: DraftTeam[];
  currentPick: number;
}

function normalizeError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(String(err));
}

export const useDraftData = (
  sport: string,
  leagueId: string,
  teamId: string,
) => {
  const [players, setPlayers] = useState<Player[]>([]);
  const [draftOrder, setDraftOrder] = useState<DraftTeam[]>([]);
  const [currentPick, setCurrentPick] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/draft/${sport}/${leagueId}/${teamId}`,
          { signal },
        );
        if (!response.ok) throw new Error('Failed to fetch draft data');

        let data: DraftDataResponse;
        try {
          data = (await response.json()) as DraftDataResponse;
        } catch {
          throw new Error('Failed to parse draft data response as JSON');
        }

        if (!signal.aborted) {
          setPlayers(data.players);
          setDraftOrder(data.draftOrder);
          setCurrentPick(data.currentPick);
        }
      } catch (err) {
        if (!signal.aborted) {
          setError(normalizeError(err));
        }
      } finally {
        if (!signal.aborted) {
          setIsLoading(false);
        }
      }
    },
    [sport, leagueId, teamId],
  );

  useEffect(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    void fetchData(controller.signal);

    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [fetchData]);

  const refetch = useCallback(() => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    void fetchData(controller.signal);
  }, [fetchData]);

  return { players, draftOrder, currentPick, isLoading, error, refetch };
};

import { useEffect, useState } from 'react';

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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await fetch(
          `/api/draft/${sport}/${leagueId}/${teamId}`,
        );
        if (!response.ok) throw new Error('Failed to fetch draft data');
        const data = (await response.json()) as {
          players: Player[];
          draftOrder: DraftTeam[];
          currentPick: number;
        };
        setPlayers(data.players);
        setDraftOrder(data.draftOrder);
        setCurrentPick(data.currentPick);
      } catch (err) {
        setError(err as Error);
      } finally {
        setIsLoading(false);
      }
    };
    void fetchData();
  }, [sport, leagueId, teamId]);

  return { players, draftOrder, currentPick, isLoading, error };
};

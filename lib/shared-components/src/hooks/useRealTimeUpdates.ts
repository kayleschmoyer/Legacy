import { useEffect, useState } from 'react';

interface Update {
  type: string;
  data: Record<string, unknown>;
}

export const useRealTimeUpdates = (leagueId: string) => {
  const [updates, setUpdates] = useState<Update[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3000/draft/${leagueId}`);
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data as string) as Update;
      setUpdates(prev => [...prev, update]);
    };
    return () => ws.close();
  }, [leagueId]);

  return { updates };
};

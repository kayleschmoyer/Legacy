import { useEffect, useState } from 'react';

import { LOGGER } from '@legacy-sports/logging';

interface Player {
  id: string;
  name: string;
  position: string;
}

interface Suggestion {
  id: string;
  name: string;
  reason: string;
}

export const useAISuggestions = (players: Player[], sport: string) => {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    const fetchSuggestions = async () => {
      try {
        const response = await fetch('/api/ai/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players, sport }),
        });
        const data = (await response.json()) as { suggestions: Suggestion[] };
        setSuggestions(data.suggestions);
      } catch (error) {
        LOGGER.error('Failed to fetch AI suggestions:', String(error));
      }
    };
    if (players.length > 0) {
      void fetchSuggestions();
    }
  }, [players, sport]);

  return { suggestions };
};

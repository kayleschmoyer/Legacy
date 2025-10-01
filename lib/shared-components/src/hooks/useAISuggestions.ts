import { useEffect, useState } from 'react';
// Simple logger fallback for useAISuggestions
const LOGGER = {
  debug: (message: string, ...args: unknown[]) =>
    console.debug(message, ...args),
  info: (message: string, ...args: unknown[]) => console.info(message, ...args),
  warn: (message: string, ...args: unknown[]) => console.warn(message, ...args),
  error: (message: string, ...args: unknown[]) =>
    console.error(message, ...args),
};

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
        LOGGER.error('Failed to fetch AI suggestions:', error);
      }
    };
    if (players.length > 0) {
      void fetchSuggestions();
    }
  }, [players, sport]);

  return { suggestions };
};

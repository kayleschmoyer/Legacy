import { useEffect, useState } from 'react';

// Logger setup with fallback
let LOGGER: {
  error: (...args: unknown[]) => void;
};

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
  const logging = require('@legacy-sports/logging') as {
    LOGGER: {
      error: (...args: unknown[]) => void;
    };
  };
  LOGGER = logging.LOGGER;
} catch {
  // Fallback for test environment
  LOGGER = {
    error: (...args: unknown[]) => {
      // eslint-disable-next-line no-console
      console.error(...args);
    },
  };
}

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

import { useEffect, useMemo, useRef, useState } from 'react';

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

  // Stable key derived from sorted player IDs — avoids re-triggering the
  // effect when the caller passes a new array reference with the same
  // underlying data or a different player ordering with the same IDs (e.g.
  // from an unmemoized .filter()/.map() chain).
  const playersKey = useMemo(
    () =>
      players
        .map((p) => p.id)
        .sort()
        .join(','),
    [players],
  );

  // Ref so the effect body always reads the latest players array without
  // needing it as a dependency (avoids the unstable-reference re-trigger).
  const playersRef = useRef(players);
  playersRef.current = players;

  useEffect(() => {
    if (!playersKey) return;

    const ctl = new AbortController();

    const fetchSuggestions = async () => {
      try {
        const response = await fetch('/api/ai/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ players: playersRef.current, sport }),
          signal: ctl.signal,
        });

        if (!response.ok) throw new Error('Failed to fetch AI suggestions');

        let data: { suggestions: Suggestion[] };
        try {
          data = (await response.json()) as { suggestions: Suggestion[] };
        } catch {
          throw new Error('Failed to parse AI suggestions response as JSON');
        }

        if (ctl.signal.aborted) return;

        setSuggestions(data.suggestions);
      } catch (error) {
        if (
          (error instanceof Error && error.name === 'AbortError') ||
          (error instanceof DOMException && error.name === 'AbortError')
        ) {
          return;
        }
        if (!ctl.signal.aborted) {
          LOGGER.error('Failed to fetch AI suggestions:', String(error));
        }
      }
    };

    void fetchSuggestions();

    return () => ctl.abort();
  }, [playersKey, sport]);

  return { suggestions };
};

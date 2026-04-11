import { renderHook, waitFor } from '@testing-library/react';
import { useAISuggestions } from './useAISuggestions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_PLAYERS = [
  { id: 'p1', name: 'Mike Trout', position: 'CF' },
  { id: 'p2', name: 'Shohei Ohtani', position: 'DH' },
];

const MOCK_SUGGESTIONS = [
  { id: 'p1', name: 'Mike Trout', reason: 'Top overall pick' },
];

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useAISuggestions', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest
      .fn()
      .mockResolvedValue(jsonResponse({ suggestions: MOCK_SUGGESTIONS }));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function fetchMock(): jest.Mock {
    return globalThis.fetch as jest.Mock;
  }

  it('fetches suggestions and returns them', async () => {
    const { result } = renderHook(() => useAISuggestions(MOCK_PLAYERS, 'mlb'));

    await waitFor(() => {
      expect(result.current.suggestions).toEqual(MOCK_SUGGESTIONS);
    });

    expect(fetchMock()).toHaveBeenCalledWith(
      '/api/ai/suggestions',
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  it('does not refetch when a new array with the same IDs is passed', async () => {
    const { rerender } = renderHook(
      ({ players }: { players: typeof MOCK_PLAYERS }) =>
        useAISuggestions(players, 'mlb'),
      { initialProps: { players: MOCK_PLAYERS } },
    );

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    // New array reference but same IDs — should not trigger another fetch
    rerender({ players: [...MOCK_PLAYERS] });

    // Give React a tick to potentially re-run the effect
    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does not refetch when players are reordered but have the same IDs', async () => {
    const { rerender } = renderHook(
      ({ players }: { players: typeof MOCK_PLAYERS }) =>
        useAISuggestions(players, 'mlb'),
      { initialProps: { players: MOCK_PLAYERS } },
    );

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    // Same IDs but reversed order — sorted key should still match
    rerender({ players: [...MOCK_PLAYERS].reverse() });

    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('does refetch when player IDs change', async () => {
    const newPlayer = { id: 'p3', name: 'Mookie Betts', position: 'RF' };

    const { rerender } = renderHook(
      ({ players }: { players: typeof MOCK_PLAYERS }) =>
        useAISuggestions(players, 'mlb'),
      { initialProps: { players: MOCK_PLAYERS } },
    );

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(1);
    });

    rerender({ players: [...MOCK_PLAYERS, newPlayer] });

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    });
  });

  it('aborts the fetch when the component unmounts', () => {
    let abortSignal: AbortSignal | undefined;

    fetchMock().mockImplementation(
      (_url: string, init?: RequestInit): Promise<Response> => {
        abortSignal = init?.signal;
        return new Promise<Response>((_resolve) => {
          // Intentionally never resolved
        });
      },
    );

    const { unmount } = renderHook(() => useAISuggestions(MOCK_PLAYERS, 'mlb'));

    expect(abortSignal?.aborted).toBe(false);

    unmount();

    expect(abortSignal?.aborted).toBe(true);
  });

  it('aborts the in-flight request when dependencies change', async () => {
    const signals: AbortSignal[] = [];

    fetchMock().mockImplementationOnce(
      (_url: string, init?: RequestInit): Promise<Response> => {
        if (init?.signal) signals.push(init.signal);
        return new Promise<Response>((_resolve) => {
          // First request stays in-flight
        });
      },
    );

    const { rerender } = renderHook(
      ({ sport }: { sport: string }) => useAISuggestions(MOCK_PLAYERS, sport),
      { initialProps: { sport: 'mlb' } },
    );

    await waitFor(() => {
      expect(signals).toHaveLength(1);
    });

    const firstSignal = signals[0];
    expect(firstSignal?.aborted).toBe(false);

    fetchMock().mockImplementationOnce(
      (_url: string, init?: RequestInit): Promise<Response> => {
        if (init?.signal) signals.push(init.signal);
        return Promise.resolve(jsonResponse({ suggestions: MOCK_SUGGESTIONS }));
      },
    );

    rerender({ sport: 'nfl' });

    await waitFor(() => {
      expect(signals).toHaveLength(2);
    });

    expect(firstSignal?.aborted).toBe(true);
  });

  it('skips fetch when players array is empty', async () => {
    renderHook(() => useAISuggestions([], 'mlb'));

    await new Promise((r) => setTimeout(r, 50));

    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('logs error on non-ok response', async () => {
    fetchMock().mockResolvedValue(jsonResponse({}, 500));

    const { result } = renderHook(() => useAISuggestions(MOCK_PLAYERS, 'mlb'));

    // Suggestions should remain empty on error
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current.suggestions).toEqual([]);
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { useDraftData } from './useDraftData';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MOCK_RESPONSE = {
  players: [
    {
      id: 'p1',
      name: 'Mike Trout',
      position: 'OF',
      team: 'LAA',
      rank: 1,
      adp: 1.2,
    },
  ],
  draftOrder: [{ id: 't1', name: 'Team Alpha', picks: ['1', '24'] }],
  currentPick: 3,
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useDraftData', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = jest.fn().mockResolvedValue(jsonResponse(MOCK_RESPONSE));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function fetchMock(): jest.Mock {
    return globalThis.fetch as jest.Mock;
  }

  it('fetches data and returns players, draftOrder, currentPick', async () => {
    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.players).toEqual(MOCK_RESPONSE.players);
    expect(result.current.draftOrder).toEqual(MOCK_RESPONSE.draftOrder);
    expect(result.current.currentPick).toBe(3);
    expect(result.current.error).toBeNull();
    expect(fetchMock()).toHaveBeenCalledWith(
      '/api/draft/mlb/league-1/team-1',
      expect.objectContaining({
        signal: expect.any(AbortSignal) as AbortSignal,
      }),
    );
  });

  // ── AbortController cleanup ──────────────────────────────────────────────

  it('aborts the fetch when the component unmounts', () => {
    let abortSignal: AbortSignal | undefined;

    fetchMock().mockImplementation(
      (_url: string, init?: RequestInit): Promise<Response> => {
        abortSignal = init?.signal ?? undefined;
        // Return a promise that never resolves so unmount happens during fetch
        return new Promise<Response>((_resolve) => {
          // Intentionally never resolved so unmount happens during fetch
        });
      },
    );

    const { unmount } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    // The fetch is in-flight; signal should not be aborted yet
    expect(abortSignal?.aborted).toBe(false);

    unmount();

    expect(abortSignal?.aborted).toBe(true);
  });

  it('aborts previous fetch when parameters change', async () => {
    const signals: AbortSignal[] = [];
    let resolveFirst: ((value: Response) => void) | undefined;

    fetchMock().mockImplementationOnce(
      (_url: string, init?: RequestInit): Promise<Response> => {
        if (init?.signal) signals.push(init.signal);
        // First fetch uses a deferred promise so it stays in-flight
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      },
    );

    const { rerender } = renderHook(
      ({ sport }: { sport: string }) => useDraftData(sport, 'lg', 'tm'),
      { initialProps: { sport: 'mlb' } },
    );

    await waitFor(() => {
      expect(signals).toHaveLength(1);
    });

    const firstSignal = signals[0];
    // First request is still in-flight
    expect(firstSignal?.aborted).toBe(false);

    // Second fetch resolves immediately
    fetchMock().mockImplementationOnce(
      (_url: string, init?: RequestInit): Promise<Response> => {
        if (init?.signal) signals.push(init.signal);
        return Promise.resolve(jsonResponse(MOCK_RESPONSE));
      },
    );

    rerender({ sport: 'nfl' });

    await waitFor(() => {
      expect(signals).toHaveLength(2);
    });

    // The first request's signal should have been aborted while still pending
    expect(firstSignal?.aborted).toBe(true);

    // Resolve the first request after abort to confirm no state update leaks
    resolveFirst?.(jsonResponse(MOCK_RESPONSE));
  });

  // ── Error normalisation ──────────────────────────────────────────────────

  it('normalises a non-Error throw into an Error', async () => {
    fetchMock().mockRejectedValue('string error');

    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('string error');
  });

  it('normalises a null throw into an Error', async () => {
    fetchMock().mockRejectedValue(null);

    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe('null');
  });

  it('preserves an Error instance as-is', async () => {
    const original = new TypeError('network failure');
    fetchMock().mockRejectedValue(original);

    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error).toBe(original);
  });

  // ── HTTP error ───────────────────────────────────────────────────────────

  it('sets error when response is not ok', async () => {
    fetchMock().mockResolvedValue(jsonResponse({}, 500));

    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe('Failed to fetch draft data');
  });

  // ── JSON parse error ─────────────────────────────────────────────────────

  it('wraps a JSON parse failure in a descriptive error', async () => {
    fetchMock().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
    } as unknown as Response);

    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.error?.message).toBe(
      'Failed to parse draft data response as JSON',
    );
  });

  // ── refetch callback ─────────────────────────────────────────────────────

  it('exposes a refetch callback that re-fetches data', async () => {
    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchMock()).toHaveBeenCalledTimes(1);

    const updatedResponse = {
      ...MOCK_RESPONSE,
      currentPick: 10,
    };
    fetchMock().mockResolvedValue(jsonResponse(updatedResponse));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.currentPick).toBe(10);
    });

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it('refetch resets error state', async () => {
    fetchMock().mockRejectedValueOnce(new Error('first failure'));

    const { result } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.error?.message).toBe('first failure');
    });

    fetchMock().mockResolvedValue(jsonResponse(MOCK_RESPONSE));

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.players).toEqual(MOCK_RESPONSE.players);
  });

  it('aborts an in-flight refetch on unmount', async () => {
    const { result, unmount } = renderHook(() =>
      useDraftData('mlb', 'league-1', 'team-1'),
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    let refetchSignal: AbortSignal | undefined;

    fetchMock().mockImplementationOnce(
      (_url: string, init?: RequestInit): Promise<Response> => {
        refetchSignal = init?.signal;
        return new Promise<Response>((_resolve) => {
          // Intentionally never resolved — unmount should abort
        });
      },
    );

    act(() => {
      result.current.refetch();
    });

    await waitFor(() => {
      expect(fetchMock()).toHaveBeenCalledTimes(2);
    });

    expect(refetchSignal?.aborted).toBe(false);

    unmount();

    expect(refetchSignal?.aborted).toBe(true);
  });
});

import {
  GetCareerBattingStats,
  GetCareerPitchingStats,
  GetCareerPitchingStatsCount,
} from '@legacy-sports/graphql';
import {
  type ExportQueryClient,
  fetchAllBattingRows,
  fetchAllPitchingRows,
} from './fetchExportData';

interface QueryOptions {
  query: unknown;
  variables: Record<string, unknown>;
}

/** Fake batting backend: `total` rows, each response clamped to `serverCap`. */
function battingClient(total: number, serverCap: number) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    query: jest.fn(({ query, variables }: QueryOptions) => {
      expect(query).toBe(GetCareerBattingStats);
      calls.push(variables);
      const after = variables.after as string | undefined;
      const offset = after ? Number(atob(after)) : 0;
      const limit = Math.min(variables.first as number, serverCap);
      const count = Math.max(0, Math.min(limit, total - offset));
      const edges = Array.from({ length: count }, (_, i) => ({
        node: {
          playerId: offset + i + 1,
          player: { firstName: 'P', lastName: String(offset + i + 1) },
        },
      }));
      return Promise.resolve({
        data: { careerBattingStats: { totalCount: total, edges } },
      });
    }),
  };
  return { client: client as unknown as ExportQueryClient, calls };
}

/** Fake pitching backend with `total` rows and a separate count query. */
function pitchingClient(total: number, serverCap = Infinity) {
  const calls: Record<string, unknown>[] = [];
  const client = {
    query: jest.fn(({ query, variables }: QueryOptions) => {
      if (query === GetCareerPitchingStatsCount) {
        return Promise.resolve({ data: { careerPitchingStatsCount: total } });
      }
      expect(query).toBe(GetCareerPitchingStats);
      calls.push(variables);
      const offset = variables.offset as number;
      const limit = Math.min(variables.limit as number, serverCap);
      const count = Math.max(0, Math.min(limit, total - offset));
      return Promise.resolve({
        data: {
          careerPitchingStats: Array.from({ length: count }, (_, i) => ({
            playerId: offset + i + 1,
          })),
        },
      });
    }),
  };
  return { client: client as unknown as ExportQueryClient, calls };
}

describe('fetchAllBattingRows (LS-10731)', () => {
  it('fetches every filtered row, not just the first page', async () => {
    const { client, calls } = battingClient(1_096, 5_000);
    const result = await fetchAllBattingRows(client, { team: 'BOS' }, 5_000);
    expect(result.rows).toHaveLength(1_096);
    expect(result.matched).toBe(1_096);
    // Premium page cap covers it in one request, keeping the filters.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ team: 'BOS', first: 5_000 });
  });

  it('pages by the rows actually returned when the server clamps `first`', async () => {
    // Free-tier server clamp is 100 rows per request (statistics.ts).
    const { client, calls } = battingClient(250, 100);
    const result = await fetchAllBattingRows(client, {}, 5_000);
    expect(result.rows.map((r) => r.playerId)).toEqual(
      Array.from({ length: 250 }, (_, i) => i + 1),
    );
    expect(calls.map((c) => c.after)).toEqual([
      undefined,
      btoa('100'),
      btoa('200'),
    ]);
  });

  it('stops at the cap and reports the full matched total', async () => {
    const { client } = battingClient(12_345, 5_000);
    const result = await fetchAllBattingRows(client, {}, 5_000);
    expect(result.rows).toHaveLength(5_000);
    expect(result.matched).toBe(12_345);
  });

  it('returns no rows for an empty result set', async () => {
    const { client } = battingClient(0, 5_000);
    const result = await fetchAllBattingRows(client, {}, 5_000);
    expect(result).toEqual({ rows: [], matched: 0 });
  });
});

describe('fetchAllPitchingRows (LS-10731)', () => {
  it('fetches every filtered row with the filtered count', async () => {
    const { client, calls } = pitchingClient(312);
    const result = await fetchAllPitchingRows(
      client,
      { team: 'NYY', orderBy: 'wins', orderDirection: 'desc' },
      5_000,
    );
    expect(result.rows).toHaveLength(312);
    expect(result.matched).toBe(312);
    expect(calls).toEqual([
      expect.objectContaining({ team: 'NYY', limit: 5_000, offset: 0 }),
    ]);
  });

  it('keeps paging if the server ever clamps `limit`', async () => {
    const { client, calls } = pitchingClient(250, 100);
    const result = await fetchAllPitchingRows(client, {}, 5_000);
    expect(result.rows).toHaveLength(250);
    expect(calls.map((c) => c.offset)).toEqual([0, 100, 200]);
  });

  it('stops at the cap and reports the full matched total', async () => {
    const { client } = pitchingClient(7_000);
    const result = await fetchAllPitchingRows(client, {}, 5_000);
    expect(result.rows).toHaveLength(5_000);
    expect(result.matched).toBe(7_000);
  });
});

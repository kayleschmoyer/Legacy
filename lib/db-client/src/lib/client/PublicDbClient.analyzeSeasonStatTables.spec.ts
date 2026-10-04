import type { SQL } from 'drizzle-orm';
import { PgDialect } from 'drizzle-orm/pg-core';
import { analyzeSeasonStatTables, type PublicDb } from './PublicDbClient';

describe('analyzeSeasonStatTables (LS-10554)', () => {
  it('runs a single ANALYZE over all three season stat tables', async () => {
    const execute = jest
      .fn<Promise<unknown>, [SQL]>()
      .mockResolvedValue(undefined);
    const db = { execute } as unknown as PublicDb;

    await analyzeSeasonStatTables(db);

    expect(execute).toHaveBeenCalledTimes(1);
    const [query] = execute.mock.calls[0];
    expect(new PgDialect().sqlToQuery(query).sql).toBe(
      'ANALYZE public.season_batting, public.season_fielding, public.season_pitching',
    );
  });

  it('propagates execute failures to the caller', async () => {
    const execute = jest
      .fn<Promise<unknown>, [SQL]>()
      .mockRejectedValue(new Error('boom'));
    const db = { execute } as unknown as PublicDb;

    await expect(analyzeSeasonStatTables(db)).rejects.toThrow('boom');
  });
});

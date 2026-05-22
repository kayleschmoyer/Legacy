import { PgDialect } from 'drizzle-orm/pg-core';

import { inArrayAny } from './inArrayAny';
import * as PublicSchema from '../../drizzle/public/schema';

const dialect = new PgDialect();

describe('inArrayAny', () => {
  it('emits a single-parameter `= ANY($1::integer[])` predicate', () => {
    const ids = [1, 2, 3, 4, 5];
    const predicate = inArrayAny(PublicSchema.players.id, ids);
    const { sql, params } = dialect.sqlToQuery(predicate);

    expect(sql).toBe('"players"."id" = ANY($1::integer[])');
    expect(params).toEqual([ids]);
  });

  it('binds the array as a single parameter regardless of size', () => {
    const ids = Array.from({ length: 5000 }, (_, i) => i + 1);
    const predicate = inArrayAny(PublicSchema.seasonFielding.playerId, ids);
    const { sql, params } = dialect.sqlToQuery(predicate);

    expect(sql).toBe('"season_fielding"."player_id" = ANY($1::integer[])');
    expect(params).toHaveLength(1);
    expect((params[0] as number[]).length).toBe(5000);
  });

  it('copies the input array so later mutations do not leak into the bound param', () => {
    const ids = [10, 20, 30];
    const predicate = inArrayAny(PublicSchema.players.id, ids);
    ids.push(40);
    const { params } = dialect.sqlToQuery(predicate);

    expect(params[0]).toEqual([10, 20, 30]);
  });
});

import { InvalidArgumentError } from 'commander';
import { SendMessageBatchCommand, SQSClient } from '@aws-sdk/client-sqs';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PublicDb } from '@legacy-sports/db-client';
import {
  buildBaseballBatchEntries,
  buildFootballBatchEntries,
  chunkIntoBatches,
  dispatchBatches,
  parseSport,
  type SqsBatchEntry,
  upsertFootballPlayer,
} from './queuePlayers';

jest.mock('@legacy-sports/logging', () => ({
  LOGGER: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('parseSport', () => {
  it('accepts the supported sports', () => {
    expect(parseSport('baseball')).toBe('baseball');
    expect(parseSport('football')).toBe('football');
  });

  it('throws InvalidArgumentError for an unknown sport', () => {
    expect(() => parseSport('hockey')).toThrow(InvalidArgumentError);
    expect(() => parseSport('hockey')).toThrow(/baseball.*football/);
  });

  it('throws for an empty value', () => {
    expect(() => parseSport('')).toThrow(InvalidArgumentError);
  });
});

describe('chunkIntoBatches', () => {
  it('splits into SQS-sized batches of 10 by default', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const batches = chunkIntoBatches(items);
    expect(batches).toHaveLength(3);
    expect(batches[0]).toHaveLength(10);
    expect(batches[1]).toHaveLength(10);
    expect(batches[2]).toHaveLength(5);
  });

  it('returns an empty array for no items', () => {
    expect(chunkIntoBatches([])).toEqual([]);
  });

  it('honours a custom batch size', () => {
    expect(chunkIntoBatches([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
  });
});

describe('buildBaseballBatchEntries', () => {
  it('constructs entries with the bref_id as the message body', () => {
    const entries = buildBaseballBatchEntries(
      ['troutmi01', 'judgeaa01'],
      0,
      123,
    );
    expect(entries).toEqual([
      {
        Id: '0-0',
        MessageBody: JSON.stringify('troutmi01'),
        MessageGroupId: 'batch-0',
        MessageDeduplicationId: 'troutmi01-123-0-0',
      },
      {
        Id: '0-1',
        MessageBody: JSON.stringify('judgeaa01'),
        MessageGroupId: 'batch-0',
        MessageDeduplicationId: 'judgeaa01-123-0-1',
      },
    ]);
  });

  it('namespaces ids and dedup ids by batch index', () => {
    const entries = buildBaseballBatchEntries(['x'], 4, 999);
    expect(entries[0].Id).toBe('4-0');
    expect(entries[0].MessageGroupId).toBe('batch-4');
    expect(entries[0].MessageDeduplicationId).toBe('x-999-4-0');
  });
});

describe('buildFootballBatchEntries', () => {
  it('constructs entries with pfrId + position payload grouped by letter', () => {
    const entries = buildFootballBatchEntries(
      [
        { pfrId: 'MahoPa00', position: 'QB' },
        { pfrId: 'McCaCh01', position: 'RB' },
      ],
      0,
      55,
    );
    expect(entries).toEqual([
      {
        Id: '0-0',
        MessageBody: JSON.stringify({ pfrId: 'MahoPa00', position: 'QB' }),
        MessageGroupId: 'letter-M',
        MessageDeduplicationId: 'MahoPa00-55-0-0',
      },
      {
        Id: '0-1',
        MessageBody: JSON.stringify({ pfrId: 'McCaCh01', position: 'RB' }),
        MessageGroupId: 'letter-M',
        MessageDeduplicationId: 'McCaCh01-55-0-1',
      },
    ]);
  });
});

describe('upsertFootballPlayer', () => {
  // Render the parameterized SQL hermetically (no DB) by capturing the SQL
  // object passed to db.execute and rendering it with the same PG dialect.
  async function renderUpsertSql(
    position: 'DL' | 'LB' | 'DB' | 'QB' | 'RB' | 'WR' | 'TE' | 'K',
  ): Promise<{ sql: string; params: unknown[] }> {
    let captured: SQL | undefined;
    const db = {
      execute: jest.fn((query: SQL) => {
        captured = query;
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as PublicDb;

    await upsertFootballPlayer(db, {
      firstName: 'Khalil',
      lastName: 'Mack',
      pfrId: 'MackKh00',
      nflTeam: 'LAC',
      position,
    });

    if (!captured) throw new Error('db.execute was not called');
    return new PgDialect().sqlToQuery(captured);
  }

  it('persists position in the INSERT column list and VALUES', async () => {
    const { sql, params } = await renderUpsertSql('LB');
    // Column list includes position…
    expect(sql).toMatch(
      /\(first_name, last_name, bref_id, pfr_id, sport, is_dst, nfl_team, position\)/,
    );
    // …and the normalized enum value is bound as a parameter.
    expect(params).toContain('LB');
  });

  it('backfills position on conflict so re-import updates existing rows', async () => {
    const { sql } = await renderUpsertSql('DB');
    expect(sql).toMatch(/ON CONFLICT \(pfr_id\) WHERE pfr_id IS NOT NULL/);
    expect(sql).toMatch(/DO UPDATE SET/);
    expect(sql).toMatch(/position = EXCLUDED\.position/);
  });
});

describe('dispatchBatches', () => {
  it('sends one SendMessageBatch command per batch with the configured queue url', async () => {
    const send = jest
      .fn<Promise<unknown>, [SendMessageBatchCommand]>()
      .mockResolvedValue({});
    const sqs = { send } as unknown as SQSClient;
    const batches: SqsBatchEntry[][] = [
      buildBaseballBatchEntries(['a', 'b'], 0, 1),
      buildBaseballBatchEntries(['c'], 1, 1),
    ];

    await dispatchBatches(sqs, 'https://sqs.example/queue.fifo', batches);

    expect(send).toHaveBeenCalledTimes(2);
    const firstCommand = send.mock.calls[0][0];
    expect(firstCommand).toBeInstanceOf(SendMessageBatchCommand);
    expect(firstCommand.input.QueueUrl).toBe('https://sqs.example/queue.fifo');
    expect(firstCommand.input.Entries).toHaveLength(2);
    const secondCommand = send.mock.calls[1][0];
    expect(secondCommand.input.Entries).toHaveLength(1);
  });

  it('does not call SQS when there are no batches', async () => {
    const send = jest
      .fn<Promise<unknown>, [SendMessageBatchCommand]>()
      .mockResolvedValue({});
    const sqs = { send } as unknown as SQSClient;
    await dispatchBatches(sqs, 'https://sqs.example/queue.fifo', []);
    expect(send).not.toHaveBeenCalled();
  });
});

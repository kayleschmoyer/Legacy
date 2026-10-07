import { DEFAULT_LIMIT, MAX_LIMIT, readMessages } from './read-messages';
import {
  _resetDiscordTokenCacheForTests,
  DISCORD_BOT_TOKEN_ENV,
  DISCORD_BUG_CHANNEL_ID_ENV,
} from '../auth';
import { DISCORD_API_BASE } from '../discord-api';

const CHANNEL_ID = '111111111111111111';

function message(id: string, content = `note ${id}`) {
  return {
    id,
    content,
    timestamp: '2026-10-06T12:00:00.000000+00:00',
    author: { id: '1', username: 'brad', global_name: 'Brad' },
  };
}

function textOf(result: { content: unknown }): string {
  return (result.content as Array<{ text: string }>)[0].text;
}

interface ReadBody {
  notice: string;
  count: number;
  oldestId: string | null;
  newestId: string | null;
  messages: Array<{
    id: string;
    timestamp: string;
    author: string;
    content: string;
  }>;
}

function bodyOf(result: { content: unknown }): ReadBody {
  return JSON.parse(textOf(result)) as ReadBody;
}

describe('readMessages', () => {
  const originalToken = process.env[DISCORD_BOT_TOKEN_ENV];
  const originalChannel = process.env[DISCORD_BUG_CHANNEL_ID_ENV];
  const originalFetch = global.fetch;

  beforeEach(() => {
    _resetDiscordTokenCacheForTests();
    process.env[DISCORD_BOT_TOKEN_ENV] = 'test-bot-token';
    process.env[DISCORD_BUG_CHANNEL_ID_ENV] = CHANNEL_ID;
  });

  afterEach(() => {
    if (originalToken === undefined) delete process.env[DISCORD_BOT_TOKEN_ENV];
    else process.env[DISCORD_BOT_TOKEN_ENV] = originalToken;
    if (originalChannel === undefined) {
      delete process.env[DISCORD_BUG_CHANNEL_ID_ENV];
    } else {
      process.env[DISCORD_BUG_CHANNEL_ID_ENV] = originalChannel;
    }
    global.fetch = originalFetch;
  });

  function mockFetch(
    impl: (url: string, init: RequestInit) => Response,
  ): jest.Mock {
    const fn = jest.fn((url: string, init: RequestInit) =>
      Promise.resolve(impl(url, init)),
    );
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });

  describe('channel lock', () => {
    it('always reads the configured channel', async () => {
      const fn = mockFetch(() => jsonResponse([message('222222222222222222')]));

      await readMessages({});

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      expect(
        calledUrl.startsWith(
          `${DISCORD_API_BASE}/channels/${CHANNEL_ID}/messages?`,
        ),
      ).toBe(true);
    });

    it('ignores a channel id smuggled in alongside the declared params', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({
        limit: 5,
        channelId: '999999999999999999',
      } as never);

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toContain(`/channels/${CHANNEL_ID}/`);
      expect(calledUrl).not.toContain('999999999999999999');
    });

    it('fails closed, without calling Discord, when no channel is configured', async () => {
      delete process.env[DISCORD_BUG_CHANNEL_ID_ENV];
      const fn = mockFetch(() => jsonResponse([]));

      const result = await readMessages({});

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/DISCORD_BUG_CHANNEL_ID/);
      expect(fn).not.toHaveBeenCalled();
    });

    it('rejects a configured channel id that is not a snowflake', async () => {
      process.env[DISCORD_BUG_CHANNEL_ID_ENV] = '../../guilds/1';
      const fn = mockFetch(() => jsonResponse([]));

      const result = await readMessages({});

      expect(result.isError).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('limit cap', () => {
    it('defaults to DEFAULT_LIMIT', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({});

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      expect(new URL(calledUrl).searchParams.get('limit')).toBe(
        String(DEFAULT_LIMIT),
      );
    });

    it('passes a limit through when it is within bounds', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({ limit: 40 });

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      expect(new URL(calledUrl).searchParams.get('limit')).toBe('40');
    });

    it('clamps an oversized limit to MAX_LIMIT (Discord caps at 100)', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({ limit: 5000 });

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      expect(MAX_LIMIT).toBe(100);
      expect(new URL(calledUrl).searchParams.get('limit')).toBe(
        String(MAX_LIMIT),
      );
    });

    it.each([0, -3, 1.5])('rejects the invalid limit %p', async (limit) => {
      const fn = mockFetch(() => jsonResponse([]));

      const result = await readMessages({ limit });

      expect(result.isError).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('pagination', () => {
    it('forwards `before` as a query parameter', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({ before: '333333333333333333' });

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      const params = new URL(calledUrl).searchParams;
      expect(params.get('before')).toBe('333333333333333333');
      expect(params.has('after')).toBe(false);
    });

    it('forwards `after` as a query parameter', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({ after: '444444444444444444' });

      const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
      const params = new URL(calledUrl).searchParams;
      expect(params.get('after')).toBe('444444444444444444');
      expect(params.has('before')).toBe(false);
    });

    it('rejects `before` and `after` together without calling Discord', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      const result = await readMessages({
        before: '333333333333333333',
        after: '444444444444444444',
      });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/either `before` or `after`/);
      expect(fn).not.toHaveBeenCalled();
    });

    it.each(['abc', '12 34', '1/../2'])(
      'rejects the non-snowflake cursor %p',
      async (cursor) => {
        const fn = mockFetch(() => jsonResponse([]));

        const result = await readMessages({ before: cursor });

        expect(result.isError).toBe(true);
        expect(fn).not.toHaveBeenCalled();
      },
    );

    it('returns oldest-first with oldestId/newestId cursors', async () => {
      // Discord returns newest-first; ids differ in length to catch string sorting.
      mockFetch(() =>
        jsonResponse([
          message('1000000000000000010'),
          message('999999999999999999'),
          message('1000000000000000005'),
        ]),
      );

      const result = await readMessages({});
      const body = bodyOf(result);

      expect(body.messages.map((m: { id: string }) => m.id)).toEqual([
        '999999999999999999',
        '1000000000000000005',
        '1000000000000000010',
      ]);
      expect(body.oldestId).toBe('999999999999999999');
      expect(body.newestId).toBe('1000000000000000010');
      expect(body.count).toBe(3);
    });

    it('returns null cursors for an empty page', async () => {
      mockFetch(() => jsonResponse([]));

      const body = bodyOf(await readMessages({}));

      expect(body.count).toBe(0);
      expect(body.oldestId).toBeNull();
      expect(body.newestId).toBeNull();
    });
  });

  describe('output shape', () => {
    it('returns only { id, timestamp, author, content } per message', async () => {
      mockFetch(() =>
        jsonResponse([
          {
            ...message('222222222222222222', 'login button is broken'),
            attachments: [{ url: 'https://cdn.example/x.png' }],
            embeds: [{ title: 'ignored' }],
            mentions: [],
          },
        ]),
      );

      const body = bodyOf(await readMessages({}));

      expect(body.messages[0]).toEqual({
        id: '222222222222222222',
        timestamp: '2026-10-06T12:00:00.000000+00:00',
        author: 'Brad',
        content: 'login button is broken',
      });
    });

    it('falls back to the username when there is no display name', async () => {
      mockFetch(() =>
        jsonResponse([
          {
            ...message('222222222222222222'),
            author: { id: '1', username: 'brad', global_name: null },
          },
        ]),
      );

      const body = bodyOf(await readMessages({}));

      expect(body.messages[0].author).toBe('brad');
    });

    it('labels the content as untrusted', async () => {
      mockFetch(() => jsonResponse([message('222222222222222222')]));

      const body = bodyOf(await readMessages({}));

      expect(body.notice).toMatch(/untrusted/i);
    });
  });

  describe('Discord request', () => {
    it('authenticates as a bot and sends a User-Agent', async () => {
      const fn = mockFetch(() => jsonResponse([]));

      await readMessages({});

      const [, init] = fn.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(init.method).toBe('GET');
      expect(headers.Authorization).toBe('Bot test-bot-token');
      expect(headers['User-Agent']).toMatch(/^DiscordBot /);
    });

    it('retries once after a short rate limit', async () => {
      let calls = 0;
      const fn = mockFetch(() => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ message: 'rate limited', retry_after: 0 }, 429)
          : jsonResponse([message('222222222222222222')]);
      });

      const result = await readMessages({});

      expect(result.isError).toBeUndefined();
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not wait out a long rate limit', async () => {
      const fn = mockFetch(() =>
        jsonResponse({ message: 'rate limited', retry_after: 600 }, 429),
      );

      const result = await readMessages({});

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/429/);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('surfaces an API error without leaking the bot token', async () => {
      mockFetch(
        () =>
          new Response(
            '{"message":"Missing Access","note":"Bot test-bot-token"}',
            {
              status: 403,
            },
          ),
      );

      const result = await readMessages({});

      expect(result.isError).toBe(true);
      expect(textOf(result)).toMatch(/403/);
      expect(textOf(result)).not.toContain('test-bot-token');
    });
  });
});

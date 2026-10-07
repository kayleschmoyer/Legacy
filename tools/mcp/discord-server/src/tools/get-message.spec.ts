import { getMessage } from './get-message';
import {
  _resetDiscordTokenCacheForTests,
  DISCORD_BOT_TOKEN_ENV,
  DISCORD_BUG_CHANNEL_ID_ENV,
} from '../auth';
import { DISCORD_API_BASE } from '../discord-api';

const CHANNEL_ID = '111111111111111111';
const MESSAGE_ID = '222222222222222222';

function textOf(result: { content: unknown }): string {
  return (result.content as Array<{ text: string }>)[0].text;
}

describe('getMessage', () => {
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

  function mockFetch(impl: () => Response): jest.Mock {
    const fn = jest.fn(() => Promise.resolve(impl()));
    global.fetch = fn;
    return fn;
  }

  it('fetches the message from the configured channel', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            id: MESSAGE_ID,
            content: 'checkout crashes on Android',
            timestamp: '2026-10-06T12:00:00.000000+00:00',
            author: { id: '1', username: 'brad', global_name: 'Brad' },
          }),
          { status: 200 },
        ),
    );

    const result = await getMessage({ id: MESSAGE_ID });

    expect(result.isError).toBeUndefined();
    const [calledUrl] = fn.mock.calls[0] as unknown as [string];
    expect(calledUrl).toBe(
      `${DISCORD_API_BASE}/channels/${CHANNEL_ID}/messages/${MESSAGE_ID}`,
    );
    const body = JSON.parse(textOf(result)) as {
      notice: string;
      message: Record<string, string>;
    };
    expect(body.message).toEqual({
      id: MESSAGE_ID,
      timestamp: '2026-10-06T12:00:00.000000+00:00',
      author: 'Brad',
      content: 'checkout crashes on Android',
    });
    expect(body.notice).toMatch(/untrusted/i);
  });

  it.each(['abc', '123/../456', '', '12'])(
    'rejects the non-snowflake id %p without calling Discord',
    async (id) => {
      const fn = mockFetch(() => new Response('{}', { status: 200 }));

      const result = await getMessage({ id });

      expect(result.isError).toBe(true);
      expect(fn).not.toHaveBeenCalled();
    },
  );

  it('fails closed, without calling Discord, when no channel is configured', async () => {
    delete process.env[DISCORD_BUG_CHANNEL_ID_ENV];
    const fn = mockFetch(() => new Response('{}', { status: 200 }));

    const result = await getMessage({ id: MESSAGE_ID });

    expect(result.isError).toBe(true);
    expect(fn).not.toHaveBeenCalled();
  });

  it('reports a message that is not in the configured channel', async () => {
    mockFetch(
      () =>
        new Response('{"message":"Unknown Message","code":10008}', {
          status: 404,
        }),
    );

    const result = await getMessage({ id: MESSAGE_ID });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toMatch(/404/);
  });
});

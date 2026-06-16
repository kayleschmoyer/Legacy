import { ROLLBAR_READ_TOKEN_ENV } from './auth';
import { ROLLBAR_API_BASE, rollbarGet } from './rollbar-api';

describe('rollbarGet', () => {
  const originalToken = process.env[ROLLBAR_READ_TOKEN_ENV];
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env[ROLLBAR_READ_TOKEN_ENV] = 'read-token';
  });

  afterEach(() => {
    if (originalToken === undefined) {
      delete process.env[ROLLBAR_READ_TOKEN_ENV];
    } else {
      process.env[ROLLBAR_READ_TOKEN_ENV] = originalToken;
    }
    global.fetch = originalFetch;
  });

  function mockFetch(
    impl: (url: string, init: RequestInit) => Response,
  ): jest.Mock {
    const fn = jest.fn(async (url: string, init: RequestInit) =>
      impl(url, init),
    );
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('unwraps the result from a successful envelope', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ err: 0, result: { items: [1, 2] } }), {
          status: 200,
        }),
    );
    const result = await rollbarGet<{ items: number[] }>({ path: '/items' });
    expect(result).toEqual({ items: [1, 2] });
  });

  it('sends the read token in the X-Rollbar-Access-Token header', async () => {
    const fn = mockFetch(
      () =>
        new Response(JSON.stringify({ err: 0, result: {} }), { status: 200 }),
    );
    await rollbarGet({ path: '/items' });
    const init = fn.mock.calls[0][1] as RequestInit;
    expect(
      (init.headers as Record<string, string>)['X-Rollbar-Access-Token'],
    ).toBe('read-token');
  });

  it('builds a query string and omits undefined/empty values', async () => {
    const fn = mockFetch(
      () =>
        new Response(JSON.stringify({ err: 0, result: {} }), { status: 200 }),
    );
    await rollbarGet({
      path: '/items',
      query: { status: 'active', level: undefined, page: 2 },
    });
    const calledUrl = fn.mock.calls[0][0] as string;
    expect(calledUrl).toBe(`${ROLLBAR_API_BASE}/items?status=active&page=2`);
  });

  it('throws with the envelope message when err is non-zero', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ err: 1, message: 'invalid token' }), {
          status: 200,
        }),
    );
    await expect(rollbarGet({ path: '/items' })).rejects.toThrow(
      /err=1.*invalid token/,
    );
  });

  it('throws and redacts token-like strings on a non-OK status', async () => {
    const leaked = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
    mockFetch(() => new Response(`unauthorized ${leaked}`, { status: 401 }));
    await expect(rollbarGet({ path: '/items' })).rejects.toThrow(/401/);
    await expect(rollbarGet({ path: '/items' })).rejects.not.toThrow(
      new RegExp(leaked),
    );
  });
});

import { setStatus } from './set-status';
import {
  _resetRollbarTokenCacheForTests,
  ROLLBAR_READ_TOKEN_ENV,
} from '../auth';
import { ROLLBAR_API_BASE } from '../rollbar-api';

describe('setStatus', () => {
  const originalToken = process.env[ROLLBAR_READ_TOKEN_ENV];
  const originalFetch = global.fetch;

  beforeEach(() => {
    _resetRollbarTokenCacheForTests();
    process.env[ROLLBAR_READ_TOKEN_ENV] = 'write-token';
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
    const fn = jest.fn((url: string, init: RequestInit) =>
      Promise.resolve(impl(url, init)),
    );
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('returns an error when neither id nor counter is provided', async () => {
    const result = await setStatus({ status: 'resolved' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Provide either `id`/,
    );
  });

  it('PATCHes /item/{id}/ with the status body and returns the updated item', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            err: 0,
            result: { id: 12345, status: 'resolved', counter: 42 },
          }),
          { status: 200 },
        ),
    );

    const result = await setStatus({ id: 12345, status: 'resolved' });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fn.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${ROLLBAR_API_BASE}/item/12345/`);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({ status: 'resolved' });
    expect(
      (init.headers as Record<string, string>)['X-Rollbar-Access-Token'],
    ).toBe('write-token');
    expect((result.content[0] as { text: string }).text).toContain(
      '"status":"resolved"',
    );
  });

  it('resolves counter to id via /item_by_counter and then PATCHes by id', async () => {
    const fn = mockFetch((url) => {
      if (url.includes('/item_by_counter/42')) {
        return new Response(
          JSON.stringify({ err: 0, result: { id: 999, counter: 42 } }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ err: 0, result: { id: 999, status: 'muted' } }),
        { status: 200 },
      );
    });

    const result = await setStatus({ counter: 42, status: 'muted' });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
    const patchCall = fn.mock.calls[1] as [string, RequestInit];
    expect(patchCall[0]).toBe(`${ROLLBAR_API_BASE}/item/999/`);
    expect(patchCall[1].method).toBe('PATCH');
  });

  it('surfaces a write-scope hint on HTTP 403', async () => {
    mockFetch(
      () => new Response('{"err":403,"message":"forbidden"}', { status: 403 }),
    );

    const result = await setStatus({ id: 1, status: 'resolved' });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/lacks the "write" scope/);
    expect(text).toMatch(/HTTP 403/);
  });

  it('surfaces a write-scope hint on HTTP 401', async () => {
    mockFetch(() => new Response('unauthorized', { status: 401 }));

    const result = await setStatus({ id: 1, status: 'resolved' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /lacks the "write" scope/,
    );
  });

  it('surfaces the API error body on a non-auth failure', async () => {
    mockFetch(
      () =>
        new Response('{"err":422,"message":"invalid status"}', { status: 422 }),
    );

    const result = await setStatus({ id: 7, status: 'resolved' });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /422.*invalid status/,
    );
  });
});

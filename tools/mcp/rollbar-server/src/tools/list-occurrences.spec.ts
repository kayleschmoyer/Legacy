import { listOccurrences } from './list-occurrences';
import {
  _resetRollbarTokenCacheForTests,
  ROLLBAR_READ_TOKEN_ENV,
} from '../auth';
import { ROLLBAR_API_BASE } from '../rollbar-api';

describe('listOccurrences', () => {
  const originalToken = process.env[ROLLBAR_READ_TOKEN_ENV];
  const originalFetch = global.fetch;

  beforeEach(() => {
    _resetRollbarTokenCacheForTests();
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
    const fn = jest.fn((url: string, init: RequestInit) =>
      Promise.resolve(impl(url, init)),
    );
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  it('returns an error when neither itemId nor counter is provided', async () => {
    const result = await listOccurrences({});
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Provide either `itemId`/,
    );
  });

  it('fetches /item/{itemId}/instances when itemId is provided', async () => {
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({
            err: 0,
            result: {
              instances: [
                { id: 1, timestamp: 1700000000, version: 1, data: {} },
              ],
            },
          }),
          { status: 200 },
        ),
    );

    const result = await listOccurrences({ itemId: 12345 });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    const [calledUrl] = fn.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${ROLLBAR_API_BASE}/item/12345/instances`);
  });

  it('resolves counter to itemId via /item_by_counter and then lists instances', async () => {
    const fn = mockFetch((url) => {
      if (url.includes('/item_by_counter/218')) {
        return new Response(
          JSON.stringify({ err: 0, result: { id: 1795524667, counter: 218 } }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          err: 0,
          result: {
            instances: [{ id: 9, timestamp: 1700000000, version: 3, data: {} }],
          },
        }),
        { status: 200 },
      );
    });

    const result = await listOccurrences({ counter: 218 });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(2);
    const [firstUrl] = fn.mock.calls[0] as [string, RequestInit];
    const [secondUrl] = fn.mock.calls[1] as [string, RequestInit];
    expect(firstUrl).toBe(`${ROLLBAR_API_BASE}/item_by_counter/218`);
    expect(secondUrl).toBe(`${ROLLBAR_API_BASE}/item/1795524667/instances`);
  });

  it('surfaces the API error with a counter label when resolution or listing fails', async () => {
    mockFetch(
      () => new Response('{"err":404,"message":"not found"}', { status: 404 }),
    );

    const result = await listOccurrences({ counter: 999 });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Failed to list occurrences for counter 999/,
    );
  });
});

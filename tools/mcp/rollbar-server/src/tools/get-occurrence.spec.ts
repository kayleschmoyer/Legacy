import { getOccurrence } from './get-occurrence';
import {
  _resetRollbarTokenCacheForTests,
  ROLLBAR_READ_TOKEN_ENV,
} from '../auth';
import { ROLLBAR_API_BASE } from '../rollbar-api';

describe('getOccurrence', () => {
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
  ): jest.Mock<Promise<Response>, [string, RequestInit]> {
    const fn = jest.fn((url: string, init: RequestInit) =>
      Promise.resolve(impl(url, init)),
    );
    global.fetch = fn as unknown as typeof fetch;
    return fn;
  }

  interface ParsedOccurrence {
    id?: number;
    data: {
      body: {
        trace_chain?: { exception: { message: string } }[];
        message?: { body: string };
        custom?: Record<string, unknown>;
      };
    };
  }

  it('returns an error when neither itemId nor occurrenceId is provided', async () => {
    const result = await getOccurrence({});
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Provide either/,
    );
  });

  it('fetches /instance/{id} and unwraps the instance returned directly as `result`', async () => {
    // Real API shape: `/instance/{id}` returns the instance object directly as
    // the envelope `result` (same convention as `/item/{id}`). Reading
    // `result.instance` here yielded undefined -> JSON.stringify(undefined) ->
    // a non-string `text` -> Zod invalid_union failure (LS-8346).
    const fullOccurrence = {
      id: 999,
      timestamp: 1700000000,
      data: {
        body: {
          trace_chain: [
            { exception: { class: 'Error', message: 'something went wrong' } },
          ],
          custom: { userId: 42 },
        },
      },
    };
    const fn = mockFetch(
      () =>
        new Response(JSON.stringify({ err: 0, result: fullOccurrence }), {
          status: 200,
        }),
    );

    const result = await getOccurrence({ occurrenceId: 999 });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    const [calledUrl] = fn.mock.calls[0];
    expect(calledUrl).toBe(`${ROLLBAR_API_BASE}/instance/999`);

    const text = (result.content[0] as { text: string }).text;
    // Regression guard: `text` must always be a plain string so it satisfies
    // the MCP text-content schema.
    expect(typeof text).toBe('string');
    const parsed = JSON.parse(text) as ParsedOccurrence;
    expect(parsed.data.body.trace_chain?.[0].exception.message).toBe(
      'something went wrong',
    );
    expect(parsed.data.body.custom?.userId).toBe(42);
  });

  it('also unwraps the instance when nested under `result.instance`', async () => {
    const fullOccurrence = {
      id: 1001,
      timestamp: 1700000002,
      data: { body: { message: { body: 'nested shape' } } },
    };
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ err: 0, result: { instance: fullOccurrence } }),
          { status: 200 },
        ),
    );

    const result = await getOccurrence({ occurrenceId: 1001 });

    expect(result.isError).toBeUndefined();
    const text = (result.content[0] as { text: string }).text;
    expect(typeof text).toBe('string');
    const parsed = JSON.parse(text) as ParsedOccurrence;
    expect(parsed.id).toBe(1001);
    expect(parsed.data.body.message?.body).toBe('nested shape');
  });

  it('returns a string error result when the instance payload is missing', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ err: 0, result: null }), { status: 200 }),
    );

    const result = await getOccurrence({ occurrenceId: 555 });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(typeof text).toBe('string');
    expect(text).toMatch(/no usable payload for occurrence 555/);
  });

  it('fetches /item/{itemId}/instances?per_page=1 when only itemId is provided', async () => {
    const fullOccurrence = {
      id: 777,
      timestamp: 1700000001,
      data: {
        body: {
          message: { body: 'full log line here' },
          custom: { requestId: 'abc123' },
        },
      },
    };
    const fn = mockFetch(
      () =>
        new Response(
          JSON.stringify({ err: 0, result: { instances: [fullOccurrence] } }),
          { status: 200 },
        ),
    );

    const result = await getOccurrence({ itemId: 12345 });

    expect(result.isError).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    const [calledUrl] = fn.mock.calls[0];
    expect(calledUrl).toContain(`${ROLLBAR_API_BASE}/item/12345/instances`);
    expect(calledUrl).toContain('per_page=1');

    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text) as ParsedOccurrence;
    expect(parsed.data.body.message?.body).toBe('full log line here');
    expect(parsed.data.body.custom?.requestId).toBe('abc123');
  });

  it('returns a not-found message when item has no occurrences', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ err: 0, result: { instances: [] } }), {
          status: 200,
        }),
    );

    const result = await getOccurrence({ itemId: 99999 });

    expect(result.isError).toBeUndefined();
    expect((result.content[0] as { text: string }).text).toMatch(
      /No occurrences found for item 99999/,
    );
  });

  it('returns an error result on API failure', async () => {
    mockFetch(() => new Response('Internal Server Error', { status: 500 }));

    const result = await getOccurrence({ occurrenceId: 123 });

    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toMatch(
      /Failed to fetch occurrence 123/,
    );
  });

  it('appends the LS-9808 known-limitation hint when occurrenceId lookup 400s with "instance not found"', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ err: 1, message: 'instance not found' }),
          {
            status: 400,
          },
        ),
    );

    const result = await getOccurrence({ occurrenceId: 1788139335 });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).toMatch(/Failed to fetch occurrence 1788139335/);
    expect(text).toMatch(/known Rollbar API limitation \(LS-9808\)/);
    expect(text).toMatch(/most recent occurrence/);
  });

  it('does not append the LS-9808 hint for an itemId lookup failure', async () => {
    mockFetch(
      () =>
        new Response(
          JSON.stringify({ err: 1, message: 'instance not found' }),
          {
            status: 400,
          },
        ),
    );

    const result = await getOccurrence({ itemId: 42 });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toMatch(/LS-9808/);
  });

  it('does not append the LS-9808 hint for an unrelated occurrenceId failure', async () => {
    mockFetch(() => new Response('Internal Server Error', { status: 500 }));

    const result = await getOccurrence({ occurrenceId: 123 });

    expect(result.isError).toBe(true);
    const text = (result.content[0] as { text: string }).text;
    expect(text).not.toMatch(/LS-9808/);
  });
});
